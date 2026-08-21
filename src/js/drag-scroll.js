// =============================================================================
// DRAG-SCROLL — Edge auto-scroll while an item is being dragged
// =============================================================================
'use strict';

// =============================================================================
// EDGE AUTO-SCROLL
// =============================================================================
// A drag holds the pointer button down, so the wheel is the only way to reach a
// folder or a grid row that is scrolled out of view — and letting go to scroll
// ends the drag. Holding the cursor near a scrollable container's edge therefore
// pulls the content along, the way file managers and calendars do.
//
// Only *held* drags scroll. Placing mode follows a free cursor with no button
// down, and a cursor left resting near an edge would scroll the list forever.
//
// The loop runs for the whole drag rather than being started and stopped as the
// cursor crosses in and out of an edge band: the velocity is simply zero away
// from an edge, which keeps the start/stop calls to one each per drag and leaves
// nothing to leak if a drag ends in an unusual way.

const DRAG_SCROLL_EDGE = 56; // px of a container's edge that pulls
const DRAG_SCROLL_MAX  = 22; // px per frame with the cursor right on the edge

// Every container a drag can drop into, and so must be able to reach the end of.
// Explicit rather than "any scrollable ancestor": the same bounding-rect
// approach the equip cards and folder headers use, for the same reason — the
// ghost sits under the cursor and elementFromPoint would keep finding it.
const DRAG_SCROLLERS = ['#item-list', '#grid-scroll', '#equip-slots-scroll', '.shop-body'];

let dragScrollRaf = null;
let dragScrollRefresh = null;
let dragScrollX = 0;
let dragScrollY = 0;

// `refresh(x, y)` is the drag's own pointermove logic. It has to run again on
// every frame that actually scrolls: the cursor has not moved, but the content
// under it has, so the highlighted folder or grid cell is otherwise a frame's
// worth of scrolling out of date — and stale by the whole scroll by the drop.
function startDragAutoScroll(x, y, refresh) {
  dragScrollX = x;
  dragScrollY = y;
  dragScrollRefresh = refresh ?? null;
  // Cancel before queueing rather than bailing out when one is already pending:
  // there is then exactly one loop however a previous drag ended.
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

// The container under the cursor, or null.
//
// Horizontally the cursor must be *inside*: the panels sit side by side, so a
// band reaching past the left or right edge would let a drag in one panel scroll
// its neighbour. Vertically the band reaches past both edges, because what lies
// above and below a scroller is its own panel's header and footer — overshooting
// the bottom edge by an inch should keep pulling, not stall.
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
