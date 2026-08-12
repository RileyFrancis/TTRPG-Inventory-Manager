// =============================================================================
// MAIN — Entry point: wires everything together and boots the app
// =============================================================================
'use strict';

// =============================================================================
// INITIALIZATION
// =============================================================================
function init() {
  loadDefaultItems();
  DEFAULT_ITEMS.forEach(t => { state.db[t.id] = t; });
  autoLoad();       // Restore last session (includes equipLayout if saved)
  loadSlotConfig(); // Fallback: migrate old config or apply defaults if layout not yet set
  rebuildGrid(); // Sizes grid from restored character.strength, places saved instances
  renderItemList();
  renderEquipPanel();
  initFirebase();
}

init();
