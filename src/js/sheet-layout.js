// =============================================================================
// SHEET LAYOUT — the character sheet's sections as rearrangeable widgets
// =============================================================================
'use strict';

// Every section of the sheet below the identity block is a *widget*, and where
// the widgets sit is a **tree of splits** rather than a list. That is the whole
// idea, and it is what answers the question a flat list cannot: when does a
// section run the full width, and when is it stopped by a neighbour?
//
//   A widget has no width of its own. It fills its slot, and the *drop* chooses
//   which slot — so a section's extent is decided by the depth it was dropped
//   at, not by a number stored on it.
//
// Drop a section on the sheet's own top edge and it becomes a band across
// everything. Drop it on the top edge of Combat, which is sharing a row with
// Abilities, and it spans that column only — stopped by Abilities, because the
// slot it split was Combat's, and Combat's slot is half a row. Same gesture,
// two answers, and neither of them is configured anywhere.
//
//   col[ Proficiencies,
//        row[ Abilities, col[ Combat, HP ] ] ]
//
//   +======================================+
//   |  Identity                   (pinned) |
//   +======================================+
//   |  Proficiencies         (full width)  |
//   +------------------+-------------------+
//   |  Abilities       |  Combat           |
//   |  & Skills        +-------------------+
//   |                  |  Hit Points       |
//   +------------------+-------------------+
//
// **The identity block is pinned above all of it, and is not in the tree.**
// Whose sheet this is heads the page; it cannot be dragged away and nothing can
// be dropped above it. There is no `pinned` flag in the model to honour, and no
// special case in the drag: it simply lives outside `#sheet-layout` in
// index.html, `SHEET_WIDGET_IDS` is read from the store inside, and every hit
// test is scoped to the tree. A section that is not in the tree cannot be moved
// by a thing that only moves the tree — so `sanitizeSheetLayout` drops an
// `identity` node left in a layout stored before this, exactly as it drops any
// other id it does not recognise, and the sheet heals itself on load.
//
// **Horizontal splits share space; vertical ones stack at their natural
// height.** The asymmetry is deliberate, and it is the document underneath
// asserting itself: the sheet is a scrolling page of paper — `.paper-sheet` is
// content-sized so its torn edge hugs what is drawn on it (see character.css) —
// and a page has a width but not a height. So a row's children divide its width
// by the shares in `size`, and get a draggable seam between them; a column's
// children are simply as tall as their contents, and have no seam, because
// there is no fixed height for them to divide. Forcing one would only clip a
// section or leave a hole under it.
//
// **The layout is this browser's furniture, not the character's.** Like the
// theme, the panel widths and the browse folders, it describes how *you* read a
// sheet rather than anything about who is on it — and a GM paging through the
// party must keep their own arrangement rather than adopting each player's. So
// it lives in its own localStorage key, is not in the save file, and is never
// synced. That is also why a read-only sheet is still rearrangeable: moving a
// section writes nothing to the character.

const SHEET_LAYOUT_KEY = 'dnd_inventory_sheet_layout';

// How far inside the layout's rim a drop targets the *root* — a full-width band
// or a full-height column — rather than splitting the section under the cursor.
const SHEET_RIM = 24;

// The narrowest a section is allowed to be, and the one number that answers
// both halves of that: a seam will not drag a column below it, and a row whose
// width cannot give every child that much stops being a row and stacks instead
// (`foldNarrowRows`). One constant rather than two, because they are the same
// judgement — a stat tile and a pair of ability columns need the room they need,
// and it makes no difference whether the squeeze came from a seam or from the
// panel being dragged narrower.
const SHEET_MIN_COL = 200;

// The movement that turns a press on a title into a drag rather than a click.
const SHEET_DRAG_SLOP = 4;

// The widgets, in the order they appear in index.html. Read from the markup
// rather than written out again here: the sections *are* the markup, and a
// second list would only be somewhere for the two to disagree.
const SHEET_WIDGET_IDS = Array.from(
  document.querySelectorAll('#sheet-widget-store .sheet-widget')
).map(el => el.dataset.widget);

// =============================================================================
// THE TREE
// =============================================================================
// A node is either a widget or a split:
//
//   { t: 'w', id: 'combat', size: 1 }
//   { t: 's', dir: 'row' | 'col', size: 1, kids: [node, …] }
//
// `size` is the node's share of its parent — used only by `row` parents, for
// the reason above. It is stored on the node rather than in a parallel array on
// the parent so that it travels with the node when one is moved.

