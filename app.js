// =============================================================================
// D&D INVENTORY MANAGER — app.js
// =============================================================================
'use strict';

// =============================================================================
// CONSTANTS
// =============================================================================
const CELL = 44;          // px per grid square
const GRID_COLS = 15;     // fixed column count

const RARITY_META = {
  common:    { label: 'Common',           color: '#b0b0b0' },
  uncommon:  { label: 'Uncommon',         color: '#1eff00' },
  rare:      { label: 'Rare',             color: '#0084ff' },
  very_rare: { label: 'Very Rare',        color: '#c040ff' },
  legendary: { label: 'Legendary',        color: '#ff8000' },
  artifact:  { label: 'Artifact',         color: '#e6cc80' },
};

const RARITY_ORDER = ['common','uncommon','rare','very_rare','legendary','artifact'];

// =============================================================================
// DEFAULT ITEM DATABASE
// =============================================================================
// Shapes: 2D arrays, 1 = filled cell (1 lb each), 0 = empty.
// For stackable items: weightEach < 1, maxStack = 1/weightEach (must divide evenly)
// Stackable items always use shape [[1]] and occupy one cell per stack.

const DEFAULT_ITEMS = [
  // ── CURRENCY ──────────────────────────────────────────────────────────────
  {
    id: 'gold_coin', name: 'Gold Coin', rarity: 'common',
    description: 'Standard currency of the realm. 50 coins weigh 1 lb.',
    shape: [[1]], stackable: true, weightEach: 0.02, cost: 1,
    tags: ['currency'], image: '',
  },
  {
    id: 'silver_coin', name: 'Silver Coin', rarity: 'common',
    description: '10 silver pieces equal 1 gold piece.',
    shape: [[1]], stackable: true, weightEach: 0.02, cost: 0.1,
    tags: ['currency'], image: '',
  },
  {
    id: 'gem_small', name: 'Gemstone', rarity: 'uncommon',
    description: 'A polished gem suitable for trade or arcane focus.',
    shape: [[1]], stackable: false, cost: 50,
    tags: ['gem', 'trade'], image: '',
  },
  // ── AMMUNITION ────────────────────────────────────────────────────────────
  {
    id: 'arrow', name: 'Arrow', rarity: 'common',
    description: 'A standard arrow for shortbows and longbows. 20 arrows weigh 1 lb.',
    shape: [[1]], stackable: true, weightEach: 0.05, cost: 0.05,
    tags: ['ammunition', 'ranged'], image: '',
  },
  {
    id: 'crossbow_bolt', name: 'Crossbow Bolt', rarity: 'common',
    description: 'A bolt for crossbows. 20 bolts weigh 1 lb.',
    shape: [[1]], stackable: true, weightEach: 0.05, cost: 0.05,
    tags: ['ammunition', 'ranged'], image: '',
  },
  {
    id: 'sling_bullet', name: 'Sling Bullet', rarity: 'common',
    description: 'Heavy lead bullets for a sling. 20 per pound.',
    shape: [[1]], stackable: true, weightEach: 0.05, cost: 0.01,
    tags: ['ammunition', 'ranged'], image: '',
  },
  // ── DAGGERS & SMALL BLADES ───────────────────────────────────────────────
  {
    id: 'dagger', name: 'Dagger', rarity: 'common',
    description: 'A small piercing blade, concealable and light. Finesse, thrown (20/60 ft).',
    shape: [[1],[1]], stackable: false, cost: 2,
    tags: ['weapon', 'melee', 'finesse', 'thrown', 'martial'], image: '',
  },
  {
    id: 'handaxe', name: 'Handaxe', rarity: 'common',
    description: 'A small axe that can be thrown. Thrown (20/60 ft).',
    shape: [[1],[1],[1]], stackable: false, cost: 5,
    tags: ['weapon', 'melee', 'thrown', 'simple'], image: '',
  },
  // ── SWORDS ────────────────────────────────────────────────────────────────
  {
    id: 'short_sword', name: 'Short Sword', rarity: 'common',
    description: 'A nimble martial blade. Finesse, light.',
    shape: [[1],[1],[1]], stackable: false, cost: 10,
    tags: ['weapon', 'melee', 'finesse', 'light', 'martial'], image: '',
  },
  {
    id: 'longsword', name: 'Longsword', rarity: 'common',
    description: 'A versatile martial sword. Can be wielded one- or two-handed.',
    shape: [[1],[1],[1],[1]], stackable: false, cost: 15,
    tags: ['weapon', 'melee', 'versatile', 'martial'], image: '',
  },
  {
    id: 'rapier', name: 'Rapier', rarity: 'common',
    description: 'An elegant piercing blade with unmatched finesse.',
    shape: [[1],[1],[1],[1]], stackable: false, cost: 25,
    tags: ['weapon', 'melee', 'finesse', 'martial'], image: '',
  },
  {
    id: 'greatsword', name: 'Greatsword', rarity: 'common',
    description: 'A massive two-handed blade that deals tremendous damage.',
    shape: [[1,1],[1,1],[1,1],[1,1],[1,1]], stackable: false, cost: 50,
    tags: ['weapon', 'melee', 'heavy', 'two-handed', 'martial'], image: '',
  },
  {
    id: 'scimitar', name: 'Scimitar', rarity: 'common',
    description: 'A curved, slashing blade favored by desert warriors.',
    shape: [[0,1],[1,1],[1,0],[1,0]], stackable: false, cost: 25,
    tags: ['weapon', 'melee', 'finesse', 'light', 'martial'], image: '',
  },
  // ── AXES ──────────────────────────────────────────────────────────────────
  {
    id: 'battleaxe', name: 'Battleaxe', rarity: 'common',
    description: 'A war axe usable with one or two hands.',
    shape: [[1,1,0],[0,1,0],[0,1,0],[0,1,1]], stackable: false, cost: 10,
    tags: ['weapon', 'melee', 'versatile', 'martial'], image: '',
  },
  {
    id: 'greataxe', name: 'Greataxe', rarity: 'common',
    description: 'A massive two-handed axe dealing 1d12 damage.',
    shape: [[1,1,1],[1,1,1],[0,1,0],[0,1,0],[0,1,0],[0,1,1]], stackable: false, cost: 30,
    tags: ['weapon', 'melee', 'heavy', 'two-handed', 'martial'], image: '',
  },
  // ── POLEARMS & STAVES ─────────────────────────────────────────────────────
  {
    id: 'quarterstaff', name: 'Quarterstaff', rarity: 'common',
    description: 'A simple wooden staff, versatile in a trained hand.',
    shape: [[1],[1],[1],[1],[1]], stackable: false, cost: 0.2,
    tags: ['weapon', 'melee', 'versatile', 'simple'], image: '',
  },
  {
    id: 'spear', name: 'Spear', rarity: 'common',
    description: 'A wooden shaft tipped with iron. Thrown (20/60 ft).',
    shape: [[1],[1],[1],[1]], stackable: false, cost: 1,
    tags: ['weapon', 'melee', 'thrown', 'simple'], image: '',
  },
  {
    id: 'halberd', name: 'Halberd', rarity: 'common',
    description: 'A polearm with an axe-blade and a spike. Reach.',
    shape: [[1,1],[0,1],[0,1],[0,1],[0,1],[0,1]], stackable: false, cost: 20,
    tags: ['weapon', 'melee', 'heavy', 'reach', 'two-handed', 'martial'], image: '',
  },
  {
    id: 'glaive', name: 'Glaive', rarity: 'common',
    description: 'A blade on a long pole. Heavy, reach, two-handed.',
    shape: [[1,0],[1,1],[0,1],[0,1],[0,1],[0,1]], stackable: false, cost: 20,
    tags: ['weapon', 'melee', 'heavy', 'reach', 'two-handed', 'martial'], image: '',
  },
  // ── MACES & HAMMERS ───────────────────────────────────────────────────────
  {
    id: 'mace', name: 'Mace', rarity: 'common',
    description: 'A bludgeoning weapon effective against armor.',
    shape: [[1,1],[0,1],[0,1],[0,1]], stackable: false, cost: 5,
    tags: ['weapon', 'melee', 'bludgeoning', 'simple'], image: '',
  },
  {
    id: 'warhammer', name: 'Warhammer', rarity: 'common',
    description: 'A heavy bludgeoning weapon. Versatile.',
    shape: [[1,1,1],[0,1,0],[0,1,0],[0,1,0]], stackable: false, cost: 15,
    tags: ['weapon', 'melee', 'bludgeoning', 'versatile', 'martial'], image: '',
  },
  {
    id: 'maul', name: 'Maul', rarity: 'common',
    description: 'A two-handed war hammer. Heavy.',
    shape: [[1,1,1],[1,1,1],[0,1,0],[0,1,0],[0,1,0]], stackable: false, cost: 10,
    tags: ['weapon', 'melee', 'bludgeoning', 'heavy', 'two-handed', 'martial'], image: '',
  },
  // ── RANGED WEAPONS ────────────────────────────────────────────────────────
  {
    id: 'shortbow', name: 'Shortbow', rarity: 'common',
    description: 'A compact bow with 80/320 ft range.',
    shape: [[1,0],[1,1],[1,0],[1,0]], stackable: false, cost: 25,
    tags: ['weapon', 'ranged', 'two-handed', 'simple'], image: '',
  },
  {
    id: 'longbow', name: 'Longbow', rarity: 'common',
    description: 'A powerful bow with 150/600 ft range.',
    shape: [[1,0],[1,1],[1,0],[1,0],[1,0],[1,0]], stackable: false, cost: 50,
    tags: ['weapon', 'ranged', 'two-handed', 'heavy', 'martial'], image: '',
  },
  {
    id: 'hand_crossbow', name: 'Hand Crossbow', rarity: 'common',
    description: 'A compact crossbow, light and concealable.',
    shape: [[1,1,1],[0,1,0],[0,1,0]], stackable: false, cost: 75,
    tags: ['weapon', 'ranged', 'light', 'martial'], image: '',
  },
  {
    id: 'heavy_crossbow', name: 'Heavy Crossbow', rarity: 'common',
    description: 'A powerful crossbow with 100/400 ft range.',
    shape: [[1,1,1,1],[0,1,1,0],[0,0,1,0],[0,0,1,0]], stackable: false, cost: 50,
    tags: ['weapon', 'ranged', 'two-handed', 'heavy', 'martial'], image: '',
  },
  // ── SHIELDS & ARMOR ───────────────────────────────────────────────────────
  {
    id: 'shield', name: 'Shield', rarity: 'common',
    description: '+2 to AC. Must be wielded to gain bonus.',
    shape: [[1,1],[1,1],[1,1]], stackable: false, cost: 10,
    tags: ['armor', 'shield'], image: '',
  },
  {
    id: 'leather_armor', name: 'Leather Armor', rarity: 'common',
    description: 'Light armor made from stiffened leather. AC 11 + DEX.',
    shape: [[1,1,1],[1,1,1],[1,1,1],[1,0,1]], stackable: false, cost: 10,
    tags: ['armor', 'light'], image: '',
  },
  {
    id: 'chain_shirt', name: 'Chain Shirt', rarity: 'common',
    description: 'Medium armor, AC 13 + DEX (max 2).',
    shape: [[1,1,1,1],[1,1,1,1],[1,1,1,1],[1,0,0,1]], stackable: false, cost: 50,
    tags: ['armor', 'medium'], image: '',
  },
  {
    id: 'plate_armor', name: 'Plate Armor', rarity: 'uncommon',
    description: 'Heavy full-plate armor, AC 18. Strength 15 required.',
    shape: [
      [1,1,1,1,1],[1,1,1,1,1],[1,1,1,1,1],[1,1,1,1,1],
      [1,1,1,1,1],[1,0,0,0,1],[1,0,0,0,1]
    ],
    stackable: false, cost: 1500,
    tags: ['armor', 'heavy'], image: '',
  },
  // ── POTIONS ───────────────────────────────────────────────────────────────
  {
    id: 'potion_healing', name: 'Potion of Healing', rarity: 'common',
    description: 'Restores 2d4+2 hit points when consumed.',
    shape: [[1],[1]], stackable: false, cost: 50,
    tags: ['potion', 'consumable', 'healing'], image: '',
  },
  {
    id: 'potion_greater_healing', name: 'Greater Healing Potion', rarity: 'uncommon',
    description: 'Restores 4d4+4 hit points.',
    shape: [[1],[1]], stackable: false, cost: 150,
    tags: ['potion', 'consumable', 'healing'], image: '',
  },
  {
    id: 'potion_superior_healing', name: 'Superior Healing Potion', rarity: 'rare',
    description: 'Restores 8d4+8 hit points.',
    shape: [[1],[1]], stackable: false, cost: 450,
    tags: ['potion', 'consumable', 'healing'], image: '',
  },
  {
    id: 'potion_supreme_healing', name: 'Supreme Healing Potion', rarity: 'very_rare',
    description: 'Restores 10d4+20 hit points.',
    shape: [[1],[1]], stackable: false, cost: 1350,
    tags: ['potion', 'consumable', 'healing'], image: '',
  },
  {
    id: 'potion_giant_strength', name: 'Potion of Giant Strength', rarity: 'rare',
    description: 'Sets your Strength to 21 for 1 hour.',
    shape: [[1,1],[0,1]], stackable: false, cost: 500,
    tags: ['potion', 'consumable', 'buff'], image: '',
  },
  {
    id: 'potion_invisibility', name: 'Potion of Invisibility', rarity: 'very_rare',
    description: 'You become invisible for up to 1 hour.',
    shape: [[1],[1]], stackable: false, cost: 2000,
    tags: ['potion', 'consumable', 'stealth'], image: '',
  },
  {
    id: 'antitoxin', name: 'Antitoxin', rarity: 'uncommon',
    description: 'Advantage on saving throws against poison for 1 hour.',
    shape: [[1]], stackable: false, cost: 50,
    tags: ['potion', 'consumable'], image: '',
  },
  // ── SCROLLS ───────────────────────────────────────────────────────────────
  {
    id: 'spell_scroll_cantrip', name: 'Spell Scroll (Cantrip)', rarity: 'common',
    description: 'A scroll containing a single cantrip spell.',
    shape: [[1],[1]], stackable: false, cost: 25,
    tags: ['scroll', 'consumable', 'magic'], image: '',
  },
  {
    id: 'spell_scroll_1st', name: 'Spell Scroll (1st Level)', rarity: 'common',
    description: 'A scroll with a 1st-level spell inscription.',
    shape: [[1],[1]], stackable: false, cost: 75,
    tags: ['scroll', 'consumable', 'magic'], image: '',
  },
  {
    id: 'spell_scroll_5th', name: 'Spell Scroll (5th Level)', rarity: 'rare',
    description: 'A scroll imbued with a powerful 5th-level spell.',
    shape: [[1],[1]], stackable: false, cost: 1500,
    tags: ['scroll', 'consumable', 'magic'], image: '',
  },
  {
    id: 'spell_scroll_9th', name: 'Spell Scroll (9th Level)', rarity: 'legendary',
    description: 'A scroll containing a legendary 9th-level spell.',
    shape: [[1],[1]], stackable: false, cost: 50000,
    tags: ['scroll', 'consumable', 'magic'], image: '',
  },
  // ── MAGIC ITEMS ───────────────────────────────────────────────────────────
  {
    id: 'ring_protection', name: 'Ring of Protection', rarity: 'rare',
    description: '+1 bonus to AC and saving throws.',
    shape: [[1]], stackable: false, cost: 3500,
    tags: ['ring', 'magic', 'attuned'], image: '',
  },
  {
    id: 'ring_spell_storing', name: 'Ring of Spell Storing', rarity: 'rare',
    description: 'Stores up to 5 levels of spells for later casting.',
    shape: [[1]], stackable: false, cost: 24000,
    tags: ['ring', 'magic', 'attuned'], image: '',
  },
  {
    id: 'amulet_natural_armor', name: 'Amulet of Natural Armor', rarity: 'uncommon',
    description: '+1 bonus to natural armor class.',
    shape: [[1]], stackable: false, cost: 5000,
    tags: ['amulet', 'magic', 'attuned'], image: '',
  },
  {
    id: 'cloak_displacement', name: 'Cloak of Displacement', rarity: 'rare',
    description: 'Attackers have disadvantage on their first attack each turn.',
    shape: [[1,1],[1,1],[1,1]], stackable: false, cost: 24000,
    tags: ['cloak', 'magic', 'attuned'], image: '',
  },
  {
    id: 'bag_holding', name: 'Bag of Holding', rarity: 'uncommon',
    description: 'Holds 500 lbs in a 64 cubic foot space, weighs only 15 lbs.',
    shape: [[1,1,1],[1,1,1],[1,1,1],[1,1,1],[1,1,1]], stackable: false, cost: 4000,
    tags: ['magic', 'container'], image: '',
  },
  {
    id: 'wand_magic_missiles', name: 'Wand of Magic Missiles', rarity: 'uncommon',
    description: 'Has 7 charges. Expend 1–3 charges to cast Magic Missile.',
    shape: [[1],[1],[1]], stackable: false, cost: 2000,
    tags: ['wand', 'magic', 'arcane', 'attuned'], image: '',
  },
  {
    id: 'staff_power', name: 'Staff of Power', rarity: 'very_rare',
    description: '20 charges. Grants +2 to attack, damage, saving throws, and AC.',
    shape: [[1],[1],[1],[1],[1],[1],[1]], stackable: false, cost: 95500,
    tags: ['staff', 'magic', 'arcane', 'attuned'], image: '',
  },
  {
    id: 'holy_avenger', name: 'Holy Avenger', rarity: 'legendary',
    description: 'A paladin\'s sacred sword. +3, radiant damage, magical aura.',
    shape: [[1],[1],[1],[1],[1]], stackable: false, cost: 165000,
    tags: ['weapon', 'melee', 'magic', 'attuned', 'legendary'], image: '',
  },
  {
    id: 'deck_many_things', name: 'Deck of Many Things', rarity: 'artifact',
    description: 'A deck of 22 cards, each with wild magical effects. Use with caution.',
    shape: [[1,1],[1,1]], stackable: false, cost: 0,
    tags: ['artifact', 'magic', 'dangerous'], image: '',
  },
  // ── ADVENTURING GEAR ──────────────────────────────────────────────────────
  {
    id: 'rope_hemp', name: 'Rope (Hemp, 50ft)', rarity: 'common',
    description: '50 feet of hemp rope. Holds up to 1,500 lbs.',
    shape: [[1,1],[1,1],[1,1],[1,1],[1,1]], stackable: false, cost: 1,
    tags: ['gear', 'utility'], image: '',
  },
  {
    id: 'torch', name: 'Torch', rarity: 'common',
    description: 'Sheds bright light in a 20-ft radius for 1 hour.',
    shape: [[1],[1]], stackable: false, cost: 0.01,
    tags: ['gear', 'light', 'consumable'], image: '',
  },
  {
    id: 'lantern_hooded', name: 'Hooded Lantern', rarity: 'common',
    description: 'Bright light 30 ft, dim 60 ft. Can be shuttered to dark.',
    shape: [[1,1],[1,1]], stackable: false, cost: 5,
    tags: ['gear', 'light'], image: '',
  },
  {
    id: 'crowbar', name: 'Crowbar', rarity: 'common',
    description: 'Advantage on Strength checks to pry things open.',
    shape: [[1],[1],[1],[1],[1]], stackable: false, cost: 2,
    tags: ['gear', 'tool'], image: '',
  },
  {
    id: 'grappling_hook', name: 'Grappling Hook', rarity: 'common',
    description: 'A hook to anchor a rope, enabling climbing.',
    shape: [[1,1],[1,1]], stackable: false, cost: 2,
    tags: ['gear', 'tool', 'utility'], image: '',
  },
  {
    id: 'healers_kit', name: "Healer's Kit", rarity: 'common',
    description: '10 uses. Stabilize a dying creature without a Medicine check.',
    shape: [[1,1],[1,1]], stackable: false, cost: 5,
    tags: ['gear', 'healing', 'consumable'], image: '',
  },
  {
    id: 'tinderbox', name: 'Tinderbox', rarity: 'common',
    description: 'Strike flint and steel to light torches or start fires.',
    shape: [[1]], stackable: false, cost: 0.5,
    tags: ['gear', 'tool', 'light'], image: '',
  },
  {
    id: 'rations', name: 'Rations (1 day)', rarity: 'common',
    description: 'Dry food for one day: jerky, dried fruit, hardtack.',
    shape: [[1],[1]], stackable: false, cost: 0.5,
    tags: ['gear', 'food', 'consumable'], image: '',
  },
  {
    id: 'waterskin', name: 'Waterskin', rarity: 'common',
    description: 'Holds up to 4 pints of liquid when full.',
    shape: [[1,1],[0,1],[0,1]], stackable: false, cost: 0.2,
    tags: ['gear', 'container'], image: '',
  },
  {
    id: 'thieves_tools', name: "Thieves' Tools", rarity: 'common',
    description: 'Small file, picks, mirrors, and clamps. Proficiency required.',
    shape: [[1,1],[1,1]], stackable: false, cost: 25,
    tags: ['gear', 'tool', 'thieves'], image: '',
  },
  {
    id: 'spellbook', name: 'Spellbook', rarity: 'uncommon',
    description: 'An essential tome for wizards, containing their known spells.',
    shape: [[1,1,1],[1,1,1],[1,1,1],[1,1,1]], stackable: false, cost: 50,
    tags: ['gear', 'arcane', 'book'], image: '',
  },
  {
    id: 'component_pouch', name: 'Component Pouch', rarity: 'common',
    description: 'A small pouch with common spell components.',
    shape: [[1],[1]], stackable: false, cost: 25,
    tags: ['gear', 'arcane'], image: '',
  },
  {
    id: 'orb', name: 'Orb (Arcane Focus)', rarity: 'common',
    description: 'A crystal orb used as an arcane focus for spellcasting.',
    shape: [[1,1],[1,1]], stackable: false, cost: 20,
    tags: ['gear', 'arcane', 'focus'], image: '',
  },
  {
    id: 'holy_symbol', name: 'Holy Symbol', rarity: 'common',
    description: 'A sacred symbol used as a divine focus by clerics and paladins.',
    shape: [[1],[1]], stackable: false, cost: 5,
    tags: ['gear', 'divine', 'focus'], image: '',
  },
  {
    id: 'poison_basic', name: 'Basic Poison (vial)', rarity: 'uncommon',
    description: 'Applied to a weapon. On hit, target must succeed DC 10 CON or take 1d4 poison.',
    shape: [[1]], stackable: false, cost: 100,
    tags: ['gear', 'consumable', 'poison'], image: '',
  },
  // ── TREASURE ──────────────────────────────────────────────────────────────
  {
    id: 'diamond', name: 'Diamond', rarity: 'legendary',
    description: 'A flawless gem. Required component for Raise Dead and similar spells.',
    shape: [[1]], stackable: false, cost: 5000,
    tags: ['gem', 'treasure', 'spell-component'], image: '',
  },
  {
    id: 'ruby', name: 'Ruby', rarity: 'rare',
    description: 'A deep red gem of significant value.',
    shape: [[1]], stackable: false, cost: 1000,
    tags: ['gem', 'treasure'], image: '',
  },
  {
    id: 'sapphire', name: 'Sapphire', rarity: 'very_rare',
    description: 'A magnificent blue gem.',
    shape: [[1]], stackable: false, cost: 2500,
    tags: ['gem', 'treasure'], image: '',
  },
];

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

