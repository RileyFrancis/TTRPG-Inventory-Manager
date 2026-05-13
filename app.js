// =============================================================================
// D&D INVENTORY MANAGER — app.js
// =============================================================================
'use strict';

// =============================================================================
// CONSTANTS
// =============================================================================
const CELL = 44;          // px per grid square
const GRID_COLS = 15;     // fixed column count

const RARITY_META = {
  common:    { label: 'Common',           color: '#b0b0b0' },
  uncommon:  { label: 'Uncommon',         color: '#1eff00' },
  rare:      { label: 'Rare',             color: '#0084ff' },
  very_rare: { label: 'Very Rare',        color: '#c040ff' },
  legendary: { label: 'Legendary',        color: '#ff8000' },
  artifact:  { label: 'Artifact',         color: '#e6cc80' },
};

const RARITY_ORDER = ['common','uncommon','rare','very_rare','legendary','artifact'];

const EQUIP_SLOTS = [
  // Body — rendered top to bottom in equip panel
  { id: 'head',     label: 'Headgear',  group: 'body'     },
  { id: 'armor',    label: 'Armor',     group: 'body'     },
  { id: 'cloak',    label: 'Cloak',     group: 'body'     },
  { id: 'gloves',   label: 'Gloves',    group: 'body'     },
  { id: 'boots',    label: 'Footwear',  group: 'body'     },
  // Weapons — rendered in a row
  { id: 'mainHand', label: 'Main Hand', panelLabel: 'Main',   group: 'weapons' },
  { id: 'offHand',  label: 'Off Hand',  panelLabel: 'Off',    group: 'weapons' },
  { id: 'ranged',   label: 'Ranged',    panelLabel: 'Ranged', group: 'weapons' },
  // Wondrous — only items that require attunement (max 3 per D&D 5e rules)
  { id: 'attune1',  label: 'Slot I',    group: 'wondrous', attuneOnly: true },
  { id: 'attune2',  label: 'Slot II',   group: 'wondrous', attuneOnly: true },
  { id: 'attune3',  label: 'Slot III',  group: 'wondrous', attuneOnly: true },
];

function getDefaultEquipLayout() {
  return [
    { type: 'header', label: 'Body' },
    { type: 'slot', id: 'head',     label: 'Headgear',  panelLabel: 'Head',   attuneOnly: false, inRow: false, visible: true },
    { type: 'slot', id: 'armor',    label: 'Armor',     panelLabel: '',       attuneOnly: false, inRow: false, visible: true },
    { type: 'slot', id: 'cloak',    label: 'Cloak',     panelLabel: '',       attuneOnly: false, inRow: false, visible: true },
    { type: 'slot', id: 'gloves',   label: 'Gloves',    panelLabel: '',       attuneOnly: false, inRow: false, visible: true },
    { type: 'slot', id: 'boots',    label: 'Footwear',  panelLabel: '',       attuneOnly: false, inRow: false, visible: true },
    { type: 'header', label: 'Weapons' },
    { type: 'slot', id: 'mainHand', label: 'Main Hand', panelLabel: 'Main',   attuneOnly: false, inRow: true,  visible: true },
    { type: 'slot', id: 'offHand',  label: 'Off Hand',  panelLabel: 'Off',    attuneOnly: false, inRow: true,  visible: true },
    { type: 'slot', id: 'ranged',   label: 'Ranged',    panelLabel: 'Ranged', attuneOnly: false, inRow: true,  visible: true },
    { type: 'header', label: 'Wondrous' },
    { type: 'slot', id: 'attune1',  label: 'Slot I',    panelLabel: '',       attuneOnly: true,  inRow: false, visible: true },
    { type: 'slot', id: 'attune2',  label: 'Slot II',   panelLabel: '',       attuneOnly: true,  inRow: false, visible: true },
    { type: 'slot', id: 'attune3',  label: 'Slot III',  panelLabel: '',       attuneOnly: true,  inRow: false, visible: true },
  ];
}

function getSlotDef(slotId) {
  return state.equipLayout.find(item => item.type === 'slot' && item.id === slotId);
}

// =============================================================================
// DEFAULT ITEM DATABASE  (defined in items.js, loaded before this script)
// =============================================================================

// =============================================================================
// STATE
// =============================================================================
const state = {
  character: { name: 'Unnamed Hero', strength: 10 },
  // Grid: 2D array [row][col] = instanceId | null
  grid: [],
  // Map of instanceId -> PlacedInstance
  instances: {},
  // Item database (templates), keyed by id
  db: {},
  // Current interaction mode
  mode: 'idle',  // 'idle' | 'placing' | 'dragging'
  placing: null, // { templateId, rotation }
  dragging: null, // { instanceId, anchorRow, anchorCol, origRow, origCol, origRotation }
  // Currently selected (shown in details tab)
  selected: null, // { type:'instance'|'template', id }
  // Shape editor state (inside item modal)
  editorShape: [[1]],
  editingItemId: null, // null = new item
  // Equipped items: { [slotId]: instanceId | null }
  equipped: {},
  // Equipment panel layout — ordered array of header/slot items (persisted separately)
  equipLayout: [],
  // Party session
  party: {
    active: false,
    code: null,
    role: null,           // 'gm' | 'player'
    playerId: null,       // our session ID
    playerName: null,
    viewingPlayerId: null, // which player's inventory we're viewing (null = own for player, none for GM)
    ownState: null,       // saved own state when player views another's inventory
    players: {},          // Firebase cache: { [id]: { name, connected, character, instances, customDb } }
  },
};

// Convenience
function gridRows() { return state.character.strength * 3; }
function normalRows() { return state.character.strength; }

// =============================================================================
// SHAPE UTILITIES
// =============================================================================
function shapeCellCount(shape) {
  return shape.reduce((s, row) => s + row.reduce((a, v) => a + v, 0), 0);
}

function shapeWeight(shape) { return shapeCellCount(shape); }

function shapeDims(shape) {
  return { rows: shape.length, cols: shape[0].length };
}

function normalizeShape(shape) {
  // Remove empty border rows/cols
  let minR = shape.length, maxR = -1, minC = shape[0].length, maxC = -1;
  shape.forEach((row, r) => row.forEach((v, c) => {
    if (v) { minR = Math.min(minR, r); maxR = Math.max(maxR, r); minC = Math.min(minC, c); maxC = Math.max(maxC, c); }
  }));
  if (maxR < 0) return [[0]]; // all empty → 1x1
  return shape.slice(minR, maxR + 1).map(row => row.slice(minC, maxC + 1));
}

function rotateShapeCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function getRotatedShape(baseShape, rotation) {
  let s = baseShape;
  for (let i = 0; i < rotation; i++) s = rotateShapeCW(s);
  return s;
}

// All filled cell coords of shape, absolute on grid (given gridRow, gridCol as top-left of bounding box)
function getShapeCells(shape, gridRow, gridCol) {
  const cells = [];
  shape.forEach((row, r) => row.forEach((v, c) => {
    if (v) cells.push({ row: gridRow + r, col: gridCol + c });
  }));
  return cells;
}

// Rotate anchor cell through a CW rotation
function rotateAnchorCW(anchorRow, anchorCol, rows, cols) {
  return { row: anchorCol, col: rows - 1 - anchorRow };
}

// =============================================================================
// GRID LOGIC
// =============================================================================
function initGrid() {
  const rows = gridRows();
  state.grid = Array.from({ length: rows }, () => Array(GRID_COLS).fill(null));
}

function canPlace(shape, gridRow, gridCol, excludeInstanceId = null) {
  const cells = getShapeCells(shape, gridRow, gridCol);
  for (const { row, col } of cells) {
    if (row < 0 || row >= state.grid.length || col < 0 || col >= GRID_COLS) return false;
    const occupant = state.grid[row][col];
    if (occupant && occupant !== excludeInstanceId) return false;
  }
  return true;
}

function placeOnGrid(instanceId, shape, gridRow, gridCol) {
  getShapeCells(shape, gridRow, gridCol).forEach(({ row, col }) => {
    state.grid[row][col] = instanceId;
  });
}

function removeFromGrid(instanceId) {
  state.grid.forEach(row => row.forEach((v, i, arr) => {
    if (v === instanceId) arr[i] = null;
  }));
}

function totalCarriedWeight() {
  return Object.values(state.instances).reduce((sum, inst) => {
    const template = state.db[inst.templateId];
    if (!template) return sum;
    if (template.stackable) return sum + template.weightEach * inst.stackCount;
    return sum + shapeWeight(getRotatedShape(template.shape, inst.rotation));
  }, 0);
}

// =============================================================================
// ID GENERATION
// =============================================================================
let _nextId = 1;
function newId() { return 'inst_' + (_nextId++); }
function syncNextId() {
  const max = Object.keys(state.instances)
    .map(id => parseInt(id.slice(5), 10))  // strip 'inst_'
    .filter(n => !isNaN(n))
    .reduce((a, b) => Math.max(a, b), 0);
  if (max >= _nextId) _nextId = max + 1;
}
function newTemplateId() { return 'custom_' + Date.now() + '_' + Math.floor(Math.random() * 1000); }

// =============================================================================
// RENDERING — GRID
// =============================================================================
const gridEl = document.getElementById('inventory-grid');

function buildGrid() {
  gridEl.innerHTML = '';
  gridEl.style.gridTemplateColumns = `repeat(${GRID_COLS}, ${CELL}px)`;

  const str = state.character.strength;
  const total = gridRows();

  for (let r = 0; r < total; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const cell = document.createElement('div');
      cell.className = 'grid-cell';
      cell.dataset.row = r;
      cell.dataset.col = c;
      if (r >= str && r < str * 2) {
        cell.classList.add('zone-enc');
        if (r === str) cell.classList.add('zone-boundary-enc');
      } else if (r >= str * 2) {
        cell.classList.add('zone-heavy');
        if (r === str * 2) cell.classList.add('zone-boundary-heavy');
      }
      gridEl.appendChild(cell);
    }
  }

  gridEl.style.height = total * CELL + 'px';
}

// =============================================================================
// RENDERING — PLACED ITEMS
// =============================================================================
function renderAllItems() {
  gridEl.querySelectorAll('.placed-item').forEach(el => el.remove());
  Object.values(state.instances).forEach(inst => renderPlacedItem(inst));
  renderEquipPanel();
  renderStash();
}

function buildItemEl(template, shape, rarity) {
  const dims = shapeDims(shape);
  const el = document.createElement('div');
  el.className = `placed-item rarity-${rarity}`;
  el.style.width  = dims.cols * CELL + 'px';
  el.style.height = dims.rows * CELL + 'px';
  el.style.gridTemplateColumns = `repeat(${dims.cols}, ${CELL}px)`;
  el.style.display = 'grid';


  const rc = RARITY_META[rarity]?.color ?? '#888';
  const innerBorder = 'rgba(255,255,255,0.1)';

  shape.forEach((row, r) => row.forEach((v, c) => {
    const cellEl = document.createElement('div');
    if (v) {
      cellEl.className = 'item-cell filled';
      const hasTop    = r > 0 && shape[r-1][c] === 1;
      const hasBottom = r < shape.length - 1 && shape[r+1][c] === 1;
      const hasLeft   = c > 0 && shape[r][c-1] === 1;
      const hasRight  = c < shape[r].length - 1 && shape[r][c+1] === 1;
      cellEl.style.borderTopColor    = hasTop    ? innerBorder : rc;
      cellEl.style.borderBottomColor = hasBottom ? innerBorder : rc;
      cellEl.style.borderLeftColor   = hasLeft   ? innerBorder : rc;
      cellEl.style.borderRightColor  = hasRight  ? innerBorder : rc;
    } else {
      cellEl.className = 'item-cell empty';
    }
    el.appendChild(cellEl);
  }));

  // Label in the widest filled row (middle one if tied) — guaranteed within filled cells
  const rowCounts = shape.map(row => row.reduce((a, v) => a + v, 0));
  const maxCells = Math.max(...rowCounts);
  const candidates = rowCounts.reduce((acc, n, r) => { if (n === maxCells) acc.push(r); return acc; }, []);
  const labelRow = candidates[Math.floor(candidates.length / 2)];
  let firstC = -1, lastC = -1;
  shape[labelRow].forEach((v, c) => { if (v) { if (firstC < 0) firstC = c; lastC = c; } });

  if (template.image) {
    const imgDiv = document.createElement('div');
    imgDiv.className = 'item-image-bg';
    imgDiv.style.backgroundImage = `url('${template.image}')`;
    el.appendChild(imgDiv);
  }

  const lbl = document.createElement('div');
  lbl.className = 'item-label';
  lbl.textContent = template.name;
  lbl.style.inset  = 'unset';
  lbl.style.left   = (firstC * CELL) + 'px';
  lbl.style.top    = (labelRow * CELL) + 'px';
  lbl.style.width  = ((lastC - firstC + 1) * CELL) + 'px';
  lbl.style.height = CELL + 'px';
  el.appendChild(lbl);

  return el;
}

