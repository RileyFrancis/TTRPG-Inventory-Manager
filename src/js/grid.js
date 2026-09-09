// =============================================================================
// GRID — Grid occupancy: fit tests, place/remove, id generation
// =============================================================================
'use strict';

// The deferred resize: Strength typed on the sheet does not resize the grid
// until the reader returns to the inventory. A number box passes through 0 and 1
// on the way from 8 to 16, and rebuilding on each would eject the whole pack into
// Needs Placement — which finishing the number does not undo. So the sheet marks
// the grid dirty (`commitSheetEdit`) and the resize happens once, on the settled
// number, from `syncCharacterViewUI`. Nothing is inconsistent while it waits:
// only `state.character.strength` has run ahead, read only by the weight readout.
// See CLAUDE.md § Grid geometry.
let gridSizeDirty = false;

function markGridSizeDirty() { gridSizeDirty = true; }

function rebuildGridIfSizeDirty() {
  if (!gridSizeDirty) return;
  rebuildGrid();   // clears the flag by way of initGrid()
}

// =============================================================================
// GRID LOGIC
// =============================================================================
function initGrid() {
  const rows = gridRows();
  state.grid = Array.from({ length: rows }, () => Array(GRID_COLS).fill(null));
  // Any rebuild IS the pending resize (a view switch, boot, character swap,
  // party sync) — clearing the flag here, not only in rebuildGridIfSizeDirty(),
  // stops a stale flag firing a second identical rebuild.
  gridSizeDirty = false;
}

// Does `shape` fit at (gridRow, gridCol) in one particular grid? `canPlace` asks
// it of the active grid; the rebuild asks it of each container's grid, so the
// grid is a parameter here.
function fitsInGrid(grid, cols, shape, gridRow, gridCol, excludeInstanceId = null) {
  const cells = getShapeCells(shape, gridRow, gridCol);
  for (const { row, col } of cells) {
    if (row < 0 || row >= grid.length || col < 0 || col >= cols) return false;
    const occupant = grid[row][col];
    if (occupant && occupant !== excludeInstanceId) return false;
  }
  return true;
}

function canPlace(shape, gridRow, gridCol, excludeInstanceId = null) {
  return fitsInGrid(activeGrid(), activeGridCols(), shape, gridRow, gridCol, excludeInstanceId);
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

// An item that cannot go back where it was is put in the stash (`row: null` =
// "owned, but not on the grid"), never left holding a position off the edge —
// `#inventory-grid` is `overflow: hidden`, so it would be drawn where no one can
// see or click it while `totalCarriedWeight` still charges for it.
function unplaceInstance(inst) {
  inst.row = null;
  inst.col = null;
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