// =============================================================================
// SHAPE UTILITIES
// =============================================================================
function shapeCellCount(shape) {
  return shape.reduce((s, row) => s + row.reduce((a, v) => a + v, 0), 0);
}

function shapeWeight(shape) { return shapeCellCount(shape); }

function shapeDims(shape) {
  return { rows: shape.length, cols: shape[0].length };
}

function normalizeShape(shape) {
  // Remove empty border rows/cols
  let minR = shape.length, maxR = -1, minC = shape[0].length, maxC = -1;
  shape.forEach((row, r) => row.forEach((v, c) => {
    if (v) { minR = Math.min(minR, r); maxR = Math.max(maxR, r); minC = Math.min(minC, c); maxC = Math.max(maxC, c); }
  }));
  if (maxR < 0) return [[0]]; // all empty → 1x1
  return shape.slice(minR, maxR + 1).map(row => row.slice(minC, maxC + 1));
}

function rotateShapeCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function getRotatedShape(baseShape, rotation) {
  let s = baseShape;
  for (let i = 0; i < rotation; i++) s = rotateShapeCW(s);
  return s;
}

// All filled cell coords of shape, absolute on grid (given gridRow, gridCol as top-left of bounding box)
function getShapeCells(shape, gridRow, gridCol) {
  const cells = [];
  shape.forEach((row, r) => row.forEach((v, c) => {
    if (v) cells.push({ row: gridRow + r, col: gridCol + c });
  }));
  return cells;
}