function renderPlacedItem(inst) {
  if (inst.row === null || inst.row === undefined) return; // unplaced — shown in stash
  const template = state.db[inst.templateId];
  if (!template) return;
  const shape = getRotatedShape(template.shape, inst.rotation);

  const el = buildItemEl(template, shape, template.rarity);
  el.dataset.instanceId = inst.id;
  el.style.left = inst.col * CELL + 'px';
  el.style.top  = inst.row * CELL + 'px';

  // Stack badge
  if (template.stackable && inst.stackCount > 1) {
    const badge = document.createElement('div');
    badge.className = 'stack-badge';
    badge.textContent = inst.stackCount;
    el.appendChild(badge);
  }

  // Equipped badge
  if (getEquippedSlot(inst.id)) {
    const equipBadge = document.createElement('div');
    equipBadge.className = 'equip-badge';
    equipBadge.textContent = '⚔';
    el.appendChild(equipBadge);
  }

  // Hover tooltip
  el.querySelectorAll('.item-cell.filled').forEach(cell => {
    cell.addEventListener('pointerenter', e => startTooltipTimer(inst.id, e.clientX, e.clientY));
    cell.addEventListener('pointerleave', clearTooltip);
  });

  el.addEventListener('pointerdown', onItemPointerDown);
  el.addEventListener('contextmenu', onItemContextMenu);

  gridEl.appendChild(el);
  return el;
}

// =============================================================================
// RENDERING — SIDEBAR ITEM LIST
// =============================================================================
function renderItemList() {
  const listEl = document.getElementById('item-list');
  const search = document.getElementById('item-search').value.trim().toLowerCase();
  const rarityF = document.getElementById('rarity-filter').value;
  const tagF = document.getElementById('tag-filter').value;

  const items = Object.values(state.db).filter(t => {
    if (search && !t.name.toLowerCase().includes(search) && !t.description.toLowerCase().includes(search)) return false;
    if (rarityF && t.rarity !== rarityF) return false;
    if (tagF && !t.tags.includes(tagF)) return false;
    return true;
  });

  // Sort: rarity order desc, then name
  items.sort((a, b) => {
    const rd = RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity);
    return rd !== 0 ? rd : a.name.localeCompare(b.name);
  });

  listEl.innerHTML = '';
  items.forEach(t => {
    const card = document.createElement('div');
    card.className = 'item-card';
    card.dataset.templateId = t.id;
    if (state.placing && state.placing.templateId === t.id) card.classList.add('placing');

    const color = RARITY_META[t.rarity]?.color ?? '#888';

    const swatch = document.createElement('div');
    swatch.className = 'item-card-swatch';
    swatch.style.background = color;

    const info = document.createElement('div');
    info.className = 'item-card-info';
    const nm = document.createElement('div');
    nm.className = 'item-card-name';
    nm.textContent = t.name;
    const sub = document.createElement('div');
    sub.className = 'item-card-sub';
    const w = t.stackable
      ? `${t.weightEach} lb ea · stack ×${computeMaxStack(t.weightEach)}`
      : `${shapeWeight(t.shape)} lb`;
    sub.textContent = `${RARITY_META[t.rarity]?.label} · ${w}`;

    info.appendChild(nm);
    info.appendChild(sub);

    const shapePreview = buildMiniShapePreview(t.shape, color);

    card.appendChild(swatch);
    card.appendChild(info);
    card.appendChild(shapePreview);

    card.addEventListener('pointerdown', e => {
      if (e.button !== 0 || isReadOnly()) return;
      e.preventDefault(); // prevent text selection on mousedown
      const tid = t.id;
      const startX = e.clientX, startY = e.clientY;
      let dragging = false;

      const onMove = me => {
        if (!dragging && Math.hypot(me.clientX - startX, me.clientY - startY) < 5) return;
        if (!dragging) {
          dragging = true;
          document.body.style.userSelect = 'none';
          cancelPlacing(); // exit any existing placing mode cleanly
        }
        const tmpl = state.db[tid];
        if (!tmpl) return;
        const shape = getRotatedShape(tmpl.shape, 0);
        initGhostEl(shape, tmpl.rarity);

        const pos = cursorToGridPos(me.clientX, me.clientY, 0, 0);
        if (pos) {
          const sp = getGhostScreenPos(0, 0, pos.row, pos.col);
          const valid = canPlace(shape, pos.row, pos.col);
          setGhostVisibility(true);
          moveGhost(sp.x, sp.y, valid);
          highlightCells(shape, pos.row, pos.col, valid);
        } else {
          setGhostVisibility(false);
          clearHighlights();
        }
        // No equip-slot highlighting for new items (not yet placed)
        document.querySelectorAll('.eq-card.drag-hover').forEach(c => c.classList.remove('drag-hover'));
      };

      const onUp = ue => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.body.style.userSelect = '';
        if (!dragging) {
          // Treat as click → enter placing mode as before
          startPlacing(tid);
          return;
        }
        // End of drag: restore ghost visibility and clean up
        setGhostVisibility(true);
        hideGhost();
        clearHighlights();
        document.querySelectorAll('.eq-card.drag-hover').forEach(c => c.classList.remove('drag-hover'));

        const tmpl = state.db[tid];
        if (!tmpl) return;
        const shape = getRotatedShape(tmpl.shape, 0);
        const pos = cursorToGridPos(ue.clientX, ue.clientY, 0, 0);
        if (pos && canPlace(shape, pos.row, pos.col)) {
          if (tmpl.stackable) {
            openStackModal(computeMaxStack(tmpl.weightEach),
              count => finalizePlacement(tmpl, shape, 0, pos.row, pos.col, count));
          } else {
            finalizePlacement(tmpl, shape, 0, pos.row, pos.col, 1);
          }
        }
        // If dropped outside/invalid, silently cancel — no placing mode
      };

      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    });
    card.addEventListener('pointerenter', e => {
      tooltipTimer = setTimeout(() => showTemplateTooltip(t.id, e.clientX, e.clientY), 1000);
    });
    card.addEventListener('pointerleave', clearTooltip);
    card.addEventListener('contextmenu', e => {
      e.preventDefault();
      showTemplateContextMenu(t.id, e.clientX, e.clientY);
    });

    listEl.appendChild(card);
  });

  // Rebuild tag filter
  populateTagFilter();
}

function buildMiniShapePreview(shape, color) {
  const norm = normalizeShape(shape);
  const { rows, cols } = shapeDims(norm);
  const clampR = Math.min(rows, 6), clampC = Math.min(cols, 6);
  const div = document.createElement('div');
  div.className = 'item-card-shape';
  div.style.gridTemplateColumns = `repeat(${clampC}, 7px)`;
  div.style.gridTemplateRows    = `repeat(${clampR}, 7px)`;
  for (let r = 0; r < clampR; r++) for (let c = 0; c < clampC; c++) {
    const cell = document.createElement('div');
    cell.className = 'card-cell ' + (norm[r]?.[c] ? 'filled' : 'empty');
    if (norm[r]?.[c]) cell.style.background = color;
    div.appendChild(cell);
  }
  return div;
}

function populateTagFilter() {
  const sel = document.getElementById('tag-filter');
  const current = sel.value;
  const allTags = new Set();
  Object.values(state.db).forEach(t => t.tags.forEach(tag => allTags.add(tag)));
  sel.innerHTML = '<option value="">All Tags</option>';
  [...allTags].sort().forEach(tag => {
    const opt = document.createElement('option');
    opt.value = tag; opt.textContent = tag;
    sel.appendChild(opt);
  });
  sel.value = current;
}

// =============================================================================
// RENDERING — DETAILS PANEL
// =============================================================================
function showTemplateDetails(templateId) {
  state.selected = { type: 'template', id: templateId };
  const t = state.db[templateId];
  if (!t) return;
  populateDetailsPanel(t);
  switchTab('details');

  document.getElementById('details-place-btn').classList.remove('hidden');
  document.getElementById('details-place-btn').onclick = () => startPlacing(t.id);
  document.getElementById('details-stash-btn').onclick = () => { addToStash(t.id); switchTab('browse'); };
  document.getElementById('details-edit-btn').onclick  = () => openItemModal(t.id);
  document.getElementById('details-delete-btn').textContent = 'Delete';
  document.getElementById('details-delete-btn').onclick = () => deleteTemplate(t.id);
}

function showInstanceDetails(instanceId) {
  const inst = state.instances[instanceId];
  if (!inst) return;
  const t = state.db[inst.templateId];
  if (!t) return;

  state.selected = { type: 'instance', id: instanceId };
  populateDetailsPanel(t, inst);
  switchTab('details');

  document.getElementById('details-place-btn').classList.add('hidden');
  document.getElementById('details-stash-btn').onclick = () => {
    if (inst.row !== null && inst.row !== undefined) {
      unequipInstance(instanceId);
      removeFromGrid(instanceId);
      inst.row = null;
      inst.col = null;
      renderAllItems();
      updateWeightDisplay();
      debouncedSync();
    }
    switchTab('browse');
  };
  document.getElementById('details-edit-btn').onclick = () => openItemModal(t.id);
  document.getElementById('details-delete-btn').textContent = 'Remove';
  document.getElementById('details-delete-btn').onclick = () => {
    removeInstance(instanceId);
    document.getElementById('details-content').classList.add('hidden');
    document.getElementById('details-placeholder').classList.remove('hidden');
  };
}

function populateDetailsPanel(t, inst) {
  const color = RARITY_META[t.rarity]?.color ?? '#888';
  const shape = inst ? getRotatedShape(t.shape, inst.rotation ?? 0) : t.shape;
  const weight = t.stackable
    ? (inst ? `${Math.round(t.weightEach * (inst.stackCount ?? 1) * 100) / 100} lb (×${inst.stackCount ?? 1})` : `${t.weightEach} lb each`)
    : `${shapeWeight(shape)} lb`;

  document.getElementById('details-placeholder').classList.add('hidden');
  document.getElementById('details-content').classList.remove('hidden');

  document.getElementById('details-name').textContent = t.name;
  const badge = document.getElementById('details-rarity-badge');
  badge.textContent = RARITY_META[t.rarity]?.label;
  badge.style.background = color + '33';
  badge.style.color = color;
  badge.style.border = `1px solid ${color}66`;

  renderDetailsShapePreview(shape, color);

  const imgEl = document.getElementById('details-image');
  if (t.image) { imgEl.src = t.image; imgEl.classList.remove('hidden'); }
  else imgEl.classList.add('hidden');

  document.getElementById('details-weight').textContent = weight;
  document.getElementById('details-cost').textContent =
    t.cost ? `${t.cost.toLocaleString()} gp` : 'Priceless';

  const stackRow = document.getElementById('details-stack-row');
  if (t.stackable) {
    stackRow.classList.remove('hidden');
    document.getElementById('details-stack').textContent = inst
      ? `${inst.stackCount ?? 1} / ${computeMaxStack(t.weightEach)}`
      : `×${computeMaxStack(t.weightEach)} max`;
  } else {
    stackRow.classList.add('hidden');
  }

  const damageRow = document.getElementById('details-damage-row');
  if (t.damage) {
    damageRow.classList.remove('hidden');
    document.getElementById('details-damage').textContent =
      `${t.damage}${t.damageType ? ' ' + t.damageType : ''}`;
  } else {
    damageRow.classList.add('hidden');
  }

  document.getElementById('details-attunement-row').classList.toggle('hidden', !t.attunement);

  const tagsEl = document.getElementById('details-tags');
  tagsEl.innerHTML = '';
  t.tags.forEach(tag => {
    const pill = document.createElement('span');
    pill.className = 'tag-pill';
    pill.textContent = tag;
    tagsEl.appendChild(pill);
  });

  document.getElementById('details-desc').textContent = t.description || '';
}

