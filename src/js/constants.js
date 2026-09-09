// =============================================================================
// CONSTANTS — Tunables, rarity metadata, equipment slot definitions
// =============================================================================
'use strict';

const CELL = 44;          // px per grid square
const GRID_COLS = 15;     // fixed column count

const RARITY_META = {
  common:    { label: 'Common',           color: '#b0b0b0' },
  uncommon:  { label: 'Uncommon',         color: '#1eff00' },
  rare:      { label: 'Rare',             color: '#0084ff' },
  very_rare: { label: 'Very Rare',        color: '#c040ff' },
  legendary: { label: 'Legendary',        color: '#ff8000' },
  artifact:  { label: 'Artifact',         color: '#e6cc80' },
  special:   { label: 'Special',          color: '#ff4da6' },
};

const RARITY_ORDER = ['common','uncommon','rare','very_rare','legendary','artifact','special'];

// The equip slots and their default arrangement. `state.equipLayout` is the
// working copy the layout editor edits; `getSlotDef()` reads slots back out of
// it.
function getDefaultEquipLayout() {
  return [
    { type: 'header', label: 'Body' },
    { type: 'slot', id: 'head',     label: 'Headgear',  panelLabel: 'Head',   attuneOnly: false, inRow: false, visible: true },
    { type: 'slot', id: 'armor',    label: 'Armor',     panelLabel: '',       attuneOnly: false, inRow: false, visible: true },
    { type: 'slot', id: 'cloak',    label: 'Cloak',     panelLabel: '',       attuneOnly: false, inRow: false, visible: true },
    { type: 'slot', id: 'gloves',   label: 'Gloves',    panelLabel: '',       attuneOnly: false, inRow: false, visible: true },
    { type: 'slot', id: 'boots',    label: 'Footwear',  panelLabel: '',       attuneOnly: false, inRow: false, visible: true },
    { type: 'header', label: 'Weapons' },
    { type: 'slot', id: 'mainHand', label: 'Main Hand', panelLabel: 'Main',   attuneOnly: false, inRow: true,  visible: true },
    { type: 'slot', id: 'offHand',  label: 'Off Hand',  panelLabel: 'Off',    attuneOnly: false, inRow: true,  visible: true },
    { type: 'slot', id: 'ranged',   label: 'Ranged',    panelLabel: 'Ranged', attuneOnly: false, inRow: true,  visible: true },
    { type: 'header', label: 'Wondrous' },
    { type: 'slot', id: 'attune1',  label: 'Slot I',    panelLabel: '',       attuneOnly: true,  inRow: false, visible: true },
    { type: 'slot', id: 'attune2',  label: 'Slot II',   panelLabel: '',       attuneOnly: true,  inRow: false, visible: true },
    { type: 'slot', id: 'attune3',  label: 'Slot III',  panelLabel: '',       attuneOnly: true,  inRow: false, visible: true },
  ];
}

function getSlotDef(slotId) {
  return state.equipLayout.find(item => item.type === 'slot' && item.id === slotId);
}

// =============================================================================
// DEFAULT ITEM DATABASE  (defined in items.js, loaded before this script)
// =============================================================================
