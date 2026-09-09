// =============================================================================
// BATTLEMAP INITIATIVE — the turn order: the model, the panel, the group roll
// =============================================================================
'use strict';

// Initiative belongs to the map: it lives at
// `parties/<code>/battlemap/maps/<mapId>/initiative` with the walls and
// creatures, rides `subscribeToBattlemap`, and is thrown away with the map.
//
//   initiative
//     round   1, 2, 3 …
//     turn    <entryId>   whose turn it is, named rather than numbered
//     entries { <id>: { id, kind, name, score, at, uid?, tokens?, icon?, hostility? } }
//
// The turn is an entry id, never an index — the order is not a fixed list (late
// rollers drop in mid-fight; the GM removes groups). `initiativeActiveEntry()`
// heals a dangling turn by falling back to the top. See CLAUDE.md § Initiative.

const INITIATIVE_PC_PREFIX = 'pc_';

function mapInitiative(map) {
  const i = map?.initiative ?? {};
  return { round: i.round ?? 1, turn: i.turn ?? null, entries: i.entries ?? {} };
}

function initiativeEntries(map) {
  return Object.values(mapInitiative(map).entries).filter(e => e && e.id);
}

// Score, then the moment of the roll (arbitrary but STABLE — every client sorts
// the same list the same way), then the id.
function initiativeOrder(map) {
  return initiativeEntries(map).sort((a, b) =>
    (b.score ?? 0) - (a.score ?? 0)
    || (a.at ?? 0) - (b.at ?? 0)
    || String(a.id).localeCompare(String(b.id)));
}

function initiativeRunning(map) {
  return initiativeEntries(map).length > 0;
}

// Whose turn it is. Not simply `entries[turn]` — the entry named may have left
// the fight, and a tracker highlighting nobody looks broken. The top of the
// order is the honest fallback.
function initiativeActiveEntry(map) {
  const order = initiativeOrder(map);
  if (!order.length) return null;
  const turn = mapInitiative(map).turn;
  return order.find(e => e.id === turn) || order[0];
}

// Which creatures on the board an entry speaks for. A group says so outright.
// A player's entry names an account, and the board records which creatures
// belong to whom (`ownerUid`) — so a player who moves/deletes/re-adds a token is
// still the same person. The `hostility === 'party'` half is why a GM who also
// plays a character does not find their entry speaking for the whole ambush.
function initiativeEntryClaims(entry, token) {
  if (!entry || !token) return false;
  if (entry.tokens) return !!entry.tokens[token.id];
  return !!entry.uid && entry.uid === token.ownerUid && token.hostility === 'party';
}

function initiativeTokensOf(map, entry) {
  if (!entry) return [];
  return mapTokens(map).filter(t => initiativeEntryClaims(entry, t));
}

function initiativeEntryOfToken(map, tokenId) {
  const token = (map?.tokens ?? {})[tokenId];
  if (!token) return null;
  return initiativeOrder(map).find(e => initiativeEntryClaims(e, token)) || null;
}

// =============================================================================
// WRITING
// =============================================================================
function initiativeRef(mapId, rest) {
  return mapRef(mapId, 'initiative' + (rest ? '/' + rest : ''));
}

// One write, not two — a new entry and the round it starts go up together, or
// the first roll of a fight lands as an order with nobody's turn in it.
function addInitiativeEntry(mapId, entry) {
  if (!firebaseDb || !state.party.active) return;
  const map = mapById(mapId);
  if (!map) return;
  const patch = { ['entries/' + entry.id]: entry };
  if (!initiativeRunning(map)) { patch.round = 1; patch.turn = entry.id; }
  initiativeRef(mapId).update(patch);
}

function removeInitiativeEntry(mapId, entryId) {
  if (!firebaseDb) return;
  const map = mapById(mapId);
  const entry = map ? mapInitiative(map).entries[entryId] : null;
  // The GM runs the fight; a player may still take themselves out of it.
  if (!canEditMap() && !(entry && entry.uid && entry.uid === ownPlayerId())) return;
  initiativeRef(mapId, 'entries/' + entryId).remove();
}

function clearInitiative(mapId) {
  if (!canEditMap() || !firebaseDb) return;
  if (!confirm('End the fight and clear the initiative order?')) return;
  initiativeRef(mapId).remove();
}