// Rotate anchor cell through a CW rotation
function rotateAnchorCW(anchorRow, anchorCol, rows, cols) {
  return { row: anchorCol, col: rows - 1 - anchorRow };
}

// =============================================================================
// GRID LOGIC
// =============================================================================
function initGrid() {
  const rows = gridRows();
  state.grid = Array.from({ length: rows }, () => Array(GRID_COLS).fill(null));
}

function canPlace(shape, gridRow, gridCol, excludeInstanceId = null) {
  const cells = getShapeCells(shape, gridRow, gridCol);
  for (const { row, col } of cells) {
    if (row < 0 || row >= state.grid.length || col < 0 || col >= GRID_COLS) return false;
    const occupant = state.grid[row][col];
    if (occupant && occupant !== excludeInstanceId) return false;
  }
  return true;
}

function placeOnGrid(instanceId, shape, gridRow, gridCol) {
  getShapeCells(shape, gridRow, gridCol).forEach(({ row, col }) => {
    state.grid[row][col] = instanceId;
  });
}

function removeFromGrid(instanceId) {
  state.grid.forEach(row => row.forEach((v, i, arr) => {
    if (v === instanceId) arr[i] = null;
  }));
}

function totalCarriedWeight() {
  return Object.values(state.instances).reduce((sum, inst) => {
    const template = state.db[inst.templateId];
    if (!template) return sum;
    if (template.stackable) return sum + template.weightEach * inst.stackCount;
    return sum + shapeWeight(getRotatedShape(template.shape, inst.rotation));
  }, 0);
}

// =============================================================================
// ID GENERATION
// =============================================================================
let _nextId = 1;
function newId() { return 'inst_' + (_nextId++); }
function newTemplateId() { return 'custom_' + Date.now() + '_' + Math.floor(Math.random() * 1000); }

// =============================================================================
// RENDERING — GRID
// =============================================================================
const gridEl = document.getElementById('inventory-grid');

function buildGrid() {
  gridEl.innerHTML = '';
  gridEl.style.gridTemplateColumns = `repeat(${GRID_COLS}, ${CELL}px)`;

  const str = state.character.strength;
  const total = gridRows();

  for (let r = 0; r < total; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const cell = document.createElement('div');
      cell.className = 'grid-cell';
      cell.dataset.row = r;
      cell.dataset.col = c;
      if (r >= str && r < str * 2) {
        cell.classList.add('zone-enc');
        if (r === str) cell.classList.add('zone-boundary-enc');
      } else if (r >= str * 2) {
        cell.classList.add('zone-heavy');
        if (r === str * 2) cell.classList.add('zone-boundary-heavy');
      }
      gridEl.appendChild(cell);
    }
  }

  gridEl.style.height = total * CELL + 'px';
}

// =============================================================================
// RENDERING — PLACED ITEMS
// =============================================================================
function renderAllItems() {
  // Remove old item divs
  gridEl.querySelectorAll('.placed-item').forEach(el => el.remove());
  Object.values(state.instances).forEach(inst => renderPlacedItem(inst));
}

function buildItemEl(template, shape, rarity) {
  const dims = shapeDims(shape);
  const el = document.createElement('div');
  el.className = `placed-item rarity-${rarity}`;
  el.style.width  = dims.cols * CELL + 'px';
  el.style.height = dims.rows * CELL + 'px';
  el.style.gridTemplateColumns = `repeat(${dims.cols}, ${CELL}px)`;
  el.style.display = 'grid';

  if (template.image) {
    el.style.backgroundImage = `url('${template.image}')`;
    el.style.backgroundSize = 'contain';
    el.style.backgroundRepeat = 'no-repeat';
    el.style.backgroundPosition = 'center';
  }

  const rc = RARITY_META[rarity]?.color ?? '#888';
  const innerBorder = 'rgba(255,255,255,0.1)';

  shape.forEach((row, r) => row.forEach((v, c) => {
    const cellEl = document.createElement('div');
    if (v) {
      cellEl.className = 'item-cell filled';
      const hasTop    = r > 0 && shape[r-1][c] === 1;
      const hasBottom = r < shape.length - 1 && shape[r+1][c] === 1;
      const hasLeft   = c > 0 && shape[r][c-1] === 1;
      const hasRight  = c < shape[r].length - 1 && shape[r][c+1] === 1;
      cellEl.style.borderTopColor    = hasTop    ? innerBorder : rc;
      cellEl.style.borderBottomColor = hasBottom ? innerBorder : rc;
      cellEl.style.borderLeftColor   = hasLeft   ? innerBorder : rc;
      cellEl.style.borderRightColor  = hasRight  ? innerBorder : rc;
    } else {
      cellEl.className = 'item-cell empty';
    }
    el.appendChild(cellEl);
  }));

  // Label in the widest filled row (middle one if tied) — guaranteed within filled cells
  const rowCounts = shape.map(row => row.reduce((a, v) => a + v, 0));
  const maxCells = Math.max(...rowCounts);
  const candidates = rowCounts.reduce((acc, n, r) => { if (n === maxCells) acc.push(r); return acc; }, []);
  const labelRow = candidates[Math.floor(candidates.length / 2)];
  let firstC = -1, lastC = -1;
  shape[labelRow].forEach((v, c) => { if (v) { if (firstC < 0) firstC = c; lastC = c; } });

  const lbl = document.createElement('div');
  lbl.className = 'item-label';
  lbl.textContent = template.name;
  lbl.style.inset  = 'unset';
  lbl.style.left   = (firstC * CELL) + 'px';
  lbl.style.top    = (labelRow * CELL) + 'px';
  lbl.style.width  = ((lastC - firstC + 1) * CELL) + 'px';
  lbl.style.height = CELL + 'px';
  el.appendChild(lbl);

  return el;
}

