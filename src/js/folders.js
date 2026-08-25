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
// their default folder, or to Unfiled, which is a virtual folder rendered last
// and never stored.
//
// An item with no entry in `folderAssign` is not loose: it files itself into the
// default folder its type matches (see DEFAULT_FOLDERS), so every item lands
// somewhere out of the box. `folderAssign` therefore only ever holds *overrides*
// — including the UNFILED_ID sentinel, which is how "leave this one out of every
// folder" is told apart from "not filed yet".

const FOLDERS_KEY = 'dnd_inventory_folders';
const UNFILED_ID = '__unfiled';

// The folders every browser starts with, and the rule that files an item into
// each. Ordered: the first match wins, and the last one matches everything, so
// `defaultFolderIdFor` always has an answer. They are ordinary folders once
// created — rename or delete them freely; they are not re-created.
const DEFAULT_FOLDERS = [
  { id: 'folder_weapons', name: 'Weapons',  match: t => hasTagWord(t, 'weapon') },
  { id: 'folder_armor',   name: 'Armor',    match: t => hasTagWord(t, 'armor') || hasTagWord(t, 'shield') },
  { id: 'folder_currency', name: 'Currency', match: t => hasTagWord(t, 'currency') || hasTagWord(t, 'valuable') },
  { id: 'folder_gear',     name: 'Gear',     match: () => true },
];

// Tags are free-form, so match on whole words: "martial mele weapon" is a weapon.
function hasTagWord(t, word) {
  return (t.tags ?? []).some(tag => String(tag).toLowerCase().split(/\s+/).includes(word));
}

// Whether the default folders have been laid down for this browser. Stored, so
// deleting them all sticks instead of being undone on the next load.
let foldersSeeded = false;

function loadFolders() {
  let data = null;
  try {
    const raw = localStorage.getItem(FOLDERS_KEY);
    if (raw) data = JSON.parse(raw);
  } catch (e) {
    // Corrupt entry or storage disabled — treat it as a first run.
  }

  if (data) {
    if (Array.isArray(data.folders)) {
      state.folders = data.folders
        .filter(f => f && f.id && typeof f.name === 'string')
        .map(f => ({ id: String(f.id), name: f.name }));
    }
    if (data.assign)    state.folderAssign    = { ...data.assign };
    if (data.collapsed) state.folderCollapsed = { ...data.collapsed };
    foldersSeeded = !!data.seeded;
  }

  seedDefaultFolders();
}

// First run — and once for browsers whose folders predate the defaults — adds
// any default folder that isn't already there. A folder the user has renamed is
// still recognised by id; one they made themselves under the same name is left
// alone rather than duplicated.
function seedDefaultFolders() {
  if (foldersSeeded) return;
  foldersSeeded = true;
  addMissingDefaultFolders();
  saveFolders();
}

// Adds back any default folder that is neither there by id nor matched by name.
// Split out of the seeding so Restore Defaults can reuse it: it does not touch
// `foldersSeeded`, which records only that the first run has happened.
function addMissingDefaultFolders() {
  const taken = new Set(state.folders.map(f => f.name.toLowerCase()));
  DEFAULT_FOLDERS.forEach(def => {
    if (getFolder(def.id) || taken.has(def.name.toLowerCase())) return;
    state.folders.push({ id: def.id, name: def.name });
  });
}

