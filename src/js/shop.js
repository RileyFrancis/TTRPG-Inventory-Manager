// =============================================================================
// SHOP — GM-built shops the party buys from, and the left panel's tabs
// =============================================================================
'use strict';

// A shop belongs to the table, not to a character: the GM builds it, the whole
// party draws from one pile of stock, and a sword bought by one player is gone
// for the rest. Firebase is therefore the only copy — `state.shops` is a
// read-through cache of `parties/<code>/shops` and every GM edit writes straight
// there. Nothing about a shop enters the save file.
//
// Reveal is a *pacing* control, not a security boundary. An unrevealed shop is
// filtered out on the client by shopVisibleToMe(); a player who reads the
// database directly could still see it. Making a draft genuinely unreadable
// would mean parking it under a GM-only path — see CLAUDE.md.

const SHOP_UNLIMITED = -1; // qty sentinel: RTDB drops nulls, so it cannot be one

// =============================================================================
// SHOP — MODEL
// =============================================================================
function shopsPath(shopId) {
  return `parties/${state.party.code}/shops` + (shopId ? '/' + shopId : '');
}
function shopRef(shopId) { return firebaseDb.ref(shopsPath(shopId)); }

function isShopGM() { return state.party.active && state.party.role === 'gm'; }

// You buy for the character you are actually playing — never while looking at
// somebody else's inventory, which is not yours to spend from.
function canBuyFromShop() {
  return state.party.active && state.party.role === 'player' && state.party.viewingPlayerId === null;
}

function shopVisibleToMe(shop) {
  if (isShopGM()) return true;
  if (!shop.revealed) return false;
  if (shop.audience === 'all') return true;
  const chosen = shop.players ?? {};
  if (chosen[state.party.playerId]) return true;
  // Rejoining the party mints a fresh player id, so a shop revealed before a
  // reload would go dark on the player it was meant for. The name the GM ticked
  // is the half of that choice that survives, so it is stored alongside.
  const names = shop.playerNames ?? {};
  return Object.keys(chosen).some(pid => chosen[pid] && names[pid] && names[pid] === state.party.playerName);
}

