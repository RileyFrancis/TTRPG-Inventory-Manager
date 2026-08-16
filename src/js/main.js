// =============================================================================
// MAIN — Entry point: wires everything together and boots the app
// =============================================================================
'use strict';

// =============================================================================
// INITIALIZATION
// =============================================================================
function init() {
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