function sheetWidgetNode(id, size) { return { t: 'w', id, size: size ?? 1 }; }

// The sheet as it has always looked below the identity block: Abilities &
// Skills beside a column of the shorter boxes, at the same 2:1 the hand-written
// `flex: 2 1 420px` used to give it.
function defaultSheetLayout() {
  return {
    t: 's', dir: 'col', size: 1,
    kids: [
      {
        t: 's', dir: 'row', size: 1,
        kids: [
          sheetWidgetNode('abilities', 2),
          {
            t: 's', dir: 'col', size: 1,
            kids: ['combat', 'hp', 'death', 'prof'].map(id => sheetWidgetNode(id)),
          },
        ],
      },
      // Bands across the bottom. A run of feature cards reads badly in a narrow
      // column and there is no telling how many levels' worth there will be;
      // the written sections want the width for the same reason a page of prose
      // does. Species sits beside Class Features because the two are read
      // together — what your character *is*, either side of one row.
      {
        t: 's', dir: 'row', size: 1,
        kids: [sheetWidgetNode('features'), sheetWidgetNode('species')],
      },
      sheetWidgetNode('backstory'),
      sheetWidgetNode('appearance'),
    ],
  };
}

let sheetLayout = null;

// Tidies a tree into the one canonical shape for what it draws, and is run
// after every edit. Without it the tree accumulates rubbish that changes
// nothing on screen but makes the next drop behave oddly — a split holding one
// child, a row nested directly inside a row, an empty container left behind by
// the section that was just dragged out of it.
//
// Mutates and returns, preserving node identity, because a drop holds a
// reference to the node it landed on and has to find it again afterwards.
function normalizeSheetLayout(node) {
  if (!node) return null;
  if (node.t === 'w') return node;

  const kids = [];
  node.kids.forEach(kid => {
    const n = normalizeSheetLayout(kid);
    if (!n) return;
    if (n.t === 's' && n.dir === node.dir) {
      // A row inside a row is the same row. Fold it in, scaling its children so
      // they keep between them exactly the share the container had.
      const total = n.kids.reduce((sum, k) => sum + k.size, 0) || 1;
      n.kids.forEach(k => { k.size = k.size / total * n.size; kids.push(k); });
      return;
    }
    kids.push(n);
  });

  if (kids.length === 0) return null;
  if (kids.length === 1) { kids[0].size = node.size; return kids[0]; }
  node.kids = kids;
  return node;
}

// Walks every node, in tree order.
function eachSheetNode(node, fn) {
  if (!node) return;
  fn(node);
  if (node.t === 's') node.kids.forEach(k => eachSheetNode(k, fn));
}

function findSheetWidgetNode(id) {
  let found = null;
  eachSheetNode(sheetLayout, n => { if (n.t === 'w' && n.id === id) found = n; });
  return found;
}

function findSheetParent(node, child) {
  if (!node || node.t !== 's') return null;
  if (node.kids.includes(child)) return node;
  for (const kid of node.kids) {
    const p = findSheetParent(kid, child);
    if (p) return p;
  }
  return null;
}

// Takes a widget out of the tree wherever it is. The caller normalizes after —
// this deliberately leaves the hole, because the same pass that closes it is
// the one that folds the emptied containers away.
function detachSheetWidget(node, id) {
  if (!node || node.t !== 's') return false;
  const i = node.kids.findIndex(k => k.t === 'w' && k.id === id);
  if (i >= 0) { node.kids.splice(i, 1); return true; }
  return node.kids.some(k => detachSheetWidget(k, id));
}