function visibleShops() {
  return Object.values(state.shops ?? {})
    .filter(s => s && s.id)
    .filter(shopVisibleToMe)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function shopStockEntries(shop) {
  return Object.entries(shop.stock ?? {})
    .map(([entryId, e]) => ({ ...e, entryId }))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

// The item is snapshotted into the shop rather than referenced, so a shop can
// stock something the buyer has never owned, and so a later edit to the GM's own
// catalogue cannot change a listing out from under the players. Stored as JSON
// for the reason cloud-save.js stores the save file that way: RTDB drops nulls
// and empty objects, and templates are full of both.
function shopEntryTemplate(entry) {
  try { return JSON.parse(entry.template); } catch { return null; }
}

function shopEntryPrice(entry) {
  return parseCostObj(entry.price ?? shopEntryTemplate(entry)?.cost);
}

function stockLabel(entry) {
  if (entry.qty === SHOP_UNLIMITED) return 'unlimited';
  const q = entry.qty ?? 0;
  return q <= 0 ? 'sold out' : `${q} left`;
}

function isSoldOut(entry) {
  return entry.qty !== SHOP_UNLIMITED && (entry.qty ?? 0) <= 0;
}

function shopAudienceLabel(shop) {
  if (!shop.revealed) return 'Hidden';
  if (shop.audience === 'all') return 'Everyone';
  const n = Object.values(shop.players ?? {}).filter(Boolean).length;
  return n ? `${n} player${n === 1 ? '' : 's'}` : 'Nobody yet';
}

// =============================================================================
// SHOP — FIREBASE
// =============================================================================
let partyShopsRef = null;

function subscribeToShops(code) {
  unsubscribeFromShops();
  if (!firebaseDb) return;
  partyShopsRef = firebaseDb.ref(`parties/${code}/shops`);
  partyShopsRef.on('value', snap => {
    state.shops = snap.val() ?? {};
    // A shop deleted by the GM must not leave its editor open on somebody else.
    if (state.shopOpenId && !state.shops[state.shopOpenId]) state.shopOpenId = null;
    // A newly revealed shop makes the tab appear, so this goes through the tabs.
    syncLeftPanel();
    if (!document.getElementById('shop-buy-modal').classList.contains('hidden')) updateBuySummary();
  });
}

function unsubscribeFromShops() {
  if (partyShopsRef) { partyShopsRef.off(); partyShopsRef = null; }
  state.shops = {};
  state.shopOpenId = null;
}

// =============================================================================
// LEFT PANEL — TABS
// =============================================================================
const LEFT_TAB_LABELS = { equip: 'Equipment', shop: 'Shop' };

// Which panes the left panel has right now. A GM has no character of their own,
// so equipment is only theirs to look at while a player is picked — and with
// nobody picked the Shop is the whole panel rather than an empty rack of slots.
function leftTabsAvailable() {
  const gm = isShopGM();
  const hasShop = state.party.active && (gm || visibleShops().length > 0);
  const hasEquip = !gm || state.party.viewingPlayerId !== null;
  const tabs = [];
  if (gm && hasShop) tabs.push('shop');          // the GM's own tools come first
  if (hasEquip) tabs.push('equip');
  if (!gm && hasShop) tabs.push('shop');
  return tabs.length ? tabs : ['equip'];
}

function syncLeftPanel() {
  const strip = document.getElementById('left-tabs');
  if (!strip) return;
  const tabs = leftTabsAvailable();
  if (!tabs.includes(state.leftTab)) state.leftTab = tabs[0];

  // One pane needs no tabs — a solo player's panel looks exactly as it always did.
  strip.classList.toggle('hidden', tabs.length < 2);
  strip.innerHTML = '';
  tabs.forEach(id => {
    const btn = document.createElement('button');
    btn.className = 'ltab-btn' + (id === state.leftTab ? ' active' : '');
    btn.textContent = LEFT_TAB_LABELS[id];
    btn.addEventListener('click', () => setLeftTab(id));
    strip.appendChild(btn);
  });

  document.getElementById('left-pane-equip').classList.toggle('active', state.leftTab === 'equip');
  document.getElementById('left-pane-shop').classList.toggle('active', state.leftTab === 'shop');
  if (tabs.includes('shop')) renderShopPanel();
}

function setLeftTab(id) {
  if (state.leftTab === id) return;
  state.leftTab = id;
  clearTooltip();
  syncLeftPanel();
}

// =============================================================================
// SHOP — PANEL
// =============================================================================
function renderShopPanel() {
  const pane = document.getElementById('left-pane-shop');
  if (!pane) return;
  pane.innerHTML = '';
  if (!state.party.active) return;
  const shop = state.shopOpenId ? state.shops[state.shopOpenId] : null;
  if (shop) renderShopDetail(pane, shop);
  else renderShopList(pane);
}

function renderShopList(pane) {
  const gm = isShopGM();

  const head = document.createElement('div');
  head.className = 'shop-head';
  const title = document.createElement('span');
  title.className = 'shop-head-title';
  title.textContent = 'Shops';
  head.appendChild(title);
  pane.appendChild(head);

  const body = document.createElement('div');
  body.className = 'shop-body';

  const shops = visibleShops();
  if (!shops.length) {
    const empty = document.createElement('p');
    empty.className = 'shop-empty';
    empty.textContent = gm
      ? 'No shops yet. Build one now and reveal it when the party walks in.'
      : 'No shops are open to you right now.';
    body.appendChild(empty);
  }

  shops.forEach(shop => {
    const row = document.createElement('button');
    row.className = 'shop-row' + (shop.revealed ? ' revealed' : '');
    const nm = document.createElement('span');
    nm.className = 'shop-row-name';
    nm.textContent = shop.name;
    const n = shopStockEntries(shop).length;
    const sub = document.createElement('span');
    sub.className = 'shop-row-sub';
    sub.textContent = `${n} item${n === 1 ? '' : 's'}` + (gm ? ` · ${shopAudienceLabel(shop)}` : '');
    row.appendChild(nm);
    row.appendChild(sub);
    row.addEventListener('click', () => { state.shopOpenId = shop.id; renderShopPanel(); });
    body.appendChild(row);
  });

  pane.appendChild(body);

  if (gm) {
    const footer = document.createElement('div');
    footer.className = 'shop-footer';
    const btn = document.createElement('button');
    btn.className = 'btn-primary';
    btn.textContent = '+ New Shop';
    btn.addEventListener('click', () => openShopModal(null));
    footer.appendChild(btn);
    pane.appendChild(footer);
  }
}

function renderShopDetail(pane, shop) {
  const gm = isShopGM();

  const head = document.createElement('div');
  head.className = 'shop-head';
  const back = document.createElement('button');
  back.className = 'shop-back';
  back.textContent = '‹ Shops';
  back.addEventListener('click', () => { state.shopOpenId = null; renderShopPanel(); });
  head.appendChild(back);
  if (gm) {
    const edit = document.createElement('button');
    edit.className = 'shop-head-btn';
    edit.title = 'Rename or re-describe this shop';
    edit.textContent = '✎';
    edit.addEventListener('click', () => openShopModal(shop.id));
    const del = document.createElement('button');
    del.className = 'shop-head-btn danger';
    del.title = 'Delete this shop';
    del.textContent = '✕';
    del.addEventListener('click', () => deleteShop(shop));
    head.appendChild(edit);
    head.appendChild(del);
  }
  pane.appendChild(head);

  const body = document.createElement('div');
  body.className = 'shop-body';

  const title = document.createElement('div');
  title.className = 'shop-title';
  title.textContent = shop.name;
  body.appendChild(title);

  if (shop.description) {
    const d = document.createElement('p');
    d.className = 'shop-desc';
    d.textContent = shop.description;
    body.appendChild(d);
  }

  if (gm) buildShopRevealControls(body, shop);

  const hdr = document.createElement('div');
  hdr.className = 'shop-section-hdr';
  hdr.textContent = gm ? 'Stock' : 'For Sale';
  body.appendChild(hdr);

  const entries = shopStockEntries(shop);
  if (!entries.length) {
    const p = document.createElement('p');
    p.className = 'shop-empty';
    p.textContent = gm ? 'Nothing stocked yet.' : 'The shelves are bare.';
    body.appendChild(p);
  }
  entries.forEach(entry => body.appendChild(buildStockRow(shop, entry, gm)));

  pane.appendChild(body);

  if (gm) {
    const footer = document.createElement('div');
    footer.className = 'shop-footer';
    const add = document.createElement('button');
    add.className = 'btn-primary';
    add.textContent = '+ Add Items';
    add.addEventListener('click', () => openShopAddModal(shop));
    footer.appendChild(add);
    pane.appendChild(footer);
  }
}

function buildShopRevealControls(body, shop) {
  const hdr = document.createElement('div');
  hdr.className = 'shop-section-hdr';
  hdr.textContent = 'Visible To';
  body.appendChild(hdr);

  const current = !shop.revealed ? 'hidden' : (shop.audience === 'all' ? 'all' : 'select');
  const seg = document.createElement('div');
  seg.className = 'segmented shop-seg';
  [['hidden', 'Hidden'], ['all', 'Everyone'], ['select', 'Choose']].forEach(([key, label]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'seg-btn' + (key === current ? ' active' : '');
    b.textContent = label;
    b.addEventListener('click', () => setShopAudience(shop, key));
    seg.appendChild(b);
  });
  body.appendChild(seg);

  if (current !== 'select') return;

  const players = Object.entries(state.party.players ?? {});
  if (!players.length) {
    const p = document.createElement('p');
    p.className = 'shop-empty';
    p.textContent = 'Nobody has joined the party yet.';
    body.appendChild(p);
  }
  players.forEach(([pid, p]) => {
    const lbl = document.createElement('label');
    lbl.className = 'checkbox-label shop-player-check';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!(shop.players ?? {})[pid];
    cb.addEventListener('change', () => toggleShopPlayer(shop, pid, p.name, cb.checked));
    const sp = document.createElement('span');
    sp.textContent = p.character?.name ? `${p.name} · ${p.character.name}` : p.name;
    lbl.appendChild(cb);
    lbl.appendChild(sp);
    body.appendChild(lbl);
  });
}

function buildStockRow(shop, entry, gm) {
  const t = shopEntryTemplate(entry);
  const sold = isSoldOut(entry);

  const row = document.createElement('div');
  row.className = 'shop-item clickable' + (sold ? ' sold-out' : '');

  const swatch = document.createElement('span');
  swatch.className = 'shop-item-swatch';
  swatch.style.background = rarityColor(t?.rarity ?? 'common');

  const info = document.createElement('div');
  info.className = 'shop-item-info';
  const nm = document.createElement('span');
  nm.className = 'shop-item-name';
  nm.textContent = t?.name ?? 'Unknown item';
  const price = shopEntryPrice(entry);
  const sub = document.createElement('span');
  sub.className = 'shop-item-sub';
  sub.textContent = `${hasCost(price) ? formatCost(price) : 'Free'} · ${stockLabel(entry)}`;
  info.appendChild(nm);
  info.appendChild(sub);

  row.appendChild(swatch);
  row.appendChild(info);

  if (gm) {
    row.title = 'Set quantity and price';
    row.addEventListener('click', () => openShopEntryModal(shop, entry));
  } else {
    // The row is small, so looking an item over happens in the Details tab.
    row.addEventListener('click', () => showShopItemDetails(entry));
    const buy = document.createElement('button');
    buy.className = 'btn-sm shop-buy-btn';
    buy.textContent = sold ? 'Sold' : 'Buy';
    buy.disabled = sold || !canBuyFromShop();
    if (!sold && !canBuyFromShop()) buy.title = 'Return to your own inventory to buy.';
    buy.addEventListener('click', e => { e.stopPropagation(); openBuyModal(shop, entry); });
    row.appendChild(buy);
  }

  return row;
}

// A shop item may be something the viewer has never owned, so the details panel
// is handed the shop's own snapshot instead of a lookup in state.db — and the
// action buttons go away, since none of them mean anything for goods on a shelf.
function showShopItemDetails(entry) {
  const t = shopEntryTemplate(entry);
  if (!t) return;
  state.selected = null;
  populateDetailsPanel(t);
  const price = shopEntryPrice(entry);
  document.getElementById('details-cost').textContent = hasCost(price) ? formatCost(price) : 'Free';
  document.getElementById('details-actions').classList.add('hidden');
  switchTab('details');
}

// =============================================================================
// SHOP — GM EDITS
// =============================================================================
let shopModalId = null;

function openShopModal(shopId) {
  shopModalId = shopId;
  const shop = shopId ? state.shops[shopId] : null;
  document.getElementById('shop-modal-title').textContent = shop ? 'Edit Shop' : 'New Shop';
  document.getElementById('shop-name-input').value = shop?.name ?? '';
  document.getElementById('shop-desc-input').value = shop?.description ?? '';
  document.getElementById('shop-confirm-btn').textContent = shop ? 'Save' : 'Create';
  showModal('shop-modal');
}

document.getElementById('shop-confirm-btn').addEventListener('click', () => {
  const name = document.getElementById('shop-name-input').value.trim();
  if (!name) { alert('Give the shop a name.'); return; }
  const description = document.getElementById('shop-desc-input').value.trim();

  if (shopModalId) {
    shopRef(shopModalId).update({ name, description });
  } else {
    const id = 'shop_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
    // Opened before the write, so the echo of our own write lands on a panel
    // that is already showing the new shop rather than bouncing back to the list.
    state.shopOpenId = id;
    shopRef(id).set({ id, name, description, revealed: false, audience: 'all', order: Date.now() });
  }
  hideModal('shop-modal');
});

function deleteShop(shop) {
  if (!confirm(`Delete “${shop.name}”? Its stock goes with it.`)) return;
  state.shopOpenId = null;
  shopRef(shop.id).remove();
  renderShopPanel();
}

function setShopAudience(shop, mode) {
  if (mode === 'hidden') shopRef(shop.id).update({ revealed: false });
  else shopRef(shop.id).update({ revealed: true, audience: mode === 'all' ? 'all' : 'select' });
}

function toggleShopPlayer(shop, playerId, name, on) {
  shopRef(shop.id).update({
    [`players/${playerId}`]:     on ? true : null,
    [`playerNames/${playerId}`]: on ? (name ?? '') : null,
  });
}

// ─── ADDING STOCK ──────────────────────────────────────────────────────────
let shopAddTargetId = null;
let shopAddSelection = new Set();
const SHOP_ADD_LIMIT = 200; // the catalogue can be thousands of rows; search narrows it

function openShopAddModal(shop) {
  shopAddTargetId = shop.id;
  shopAddSelection = new Set();
  document.getElementById('shop-add-search').value = '';
  renderShopAddList();
  showModal('shop-add-modal');
}

function renderShopAddList() {
  const list = document.getElementById('shop-add-list');
  const q = document.getElementById('shop-add-search').value.trim().toLowerCase();
  list.innerHTML = '';

  const all = Object.values(state.db)
    .filter(t => !q || t.name.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name));

  all.slice(0, SHOP_ADD_LIMIT).forEach(t => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'shop-add-row' + (shopAddSelection.has(t.id) ? ' selected' : '');

    const sw = document.createElement('span');
    sw.className = 'shop-item-swatch';
    sw.style.background = rarityColor(t.rarity);
    const nm = document.createElement('span');
    nm.className = 'shop-add-name';
    nm.textContent = t.name;
    const cost = document.createElement('span');
    cost.className = 'shop-add-cost';
    cost.textContent = hasCost(t.cost) ? formatCost(t.cost) : '—';

    row.appendChild(sw);
    row.appendChild(nm);
    row.appendChild(cost);
    row.addEventListener('click', () => {
      if (shopAddSelection.has(t.id)) shopAddSelection.delete(t.id);
      else shopAddSelection.add(t.id);
      row.classList.toggle('selected');
      updateShopAddButton();
    });
    list.appendChild(row);
  });

  if (all.length > SHOP_ADD_LIMIT) {
    const more = document.createElement('p');
    more.className = 'shop-empty';
    more.textContent = `…and ${all.length - SHOP_ADD_LIMIT} more — search to narrow it down.`;
    list.appendChild(more);
  }
  updateShopAddButton();
}