function renderDetailsShapePreview(shape, color) {
  const preview = document.getElementById('details-shape-preview');
  const norm = normalizeShape(shape);
  const { rows, cols } = shapeDims(norm);
  preview.style.gridTemplateColumns = `repeat(${cols}, 20px)`;
  preview.style.gridTemplateRows    = `repeat(${rows}, 20px)`;
  preview.innerHTML = '';
  norm.forEach(row => row.forEach(v => {
    const cell = document.createElement('div');
    cell.className = 'prev-cell ' + (v ? 'filled' : 'empty');
    if (v) { cell.style.background = color + '55'; cell.style.borderColor = color; }
    preview.appendChild(cell);
  }));
}

// =============================================================================
// RENDERING — HEADER WEIGHT STATS
// =============================================================================
function updateWeightDisplay() {
  const str = state.character.strength;
  const normal = str * 15;
  const enc = str * 30;
  const heavy = str * 45;
  const carried = Math.round(totalCarriedWeight() * 100) / 100;

  document.getElementById('weight-carried').textContent = `${carried} lb carried`;
  document.getElementById('weight-limits').textContent  = `${normal} / ${enc} / ${heavy} lb`;

  // Status
  const statusEl = document.getElementById('encumbrance-status');
  if (carried > enc) {
    statusEl.textContent = 'Heavily Encumbered'; statusEl.className = 'heavy';
  } else if (carried > normal) {
    statusEl.textContent = 'Encumbered'; statusEl.className = 'enc';
  } else {
    statusEl.textContent = ''; statusEl.className = '';
  }

  // Dynamic bar max: expands from normal → enc → heavy as thresholds are crossed
  const barMax = carried > enc ? heavy : (carried > normal ? enc : normal);
  const pct    = Math.min(carried / barMax, 1) * 100;

  const fillEl = document.getElementById('weight-bar-fill');
  fillEl.style.width = pct + '%';
  // Keep gradient colors anchored to absolute weights by scaling backgroundSize
  // so the color at the fill edge always reflects the real encumbrance level
  fillEl.style.backgroundSize = (heavy / barMax * 100).toFixed(2) + '% 100%';

  // Enc marker always visible at the normal threshold
  document.getElementById('weight-enc-marker').style.left = (normal / barMax * 100) + '%';

  // Heavy marker only appears once the bar has expanded into the heavy zone
  const heavyMarkerEl = document.getElementById('weight-heavy-marker');
  heavyMarkerEl.style.left = (enc / barMax * 100) + '%';
  heavyMarkerEl.style.display = barMax === heavy ? '' : 'none';

  // Header
  document.getElementById('char-name-display').textContent = state.character.name;
  document.getElementById('char-str-display').textContent  = `STR ${str}`;
}

// =============================================================================
// DRAG GHOST
// =============================================================================
const ghostEl = document.getElementById('drag-ghost');
let ghostShape = null;
let ghostRarity = 'common';
let lastPointerX = 0, lastPointerY = 0;

// Track pointer position globally so keyboard handlers can reference it
document.addEventListener('pointermove', e => { lastPointerX = e.clientX; lastPointerY = e.clientY; }, { passive: true });

// Rebuild the ghost element's shape DOM (cheap to skip when shape unchanged)
let ghostShapeKey = '';
function initGhostEl(shape, rarity) {
  const key = rarity + '|' + shape.map(r => r.join('')).join('|');
  if (key === ghostShapeKey) return; // Already built
  ghostShapeKey = key;
  ghostShape = shape;
  ghostRarity = rarity;
  const dims = shapeDims(shape);
  ghostEl.style.gridTemplateColumns = `repeat(${dims.cols}, ${CELL}px)`;
  ghostEl.style.width  = dims.cols * CELL + 'px';
  ghostEl.style.height = dims.rows * CELL + 'px';
  ghostEl.className = `rarity-${rarity}`;
  ghostEl.innerHTML = '';

  const outerBorder = 'rgba(255,255,255,0.7)';
  const innerBorder = 'rgba(255,255,255,0.08)';

  shape.forEach((row, r) => row.forEach((v, c) => {
    const cell = document.createElement('div');
    if (v) {
      cell.className = 'item-cell filled';
      const hasTop    = r > 0 && shape[r-1][c] === 1;
      const hasBottom = r < shape.length - 1 && shape[r+1][c] === 1;
      const hasLeft   = c > 0 && shape[r][c-1] === 1;
      const hasRight  = c < shape[r].length - 1 && shape[r][c+1] === 1;
      cell.style.borderTopColor    = hasTop    ? innerBorder : outerBorder;
      cell.style.borderBottomColor = hasBottom ? innerBorder : outerBorder;
      cell.style.borderLeftColor   = hasLeft   ? innerBorder : outerBorder;
      cell.style.borderRightColor  = hasRight  ? innerBorder : outerBorder;
    } else {
      cell.className = 'item-cell empty';
    }
    ghostEl.appendChild(cell);
  }));
}

function showGhost(shape, rarity, x, y) {
  initGhostEl(shape, rarity);
  ghostEl.style.display = ''; // ensure visible (clears any setGhostVisibility(false))
  ghostEl.style.left = x + 'px';
  ghostEl.style.top  = y + 'px';
}

function moveGhost(x, y, valid) {
  ghostEl.style.left = x + 'px';
  ghostEl.style.top  = y + 'px';
  ghostEl.classList.remove('valid', 'invalid');
  if (valid === true)  ghostEl.classList.add('valid');
  if (valid === false) ghostEl.classList.add('invalid');
}

function hideGhost() {
  ghostEl.className = 'hidden';
  ghostEl.style.display = ''; // reset any inline visibility set by setGhostVisibility
  ghostShape = null;
  ghostShapeKey = '';
}

function getGhostScreenPos(anchorRow, anchorCol, gridRow, gridCol) {
  const rect = gridEl.getBoundingClientRect();
  return {
    x: rect.left + gridCol * CELL,
    y: rect.top  + gridRow * CELL,
  };
}

// Show/hide ghost without clearing its shape state (use before/after grid area)
function setGhostVisibility(visible) {
  ghostEl.style.display = visible ? '' : 'none';
}

// Find the equip slot card at a screen point using bounding-rect checks.
// Avoids elementFromPoint which can return the ghost div even with pointer-events:none.
function getEquipCardAtPoint(x, y) {
  for (const card of document.querySelectorAll('.eq-card')) {
    const r = card.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return card;
  }
  return null;
}

// Highlight / unhighlight cells
let highlightedCells = [];
function highlightCells(shape, gridRow, gridCol, valid) {
  clearHighlights();
  const cls = valid ? 'highlight-valid' : 'highlight-invalid';
  getShapeCells(shape, gridRow, gridCol).forEach(({ row, col }) => {
    const cell = gridEl.querySelector(`.grid-cell[data-row="${row}"][data-col="${col}"]`);
    if (cell) { cell.classList.add(cls); highlightedCells.push(cell); }
  });
}
function clearHighlights() {
  highlightedCells.forEach(c => c.classList.remove('highlight-valid', 'highlight-invalid'));
  highlightedCells = [];
}

// =============================================================================
// INTERACTION — PLACING MODE
// =============================================================================
function startPlacing(templateId) {
  if (isReadOnly()) return;
  cancelPlacing();
  state.mode = 'placing';
  state.placing = { templateId, rotation: 0 };
  document.body.style.cursor = 'crosshair';
  document.body.style.userSelect = 'none';
  renderItemList();
  showTemplateDetails(templateId);

  // Attach document-level handlers
  document.addEventListener('mousemove', onPlacingMouseMove);
  document.addEventListener('click', onPlacingClick, true);
  document.addEventListener('contextmenu', onPlacingRightClick, true);
}

function cancelPlacing() {
  if (state.mode !== 'placing') return;
  state.mode = 'idle';
  state.placing = null;
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
  hideGhost();
  clearHighlights();
  document.removeEventListener('mousemove', onPlacingMouseMove);
  document.removeEventListener('click', onPlacingClick, true);
  document.removeEventListener('contextmenu', onPlacingRightClick, true);
  renderItemList();
  renderStash();
}

function addToStash(templateId) {
  if (isReadOnly()) return;
  const t = state.db[templateId];
  if (!t) return;
  const id = newId();
  state.instances[id] = { id, templateId, rotation: 0, row: null, col: null, stackCount: 1 };
  renderStash();
  updateWeightDisplay();
  debouncedSync();
}

function startPlacingFromStash(instanceId) {
  if (isReadOnly()) return;
  const inst = state.instances[instanceId];
  if (!inst) return;
  cancelPlacing();
  state.mode = 'placing';
  state.placing = { templateId: inst.templateId, rotation: inst.rotation ?? 0, instanceId };
  document.body.style.cursor = 'crosshair';
  document.body.style.userSelect = 'none';
  renderStash();
  document.addEventListener('mousemove', onPlacingMouseMove);
  document.addEventListener('click', onPlacingClick, true);
  document.addEventListener('contextmenu', onPlacingRightClick, true);
}

function stashAllItems() {
  const placed = Object.values(state.instances).filter(i => i.row !== null && i.row !== undefined);
  if (!placed.length) return;
  placed.forEach(inst => {
    removeFromGrid(inst.id);
    inst.row = null;
    inst.col = null;
  });
  renderAllItems();
  updateWeightDisplay();
  debouncedSync();
}

