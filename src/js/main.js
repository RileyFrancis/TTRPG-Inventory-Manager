// =============================================================================
// MAIN — Entry point: wires everything together and boots the app
// =============================================================================
'use strict';

// The number lives in the `VERSION` file at the project root. Fetched (not
// baked in) and async — nothing on screen depends on it, so it must not hold up
// the boot.
let APP_VERSION = '';

function loadAppVersion() {
  fetch('VERSION')
    .then(res => (res.ok ? res.text() : Promise.reject(new Error(res.status))))
    .then(text => {
      const version = text.trim().split('\n')[0].trim();
      // A host answering a missing path with its index page returns 200 and HTML.
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
  autoLoad();       // Restore last session — the whole roster of characters
  ensureCharacter();// Never no character: a first run mints one
  loadFolders();    // Browse-list folders — stored per browser, not in the save file
  loadItemSort();   // Browse-list sort order — likewise this browser's own
  loadSlotConfig(); // Fallback: migrate old config or apply defaults if layout not yet set
  rebuildGrid(); // Sizes grid from restored character.strength, places saved instances
  renderItemList();
  renderEquipPanel();
  syncCharacterViewUI(); // character tabs — solo, that is the one own-tab
  // A guess before Firebase answers, corrected by auth.js — see maybeOpenHomeAtBoot().
  maybeOpenHomeAtBoot();
  initFirebase();
  initAuth();       // restores a previous session, which then starts cloud sync
}

init();