function updateShopAddButton() {
  const n = shopAddSelection.size;
  const btn = document.getElementById('shop-add-confirm-btn');
  btn.textContent = n ? `Add ${n} Item${n === 1 ? '' : 's'}` : 'Add';
  btn.disabled = n === 0;
}

document.getElementById('shop-add-search').addEventListener('input', renderShopAddList);

document.getElementById('shop-add-confirm-btn').addEventListener('click', () => {
  const shop = state.shops[shopAddTargetId];
  if (!shop) { hideModal('shop-add-modal'); return; }

  const updates = {};
  let order = shopStockEntries(shop).length;
  shopAddSelection.forEach(templateId => {
    const t = state.db[templateId];
    if (!t) return;
    const entryId = 'e_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
    updates[entryId] = {
      templateId,
      template: JSON.stringify(t), // undefined fields drop out on the way through
      qty: 1,
      order: order++,
    };
  });

  firebaseDb.ref(shopsPath(shop.id) + '/stock').update(updates);
  hideModal('shop-add-modal');
});

// ─── ONE STOCK ENTRY ───────────────────────────────────────────────────────
const PRICE_DENOMS = ['pp', 'gp', 'ep', 'sp', 'cp'];
let shopEntryTarget = null; // { shopId, entryId }

function openShopEntryModal(shop, entry) {
  shopEntryTarget = { shopId: shop.id, entryId: entry.entryId };
  const t = shopEntryTemplate(entry);
  document.getElementById('shop-entry-title').textContent = t?.name ?? 'Stock';

  const unlimited = entry.qty === SHOP_UNLIMITED;
  const qtyInput = document.getElementById('shop-entry-qty');
  document.getElementById('shop-entry-unlimited').checked = unlimited;
  qtyInput.value = unlimited ? 1 : (entry.qty ?? 0);
  qtyInput.disabled = unlimited;

  setShopPriceFields(shopEntryPrice(entry));
  showModal('shop-entry-modal');
}

