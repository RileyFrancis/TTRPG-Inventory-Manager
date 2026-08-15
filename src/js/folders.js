// =============================================================================
// FOLDERS — User-made grouping of the Browse item list
// =============================================================================
'use strict';

// =============================================================================
// FOLDERS
// =============================================================================
// Folders organise the item *catalogue*, not the character, so like the theme
// preference they live in their own localStorage key rather than in the
// dnd_inventory_v1 save file: a GM flipping between players' sheets keeps their
// own folders, and nothing folder-related is ever synced to the party.
//
// A folder never owns its items. `folderAssign` maps templateId → folderId, so
// deleting a folder only drops assignments — the items themselves fall back to
// Unfiled, which is a virtual folder rendered last and never stored.

const FOLDERS_KEY = 'dnd_inventory_folders';
const UNFILED_ID = '__unfiled';

function loadFolders() {
  try {
    const raw = localStorage.getItem(FOLDERS_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (Array.isArray(data.folders)) {
      state.folders = data.folders
        .filter(f => f && f.id && typeof f.name === 'string')
        .map(f => ({ id: String(f.id), name: f.name }));
    }
    if (data.assign)    state.folderAssign    = { ...data.assign };
    if (data.collapsed) state.folderCollapsed = { ...data.collapsed };
  } catch (e) {
    // Corrupt entry or storage disabled — start with no folders.
  }
}

function saveFolders() {
  try {
    localStorage.setItem(FOLDERS_KEY, JSON.stringify({
      folders:   state.folders,
      assign:    state.folderAssign,
      collapsed: state.folderCollapsed,
    }));
  } catch (e) { /* non-fatal */ }
}

// Safe to reuse a freed id: deleteFolder() purges its assignments first.
function newFolderId() {
  let n = 1;
  while (state.folders.some(f => f.id === 'folder_' + n)) n++;
  return 'folder_' + n;
}

function getFolder(id) {
  return state.folders.find(f => f.id === id) ?? null;
}

function createFolder(name) {
  const clean = (name || '').trim();
  if (!clean) return null;
  const id = newFolderId();
  state.folders.push({ id, name: clean });
  saveFolders();
  return id;
}

function renameFolder(id, name) {
  const folder = getFolder(id);
  const clean = (name || '').trim();
  if (!folder || !clean) return;
  folder.name = clean;
  saveFolders();
}

// Deleting a folder never deletes items — they fall back to Unfiled.
function deleteFolder(id) {
  const idx = state.folders.findIndex(f => f.id === id);
  if (idx === -1) return;
  state.folders.splice(idx, 1);
  Object.keys(state.folderAssign).forEach(templateId => {
    if (state.folderAssign[templateId] === id) delete state.folderAssign[templateId];
  });
  delete state.folderCollapsed[id];
  saveFolders();
}

// Unassigned — or assigned to a folder that no longer exists — reads as Unfiled.
function folderOf(templateId) {
  const id = state.folderAssign[templateId];
  return id && getFolder(id) ? id : null;
}

function setItemFolder(templateId, folderId) {
  if (folderId && getFolder(folderId)) state.folderAssign[templateId] = folderId;
  else delete state.folderAssign[templateId];
  saveFolders();
}

// Called when a template leaves the database, so its assignment doesn't linger.
function forgetItemFolder(templateId) {
  if (!(templateId in state.folderAssign)) return;
  delete state.folderAssign[templateId];
  saveFolders();
}

function isFolderCollapsed(id) {
  return !!state.folderCollapsed[id];
}

function toggleFolderCollapsed(id) {
  if (state.folderCollapsed[id]) delete state.folderCollapsed[id];
  else state.folderCollapsed[id] = true;
  saveFolders();
}

// Bucket already-filtered, already-sorted templates into display order:
// the user's folders in their own order, Unfiled last.
function groupItemsByFolder(items) {
  const buckets = new Map(state.folders.map(f => [f.id, []]));
  const unfiled = [];
  items.forEach(t => {
    const id = folderOf(t.id);
    (id ? buckets.get(id) : unfiled).push(t);
  });
  const groups = state.folders.map(f => ({ id: f.id, name: f.name, items: buckets.get(f.id) }));
  groups.push({ id: UNFILED_ID, name: 'Unfiled', items: unfiled });
  return groups;
}

// Total items in a folder, ignoring the search/filter controls — the delete
// prompt should report everything that is about to move to Unfiled.
function folderItemCount(folderId) {
  return Object.values(state.db).filter(t => folderOf(t.id) === folderId).length;
}

function populateFolderSelect(sel, currentId) {
  sel.innerHTML = '';
  const unfiled = document.createElement('option');
  unfiled.value = '';
  unfiled.textContent = 'Unfiled';
  sel.appendChild(unfiled);
  state.folders.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f.id;
    opt.textContent = f.name;
    sel.appendChild(opt);
  });
  sel.value = currentId ?? '';
}

// =============================================================================
// FOLDER NAME MODAL — shared by create and rename
// =============================================================================
let folderModalCallback = null;

function openFolderNameModal({ title, value, confirmLabel }, callback) {
  folderModalCallback = callback;
  document.getElementById('folder-modal-title').textContent = title;
  document.getElementById('folder-confirm-btn').textContent = confirmLabel;
  const input = document.getElementById('folder-name-input');
  input.value = value ?? '';
  showModal('folder-modal');
  input.focus();
  input.select();
}

function confirmFolderName() {
  const name = document.getElementById('folder-name-input').value.trim();
  if (!name) { alert('Folder name is required.'); return; }
  hideModal('folder-modal');
  const callback = folderModalCallback;
  folderModalCallback = null;
  if (callback) callback(name);
}

document.getElementById('folder-confirm-btn').addEventListener('click', confirmFolderName);
document.getElementById('folder-name-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); confirmFolderName(); }
});

document.getElementById('new-folder-btn').addEventListener('click', () => {
  openFolderNameModal({ title: 'New Folder', value: '', confirmLabel: 'Create' }, name => {
    createFolder(name);
    renderItemList();
  });
});

// =============================================================================
// FOLDER PICKER MODAL — reclassify one item
// =============================================================================
function openMoveToFolderModal(templateId) {
  const t = state.db[templateId];
  if (!t) return;

  document.getElementById('folder-picker-desc').textContent = `Move “${t.name}” to:`;
  const list = document.getElementById('folder-picker-list');
  list.innerHTML = '';
  const current = folderOf(templateId);

  const addChoice = (label, active, onPick) => {
    const btn = document.createElement('button');
    btn.className = 'btn-sm folder-pick-btn' + (active ? ' active' : '');
    btn.textContent = label;
    btn.addEventListener('click', () => { hideModal('folder-picker-modal'); onPick(); });
    list.appendChild(btn);
  };

  state.folders.forEach(f => addChoice(f.name, current === f.id, () => {
    setItemFolder(templateId, f.id);
    renderItemList();
  }));
  addChoice('Unfiled', current === null, () => {
    setItemFolder(templateId, null);
    renderItemList();
  });
  addChoice('+ New Folder…', false, () => {
    openFolderNameModal({ title: 'New Folder', value: '', confirmLabel: 'Create' }, name => {
      setItemFolder(templateId, createFolder(name));
      renderItemList();
    });
  });
  list.lastChild.classList.add('new');

  showModal('folder-picker-modal');
}