function renderStash() {
  const section = document.getElementById('stash-section');
  const list    = document.getElementById('stash-list');
  if (!section || !list) return;

  const unplaced = Object.values(state.instances).filter(i => i.row === null || i.row === undefined);
  const hasPlaced = Object.values(state.instances).some(i => i.row !== null && i.row !== undefined);

  // Always show when there are unplaced items; also show when there are placed items (for Stash All button)
  section.classList.toggle('hidden', unplaced.length === 0 && !hasPlaced);

  const countEl = document.getElementById('stash-count');
  countEl.textContent = unplaced.length;
  countEl.classList.toggle('hidden', unplaced.length === 0);

  document.getElementById('stash-all-btn').disabled = !hasPlaced;
  document.getElementById('stash-delete-all-btn').classList.toggle('hidden', unplaced.length === 0);

  list.innerHTML = '';
  unplaced.forEach(inst => {
    const t = state.db[inst.templateId];
    if (!t) return;
    const color = RARITY_META[t.rarity]?.color ?? '#888';
    const isActive = state.placing?.instanceId === inst.id;

    const card = document.createElement('div');
    card.className = 'stash-card' + (isActive ? ' placing' : '');
    card.title = 'Click to place';

    const shape = normalizeShape(t.stackable ? [[1]] : t.shape);
    const { rows, cols } = shapeDims(shape);
    const preview = document.createElement('div');
    preview.className = 'stash-shape';
    preview.style.gridTemplateColumns = `repeat(${cols}, 10px)`;
    preview.style.gridTemplateRows    = `repeat(${rows}, 10px)`;
    shape.forEach(row => row.forEach(v => {
      const c = document.createElement('div');
      c.className = 'stash-cell' + (v ? ' filled' : '');
      if (v) c.style.background = color;
      preview.appendChild(c);
    }));

    const nameEl = document.createElement('span');
    nameEl.className = 'stash-name';
    nameEl.textContent = t.name + (inst.stackCount > 1 ? ` ×${inst.stackCount}` : '');

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn-icon danger stash-remove';
    removeBtn.title = 'Remove';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', e => {
      e.stopPropagation();
      if (state.placing?.instanceId === inst.id) cancelPlacing();
      delete state.instances[inst.id];
      renderStash();
      updateWeightDisplay();
      debouncedSync();
    });

    card.appendChild(preview);
    card.appendChild(nameEl);
    card.appendChild(removeBtn);
    card.addEventListener('pointerdown', e => {
      if (e.target === removeBtn || removeBtn.contains(e.target)) return;
      onStashPointerDown(e, inst.id);
    });
    card.addEventListener('click', e => {
      if (e.target === removeBtn || removeBtn.contains(e.target)) return;
      if (state.mode === 'idle') showInstanceDetails(inst.id);
    });
    list.appendChild(card);
  });
}

function onPlacingMouseMove(e) {
  if (state.mode !== 'placing') return;
  const { templateId, rotation } = state.placing;
  const t = state.db[templateId];
  if (!t) return;

  const shape = getRotatedShape(t.shape, rotation);
  const dims  = shapeDims(shape);
  initGhostEl(shape, t.rarity); // No-op if shape/rarity unchanged

  const pos = cursorToGridPos(e.clientX, e.clientY, 0, 0);

  if (pos) {
    const { row: gr, col: gc } = pos;
    const screenPos = getGhostScreenPos(0, 0, gr, gc);
    const valid = canPlace(shape, gr, gc);
    setGhostVisibility(true);
    moveGhost(screenPos.x, screenPos.y, valid);
    highlightCells(shape, gr, gc, valid);
  } else {
    setGhostVisibility(false);
    clearHighlights();
  }
}

function onPlacingClick(e) {
  if (state.mode !== 'placing') return;
  const { templateId, rotation } = state.placing;
  const t = state.db[templateId];
  if (!t) { cancelPlacing(); return; }

  const pos = cursorToGridPos(e.clientX, e.clientY, 0, 0);
  if (!pos) { cancelPlacing(); return; }

  const shape = getRotatedShape(t.shape, rotation);
  if (!canPlace(shape, pos.row, pos.col)) return; // Invalid — stay in placing mode

  e.stopPropagation();

  if (t.stackable) {
    const max = computeMaxStack(t.weightEach);
    openStackModal(max, count => finalizePlacement(t, shape, rotation, pos.row, pos.col, count));
    cancelPlacing();
  } else {
    finalizePlacement(t, shape, rotation, pos.row, pos.col, 1);
    // Stay in placing mode for quick multi-placement
  }
}

function onPlacingRightClick(e) {
  e.preventDefault();
  e.stopPropagation();
  cancelPlacing();
}

function finalizePlacement(template, shape, rotation, row, col, stackCount) {
  let id;
  if (state.placing?.instanceId) {
    // Placing a stash item — update existing instance
    id = state.placing.instanceId;
    state.instances[id].rotation = rotation;
    state.instances[id].row = row;
    state.instances[id].col = col;
  } else {
    id = newId();
    state.instances[id] = { id, templateId: template.id, rotation, row, col, stackCount };
  }
  placeOnGrid(id, shape, row, col);
  renderPlacedItem(state.instances[id]);
  renderStash();
  updateWeightDisplay();
  debouncedSync();
}

// =============================================================================
// INTERACTION — DRAGGING PLACED ITEMS
// =============================================================================
let dragPointerCapture = null;
let dragHoverSlotId = null; // slot id the drag ghost is currently hovering over

const DRAG_THRESHOLD = 6; // px of movement before a press becomes a drag
let dragIntent = null;    // pending drag: waiting to see if pointer moves enough

function onItemPointerDown(e) {
  if (e.button !== 0) return;
  if (isReadOnly()) return;
  clearTooltip();
  if (state.mode === 'placing') { cancelPlacing(); return; }

  const el = e.currentTarget;
  const instanceId = el.dataset.instanceId;
  const inst = state.instances[instanceId];
  if (!inst) return;

  const template = state.db[inst.templateId];
  if (!template) return;

  const shape = getRotatedShape(template.shape, inst.rotation);
  const dims  = shapeDims(shape);

  const itemRect  = el.getBoundingClientRect();
  const localX    = e.clientX - itemRect.left;
  const localY    = e.clientY - itemRect.top;
  const anchorCol = Math.floor(localX / CELL);
  const anchorRow = Math.floor(localY / CELL);

  if (!shape[anchorRow]?.[anchorCol]) return;

  // Record intent but don't start the drag yet — wait for movement threshold
  dragIntent = {
    instanceId, el,
    anchorRow: Math.min(anchorRow, dims.rows - 1),
    anchorCol: Math.min(anchorCol, dims.cols - 1),
    startX: e.clientX, startY: e.clientY,
  };

  document.addEventListener('pointermove', onDragIntentMove);
  document.addEventListener('pointerup', onDragIntentUp);
  e.preventDefault();
}

function onDragIntentMove(e) {
  if (!dragIntent) return;
  const dx = e.clientX - dragIntent.startX;
  const dy = e.clientY - dragIntent.startY;
  if (dx * dx + dy * dy < DRAG_THRESHOLD * DRAG_THRESHOLD) return;

  // Movement threshold crossed — activate the drag
  document.removeEventListener('pointermove', onDragIntentMove);
  document.removeEventListener('pointerup', onDragIntentUp);
  const intent = dragIntent;
  dragIntent = null;
  activateItemDrag(intent, e);
}

function onDragIntentUp(e) {
  // Pointer released before threshold — treat as a click
  document.removeEventListener('pointermove', onDragIntentMove);
  document.removeEventListener('pointerup', onDragIntentUp);
  if (!dragIntent) return;
  const { instanceId } = dragIntent;
  dragIntent = null;
  const inst = state.instances[instanceId];
  if (inst) showInstanceDetails(instanceId);
}

function activateItemDrag(intent, e) {
  const { instanceId, el, anchorRow, anchorCol } = intent;
  const inst = state.instances[instanceId];
  if (!inst) return;
  const template = state.db[inst.templateId];
  if (!template) return;
  const shape = getRotatedShape(template.shape, inst.rotation);

  state.mode = 'dragging';
  state.dragging = {
    instanceId, anchorRow, anchorCol,
    origRow: inst.row, origCol: inst.col, origRotation: inst.rotation,
  };

  el.classList.add('dragging-source');
  removeFromGrid(instanceId);

  const initX = e.clientX - anchorCol * CELL;
  const initY = e.clientY - anchorRow * CELL;
  showGhost(shape, template.rarity, initX, initY);

  document.body.style.userSelect = 'none';
  document.addEventListener('pointermove', onDragMove);
  document.addEventListener('pointerup', onDragEnd);
}

function onStashPointerDown(e, instanceId) {
  if (e.button !== 0) return;
  if (isReadOnly()) return;
  clearTooltip();
  if (state.mode === 'placing') { cancelPlacing(); return; }

  const inst = state.instances[instanceId];
  if (!inst) return;
  const template = state.db[inst.templateId];
  if (!template) return;

  const shape = getRotatedShape(template.shape, inst.rotation ?? 0);

  state.mode = 'dragging';
  state.dragging = {
    instanceId,
    anchorRow: 0,
    anchorCol: 0,
    origRow: null,   // null = came from stash, not the grid
    origCol: null,
    origRotation: inst.rotation ?? 0,
  };

  showGhost(shape, template.rarity, e.clientX, e.clientY);
  document.body.style.userSelect = 'none';
  document.addEventListener('pointermove', onDragMove);
  document.addEventListener('pointerup', onDragEnd);
  e.preventDefault();
}

function onDragMove(e) {
  if (state.mode !== 'dragging') return;
  const drag = state.dragging;
  const inst = state.instances[drag.instanceId];
  const template = state.db[inst.templateId];
  const shape = getRotatedShape(template.shape, inst.rotation);

  const pos = cursorToGridPos(e.clientX, e.clientY, drag.anchorRow, drag.anchorCol);
  if (pos) {
    const { row: gr, col: gc } = pos;
    const screenPos = getGhostScreenPos(0, 0, gr, gc);
    const valid = canPlace(shape, gr, gc, drag.instanceId);
    setGhostVisibility(true);
    moveGhost(screenPos.x, screenPos.y, valid);
    highlightCells(shape, gr, gc, valid);
  } else {
    setGhostVisibility(false);
    clearHighlights();
  }

  // Highlight equip slot using bounding-rect check; track hovered slot for onDragEnd
  document.querySelectorAll('.eq-card.drag-hover').forEach(c => c.classList.remove('drag-hover'));
  dragHoverSlotId = null;
  const equipCard = getEquipCardAtPoint(e.clientX, e.clientY);
  if (equipCard) {
    const slot = getSlotDef(equipCard.dataset.slotId);
    if (slot && !(slot.attuneOnly && !template.attunement)) {
      equipCard.classList.add('drag-hover');
      dragHoverSlotId = slot.id;
    }
  }
}

function onDragEnd(e) {
  if (state.mode !== 'dragging') return;
  document.removeEventListener('pointermove', onDragMove);
  document.removeEventListener('pointerup', onDragEnd);
  document.body.style.userSelect = '';

  const drag = state.dragging;
  const inst = state.instances[drag.instanceId];
  const template = state.db[inst.templateId];
  const shape = getRotatedShape(template.shape, inst.rotation);

  let placed = false;

  // Try to drop onto the equip slot that was highlighted during the drag.
  // Using the tracked dragHoverSlotId is more reliable than re-checking at pointerup
  // because pointer coordinates can be stale or imprecise at release time.
  if (dragHoverSlotId) {
    // Restore grid position first (skip if dragged from stash — item has no grid pos)
    if (drag.origRow !== null && drag.origRow !== undefined) {
      inst.row = drag.origRow;
      inst.col = drag.origCol;
      inst.rotation = drag.origRotation;
      const restoreShape = getRotatedShape(template.shape, inst.rotation);
      placeOnGrid(inst.id, restoreShape, inst.row, inst.col);
    }
    equipItem(drag.instanceId, dragHoverSlotId);
    placed = true;
    dragHoverSlotId = null;
  }

  // Otherwise try to drop on the inventory grid
  if (!placed) {
    const pos = cursorToGridPos(e.clientX, e.clientY, drag.anchorRow, drag.anchorCol);
    if (pos) {
      const { row: gr, col: gc } = pos;
      if (canPlace(shape, gr, gc, drag.instanceId)) {
        inst.row = gr;
        inst.col = gc;
        placeOnGrid(inst.id, shape, gr, gc);
        placed = true;
      }
    }
  }

  if (!placed) {
    // Restore original position; if dragged from stash, leave unplaced (row stays null)
    inst.row = drag.origRow;
    inst.col = drag.origCol;
    inst.rotation = drag.origRotation;
    if (inst.row !== null && inst.row !== undefined) {
      const restoreShape = getRotatedShape(template.shape, inst.rotation);
      placeOnGrid(inst.id, restoreShape, inst.row, inst.col);
    }
  }

  state.mode = 'idle';
  state.dragging = null;
  dragHoverSlotId = null;
  setGhostVisibility(true);
  hideGhost();
  clearHighlights();
  document.querySelectorAll('.eq-card.drag-hover').forEach(c => c.classList.remove('drag-hover'));
  renderAllItems();
  updateWeightDisplay();
  debouncedSync();
}

