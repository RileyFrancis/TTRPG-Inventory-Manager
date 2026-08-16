// =============================================================================
// MAIN — Entry point: wires everything together and boots the app
// =============================================================================
'use strict';

// =============================================================================
// VERSION
// =============================================================================
// The number itself lives in the `VERSION` file at the project root — one line,
// nothing else, so bumping a release never means opening a source file.
//
// Fetched rather than baked in, and deliberately *not* with the synchronous XHR
// items.csv and .env use: nothing on screen depends on it, so it has no business
// holding up the boot. The footer fills itself in a moment later.
let APP_VERSION = '';

function loadAppVersion() {
  fetch('VERSION')
    .then(res => (res.ok ? res.text() : Promise.reject(new Error(res.status))))
    .then(text => {
      const version = text.trim().split('\n')[0].trim();
      // A static host that answers a missing path with its index page (Cloudflare
      // Pages does) returns 200 and a pageful of HTML — not a version.
      if (!version || version.startsWith('<')) return;
      APP_VERSION = version;
      document.getElementById('app-version').textContent = 'v' + version;
    })
    .catch(() => { /* no VERSION file — the footer simply stays empty */ });
}

// =============================================================================
// INITIALIZATION
// =============================================================================
function init() {
  loadAppVersion(); // async; everything below runs without waiting for it
  initTheme();      // Before any render: rarity colours are read from the active palette
  loadPanelLayout(); // Side-panel widths / collapsed state — stored per browser
  loadDefaultItems();
  DEFAULT_ITEMS.forEach(t => { state.db[t.id] = t; });
  autoLoad();       // Restore last session (includes equipLayout if saved)
  loadFolders();    // Browse-list folders — stored per browser, not in the save file
  loadSlotConfig(); // Fallback: migrate old config or apply defaults if layout not yet set
  rebuildGrid(); // Sizes grid from restored character.strength, places saved instances
  renderItemList();
  renderEquipPanel();
  syncCharacterViewUI(); // character tabs — solo, that is the one own-tab
  initFirebase();
  initAuth();       // restores a previous session, which then starts cloud sync
}

init();