function renderPlacedItem(inst) {
  const template = state.db[inst.templateId];
  if (!template) return;
  const shape = getRotatedShape(template.shape, inst.rotation);

  const el = buildItemEl(template, shape, template.rarity);
  el.dataset.instanceId = inst.id;
  el.style.left = inst.col * CELL + 'px';
  el.style.top  = inst.row * CELL + 'px';

  // Stack badge
  if (template.stackable && inst.stackCount > 1) {
    const badge = document.createElement('div');
    badge.className = 'stack-badge';
    badge.textContent = inst.stackCount;
    el.appendChild(badge);
  }

  el.addEventListener('pointerdown', onItemPointerDown);
  el.addEventListener('contextmenu', onItemContextMenu);
  el.addEventListener('click', onItemClick);

  gridEl.appendChild(el);
  return el;
}

// =============================================================================
// RENDERING — SIDEBAR ITEM LIST
// =============================================================================
function renderItemList() {
  const listEl = document.getElementById('item-list');
  const search = document.getElementById('item-search').value.trim().toLowerCase();
  const rarityF = document.getElementById('rarity-filter').value;
  const tagF = document.getElementById('tag-filter').value;

  const items = Object.values(state.db).filter(t => {
    if (search && !t.name.toLowerCase().includes(search) && !t.description.toLowerCase().includes(search)) return false;
    if (rarityF && t.rarity !== rarityF) return false;
    if (tagF && !t.tags.includes(tagF)) return false;
    return true;
  });

  // Sort: rarity order desc, then name
  items.sort((a, b) => {
    const rd = RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity);
    return rd !== 0 ? rd : a.name.localeCompare(b.name);
  });

  listEl.innerHTML = '';
  items.forEach(t => {
    const card = document.createElement('div');
    card.className = 'item-card';
    card.dataset.templateId = t.id;
    if (state.placing && state.placing.templateId === t.id) card.classList.add('placing');

    const color = RARITY_META[t.rarity]?.color ?? '#888';

    const swatch = document.createElement('div');
    swatch.className = 'item-card-swatch';
    swatch.style.background = color;

    const info = document.createElement('div');
    info.className = 'item-card-info';
    const nm = document.createElement('div');
    nm.className = 'item-card-name';
    nm.textContent = t.name;
    const sub = document.createElement('div');
    sub.className = 'item-card-sub';
    const w = t.stackable
      ? `${t.weightEach} lb ea · stack ×${computeMaxStack(t.weightEach)}`
      : `${shapeWeight(t.shape)} lb`;
    sub.textContent = `${RARITY_META[t.rarity]?.label} · ${w}`;

    info.appendChild(nm);
    info.appendChild(sub);

    const shapePreview = buildMiniShapePreview(t.shape, color);

    card.appendChild(swatch);
    card.appendChild(info);
    card.appendChild(shapePreview);

    card.addEventListener('click', () => startPlacing(t.id));
    card.addEventListener('contextmenu', e => {
      e.preventDefault();
      showTemplateContextMenu(t.id, e.clientX, e.clientY);
    });

    listEl.appendChild(card);
  });

  // Rebuild tag filter
  populateTagFilter();
}

function buildMiniShapePreview(shape, color) {
  const norm = normalizeShape(shape);
  const { rows, cols } = shapeDims(norm);
  const clampR = Math.min(rows, 6), clampC = Math.min(cols, 6);
  const div = document.createElement('div');
  div.className = 'item-card-shape';
  div.style.gridTemplateColumns = `repeat(${clampC}, 7px)`;
  div.style.gridTemplateRows    = `repeat(${clampR}, 7px)`;
  for (let r = 0; r < clampR; r++) for (let c = 0; c < clampC; c++) {
    const cell = document.createElement('div');
    cell.className = 'card-cell ' + (norm[r]?.[c] ? 'filled' : 'empty');
    if (norm[r]?.[c]) cell.style.background = color;
    div.appendChild(cell);
  }
  return div;
}

function populateTagFilter() {
  const sel = document.getElementById('tag-filter');
  const current = sel.value;
  const allTags = new Set();
  Object.values(state.db).forEach(t => t.tags.forEach(tag => allTags.add(tag)));
  sel.innerHTML = '<option value="">All Tags</option>';
  [...allTags].sort().forEach(tag => {
    const opt = document.createElement('option');
    opt.value = tag; opt.textContent = tag;
    sel.appendChild(opt);
  });
  sel.value = current;
}

// =============================================================================
// RENDERING — DETAILS PANEL
// =============================================================================
function showTemplateDetails(templateId) {
  state.selected = { type: 'template', id: templateId };
  switchTab('details');

  const t = state.db[templateId];
  if (!t) return;

  const color = RARITY_META[t.rarity]?.color ?? '#888';
  const shape = t.shape;
  const weight = t.stackable ? t.weightEach : shapeWeight(shape);

  document.getElementById('details-placeholder').classList.add('hidden');
  document.getElementById('details-content').classList.remove('hidden');

  document.getElementById('details-name').textContent = t.name;
  const badge = document.getElementById('details-rarity-badge');
  badge.textContent = RARITY_META[t.rarity]?.label;
  badge.style.background = color + '33';
  badge.style.color = color;
  badge.style.border = `1px solid ${color}66`;

  renderDetailsShapePreview(shape, color);

  const imgEl = document.getElementById('details-image');
  if (t.image) { imgEl.src = t.image; imgEl.classList.remove('hidden'); }
  else imgEl.classList.add('hidden');

  document.getElementById('details-weight').textContent =
    t.stackable ? `${t.weightEach} lb each` : `${weight} lb`;
  document.getElementById('details-cost').textContent =
    t.cost ? `${t.cost.toLocaleString()} gp` : 'Priceless';

  const stackRow = document.getElementById('details-stack-row');
  if (t.stackable) {
    stackRow.classList.remove('hidden');
    document.getElementById('details-stack').textContent = `×${computeMaxStack(t.weightEach)} max`;
  } else {
    stackRow.classList.add('hidden');
  }

  const tagsEl = document.getElementById('details-tags');
  tagsEl.innerHTML = '';
  t.tags.forEach(tag => {
    const pill = document.createElement('span');
    pill.className = 'tag-pill';
    pill.textContent = tag;
    tagsEl.appendChild(pill);
  });

  document.getElementById('details-desc').textContent = t.description || '';

  document.getElementById('details-place-btn').onclick = () => startPlacing(t.id);
  document.getElementById('details-edit-btn').onclick  = () => openItemModal(t.id);
  document.getElementById('details-delete-btn').onclick = () => deleteTemplate(t.id);
}

function renderDetailsShapePreview(shape, color) {
  const preview = document.getElementById('details-shape-preview');
  const norm = normalizeShape(shape);
  const { rows, cols } = shapeDims(norm);
  preview.style.gridTemplateColumns = `repeat(${cols}, 20px)`;
  preview.style.gridTemplateRows    = `repeat(${rows}, 20px)`;
  preview.innerHTML = '';
  norm.forEach(row => row.forEach(v => {
    const cell = document.createElement('div');
    cell.className = 'prev-cell ' + (v ? 'filled' : 'empty');
    if (v) { cell.style.background = color + '55'; cell.style.borderColor = color; }
    preview.appendChild(cell);
  }));
}

// =============================================================================
// RENDERING — HEADER WEIGHT STATS
// =============================================================================
function updateWeightDisplay() {
  const str = state.character.strength;
  const normal = str * 15;
  const enc = str * 30;
  const heavy = str * 45;
  const carried = Math.round(totalCarriedWeight() * 100) / 100;

  document.getElementById('weight-carried').textContent = `${carried} lb carried`;
  document.getElementById('weight-limits').textContent  = `${normal} / ${enc} / ${heavy} lb`;

  // Status
  const statusEl = document.getElementById('encumbrance-status');
  if (carried > enc) {
    statusEl.textContent = 'Heavily Encumbered'; statusEl.className = 'heavy';
  } else if (carried > normal) {
    statusEl.textContent = 'Encumbered'; statusEl.className = 'enc';
  } else {
    statusEl.textContent = ''; statusEl.className = '';
  }

  // Bar fill — scale gradient to always span full track width so color is static
  const pct = Math.min(carried / heavy, 1) * 100;
  const fillEl = document.getElementById('weight-bar-fill');
  fillEl.style.width = pct + '%';
  fillEl.style.backgroundSize = pct > 0 ? (100 / pct * 100).toFixed(2) + '% 100%' : '100% 100%';

  // Markers
  document.getElementById('weight-enc-marker').style.left   = (normal / heavy * 100) + '%';
  document.getElementById('weight-heavy-marker').style.left = (enc    / heavy * 100) + '%';

  // Header
  document.getElementById('char-name-display').textContent = state.character.name;
  document.getElementById('char-str-display').textContent  = `STR ${str}`;
}

// =============================================================================
// DRAG GHOST
// =============================================================================
const ghostEl = document.getElementById('drag-ghost');
let ghostShape = null;
let ghostRarity = 'common';
let lastPointerX = 0, lastPointerY = 0;

// Track pointer position globally so keyboard handlers can reference it
document.addEventListener('pointermove', e => { lastPointerX = e.clientX; lastPointerY = e.clientY; }, { passive: true });

// Rebuild the ghost element's shape DOM (cheap to skip when shape unchanged)
let ghostShapeKey = '';
function initGhostEl(shape, rarity) {
  const key = rarity + '|' + shape.map(r => r.join('')).join('|');
  if (key === ghostShapeKey) return; // Already built
  ghostShapeKey = key;
  ghostShape = shape;
  ghostRarity = rarity;
  const dims = shapeDims(shape);
  ghostEl.style.gridTemplateColumns = `repeat(${dims.cols}, ${CELL}px)`;
  ghostEl.style.width  = dims.cols * CELL + 'px';
  ghostEl.style.height = dims.rows * CELL + 'px';
  ghostEl.className = `rarity-${rarity}`;
  ghostEl.innerHTML = '';

  const outerBorder = 'rgba(255,255,255,0.7)';
  const innerBorder = 'rgba(255,255,255,0.08)';

  shape.forEach((row, r) => row.forEach((v, c) => {
    const cell = document.createElement('div');
    if (v) {
      cell.className = 'item-cell filled';
      const hasTop    = r > 0 && shape[r-1][c] === 1;
      const hasBottom = r < shape.length - 1 && shape[r+1][c] === 1;
      const hasLeft   = c > 0 && shape[r][c-1] === 1;
      const hasRight  = c < shape[r].length - 1 && shape[r][c+1] === 1;
      cell.style.borderTopColor    = hasTop    ? innerBorder : outerBorder;
      cell.style.borderBottomColor = hasBottom ? innerBorder : outerBorder;
      cell.style.borderLeftColor   = hasLeft   ? innerBorder : outerBorder;
      cell.style.borderRightColor  = hasRight  ? innerBorder : outerBorder;
    } else {
      cell.className = 'item-cell empty';
    }
    ghostEl.appendChild(cell);
  }));
}