function setShopPriceFields(cost) {
  const c = parseCostObj(cost);
  PRICE_DENOMS.forEach(d => { document.getElementById('shop-price-' + d).value = c[d]; });
}

function readShopPriceFields() {
  const out = {};
  PRICE_DENOMS.forEach(d => {
    out[d] = Math.max(0, parseInt(document.getElementById('shop-price-' + d).value, 10) || 0);
  });
  return out;
}

document.getElementById('shop-entry-unlimited').addEventListener('change', e => {
  document.getElementById('shop-entry-qty').disabled = e.target.checked;
});

document.getElementById('shop-entry-reset-price').addEventListener('click', () => {
  const entry = currentStockEntry(shopEntryTarget);
  if (entry) setShopPriceFields(shopEntryTemplate(entry)?.cost);
});

document.getElementById('shop-entry-save-btn').addEventListener('click', () => {
  if (!shopEntryTarget) return;
  const unlimited = document.getElementById('shop-entry-unlimited').checked;
  const qty = unlimited
    ? SHOP_UNLIMITED
    : Math.max(0, parseInt(document.getElementById('shop-entry-qty').value, 10) || 0);
  firebaseDb.ref(`${shopsPath(shopEntryTarget.shopId)}/stock/${shopEntryTarget.entryId}`)
    .update({ qty, price: readShopPriceFields() });
  hideModal('shop-entry-modal');
});

