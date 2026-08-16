// =============================================================================
// PANELS — Resizing and collapsing the two side panels
// =============================================================================
'use strict';

// Both side panels — equipment on the left, the item browser on the right — are
// dragged by the handle sitting on their inner border. Drag one narrow enough
// and it folds away entirely, leaving a round button in that corner to bring it
// back.
//
// Like the theme and the browse folders, these are *this browser's* window
// furniture rather than anything about the character, so they live in their own
// localStorage key and never go in the save file or the party data.

const PANELS_KEY = 'dnd_inventory_panels';

// A panel narrower than MIN is not useful, so the handle stops there; keep
// pulling past COLLAPSE_AT and it folds away instead of shrinking further.
const PANEL_MIN = 150;
const PANEL_COLLAPSE_AT = 100;
const PANEL_MAX_FRACTION = 0.4; // of the window, so a panel can never crowd out the grid

const PANEL_DEFAULTS = { equip: 210, sidebar: 300 };

const panels = {
  equip: PANEL_DEFAULTS.equip,
  sidebar: PANEL_DEFAULTS.sidebar,
  equipCollapsed: false,
  sidebarCollapsed: false,
};

function panelMaxWidth() {
  return Math.round(window.innerWidth * PANEL_MAX_FRACTION);
}

function clampPanelWidth(px) {
  return Math.round(Math.max(PANEL_MIN, Math.min(px, panelMaxWidth())));
}

function loadPanelLayout() {
  try {
    const raw = localStorage.getItem(PANELS_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (Number.isFinite(data.equip))   panels.equip   = clampPanelWidth(data.equip);
      if (Number.isFinite(data.sidebar)) panels.sidebar = clampPanelWidth(data.sidebar);
      panels.equipCollapsed   = !!data.equipCollapsed;
      panels.sidebarCollapsed = !!data.sidebarCollapsed;
    }
  } catch (e) {
    // Corrupt entry or storage disabled — the defaults are already in place.
  }
  applyPanelLayout();
}

function savePanelLayout() {
  try {
    localStorage.setItem(PANELS_KEY, JSON.stringify(panels));
  } catch (e) { /* non-fatal */ }
}

function applyPanelLayout() {
  const app = document.getElementById('app');
  app.style.setProperty('--equip-w', panels.equip + 'px');
  app.style.setProperty('--sidebar-w', panels.sidebar + 'px');
  // One class per side drives everything: the panel and its handle go away, the
  // round reopen button appears, and the character tabs make room for it.
  app.classList.toggle('equip-collapsed', panels.equipCollapsed);
  app.classList.toggle('sidebar-collapsed', panels.sidebarCollapsed);
}

function setPanelCollapsed(side, collapsed) {
  panels[side + 'Collapsed'] = collapsed;
  // Reopening a panel that was dragged down to the minimum would give back a
  // sliver — hand back the default width instead.
  if (!collapsed && panels[side] < PANEL_MIN) panels[side] = PANEL_DEFAULTS[side];
  applyPanelLayout();
  savePanelLayout();
}

// =============================================================================
// DRAGGING THE HANDLE
// =============================================================================
function startPanelResize(e, side) {
  if (e.button !== 0) return;
  e.preventDefault(); // no text selection while dragging

  const layout = document.getElementById('main-layout').getBoundingClientRect();
  const handle = e.currentTarget;
  handle.classList.add('dragging');
  document.body.style.userSelect = 'none';
  document.body.style.cursor = 'col-resize';

  const onMove = me => {
    // Width the panel *would* have if it followed the cursor exactly. The panel
    // collapses and un-collapses live from that raw number, so dragging back
    // out brings it straight back rather than needing the reopen button.
    const raw = side === 'equip' ? me.clientX - layout.left : layout.right - me.clientX;
    if (raw < PANEL_COLLAPSE_AT) {
      panels[side + 'Collapsed'] = true;
    } else {
      panels[side + 'Collapsed'] = false;
      panels[side] = clampPanelWidth(raw);
    }
    applyPanelLayout();
  };

  const onUp = () => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    handle.classList.remove('dragging');
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
    savePanelLayout();
  };

  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
}

document.querySelectorAll('.panel-resizer').forEach(handle => {
  const side = handle.dataset.side;
  handle.addEventListener('pointerdown', e => startPanelResize(e, side));
  handle.addEventListener('dblclick', () => setPanelCollapsed(side, true));
});

document.getElementById('show-equip-btn')
  .addEventListener('click', () => setPanelCollapsed('equip', false));
document.getElementById('show-sidebar-btn')
  .addEventListener('click', () => setPanelCollapsed('sidebar', false));

// A window narrow enough can put a stored width over the cap — pull it back in
// rather than letting a panel squeeze the grid to nothing.
window.addEventListener('resize', () => {
  const max = panelMaxWidth();
  if (panels.equip <= max && panels.sidebar <= max) return;
  panels.equip   = clampPanelWidth(panels.equip);
  panels.sidebar = clampPanelWidth(panels.sidebar);
  applyPanelLayout();
  savePanelLayout();
});