function showGhost(shape, rarity, x, y) {
  initGhostEl(shape, rarity);
  ghostEl.style.left = x + 'px';
  ghostEl.style.top  = y + 'px';
}

function moveGhost(x, y, valid) {
  ghostEl.style.left = x + 'px';
  ghostEl.style.top  = y + 'px';
  ghostEl.classList.remove('valid', 'invalid');
  if (valid === true)  ghostEl.classList.add('valid');
  if (valid === false) ghostEl.classList.add('invalid');
}

function hideGhost() {
  ghostEl.className = 'hidden';
  ghostShape = null;
  ghostShapeKey = '';
}

function getGhostScreenPos(anchorRow, anchorCol, gridRow, gridCol) {
  const rect = gridEl.getBoundingClientRect();
  return {
    x: rect.left + gridCol * CELL,
    y: rect.top  + gridRow * CELL,
  };
}

// Highlight / unhighlight cells
let highlightedCells = [];
function highlightCells(shape, gridRow, gridCol, valid) {
  clearHighlights();
  const cls = valid ? 'highlight-valid' : 'highlight-invalid';
  getShapeCells(shape, gridRow, gridCol).forEach(({ row, col }) => {
    const cell = gridEl.querySelector(`.grid-cell[data-row="${row}"][data-col="${col}"]`);
    if (cell) { cell.classList.add(cls); highlightedCells.push(cell); }
  });
}
function clearHighlights() {
  highlightedCells.forEach(c => c.classList.remove('highlight-valid', 'highlight-invalid'));
  highlightedCells = [];
}

// =============================================================================
// INTERACTION — PLACING MODE
// =============================================================================
function startPlacing(templateId) {
  if (isReadOnly()) return;
  cancelPlacing();
  state.mode = 'placing';
  state.placing = { templateId, rotation: 0 };
  document.body.style.cursor = 'crosshair';
  renderItemList();
  showTemplateDetails(templateId);

  // Attach document-level handlers
  document.addEventListener('mousemove', onPlacingMouseMove);
  document.addEventListener('click', onPlacingClick, true);
  document.addEventListener('contextmenu', onPlacingRightClick, true);
}

function cancelPlacing() {
  if (state.mode !== 'placing') return;
  state.mode = 'idle';
  state.placing = null;
  document.body.style.cursor = '';
  hideGhost();
  clearHighlights();
  document.removeEventListener('mousemove', onPlacingMouseMove);
  document.removeEventListener('click', onPlacingClick, true);
  document.removeEventListener('contextmenu', onPlacingRightClick, true);
  renderItemList();
}

function onPlacingMouseMove(e) {
  if (state.mode !== 'placing') return;
  const { templateId, rotation } = state.placing;
  const t = state.db[templateId];
  if (!t) return;

  const shape = getRotatedShape(t.shape, rotation);
  const dims  = shapeDims(shape);
  initGhostEl(shape, t.rarity); // No-op if shape/rarity unchanged

  const pos = cursorToGridPos(e.clientX, e.clientY, 0, 0);

  if (pos) {
    const { row: gr, col: gc } = pos;
    const screenPos = getGhostScreenPos(0, 0, gr, gc);
    const valid = canPlace(shape, gr, gc);
    moveGhost(screenPos.x, screenPos.y, valid);
    highlightCells(shape, gr, gc, valid);
  } else {
    // Outside grid scroll area — ghost follows cursor freely (centered)
    moveGhost(e.clientX - dims.cols * CELL / 2, e.clientY - dims.rows * CELL / 2, null);
    clearHighlights();
  }
}

function onPlacingClick(e) {
  if (state.mode !== 'placing') return;
  const { templateId, rotation } = state.placing;
  const t = state.db[templateId];
  if (!t) { cancelPlacing(); return; }

  const pos = cursorToGridPos(e.clientX, e.clientY, 0, 0);
  if (!pos) { cancelPlacing(); return; }

  const shape = getRotatedShape(t.shape, rotation);
  if (!canPlace(shape, pos.row, pos.col)) return; // Invalid — stay in placing mode

  e.stopPropagation();

  if (t.stackable) {
    const max = computeMaxStack(t.weightEach);
    openStackModal(max, count => finalizePlacement(t, shape, rotation, pos.row, pos.col, count));
    cancelPlacing();
  } else {
    finalizePlacement(t, shape, rotation, pos.row, pos.col, 1);
    // Stay in placing mode for quick multi-placement
  }
}

function onPlacingRightClick(e) {
  e.preventDefault();
  e.stopPropagation();
  cancelPlacing();
}

function finalizePlacement(template, shape, rotation, row, col, stackCount) {
  const id = newId();
  state.instances[id] = {
    id, templateId: template.id, rotation, row, col, stackCount,
  };
  placeOnGrid(id, shape, row, col);
  renderPlacedItem(state.instances[id]);
  updateWeightDisplay();
  debouncedSync();
}

// =============================================================================
// INTERACTION — DRAGGING PLACED ITEMS
// =============================================================================
let dragPointerCapture = null;

function onItemPointerDown(e) {
  if (e.button !== 0) return;
  if (isReadOnly()) return;
  if (state.mode === 'placing') { cancelPlacing(); return; }

  const el = e.currentTarget;
  const instanceId = el.dataset.instanceId;
  const inst = state.instances[instanceId];
  if (!inst) return;

  const template = state.db[inst.templateId];
  if (!template) return;

  const shape = getRotatedShape(template.shape, inst.rotation);
  const dims  = shapeDims(shape);

  // Which cell of the item did the pointer land on?
  const itemRect  = el.getBoundingClientRect();
  const localX    = e.clientX - itemRect.left;
  const localY    = e.clientY - itemRect.top;
  const anchorCol = Math.floor(localX / CELL);
  const anchorRow = Math.floor(localY / CELL);

  // Block drag from empty cells within a concave shape's bounding box
  if (!shape[anchorRow]?.[anchorCol]) return;

  state.mode = 'dragging';
  state.dragging = {
    instanceId,
    anchorRow: Math.min(anchorRow, dims.rows - 1),
    anchorCol: Math.min(anchorCol, dims.cols - 1),
    origRow: inst.row,
    origCol: inst.col,
    origRotation: inst.rotation,
  };

  // Hide original
  el.classList.add('dragging-source');
  removeFromGrid(instanceId);

  // Start ghost at item's current screen position under cursor
  const initX = e.clientX - state.dragging.anchorCol * CELL;
  const initY = e.clientY - state.dragging.anchorRow * CELL;
  showGhost(shape, template.rarity, initX, initY);

  document.addEventListener('pointermove', onDragMove);
  document.addEventListener('pointerup', onDragEnd);
  e.preventDefault();
}

function onDragMove(e) {
  if (state.mode !== 'dragging') return;
  const drag = state.dragging;
  const inst = state.instances[drag.instanceId];
  const template = state.db[inst.templateId];
  const shape = getRotatedShape(template.shape, inst.rotation);

  const pos = cursorToGridPos(e.clientX, e.clientY, drag.anchorRow, drag.anchorCol);
  if (pos) {
    const { row: gr, col: gc } = pos;
    const screenPos = getGhostScreenPos(0, 0, gr, gc);
    const valid = canPlace(shape, gr, gc, drag.instanceId);
    moveGhost(screenPos.x, screenPos.y, valid);
    highlightCells(shape, gr, gc, valid);
  } else {
    clearHighlights();
    const dims = shapeDims(shape);
    moveGhost(e.clientX - drag.anchorCol * CELL, e.clientY - drag.anchorRow * CELL, null);
  }
}

function onDragEnd(e) {
  if (state.mode !== 'dragging') return;
  document.removeEventListener('pointermove', onDragMove);
  document.removeEventListener('pointerup', onDragEnd);

  const drag = state.dragging;
  const inst = state.instances[drag.instanceId];
  const template = state.db[inst.templateId];
  const shape = getRotatedShape(template.shape, inst.rotation);

  const pos = cursorToGridPos(e.clientX, e.clientY, drag.anchorRow, drag.anchorCol);
  let placed = false;

  if (pos) {
    const { row: gr, col: gc } = pos;
    if (canPlace(shape, gr, gc, drag.instanceId)) {
      inst.row = gr;
      inst.col = gc;
      placeOnGrid(inst.id, shape, gr, gc);
      placed = true;
    }
  }

  if (!placed) {
    // Restore
    inst.row = drag.origRow;
    inst.col = drag.origCol;
    inst.rotation = drag.origRotation;
    const restoreShape = getRotatedShape(template.shape, inst.rotation);
    placeOnGrid(inst.id, restoreShape, inst.row, inst.col);
  }

  state.mode = 'idle';
  state.dragging = null;
  hideGhost();
  clearHighlights();
  renderAllItems();
  updateWeightDisplay();
  debouncedSync();
}

// Convert cursor position to grid row/col, accounting for anchor offset.
// Returns null when cursor is not over the visible grid scroll area.
function cursorToGridPos(clientX, clientY, anchorRow, anchorCol) {
  const scrollEl = document.getElementById('grid-scroll');
  const scrollRect = scrollEl.getBoundingClientRect();
  if (clientX < scrollRect.left || clientX > scrollRect.right ||
      clientY < scrollRect.top  || clientY > scrollRect.bottom) {
    return null;
  }
  const rect = gridEl.getBoundingClientRect();
  const col = Math.floor((clientX - rect.left) / CELL) - anchorCol;
  const row = Math.floor((clientY - rect.top)  / CELL) - anchorRow;
  return { row, col };
}