// Wrapping past the end is the next round — the only place `round` ever
// changes. Shared by the GM's step buttons and Pass Turn; the two differ only
// in who is allowed to call it.
function advanceInitiativeTurn(map, dir) {
  const order = initiativeOrder(map);
  if (!order.length) return;
  const init = mapInitiative(map);
  const active = initiativeActiveEntry(map);
  const at = order.findIndex(e => e.id === active.id);
  const next = at + dir;
  const wrapped = (next + order.length) % order.length;
  let round = init.round ?? 1;
  if (next >= order.length) round += 1;
  if (next < 0) round = Math.max(1, round - 1);
  // A fresh turn is a full tank of movement — see the MOVEMENT section below.
  initiativeRef(map.id).update({
    turn: order[wrapped].id,
    round,
    ['entries/' + order[wrapped].id + '/moveUsed']: 0,
  });
}

// Stepping either way, to any entry, is the GM's — running the fight.
function stepInitiative(mapId, dir) {
  if (!canEditMap() || !firebaseDb) return;
  const map = mapById(mapId);
  if (!map) return;
  advanceInitiativeTurn(map, dir);
}

// Whoever the active turn belongs to may end it and hand it to the next entry —
// not gated by canEditMap() the way stepInitiative is, since passing your own
// turn is not running the fight, only leaving it. See CLAUDE.md § Initiative for
// why a GM's monster group has no uid to match: the GM speaks for it instead.
function myInitiativeTurn(map) {
  if (!map || !initiativeRunning(map)) return false;
  const active = initiativeActiveEntry(map);
  if (!active) return false;
  if (canEditMap()) return active.kind !== 'pc';
  return active.kind === 'pc' && !!active.uid && active.uid === ownPlayerId();
}

function passInitiativeTurn(mapId) {
  if (!firebaseDb) return;
  const map = mapById(mapId);
  if (!map || !myInitiativeTurn(map)) return;
  advanceInitiativeTurn(map, 1);
}

// The sitewide glow (see initiative.css). Driven off the same question as Pass
// Turn's visibility, but against the party's actual map (mapForViewer()) rather
// than whichever one a GM happens to have open — a player who has wandered off
// to their sheet must still be told it is their move.
function syncMyTurnBorder() {
  document.body.classList.toggle('my-turn', myInitiativeTurn(mapForViewer()));
}

// =============================================================================
// A ROLL THAT JOINS THE ORDER
// =============================================================================
// Called from `performRoll()` for every roll, interested in exactly one. The
// sheet's Initiative row is an ordinary roll; joining the order is the extra
// thing it does when the party is on a map. Only your own first roll counts:
//   - your own, because a GM reading a player's sheet rolls as the GM
//     (`liveStateIsOwnCharacter()`, the same guard the save file uses)
//   - first, because rolling twice must not let anyone pick the better number
function noteRollForInitiative(roll) {
  if (!roll || roll.kind !== 'initiative') return;
  if (!state.party.active || typeof isSignedIn !== 'function' || !isSignedIn()) return;
  if (typeof liveStateIsOwnCharacter === 'function' && !liveStateIsOwnCharacter()) return;

  const map = mapForViewer();
  if (!map) return;
  const uid = ownPlayerId();
  if (!uid) return;

  const id = INITIATIVE_PC_PREFIX + uid;
  if (mapInitiative(map).entries[id]) return;

  addInitiativeEntry(map.id, {
    id, kind: 'pc', uid,
    name: (state.character && state.character.name) || 'Adventurer',
    score: roll.total,
    at: Date.now(),
    hostility: 'party',
  });
}

// =============================================================================
// THE GM'S GROUP ROLL
// =============================================================================
// Any number of creatures ticked, one d20 for the lot, one shared place in the
// order. The modifier is typed here — this app has no monster stats. Goes
// through `performRoll()` like every other roll.
let initiativeModalMapId = null;
let initiativeModalPicked = new Set();

function initiativeCandidates(map) {
  // Creatures not already in the order — a creature has one place in the turn order.
  return mapTokens(map).filter(t => !initiativeEntryOfToken(map, t.id));
}

function openInitiativeModal(mapId) {
  const map = mapById(mapId);
  if (!map || !canEditMap()) return;
  initiativeModalMapId = mapId;
  initiativeModalPicked = new Set();

  // Whatever the GM already had selected on the board; failing that, the hostile
  // creatures (the ones a GM reaches for this dialog to roll).
  const candidates = initiativeCandidates(map);
  const selected = candidates.find(t => t.id === mapSelectedTokenId);
  if (selected) initiativeModalPicked.add(selected.id);
  else candidates.filter(t => t.hostility === 'hostile').forEach(t => initiativeModalPicked.add(t.id));

  document.getElementById('init-group-mod').value = '0';
  renderInitiativeModal();
  showModal('initiative-modal');
}

