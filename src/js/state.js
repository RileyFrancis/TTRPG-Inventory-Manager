// =============================================================================
// STATE — The single mutable app state object + convenience accessors
// =============================================================================
'use strict';

// =============================================================================
// STATE
// =============================================================================
const state = {
  // The character on screen — the *working copy* of one slot out of
  // `state.characters`. Everything below (grid, instances, equipped, db)
  // belongs to it; characters.js is the only place that swaps them over.
  character: { id: null, name: 'Unnamed Hero', strength: 10, level: 1, race: '', classLevels: [] },
  // The account's roster: { [charId]: { character, instances, equipped, equipLayout, db } }
  characters: {},
  activeCharacterId: null,
  // The campaigns this account plays in, keyed by party code. A *bookmark*, not
  // the campaign itself — the campaign lives under `parties/<code>` in Firebase
  // and is shared by everyone at the table. This is the half that says "I have a
  // seat there, and this character sits in it". campaigns.js owns it.
  campaigns: {},          // { [code]: { code, name, role, characterId, gmName, memberCount, lastPlayed } }
  // Which page is up. The home screen is a page in front of the app, not a
  // panel inside it — UI position, never saved.
  screen: 'app',      // 'app' | 'home'
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
  // Browse-list folders — user-made grouping of the item catalogue.
  // Persisted per browser by folders.js, deliberately not in the save file.
  folders: [],         // ordered [{ id, name }]
  folderAssign: {},    // { [templateId]: folderId }
  folderCollapsed: {}, // { [folderId]: true }
  // Which order the Browse list is in. Persisted per browser by item-sort.js,
  // beside the folders and for the same reason — it describes the catalogue.
  itemSort: 'rarity',  // an id from ITEM_SORTS
  itemSortReverse: false,  // that sort's chain, negated
  // Equipped items: { [slotId]: instanceId | null }
  equipped: {},
  // Equipment panel layout — ordered array of header/slot items (persisted separately)
  equipLayout: [],
  // Left panel: which pane is showing, and which shop is open inside the Shop
  // pane (null = the list of shops). Both are UI position, never saved.
  leftTab: 'equip',   // 'equip' | 'shop' | 'map'
  shopOpenId: null,
  // Shops the party can buy from — a read-through cache of the Firebase node,
  // owned by the GM. Never in the save file: a shop belongs to the table.
  shops: {},          // { [shopId]: Shop }
  // The table's battle maps — a read-through cache of `parties/<code>/battlemap`,
  // owned by the GM, on exactly the terms the shops are. A map belongs to the
  // table, so nothing about one is in the save file. battlemap.js owns it.
  battlemap: { activeId: null, maps: {} },
  // Which map the GM has open in their library pane (null = the list of maps).
  // UI position, like state.shopOpenId, and never saved.
  mapLibraryOpenId: null,
  // Which view of the selected character the inventory panel shows.
  // *Which* character is selected lives in state.party.viewingPlayerId.
  view: 'inventory', // 'inventory' | 'sheet'
  // Container view: null = main inventory, instanceId = viewing that container's interior
  activeContainer: null,
  // Per-container internal grids: { [instanceId]: 2D array }
  containerGrids: {},
  // Signed-in user, or null. Identity only — the inventory itself still lives in
  // localStorage; cloud-save.js mirrors it to the account while signed in.
  // `ready` flips true once Firebase has reported the restored session, so the
  // UI can tell "signed out" from "we don't know yet".
  auth: { user: null, ready: false },
  // Party session
  party: {
    active: false,
    code: null,
    role: null,           // 'gm' | 'player'
    playerId: null,       // our account uid, or 'gm' — see party.js on identity
    playerName: null,
    campaignName: null,   // the campaign's own name, from parties/<code>/meta
    viewingPlayerId: null, // which player's inventory we're viewing (null = own for player, none for GM)
    ownState: null,       // saved own state when player views another's inventory
    players: {},          // Firebase cache: { [uid]: { name, connected, lastSeen, character, instances, customDb } }
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