// =============================================================================
// INTERACTION — ROTATE (R key)
// =============================================================================
document.addEventListener('keydown', e => {
  if (e.target.matches('input, textarea, select')) return;

  if (e.key === 'r' || e.key === 'R') {
    if (state.mode === 'placing') {
      state.placing.rotation = (state.placing.rotation + 1) % 4;
      ghostShapeKey = ''; // Force ghost rebuild on next mousemove
      // Immediately update ghost at last known pointer position
      const pt = state.placing;
      const tp = state.db[pt.templateId];
      if (tp) {
        const ns = getRotatedShape(tp.shape, pt.rotation);
        const pp = cursorToGridPos(lastPointerX, lastPointerY, 0, 0);
        if (pp) {
          const sp = getGhostScreenPos(0, 0, pp.row, pp.col);
          const vv = canPlace(ns, pp.row, pp.col);
          showGhost(ns, tp.rarity, sp.x, sp.y);
          moveGhost(sp.x, sp.y, vv);
          highlightCells(ns, pp.row, pp.col, vv);
        } else {
          const dims = shapeDims(ns);
          showGhost(ns, tp.rarity, lastPointerX - dims.cols * CELL / 2, lastPointerY - dims.rows * CELL / 2);
        }
      }
      return;
    }
    if (state.mode === 'dragging') {
      const drag = state.dragging;
      const inst = state.instances[drag.instanceId];
      const template = state.db[inst.templateId];
      const { rows, cols } = shapeDims(getRotatedShape(template.shape, inst.rotation));
      const { row: nr, col: nc } = rotateAnchorCW(drag.anchorRow, drag.anchorCol, rows, cols);
      drag.anchorRow = nr;
      drag.anchorCol = nc;
      inst.rotation = (inst.rotation + 1) % 4;
      // Rebuild ghost at current pointer position
      const newShape = getRotatedShape(template.shape, inst.rotation);
      ghostShapeKey = ''; // Force rebuild
      const newX = lastPointerX - drag.anchorCol * CELL;
      const newY = lastPointerY - drag.anchorRow * CELL;
      showGhost(newShape, template.rarity, newX, newY);
      // Re-run drag move logic to update highlights
      const pos2 = cursorToGridPos(lastPointerX, lastPointerY, drag.anchorRow, drag.anchorCol);
      if (pos2) {
        const sp = getGhostScreenPos(0, 0, pos2.row, pos2.col);
        const v = canPlace(newShape, pos2.row, pos2.col, drag.instanceId);
        moveGhost(sp.x, sp.y, v);
        highlightCells(newShape, pos2.row, pos2.col, v);
      }
      return;
    }
  }

  if (e.key === 'Escape') {
    cancelPlacing();
    if (state.mode === 'dragging') {
      // Restore
      const drag = state.dragging;
      const inst = state.instances[drag.instanceId];
      const template = state.db[inst.templateId];
      inst.rotation = drag.origRotation;
      const shape = getRotatedShape(template.shape, inst.rotation);
      placeOnGrid(inst.id, shape, drag.origRow, drag.origCol);
      inst.row = drag.origRow;
      inst.col = drag.origCol;
      document.removeEventListener('pointermove', onDragMove);
      document.removeEventListener('pointerup', onDragEnd);
      state.mode = 'idle';
      state.dragging = null;
      hideGhost();
      clearHighlights();
      renderAllItems();
    }
  }
});

// =============================================================================
// INTERACTION — ITEM CLICKS & CONTEXT MENU
// =============================================================================
function onItemClick(e) {
  if (state.mode !== 'idle') return;
  const el = e.currentTarget;
  const instanceId = el.dataset.instanceId;
  if (!instanceId) return;
  const inst = state.instances[instanceId];
  if (!inst) return;
  state.selected = { type: 'instance', id: instanceId };
  showTemplateDetails(inst.templateId);
}

function onItemContextMenu(e) {
  e.preventDefault();
  e.stopPropagation();
  if (isReadOnly()) return;
  const instanceId = e.currentTarget.dataset.instanceId;
  showInstanceContextMenu(instanceId, e.clientX, e.clientY);
}

// Close context menu on any click
document.addEventListener('click', () => hideContextMenu());
document.addEventListener('contextmenu', () => {});

const ctxMenu = document.getElementById('context-menu');
let ctxInstanceId = null;

function showInstanceContextMenu(instanceId, x, y) {
  ctxInstanceId = instanceId;
  ctxMenu.style.left = x + 'px';
  ctxMenu.style.top  = y + 'px';
  ctxMenu.classList.remove('hidden');
}

function showTemplateContextMenu(templateId, x, y) {
  // Inline: just show edit/delete for templates
  ctxInstanceId = null;
  ctxMenu.style.left = x + 'px';
  ctxMenu.style.top  = y + 'px';
  document.getElementById('ctx-rotate').style.display = 'none';
  ctxMenu.classList.remove('hidden');
  document.getElementById('ctx-edit').onclick = () => { openItemModal(templateId); hideContextMenu(); };
  document.getElementById('ctx-remove').onclick = () => { deleteTemplate(templateId); hideContextMenu(); };
}

function hideContextMenu() {
  ctxMenu.classList.add('hidden');
  document.getElementById('ctx-rotate').style.display = '';
}

document.getElementById('ctx-rotate').addEventListener('click', () => {
  if (!ctxInstanceId) return;
  rotateInstance(ctxInstanceId);
  hideContextMenu();
});
document.getElementById('ctx-edit').addEventListener('click', () => {
  if (!ctxInstanceId) return;
  const inst = state.instances[ctxInstanceId];
  if (inst) openItemModal(inst.templateId);
  hideContextMenu();
});
document.getElementById('ctx-remove').addEventListener('click', () => {
  if (!ctxInstanceId) return;
  removeInstance(ctxInstanceId);
  hideContextMenu();
});

function rotateInstance(instanceId) {
  const inst = state.instances[instanceId];
  if (!inst) return;
  const template = state.db[inst.templateId];
  const newRot = (inst.rotation + 1) % 4;
  const newShape = getRotatedShape(template.shape, newRot);
  if (canPlace(newShape, inst.row, inst.col, instanceId)) {
    removeFromGrid(instanceId);
    inst.rotation = newRot;
    placeOnGrid(instanceId, newShape, inst.row, inst.col);
    renderAllItems();
    debouncedSync();
  }
}

function removeInstance(instanceId) {
  removeFromGrid(instanceId);
  delete state.instances[instanceId];
  renderAllItems();
  updateWeightDisplay();
  debouncedSync();
}

function deleteTemplate(templateId) {
  if (!confirm(`Delete "${state.db[templateId]?.name}" from the item database? Placed items will remain.`)) return;
  delete state.db[templateId];
  renderItemList();
  document.getElementById('details-content').classList.add('hidden');
  document.getElementById('details-placeholder').classList.remove('hidden');
}

// =============================================================================
// TABS
// =============================================================================
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});
function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.toggle('active', p.id === `tab-${name}`));
}

// =============================================================================
// FILTER CONTROLS
// =============================================================================
document.getElementById('item-search').addEventListener('input', renderItemList);
document.getElementById('rarity-filter').addEventListener('change', renderItemList);
document.getElementById('tag-filter').addEventListener('change', renderItemList);

// =============================================================================
// CHARACTER MODAL
// =============================================================================
document.getElementById('edit-character-btn').addEventListener('click', openCharModal);

function openCharModal() {
  document.getElementById('char-name-input').value = state.character.name;
  document.getElementById('char-str-input').value  = state.character.strength;
  updateCharModalNote();
  showModal('character-modal');
}

function updateCharModalNote() {
  const str = parseInt(document.getElementById('char-str-input').value) || 10;
  document.getElementById('modal-capacity-normal').textContent = str * 15 + ' slots';
  document.getElementById('modal-capacity-total').textContent  = str * 45 + ' slots';
}
document.getElementById('char-str-input').addEventListener('input', updateCharModalNote);

document.getElementById('save-char-btn').addEventListener('click', () => {
  const name = document.getElementById('char-name-input').value.trim() || 'Unnamed Hero';
  const str  = Math.max(1, Math.min(30, parseInt(document.getElementById('char-str-input').value) || 10));
  state.character.name = name;
  state.character.strength = str;
  rebuildGrid();
  hideModal('character-modal');
  debouncedSync();
});

function rebuildGrid() {
  initGrid();
  buildGrid();
  // Re-place all instances
  Object.values(state.instances).forEach(inst => {
    const t = state.db[inst.templateId];
    if (!t) return;
    const shape = getRotatedShape(t.shape, inst.rotation);
    if (canPlace(shape, inst.row, inst.col)) placeOnGrid(inst.id, shape, inst.row, inst.col);
  });
  renderAllItems();
  updateWeightDisplay();
}

// =============================================================================
// ITEM EDITOR MODAL
// =============================================================================
document.getElementById('new-item-btn').addEventListener('click', () => openItemModal(null));

function openItemModal(templateId) {
  state.editingItemId = templateId;
  const t = templateId ? state.db[templateId] : null;

  document.getElementById('item-modal-title').textContent = t ? 'Edit Item' : 'New Item';
  document.getElementById('f-name').value    = t?.name ?? '';
  document.getElementById('f-rarity').value  = t?.rarity ?? 'common';
  document.getElementById('f-desc').value    = t?.description ?? '';
  document.getElementById('f-cost').value    = t?.cost ?? 0;
  document.getElementById('f-tags').value    = t?.tags.join(', ') ?? '';
  document.getElementById('f-image').value   = t?.image ?? '';

  const stackable = t?.stackable ?? false;
  document.getElementById('f-stackable').checked = stackable;
  document.getElementById('f-weight-each').value = t?.weightEach ?? 0.1;
  document.getElementById('stackable-fields').classList.toggle('hidden', !stackable);

  state.editorShape = t ? t.shape.map(r => [...r]) : [[1]];
  document.getElementById('shape-editor-section').classList.toggle('hidden', stackable);
  renderShapeEditor();
  showModal('item-modal');
}

document.getElementById('f-stackable').addEventListener('change', e => {
  const on = e.target.checked;
  document.getElementById('stackable-fields').classList.toggle('hidden', !on);
  document.getElementById('shape-editor-section').classList.toggle('hidden', on);
});

document.getElementById('f-weight-each').addEventListener('input', updateMaxStackDisplay);
function updateMaxStackDisplay() {
  const w = parseFloat(document.getElementById('f-weight-each').value) || 0.1;
  document.getElementById('f-max-stack-display').textContent = computeMaxStack(w);
}

// Shape controls
document.getElementById('sc-add-col').addEventListener('click', () => {
  state.editorShape.forEach(r => r.push(0));
  renderShapeEditor();
});
document.getElementById('sc-rem-col').addEventListener('click', () => {
  if (state.editorShape[0].length <= 1) return;
  state.editorShape.forEach(r => r.pop());
  renderShapeEditor();
});
document.getElementById('sc-add-row').addEventListener('click', () => {
  state.editorShape.push(Array(state.editorShape[0].length).fill(0));
  renderShapeEditor();
});
document.getElementById('sc-rem-row').addEventListener('click', () => {
  if (state.editorShape.length <= 1) return;
  state.editorShape.pop();
  renderShapeEditor();
});
document.getElementById('sc-clear').addEventListener('click', () => {
  state.editorShape = state.editorShape.map(r => r.map(() => 0));
  renderShapeEditor();
});
document.getElementById('sc-fill').addEventListener('click', () => {
  state.editorShape = state.editorShape.map(r => r.map(() => 1));
  renderShapeEditor();
});

