// =============================================================================
// PARTY — Party sync over Firebase + party UI
// =============================================================================
'use strict';

// =============================================================================
// PARTY — FIREBASE
// =============================================================================
let firebaseDb = null;
let partyPlayersRef = null;
let partyMetaRef = null;
let firebaseInitError = null; // kept so the party buttons can say what went wrong

// Our own node in the party — the player entry, or the GM's. Owned by the
// presence block further down, which is the only thing that may write to it:
// it carries an onDisconnect handler that has to be re-armed on every reconnect
// and *cancelled* when we leave on purpose. Uncancelled, it would write
// `connected: false` back into a roster we are no longer in, resurrecting a
// player the GM has just removed.
let partySelfRef = null;

// Whether we have ever seen ourselves in the roster. A player's entry vanishing
// afterwards means the GM removed it — the roster is the only signal, and one
// that cannot be spoofed by a slow first snapshot.
let sawSelfInRoster = false;

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
             'Set the FIREBASE_* variables under Pages → Settings → Variables and Secrets, ' +
             'then redeploy: functions/firebase-env.js serves them to this page at ' +
             '/firebase-env, which is currently answering with nothing.';
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

// =============================================================================
// IDENTITY — why a roster entry is keyed by the account
// =============================================================================
// A player's node under `parties/<code>/players` is keyed by their **account
// uid**. That one decision is what makes a campaign a campaign, and it is the
// whole of the duplicate-player fix.
//
// It used to be a fresh random id minted on every join. Nothing was wrong with
// the id — it was the *lifetime* that was wrong. A session id names a
// connection, and a roster is not a list of connections, it is a list of
// people. So closing the tab and coming back wrote a *second* node, and the GM
// watched one player become two: one greyed out forever, one live, both equally
// real as far as the roster could tell. There was no cleanup to write, either,
// because nothing distinguished that ghost from a player who had genuinely
// stepped away for a minute.
//
// Keyed by the account there is nowhere for a duplicate to be. Rejoining lands
// on the node you already had: `connected` flips back to true, and the
// character, the shop reveals aimed at you and the GM's current selection all
// still point at the same place. It is also what lets the roster be *read* as
// the campaign's membership — a list that outlives every session in it.
//
// The GM is the exception, and deliberately: their node is `parties/<code>/gm`,
// one node rather than a keyed collection, so it has never had this problem.
// Their uid is recorded in it, and in `meta.gmUid`, so a campaign remembers who
// runs it.
function ownPlayerId() {
  return state.auth.user?.uid ?? null;
}

// Entries written before roster keys were accounts. They carry a `p_`-prefixed
// key and nothing that identifies the person behind them but the name they
// typed, so that name is all a sweep can match on — which is exactly why the
// scheme had to change. Best-effort: a leftover the sweep misses is still one
// Kick away, and this is the last release in which one can be created.
function isLegacyPlayerKey(id) {
  return typeof id === 'string' && id.startsWith('p_');
}