function renderInitiativeModal() {
  const map = mapById(initiativeModalMapId);
  const list = document.getElementById('init-creature-list');
  const nameInput = document.getElementById('init-group-name');
  const rollBtn = document.getElementById('init-roll-btn');
  list.innerHTML = '';
  if (!map) return;

  const candidates = initiativeCandidates(map);
  if (!candidates.length) {
    const note = document.createElement('p');
    note.className = 'modal-note';
    note.textContent = 'Every creature on this map already has a place in the order.';
    list.appendChild(note);
  }

  candidates.forEach(t => {
    const row = document.createElement('label');
    row.className = 'init-pick';
    row.style.setProperty('--hc', hostilityColor(t.hostility));

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = initiativeModalPicked.has(t.id);
    cb.addEventListener('change', () => {
      if (cb.checked) initiativeModalPicked.add(t.id); else initiativeModalPicked.delete(t.id);
      syncInitiativeModalName();
    });

    const dot = document.createElement('span');
    dot.className = 'init-pick-dot';
    const icon = document.createElement('span');
    icon.className = 'init-pick-icon';
    icon.textContent = t.icon || '';
    const name = document.createElement('span');
    name.className = 'init-pick-name';
    name.textContent = t.name || 'Creature';

    row.appendChild(cb);
    row.appendChild(dot);
    if (t.icon) row.appendChild(icon);
    row.appendChild(name);
    list.appendChild(row);
  });

  // The name is a suggestion, rewritten only while the GM has not typed one.
  nameInput.dataset.touched = '';
  nameInput.value = '';
  nameInput.placeholder = suggestedGroupName(map);
  rollBtn.disabled = !initiativeModalPicked.size;
}

function syncInitiativeModalName() {
  const map = mapById(initiativeModalMapId);
  const nameInput = document.getElementById('init-group-name');
  if (map && !nameInput.dataset.touched) nameInput.placeholder = suggestedGroupName(map);
  document.getElementById('init-roll-btn').disabled = !initiativeModalPicked.size;
}

// Creatures that share a name are that name; a mixed handful gets the plainest
// true word. The count is NOT in the name — the row draws it as a badge.
function suggestedGroupName(map) {
  const picked = mapTokens(map).filter(t => initiativeModalPicked.has(t.id));
  if (!picked.length) return 'Enemies';
  const names = [...new Set(picked.map(t => (t.name || '').trim()).filter(Boolean))];
  if (names.length === 1) return names[0];
  return picked.every(t => t.hostility === 'hostile') ? 'Enemies' : 'Creatures';
}

function confirmInitiativeRoll() {
  const map = mapById(initiativeModalMapId);
  if (!map || !canEditMap() || !initiativeModalPicked.size) return;

  const nameInput = document.getElementById('init-group-name');
  const name = (nameInput.value || '').trim() || suggestedGroupName(map);
  const mod = Math.max(-30, Math.min(30, parseInt(document.getElementById('init-group-mod').value, 10) || 0));
  const picked = mapTokens(map).filter(t => initiativeModalPicked.has(t.id));

  const roll = performRoll({
    label: 'Initiative · ' + name,
    faces: 20, count: 1, mod,
    kind: 'initiative-group',
    parts: mod ? [{ label: 'Modifier', value: mod }] : [],
  });

  const tokens = {};
  picked.forEach(t => { tokens[t.id] = true; });
  addInitiativeEntry(map.id, {
    id: newPieceId('init'),
    kind: 'group',
    name,
    score: roll.total,
    at: Date.now(),
    tokens,
    icon: picked[0].icon || '',
    // A mixed group takes the loudest hostility in it.
    hostility: picked.some(t => t.hostility === 'hostile') ? 'hostile'
      : picked.some(t => t.hostility === 'neutral') ? 'neutral' : 'party',
  });

  hideModal('initiative-modal');
}

// =============================================================================
// THE PANEL
// =============================================================================
// Top left of the board. Collapsed it says only whose turn it is; expanded it is
// the whole order. Both are the same list (collapsing hides inactive rows in
// CSS). Collapsed-ness is session only.
let initiativeCollapsed = false;

// What the reader is pointing at, as an ENTRY id — the panel and board are two
// views of one list, so hovering either lights the other. One piece of state,
// so they cannot disagree.
let initiativeHoverId = null;

