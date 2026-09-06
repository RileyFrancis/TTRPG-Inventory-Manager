// =============================================================================
// MODALS — Tabs, filters, character / item-editor / stack modals
// =============================================================================
'use strict';

// =============================================================================
// TABS
// =============================================================================
// The sidebar shows the tabs that belong to what the inventory panel is
// currently showing, because the two answer one question. Reading an item's
// stats beside a grid of items is the whole point; reading them beside a
// character sheet is a panel of the wrong app. So:
//
//   inventory view   Browse · Details · Party
//   sheet view       Chat · Dice · Party
//
// Party is in **both** — it is who you are playing with, which is true of either
// view — and it is the reason this is a map rather than two flat lists.
const SIDEBAR_TAB_VIEW = {
  browse:  'inventory',
  details: 'inventory',
  chat:    'sheet',
  dice:    'sheet',
  party:   null, // both
};

// Which view a tab belongs to, or null for one that belongs to both.
function sidebarTabView(name) {
  return SIDEBAR_TAB_VIEW[name] ?? null;
}

// **What the inventory panel is actually showing**, which is not always
// `state.view`. A GM who deselects a player keeps `state.view === 'sheet'` while
// the panel falls back to their placeholder — and reading the raw field there
// would leave them on Chat and Dice with no Browse, which is the tab they stock
// their shops by dragging out of. `syncCharacterViewUI()` computes the same
// thing for `.sheet-view`; this is that answer, asked from here.
//
// **The battle map answers 'sheet' rather than earning a third set of tabs.**
// The question this function asks is not "which view is up" but "which pane
// belongs beside it", and beside a board that is Chat, Dice and Party — the
// table's own three. Browse and Details are a list of items to read against a
// grid of items, which a map is not. Giving the map its own row would mean
// three names for two answers.
function sidebarView() {
  if (mapViewIsShowing()) return 'sheet';
  return (state.view === 'sheet' && hasViewedCharacter()) ? 'sheet' : 'inventory';
}

function sidebarTabAvailable(name) {
  const view = sidebarTabView(name);
  return view === null || view === sidebarView();
}

// The plain DOM half: light one button, show one pane. Everything that decides
// *which* is above it, so this can be called from the sync below without the
// two recursing into each other.
function activateSidebarTab(name) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.toggle('active', p.id === `tab-${name}`));
  if (name === 'chat') onChatTabShown();
}

// Show the buttons belonging to the current view, and never leave the active
// one hidden — switching to the sheet with Details up has to land somewhere.
// Called from `syncCharacterViewUI()`, the single entry point for "what are we
// looking at changed".
function syncSidebarTabs() {
  let activeStillThere = false;
  const visible = [];

  document.querySelectorAll('.tab-btn').forEach(btn => {
    const name = btn.dataset.tab;
    const shown = sidebarTabAvailable(name);
    btn.classList.toggle('hidden', !shown);
    if (!shown) return;
    visible.push(name);
    if (btn.classList.contains('active')) activeStillThere = true;
  });

  if (!activeStillThere && visible.length) activateSidebarTab(visible[0]);
  else if (activeStillThere) {
    // The pane may still need waking even when the button did not move — coming
    // back to the sheet with Chat already active is exactly that case.
    const active = document.querySelector('.tab-btn.active');
    if (active && active.dataset.tab === 'chat') onChatTabShown();
  }
}

