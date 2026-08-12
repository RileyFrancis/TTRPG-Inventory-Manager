// =============================================================================
// STATE — The single mutable app state object + convenience accessors
// =============================================================================
'use strict';

// =============================================================================
// STATE
// =============================================================================
const state = {
  character: { name: 'Unnamed Hero', strength: 10 },
  // Grid: 2D array [row][col] = instanceId | null
  grid: [],
  // Map of instanceId -> PlacedInstance
  instances: {},
  // Item database (templates), keyed by id
  db: {},
  // Current interaction mode
  mode: 'idle',  // 'idle' | 'placing' | 'dragging'
  placing: null, // { templateId, rotation }
  dragging: null, // { instanceId, anchorRow, anchorCol, origRow, origCol, origRotation }
  // Currently selected (shown in details tab)
  selected: null, // { type:'instance'|'template', id }
  // Shape editor state (inside item modal)
  editorShape: [[1]],
  editingItemId: null, // null = new item
  // Equipped items: { [slotId]: instanceId | null }
  equipped: {},
  // Equipment panel layout — ordered array of header/slot items (persisted separately)
  equipLayout: [],
  // Container view: null = main inventory, instanceId = viewing that container's interior
  activeContainer: null,
  // Per-container internal grids: { [instanceId]: 2D array }
  containerGrids: {},
  // Party session
  party: {
    active: false,
    code: null,
    role: null,           // 'gm' | 'player'
    playerId: null,       // our session ID
    playerName: null,
    viewingPlayerId: null, // which player's inventory we're viewing (null = own for player, none for GM)
    ownState: null,       // saved own state when player views another's inventory
    players: {},          // Firebase cache: { [id]: { name, connected, character, instances, customDb } }
  },
};

// Convenience
function gridRows() { return state.character.strength * 3; }
function normalRows() { return state.character.strength; }

function activeGrid() {
  return state.activeContainer
    ? (state.containerGrids[state.activeContainer] ?? state.grid)
    : state.grid;
}
function activeGridCols() {
  if (!state.activeContainer) return GRID_COLS;
  const t = state.db[state.instances[state.activeContainer]?.templateId];
  return t?.containerCols ?? 5;
}
function activeGridRows() {
  if (!state.activeContainer) return gridRows();
  const t = state.db[state.instances[state.activeContainer]?.templateId];
  return t?.containerRows ?? 5;
}