// Every widget exactly once, no unknown ids, and a shape that draws. Runs on
// whatever came out of localStorage, which may have been written by an older
// version of the sheet with a different set of sections.
function sanitizeSheetLayout(raw) {
  const seen = new Set();

  function walk(node) {
    if (!node || typeof node !== 'object') return null;
    if (node.t === 'w') {
      if (!SHEET_WIDGET_IDS.includes(node.id) || seen.has(node.id)) return null;
      seen.add(node.id);
      return sheetWidgetNode(node.id, sizeOrOne(node.size));
    }
    if (node.t !== 's' || !Array.isArray(node.kids)) return null;
    return {
      t: 's',
      dir: node.dir === 'row' ? 'row' : 'col',
      size: sizeOrOne(node.size),
      kids: node.kids.map(walk).filter(Boolean),
    };
  }

  let tree = normalizeSheetLayout(walk(raw));

  // A section added to the sheet after this layout was stored has nowhere to be.
  // Down the bottom is the one answer that never displaces anything.
  const missing = SHEET_WIDGET_IDS.filter(id => !seen.has(id));
  if (missing.length) {
    const added = missing.map(id => sheetWidgetNode(id));
    tree = normalizeSheetLayout(
      tree ? { t: 's', dir: 'col', size: 1, kids: [tree, ...added] }
           : { t: 's', dir: 'col', size: 1, kids: added }
    );
  }
  return tree ?? normalizeSheetLayout(defaultSheetLayout());
}

function sizeOrOne(n) {
  const v = parseFloat(n);
  return Number.isFinite(v) && v > 0.01 ? v : 1;
}

// =============================================================================
// PERSISTENCE
// =============================================================================
function loadSheetLayout() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(SHEET_LAYOUT_KEY)); } catch (e) { raw = null; }
  sheetLayout = sanitizeSheetLayout(raw ?? defaultSheetLayout());
}

function saveSheetLayout() {
  try { localStorage.setItem(SHEET_LAYOUT_KEY, JSON.stringify(sheetLayout)); } catch (e) { /* full or blocked */ }
}

// Nothing on the sheet calls this yet — the button it used to sit behind has
// been taken off the page, and it is waiting to be wired up somewhere better
// (Settings is the obvious home). Kept because the arrangement is otherwise
// only recoverable by clearing the browser's storage.
function resetSheetLayout() {
  sheetLayout = normalizeSheetLayout(defaultSheetLayout());
  saveSheetLayout();
  renderSheetLayout();
}

// =============================================================================
// RENDERING
// =============================================================================
// Builds the split containers and *moves* the widget elements into them. The
// widgets themselves are never rebuilt — they are the static markup from
// index.html, with every id, value and listener the sheet has put on them — so
// a rearrange cannot cost an input its contents.
//
// Called once when the sheet is first built, and again after a drop or a reset.
// Not from `renderCharacterSheet()`, which runs on every party roster update:
// re-parenting the whole sheet a few times a second would be absurd.
function renderSheetLayout() {
  const host = document.getElementById('sheet-layout');
  const store = document.getElementById('sheet-widget-store');
  if (!host || !store) return;
  if (!sheetLayout) loadSheetLayout();

  // Park the widgets before clearing the scaffolding, or emptying the host
  // would destroy them along with it.
  host.querySelectorAll('.sheet-widget').forEach(el => store.appendChild(el));
  host.innerHTML = '';
  host.appendChild(buildSheetNode(sheetLayout));
  foldNarrowRows();
}

function buildSheetNode(node) {
  const el = node.t === 'w' ? sheetWidgetEl(node.id) : buildSheetSplit(node);
  applySheetNodeSize(el, node);
  return el;
}

function buildSheetSplit(node) {
  const box = document.createElement('div');
  box.className = 'sheet-split';
  box.dataset.dir = node.dir;

  node.kids.forEach((kid, i) => {
    // A seam per gap, and only in a row: a column's children are their own
    // height and have nothing to divide.
    if (i > 0 && node.dir === 'row') box.appendChild(sheetSeamEl(node, i - 1));
    box.appendChild(buildSheetNode(kid));
  });
  return box;
}

// A node's share of its parent, and *only* that. Whether the share is spent on
// width or ignored in favour of natural height is the parent's business and is
// settled in sheet-layout.css by the parent's direction — which is what lets a
// row that has run out of room fold into a column with one class, without
// anything here having to rewrite every child's `flex`.
function applySheetNodeSize(el, node) {
  el.style.setProperty('--share', node.size);
}

