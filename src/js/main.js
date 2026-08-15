// =============================================================================
// MAIN — Entry point: wires everything together and boots the app
// =============================================================================
'use strict';

// =============================================================================
// INITIALIZATION
// =============================================================================
function init() {
  initTheme();      // Before any render: rarity colours are read from the active palette
  loadDefaultItems();
  DEFAULT_ITEMS.forEach(t => { state.db[t.id] = t; });
  autoLoad();       // Restore last session (includes equipLayout if saved)
  loadFolders();    // Browse-list folders — stored per browser, not in the save file
  loadSlotConfig(); // Fallback: migrate old config or apply defaults if layout not yet set
  rebuildGrid(); // Sizes grid from restored character.strength, places saved instances
  renderItemList();
  renderEquipPanel();
  initFirebase();
}

init();