function renderInitiativePanel() {
  const panel = document.getElementById('map-initiative');
  if (!panel) return;
  // The panel is part of the board — before there is an order it is how one is
  // started (the GM's + and the player's Roll Initiative both live in it).
  const map = typeof mapViewIsShowing === 'function' && mapViewIsShowing() ? viewedMap() : null;
  panel.classList.toggle('hidden', !map);
  document.getElementById('init-pass-btn').classList.toggle('hidden', !map || !myInitiativeTurn(map));
  if (!map) return;

  const running = initiativeRunning(map);
  const active = initiativeActiveEntry(map);
  panel.classList.toggle('collapsed', initiativeCollapsed && running);
  panel.classList.toggle('empty', !running);

  document.getElementById('init-round').textContent = running ? 'Round ' + (mapInitiative(map).round ?? 1) : 'No fight yet';
  const toggle = document.getElementById('init-toggle');
  toggle.textContent = initiativeCollapsed ? '▸' : '▾';
  toggle.title = initiativeCollapsed ? 'Show the whole order' : 'Show only whose turn it is';
  toggle.setAttribute('aria-expanded', String(!initiativeCollapsed));
  toggle.classList.toggle('hidden', !running);

  renderInitiativeActions(map, running);
  renderInitiativeOwnRoll(map);
  renderInitiativeRows(map, active);
}

// The player's own roll, on the board — the same roll the sheet makes (same
// `data-roll`, same dice.js listeners). Offered exactly when pressing it would
// do something: not to a GM, not while reading someone else's sheet, not once
// you are in the order.
function renderInitiativeOwnRoll(map) {
  const footer = document.getElementById('init-footer');
  const uid = ownPlayerId();
  const own = typeof liveStateIsOwnCharacter !== 'function' || liveStateIsOwnCharacter();
  const rolled = !!uid && !!mapInitiative(map).entries[INITIATIVE_PC_PREFIX + uid];
  footer.classList.toggle('hidden', canEditMap() || !uid || !own || rolled);
}

function renderInitiativeActions(map, running) {
  const acts = document.getElementById('init-actions');
  acts.innerHTML = '';
  if (!canEditMap()) return;

  const btn = (label, title, fn, cls) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'init-btn' + (cls ? ' ' + cls : '');
    b.textContent = label;
    b.title = title;
    b.addEventListener('click', fn);
    acts.appendChild(b);
    return b;
  };

  if (running) {
    btn('‹', 'Back a turn', () => stepInitiative(map.id, -1));
    btn('›', 'Next turn', () => stepInitiative(map.id, 1));
  }
  btn('+', 'Roll for creatures on the board', () => openInitiativeModal(map.id));
  if (running) btn('✕', 'End the fight and clear the order', () => clearInitiative(map.id), 'danger');
}

function renderInitiativeRows(map, active) {
  const list = document.getElementById('init-list');
  list.innerHTML = '';
  const order = initiativeOrder(map);

  if (!order.length) {
    const empty = document.createElement('li');
    empty.className = 'init-empty';
    empty.textContent = canEditMap()
      ? 'Nobody has rolled. Players roll for themselves; + rolls for the board.'
      : 'Nobody has rolled yet.';
    list.appendChild(empty);
    return;
  }

  order.forEach(entry => {
    const row = document.createElement('li');
    row.className = 'init-row';
    row.dataset.entry = entry.id;
    if (active && entry.id === active.id) row.classList.add('active');
    if (entry.id === initiativeHoverId) row.classList.add('hover');
    row.style.setProperty('--hc', hostilityColor(entry.hostility || 'party'));

    // The creature's own glyph, read off the live token — a player never told us
    // what their token looks like, they placed it. The stored icon is the
    // fallback for a group whose creatures have left the map, the shield for a
    // player with no token down.
    const tokens = initiativeTokensOf(map, entry);
    const icon = document.createElement('span');
    icon.className = 'init-icon';
    icon.textContent = (tokens[0] && tokens[0].icon) || entry.icon || (entry.kind === 'pc' ? '🛡️' : '•');

    const name = document.createElement('span');
    name.className = 'init-name';
    name.textContent = entry.name || 'Someone';

    const count = tokens.length;
    if (entry.kind === 'group' && count > 1) {
      const n = document.createElement('span');
      n.className = 'init-count';
      n.textContent = '×' + count;
      name.appendChild(n);
    }

    const score = document.createElement('span');
    score.className = 'init-score';
    score.textContent = entry.score ?? '—';

    row.appendChild(icon);
    row.appendChild(name);
    row.appendChild(score);

    // Only the GM, or the owner of an entry, can take it out.
    if (canEditMap() || (entry.uid && entry.uid === ownPlayerId())) {
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'init-remove';
      rm.textContent = '✕';
      rm.title = 'Take out of the order';
      rm.addEventListener('click', e => { e.stopPropagation(); removeInitiativeEntry(map.id, entry.id); });
      row.appendChild(rm);
    }

    row.addEventListener('pointerenter', () => setInitiativeHover(entry.id));
    row.addEventListener('pointerleave', () => setInitiativeHover(null));
    list.appendChild(row);
  });
}

