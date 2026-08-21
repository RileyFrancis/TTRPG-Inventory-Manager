// =============================================================================
// INTERACTION-DRAG — DRAGGING mode for placed items, plus R-key rotation
// =============================================================================
'use strict';

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
  // Hold the cursor near a panel's edge and the panel scrolls, so a grid row or
  // an equip slot below the fold is still reachable without letting go.
  startDragAutoScroll(e.clientX, e.clientY, dragMoveAt);
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
  startDragAutoScroll(e.clientX, e.clientY, dragMoveAt);
  document.addEventListener('pointermove', onDragMove);
  document.addEventListener('pointerup', onDragEnd);
  e.preventDefault();
}

// Re-runs onDragMove for a cursor that has not moved, on the frames where
// auto-scroll moved the content under it instead.
function dragMoveAt(x, y) { onDragMove({ clientX: x, clientY: y }); }

function onDragMove(e) {
  if (state.mode !== 'dragging') return;
  updateDragAutoScroll(e.clientX, e.clientY);
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
  stopDragAutoScroll();

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
        inst.containerId = state.activeContainer ?? null;
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
      stopDragAutoScroll();
      state.mode = 'idle';
      state.dragging = null;
      hideGhost();
      clearHighlights();
      renderAllItems();
    }
  }
});
