// =============================================================================
// DRAG-GHOST — The floating ghost element shared by placing and dragging
// =============================================================================
'use strict';

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

  const outerBorder = 'var(--ghost-outer)';
  const innerBorder = 'var(--ghost-inner)';

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

// A whole folder in the browse list is a drop target for item cards, not just
// its header: dropping an item anywhere among a folder's cards files it there.
// The list is a flat run of headers and cards, so a folder is the *band* from
// its header down to the next header — which is why this walks the children in
// order rather than hit-testing each element on its own. The gaps between cards
// belong to the band too, so a drop never falls through a 4px crack.
//
// Order inside a folder is the sort's business (item-sort.js), so where in the
// band the item lands is deliberately not read: there is no reordering by hand.
function getFolderDropAtPoint(x, y) {
  const listEl = document.getElementById('item-list');
  if (!listEl.classList.contains('foldered')) return null;
  const lr = listEl.getBoundingClientRect();
  if (x < lr.left || x > lr.right || y < lr.top || y > lr.bottom) return null;

  let folderId = null;
  for (const el of listEl.children) {
    if (el.classList.contains('folder-header')) folderId = el.dataset.folderId;
    if (y <= el.getBoundingClientRect().bottom) return folderId;
  }
  // Past the last card: empty space at the foot of the list, which belongs to
  // no folder — filing into whichever folder happens to be last would be a
  // guess, and a wrong one every time the list is scrolled to the end.
  return null;
}

// The folder a drag of `templateId` would file it into, or null for none. A
// drop back into the item's own folder is *not* a target: there is nothing to
// reorder there, so it reads as a cancelled drag rather than a no-op move.
function folderDropTargetFor(templateId, x, y) {
  const id = getFolderDropAtPoint(x, y);
  if (!id) return null;
  return id === (folderOf(templateId) ?? UNFILED_ID) ? null : id;
}

// The whole band lights up, header and cards together — the header alone would
// leave the cursor sitting on unhighlighted cards with no sign of where the
// item is about to go.
function setFolderDropTarget(folderId) {
  clearFolderDropTargets();
  if (!folderId) return;
  document.querySelectorAll(
    `#item-list .folder-header[data-folder-id="${folderId}"], ` +
    `#item-list .item-card[data-folder-id="${folderId}"]`
  ).forEach(el => el.classList.add('drop-target'));
}

function clearFolderDropTargets() {
  document.querySelectorAll('#item-list .drop-target')
    .forEach(el => el.classList.remove('drop-target'));
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