document.getElementById('shop-entry-remove-btn').addEventListener('click', () => {
  if (!shopEntryTarget) return;
  firebaseDb.ref(`${shopsPath(shopEntryTarget.shopId)}/stock/${shopEntryTarget.entryId}`).remove();
  hideModal('shop-entry-modal');
});

function currentStockEntry(target) {
  const shop = target && state.shops[target.shopId];
  const entry = shop && (shop.stock ?? {})[target.entryId];
  return entry ? { ...entry, entryId: target.entryId } : null;
}

// =============================================================================
// SHOP — PAYING
// =============================================================================
const COIN_VALUE = { cp: 1, sp: 10, ep: 50, gp: 100, pp: 1000 };
const COIN_ASC = ['cp', 'sp', 'ep', 'gp', 'pp'];
// Change comes back in the coins people actually use: electrum is a curiosity,
// and nobody wants five of them instead of two gold and a half.
const CHANGE_DENOMS = ['pp', 'gp', 'sp', 'cp'];

function costToCp(cost) {
  const c = parseCostObj(cost);
  return COIN_ASC.reduce((sum, d) => sum + (c[d] || 0) * COIN_VALUE[d], 0);
}

function cpToCoins(cp) {
  const out = { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 };
  let left = cp;
  CHANGE_DENOMS.forEach(d => { out[d] = Math.floor(left / COIN_VALUE[d]); left -= out[d] * COIN_VALUE[d]; });
  return out;
}