// Convert cursor position to grid row/col, accounting for anchor offset.
// Returns null when cursor is not over the visible grid scroll area.
function cursorToGridPos(clientX, clientY, anchorRow, anchorCol) {
  const scrollEl = document.getElementById('grid-scroll');
  const scrollRect = scrollEl.getBoundingClientRect();
  if (clientX < scrollRect.left || clientX > scrollRect.right ||
      clientY < scrollRect.top  || clientY > scrollRect.bottom) {
    return null;
  }
  const rect = gridEl.getBoundingClientRect();
  const col = Math.floor((clientX - rect.left) / CELL) - anchorCol;
  const row = Math.floor((clientY - rect.top)  / CELL) - anchorRow;
  return { row, col };
}

// =============================================================================
// INTERACTION — ROTATE (R key)
// =============================================================================
document.addEventListener('keydown', e => {
  if (e.target.matches('input, textarea, select')) return;

  if (e.key === 'r' || e.key === 'R') {
    if (state.mode === 'placing') {
      state.placing.rotation = (state.placing.rotation + 1) % 4;
      ghostShapeKey = ''; // Force ghost rebuild on next mousemove
      // Immediately update ghost at last known pointer position
      const pt = state.placing;
      const tp = state.db[pt.templateId];
      if (tp) {
        const ns = getRotatedShape(tp.shape, pt.rotation);
        const pp = cursorToGridPos(lastPointerX, lastPointerY, 0, 0);
        if (pp) {
          const sp = getGhostScreenPos(0, 0, pp.row, pp.col);
          const vv = canPlace(ns, pp.row, pp.col);
          showGhost(ns, tp.rarity, sp.x, sp.y);
          moveGhost(sp.x, sp.y, vv);
          highlightCells(ns, pp.row, pp.col, vv);
        }
        // If cursor is outside grid, leave ghost hidden — next mousemove will show it
      }
      return;
    }
    if (state.mode === 'dragging') {
      const drag = state.dragging;
      const inst = state.instances[drag.instanceId];
      const template = state.db[inst.templateId];
      const { rows, cols } = shapeDims(getRotatedShape(template.shape, inst.rotation));
      const { row: nr, col: nc } = rotateAnchorCW(drag.anchorRow, drag.anchorCol, rows, cols);
      drag.anchorRow = nr;
      drag.anchorCol = nc;
      inst.rotation = (inst.rotation + 1) % 4;
      // Rebuild ghost at current pointer position
      const newShape = getRotatedShape(template.shape, inst.rotation);
      ghostShapeKey = ''; // Force rebuild
      const newX = lastPointerX - drag.anchorCol * CELL;
      const newY = lastPointerY - drag.anchorRow * CELL;
      showGhost(newShape, template.rarity, newX, newY);
      // Re-run drag move logic to update highlights
      const pos2 = cursorToGridPos(lastPointerX, lastPointerY, drag.anchorRow, drag.anchorCol);
      if (pos2) {
        const sp = getGhostScreenPos(0, 0, pos2.row, pos2.col);
        const v = canPlace(newShape, pos2.row, pos2.col, drag.instanceId);
        moveGhost(sp.x, sp.y, v);
        highlightCells(newShape, pos2.row, pos2.col, v);
      }
      return;
    }
  }

  if (e.key === 'Escape') {
    cancelPlacing();
    if (state.mode === 'dragging') {
      // Restore
      const drag = state.dragging;
      const inst = state.instances[drag.instanceId];
      const template = state.db[inst.templateId];
      inst.rotation = drag.origRotation;
      const shape = getRotatedShape(template.shape, inst.rotation);
      placeOnGrid(inst.id, shape, drag.origRow, drag.origCol);
      inst.row = drag.origRow;
      inst.col = drag.origCol;
      document.removeEventListener('pointermove', onDragMove);
      document.removeEventListener('pointerup', onDragEnd);
      state.mode = 'idle';
      state.dragging = null;
      hideGhost();
      clearHighlights();
      renderAllItems();
    }
  }
});

// =============================================================================
// INTERACTION — ITEM CLICKS & CONTEXT MENU
// =============================================================================

function onItemContextMenu(e) {
  e.preventDefault();
  e.stopPropagation();
  if (isReadOnly()) return;
  const instanceId = e.currentTarget.dataset.instanceId;
  showInstanceContextMenu(instanceId, e.clientX, e.clientY);
}

// Close context menu on any click
document.addEventListener('click', () => hideContextMenu());
document.addEventListener('contextmenu', () => {});

const ctxMenu = document.getElementById('context-menu');
let ctxInstanceId = null;

function showInstanceContextMenu(instanceId, x, y) {
  ctxInstanceId = instanceId;
  const equipped = !!getEquippedSlot(instanceId);
  document.getElementById('ctx-equip').style.display     = equipped ? 'none' : '';
  document.getElementById('ctx-unequip').style.display   = equipped ? '' : 'none';
  document.getElementById('ctx-duplicate').style.display = '';
  document.getElementById('ctx-stash').style.display     = '';
  ctxMenu.style.left = x + 'px';
  ctxMenu.style.top  = y + 'px';
  ctxMenu.classList.remove('hidden');
}

function showTemplateContextMenu(templateId, x, y) {
  // Inline: just show edit/delete for templates
  ctxInstanceId = null;
  ctxMenu.style.left = x + 'px';
  ctxMenu.style.top  = y + 'px';
  document.getElementById('ctx-rotate').style.display = 'none';
  ctxMenu.classList.remove('hidden');
  document.getElementById('ctx-edit').onclick = () => { openItemModal(templateId); hideContextMenu(); };
  document.getElementById('ctx-remove').onclick = () => { deleteTemplate(templateId); hideContextMenu(); };
}

function hideContextMenu() {
  ctxMenu.classList.add('hidden');
  document.getElementById('ctx-rotate').style.display    = '';
  document.getElementById('ctx-equip').style.display     = '';
  document.getElementById('ctx-unequip').style.display   = 'none';
  document.getElementById('ctx-duplicate').style.display = 'none';
  document.getElementById('ctx-stash').style.display     = 'none';
}

document.getElementById('ctx-rotate').addEventListener('click', () => {
  if (!ctxInstanceId) return;
  rotateInstance(ctxInstanceId);
  hideContextMenu();
});
document.getElementById('ctx-equip').addEventListener('click', () => {
  if (!ctxInstanceId) return;
  openEquipModal(ctxInstanceId);
  hideContextMenu();
});
document.getElementById('ctx-unequip').addEventListener('click', () => {
  if (!ctxInstanceId) return;
  unequipInstance(ctxInstanceId);
  hideContextMenu();
});
document.getElementById('ctx-edit').addEventListener('click', () => {
  if (!ctxInstanceId) return;
  const inst = state.instances[ctxInstanceId];
  if (inst) openItemModal(inst.templateId);
  hideContextMenu();
});
document.getElementById('ctx-duplicate').addEventListener('click', () => {
  if (!ctxInstanceId) return;
  const inst = state.instances[ctxInstanceId];
  if (inst) startPlacing(inst.templateId);
  hideContextMenu();
});
document.getElementById('ctx-stash').addEventListener('click', () => {
  if (!ctxInstanceId) return;
  const inst = state.instances[ctxInstanceId];
  if (inst) {
    unequipInstance(ctxInstanceId);
    removeFromGrid(ctxInstanceId);
    inst.row = null;
    inst.col = null;
    renderAllItems();
    updateWeightDisplay();
    debouncedSync();
  }
  hideContextMenu();
});
document.getElementById('ctx-remove').addEventListener('click', () => {
  if (!ctxInstanceId) return;
  removeInstance(ctxInstanceId);
  hideContextMenu();
});

function rotateInstance(instanceId) {
  const inst = state.instances[instanceId];
  if (!inst) return;
  const template = state.db[inst.templateId];
  const newRot = (inst.rotation + 1) % 4;
  const newShape = getRotatedShape(template.shape, newRot);
  if (canPlace(newShape, inst.row, inst.col, instanceId)) {
    removeFromGrid(instanceId);
    inst.rotation = newRot;
    placeOnGrid(instanceId, newShape, inst.row, inst.col);
    renderAllItems();
    debouncedSync();
  }
}

function removeInstance(instanceId) {
  removeFromGrid(instanceId);
  delete state.instances[instanceId];
  renderAllItems();
  updateWeightDisplay();
  debouncedSync();
}

function deleteTemplate(templateId) {
  if (!confirm(`Delete "${state.db[templateId]?.name}" from the item database? Placed items will remain.`)) return;
  delete state.db[templateId];
  renderItemList();
  document.getElementById('details-content').classList.add('hidden');
  document.getElementById('details-placeholder').classList.remove('hidden');
}

// =============================================================================
// TABS
// =============================================================================
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});
function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.toggle('active', p.id === `tab-${name}`));
}

// =============================================================================
// FILTER CONTROLS
// =============================================================================
document.getElementById('item-search').addEventListener('input', renderItemList);
document.getElementById('rarity-filter').addEventListener('change', renderItemList);
document.getElementById('tag-filter').addEventListener('change', renderItemList);

// =============================================================================
// CHARACTER MODAL
// =============================================================================
document.getElementById('edit-character-btn').addEventListener('click', openCharModal);

function openCharModal() {
  document.getElementById('char-name-input').value = state.character.name;
  document.getElementById('char-str-input').value  = state.character.strength;
  updateCharModalNote();
  showModal('character-modal');
}

function updateCharModalNote() {
  const str = parseInt(document.getElementById('char-str-input').value) || 10;
  document.getElementById('modal-capacity-normal').textContent = str * 15 + ' slots';
  document.getElementById('modal-capacity-total').textContent  = str * 45 + ' slots';
}
document.getElementById('char-str-input').addEventListener('input', updateCharModalNote);

document.getElementById('save-char-btn').addEventListener('click', () => {
  const name = document.getElementById('char-name-input').value.trim() || 'Unnamed Hero';
  const str  = Math.max(1, Math.min(30, parseInt(document.getElementById('char-str-input').value) || 10));
  state.character.name = name;
  state.character.strength = str;
  rebuildGrid();
  hideModal('character-modal');
  debouncedSync();
});