// A row too narrow to give every child `SHEET_MIN_COL` stops being a row and
// stacks instead. The panel is resizable, so this is not a rare edge — it is
// the same fold the sheet has always done, moved from `flex-wrap` (which cannot
// honour the shares the seams set) to a measurement.
//
// Applied **outermost-in**, which `querySelectorAll`'s document order gives for
// free: a row that folds hands its whole width back to the rows inside it, so
// those may no longer need to fold at all. Reading a row's width flushes the
// folds already applied above it, so each measurement sees the layout its
// ancestors have settled on. A folded row still fills its slot, so the width
// read is the one it would have either way and the test does not depend on
// which state it is in.
//
// **The hysteresis is not a nicety.** Folding makes the sheet taller, a taller
// sheet can bring in `#character-sheet`'s scrollbar, and the scrollbar takes
// back the very width that was measured — a row right on the threshold would
// otherwise fold and unfold against its own scrollbar forever. `scrollbar-
// gutter: stable` in the CSS takes most of that away; this is what makes it
// impossible.
const SHEET_FOLD_SLACK = 28;

function foldNarrowRows() {
  const host = document.getElementById('sheet-layout');
  if (!host) return;
  host.querySelectorAll('.sheet-split[data-dir="row"]').forEach(row => {
    const kids = row.querySelectorAll(':scope > :not(.sheet-seam)').length;
    const need = kids * SHEET_MIN_COL;
    const width = row.getBoundingClientRect().width;
    if (row.classList.contains('folded')) {
      if (width >= need + SHEET_FOLD_SLACK) row.classList.remove('folded');
    } else if (width < need) {
      row.classList.add('folded');
    }
  });
}

function sheetWidgetEl(id) {
  return document.querySelector(`.sheet-widget[data-widget="${id}"]`);
}

function sheetWidgetLabel(id) {
  const el = sheetWidgetEl(id);
  return el ? el.querySelector('.widget-title').textContent.trim() : id;
}

// =============================================================================
// RESIZING A ROW
// =============================================================================
// The seam between two of a row's children. Dragging it moves width from one to
// the other and leaves every other child alone, so a three-way row can be tuned
// a pair at a time. Double-click evens the two out again.
function sheetSeamEl(split, index) {
  const seam = document.createElement('div');
  seam.className = 'sheet-seam';
  seam.title = 'Drag to resize · double-click to even out';

  seam.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.preventDefault();
    seam.setPointerCapture(e.pointerId);
    seam.classList.add('dragging');

    const a = split.kids[index], b = split.kids[index + 1];
    const aEl = seam.previousElementSibling, bEl = seam.nextElementSibling;
    const startX = e.clientX;
    const aPx = aEl.getBoundingClientRect().width;
    const bPx = bEl.getBoundingClientRect().width;
    const totalPx = aPx + bPx;
    const totalSize = a.size + b.size;

    const onMove = ev => {
      // Clamped in pixels rather than in shares: what "too narrow" means is a
      // width on screen, and a share means nothing without the row's width.
      const wanted = Math.max(SHEET_MIN_COL, Math.min(totalPx - SHEET_MIN_COL, aPx + (ev.clientX - startX)));
      a.size = totalSize * (wanted / totalPx);
      b.size = totalSize - a.size;
      applySheetNodeSize(aEl, a);
      applySheetNodeSize(bEl, b);
    };
    const onUp = () => {
      seam.classList.remove('dragging');
      seam.removeEventListener('pointermove', onMove);
      seam.removeEventListener('pointerup', onUp);
      seam.removeEventListener('pointercancel', onUp);
      saveSheetLayout();
    };
    seam.addEventListener('pointermove', onMove);
    seam.addEventListener('pointerup', onUp);
    seam.addEventListener('pointercancel', onUp);
  });

  seam.addEventListener('dblclick', () => {
    const a = split.kids[index], b = split.kids[index + 1];
    const half = (a.size + b.size) / 2;
    a.size = b.size = half;
    saveSheetLayout();
    renderSheetLayout();
  });

  return seam;
}

// =============================================================================
// DRAGGING A SECTION
// =============================================================================
// Press on a section's title and move, and the section follows the cursor as a
// choice of slot. Not the HTML5 drag-and-drop API: the rest of the app drags
// with pointer events and bounding-rect hit tests, and this has to agree with
// the drop feedback the browse list and equip rack already give.
let sheetDrag = null;