function renderShapeEditor() {
  const grid = document.getElementById('shape-editor-grid');
  const shape = state.editorShape;
  const rows = shape.length, cols = shape[0].length;
  grid.style.gridTemplateColumns = `repeat(${cols}, 28px)`;
  grid.innerHTML = '';
  shape.forEach((row, r) => row.forEach((v, c) => {
    const cell = document.createElement('div');
    cell.className = 'shape-cell ' + (v ? 'on' : '');
    cell.addEventListener('click', () => {
      state.editorShape[r][c] = state.editorShape[r][c] ? 0 : 1;
      renderShapeEditor();
    });
    grid.appendChild(cell);
  }));
  document.getElementById('shape-weight-val').textContent = shapeWeight(shape);
}

document.getElementById('save-item-btn').addEventListener('click', () => {
  const name = document.getElementById('f-name').value.trim();
  if (!name) { alert('Item name is required.'); return; }

  const stackable = document.getElementById('f-stackable').checked;
  const weightEach = parseFloat(document.getElementById('f-weight-each').value) || 0.1;

  if (stackable) {
    const max = computeMaxStack(weightEach);
    if (!Number.isInteger(1 / weightEach) || max <= 0) {
      alert('Weight must divide evenly into 1 lb (e.g. 0.5, 0.25, 0.1, 0.05, 0.02).');
      return;
    }
  }

  const id = state.editingItemId ?? newTemplateId();
  const tagsRaw = document.getElementById('f-tags').value;
  const tags = tagsRaw.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);

  state.db[id] = {
    id,
    name,
    rarity:      document.getElementById('f-rarity').value,
    description: document.getElementById('f-desc').value.trim(),
    cost:        parseFloat(document.getElementById('f-cost').value) || 0,
    tags,
    image:       document.getElementById('f-image').value.trim(),
    stackable,
    weightEach:  stackable ? weightEach : undefined,
    shape:       stackable ? [[1]] : state.editorShape.map(r => [...r]),
  };

  hideModal('item-modal');
  renderItemList();
  showTemplateDetails(id);
  debouncedSync();
});

// =============================================================================
// STACK MODAL
// =============================================================================
let stackModalCallback = null;

function openStackModal(max, callback) {
  stackModalCallback = callback;
  document.getElementById('stack-modal-desc').textContent = `How many to place? (max ${max})`;
  const input = document.getElementById('stack-count-input');
  input.max = max;
  input.value = max;
  showModal('stack-modal');
}

document.getElementById('stack-confirm-btn').addEventListener('click', () => {
  const n = Math.max(1, parseInt(document.getElementById('stack-count-input').value) || 1);
  hideModal('stack-modal');
  if (stackModalCallback) { stackModalCallback(n); stackModalCallback = null; }
});

// =============================================================================
// MODAL HELPERS
// =============================================================================
function showModal(id) {
  document.getElementById('modal-backdrop').classList.remove('hidden');
  document.getElementById(id).classList.remove('hidden');
}
function hideModal(id) {
  document.getElementById(id).classList.add('hidden');
  if (!document.querySelector('.modal:not(.hidden)')) {
    document.getElementById('modal-backdrop').classList.add('hidden');
  }
}
document.getElementById('modal-backdrop').addEventListener('click', () => {
  document.querySelectorAll('.modal:not(.hidden)').forEach(m => hideModal(m.id));
});
document.querySelectorAll('.cancel-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const modal = btn.closest('.modal');
    if (modal) hideModal(modal.id);
  });
});

// =============================================================================
// HELPERS
// =============================================================================
function computeMaxStack(weightEach) {
  return Math.round(1 / weightEach);
}

// =============================================================================
// PERSISTENCE
// =============================================================================
const SAVE_KEY = 'dnd_inventory_v1';

document.getElementById('save-btn').addEventListener('click', saveState);
document.getElementById('load-btn').addEventListener('click', loadState);

function saveState() {
  const data = {
    character: state.character,
    instances: state.instances,
    db: Object.fromEntries(
      Object.entries(state.db).filter(([id]) => !DEFAULT_ITEMS.find(t => t.id === id))
    ),
  };
  localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  flashButton(document.getElementById('save-btn'), 'Saved!');
}

function loadState() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) { alert('No saved data found.'); return; }
  try {
    const data = JSON.parse(raw);
    state.character = data.character ?? state.character;
    // Merge custom items
    Object.assign(state.db, data.db ?? {});
    state.instances = data.instances ?? {};
    rebuildGrid();
    renderItemList();
    flashButton(document.getElementById('load-btn'), 'Loaded!');
  } catch {
    alert('Failed to load save data.');
  }
}

function flashButton(btn, text) {
  const orig = btn.textContent;
  btn.textContent = text;
  setTimeout(() => btn.textContent = orig, 1500);
}

// =============================================================================
// FIREBASE CONFIGURATION
// =============================================================================
const FIREBASE_CONFIG = {
  apiKey:            'AIzaSyBz3kP5_LPo8gnMyDmRAYPC9k0KKMuDDGw',
  authDomain:        'ttrpg-inventory-manager.firebaseapp.com',
  databaseURL:       'https://ttrpg-inventory-manager-default-rtdb.firebaseio.com',
  projectId:         'ttrpg-inventory-manager',
  storageBucket:     'ttrpg-inventory-manager.firebasestorage.app',
  messagingSenderId: '987329310446',
  appId:             '1:987329310446:web:32452ffc35a590466e0dff',
};

// =============================================================================
// PARTY — FIREBASE
// =============================================================================
let firebaseDb = null;
let partyPlayersRef = null;

function initFirebase() {
  try {
    firebase.initializeApp(FIREBASE_CONFIG);
    firebaseDb = firebase.database();
  } catch (e) {
    console.warn('Firebase init failed — party features unavailable:', e);
  }
}

function generatePartyCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function generatePlayerId() {
  return 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
}

function getCustomDb() {
  return Object.fromEntries(
    Object.entries(state.db).filter(([id]) => !DEFAULT_ITEMS.find(t => t.id === id))
  );
}

function getSerializableInstances() {
  return Object.fromEntries(
    Object.entries(state.instances).map(([id, inst]) => [id, {
      id: inst.id,
      templateId: inst.templateId,
      rotation: inst.rotation,
      row: inst.row,
      col: inst.col,
      stackCount: inst.stackCount,
    }])
  );
}

async function createParty() {
  if (!firebaseDb) {
    alert('Firebase is not configured yet.\nOpen app.js and fill in FIREBASE_CONFIG with your Firebase project credentials.');
    return;
  }
  const code = generatePartyCode();
  try {
    const gmRef = firebaseDb.ref(`parties/${code}/gm`);
    await gmRef.set({ name: 'Game Master', connected: true });
    gmRef.onDisconnect().update({ connected: false });
  } catch (e) {
    alert('Failed to create party: ' + e.message);
    return;
  }

  state.party.active = true;
  state.party.code = code;
  state.party.role = 'gm';
  state.party.playerId = 'gm';
  state.party.playerName = 'Game Master';
  state.party.viewingPlayerId = null;
  state.party.players = {};

  subscribeToParty(code);
  hideModal('party-modal');
  updatePartyUI();
  switchTab('party');
}

async function joinParty(code, playerName) {
  if (!firebaseDb) {
    alert('Firebase is not configured yet.\nOpen app.js and fill in FIREBASE_CONFIG with your Firebase project credentials.');
    return;
  }
  const upperCode = code.trim().toUpperCase();
  if (upperCode.length !== 6) { alert('Party code must be 6 characters.'); return; }

  let snap;
  try {
    snap = await firebaseDb.ref(`parties/${upperCode}`).get();
  } catch (e) {
    alert('Failed to connect: ' + e.message);
    return;
  }
  if (!snap.exists()) {
    alert('Party not found. Check the code and try again.');
    return;
  }

  const playerId = generatePlayerId();
  try {
    const playerRef = firebaseDb.ref(`parties/${upperCode}/players/${playerId}`);
    await playerRef.set({
      name: playerName,
      connected: true,
      character: state.character,
      instances: getSerializableInstances(),
      customDb: getCustomDb(),
      _writtenBy: playerId,
    });
    playerRef.onDisconnect().update({ connected: false });
  } catch (e) {
    alert('Failed to join party: ' + e.message);
    return;
  }

  state.party.active = true;
  state.party.code = upperCode;
  state.party.role = 'player';
  state.party.playerId = playerId;
  state.party.playerName = playerName;
  state.party.viewingPlayerId = null;
  state.party.players = {};

  subscribeToParty(upperCode);
  hideModal('party-modal');
  updatePartyUI();
  switchTab('party');
}

function subscribeToParty(code) {
  if (partyPlayersRef) partyPlayersRef.off();
  partyPlayersRef = firebaseDb.ref(`parties/${code}/players`);

  partyPlayersRef.on('value', snap => {
    const players = snap.val() ?? {};
    state.party.players = players;

    const viewId = state.party.viewingPlayerId;
    if (viewId && players[viewId]) {
      const pData = players[viewId];
      // Only reload if the change came from the player themselves (not from our own GM write)
      if (pData._writtenBy !== state.party.playerId) {
        loadPlayerStateIntoView(pData);
      }
    }

    // If player is viewing own inventory and GM edited it, apply the changes
    if (state.party.role === 'player' && state.party.viewingPlayerId === null) {
      const ownData = players[state.party.playerId];
      if (ownData && ownData._writtenBy && ownData._writtenBy !== state.party.playerId) {
        applyRemoteEditToOwnState(ownData);
      }
    }

    updatePartyPanel();
  });
}

function leaveParty() {
  if (!state.party.active) return;
  if (partyPlayersRef) { partyPlayersRef.off(); partyPlayersRef = null; }

  if (state.party.viewingPlayerId !== null) restoreOwnState();

  state.party = {
    active: false, code: null, role: null, playerId: null,
    playerName: null, viewingPlayerId: null, ownState: null, players: {},
  };

  updatePartyUI();
  switchTab('browse');
}

