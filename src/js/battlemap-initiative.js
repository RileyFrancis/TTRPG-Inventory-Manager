// =============================================================================
// BATTLEMAP INITIATIVE — the turn order: the model, the panel, the group roll
// =============================================================================
'use strict';

// **Initiative belongs to the map**, not to the party and not to a character.
// A fight happens somewhere, it ends when the party walks out of that room, and
// the next map is the next fight — so the order lives at
// `parties/<code>/battlemap/maps/<mapId>/initiative` with the walls and the
// creatures. Three things fall out of that and none of them had to be built:
//
//   - "Have they rolled already?" is answered by *this map's* entries, which is
//     exactly the question asked. A player who rolled in the cellar rolls again
//     in the courtyard because that is a different map.
//   - It rides the subscription that already carries the roster, the shops and
//     the board (`subscribeToBattlemap`), so every member sees the same order
//     with no second listener and no new database rule.
//   - It is thrown away with the map it belonged to.
//
// ```
// initiative
//   round   1, 2, 3 …
//   turn    <entryId> — whose turn it is, named rather than numbered
//   entries { <id>: { id, kind, name, score, at, uid?, tokens?, icon?, hostility? } }
// ```
//
// **The turn is an entry id, never an index into the order.** The order is not
// a fixed list: a player who was late to roll drops in halfway down it mid-fight,
// and the GM can take a group out of it. An index would silently come to mean a
// different creature; a name goes on meaning the same one, or stops meaning
// anything at all — and `initiativeActiveEntry()` heals that case by falling
// back to the top of the order rather than leaving the panel pointing at a
// creature that is no longer in the fight.

const INITIATIVE_PC_PREFIX = 'pc_';

function mapInitiative(map) {
  const i = map?.initiative ?? {};
  return { round: i.round ?? 1, turn: i.turn ?? null, entries: i.entries ?? {} };
}

function initiativeEntries(map) {
  return Object.values(mapInitiative(map).entries).filter(e => e && e.id);
}

// **The order, and the whole of the tie-break.** Score first, because that is
// the rule. Then the moment the roll was made — the earlier roll goes first,
// which is arbitrary but *stable*, and stable is the only property that matters
// here: every client sorts the same list into the same order without asking
// anyone. The id is the last resort, for two rolls stamped in the same
// millisecond.
function initiativeOrder(map) {
  return initiativeEntries(map).sort((a, b) =>
    (b.score ?? 0) - (a.score ?? 0)
    || (a.at ?? 0) - (b.at ?? 0)
    || String(a.id).localeCompare(String(b.id)));
}

function initiativeRunning(map) {
  return initiativeEntries(map).length > 0;
}

// Whose turn it is. Not simply `entries[turn]`: the entry named may have been
// taken out of the fight, and a tracker highlighting nobody is a tracker that
// looks broken. The top of the order is the honest answer to "we are in a
// fight and nothing says whose turn it is".
function initiativeActiveEntry(map) {
  const order = initiativeOrder(map);
  if (!order.length) return null;
  const turn = mapInitiative(map).turn;
  return order.find(e => e.id === turn) || order[0];
}

// **Which creatures on the board an entry speaks for.** A group says so
// outright — it was made by ticking them. A player's entry names an account
// instead, and the board already records which creatures belong to whom
// (`ownerUid`), so their character is found rather than stored: a player who
// moves their token, deletes it, or drops a second one in is still the same
// person in the order, and nothing has to be kept in step.
//
// **An account's creatures are not all its character**, which is the whole of
// why `hostility` is in this test. A GM stamps their own uid on every monster
// they drop — that is what `ownerUid` is for, so they can pick them back up —
// and without the second half of this rule a GM who also plays a character
// would find their entry speaking for the entire ambush: every goblin
// unavailable to roll because it was "already in the order", and hovering one
// lighting the GM's own name.
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

// **One write, not two.** RTDB takes a path as an update key, so a new entry
// and the round it starts go up together — otherwise the first roll of a fight
// would land as an order with nobody's turn in it, and every other client would
// draw that half-state before the second write arrived.
function addInitiativeEntry(mapId, entry) {
  if (!firebaseDb || !state.party.active) return;
  const map = mapById(mapId);
  if (!map) return;
  const patch = { ['entries/' + entry.id]: entry };
  // The first roll of a fight is also the start of it.
  if (!initiativeRunning(map)) { patch.round = 1; patch.turn = entry.id; }
  initiativeRef(mapId).update(patch);
}