document.getElementById('character-sheet').addEventListener('pointerdown', e => {
  const title = e.target.closest('.widget-title');
  if (!title || e.button !== 0) return;
  // A section's header may carry its own controls (Class Features has a
  // show/hide toggle). Pressing one is not the start of a drag, and without
  // this the button would work but the smallest wobble would pick the section
  // up instead.
  if (e.target.closest('button, a, input, select, textarea')) return;
  const widget = title.closest('.sheet-widget');
  if (!widget || !widget.closest('#sheet-layout')) return;

  e.preventDefault(); // or the title's text selects instead of dragging
  sheetDrag = {
    id: widget.dataset.widget,
    el: widget,
    startX: e.clientX,
    startY: e.clientY,
    live: false,
    target: null,
    pointerId: e.pointerId,
  };
  window.addEventListener('pointermove', onSheetDragMove);
  window.addEventListener('pointerup', onSheetDragEnd);
  window.addEventListener('pointercancel', onSheetDragCancel);
  window.addEventListener('keydown', onSheetDragKey, true);
});

function onSheetDragMove(e) {
  if (!sheetDrag) return;
  if (!sheetDrag.live) {
    // A press that never moves is a click on a heading, not a drag.
    if (Math.abs(e.clientX - sheetDrag.startX) < SHEET_DRAG_SLOP &&
        Math.abs(e.clientY - sheetDrag.startY) < SHEET_DRAG_SLOP) return;
    sheetDrag.live = true;
    document.getElementById('character-sheet').classList.add('sheet-arranging');
    sheetDrag.el.classList.add('dragging');
    // The sheet is taller than the panel, so the slot being aimed at is often
    // scrolled out of sight. Same edge pull the browse list and grid use.
    startDragAutoScroll(e.clientX, e.clientY, sheetDragRefresh);
  }
  updateDragAutoScroll(e.clientX, e.clientY);
  sheetDragRefresh(e.clientX, e.clientY);
}

// Re-run on a frame that auto-scrolled as well as on a real move: the cursor
// has not moved but the sections under it have.
function sheetDragRefresh(x, y) {
  if (!sheetDrag) return;
  sheetDrag.target = sheetDropTargetAt(x, y);
  showSheetDropFeedback(sheetDrag.target, x, y);
}

function onSheetDragEnd() {
  const drag = sheetDrag;
  if (!drag) return;
  endSheetDrag();
  if (!drag.live || !drag.target) return;
  applySheetDrop(drag.id, drag.target);
}

function onSheetDragCancel() { endSheetDrag(); }

function onSheetDragKey(e) {
  if (e.key === 'Escape' && sheetDrag) { e.stopPropagation(); endSheetDrag(); }
}

function endSheetDrag() {
  if (!sheetDrag) return;
  stopDragAutoScroll();
  sheetDrag.el.classList.remove('dragging');
  document.getElementById('character-sheet').classList.remove('sheet-arranging');
  hideSheetDropFeedback();
  sheetDrag = null;
  window.removeEventListener('pointermove', onSheetDragMove);
  window.removeEventListener('pointerup', onSheetDragEnd);
  window.removeEventListener('pointercancel', onSheetDragCancel);
  window.removeEventListener('keydown', onSheetDragKey, true);
}

// =============================================================================
// WHERE THE DROP LANDS
// =============================================================================
// Two kinds of answer, and which one you get is the whole feature:
//
//   `root`  — the cursor is on the rim of the sheet, so the section becomes a
//             band across the full width (or a column down the full height).
//   a widget — the cursor is over a section, so that section's *slot* splits and
//             the new arrival is stopped by whatever already bounds that slot.
//
// The rim is tested first and is deliberately thin. Everywhere else inside the
// sheet resolves to a section, because a drag that lands on nothing reads as
// broken — so a cursor in the gap between two sections takes the nearer one
// rather than returning null.
function sheetDropTargetAt(x, y) {
  const host = document.getElementById('sheet-layout');
  const paper = document.querySelector('#character-sheet .sheet-scroll');
  if (!host || !paper) return null;

  const pr = paper.getBoundingClientRect();
  if (x < pr.left || x > pr.right || y < pr.top || y > pr.bottom) return null;

  const hr = host.getBoundingClientRect();

  // Distances to the layout's four edges. Only an edge actually on screen can
  // be close to the cursor: scroll the sheet away from the top and `dTop` grows
  // past the band on its own, which is why the rim needs no scroll arithmetic.
  const d = {
    top: y - hr.top, bottom: hr.bottom - y,
    left: x - hr.left, right: hr.right - x,
  };
  const nearest = Object.keys(d).reduce((a, b) => (d[a] <= d[b] ? a : b));
  if (d[nearest] < SHEET_RIM) return { root: true, edge: nearest, rect: hr };

  // Otherwise: the section under the cursor, or the nearest one to it.
  let best = null, bestDist = Infinity;
  host.querySelectorAll('.sheet-widget').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    const dx = Math.max(r.left - x, 0, x - r.right);
    const dy = Math.max(r.top - y, 0, y - r.bottom);
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) { bestDist = dist; best = { el, rect: r }; }
  });
  if (!best) return null;

  const node = findSheetWidgetNode(best.el.dataset.widget);
  if (!node) return null;
  return { root: false, node, el: best.el, rect: best.rect, edge: nearestEdgeOf(best.rect, x, y) };
}

