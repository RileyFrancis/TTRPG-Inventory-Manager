// =============================================================================
// GRID — Grid occupancy: fit tests, place/remove, id generation
// =============================================================================
'use strict';

// =============================================================================
// GRID LOGIC
// =============================================================================
function initGrid() {
  const rows = gridRows();
  state.grid = Array.from({ length: rows }, () => Array(GRID_COLS).fill(null));
}

function canPlace(shape, gridRow, gridCol, excludeInstanceId = null) {
  const grid = activeGrid();
  const cols = activeGridCols();
  const cells = getShapeCells(shape, gridRow, gridCol);
  for (const { row, col } of cells) {
    if (row < 0 || row >= grid.length || col < 0 || col >= cols) return false;
    const occupant = grid[row][col];
    if (occupant && occupant !== excludeInstanceId) return false;
  }
  return true;
}

function placeOnGrid(instanceId, shape, gridRow, gridCol) {
  const grid = activeGrid();
  getShapeCells(shape, gridRow, gridCol).forEach(({ row, col }) => {
    if (grid[row]) grid[row][col] = instanceId;
  });
}

function removeFromGrid(instanceId) {
  const inst = state.instances[instanceId];
  const grid = (inst?.containerId)
    ? (state.containerGrids[inst.containerId] ?? null)
    : state.grid;
  if (!grid) return;
  grid.forEach(row => row.forEach((v, i, arr) => {
    if (v === instanceId) arr[i] = null;
  }));
}

function totalCarriedWeight() {
  return Object.values(state.instances).reduce((sum, inst) => {
    const template = state.db[inst.templateId];
    if (!template) return sum;
    if (isStackable(template)) return sum + unitWeight(template) * inst.stackCount;
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