function saveFolders() {
  try {
    localStorage.setItem(FOLDERS_KEY, JSON.stringify({
      folders:   state.folders,
      assign:    state.folderAssign,
      collapsed: state.folderCollapsed,
      seeded:    foldersSeeded,
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

// Unfiled is a virtual group — it is never stored, so it has no entry to read a
// name off. One place knows what it is called, for the list header and the
// drag hint alike.
const UNFILED_NAME = 'Unfiled';
function folderNameOf(id) {
  if (id === UNFILED_ID) return UNFILED_NAME;
  return getFolder(id)?.name ?? UNFILED_NAME;
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

// Deleting a folder never deletes items — dropping their assignments hands them
// back to their default folder, or to Unfiled if that was the folder deleted.
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

// The folder an item was explicitly put in: a folder id, UNFILED_ID if the user
// deliberately kept it out of every folder, or null if it has never been filed
// by hand (and so follows its default folder).
function explicitFolderOf(templateId) {
  const id = state.folderAssign[templateId];
  if (id === UNFILED_ID) return UNFILED_ID;
  return id && getFolder(id) ? id : null;
}

// Where an unfiled item files itself, by type. Null only if the matching folder
// has been deleted — or renamed *and* re-created by hand, hence the name lookup.
function defaultFolderIdFor(templateId) {
  const t = state.db[templateId];
  if (!t) return null;
  const def = DEFAULT_FOLDERS.find(d => d.match(t));
  if (!def) return null;
  if (getFolder(def.id)) return def.id;
  const byName = state.folders.find(f => f.name.toLowerCase() === def.name.toLowerCase());
  return byName ? byName.id : null;
}

// Where an item actually shows up: its override if it has one, otherwise its
// default folder. Null — Unfiled — only for an explicit override or an item no
// default folder is left to take.
function folderOf(templateId) {
  const explicit = explicitFolderOf(templateId);
  if (explicit === UNFILED_ID) return null;
  return explicit ?? defaultFolderIdFor(templateId);
}

// `folderId` is a folder id, UNFILED_ID to keep the item out of every folder, or
// null to drop the override and let the item follow its default folder again.
function setItemFolder(templateId, folderId) {
  if (folderId === UNFILED_ID) state.folderAssign[templateId] = UNFILED_ID;
  else if (folderId && getFolder(folderId)) state.folderAssign[templateId] = folderId;
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

// Unfiled is virtual but still collapsible, so "all" has to reach it too.
function setAllFoldersCollapsed(collapsed) {
  state.folderCollapsed = {};
  if (collapsed) {
    state.folders.forEach(f => { state.folderCollapsed[f.id] = true; });
    state.folderCollapsed[UNFILED_ID] = true;
  }
  saveFolders();
}

// Hands every item back to the folder its type files it into. That means
// dropping the whole of `folderAssign` — it holds nothing *but* hand-filed
// overrides, so clearing it is exactly "nobody filed anything by hand".
//
// Missing default folders are re-created first, because without them
// `defaultFolderIdFor` has no answer and the items the button just freed would
// land in Unfiled — a restore that files everything nowhere is not a restore.
// Folders the user made are left standing: the button restores where items
// *are*, and deleting someone's folders is a different, unasked-for operation.
function restoreDefaultFolders() {
  addMissingDefaultFolders();
  state.folderAssign = {};
  saveFolders();
}

// Judged on the real folders alone: Unfiled is usually empty and unrendered, so
// letting it decide would strand the button on "Expand All" with nothing open.
function allFoldersCollapsed() {
  return state.folders.length > 0 && state.folders.every(f => isFolderCollapsed(f.id));
}

// The button offers whichever action isn't already done. It goes away without
// folders to fold, and while a search forces every folder open there is nothing
// for it to toggle — same reason the headers stop responding.
function updateFolderToolbar(searchLocked) {
  const btn = document.getElementById('toggle-folders-btn');
  const collapsed = allFoldersCollapsed();
  btn.classList.toggle('hidden', state.folders.length === 0);
  btn.disabled = searchLocked;
  // The caret shows the *action*, not the state — the same arrow the label used
  // to sit beside, now carrying the meaning on its own. The folder headers'
  // carets read the other way round (▾ = this folder is open), which is why the
  // title matters here.
  btn.textContent = collapsed ? '▾' : '▸';
  btn.title = searchLocked
    ? 'A search keeps every folder open'
    : (collapsed ? 'Open every folder' : 'Close every folder');
}

document.getElementById('toggle-folders-btn').addEventListener('click', () => {
  setAllFoldersCollapsed(!allFoldersCollapsed());
  renderItemList();
});

// Destructive in the one way that matters — every hand-filed item moves — so it
// says exactly what will happen and what will not before it happens.
document.getElementById('restore-folders-btn').addEventListener('click', () => {
  const filed = Object.keys(state.folderAssign).length;
  const moving = filed > 0
    ? `${filed} item${filed > 1 ? 's' : ''} you filed by hand will move back to the folder its type belongs in.\n\n`
    : '';
  if (!confirm(
    'Restore every item to its default folder?\n\n' + moving +
    'Any missing default folder is re-created. Folders you made yourself are kept, but items will leave them.'
  )) return;
  restoreDefaultFolders();
  renderItemList();
});

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
  groups.push({ id: UNFILED_ID, name: UNFILED_NAME, items: unfiled });
  return groups;
}

// Total items in a folder, ignoring the search/filter controls — the delete
// prompt should report everything that is about to move to Unfiled.
function folderItemCount(folderId) {
  return Object.values(state.db).filter(t => folderOf(t.id) === folderId).length;
}

// `currentId` is an *explicit* assignment (see explicitFolderOf): the empty
// option means "no override", i.e. file it by type.
function populateFolderSelect(sel, currentId) {
  sel.innerHTML = '';
  const addOption = (value, label) => {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    sel.appendChild(opt);
  };
  addOption('', 'Automatic (by type)');
  state.folders.forEach(f => addOption(f.id, f.name));
  addOption(UNFILED_ID, UNFILED_NAME);
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
  const current = explicitFolderOf(templateId);

  const addChoice = (label, active, onPick, icon) => {
    const btn = document.createElement('button');
    btn.className = 'btn-sm folder-pick-btn' + (active ? ' active' : '');
    if (icon) setIconLabel(btn, icon, label);
    else btn.textContent = label;
    btn.addEventListener('click', () => { hideModal('folder-picker-modal'); onPick(); });
    list.appendChild(btn);
  };

  const auto = getFolder(defaultFolderIdFor(templateId));
  addChoice(auto ? `Automatic (${auto.name})` : 'Automatic (by type)', current === null, () => {
    setItemFolder(templateId, null);
    renderItemList();
  });
  state.folders.forEach(f => addChoice(f.name, current === f.id, () => {
    setItemFolder(templateId, f.id);
    renderItemList();
  }));
  addChoice(UNFILED_NAME, current === UNFILED_ID, () => {
    setItemFolder(templateId, UNFILED_ID);
    renderItemList();
  });
  addChoice('New Folder…', false, () => {
    openFolderNameModal({ title: 'New Folder', value: '', confirmLabel: 'Create' }, name => {
      setItemFolder(templateId, createFolder(name));
      renderItemList();
    });
  }, 'plus');
  list.lastChild.classList.add('new');

  showModal('folder-picker-modal');
}