function purseTotalCp(counts) {
  return COIN_ASC.reduce((sum, d) => sum + counts[d] * COIN_VALUE[d], 0);
}

// What a purchase does to the purse: which coins go out, which come back. Small
// coins are spent first — that sheds the loose change and leaves the big coins
// whole — and when what is left to pay is smaller than any coin still in the
// purse, one of those is broken and the difference comes back as change.
function planPayment(priceCp) {
  const have = getCoinCounts();
  const total = purseTotalCp(have);
  if (total < priceCp) return { error: 'short', short: priceCp - total };

  const spend = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
  let left = priceCp;
  for (const d of COIN_ASC) {
    const n = Math.min(have[d], Math.floor(left / COIN_VALUE[d]));
    spend[d] = n;
    left -= n * COIN_VALUE[d];
  }

  let change = { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 };
  if (left > 0) {
    const toBreak = COIN_ASC.find(d => have[d] - spend[d] > 0 && COIN_VALUE[d] > left);
    if (!toBreak) return { error: 'short', short: left }; // unreachable while total >= price
    spend[toBreak] += 1;
    change = cpToCoins(COIN_VALUE[toBreak] - left);
  }

  // Change is only change if there is a coin to hand it back in. Rather than
  // quietly swallow the difference, refuse and say which coin is missing.
  const templates = getCoinTemplates();
  const missing = CHANGE_DENOMS.find(d => change[d] > 0 && !templates[d]);
  if (missing) return { error: 'nochange', denom: missing };

  return { spend, change, after: purseAfter(have, spend, change) };
}

