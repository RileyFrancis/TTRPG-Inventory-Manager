// =============================================================================
// DRAG-SCROLL — Edge auto-scroll while an item is being dragged
// =============================================================================
'use strict';

// Holding a held drag's cursor near a scrollable container's edge pulls the
// content along (the wheel is unreachable with the button down). Only HELD
// drags — placing mode follows a free cursor that would scroll forever. The rAF
// loop runs for the whole drag; velocity is simply zero away from an edge. See
// CLAUDE.md § Edge auto-scroll.

const DRAG_SCROLL_EDGE = 56; // px of a container's edge that pulls
const DRAG_SCROLL_MAX  = 22; // px per frame with the cursor right on the edge

// Explicit rather than "any scrollable ancestor" — same bounding-rect approach
// the equip cards and folder headers use (the ghost sits under the cursor and
// elementFromPoint would keep finding it).
const DRAG_SCROLLERS = ['#item-list', '#grid-scroll', '#equip-slots-scroll', '.shop-body', '#character-sheet'];

let dragScrollRaf = null;
let dragScrollRefresh = null;
let dragScrollX = 0;
let dragScrollY = 0;

// `refresh(x, y)` is the drag's own pointermove logic — re-run on every frame
// that scrolls, because the cursor has not moved but the content under it has.
function startDragAutoScroll(x, y, refresh) {
  dragScrollX = x;
  dragScrollY = y;
  dragScrollRefresh = refresh ?? null;
  // Cancel before queueing, so there is exactly one loop however a previous drag ended.
  stopDragAutoScrollLoop();
  dragScrollRaf = requestAnimationFrame(dragScrollFrame);
}

function updateDragAutoScroll(x, y) {
  dragScrollX = x;
  dragScrollY = y;
}

function stopDragAutoScroll() {
  stopDragAutoScrollLoop();
  dragScrollRefresh = null;
}

function stopDragAutoScrollLoop() {
  if (dragScrollRaf !== null) cancelAnimationFrame(dragScrollRaf);
  dragScrollRaf = null;
}

function dragScrollFrame() {
  dragScrollRaf = requestAnimationFrame(dragScrollFrame);
  const el = dragScrollerAtPoint(dragScrollX, dragScrollY);
  if (!el) return;

  const r = el.getBoundingClientRect();
  const dx = edgeScrollVelocity(dragScrollX, r.left, r.right);
  const dy = edgeScrollVelocity(dragScrollY, r.top, r.bottom);
  if (dx === 0 && dy === 0) return;

  const wasLeft = el.scrollLeft, wasTop = el.scrollTop;
  el.scrollLeft += dx;
  el.scrollTop  += dy;
  // At either end of the container there is nothing left to give, and re-running
  // the drag's hover logic on an unchanged view would be pure churn.
  if ((el.scrollLeft !== wasLeft || el.scrollTop !== wasTop) && dragScrollRefresh) {
    dragScrollRefresh(dragScrollX, dragScrollY);
  }
}

// The container under the cursor, or null. Horizontally the cursor must be
// INSIDE (the panels sit side by side); vertically the band reaches past both
// edges (above/below a scroller is its own panel's header/footer).
function dragScrollerAtPoint(x, y) {
  for (const sel of DRAG_SCROLLERS) {
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue; // a hidden panel
      if (x < r.left || x > r.right) continue;
      if (y < r.top - DRAG_SCROLL_EDGE || y > r.bottom + DRAG_SCROLL_EDGE) continue;
      return el;
    }
  }
  return null;
}

// Zero away from the edges, ramping to full speed at the edge itself and staying
// there past it — the pull is strongest exactly where the drag is heading.
function edgeScrollVelocity(pos, min, max) {
  if (pos < min + DRAG_SCROLL_EDGE) return -edgeScrollRamp(pos - min);
  if (pos > max - DRAG_SCROLL_EDGE) return  edgeScrollRamp(max - pos);
  return 0;
}

// `depth` is how far inside the edge the cursor is; negative means past it.
function edgeScrollRamp(depth) {
  const t = 1 - Math.max(0, depth) / DRAG_SCROLL_EDGE;
  return Math.max(1, Math.round(DRAG_SCROLL_MAX * t));
}