function rebuildGrid() {
  initGrid();
  buildGrid();
  // Re-place all instances
  Object.values(state.instances).forEach(inst => {
    if (inst.row === null || inst.row === undefined) return; // stash item
    const t = state.db[inst.templateId];
    if (!t) return;
    const shape = getRotatedShape(t.shape, inst.rotation);
    if (canPlace(shape, inst.row, inst.col)) placeOnGrid(inst.id, shape, inst.row, inst.col);
  });
  renderAllItems();
  updateWeightDisplay();
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
  document.getElementById('f-cost').value    = t?.cost ?? 0;
  document.getElementById('f-tags').value    = t?.tags.join(', ') ?? '';
  document.getElementById('f-image').value        = t?.image ?? '';
  document.getElementById('f-damage').value       = t?.damage ?? '';
  document.getElementById('f-damage-type').value  = t?.damageType ?? '';
  document.getElementById('f-attunement').checked = t?.attunement ?? false;

  const stackable = t?.stackable ?? false;
  document.getElementById('f-stackable').checked = stackable;
  document.getElementById('f-weight-each').value = t?.weightEach ?? 0.1;
  document.getElementById('stackable-fields').classList.toggle('hidden', !stackable);

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

document.getElementById('f-weight-each').addEventListener('input', updateMaxStackDisplay);
function updateMaxStackDisplay() {
  const w = parseFloat(document.getElementById('f-weight-each').value) || 0.1;
  document.getElementById('f-max-stack-display').textContent = computeMaxStack(w);
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
  const weightEach = parseFloat(document.getElementById('f-weight-each').value) || 0.1;

  if (stackable) {
    const max = computeMaxStack(weightEach);
    if (!Number.isInteger(1 / weightEach) || max <= 0) {
      alert('Weight must divide evenly into 1 lb (e.g. 0.5, 0.25, 0.1, 0.05, 0.02).');
      return;
    }
  }

  const id = state.editingItemId ?? newTemplateId();
  const tagsRaw = document.getElementById('f-tags').value;
  const tags = tagsRaw.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);

  state.db[id] = {
    id,
    name,
    rarity:      document.getElementById('f-rarity').value,
    description: document.getElementById('f-desc').value.trim(),
    cost:        parseFloat(document.getElementById('f-cost').value) || 0,
    tags,
    image:       document.getElementById('f-image').value.trim(),
    damage:      document.getElementById('f-damage').value.trim() || undefined,
    damageType:  document.getElementById('f-damage-type').value || undefined,
    attunement:  document.getElementById('f-attunement').checked || undefined,
    stackable,
    weightEach:  stackable ? weightEach : undefined,
    shape:       stackable ? [[1]] : state.editorShape.map(r => [...r]),
  };

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
  input.value = max;
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

// =============================================================================
// HELPERS
// =============================================================================
function computeMaxStack(weightEach) {
  return Math.round(1 / weightEach);
}

// =============================================================================
// PERSISTENCE
// =============================================================================
const SAVE_KEY = 'dnd_inventory_v1';

document.getElementById('save-btn').addEventListener('click', saveState);
document.getElementById('load-btn').addEventListener('click', loadState);
document.getElementById('stash-all-btn').addEventListener('click', stashAllItems);
document.getElementById('stash-delete-all-btn').addEventListener('click', () => {
  const unplaced = Object.values(state.instances).filter(i => i.row === null || i.row === undefined);
  if (!confirm(`Delete all ${unplaced.length} stashed item${unplaced.length > 1 ? 's' : ''}? This cannot be undone.`)) return;
  if (state.placing?.instanceId && state.instances[state.placing.instanceId]?.row === null) cancelPlacing();
  unplaced.forEach(inst => { delete state.instances[inst.id]; });
  renderStash();
  updateWeightDisplay();
  debouncedSync();
});

function autoSave() {
  const data = {
    character:   state.character,
    instances:   state.instances,
    equipped:    state.equipped,
    equipLayout: state.equipLayout,
    db: Object.fromEntries(
      Object.entries(state.db).filter(([id]) => !DEFAULT_ITEMS.find(t => t.id === id))
    ),
  };
  localStorage.setItem(SAVE_KEY, JSON.stringify(data));
}

function autoLoad() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    if (data.character)   state.character   = data.character;
    if (data.db)          Object.assign(state.db, data.db);
    if (data.instances)   state.instances   = data.instances;
    if (data.equipped)    state.equipped    = data.equipped;
    if (data.equipLayout) state.equipLayout = data.equipLayout;
    syncNextId();
  } catch {}
}

function saveState() {
  autoSave();
  flashButton(document.getElementById('save-btn'), 'Saved!');
}

function loadState() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) { alert('No saved data found.'); return; }
  try {
    const data = JSON.parse(raw);
    state.character = data.character ?? state.character;
    Object.assign(state.db, data.db ?? {});
    state.instances = data.instances ?? {};
    state.equipped  = data.equipped  ?? {};
    syncNextId();
    rebuildGrid();
    renderItemList();
    renderEquipPanel();
    flashButton(document.getElementById('load-btn'), 'Loaded!');
  } catch {
    alert('Failed to load save data.');
  }
}

function flashButton(btn, text) {
  const orig = btn.textContent;
  btn.textContent = text;
  setTimeout(() => btn.textContent = orig, 1500);
}

// =============================================================================
// FIREBASE CONFIGURATION
// =============================================================================
const FIREBASE_CONFIG = {
  apiKey:            'AIzaSyBz3kP5_LPo8gnMyDmRAYPC9k0KKMuDDGw',
  authDomain:        'ttrpg-inventory-manager.firebaseapp.com',
  databaseURL:       'https://ttrpg-inventory-manager-default-rtdb.firebaseio.com',
  projectId:         'ttrpg-inventory-manager',
  storageBucket:     'ttrpg-inventory-manager.firebasestorage.app',
  messagingSenderId: '987329310446',
  appId:             '1:987329310446:web:32452ffc35a590466e0dff',
};

// =============================================================================
// PARTY — FIREBASE
// =============================================================================
let firebaseDb = null;
let partyPlayersRef = null;

function initFirebase() {
  try {
    firebase.initializeApp(FIREBASE_CONFIG);
    firebaseDb = firebase.database();
  } catch (e) {
    console.warn('Firebase init failed — party features unavailable:', e);
  }
}

function generatePartyCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function generatePlayerId() {
  return 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
}

function getCustomDb() {
  return Object.fromEntries(
    Object.entries(state.db).filter(([id]) => !DEFAULT_ITEMS.find(t => t.id === id))
  );
}

function getSerializableInstances() {
  return Object.fromEntries(
    Object.entries(state.instances).map(([id, inst]) => [id, {
      id: inst.id,
      templateId: inst.templateId,
      rotation: inst.rotation,
      row: inst.row,
      col: inst.col,
      stackCount: inst.stackCount,
    }])
  );
}

async function createParty() {
  if (!firebaseDb) {
    alert('Firebase is not configured yet.\nOpen app.js and fill in FIREBASE_CONFIG with your Firebase project credentials.');
    return;
  }
  const code = generatePartyCode();
  try {
    const gmRef = firebaseDb.ref(`parties/${code}/gm`);
    await gmRef.set({ name: 'Game Master', connected: true });
    gmRef.onDisconnect().update({ connected: false });
  } catch (e) {
    alert('Failed to create party: ' + e.message);
    return;
  }

  state.party.active = true;
  state.party.code = code;
  state.party.role = 'gm';
  state.party.playerId = 'gm';
  state.party.playerName = 'Game Master';
  state.party.viewingPlayerId = null;
  state.party.players = {};

  subscribeToParty(code);
  hideModal('party-modal');
  updatePartyUI();
  switchTab('party');
}

async function joinParty(code, playerName) {
  if (!firebaseDb) {
    alert('Firebase is not configured yet.\nOpen app.js and fill in FIREBASE_CONFIG with your Firebase project credentials.');
    return;
  }
  const upperCode = code.trim().toUpperCase();
  if (upperCode.length !== 6) { alert('Party code must be 6 characters.'); return; }

  let snap;
  try {
    snap = await firebaseDb.ref(`parties/${upperCode}`).get();
  } catch (e) {
    alert('Failed to connect: ' + e.message);
    return;
  }
  if (!snap.exists()) {
    alert('Party not found. Check the code and try again.');
    return;
  }

  const playerId = generatePlayerId();
  try {
    const playerRef = firebaseDb.ref(`parties/${upperCode}/players/${playerId}`);
    await playerRef.set({
      name: playerName,
      connected: true,
      character: state.character,
      instances: getSerializableInstances(),
      customDb: getCustomDb(),
      equipped: state.equipped,
      _writtenBy: playerId,
    });
    playerRef.onDisconnect().update({ connected: false });
  } catch (e) {
    alert('Failed to join party: ' + e.message);
    return;
  }

  state.party.active = true;
  state.party.code = upperCode;
  state.party.role = 'player';
  state.party.playerId = playerId;
  state.party.playerName = playerName;
  state.party.viewingPlayerId = null;
  state.party.players = {};

  subscribeToParty(upperCode);
  hideModal('party-modal');
  updatePartyUI();
  switchTab('party');
}

function subscribeToParty(code) {
  if (partyPlayersRef) partyPlayersRef.off();
  partyPlayersRef = firebaseDb.ref(`parties/${code}/players`);

  partyPlayersRef.on('value', snap => {
    const players = snap.val() ?? {};
    state.party.players = players;

    const viewId = state.party.viewingPlayerId;
    if (viewId && players[viewId]) {
      const pData = players[viewId];
      // Only reload if the change came from the player themselves (not from our own GM write)
      if (pData._writtenBy !== state.party.playerId) {
        loadPlayerStateIntoView(pData);
      }
    }

    // If player is viewing own inventory and GM edited it, apply the changes
    if (state.party.role === 'player' && state.party.viewingPlayerId === null) {
      const ownData = players[state.party.playerId];
      if (ownData && ownData._writtenBy && ownData._writtenBy !== state.party.playerId) {
        applyRemoteEditToOwnState(ownData);
      }
    }

    updatePartyPanel();
  });
}

function leaveParty() {
  if (!state.party.active) return;
  if (partyPlayersRef) { partyPlayersRef.off(); partyPlayersRef = null; }

  if (state.party.viewingPlayerId !== null) restoreOwnState();

  state.party = {
    active: false, code: null, role: null, playerId: null,
    playerName: null, viewingPlayerId: null, ownState: null, players: {},
  };

  updatePartyUI();
  switchTab('browse');
}

let syncTimer = null;
function debouncedSync() {
  // Don't overwrite own save while a GM is editing a player's inventory
  const gmEditing = state.party.active && state.party.role === 'gm' && state.party.viewingPlayerId !== null;
  if (!gmEditing) autoSave();
  if (!state.party.active) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncPartyState, 400);
}

function syncPartyState() {
  if (!state.party.active || !firebaseDb) return;

  let targetId;
  if (state.party.role === 'gm') {
    targetId = state.party.viewingPlayerId;
    if (!targetId) return;
  } else {
    if (state.party.viewingPlayerId !== null) return; // don't sync when viewing someone else
    targetId = state.party.playerId;
  }

  firebaseDb.ref(`parties/${state.party.code}/players/${targetId}`).update({
    character: state.character,
    instances: getSerializableInstances(),
    customDb: getCustomDb(),
    equipped: state.equipped,
    _writtenBy: state.party.playerId,
  });
}

function loadPlayerStateIntoView(playerData) {
  if (!playerData) return;
  cancelPlacing();

  if (playerData.character) state.character = { ...playerData.character };

  state.db = {};
  DEFAULT_ITEMS.forEach(t => { state.db[t.id] = t; });
  if (playerData.customDb) Object.assign(state.db, playerData.customDb);

  state.instances = playerData.instances ? { ...playerData.instances } : {};
  state.equipped  = playerData.equipped  ? { ...playerData.equipped  } : {};
  syncNextId();
  rebuildGrid();
  renderItemList();
  updateWeightDisplay();
}

function applyRemoteEditToOwnState(playerData) {
  if (playerData.instances !== undefined) state.instances = { ...playerData.instances };
  if (playerData.equipped  !== undefined) state.equipped  = { ...playerData.equipped  };
  if (playerData.customDb) Object.assign(state.db, playerData.customDb);
  syncNextId();
  rebuildGrid();
  renderItemList();
  updateWeightDisplay();
}

function saveOwnState() {
  state.party.ownState = {
    character: { ...state.character },
    instances: JSON.parse(JSON.stringify(state.instances)),
    equipped:  { ...state.equipped },
    customDb:  JSON.parse(JSON.stringify(getCustomDb())),
  };
}

function restoreOwnState() {
  const own = state.party.ownState;
  if (!own) return;
  state.character = { ...own.character };
  state.instances = { ...own.instances };
  state.equipped  = { ...(own.equipped ?? {}) };
  state.db = {};
  DEFAULT_ITEMS.forEach(t => { state.db[t.id] = t; });
  Object.assign(state.db, own.customDb);
  state.party.ownState = null;
  syncNextId();
  rebuildGrid();
  renderItemList();
  updateWeightDisplay();
}