function removeInitiativeEntry(mapId, entryId) {
  if (!firebaseDb) return;
  const map = mapById(mapId);
  const entry = map ? mapInitiative(map).entries[entryId] : null;
  // The GM runs the fight; a player may still take themselves out of it, which
  // is the same rule creatures follow — yours is yours, the rest is the GM's.
  if (!canEditMap() && !(entry && entry.uid && entry.uid === ownPlayerId())) return;
  initiativeRef(mapId, 'entries/' + entryId).remove();
}

function clearInitiative(mapId) {
  if (!canEditMap() || !firebaseDb) return;
  if (!confirm('End the fight and clear the initiative order?')) return;
  initiativeRef(mapId).remove();
}

// **Stepping is the GM's**, like the terrain and the fog: a turn order everyone
// can advance is one nobody is keeping. Wrapping past the end is the next
// round, which is the only place `round` ever changes — so it counts rounds
// rather than being typed at.
function stepInitiative(mapId, dir) {
  if (!canEditMap() || !firebaseDb) return;
  const map = mapById(mapId);
  if (!map) return;
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
  initiativeRef(mapId).update({ turn: order[wrapped].id, round });
}

// =============================================================================
// A ROLL THAT JOINS THE ORDER
// =============================================================================
// Called from `performRoll()` for every roll the app makes, and interested in
// exactly one of them. The sheet's Initiative row is an ordinary roll — it
// flies to the corner and it is said in the chat log like any other — and this
// is the *extra* thing it does when the party is standing on a map.
//
// **Only your own first roll counts.**
//   - *Your own*: a GM reading a player's sheet rolls as the GM (rolls are
//     attributed to the account, which is the rule everywhere in dice.js), so
//     an entry made from that would be keyed to the wrong person.
//     `liveStateIsOwnCharacter()` is the same guard the save file uses.
//   - *First*: rolling twice does not let you pick the better number. The roll
//     still happens and is still said out loud — it simply does not move you in
//     the order. The GM can take an entry out if a roll needs doing again.
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
// A GM does not roll six goblins one at a time, and a table does not want six
// goblin lines in the order. So any number of creatures are ticked, **one d20 is
// rolled for the lot of them**, and they take one place in the order between
// them — which is how a table plays it anyway.
//
// The modifier is typed here rather than read off anything, because this app
// has no monster statistics to read it from. It is the group's whole DEX
// modifier, and it goes through `performRoll()` like every other roll so the
// number flies, lands in the corner, and is said in the chat log — a GM's roll
// for the ambush is as public as a player's.
let initiativeModalMapId = null;
let initiativeModalPicked = new Set();

function initiativeCandidates(map) {
  // Creatures not already in the order. One that is in it cannot be ticked into
  // a second group — a creature has one place in the turn order, and offering
  // it twice would be offering to break that.
  return mapTokens(map).filter(t => !initiativeEntryOfToken(map, t.id));
}

function openInitiativeModal(mapId) {
  const map = mapById(mapId);
  if (!map || !canEditMap()) return;
  initiativeModalMapId = mapId;
  initiativeModalPicked = new Set();

  // Whatever the GM already had selected on the board is the obvious starting
  // point; failing that, the creatures a GM reaches for this dialog to roll —
  // the ones that are not the party's.
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

  // The name is a *suggestion*, so it is only rewritten while the GM has not
  // typed one of their own — retyping under their cursor would be the sheet's
  // rebuild-on-keystroke mistake in a smaller box.
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

// What to call a group nobody has named. Creatures that share a name are that
// name — six goblins are "Goblin" — and a mixed handful gets the plainest word
// that is true of it, because inventing a collective noun for a wolf and two
// bandits would be the app pretending to know more than it does.
//
// **The count is deliberately not in the name.** The row already draws it as a
// badge beside whatever the group is called, so a name carrying it too reads
// "Goblin ×3 ×3" — and a GM who types their own name would have to remember to
// keep its number in step with a group the board can change under them.
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
    // The colour the row is edged in. A mixed group takes the loudest thing in
    // it: a bandit standing with a wolf is still an enemy turn.
    hostility: picked.some(t => t.hostility === 'hostile') ? 'hostile'
      : picked.some(t => t.hostility === 'neutral') ? 'neutral' : 'party',
  });

  hideModal('initiative-modal');
}

// =============================================================================
// THE PANEL
// =============================================================================
// Top left of the board, over the picture. **Collapsed it says only whose turn
// it is**, which is the one thing a fight needs on screen at all times, and
// expanded it is the whole order. Both are the same list — collapsing hides the
// rows that are not the active one in CSS rather than rendering a second,
// shorter panel that could disagree with the first.
//
// Whether it is collapsed is **session only**, like which sheet sections are
// folded and for the same reason: it is a glance, not a property of the fight,
// and every other member of the table has their own answer.
let initiativeCollapsed = false;