// Which edge the cursor is nearest, measured as a *fraction* of each dimension
// rather than in pixels. A section can be short and wide or tall and narrow;
// comparing raw distances would make the long sides almost unreachable on one
// and the short sides on the other.
function nearestEdgeOf(r, x, y) {
  const fx = (x - r.left) / (r.width || 1);
  const fy = (y - r.top) / (r.height || 1);
  const f = { left: fx, right: 1 - fx, top: fy, bottom: 1 - fy };
  return Object.keys(f).reduce((a, b) => (f[a] <= f[b] ? a : b));
}

// =============================================================================
// DROP FEEDBACK
// =============================================================================
// The shaded slab is where the section will go; the chip names the drop,
// because on a long sheet the slab often runs off the bottom of the panel and
// "full width" and "beside Combat" then look much the same. Both come out of
// this one call, so they cannot disagree about what the drop will do.
function showSheetDropFeedback(target, x, y) {
  const zone = document.getElementById('sheet-drop-zone');
  const hint = document.getElementById('sheet-drop-hint');
  const paper = document.querySelector('#character-sheet .sheet-scroll');
  if (!zone || !hint || !paper) return;

  // Dropping a section back onto itself is not a move. Say so rather than
  // showing a slab exactly where the section already is.
  const onSelf = target && !target.root && target.node.id === sheetDrag.id;
  if (!target || onSelf) {
    zone.classList.add('hidden');
    if (!target) { hint.classList.add('hidden'); return; }
  }

  const base = paper.getBoundingClientRect();

  if (target && !onSelf) {
    const r = target.rect;
    // The rim's slab is a band along the sheet's edge; a section's is the half
    // of it the arrival will take.
    const depth = target.root
      ? Math.max(56, (target.edge === 'top' || target.edge === 'bottom' ? r.height : r.width) * 0.18)
      : (target.edge === 'top' || target.edge === 'bottom' ? r.height : r.width) / 2;

    const box = {
      left: r.left, top: r.top, width: r.width, height: r.height,
    };
    if (target.edge === 'top')    box.height = depth;
    if (target.edge === 'bottom') { box.top = r.bottom - depth; box.height = depth; }
    if (target.edge === 'left')   box.width = depth;
    if (target.edge === 'right')  { box.left = r.right - depth; box.width = depth; }

    zone.classList.remove('hidden');
    zone.classList.toggle('root', !!target.root);
    zone.style.left   = (box.left - base.left) + 'px';
    zone.style.top    = (box.top - base.top) + 'px';
    zone.style.width  = box.width + 'px';
    zone.style.height = box.height + 'px';
  }

  hint.classList.remove('hidden');
  hint.classList.toggle('inert', !!onSelf);
  hint.textContent = describeSheetDrop(target, onSelf);
  // Measured after the text is in — the chip is as wide as the section's name.
  const hw = hint.offsetWidth, hh = hint.offsetHeight;
  const flipX = x + 16 + hw > window.innerWidth;
  hint.style.left = (x - base.left + (flipX ? -16 - hw : 16)) + 'px';
  hint.style.top  = (y - base.top - hh - 12) + 'px';
}

function describeSheetDrop(target, onSelf) {
  if (onSelf) return 'Back where it started';
  if (target.root) {
    return {
      top: 'Full width, across the top',
      bottom: 'Full width, across the bottom',
      left: 'Full height, down the left',
      right: 'Full height, down the right',
    }[target.edge];
  }
  const name = sheetWidgetLabel(target.node.id);
  return { left: 'Left of ', right: 'Right of ', top: 'Above ', bottom: 'Below ' }[target.edge] + name;
}