function purseAfter(have, spend, change) {
  const out = {};
  COIN_ASC.forEach(d => { out[d] = have[d] - spend[d] + (change[d] ?? 0); });
  return out;
}

function applyPayment(plan) {
  const templates = getCoinTemplates();
  COIN_ASC.forEach(d => {
    if (plan.spend[d] > 0 && templates[d]) removeCoinsFromInventory(templates[d], plan.spend[d]);
  });
  CHANGE_DENOMS.forEach(d => {
    if (plan.change[d] > 0 && templates[d]) addCoinsToInventory(templates[d], plan.change[d]);
  });
}

// The shop carries its own copy of the item, so a buyer can end up holding
// something that was never in their catalogue. Match an existing entry where
// there is one — a second longsword must not fork the catalogue — and register
// the snapshot as a custom item otherwise.
function resolveShopTemplate(entry) {
  const snap = shopEntryTemplate(entry);
  if (!snap) return null;
  const sameId = state.db[entry.templateId];
  if (sameId && sameId.name === snap.name) return sameId.id;
  const byName = Object.values(state.db).find(t => t.name === snap.name);
  if (byName) return byName.id;
  const id = newTemplateId();
  state.db[id] = { ...snap, id };
  renderItemList();
  return id;
}

function grantPurchase(entry, count) {
  const templateId = resolveShopTemplate(entry);
  if (!templateId) return;
  const t = state.db[templateId];
  if (isStackable(t)) {
    addStackableUnits(templateId, count);
  } else {
    for (let i = 0; i < count; i++) {
      const id = newId();
      state.instances[id] = { id, templateId, rotation: 0, row: null, col: null, stackCount: 1, containerId: null };
    }
  }
  renderAllItems();
  updateWeightDisplay();
  debouncedSync();
}

// =============================================================================
// SHOP — BUYING
// =============================================================================
let shopBuyTarget = null; // { shopId, entryId }

function openBuyModal(shop, entry) {
  if (!canBuyFromShop()) return;
  shopBuyTarget = { shopId: shop.id, entryId: entry.entryId };

  const t = shopEntryTemplate(entry);
  const price = shopEntryPrice(entry);
  document.getElementById('shop-buy-title').textContent = t?.name ?? 'Buy';
  document.getElementById('shop-buy-sub').textContent =
    `${shop.name} · ${hasCost(price) ? formatCost(price) : 'Free'} each · ${stockLabel(entry)}`;

  const max = entry.qty === SHOP_UNLIMITED ? 99 : Math.max(1, entry.qty ?? 1);
  const qtyInput = document.getElementById('shop-buy-qty');
  document.getElementById('shop-buy-qty-field').classList.toggle('hidden', max <= 1);
  qtyInput.min = 1;
  qtyInput.max = max;
  qtyInput.value = 1;

  document.getElementById('shop-buy-confirm-btn').textContent = 'Buy';
  updateBuySummary();
  showModal('shop-buy-modal');
}

function buyQuantity() {
  const input = document.getElementById('shop-buy-qty');
  const max = parseInt(input.max, 10) || 1;
  return Math.min(max, Math.max(1, parseInt(input.value, 10) || 1));
}

document.getElementById('shop-buy-qty').addEventListener('input', updateBuySummary);

