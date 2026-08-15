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

function getCoinCounts() {
  const counts = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
  const coinMap = { coin_cp: 'cp', coin_sp: 'sp', coin_ep: 'ep', coin_gp: 'gp', coin_pp: 'pp' };
  Object.values(state.instances).forEach(inst => {
    const denom = coinMap[inst.templateId];
    if (denom !== undefined) counts[denom] += inst.stackCount ?? 1;
  });
  return counts;
}

function addCoinsToInventory(templateId, totalToAdd) {
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
  const coinMap = { coin_cp: 'cp', coin_sp: 'sp', coin_ep: 'ep', coin_gp: 'gp', coin_pp: 'pp' };
  const denom = coinMap[templateId];
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
