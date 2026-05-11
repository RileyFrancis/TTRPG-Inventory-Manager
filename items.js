// =============================================================================
// DEFAULT ITEM DATABASE — items.js
// =============================================================================
// Edit this file to customise the built-in item list.
//
// Each entry is an ItemTemplate:
//   id         — unique string key (used by save data; don't change once placed)
//   name       — display name
//   rarity     — 'common' | 'uncommon' | 'rare' | 'very_rare' | 'legendary' | 'artifact'
//   description — flavour / rules text (optional)
//   cost       — value in gold pieces
//   tags       — array of lowercase strings for filtering
//   image      — URL string (optional)
//   damage     — dice string e.g. '1d8' (optional)
//   damageType — 'slashing' | 'piercing' | 'bludgeoning' | 'fire' | … (optional)
//   attunement — true if the item requires attunement (optional)
//   stackable  — true for items lighter than 1 lb each
//   weightEach — lb per item when stackable (must divide evenly into 1)
//   shape      — 2D array of 0/1 rows; weight = count of 1s (1 lb per cell)
//                stackable items always use [[1]]

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
    damage: '1d4', damageType: 'piercing',
    tags: ['weapon', 'melee', 'finesse', 'thrown', 'martial'], image: '',
  },
  {
    id: 'handaxe', name: 'Handaxe', rarity: 'common',
    description: 'A small axe that can be thrown. Thrown (20/60 ft).',
    shape: [[1],[1],[1]], stackable: false, cost: 5,
    damage: '1d6', damageType: 'slashing',
    tags: ['weapon', 'melee', 'thrown', 'simple'], image: '',
  },
  // ── SWORDS ────────────────────────────────────────────────────────────────
  {
    id: 'short_sword', name: 'Short Sword', rarity: 'common',
    description: 'A nimble martial blade. Finesse, light.',
    shape: [[1],[1],[1]], stackable: false, cost: 10,
    damage: '1d6', damageType: 'piercing',
    tags: ['weapon', 'melee', 'finesse', 'light', 'martial'], image: '',
  },
  {
    id: 'longsword', name: 'Longsword', rarity: 'common',
    description: 'A versatile martial sword. Can be wielded one- or two-handed.',
    shape: [[1],[1],[1],[1]], stackable: false, cost: 15,
    damage: '1d8', damageType: 'slashing',
    tags: ['weapon', 'melee', 'versatile', 'martial'], image: '',
  },
  {
    id: 'rapier', name: 'Rapier', rarity: 'common',
    description: 'An elegant piercing blade with unmatched finesse.',
    shape: [[1],[1],[1],[1]], stackable: false, cost: 25,
    damage: '1d8', damageType: 'piercing',
    tags: ['weapon', 'melee', 'finesse', 'martial'], image: '',
  },
  {
    id: 'greatsword', name: 'Greatsword', rarity: 'common',
    description: 'A massive two-handed blade that deals tremendous damage.',
    shape: [[1,1],[1,1],[1,1],[1,1],[1,1]], stackable: false, cost: 50,
    damage: '2d6', damageType: 'slashing',
    tags: ['weapon', 'melee', 'heavy', 'two-handed', 'martial'], image: '',
  },
  {
    id: 'scimitar', name: 'Scimitar', rarity: 'common',
    description: 'A curved, slashing blade favored by desert warriors.',
    shape: [[0,1],[1,1],[1,0],[1,0]], stackable: false, cost: 25,
    damage: '1d6', damageType: 'slashing',
    tags: ['weapon', 'melee', 'finesse', 'light', 'martial'], image: '',
  },
  // ── AXES ──────────────────────────────────────────────────────────────────
  {
    id: 'battleaxe', name: 'Battleaxe', rarity: 'common',
    description: 'A war axe usable with one or two hands.',
    shape: [[1,1,0],[0,1,0],[0,1,0],[0,1,1]], stackable: false, cost: 10,
    damage: '1d8', damageType: 'slashing',
    tags: ['weapon', 'melee', 'versatile', 'martial'], image: '',
  },
  {
    id: 'greataxe', name: 'Greataxe', rarity: 'common',
    description: 'A massive two-handed axe dealing 1d12 damage.',
    shape: [[1,1,1],[1,1,1],[0,1,0],[0,1,0],[0,1,0],[0,1,1]], stackable: false, cost: 30,
    damage: '1d12', damageType: 'slashing',
    tags: ['weapon', 'melee', 'heavy', 'two-handed', 'martial'], image: '',
  },
  // ── POLEARMS & STAVES ─────────────────────────────────────────────────────
  {
    id: 'quarterstaff', name: 'Quarterstaff', rarity: 'common',
    description: 'A simple wooden staff, versatile in a trained hand.',
    shape: [[1],[1],[1],[1],[1]], stackable: false, cost: 0.2,
    damage: '1d6', damageType: 'bludgeoning',
    tags: ['weapon', 'melee', 'versatile', 'simple'], image: '',
  },
  {
    id: 'spear', name: 'Spear', rarity: 'common',
    description: 'A wooden shaft tipped with iron. Thrown (20/60 ft).',
    shape: [[1],[1],[1],[1]], stackable: false, cost: 1,
    damage: '1d6', damageType: 'piercing',
    tags: ['weapon', 'melee', 'thrown', 'simple'], image: '',
  },
  {
    id: 'halberd', name: 'Halberd', rarity: 'common',
    description: 'A polearm with an axe-blade and a spike. Reach.',
    shape: [[1,1],[0,1],[0,1],[0,1],[0,1],[0,1]], stackable: false, cost: 20,
    damage: '1d10', damageType: 'slashing',
    tags: ['weapon', 'melee', 'heavy', 'reach', 'two-handed', 'martial'], image: '',
  },
  {
    id: 'glaive', name: 'Glaive', rarity: 'common',
    description: 'A blade on a long pole. Heavy, reach, two-handed.',
    shape: [[1,0],[1,1],[0,1],[0,1],[0,1],[0,1]], stackable: false, cost: 20,
    damage: '1d10', damageType: 'slashing',
    tags: ['weapon', 'melee', 'heavy', 'reach', 'two-handed', 'martial'], image: '',
  },
  // ── MACES & HAMMERS ───────────────────────────────────────────────────────
  {
    id: 'mace', name: 'Mace', rarity: 'common',
    description: 'A bludgeoning weapon effective against armor.',
    shape: [[1,1],[0,1],[0,1],[0,1]], stackable: false, cost: 5,
    damage: '1d6', damageType: 'bludgeoning',
    tags: ['weapon', 'melee', 'bludgeoning', 'simple'], image: '',
  },
  {
    id: 'warhammer', name: 'Warhammer', rarity: 'common',
    description: 'A heavy bludgeoning weapon. Versatile.',
    shape: [[1,1,1],[0,1,0],[0,1,0],[0,1,0]], stackable: false, cost: 15,
    damage: '1d8', damageType: 'bludgeoning',
    tags: ['weapon', 'melee', 'bludgeoning', 'versatile', 'martial'], image: '',
  },
  {
    id: 'maul', name: 'Maul', rarity: 'common',
    description: 'A two-handed war hammer. Heavy.',
    shape: [[1,1,1],[1,1,1],[0,1,0],[0,1,0],[0,1,0]], stackable: false, cost: 10,
    damage: '2d6', damageType: 'bludgeoning',
    tags: ['weapon', 'melee', 'bludgeoning', 'heavy', 'two-handed', 'martial'], image: '',
  },
  // ── RANGED WEAPONS ────────────────────────────────────────────────────────
  {
    id: 'shortbow', name: 'Shortbow', rarity: 'common',
    description: 'A compact bow with 80/320 ft range.',
    shape: [[1,0],[1,1],[1,0],[1,0]], stackable: false, cost: 25,
    damage: '1d6', damageType: 'piercing',
    tags: ['weapon', 'ranged', 'two-handed', 'simple'], image: '',
  },
  {
    id: 'longbow', name: 'Longbow', rarity: 'common',
    description: 'A powerful bow with 150/600 ft range.',
    shape: [[1,0],[1,1],[1,0],[1,0],[1,0],[1,0]], stackable: false, cost: 50,
    damage: '1d8', damageType: 'piercing',
    tags: ['weapon', 'ranged', 'two-handed', 'heavy', 'martial'], image: '',
  },
  {
    id: 'hand_crossbow', name: 'Hand Crossbow', rarity: 'common',
    description: 'A compact crossbow, light and concealable.',
    shape: [[1,1,1],[0,1,0],[0,1,0]], stackable: false, cost: 75,
    damage: '1d6', damageType: 'piercing',
    tags: ['weapon', 'ranged', 'light', 'martial'], image: '',
  },
  {
    id: 'heavy_crossbow', name: 'Heavy Crossbow', rarity: 'common',
    description: 'A powerful crossbow with 100/400 ft range.',
    shape: [[1,1,1,1],[0,1,1,0],[0,0,1,0],[0,0,1,0]], stackable: false, cost: 50,
    damage: '1d10', damageType: 'piercing',
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
