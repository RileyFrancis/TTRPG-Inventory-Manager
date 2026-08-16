// =============================================================================
// PARTY — Party sync over Firebase + party UI
// =============================================================================
'use strict';

// =============================================================================
// PARTY — FIREBASE
// =============================================================================
let firebaseDb = null;
let partyPlayersRef = null;
let firebaseInitError = null; // kept so the party buttons can say what went wrong

function initFirebase() {
  if (!FIREBASE_CONFIG) return; // firebase-config.js already explained why
  if (typeof firebase === 'undefined') {
    firebaseInitError = 'sdk';
    console.warn('The Firebase SDK did not load — party features unavailable. ' +
                 'The <script> tags in index.html pull it from gstatic.com, which needs a network connection.');
    return;
  }
  try {
    firebase.initializeApp(FIREBASE_CONFIG);
    firebaseDb = firebase.database();
  } catch (e) {
    firebaseInitError = e.message;
    console.warn('Firebase init failed — party features unavailable:', e);
  }
}

// Why party sync is off, phrased as the thing that actually fixes it. The three
// causes look identical from the button — no database handle — but need
// completely different answers, and by far the most common is opening
// index.html straight off disk, where the browser refuses to read .env.
function partyUnavailableMessage() {
  if (!FIREBASE_CONFIG) {
    if (location.protocol === 'file:') {
      return 'Party play needs the app served over HTTP.\n\n' +
             'Opened straight from disk (file://), the browser will not let it read .env, ' +
             'so the Firebase settings never arrive.\n\n' +
             'From the project folder run:\n' +
             '    python3 -m http.server 8787\n' +
             'then open http://localhost:8787';
    }
    const local = ['localhost', '127.0.0.1', ''].includes(location.hostname);
    if (!local) {
      return 'Party play is off because this deploy has no Firebase settings.\n\n' +
             '.env is gitignored, so it never reaches the host — and Cloudflare Pages ' +
             'will not serve a file whose name starts with a dot in any case.\n\n' +
             'Set the FIREBASE_* variables in your host\'s build settings and run\n' +
             '    node tools/build-firebase-env.js\n' +
             'as the build command, which writes the firebase.env this page looks for.';
    }
    return 'Party play is off because .env could not be read.\n\n' +
           'It must sit in the project root and be served alongside index.html — ' +
           'check that opening /.env on this server returns the file, and that it sets ' +
           'FIREBASE_DATABASE_URL.\n\nSee .env.example for the full list of keys.';
  }
  if (firebaseInitError === 'sdk') {
    return 'Party play is off because the Firebase SDK did not load.\n\n' +
           'index.html pulls it from gstatic.com, so it needs a working network connection ' +
           '(and no extension blocking it).';
  }
  return 'Party play is off because Firebase failed to start:\n\n' + firebaseInitError +
         '\n\nCheck the values in .env against Firebase Console → Project settings → Your apps.';
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
      containerId: inst.containerId ?? null,
    }])
  );
}

async function createParty() {
  if (!firebaseDb) {
    alert(partyUnavailableMessage());
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
    alert(partyUnavailableMessage());
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
      equipped: state.equipped,
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
  // Don't overwrite own save while a GM is editing a player's inventory
  const gmEditing = state.party.active && state.party.role === 'gm' && state.party.viewingPlayerId !== null;
  if (!gmEditing) autoSave();
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
    equipped: state.equipped,
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
  state.equipped  = playerData.equipped  ? { ...playerData.equipped  } : {};
  syncNextId();
  rebuildGrid();
  renderItemList();
  updateWeightDisplay();
}

function applyRemoteEditToOwnState(playerData) {
  if (playerData.instances !== undefined) state.instances = { ...playerData.instances };
  if (playerData.equipped  !== undefined) state.equipped  = { ...playerData.equipped  };
  if (playerData.customDb) Object.assign(state.db, playerData.customDb);
  syncNextId();
  rebuildGrid();
  renderItemList();
  updateWeightDisplay();
}

function saveOwnState() {
  state.party.ownState = {
    character: { ...state.character },
    instances: JSON.parse(JSON.stringify(state.instances)),
    equipped:  { ...state.equipped },
    customDb:  JSON.parse(JSON.stringify(getCustomDb())),
  };
}

function restoreOwnState() {
  const own = state.party.ownState;
  if (!own) return;
  state.character = { ...own.character };
  state.instances = { ...own.instances };
  state.equipped  = { ...(own.equipped ?? {}) };
  state.db = {};
  DEFAULT_ITEMS.forEach(t => { state.db[t.id] = t; });
  Object.assign(state.db, own.customDb);
  state.party.ownState = null;
  syncNextId();
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
    return sum + (isStackable(t) ? unitWeight(t) * inst.stackCount : shapeWeight(getRotatedShape(t.shape, inst.rotation)));
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
  // The character tabs are this same roster and selection in another shape, so
  // they refresh from the same signal — including the roster arriving empty.
  syncCharacterViewUI();

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
  // The character's name, to match the tab you picked them from — the player
  // behind it is already named in the Party panel.
  const player = state.party.players[viewId];
  const name = player?.character?.name ?? player?.name ?? 'Player';
  const textEl = document.getElementById('viewing-banner-text');
  const returnBtn = document.getElementById('return-to-own-btn');

  const what = state.view === 'sheet' ? 'character sheet' : 'inventory';
  if (state.party.role === 'gm') {
    textEl.textContent = `Editing ${name}'s ${what}`;
    returnBtn.textContent = 'Deselect Player';
  } else {
    textEl.textContent = `Viewing ${name}'s ${what} (read-only)`;
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