// What the reader is pointing at, as an *entry* id — the panel and the board
// are two views of one list, so hovering either lights the other. It is one
// piece of state rather than one per side, which is what makes them incapable
// of disagreeing.
let initiativeHoverId = null;

function renderInitiativePanel() {
  const panel = document.getElementById('map-initiative');
  if (!panel) return;
  // **The panel is part of the board**, not something a fight brings with it:
  // before there is an order it is how one is started — the GM's + and the
  // player's Roll Initiative both live in it — and a reader who had to find a
  // different screen to enter the fight they are looking at would be leaving
  // the board to do it.
  const map = typeof mapViewIsShowing === 'function' && mapViewIsShowing() ? viewedMap() : null;
  panel.classList.toggle('hidden', !map);
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

// **The player's own roll, on the board.** The same roll the character sheet
// makes — the same `data-roll` attribute, read by the same pair of listeners in
// dice.js — so it takes the same modifier off the same sheet, flies the same
// way, is said in the log the same way, and holds for advantage like every
// other roll target. A second button that *worked out* an initiative roll for
// itself would be a second answer waiting to disagree with the first.
//
// It is offered exactly when pressing it would do something:
//   - **not to a GM**, who has no character in the order; theirs is the + that
//     rolls for the board.
//   - **not while reading somebody else's sheet**, since the roll would be made
//     off their Dexterity and attributed to your account — which is the same
//     reason `noteRollForInitiative()` refuses it.
//   - **not once you are in the order**, because rolling again cannot move you
//     (see the note there), and a button that does nothing is worse than no
//     button at all.
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

    // **The creature's own glyph, read off the board rather than off the entry.**
    // A player never told us what their token looks like — they placed it — and
    // a group's tokens can be swapped out under it. The stored icon is the
    // fallback for a group whose creatures have since left the map, and the
    // shield for a player who has not put a token down at all.
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

    // Only the GM, or the owner of an entry, can take it out — the same rule
    // `removeInitiativeEntry()` enforces, said in the interface so nobody
    // reaches for a button that would refuse them.
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
// The panel and the board show the same fight, so pointing at one has to light
// the other: a name in a list means nothing to a reader who cannot find the
// creature it belongs to, and a creature on a crowded board means nothing if
// you cannot tell when it acts.
//
// **One piece of state serves both directions.** The panel writes it on hover;
// the map writes it from whatever creature is under the cursor. Each redraws
// the other side, and neither can be lit while the other is not.
function setInitiativeHover(entryId) {
  if (initiativeHoverId === entryId) return;
  initiativeHoverId = entryId;
  syncInitiativeHoverRows();
  drawBattlemap();
}

// The rows are re-marked in place rather than rebuilt: this fires on every
// pointermove across the board, and throwing eight rows away to change one
// class would take the cursor off the button it was over.
function syncInitiativeHoverRows() {
  document.querySelectorAll('#init-list .init-row').forEach(row => {
    row.classList.toggle('hover', row.dataset.entry === initiativeHoverId);
  });
}

// The board's half: whatever creature is under the cursor, named as the entry
// it belongs to. A creature that is not in the fight has no entry, and hovering
// it clears the highlight rather than leaving the last one lit.
function noteMapTokenHover(map, tokenId) {
  if (!map || !initiativeRunning(map)) { setInitiativeHover(null); return; }
  const entry = tokenId ? initiativeEntryOfToken(map, tokenId) : null;
  setInitiativeHover(entry ? entry.id : null);
}

// **What the board draws on each creature**, worked out once per frame rather
// than per token: two lookups over a handful of entries, instead of one per
// creature per redraw.
//
// Hover beats the turn marker where they land on the same creature — the turn
// is a standing fact and the hover is the reader asking about this one *now*.
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
// WIRING
// =============================================================================
document.getElementById('init-toggle').addEventListener('click', () => {
  initiativeCollapsed = !initiativeCollapsed;
  renderInitiativePanel();
});

document.getElementById('init-roll-btn').addEventListener('click', confirmInitiativeRoll);

// The board's Roll Initiative, wired the way the sheet's twenty-five roll
// targets are: dice.js owns the gesture, this only says which roll it is.
const initOwnRollEl = document.getElementById('init-roll-own');
initOwnRollEl.addEventListener('pointerdown', e => beginRollGesture(e, initOwnRollEl, () => sheetRollSpec('initiative')));
initOwnRollEl.addEventListener('click', () => rollFromClick(() => sheetRollSpec('initiative')));
document.getElementById('init-group-name').addEventListener('input', e => {
  e.target.dataset.touched = e.target.value ? '1' : '';
});