let syncTimer = null;
function debouncedSync() {
  if (!state.party.active) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncPartyState, 400);
}

function syncPartyState() {
  if (!state.party.active || !firebaseDb) return;

  let targetId;
  if (state.party.role === 'gm') {
    targetId = state.party.viewingPlayerId;
    if (!targetId) return;
  } else {
    if (state.party.viewingPlayerId !== null) return; // don't sync when viewing someone else
    targetId = state.party.playerId;
  }

  firebaseDb.ref(`parties/${state.party.code}/players/${targetId}`).update({
    character: state.character,
    instances: getSerializableInstances(),
    customDb: getCustomDb(),
    _writtenBy: state.party.playerId,
  });
}

function loadPlayerStateIntoView(playerData) {
  if (!playerData) return;
  cancelPlacing();

  if (playerData.character) state.character = { ...playerData.character };

  state.db = {};
  DEFAULT_ITEMS.forEach(t => { state.db[t.id] = t; });
  if (playerData.customDb) Object.assign(state.db, playerData.customDb);

  state.instances = playerData.instances ? { ...playerData.instances } : {};

  rebuildGrid();
  renderItemList();
  updateWeightDisplay();
}

function applyRemoteEditToOwnState(playerData) {
  if (playerData.instances !== undefined) state.instances = { ...playerData.instances };
  if (playerData.customDb) Object.assign(state.db, playerData.customDb);
  rebuildGrid();
  renderItemList();
  updateWeightDisplay();
}

function saveOwnState() {
  state.party.ownState = {
    character: { ...state.character },
    instances: JSON.parse(JSON.stringify(state.instances)),
    customDb: JSON.parse(JSON.stringify(getCustomDb())),
  };
}

function restoreOwnState() {
  const own = state.party.ownState;
  if (!own) return;
  state.character = { ...own.character };
  state.instances = { ...own.instances };
  state.db = {};
  DEFAULT_ITEMS.forEach(t => { state.db[t.id] = t; });
  Object.assign(state.db, own.customDb);
  state.party.ownState = null;
  rebuildGrid();
  renderItemList();
  updateWeightDisplay();
}

function switchViewToPlayer(playerId) {
  if (state.party.viewingPlayerId === playerId) return;
  cancelPlacing();

  if (state.party.role === 'player' && state.party.viewingPlayerId === null) saveOwnState();

  state.party.viewingPlayerId = playerId;
  const playerData = state.party.players[playerId];
  if (playerData) loadPlayerStateIntoView(playerData);

  updatePartyPanel();
  updateViewingBanner();
  document.body.classList.toggle('party-readonly', isReadOnly());
}

function switchViewToOwn() {
  if (state.party.viewingPlayerId === null) return;
  cancelPlacing();
  state.party.viewingPlayerId = null;

  if (state.party.role === 'player') {
    restoreOwnState();
  } else {
    // GM — back to no-selection state; show placeholder
    state.character = { name: 'Game Master', strength: 10 };
    state.instances = {};
    state.db = {};
    DEFAULT_ITEMS.forEach(t => { state.db[t.id] = t; });
    initGrid();
    buildGrid();
    renderAllItems();
    updateWeightDisplay();
  }

  updatePartyPanel();
  updateViewingBanner();
  document.body.classList.toggle('party-readonly', isReadOnly());
}

function isReadOnly() {
  if (!state.party.active) return false;
  if (state.party.role === 'gm') return false;
  return state.party.viewingPlayerId !== null;
}

function computeCarriedWeightFor(instances, customDb) {
  const db = {};
  DEFAULT_ITEMS.forEach(t => { db[t.id] = t; });
  Object.assign(db, customDb ?? {});
  return Object.values(instances ?? {}).reduce((sum, inst) => {
    const t = db[inst.templateId];
    if (!t) return sum;
    return sum + (t.stackable ? t.weightEach * inst.stackCount : shapeWeight(getRotatedShape(t.shape, inst.rotation)));
  }, 0);
}

// =============================================================================
// PARTY — UI
// =============================================================================
function openPartyModal() {
  document.querySelectorAll('.party-role-btn').forEach(b => b.classList.toggle('active', b.dataset.role === 'player'));
  document.getElementById('party-player-fields').classList.remove('hidden');
  document.getElementById('party-gm-fields').classList.add('hidden');
  document.getElementById('party-player-name').value = state.character.name || '';
  document.getElementById('party-join-code').value = '';
  showModal('party-modal');
}

function updatePartyUI() {
  const inParty = state.party.active;

  document.getElementById('party-code-badge').classList.toggle('hidden', !inParty);
  if (inParty) document.getElementById('party-code-badge').textContent = state.party.code;

  document.getElementById('party-no-session').classList.toggle('hidden', inParty);
  document.getElementById('party-session').classList.toggle('hidden', !inParty);

  if (inParty) {
    document.getElementById('party-code-text').textContent = state.party.code;
    const roleEl = document.getElementById('party-role-badge');
    roleEl.textContent = state.party.role === 'gm' ? 'Game Master' : 'Player';
    roleEl.className = 'party-role-badge ' + state.party.role;

    const gmHint = document.getElementById('party-gm-hint');
    gmHint.classList.toggle('hidden', !(state.party.role === 'gm' && state.party.viewingPlayerId === null));

    const gmPlaceholder = document.getElementById('gm-placeholder');
    gmPlaceholder.classList.toggle('hidden', !(state.party.role === 'gm' && state.party.viewingPlayerId === null));

    document.getElementById('char-summary').style.visibility =
      (state.party.role === 'gm' && state.party.viewingPlayerId === null) ? 'hidden' : '';
  } else {
    document.getElementById('char-summary').style.visibility = '';
    document.getElementById('gm-placeholder').classList.add('hidden');
  }

  document.body.classList.toggle('party-readonly', isReadOnly());
  updatePartyPanel();
  updateViewingBanner();
}

function updatePartyPanel() {
  const listEl = document.getElementById('party-player-list');
  if (!listEl) return;
  listEl.innerHTML = '';

  const players = state.party.players ?? {};

  if (Object.keys(players).length === 0 && state.party.role === 'gm') {
    const hint = document.createElement('p');
    hint.className = 'party-empty-hint';
    hint.textContent = 'Waiting for players to join…';
    listEl.appendChild(hint);
    return;
  }

  Object.entries(players).forEach(([id, p]) => {
    const isViewing = state.party.viewingPlayerId === id;
    const isOwn = state.party.role === 'player' && id === state.party.playerId;
    const canClick = !isOwn;

    const entry = document.createElement('div');
    entry.className = 'party-player-entry' +
      (isViewing ? ' viewing' : '') +
      (isOwn ? ' own' : '') +
      (canClick ? ' clickable' : '');

    const top = document.createElement('div');
    top.className = 'party-entry-top';

    const dot = document.createElement('span');
    dot.className = 'party-dot ' + (p.connected ? 'online' : 'offline');

    const nameEl = document.createElement('span');
    nameEl.className = 'party-player-name-text';
    nameEl.textContent = p.name + (isOwn ? ' (You)' : '');

    top.appendChild(dot);
    top.appendChild(nameEl);
    entry.appendChild(top);

    if (p.character) {
      const carried = computeCarriedWeightFor(p.instances, p.customDb);
      const encThreshold = p.character.strength * 15;
      const statusText = carried > encThreshold * 2 ? ' · Heavily Enc.' : carried > encThreshold ? ' · Enc.' : '';
      const infoEl = document.createElement('span');
      infoEl.className = 'party-player-info';
      infoEl.textContent = `${p.character.name} · ${Math.round(carried * 10) / 10} lb${statusText}`;
      entry.appendChild(infoEl);
    }

    if (canClick) {
      entry.addEventListener('click', () => {
        if (isViewing) switchViewToOwn();
        else switchViewToPlayer(id);
      });
    }

    listEl.appendChild(entry);
  });
}

function updateViewingBanner() {
  const banner = document.getElementById('viewing-banner');
  const viewId = state.party.viewingPlayerId;

  if (!state.party.active || viewId === null) {
    banner.classList.add('hidden');
    return;
  }

  banner.classList.remove('hidden');
  const name = state.party.players[viewId]?.name ?? 'Player';
  const textEl = document.getElementById('viewing-banner-text');
  const returnBtn = document.getElementById('return-to-own-btn');

  if (state.party.role === 'gm') {
    textEl.textContent = `Editing ${name}'s inventory`;
    returnBtn.textContent = 'Deselect Player';
  } else {
    textEl.textContent = `Viewing ${name}'s inventory (read-only)`;
    returnBtn.textContent = 'Return to Your Inventory';
  }

  // Also keep GM placeholder in sync
  document.getElementById('gm-placeholder').classList.add('hidden');
}

// Party UI event listeners
document.getElementById('party-btn').addEventListener('click', () => {
  if (state.party.active) switchTab('party');
  else openPartyModal();
});

document.getElementById('open-party-modal-btn').addEventListener('click', openPartyModal);

document.querySelectorAll('.party-role-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.party-role-btn').forEach(b => b.classList.toggle('active', b === btn));
    const isGM = btn.dataset.role === 'gm';
    document.getElementById('party-player-fields').classList.toggle('hidden', isGM);
    document.getElementById('party-gm-fields').classList.toggle('hidden', !isGM);
  });
});

document.getElementById('party-create-btn').addEventListener('click', createParty);

document.getElementById('party-join-btn').addEventListener('click', () => {
  const name = document.getElementById('party-player-name').value.trim();
  const code = document.getElementById('party-join-code').value.trim();
  if (!name) { alert('Please enter your name.'); return; }
  if (!code) { alert('Please enter the party code.'); return; }
  joinParty(code, name);
});

document.getElementById('copy-code-btn').addEventListener('click', () => {
  navigator.clipboard.writeText(state.party.code ?? '').then(() => {
    flashButton(document.getElementById('copy-code-btn'), 'Copied!');
  });
});

document.getElementById('leave-party-btn').addEventListener('click', () => {
  if (confirm('Leave the party?')) leaveParty();
});

document.getElementById('return-to-own-btn').addEventListener('click', switchViewToOwn);

// =============================================================================
// INITIALIZATION
// =============================================================================
function init() {
  DEFAULT_ITEMS.forEach(t => { state.db[t.id] = t; });
  initGrid();
  buildGrid();
  renderItemList();
  updateWeightDisplay();
  initFirebase();
}

init();