function hideSheetDropFeedback() {
  document.getElementById('sheet-drop-zone').classList.add('hidden');
  document.getElementById('sheet-drop-hint').classList.add('hidden');
}

// =============================================================================
// APPLYING THE DROP
// =============================================================================
// Take the section out, tidy up after it, then put it back where the drop said.
// In that order: removing first means the tree the insert works on is the one
// the drop will actually produce, so a section dragged out of a two-section row
// does not have to be inserted into a row that is about to collapse.
function applySheetDrop(id, target) {
  if (!target.root && target.node.id === id) return;

  const moving = findSheetWidgetNode(id);
  if (!moving) return;

  detachSheetWidget(sheetLayout, id);
  sheetLayout = normalizeSheetLayout(sheetLayout);
  // Nothing left to be moved relative to — a one-section sheet has one slot,
  // and it is already in it.
  if (!sheetLayout || sheetLayout === moving) { sheetLayout = moving; return; }
  if (target.root) sheetLayout = insertAtSheetRoot(moving, target.edge);
  else sheetLayout = insertBesideSheetNode(moving, target.node, target.edge);

  sheetLayout = normalizeSheetLayout(sheetLayout);
  saveSheetLayout();
  renderSheetLayout();
}

// The section splits the target's slot. If the target already sits in a split
// running the right way, the arrival simply joins that split beside it and
// takes half of the target's share — so the other children do not shuffle. If
// not, the target's slot becomes a new split holding the two of them, which is
// what puts the arrival inside whatever bounds the target rather than across
// the sheet.
function insertBesideSheetNode(moving, target, edge) {
  const dir = (edge === 'left' || edge === 'right') ? 'row' : 'col';
  const before = (edge === 'left' || edge === 'top');
  const parent = findSheetParent(sheetLayout, target);

  if (parent && parent.dir === dir) {
    const i = parent.kids.indexOf(target);
    target.size = target.size / 2;
    moving.size = target.size;
    parent.kids.splice(before ? i : i + 1, 0, moving);
    return sheetLayout;
  }

  const split = { t: 's', dir, size: target.size, kids: [] };
  target.size = 1;
  moving.size = 1;
  split.kids = before ? [moving, target] : [target, moving];

  if (!parent) return split;                              // the target was the root
  parent.kids[parent.kids.indexOf(target)] = split;
  return sheetLayout;
}

// The rim: the section becomes a band across the whole sheet. It joins the root
// split when that already runs the right way, and otherwise the whole existing
// layout is demoted to one side of a new one.
function insertAtSheetRoot(moving, edge) {
  const dir = (edge === 'left' || edge === 'right') ? 'row' : 'col';
  const before = (edge === 'left' || edge === 'top');
  moving.size = 1;

  if (sheetLayout.t === 's' && sheetLayout.dir === dir) {
    sheetLayout.kids.splice(before ? 0 : sheetLayout.kids.length, 0, moving);
    return sheetLayout;
  }
  sheetLayout.size = 1;
  return {
    t: 's', dir, size: 1,
    kids: before ? [moving, sheetLayout] : [sheetLayout, moving],
  };
}

// =============================================================================
// WIRING
// =============================================================================
// Called from `buildCharacterSheet()`, so the layout is put together with the
// rest of the sheet the first time it is shown and not before — the sheet is
// one of two views of a character and may never be opened at all.
function ensureSheetLayout() {
  loadSheetLayout();
  renderSheetLayout();
  watchSheetWidth();
}

// The panel is dragged wider and narrower by the resizer beside it, and whether
// a row still has the room to be a row changes as that happens. Only the folds
// are recomputed — never the tree, and never the DOM — so this costs nothing and
// cannot pull an input out from under someone mid-keystroke.
let sheetWidthObserver = null;
let lastSheetWidth = -1;

function watchSheetWidth() {
  if (sheetWidthObserver || typeof ResizeObserver === 'undefined') return;
  sheetWidthObserver = new ResizeObserver(entries => {
    // Width only. Folding a row changes the layout's *height*, which would
    // otherwise call this straight back — and answer the same question again.
    const w = Math.round(entries[0].contentRect.width);
    if (w === lastSheetWidth) return;
    lastSheetWidth = w;
    foldNarrowRows();
  });
  sheetWidthObserver.observe(document.getElementById('sheet-layout'));
}