// **Asking for a tab is asking for the view it lives in.** A shop entry clicked
// while reading your character sheet calls `switchTab('details')`, and the
// honest answer is to show the item — which means going where items are shown,
// rather than lighting a button the reader cannot see. Every existing caller
// keeps working untouched because of this line.
function switchTab(name) {
  const view = sidebarTabView(name);
  // **The sheet is the only view that can be refused**, and that is what the
  // `hasViewedCharacter()` test was always for: a GM with nobody picked has no
  // character to show one of. Asked of an *inventory* pane it refuses a move
  // that is always possible — which is how a GM standing on the battle map with
  // no player selected found Browse unreachable, and Browse is the pane they
  // stock shops by dragging out of.
  const reachable = view === 'inventory' || hasViewedCharacter();
  if (view && view !== sidebarView() && reachable) setInventoryView(view);
  activateSidebarTab(name);
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// =============================================================================
// FILTER CONTROLS
// =============================================================================
document.getElementById('item-search').addEventListener('input', renderItemList);
document.getElementById('rarity-filter').addEventListener('change', renderItemList);
document.getElementById('tag-filter').addEventListener('change', renderItemList);

// =============================================================================
// CHARACTER MODAL
// =============================================================================
// It lives in src/js/character-setup.js — the dialog grew a list of class rows,
// which is a concern of its own rather than one more form in here.

function rebuildGrid() {
  state.activeContainer = null;
  initGrid();
  buildGrid();
  rebuildContainerGrids();
  // Re-place main inventory instances
  Object.values(state.instances).forEach(inst => {
    if (inst.containerId) return; // skip items inside containers
    if (inst.row === null || inst.row === undefined) return;
    const t = state.db[inst.templateId];
    if (!t) return;
    const shape = getRotatedShape(t.shape, inst.rotation);
    if (canPlace(shape, inst.row, inst.col)) placeOnGrid(inst.id, shape, inst.row, inst.col);
    else unplaceInstance(inst); // the grid shrank out from under it — see grid.js
  });
  renderContainerTabs();
  renderAllItems();
  updateWeightDisplay();
}

function initContainerGrid(instanceId) {
  const t = state.db[state.instances[instanceId]?.templateId];
  const rows = t?.containerRows ?? 5;
  const cols = t?.containerCols ?? 5;
  state.containerGrids[instanceId] = Array.from({ length: rows }, () => Array(cols).fill(null));
}

function rebuildContainerGrids() {
  state.containerGrids = {};
  // Initialize a grid for every container instance
  Object.values(state.instances).forEach(inst => {
    const t = state.db[inst.templateId];
    if (t?.container) initContainerGrid(inst.id);
  });
  // Re-place items that are stored inside containers
  Object.values(state.instances).forEach(inst => {
    if (!inst.containerId) return;
    if (inst.row === null || inst.row === undefined) return;
    const t = state.db[inst.templateId];
    if (!t) return;
    const grid = state.containerGrids[inst.containerId];
    if (!grid) return;
    const shape = getRotatedShape(t.shape, inst.rotation);
    // Same trap as the main grid, reached by editing a container template's
    // rows or columns down: without the fit test the cells outside the new
    // bounds are dropped on the floor and the item is stranded.
    if (!fitsInGrid(grid, grid[0]?.length ?? 0, shape, inst.row, inst.col)) {
      unplaceInstance(inst);
      return;
    }
    getShapeCells(shape, inst.row, inst.col).forEach(({ row, col }) => {
      if (grid[row]) grid[row][col] = inst.id;
    });
  });
}

function renderContainerTabs() {
  const tabsEl = document.getElementById('container-tabs');
  const containers = Object.values(state.instances).filter(inst => {
    const t = state.db[inst.templateId];
    return t?.container && inst.row !== null && inst.row !== undefined && !inst.containerId;
  });

  if (containers.length === 0) {
    tabsEl.classList.add('hidden');
    return;
  }

  tabsEl.classList.remove('hidden');
  tabsEl.innerHTML = '';

  const mainTab = document.createElement('button');
  mainTab.className = 'container-tab' + (state.activeContainer === null ? ' active' : '');
  mainTab.textContent = 'Inventory';
  mainTab.addEventListener('click', () => { if (state.activeContainer !== null) switchActiveContainer(null); });
  tabsEl.appendChild(mainTab);

  containers.forEach(inst => {
    const t = state.db[inst.templateId];
    const tab = document.createElement('button');
    tab.className = 'container-tab' + (state.activeContainer === inst.id ? ' active' : '');
    tab.textContent = t.name;
    tab.addEventListener('click', () => { if (state.activeContainer !== inst.id) switchActiveContainer(inst.id); });
    tabsEl.appendChild(tab);
  });
}

function switchActiveContainer(id) {
  if (state.activeContainer === id) return;
  cancelPlacing();
  state.activeContainer = id;
  if (id && !state.containerGrids[id]) initContainerGrid(id);
  buildGrid();
  renderContainerTabs();
  renderAllItems();
}

// =============================================================================
// ITEM EDITOR MODAL
// =============================================================================
document.getElementById('new-item-btn').addEventListener('click', () => openItemModal(null));

function openItemModal(templateId) {
  state.editingItemId = templateId;
  const t = templateId ? state.db[templateId] : null;

  document.getElementById('item-modal-title').textContent = t ? 'Edit Item' : 'New Item';
  document.getElementById('f-name').value    = t?.name ?? '';
  document.getElementById('f-rarity').value  = t?.rarity ?? 'common';
  document.getElementById('f-desc').value    = t?.description ?? '';
  const cost = parseCostObj(t?.cost);
  document.getElementById('f-cost-pp').value = cost.pp;
  document.getElementById('f-cost-gp').value = cost.gp;
  document.getElementById('f-cost-ep').value = cost.ep;
  document.getElementById('f-cost-sp').value = cost.sp;
  document.getElementById('f-cost-cp').value = cost.cp;
  document.getElementById('f-tags').value    = t?.tags.join(', ') ?? '';
  // The *explicit* folder, not the resolved one: an item that files itself by
  // type should read as Automatic rather than look hand-placed.
  populateFolderSelect(document.getElementById('f-folder'), templateId ? explicitFolderOf(templateId) : null);
  document.getElementById('f-image').value        = t?.image ?? '';
  // Player-authored items default to homebrew; an edit keeps whatever it had.
  document.getElementById('f-source').value        = t?.source ?? 'HB';
  document.getElementById('f-damage').value       = t?.damage ?? '';
  document.getElementById('f-damage-type').value  = t?.damageType ?? '';
  document.getElementById('f-attunement').checked = t?.attunement ?? false;

  const isContainer = t?.container ?? false;
  document.getElementById('f-container').checked = isContainer;
  document.getElementById('container-fields').classList.toggle('hidden', !isContainer);
  document.getElementById('f-container-cols').value = t?.containerCols ?? 5;
  document.getElementById('f-container-rows').value = t?.containerRows ?? 5;

  const stackable = isStackable(t);
  document.getElementById('f-stackable').checked = stackable;
  document.getElementById('f-stack-size').value = stackable ? stackSizeOf(t) : 10;
  document.getElementById('stackable-fields').classList.toggle('hidden', !stackable);
  updateUnitWeightDisplay();

  state.editorShape = t ? t.shape.map(r => [...r]) : [[1]];
  document.getElementById('shape-editor-section').classList.toggle('hidden', stackable);
  renderShapeEditor();
  showModal('item-modal');
}

document.getElementById('f-stackable').addEventListener('change', e => {
  const on = e.target.checked;
  document.getElementById('stackable-fields').classList.toggle('hidden', !on);
  document.getElementById('shape-editor-section').classList.toggle('hidden', on);
});

document.getElementById('f-container').addEventListener('change', e => {
  document.getElementById('container-fields').classList.toggle('hidden', !e.target.checked);
});

document.getElementById('f-stack-size').addEventListener('input', updateUnitWeightDisplay);
function updateUnitWeightDisplay() {
  const n = parseInt(document.getElementById('f-stack-size').value, 10);
  document.getElementById('f-unit-weight-display').textContent =
    n >= 1 ? formatWeight(1 / n) : '—';
}

// Shape controls
document.getElementById('sc-add-col').addEventListener('click', () => {
  state.editorShape.forEach(r => r.push(0));
  renderShapeEditor();
});
document.getElementById('sc-rem-col').addEventListener('click', () => {
  if (state.editorShape[0].length <= 1) return;
  state.editorShape.forEach(r => r.pop());
  renderShapeEditor();
});
document.getElementById('sc-add-row').addEventListener('click', () => {
  state.editorShape.push(Array(state.editorShape[0].length).fill(0));
  renderShapeEditor();
});
document.getElementById('sc-rem-row').addEventListener('click', () => {
  if (state.editorShape.length <= 1) return;
  state.editorShape.pop();
  renderShapeEditor();
});
document.getElementById('sc-clear').addEventListener('click', () => {
  state.editorShape = state.editorShape.map(r => r.map(() => 0));
  renderShapeEditor();
});
document.getElementById('sc-fill').addEventListener('click', () => {
  state.editorShape = state.editorShape.map(r => r.map(() => 1));
  renderShapeEditor();
});

function renderShapeEditor() {
  const grid = document.getElementById('shape-editor-grid');
  const shape = state.editorShape;
  const rows = shape.length, cols = shape[0].length;
  grid.style.gridTemplateColumns = `repeat(${cols}, 28px)`;
  grid.innerHTML = '';
  shape.forEach((row, r) => row.forEach((v, c) => {
    const cell = document.createElement('div');
    cell.className = 'shape-cell ' + (v ? 'on' : '');
    cell.addEventListener('click', () => {
      state.editorShape[r][c] = state.editorShape[r][c] ? 0 : 1;
      renderShapeEditor();
    });
    grid.appendChild(cell);
  }));
  document.getElementById('shape-weight-val').textContent = shapeWeight(shape);
}

document.getElementById('save-item-btn').addEventListener('click', () => {
  const name = document.getElementById('f-name').value.trim();
  if (!name) { alert('Item name is required.'); return; }

  const stackable = document.getElementById('f-stackable').checked;
  const stackSize = parseInt(document.getElementById('f-stack-size').value, 10);

  if (stackable && !(stackSize >= 2)) {
    alert('Stack size must be a whole number of 2 or more.');
    return;
  }

  const id = state.editingItemId ?? newTemplateId();
  const tagsRaw = document.getElementById('f-tags').value;
  const tags = tagsRaw.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
  const isContainer = document.getElementById('f-container').checked;

  state.db[id] = {
    id,
    name,
    rarity:      document.getElementById('f-rarity').value,
    description: document.getElementById('f-desc').value.trim(),
    cost: {
      pp: parseInt(document.getElementById('f-cost-pp').value) || 0,
      gp: parseInt(document.getElementById('f-cost-gp').value) || 0,
      ep: parseInt(document.getElementById('f-cost-ep').value) || 0,
      sp: parseInt(document.getElementById('f-cost-sp').value) || 0,
      cp: parseInt(document.getElementById('f-cost-cp').value) || 0,
    },
    tags,
    image:       document.getElementById('f-image').value.trim(),
    source:      document.getElementById('f-source').value.trim() || 'HB',
    damage:      document.getElementById('f-damage').value.trim() || undefined,
    damageType:  document.getElementById('f-damage-type').value || undefined,
    attunement:  document.getElementById('f-attunement').checked || undefined,
    stackSize:   stackable ? stackSize : undefined,
    shape:       stackable ? [[1]] : state.editorShape.map(r => [...r]),
    container:      isContainer || undefined,
    containerRows:  isContainer ? (parseInt(document.getElementById('f-container-rows').value) || 5) : undefined,
    containerCols:  isContainer ? (parseInt(document.getElementById('f-container-cols').value) || 5) : undefined,
  };

  setItemFolder(id, document.getElementById('f-folder').value || null);

  hideModal('item-modal');
  renderItemList();
  showTemplateDetails(id);
  debouncedSync();
});

// =============================================================================
// STACK MODAL
// =============================================================================
let stackModalCallback = null;

function openStackModal(max, callback) {
  stackModalCallback = callback;
  document.getElementById('stack-modal-desc').textContent = `How many to place? (max ${max})`;
  const input = document.getElementById('stack-count-input');
  input.max = max;
  input.min = '1';
  input.value = max;
  document.getElementById('stack-confirm-btn').textContent = 'Place';
  showModal('stack-modal');
}

document.getElementById('stack-confirm-btn').addEventListener('click', () => {
  const n = Math.max(1, parseInt(document.getElementById('stack-count-input').value) || 1);
  hideModal('stack-modal');
  if (stackModalCallback) { stackModalCallback(n); stackModalCallback = null; }
});

// =============================================================================
// MODAL HELPERS
// =============================================================================
function showModal(id) {
  document.getElementById('modal-backdrop').classList.remove('hidden');
  document.getElementById(id).classList.remove('hidden');
}
function hideModal(id) {
  document.getElementById(id).classList.add('hidden');
  if (!document.querySelector('.modal:not(.hidden)')) {
    document.getElementById('modal-backdrop').classList.add('hidden');
  }
}
document.getElementById('modal-backdrop').addEventListener('click', () => {
  document.querySelectorAll('.modal:not(.hidden)').forEach(m => hideModal(m.id));
});
document.querySelectorAll('.cancel-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const modal = btn.closest('.modal');
    if (modal) hideModal(modal.id);
  });
});