function updateBuySummary() {
  const box = document.getElementById('shop-buy-summary');
  const btn = document.getElementById('shop-buy-confirm-btn');
  box.innerHTML = '';
  document.getElementById('shop-buy-error').classList.add('hidden');

  const entry = currentStockEntry(shopBuyTarget);
  if (!entry) { btn.disabled = true; return; }

  const count = buyQuantity();
  const priceCp = costToCp(shopEntryPrice(entry)) * count;
  const plan = planPayment(priceCp);

  box.appendChild(buildCoinLine('Total', cpToCoins(priceCp)));
  box.appendChild(buildCoinLine('Purse', getCoinCounts(), true));
  if (!plan.error) {
    box.appendChild(buildCoinLine('After', plan.after, true));
    if (Object.values(plan.change).some(Boolean)) box.appendChild(buildCoinLine('Change', plan.change, true));
  }

  btn.disabled = !!plan.error || isSoldOut(entry);
  if (plan.error) showBuyError(plan);
  else if (isSoldOut(entry)) showBuyError({ error: 'gone' });
}

function buildCoinLine(label, coins, dim) {
  const row = document.createElement('div');
  row.className = 'shop-coin-line' + (dim ? ' dim' : '');
  const l = document.createElement('span');
  l.className = 'shop-coin-label';
  l.textContent = label;
  row.appendChild(l);

  const vals = document.createElement('span');
  vals.className = 'shop-coin-vals';
  const shown = PRICE_DENOMS.filter(d => coins[d]);
  if (!shown.length) {
    const zero = document.createElement('span');
    zero.textContent = '—';
    vals.appendChild(zero);
  }
  shown.forEach(d => {
    const s = document.createElement('span');
    s.className = 'shop-coin';
    s.style.color = coinColor(d);
    s.textContent = `${coins[d]} ${d}`;
    vals.appendChild(s);
  });
  row.appendChild(vals);
  return row;
}

function showBuyError(plan) {
  const err = document.getElementById('shop-buy-error');
  err.classList.remove('hidden');
  if (plan.error === 'short') {
    err.textContent = `Not enough coin — you are ${formatCost(cpToCoins(plan.short))} short.`;
  } else if (plan.error === 'nochange') {
    err.textContent = `Your purse cannot make exact change for this, and the item list has no ` +
                      `${plan.denom.toUpperCase()} coin to give it in.`;
  } else if (plan.error === 'gone') {
    err.textContent = 'Someone else got there first — this one is sold.';
  } else {
    err.textContent = 'The purchase could not be recorded: ' + (plan.message ?? 'unknown error');
  }
}

document.getElementById('shop-buy-confirm-btn').addEventListener('click', confirmPurchase);

async function confirmPurchase() {
  const entry = currentStockEntry(shopBuyTarget);
  if (!entry || !canBuyFromShop()) { hideModal('shop-buy-modal'); return; }

  const count = buyQuantity();
  const plan = planPayment(costToCp(shopEntryPrice(entry)) * count);
  if (plan.error) { showBuyError(plan); return; }

  const btn = document.getElementById('shop-buy-confirm-btn');
  btn.disabled = true;
  btn.textContent = 'Buying…';

  // The stock is one shared pile, so the claim is staked in the database first
  // and atomically: when two players hit Buy on the last sword together, the one
  // who loses the transaction is told, and nothing has left their purse.
  let committed = false;
  try {
    const res = await firebaseDb
      .ref(`${shopsPath(shopBuyTarget.shopId)}/stock/${shopBuyTarget.entryId}`)
      .transaction(cur => {
        if (!cur) return;                            // pulled from the shelf meanwhile
        if (cur.qty === SHOP_UNLIMITED) return cur;
        if ((cur.qty ?? 0) < count) return;          // someone got there first
        cur.qty -= count;
        return cur;
      });
    committed = res.committed;
  } catch (e) {
    btn.disabled = false;
    btn.textContent = 'Buy';
    showBuyError({ error: 'network', message: e.message });
    return;
  }

  btn.disabled = false;
  btn.textContent = 'Buy';
  if (!committed) { showBuyError({ error: 'gone' }); updateBuySummary(); return; }

  // The purse could have moved under us while the claim was in flight — a cloud
  // save landing from another device. Re-plan against what is actually there,
  // and fall back to the original only if the fresh one cannot be paid: the
  // stock is already claimed, so the buyer must not be left holding nothing.
  const fresh = planPayment(costToCp(shopEntryPrice(entry)) * count);
  applyPayment(fresh.error ? plan : fresh);
  grantPurchase(entry, count);
  hideModal('shop-buy-modal');
}