function switchViewToPlayer(playerId) {
  if (state.party.viewingPlayerId === playerId) return;
  cancelPlacing();

  if (state.party.role === 'player' && state.party.viewingPlayerId === null) saveOwnState();

  state.party.viewingPlayerId = playerId;
  const playerData = state.party.players[playerId];
  if (playerData) loadPlayerStateIntoView(playerData);

  updatePartyPanel();
  updateViewingBanner();
  document.body.classList.toggle('party-readonly', isReadOnly());
}

function switchViewToOwn() {
  if (state.party.viewingPlayerId === null) return;
  cancelPlacing();
  state.party.viewingPlayerId = null;

  if (state.party.role === 'player') {
    restoreOwnState();
  } else {
    // GM — back to no-selection state; show placeholder
    state.character = { name: 'Game Master', strength: 10 };
    state.instances = {};
    state.db = {};
    DEFAULT_ITEMS.forEach(t => { state.db[t.id] = t; });
    initGrid();
    buildGrid();
    renderAllItems();
    updateWeightDisplay();
  }

  updatePartyPanel();
  updateViewingBanner();
  document.body.classList.toggle('party-readonly', isReadOnly());
}

function isReadOnly() {
  if (!state.party.active) return false;
  if (state.party.role === 'gm') return false;
  return state.party.viewingPlayerId !== null;
}

function computeCarriedWeightFor(instances, customDb) {
  const db = {};
  DEFAULT_ITEMS.forEach(t => { db[t.id] = t; });
  Object.assign(db, customDb ?? {});
  return Object.values(instances ?? {}).reduce((sum, inst) => {
    const t = db[inst.templateId];
    if (!t) return sum;
    return sum + (t.stackable ? t.weightEach * inst.stackCount : shapeWeight(getRotatedShape(t.shape, inst.rotation)));
  }, 0);
}

// =============================================================================
// PARTY — UI
// =============================================================================
function openPartyModal() {
  document.querySelectorAll('.party-role-btn').forEach(b => b.classList.toggle('active', b.dataset.role === 'player'));
  document.getElementById('party-player-fields').classList.remove('hidden');
  document.getElementById('party-gm-fields').classList.add('hidden');
  document.getElementById('party-player-name').value = state.character.name || '';
  document.getElementById('party-join-code').value = '';
  showModal('party-modal');
}

function updatePartyUI() {
  const inParty = state.party.active;

  document.getElementById('party-code-badge').classList.toggle('hidden', !inParty);
  if (inParty) document.getElementById('party-code-badge').textContent = state.party.code;

  document.getElementById('party-no-session').classList.toggle('hidden', inParty);
  document.getElementById('party-session').classList.toggle('hidden', !inParty);

  if (inParty) {
    document.getElementById('party-code-text').textContent = state.party.code;
    const roleEl = document.getElementById('party-role-badge');
    roleEl.textContent = state.party.role === 'gm' ? 'Game Master' : 'Player';
    roleEl.className = 'party-role-badge ' + state.party.role;

    const gmHint = document.getElementById('party-gm-hint');
    gmHint.classList.toggle('hidden', !(state.party.role === 'gm' && state.party.viewingPlayerId === null));

    const gmPlaceholder = document.getElementById('gm-placeholder');
    gmPlaceholder.classList.toggle('hidden', !(state.party.role === 'gm' && state.party.viewingPlayerId === null));

    document.getElementById('char-summary').style.visibility =
      (state.party.role === 'gm' && state.party.viewingPlayerId === null) ? 'hidden' : '';
  } else {
    document.getElementById('char-summary').style.visibility = '';
    document.getElementById('gm-placeholder').classList.add('hidden');
  }

  document.body.classList.toggle('party-readonly', isReadOnly());
  updatePartyPanel();
  updateViewingBanner();
}

function updatePartyPanel() {
  const listEl = document.getElementById('party-player-list');
  if (!listEl) return;
  listEl.innerHTML = '';

  const players = state.party.players ?? {};

  if (Object.keys(players).length === 0 && state.party.role === 'gm') {
    const hint = document.createElement('p');
    hint.className = 'party-empty-hint';
    hint.textContent = 'Waiting for players to join…';
    listEl.appendChild(hint);
    return;
  }

  Object.entries(players).forEach(([id, p]) => {
    const isViewing = state.party.viewingPlayerId === id;
    const isOwn = state.party.role === 'player' && id === state.party.playerId;
    const canClick = !isOwn;

    const entry = document.createElement('div');
    entry.className = 'party-player-entry' +
      (isViewing ? ' viewing' : '') +
      (isOwn ? ' own' : '') +
      (canClick ? ' clickable' : '');

    const top = document.createElement('div');
    top.className = 'party-entry-top';

    const dot = document.createElement('span');
    dot.className = 'party-dot ' + (p.connected ? 'online' : 'offline');

    const nameEl = document.createElement('span');
    nameEl.className = 'party-player-name-text';
    nameEl.textContent = p.name + (isOwn ? ' (You)' : '');

    top.appendChild(dot);
    top.appendChild(nameEl);
    entry.appendChild(top);

    if (p.character) {
      const carried = computeCarriedWeightFor(p.instances, p.customDb);
      const encThreshold = p.character.strength * 15;
      const statusText = carried > encThreshold * 2 ? ' · Heavily Enc.' : carried > encThreshold ? ' · Enc.' : '';
      const infoEl = document.createElement('span');
      infoEl.className = 'party-player-info';
      infoEl.textContent = `${p.character.name} · ${Math.round(carried * 10) / 10} lb${statusText}`;
      entry.appendChild(infoEl);
    }

    if (canClick) {
      entry.addEventListener('click', () => {
        if (isViewing) switchViewToOwn();
        else switchViewToPlayer(id);
      });
    }

    listEl.appendChild(entry);
  });
}

function updateViewingBanner() {
  const banner = document.getElementById('viewing-banner');
  const viewId = state.party.viewingPlayerId;

  if (!state.party.active || viewId === null) {
    banner.classList.add('hidden');
    return;
  }

  banner.classList.remove('hidden');
  const name = state.party.players[viewId]?.name ?? 'Player';
  const textEl = document.getElementById('viewing-banner-text');
  const returnBtn = document.getElementById('return-to-own-btn');

  if (state.party.role === 'gm') {
    textEl.textContent = `Editing ${name}'s inventory`;
    returnBtn.textContent = 'Deselect Player';
  } else {
    textEl.textContent = `Viewing ${name}'s inventory (read-only)`;
    returnBtn.textContent = 'Return to Your Inventory';
  }

  // Also keep GM placeholder in sync
  document.getElementById('gm-placeholder').classList.add('hidden');
}

// Party UI event listeners
document.getElementById('party-btn').addEventListener('click', () => {
  if (state.party.active) switchTab('party');
  else openPartyModal();
});

document.getElementById('open-party-modal-btn').addEventListener('click', openPartyModal);

document.querySelectorAll('.party-role-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.party-role-btn').forEach(b => b.classList.toggle('active', b === btn));
    const isGM = btn.dataset.role === 'gm';
    document.getElementById('party-player-fields').classList.toggle('hidden', isGM);
    document.getElementById('party-gm-fields').classList.toggle('hidden', !isGM);
  });
});

document.getElementById('party-create-btn').addEventListener('click', createParty);

document.getElementById('party-join-btn').addEventListener('click', () => {
  const name = document.getElementById('party-player-name').value.trim();
  const code = document.getElementById('party-join-code').value.trim();
  if (!name) { alert('Please enter your name.'); return; }
  if (!code) { alert('Please enter the party code.'); return; }
  joinParty(code, name);
});

document.getElementById('copy-code-btn').addEventListener('click', () => {
  navigator.clipboard.writeText(state.party.code ?? '').then(() => {
    flashButton(document.getElementById('copy-code-btn'), 'Copied!');
  });
});

document.getElementById('leave-party-btn').addEventListener('click', () => {
  if (confirm('Leave the party?')) leaveParty();
});

document.getElementById('return-to-own-btn').addEventListener('click', switchViewToOwn);

// =============================================================================
// EQUIPMENT
// =============================================================================
function getEquippedSlot(instanceId) {
  return Object.entries(state.equipped).find(([, id]) => id === instanceId)?.[0] ?? null;
}

function equipItem(instanceId, slotId) {
  // Remove from any slot it's already in
  for (const s of Object.keys(state.equipped)) {
    if (state.equipped[s] === instanceId) delete state.equipped[s];
  }
  state.equipped[slotId] = instanceId;
  renderAllItems();
  debouncedSync();
}

function unequipItem(slotId) {
  delete state.equipped[slotId];
  renderAllItems();
  debouncedSync();
}

function unequipInstance(instanceId) {
  const slotId = getEquippedSlot(instanceId);
  if (slotId) unequipItem(slotId);
}

function renderEquipPanel() {
  const panel = document.getElementById('equip-panel');
  if (!panel) return;
  panel.innerHTML = '';

  const scrollArea = document.createElement('div');
  scrollArea.id = 'equip-slots-scroll';

  function makeSlotCard(slot) {
    const instId = state.equipped[slot.id] ?? null;
    const inst   = instId ? state.instances[instId] : null;
    const t      = inst ? state.db[inst.templateId] : null;

    const card = document.createElement('div');
    card.className = 'eq-card' + (t ? ' filled' : '');
    card.dataset.slotId = slot.id;

    const labelEl = document.createElement('span');
    labelEl.className = 'eq-card-label';
    labelEl.textContent = slot.panelLabel || slot.label;

    const itemEl = document.createElement('span');
    itemEl.className = 'eq-card-item';
    itemEl.textContent = t ? t.name : '—';

    card.appendChild(labelEl);
    card.appendChild(itemEl);

    if (t && !isReadOnly()) {
      const unequipBtn = document.createElement('button');
      unequipBtn.className = 'eq-card-unequip';
      unequipBtn.textContent = '×';
      unequipBtn.title = 'Unequip';
      unequipBtn.addEventListener('click', e => { e.stopPropagation(); unequipItem(slot.id); });
      card.appendChild(unequipBtn);
    }

    if (inst) {
      card.addEventListener('pointerenter', e => startTooltipTimer(inst.id, e.clientX, e.clientY));
      card.addEventListener('pointerleave', clearTooltip);
    }

    if (!isReadOnly()) {
      card.addEventListener('click', () => openSlotPicker(slot.id));
    }

    return card;
  }

  let currentSection = null;
  let rowBuffer = [];

  function flushRowBuffer() {
    if (!rowBuffer.length) return;
    const rowDiv = document.createElement('div');
    rowDiv.className = 'eq-weapons-row';
    rowBuffer.forEach(card => rowDiv.appendChild(card));
    currentSection.appendChild(rowDiv);
    rowBuffer = [];
  }

  state.equipLayout.forEach(item => {
    if (item.type === 'header') {
      flushRowBuffer();
      currentSection = document.createElement('div');
      currentSection.className = 'eq-section';
      const hdr = document.createElement('div');
      hdr.className = 'eq-section-header';
      hdr.textContent = item.label;
      currentSection.appendChild(hdr);
      scrollArea.appendChild(currentSection);
    } else if (item.type === 'slot' && item.visible !== false) {
      if (!currentSection) {
        currentSection = document.createElement('div');
        currentSection.className = 'eq-section';
        scrollArea.appendChild(currentSection);
      }
      const card = makeSlotCard(item);
      if (item.inRow) {
        rowBuffer.push(card);
      } else {
        flushRowBuffer();
        currentSection.appendChild(card);
      }
    }
  });

  flushRowBuffer();

  panel.appendChild(scrollArea);

  const footer = document.createElement('div');
  footer.id = 'equip-panel-footer';
  const settingsBtn = document.createElement('button');
  settingsBtn.className = 'btn-sm';
  settingsBtn.textContent = '⚙ Configure Slots';
  settingsBtn.addEventListener('click', openEquipSettings);
  footer.appendChild(settingsBtn);
  panel.appendChild(footer);
}