async function sweepLegacySelfEntries(code, name) {
  try {
    const snap = await firebaseDb.ref(`parties/${code}/players`).get();
    const players = snap.val() ?? {};
    const stale = Object.entries(players).filter(([id, p]) => isLegacyPlayerKey(id) && p && p.name === name);
    await Promise.all(stale.map(([id]) =>
      firebaseDb.ref(`parties/${code}/players/${id}`).remove().catch(() => {})));
  } catch { /* the sweep is a courtesy; a failure must not block the join */ }
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

// =============================================================================
// ENTERING A CAMPAIGN
// =============================================================================
// Three doors into the same room, and each is the *only* thing that differs
// between them: minting the record (`createCampaign`), sitting back down in the
// GM's chair (`enterCampaignAsGM`), and taking a seat at the table
// (`enterCampaignAsPlayer`). Everything after the write is shared, in
// `beginPartySession()`, so the three can never drift into three slightly
// different ideas of what being in a party means.
//
// Each returns the campaign code on success and `null` on failure, having said
// why. campaigns.js is the caller, and files the bookmark from that answer.

// The live session state, set once the write has landed. `role` and `playerId`
// are the two halves of "who am I here": a GM's node is `gm`, a player's is
// their account uid.
function beginPartySession({ code, role, playerId, playerName, campaignName }) {
  state.party.active = true;
  state.party.code = code;
  state.party.role = role;
  state.party.playerId = playerId;
  state.party.playerName = playerName;
  state.party.campaignName = campaignName ?? null;
  state.party.viewingPlayerId = null;
  state.party.players = {};

  subscribeToParty(code);
  startPresenceSweep(); // a lapsed claim has no snapshot to announce it
  hideModal('campaign-modal');
  updatePartyUI();
  switchTab('party');
}

// A party's `meta` is what the roster is not: the campaign's own name, who runs
// it, and when it was made. It is written once and read by anyone holding the
// code, which is how a player's home screen can name a campaign it has only
// ever been given six letters for.
function campaignMeta(name, uid, gmName) {
  return { name, gmUid: uid ?? null, gmName: gmName || 'Game Master', createdAt: Date.now() };
}

async function createCampaign(name) {
  if (!firebaseDb) { alert(partyUnavailableMessage()); return null; }
  const uid = ownPlayerId();
  if (!uid) { alert('Creating a campaign needs an account, so your table knows who is running it.'); return null; }

  const code = generatePartyCode();
  const gmName = accountDisplayName() || 'Game Master';
  try {
    await firebaseDb.ref(`parties/${code}`).update({
      meta: campaignMeta(name, uid, gmName),
      gm: { name: gmName, uid, connected: true, lastSeen: presenceStamp() },
    });
    startPresence(firebaseDb.ref(`parties/${code}/gm`));
  } catch (e) {
    alert('Failed to create the campaign: ' + e.message);
    return null;
  }

  beginPartySession({ code, role: 'gm', playerId: 'gm', playerName: gmName, campaignName: name });
  return code;
}

// The GM coming back to a campaign they already run. Deliberately an `update`
// on the node rather than a `set`: the node is the same one they left, and
// anything a later version parks beside `connected` survives the return.
async function enterCampaignAsGM(code, meta) {
  if (!firebaseDb) { alert(partyUnavailableMessage()); return null; }
  const uid = ownPlayerId();
  const gmName = accountDisplayName() || 'Game Master';
  try {
    const gmRef = firebaseDb.ref(`parties/${code}/gm`);
    await gmRef.update({ name: gmName, uid, connected: true, lastSeen: presenceStamp() });
    startPresence(gmRef);
  } catch (e) {
    alert('Could not rejoin as Game Master: ' + e.message);
    return null;
  }

  beginPartySession({ code, role: 'gm', playerId: 'gm', playerName: gmName, campaignName: meta?.name ?? null });
  return code;
}

// A player taking their seat. `update` for the same reason, and here it also
// carries the point of the whole change: on a rejoin this lands on the node
// they already had rather than making a second one beside it.
async function enterCampaignAsPlayer(code, playerName, meta) {
  if (!firebaseDb) { alert(partyUnavailableMessage()); return null; }
  const uid = ownPlayerId();
  if (!uid) { alert('Joining a campaign needs an account, so your group can tell who is who.'); return null; }

  try {
    const playerRef = firebaseDb.ref(`parties/${code}/players/${uid}`);
    await playerRef.update({
      uid,
      name: playerName,
      connected: true,
      lastSeen: presenceStamp(),
      characterId: state.character.id ?? null,
      character: state.character,
      instances: getSerializableInstances(),
      customDb: getCustomDb(),
      equipped: state.equipped,
      _writtenBy: uid,
    });
    startPresence(playerRef);
    sawSelfInRoster = true; // we just wrote it — a later absence is a removal
  } catch (e) {
    alert('Failed to join the campaign: ' + e.message);
    return null;
  }

  sweepLegacySelfEntries(code, playerName); // fire and forget; see the note above

  beginPartySession({ code, role: 'player', playerId: uid, playerName, campaignName: meta?.name ?? null });
  return code;
}

// =============================================================================
// PRESENCE — what the green dot is allowed to mean
// =============================================================================
// The dot is green **iff that person has the app open on this campaign right
// now**. That is a claim about the present, so it cannot be written once and
// left: every way a session can end has to be able to reach it, including the
// ways that never run any of our code.
//
// Two things used to break it, and they compound.
//
//   1. `onDisconnect` was armed **once**, at join. RTDB *consumes* a handler
//      when it fires and does not re-arm it on reconnect, so a single wifi blip
//      spent it — the tab actually closed hours later then wrote nothing, and
//      the seat stayed lit. Arming from `.info/connected` is the fix: that
//      listener fires on every (re)connection, so the handler is replaced each
//      time it is spent. `connected: true` is written *inside* the `.then()`,
//      after the handler is registered, because a drop between the two would
//      otherwise leave a live seat with nothing watching it.
//
//   2. `leaveParty()` cancelled the handler and wrote nothing in its place. That
//      was survivable when a rejoin minted a fresh key and orphaned the old
//      node; now that a seat is keyed by account and *persists*, Leave Session,
//      switching campaigns and signing out each left a green dot on an empty
//      chair. `endPresence()` writes the `false` itself, before cancelling.
//
// Neither covers a client the server never notices has gone — a killed browser,
// a closed laptop, a rules change that silently refuses the write. So presence
// is **two facts, not one**: `connected` is what the client last claimed, and
// `lastSeen` is when it last claimed it. A dot needs both, so a claim with no
// heartbeat behind it lapses on its own instead of lying indefinitely.
const PRESENCE_HEARTBEAT_MS = 40000;  // how often a live client re-states itself
const PRESENCE_STALE_MS     = 105000; // ~2.5 missed beats before a claim lapses
const PRESENCE_SWEEP_MS     = 15000;  // how often the panel re-checks the clock

let presenceConnRef   = null; // .info/connected
let presenceOffsetRef = null; // .info/serverTimeOffset
let presenceTimer     = null;
let presenceSweepTimer = null;

// `lastSeen` is stamped by the *server*, so it has to be read against the
// server's clock. A client whose own clock is an hour out would otherwise call
// everyone offline, or nobody.
let serverTimeOffset = 0;
function serverNow() { return Date.now() + serverTimeOffset; }

function presenceStamp() {
  return firebase.database.ServerValue.TIMESTAMP;
}

// Take up our own node and start claiming it. Replaces the one-shot arming that
// used to happen at join.
function startPresence(ref) {
  endPresence(); // anything still held here is a previous seat: stand it down
  partySelfRef = ref;

  if (!presenceOffsetRef) {
    presenceOffsetRef = firebaseDb.ref('.info/serverTimeOffset');
    presenceOffsetRef.on('value', snap => { serverTimeOffset = snap.val() ?? 0; });
  }

  presenceConnRef = firebaseDb.ref('.info/connected');
  presenceConnRef.on('value', snap => {
    if (!snap.val()) return;   // the drop itself is the server's to record
    const self = partySelfRef; // may have been dropped while this was in flight
    if (!self) return;
    self.onDisconnect().update({ connected: false, lastSeen: presenceStamp() })
      .then(() => { if (partySelfRef === self) beatPresence(); })
      .catch(() => { /* offline again already — the next connect re-arms */ });
  });

  clearInterval(presenceTimer);
  presenceTimer = setInterval(beatPresence, PRESENCE_HEARTBEAT_MS);
}

// The claim itself. Deliberately **not** folded into `syncPartyState()`: that
// writes to whichever node is being *edited*, which for a GM is one of the
// players — stamping `lastSeen` there would light a player up because the GM is
// reading their sheet. This only ever touches our own node.
function beatPresence() {
  if (!partySelfRef) return;
  partySelfRef.update({ connected: true, lastSeen: presenceStamp() })
    .catch(() => { /* a seat that has been removed; the roster listener has it */ });
}

// Stand down. The `false` is written *before* the handler is cancelled, so there
// is no window in which nothing would mark us gone.
//
// It can land on a node the GM has just deleted, where `update()` would recreate
// it — which is why `handleRemovedFromParty()` and `leaveCampaign()` both sweep
// the node *after* coming through here, exactly as they already did for a sync
// caught in flight.
function endPresence({ markOffline = true } = {}) {
  clearInterval(presenceTimer);
  presenceTimer = null;

  if (presenceConnRef) { presenceConnRef.off(); presenceConnRef = null; }

  if (partySelfRef) {
    const self = partySelfRef;
    partySelfRef = null;
    if (markOffline) self.update({ connected: false, lastSeen: presenceStamp() }).catch(() => {});
    try { self.onDisconnect().cancel(); } catch { /* already gone */ }
  }
}

// Whether to light this roster entry. Both halves are required: what the client
// last claimed, and whether that claim is still fresh.
//
// An entry carrying **no `lastSeen` at all** reads as offline. Every client that
// could be connected now writes one on connect and every 40s after, so a seat
// without one is a record left behind by a session that ended before presence
// worked — which is exactly the stuck-green entry this fixes.
function isPlayerOnline(p) {
  if (!p || !p.connected) return false;
  const seen = Number(p.lastSeen);
  if (!Number.isFinite(seen)) return false;
  return serverNow() - seen < PRESENCE_STALE_MS;
}

// A claim lapses through the passage of time, and time is not an event Firebase
// will wake us for: with no snapshot arriving, a dead client's dot would stay
// lit until something else happened to redraw the panel. So the panel re-checks
// itself — and redraws only when the answer has actually changed, because this
// runs every 15s for as long as a session is open and must not rebuild the
// roster under the reader's cursor for nothing.
let lastPresenceSignature = '';

function presenceSignature() {
  return Object.entries(state.party.players ?? {})
    .map(([id, p]) => id + ':' + (isPlayerOnline(p) ? '1' : '0'))
    .sort()
    .join(',');
}

function startPresenceSweep() {
  clearInterval(presenceSweepTimer);
  lastPresenceSignature = presenceSignature();
  presenceSweepTimer = setInterval(() => {
    const sig = presenceSignature();
    if (sig === lastPresenceSignature) return;
    lastPresenceSignature = sig;
    updatePartyPanel();
  }, PRESENCE_SWEEP_MS);
}

function stopPresenceSweep() {
  clearInterval(presenceSweepTimer);
  presenceSweepTimer = null;
  lastPresenceSignature = '';
}

// What a code actually points at, or null. The campaign's own record is what
// tells a joiner whether they are walking in as its GM or as a player, which is
// a question a local bookmark must never be trusted to answer: a bookmark is
// this browser's memory, and the party is the fact.
async function fetchCampaignMeta(code) {
  if (!firebaseDb) return null;
  try {
    const snap = await firebaseDb.ref(`parties/${code}`).get();
    if (!snap.exists()) return null;
    const val = snap.val() ?? {};
    // A party made before campaigns had names has no `meta`. It is still a
    // perfectly good party, so it is described from what it does have.
    return val.meta ?? { name: '', gmUid: val.gm?.uid ?? null, gmName: val.gm?.name ?? 'Game Master', createdAt: 0 };
  } catch (e) {
    alert('Failed to connect: ' + e.message);
    return null;
  }
}

function subscribeToParty(code) {
  subscribeToShops(code);     // the party's shops ride along with its roster
  subscribeToChat(code);      // and so does its conversation
  subscribeToBattlemap(code); // and the board they are standing on

  // The campaign's own record. A GM renaming it, or a first join that only had
  // the code to go on, both arrive here — and the bookmark on the home screen
  // is refreshed from it, so a campaign card is never a stale copy of a name
  // somebody else has since changed.
  if (partyMetaRef) partyMetaRef.off();
  partyMetaRef = firebaseDb.ref(`parties/${code}/meta`);
  partyMetaRef.on('value', snap => {
    const meta = snap.val();
    if (!meta) return;
    state.party.campaignName = meta.name ?? null;
    noteCampaignMeta(code, meta);
    updatePartyUI();
  });

  if (partyPlayersRef) partyPlayersRef.off();
  partyPlayersRef = firebaseDb.ref(`parties/${code}/players`);

  partyPlayersRef.on('value', snap => {
    const players = snap.val() ?? {};
    state.party.players = players;

    // Being removed from the roster *is* the message: there is no separate
    // "you were kicked" flag to write, read and clean up, and a player whose
    // entry is gone has nothing left to sync to anyway.
    if (state.party.role === 'player') {
      if (players[state.party.playerId]) sawSelfInRoster = true;
      else if (sawSelfInRoster) { handleRemovedFromParty(); return; }
    }

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

    noteCampaignRoster(state.party.code, players);
    lastPresenceSignature = presenceSignature(); // the sweep only chases changes
    updatePartyPanel();
  });
}

function leaveParty() {
  if (!state.party.active) return;
  if (partyPlayersRef) { partyPlayersRef.off(); partyPlayersRef = null; }
  if (partyMetaRef) { partyMetaRef.off(); partyMetaRef = null; }
  unsubscribeFromShops();
  unsubscribeFromChat();
  unsubscribeFromBattlemap();

  // Marks us offline, then cancels the onDisconnect — see the presence note
  // above. Cancelling alone used to be the whole of this, which is how a
  // deliberate leave left a lit dot on an empty chair.
  endPresence();
  stopPresenceSweep();
  sawSelfInRoster = false;

  const wasGM = state.party.role === 'gm';
  if (state.party.viewingPlayerId !== null) restoreOwnState();

  state.party = {
    active: false, code: null, role: null, playerId: null, playerName: null,
    campaignName: null, viewingPlayerId: null, ownState: null, players: {},
  };

  // A GM's working copy is the placeholder, not a character — their own
  // character was left untouched in its slot, so it comes back now.
  if (wasGM) {
    ensureCharacter();
    loadActiveCharacterIntoLive();
    renderLiveCharacter();
  }

  updatePartyUI();
  switchTab('browse');
  renderHomeScreen(); // the campaign card is a Resume again
}

// Leaving *the session* is not leaving *the campaign*. Closing the tab, or
// pressing Leave Party, ends the connection and nothing else — the roster entry
// stays, which is exactly what a campaign is for. Resigning from the campaign
// for good is `leaveCampaign()` in campaigns.js, and it is a separate, deliberate
// act because it throws away the seat rather than stepping out of it.


// Kicked by the GM. Nothing local is lost — the roster entry was a copy — so
// this is a leave with an explanation.
//
// It now drops the campaign bookmark too, and has to: the roster entry *is* the
// membership, so a card left on the home screen would be an invitation back into
// a campaign you have been removed from, and clicking it would quietly write the
// seat back. A removal has to reach both halves of the same fact.
function handleRemovedFromParty() {
  const code = state.party.code;
  const selfId = state.party.playerId;
  const ref = firebaseDb && code && selfId
    ? firebaseDb.ref(`parties/${code}/players/${selfId}`) : null;
  const name = campaignDisplayName(code);

  leaveParty();
  forgetCampaign(code);

  // A sync already in flight when the GM removed us would land afterwards and
  // recreate the entry — `update()` on a missing path writes it back. Sweeping
  // our own node once we have stopped syncing clears any such straggler.
  if (ref) ref.remove().catch(() => { /* already gone, or no longer permitted */ });

  alert(`You have been removed from ${name} by the Game Master.\n\n` +
        'Your character and everything in your inventory are untouched. ' +
        'Rejoining needs the campaign code again.');
}

// GM only. Removing the entry is the whole operation: their client sees itself
// gone from the roster and leaves. Their own save is theirs and is not touched.
async function kickPlayer(playerId, displayName) {
  if (!firebaseDb || !state.party.active || state.party.role !== 'gm') return;
  if (!confirm(`Remove ${displayName} from the campaign?\n\n` +
               'They lose their seat, not their character: their own inventory is ' +
               'untouched, but the campaign stops remembering them and rejoining ' +
               'needs the code again.')) return;

  if (state.party.viewingPlayerId === playerId) switchViewToOwn();

  try {
    await firebaseDb.ref(`parties/${state.party.code}/players/${playerId}`).remove();
  } catch (e) {
    alert('Could not remove that player: ' + e.message);
  }
}

let syncTimer = null;
function debouncedSync() {
  // Don't overwrite own save while a GM is editing a player's inventory
  const gmEditing = state.party.active && state.party.role === 'gm' && state.party.viewingPlayerId !== null;
  if (!gmEditing) { autoSave(); scheduleCloudSave(); }
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
    // GM — back to no-selection state; show placeholder. Deliberately not one
    // of their own characters: commitActiveCharacter() refuses to write this
    // working copy anywhere, so their roster is untouched by running a table.
    state.character = { id: null, name: 'Game Master', strength: 10, level: 1, race: '', classLevels: [] };
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
function updatePartyUI() {
  const inParty = state.party.active;

  document.getElementById('party-code-badge').classList.toggle('hidden', !inParty);
  if (inParty) document.getElementById('party-code-badge').textContent = state.party.code;

  document.getElementById('party-no-session').classList.toggle('hidden', inParty);
  document.getElementById('party-session').classList.toggle('hidden', !inParty);

  if (inParty) {
    document.getElementById('party-code-text').textContent = state.party.code;
    // The campaign's name, when it has one. A party made before campaigns
    // existed has only its code, and the row is simply left off rather than
    // standing empty above it.
    const nameEl = document.getElementById('party-campaign-name');
    nameEl.textContent = state.party.campaignName ?? '';
    nameEl.classList.toggle('hidden', !state.party.campaignName);
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
    dot.className = 'party-dot ' + (isPlayerOnline(p) ? 'online' : 'offline');

    const nameEl = document.createElement('span');
    nameEl.className = 'party-player-name-text';
    nameEl.textContent = p.name + (isOwn ? ' (You)' : '');

    top.appendChild(dot);
    top.appendChild(nameEl);

    // Only the GM may remove someone, and never themselves.
    if (state.party.role === 'gm') {
      const kickBtn = document.createElement('button');
      kickBtn.className = 'btn-sm danger party-kick-btn';
      kickBtn.textContent = 'Kick';
      kickBtn.title = `Remove ${p.name} from the party`;
      kickBtn.addEventListener('click', e => {
        e.stopPropagation(); // the entry itself selects the player
        kickPlayer(id, p.name);
      });
      top.appendChild(kickBtn);
    }

    entry.appendChild(top);

    if (p.character) {
      const carried = computeCarriedWeightFor(p.instances, p.customDb);
      const encThreshold = p.character.strength * 15;
      const statusText = carried > encThreshold * 2 ? ' · Heavily Enc.' : carried > encThreshold ? ' · Enc.' : '';
      const infoEl = document.createElement('span');
      infoEl.className = 'party-player-info';
      infoEl.textContent = `${p.character.name} · ${Math.round(carried * 10) / 10} lb${statusText}`;
      entry.appendChild(infoEl);

      // Level / race / class, when the player's client is new enough to publish
      // them. An older client sends name + strength only, and this line is
      // simply left off rather than showing a row of blanks.
      const descr = describePartyCharacter(p.character);
      if (descr) {
        const subEl = document.createElement('span');
        subEl.className = 'party-player-info';
        subEl.textContent = descr;
        entry.appendChild(subEl);
      }
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

// "Level 7 · Tiefling · Warlock 5 / Bard 2", skipping whatever is missing. Empty
// when the character carries none of it. The level is the character's own —
// their total — and each class says its own only when there is more than one.
function describePartyCharacter(c) {
  if (!c) return '';
  const classes = describeCharacterClasses(c);
  const parts = [];
  if (c.level) parts.push('Level ' + c.level);
  if (c.race) parts.push(c.race);
  if (classes) parts.push(classes);
  return parts.join(' · ');
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
//
// Party play is the one part of the app that is other people's data, so it is
// the one part that asks for an account. Everything else stays open — the
// inventory itself never gates.
//
// There is one door now: the campaign modal in campaigns.js. The Party tab's
// button and the header's party button both open it, so the sidebar and the
// home screen can never offer two different ideas of how you get into a game.
const PARTY_AUTH_REASON = 'Campaigns need an account, so your group can tell who is who.';

document.getElementById('party-btn').addEventListener('click', () => {
  if (state.party.active) switchTab('party');
  else requireAuth(PARTY_AUTH_REASON, () => openCampaignModal('join'));
});

document.getElementById('open-party-modal-btn').addEventListener('click', () => {
  requireAuth(PARTY_AUTH_REASON, () => openCampaignModal('join'));
});

document.getElementById('copy-code-btn').addEventListener('click', () => {
  navigator.clipboard.writeText(state.party.code ?? '').then(() => {
    flashButton(document.getElementById('copy-code-btn'), 'Copied!');
  });
});

// Ends the *session*, not the membership — so it says so, because the two read
// identically from a button labelled "Leave" and only one of them is undoable
// by clicking a card. Giving up the seat is Leave Campaign, on the home screen.
document.getElementById('leave-party-btn').addEventListener('click', () => {
  if (confirm('Leave this session?\n\n' +
              'You keep your seat in the campaign — it is on your home screen, and ' +
              'opening it puts you straight back in.')) leaveParty();
});

document.getElementById('return-to-own-btn').addEventListener('click', switchViewToOwn);
