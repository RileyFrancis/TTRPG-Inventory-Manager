// =============================================================================
// HELPERS — Shared formatting and lookup helpers
// =============================================================================
'use strict';

// =============================================================================
// HELPERS
// =============================================================================
// ─── STACKING ──────────────────────────────────────────────────────────────
// A template's `stackSize` is how many of the item fit in one grid cell. A cell
// is 1 lb, so each unit weighs 1 / stackSize. A stackSize of 1 (or absent) means
// the item does not stack. Templates written before stackSize existed carry
// `stackable` + `weightEach` instead — old saves and party data are read through
// these helpers, so they keep working.
function stackSizeOf(t) {
  if (t?.stackSize) return t.stackSize;
  if (t?.stackable && t.weightEach) return Math.round(1 / t.weightEach);
  return 1;
}

function isStackable(t) {
  return stackSizeOf(t) > 1;
}

function unitWeight(t) {
  return 1 / stackSizeOf(t);
}

// Stack weights are fractions of a pound; trim the float noise (1/3 → 0.333).
function formatWeight(lb) {
  return String(Math.round(lb * 1000) / 1000);
}

function parseCostObj(val) {
  if (typeof val === 'object' && val !== null) return { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0, ...val };
  if (typeof val === 'number') return { cp: 0, sp: 0, ep: 0, gp: val, pp: 0 };
  return { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
}

function hasCost(cost) {
  const c = parseCostObj(cost);
  return !!(c.cp || c.sp || c.ep || c.gp || c.pp);
}

function formatCost(cost) {
  const c = parseCostObj(cost);
  const parts = [];
  if (c.pp) parts.push(`${c.pp} pp`);
  if (c.gp) parts.push(`${c.gp} gp`);
  if (c.ep) parts.push(`${c.ep} ep`);
  if (c.sp) parts.push(`${c.sp} sp`);
  if (c.cp) parts.push(`${c.cp} cp`);
  return parts.length ? parts.join(' ') : '—';
}

// ─── ICONS ─────────────────────────────────────────────────────────────────
// One icon from img/icon, as an element. The picture is a CSS mask over
// currentColor (see icons.css), so the caller sets no colour — the icon takes
// whatever the surrounding text is, in either theme.
//
// `lead` adds the gap for an icon sitting in front of a button's label. Pass
// it only where the parent is not already spacing its children.
function iconEl(name, lead) {
  const el = document.createElement('span');
  el.className = 'ico ico-' + name + (lead ? ' lead' : '');
  return el;
}

// A button (or any element) whose label is an icon followed by text.
function setIconLabel(el, name, text) {
  el.textContent = '';
  el.appendChild(iconEl(name, true));
  el.appendChild(document.createTextNode(text));
}

// ─── COINS ─────────────────────────────────────────────────────────────────
// The coin templates are found in the database, never hard-coded: a default
// item's id is its row number in data/items.csv, so any id written into the
// code breaks the moment a row is inserted above it (which is exactly how the
// purse went dead). A coin identifies itself instead — it is the `currency`
// item whose cost is one of its own denomination, and nothing else costs
// exactly 1cp but a copper piece.
const COIN_DENOMS = ['cp', 'sp', 'ep', 'gp', 'pp'];

function getCoinTemplates() {
  const found = { cp: null, sp: null, ep: null, gp: null, pp: null };
  Object.values(state.db).forEach(t => {
    if (!t.tags?.includes('currency')) return;
    const cost = parseCostObj(t.cost);
    const denom = COIN_DENOMS.find(d => cost[d] === 1 && COIN_DENOMS.every(o => o === d || !cost[o]));
    if (denom && !found[denom]) found[denom] = t.id;
  });
  return found;
}

function coinDenomOf(templateId) {
  const templates = getCoinTemplates();
  return COIN_DENOMS.find(d => templates[d] === templateId) ?? null;
}

// Every coin carried, wherever it sits — stashed or placed on the grid.
function getCoinCounts() {
  const counts = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
  const templates = getCoinTemplates();
  const denomOf = {};
  COIN_DENOMS.forEach(d => { if (templates[d]) denomOf[templates[d]] = d; });
  Object.values(state.instances).forEach(inst => {
    const denom = denomOf[inst.templateId];
    if (denom) counts[denom] += inst.stackCount ?? 1;
  });
  return counts;
}

// Add units of a stackable item, topping up part-filled stacks before starting
// new ones in the stash. Coins were the first caller; shop purchases are the
// second — neither wants a screenful of ×1 stacks. Mutation only: the caller
// re-renders, so a run of these costs one redraw rather than one each.
function addStackableUnits(templateId, totalToAdd) {
  if (totalToAdd <= 0) return;
  const t = state.db[templateId];
  if (!t) return;
  const maxStack = stackSizeOf(t);
  let remaining = totalToAdd;

  // Fill existing non-full stacks first (least-full first)
  const partial = Object.values(state.instances)
    .filter(inst => inst.templateId === templateId && (inst.stackCount ?? 1) < maxStack)
    .sort((a, b) => (a.stackCount ?? 1) - (b.stackCount ?? 1));

  for (const inst of partial) {
    if (remaining <= 0) break;
    const space = maxStack - (inst.stackCount ?? 1);
    const adding = Math.min(space, remaining);
    inst.stackCount = (inst.stackCount ?? 1) + adding;
    remaining -= adding;
  }

  // Create new stash stacks for any remainder
  while (remaining > 0) {
    const count = Math.min(maxStack, remaining);
    const id = newId();
    state.instances[id] = { id, templateId, rotation: 0, row: null, col: null, stackCount: count };
    remaining -= count;
  }
}

function addCoinsToInventory(templateId, totalToAdd) {
  addStackableUnits(templateId, totalToAdd);
  renderAllItems();
  updateWeightDisplay();
  debouncedSync();
}

function openAddCoinsModal(templateId) {
  if (isReadOnly()) return;
  const t = state.db[templateId];
  if (!t) return;
  stackModalCallback = count => addCoinsToInventory(templateId, count);
  document.getElementById('stack-modal-desc').textContent = `How many ${t.name}s to add?`;
  const input = document.getElementById('stack-count-input');
  input.removeAttribute('max');
  input.min = '1';
  input.value = '1';
  document.getElementById('stack-confirm-btn').textContent = 'Add';
  showModal('stack-modal');
}

function removeCoinsFromInventory(templateId, totalToRemove) {
  if (totalToRemove <= 0) return;
  let remaining = totalToRemove;

  // Remove from smallest stacks first to eliminate partials before touching full stacks
  const instances = Object.values(state.instances)
    .filter(inst => inst.templateId === templateId)
    .sort((a, b) => (a.stackCount ?? 1) - (b.stackCount ?? 1));

  for (const inst of instances) {
    if (remaining <= 0) break;
    const count = inst.stackCount ?? 1;
    if (count <= remaining) {
      if (inst.row !== null && inst.row !== undefined) {
        unequipInstance(inst.id);
        removeFromGrid(inst.id);
      }
      delete state.instances[inst.id];
      remaining -= count;
    } else {
      inst.stackCount = count - remaining;
      remaining = 0;
    }
  }

  renderAllItems();
  updateWeightDisplay();
  debouncedSync();
}

function openRemoveCoinsModal(templateId) {
  if (isReadOnly()) return;
  const t = state.db[templateId];
  if (!t) return;
  const denom = coinDenomOf(templateId);
  const total = denom ? getCoinCounts()[denom] : 0;
  if (total === 0) return;
  stackModalCallback = count => removeCoinsFromInventory(templateId, count);
  document.getElementById('stack-modal-desc').textContent = `How many ${t.name}s to remove? (have ${total.toLocaleString()})`;
  const input = document.getElementById('stack-count-input');
  input.max = total;
  input.min = '1';
  input.value = '1';
  document.getElementById('stack-confirm-btn').textContent = 'Remove';
  showModal('stack-modal');
}

// ─── RARITY COLOURS ────────────────────────────────────────────────────────
// The palette lives in CSS (--rarity-*) so each theme can tune it: the neon
// greens that read well on the dark ground would vanish on parchment. These
// values get baked into inline styles at render time, so theme.js clears the
// cache and re-renders on a palette swap.
let _rarityColorCache = {};

function rarityColor(rarity) {
  if (_rarityColorCache[rarity]) return _rarityColorCache[rarity];
  const fromCss = getComputedStyle(document.documentElement)
    .getPropertyValue('--rarity-' + rarity).trim();
  const color = fromCss || RARITY_META[rarity]?.color || '#888';
  _rarityColorCache[rarity] = color;
  return color;
}

// Coin metals get the same treatment: bright gold and silver disappear
// against parchment, so each theme names its own.
function coinColor(denom) {
  const key = 'coin:' + denom;
  if (_rarityColorCache[key]) return _rarityColorCache[key];
  const color = getComputedStyle(document.documentElement)
    .getPropertyValue('--coin-' + denom).trim() || 'currentColor';
  _rarityColorCache[key] = color;
  return color;
}

function clearRarityColorCache() {
  _rarityColorCache = {};
}
