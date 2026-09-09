// =============================================================================
// DRAG-GHOST — The floating ghost element shared by placing and dragging
// =============================================================================
'use strict';

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

// The whole folder is a drop target, not just its header. The list is a flat run
// of headers and cards, so a folder is the BAND from its header to the next —
// hence walking the children in order rather than hit-testing each. Where in the
// band the item lands is not read (order is the sort's business).
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
  // Past the last card: empty space belonging to no folder.
  return null;
}

// The folder a drag would file into, or null. A drop back into the item's own
// folder is NOT a target — it reads as a cancelled drag.
function folderDropTargetFor(templateId, x, y) {
  const id = getFolderDropAtPoint(x, y);
  if (!id) return null;
  return id === (folderOf(templateId) ?? UNFILED_ID) ? null : id;
}

// The whole band lights, header and cards together. `cls` is `drop-target` (a
// folder the item would move into) or `drop-current` (the one it is in).
function setFolderBandClass(folderId, cls) {
  if (!folderId) return;
  document.querySelectorAll(
    `#item-list .folder-header[data-folder-id="${folderId}"], ` +
    `#item-list .item-card[data-folder-id="${folderId}"]`
  ).forEach(el => el.classList.add(cls));
}

function clearFolderDropTargets() {
  document.querySelectorAll('#item-list .drop-target, #item-list .drop-current')
    .forEach(el => el.classList.remove('drop-target', 'drop-current'));
  hideFolderDropHint();
}

// ─── THE FOLDER DROP HINT ────────────────────────────────────────────────────
// A chip at the cursor naming the folder — the band is the area, this is the
// answer (a folder taller than the list hides its own header).
const folderDropHintEl = document.getElementById('folder-drop-hint');
const FOLDER_HINT_OFFSET = 16; // clear of the cursor, so it never sits under it

function showFolderDropHint(text, blocked, x, y) {
  folderDropHintEl.textContent = text;
  folderDropHintEl.classList.remove('hidden');
  folderDropHintEl.classList.toggle('blocked', !!blocked);
  // Flip to the other side of the cursor rather than run off the edge; measured
  // after the text is in, since the chip is as wide as the folder's name.
  const w = folderDropHintEl.offsetWidth, h = folderDropHintEl.offsetHeight;
  const left = x + FOLDER_HINT_OFFSET + w > window.innerWidth
    ? x - FOLDER_HINT_OFFSET - w : x + FOLDER_HINT_OFFSET;
  const top = y + FOLDER_HINT_OFFSET + h > window.innerHeight
    ? y - FOLDER_HINT_OFFSET - h : y + FOLDER_HINT_OFFSET;
  folderDropHintEl.style.left = left + 'px';
  folderDropHintEl.style.top  = top + 'px';
}

function hideFolderDropHint() {
  folderDropHintEl.className = 'hidden';
}

// The whole of a browse drag's folder feedback in one call — band, chip and
// answer cannot disagree. Returns { folderId, hovering }: `folderId` is where a
// drop would move the item (null for none); `hovering` is true over ANY folder
// band (including the item's own, where the grid preview must not get a look in).
function showFolderDropFeedback(templateId, x, y) {
  clearFolderDropTargets();
  const hoverId = getFolderDropAtPoint(x, y);
  if (!hoverId) return { folderId: null, hovering: false };

  const folderId = folderDropTargetFor(templateId, x, y);
  if (folderId) {
    setFolderBandClass(folderId, 'drop-target');
    showFolderDropHint('Move to ' + folderNameOf(folderId), false, x, y);
  } else {
    // The item's own folder — say so rather than leave a dead patch of list.
    setFolderBandClass(hoverId, 'drop-current');
    showFolderDropHint('Already in ' + folderNameOf(hoverId), true, x, y);
  }
  return { folderId, hovering: true };
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