function openEquipSettings() {
  let draft = JSON.parse(JSON.stringify(state.equipLayout));

  const list = document.getElementById('equip-settings-list');

  function renderDraft() {
    list.innerHTML = '';

    draft.forEach((item, idx) => {
      const row = document.createElement('div');
      row.className = 'es-row' + (item.type === 'header' ? ' es-header-row' : '');

      const upBtn = document.createElement('button');
      upBtn.className = 'btn-icon';
      upBtn.title = 'Move up';
      upBtn.textContent = '▲';
      upBtn.disabled = idx === 0;
      upBtn.addEventListener('click', () => {
        if (idx > 0) { [draft[idx - 1], draft[idx]] = [draft[idx], draft[idx - 1]]; renderDraft(); }
      });

      const dnBtn = document.createElement('button');
      dnBtn.className = 'btn-icon';
      dnBtn.title = 'Move down';
      dnBtn.textContent = '▼';
      dnBtn.disabled = idx === draft.length - 1;
      dnBtn.addEventListener('click', () => {
        if (idx < draft.length - 1) { [draft[idx + 1], draft[idx]] = [draft[idx], draft[idx + 1]]; renderDraft(); }
      });

      const labelInput = document.createElement('input');
      labelInput.type = 'text';
      labelInput.className = 'es-label-input';
      labelInput.value = item.label;
      labelInput.addEventListener('input', e => { draft[idx].label = e.target.value; });

      const delBtn = document.createElement('button');
      delBtn.className = 'btn-icon danger';
      delBtn.title = 'Remove';
      delBtn.textContent = '×';
      delBtn.addEventListener('click', () => { draft.splice(idx, 1); renderDraft(); });

      row.appendChild(upBtn);
      row.appendChild(dnBtn);
      row.appendChild(labelInput);

      if (item.type === 'slot') {
        function makeToggle(title, symbol, getter, setter) {
          const lbl = document.createElement('label');
          lbl.className = 'es-toggle';
          lbl.title = title;
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.checked = getter();
          cb.addEventListener('change', () => setter(cb.checked));
          lbl.appendChild(cb);
          const sym = document.createElement('span');
          sym.textContent = symbol;
          lbl.appendChild(sym);
          return lbl;
        }
        row.appendChild(makeToggle('Show in panel', '👁', () => item.visible !== false, v => { draft[idx].visible = v; }));
        row.appendChild(makeToggle('Side-by-side', '⇔', () => !!item.inRow, v => { draft[idx].inRow = v; }));
        row.appendChild(makeToggle('Attunement only', '✦', () => !!item.attuneOnly, v => { draft[idx].attuneOnly = v; }));
      }

      row.appendChild(delBtn);
      list.appendChild(row);
    });

    const addRow = document.createElement('div');
    addRow.className = 'es-add-row';

    const addHdrBtn = document.createElement('button');
    addHdrBtn.className = 'btn-sm';
    addHdrBtn.textContent = '+ Header';
    addHdrBtn.addEventListener('click', () => {
      draft.push({ type: 'header', label: 'New Section' });
      renderDraft();
    });

    const addSlotBtn = document.createElement('button');
    addSlotBtn.className = 'btn-sm';
    addSlotBtn.textContent = '+ Slot';
    addSlotBtn.addEventListener('click', () => {
      draft.push({ type: 'slot', id: 'slot_' + Math.random().toString(36).slice(2, 6), label: 'New Slot', panelLabel: '', attuneOnly: false, inRow: false, visible: true });
      renderDraft();
    });

    const resetBtn = document.createElement('button');
    resetBtn.className = 'btn-sm';
    resetBtn.textContent = '↺ Defaults';
    resetBtn.addEventListener('click', () => { draft = getDefaultEquipLayout(); renderDraft(); });

    addRow.appendChild(addHdrBtn);
    addRow.appendChild(addSlotBtn);
    addRow.appendChild(resetBtn);
    list.appendChild(addRow);
  }

  renderDraft();

  document.getElementById('equip-settings-apply-btn').onclick = () => {
    state.equipLayout = draft;
    saveSlotConfig();
    renderEquipPanel();
    hideModal('equip-settings-modal');
  };

  showModal('equip-settings-modal');
}

function saveSlotConfig() {
  localStorage.setItem('dnd_slot_config', JSON.stringify(state.equipLayout));
}

function loadSlotConfig() {
  if (state.equipLayout.length) return; // already restored by autoLoad
  try {
    const raw = localStorage.getItem('dnd_slot_config');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]?.type) {
        state.equipLayout = parsed;
      } else if (Array.isArray(parsed)) {
        // Migrate old format (list of disabled slot ID strings)
        const layout = getDefaultEquipLayout();
        parsed.forEach(id => {
          const s = layout.find(item => item.type === 'slot' && item.id === id);
          if (s) s.visible = false;
        });
        state.equipLayout = layout;
      }
    }
  } catch {}
  if (!state.equipLayout.length) state.equipLayout = getDefaultEquipLayout();
}

let equipModalInstanceId = null;

// Called from context menu "Equip…" — picks a slot for the given item
function openEquipModal(instanceId) {
  equipModalInstanceId = instanceId;
  const inst = state.instances[instanceId];
  const t    = inst ? state.db[inst.templateId] : null;

  document.getElementById('equip-modal').querySelector('h2').textContent = 'Equip to Slot';

  const picker = document.getElementById('equip-slot-picker');
  picker.innerHTML = '';

  const eligibleSlots = state.equipLayout.filter(item =>
    item.type === 'slot' && item.visible !== false && !(item.attuneOnly && !t?.attunement)
  );

  eligibleSlots.forEach(slot => {
    const occupantId   = state.equipped[slot.id];
    const occupantInst = occupantId ? state.instances[occupantId] : null;
    const occupantName = occupantInst ? state.db[occupantInst.templateId]?.name : null;

    const btn = document.createElement('button');
    btn.className = 'btn-sm equip-slot-pick-btn';
    btn.textContent = slot.label + (occupantName ? ` (${occupantName})` : '');
    btn.addEventListener('click', () => { equipItem(instanceId, slot.id); hideModal('equip-modal'); });
    picker.appendChild(btn);
  });

  showModal('equip-modal');
}

// Called from clicking a slot in the equip panel — picks an item for the given slot
function openSlotPicker(slotId) {
  clearTooltip();
  const slot = getSlotDef(slotId);
  if (!slot) return;

  document.getElementById('equip-modal').querySelector('h2').textContent = slot.label;

  const picker = document.getElementById('equip-slot-picker');
  picker.innerHTML = '';

  // Unequip option when slot is occupied
  const currentId = state.equipped[slotId];
  if (currentId) {
    const unequipBtn = document.createElement('button');
    unequipBtn.className = 'btn-sm equip-slot-pick-btn danger';
    unequipBtn.textContent = 'Unequip';
    unequipBtn.addEventListener('click', () => { unequipItem(slotId); hideModal('equip-modal'); });
    picker.appendChild(unequipBtn);
  }

  const candidates = Object.values(state.instances).filter(inst => {
    const tmpl = state.db[inst.templateId];
    if (!tmpl) return false;
    if (slot.attuneOnly && !tmpl.attunement) return false;
    return true;
  });

  if (candidates.length === 0) {
    const msg = document.createElement('p');
    msg.className = 'modal-note';
    msg.textContent = slot.attuneOnly
      ? 'No items requiring attunement in your inventory.'
      : 'No items in your inventory.';
    picker.appendChild(msg);
  } else {
    candidates.forEach(inst => {
      const tmpl         = state.db[inst.templateId];
      const alreadyHere  = state.equipped[slotId] === inst.id;
      const btn = document.createElement('button');
      btn.className = 'btn-sm equip-slot-pick-btn' + (alreadyHere ? ' active' : '');
      btn.textContent = tmpl.name
        + (inst.stackCount > 1 ? ` ×${inst.stackCount}` : '')
        + (alreadyHere ? ' (equipped)' : '');
      btn.addEventListener('click', () => { equipItem(inst.id, slotId); hideModal('equip-modal'); });
      picker.appendChild(btn);
    });
  }

  showModal('equip-modal');
}

// =============================================================================
// TOOLTIP
// =============================================================================
let tooltipTimer = null;

function startTooltipTimer(instanceId, x, y) {
  clearTooltip();
  tooltipTimer = setTimeout(() => showItemTooltip(instanceId, x, y), 1200);
}

function clearTooltip() {
  clearTimeout(tooltipTimer);
  tooltipTimer = null;
  const el = document.getElementById('item-tooltip');
  el.classList.add('hidden');
  el.innerHTML = '';
}

function showItemTooltip(instanceId, x, y) {
  const inst = state.instances[instanceId];
  if (!inst) return;
  const t = state.db[inst.templateId];
  if (!t) return;
  const weight = t.stackable
    ? `${Math.round(t.weightEach * (inst.stackCount ?? 1) * 100) / 100} lb (×${inst.stackCount ?? 1})`
    : `${shapeWeight(getRotatedShape(t.shape, inst.rotation))} lb`;
  renderTooltip(t, weight, x, y);
}

function showTemplateTooltip(templateId, x, y) {
  const t = state.db[templateId];
  if (!t) return;
  const weight = t.stackable ? `${t.weightEach} lb each` : `${shapeWeight(t.shape)} lb`;
  renderTooltip(t, weight, x, y);
}

function renderTooltip(t, weight, x, y) {
  const el    = document.getElementById('item-tooltip');
  const color = RARITY_META[t.rarity]?.color ?? '#888';

  const dmgHtml    = t.damage
    ? `<div class="tip-row"><span>Damage</span><span>${t.damage}${t.damageType ? ' ' + t.damageType : ''}</span></div>`
    : '';
  const costHtml   = t.cost
    ? `<div class="tip-row"><span>Cost</span><span>${t.cost.toLocaleString()} gp</span></div>`
    : '';
  const attuneHtml = t.attunement
    ? `<div class="tip-attune">Requires Attunement</div>`
    : '';
  const descHtml   = t.description
    ? `<div class="tip-desc">${t.description}</div>`
    : '';
  const tagsHtml   = t.tags?.length
    ? `<div class="tip-tags">${t.tags.map(tag => `<span class="tag-pill">${tag}</span>`).join('')}</div>`
    : '';

  el.innerHTML = `
    <div class="tip-header">
      <span class="tip-name">${t.name}</span>
      <span class="tip-rarity" style="color:${color}">${RARITY_META[t.rarity]?.label ?? ''}</span>
    </div>
    ${attuneHtml}
    <div class="tip-row"><span>Weight</span><span>${weight}</span></div>
    ${costHtml}
    ${dmgHtml}
    ${descHtml}
    ${tagsHtml}
  `;

  el.classList.remove('hidden');

  const pad = 12, tipW = 240;
  let left = x + pad, top = y + pad;
  if (left + tipW > window.innerWidth - pad) left = x - tipW - pad;
  el.style.left = left + 'px';
  el.style.top  = top + 'px';
  if (top + el.offsetHeight > window.innerHeight - pad) {
    el.style.top = (window.innerHeight - el.offsetHeight - pad) + 'px';
  }
}

// =============================================================================
// INITIALIZATION
// =============================================================================
function init() {
  DEFAULT_ITEMS.forEach(t => { state.db[t.id] = t; });
  autoLoad();       // Restore last session (includes equipLayout if saved)
  loadSlotConfig(); // Fallback: migrate old config or apply defaults if layout not yet set
  rebuildGrid(); // Sizes grid from restored character.strength, places saved instances
  renderItemList();
  renderEquipPanel();
  initFirebase();
}

init();
