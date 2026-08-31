// =============================================================================
// GRID — Grid occupancy: fit tests, place/remove, id generation
// =============================================================================
'use strict';

// =============================================================================
// THE DEFERRED RESIZE
// =============================================================================
// **Strength typed on the character sheet does not resize the grid until the
// reader goes back to the inventory.** A number box is edited a keystroke at a
// time, and on the way from 8 to 16 it passes through 1: three rows, and
// `rebuildGrid()` would drop nearly the whole inventory into Needs Placement.
// That is not undone by finishing the number — `unplaceInstance()` clears
// `row`/`col`, so the items stay unplaced and the reader has to lay the whole
// pack out again for a digit they typed in passing. An empty box is the same
// hazard: it reads as 0, which is now a legal score and a grid of no rows.
//
// So the sheet marks the grid dirty (`commitSheetEdit`) and the resize happens
// once, on the number the reader settled on, when they go and look at it
// (`syncCharacterViewUI`).
//
// **Nothing is left inconsistent in the meantime.** `state.grid` and the
// instances placed in it still agree with each other exactly as before — the
// grid is simply still sized for the previous Strength. The one field that has
// run ahead is `state.character.strength`, and the only thing reading it
// meanwhile is the header's weight readout, which is a set of numbers rather
// than a set of cells and is right to preview where the edit is going.
//
// A save taken before the reader returns keeps each item's `row`/`col`, and the
// `rebuildGrid()` in `init()` settles it on the next load — once, on a finished
// number, which is the whole point.
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
  // This *is* the pending resize, whatever asked for it — a view switch, a boot,
  // a character swap, a party sync. Clearing the flag here rather than in
  // `rebuildGridIfSizeDirty()` alone is what stops any of those other paths
  // leaving a stale flag behind to fire a second, identical rebuild later.
  gridSizeDirty = false;
}

// Does `shape` fit at (gridRow, gridCol) in one particular grid? `canPlace`
// asks this of whichever grid is on screen, which is what every interaction
// wants. The rebuild has to ask it of each container's grid in turn — none of
// which is the active one — so the grid is a parameter here.
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

// An item that cannot go back where it was is put in the stash, never left
// holding a position off the edge of the grid. Shrinking the inventory —
// Strength down, or a container's size reduced in the item editor — otherwise
// strands it outside the rendered rows: `#inventory-grid` is `overflow:
// hidden`, so it is drawn where no one can see or click it, while
// `totalCarriedWeight` still counts every instance and charges for it.
//
// `row: null` is the app's own word for "owned, but not on the grid", so the
// item lands in the Needs Placement list of whichever grid it belonged to and
// the owner can put it back. Equipped stays equipped, as it does for Stash All.
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