// =============================================================================
// HOVER, BOTH WAYS
// =============================================================================
// One piece of state serves both directions: the panel writes it on hover, the
// map writes it from whatever creature is under the cursor. Each redraws the
// other side.
function setInitiativeHover(entryId) {
  if (initiativeHoverId === entryId) return;
  initiativeHoverId = entryId;
  syncInitiativeHoverRows();
  drawBattlemap();
}

// Re-marked in place, not rebuilt — this fires on every pointermove across the
// board, and throwing rows away would take the cursor off the button it was over.
function syncInitiativeHoverRows() {
  document.querySelectorAll('#init-list .init-row').forEach(row => {
    row.classList.toggle('hover', row.dataset.entry === initiativeHoverId);
  });
}

// The board's half: the creature under the cursor, named as its entry. A
// creature not in the fight has no entry — clear the highlight.
function noteMapTokenHover(map, tokenId) {
  if (!map || !initiativeRunning(map)) { setInitiativeHover(null); return; }
  const entry = tokenId ? initiativeEntryOfToken(map, tokenId) : null;
  setInitiativeHover(entry ? entry.id : null);
}

// What the board draws on each creature, worked out once per frame. Hover beats
// the turn marker on the same creature.
function initiativeMarks(map) {
  const marks = new Map();
  if (!map || !initiativeRunning(map)) return marks;
  const active = initiativeActiveEntry(map);
  if (active) initiativeTokensOf(map, active).forEach(t => marks.set(t.id, 'active'));
  const hovered = initiativeHoverId ? mapInitiative(map).entries[initiativeHoverId] : null;
  if (hovered) initiativeTokensOf(map, hovered).forEach(t => marks.set(t.id, 'hover'));
  return marks;
}

// =============================================================================
// MOVEMENT — a party token's remaining speed for the turn it is tracked against
// =============================================================================
// Only a player's own marker has a speed to spend: this app keeps no monster
// stat blocks (see CLAUDE.md § Initiative), so a GM's creatures sit outside
// this entirely. The budget lives on the token's own initiative entry
// (`moveUsed`, in feet) — the same entry that already speaks for the token in
// the turn order (initiativeEntryOfToken), so "whose turn resets this" and
// "whose budget this is" can never disagree. Reset happens in
// advanceInitiativeTurn(), above. With no entry yet (not rolled into the order)
// there is nothing to spend against, so movement runs free until there is.

function tokenSpeed(token) {
  if (!token || token.hostility !== 'party' || !token.ownerUid) return null;
  const c = characterForUid(token.ownerUid);
  if (!c) return null;
  return Number.isFinite(c.speed) ? c.speed : 30;
}

function tokenMoveEntry(map, token) {
  return tokenSpeed(token) === null ? null : initiativeEntryOfToken(map, token.id);
}

// null means "not tracked" (no speed, or not in the order) — battlemap-view.js
// reads that as leave it alone, rather than a budget of zero.
function tokenMoveRemaining(map, token) {
  const entry = tokenMoveEntry(map, token);
  if (!entry) return null;
  return Math.max(0, tokenSpeed(token) - (entry.moveUsed || 0));
}

// Called once a drag settles (onMapPointerUp in battlemap-view.js) — added to
// whatever the entry had already spent this turn.
function spendTokenMovement(map, token, feet) {
  const entry = tokenMoveEntry(map, token);
  if (!entry || !(feet > 0) || !firebaseDb) return;
  initiativeRef(map.id, 'entries/' + entry.id + '/moveUsed').set((entry.moveUsed || 0) + feet);
}

// =============================================================================
// WIRING
// =============================================================================
document.getElementById('init-toggle').addEventListener('click', () => {
  initiativeCollapsed = !initiativeCollapsed;
  renderInitiativePanel();
});

document.getElementById('init-roll-btn').addEventListener('click', confirmInitiativeRoll);

document.getElementById('init-pass-btn').addEventListener('click', () => {
  const map = viewedMap();
  if (map) passInitiativeTurn(map.id);
});

// The board's Roll Initiative, wired the way the sheet's roll targets are:
// dice.js owns the gesture, this only says which roll it is.
const initOwnRollEl = document.getElementById('init-roll-own');
initOwnRollEl.addEventListener('pointerdown', e => beginRollGesture(e, initOwnRollEl, () => sheetRollSpec('initiative')));
initOwnRollEl.addEventListener('click', () => rollFromClick(() => sheetRollSpec('initiative')));
document.getElementById('init-group-name').addEventListener('input', e => {
  e.target.dataset.touched = e.target.value ? '1' : '';
});
