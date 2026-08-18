// =============================================================================
// CLOUD-SAVE — Mirrors the inventory to the signed-in account
// =============================================================================
'use strict';

// While you are signed in, the save file follows the account instead of the
// browser: sign in on a second machine and your inventory is there. localStorage
// keeps working underneath as the local copy, so signing out — or losing the
// network — leaves you exactly where the app has always been.
//
// The whole save is stored as one JSON string at `users/{uid}/save`, not as a
// tree. The Realtime Database drops nulls and empty objects, which the save file
// is full of: an unplaced item's `row` is null, and "no items" is `{}`. Written
// as a tree, deleting your last item would silently fail to replicate. A string
// round-trips byte for byte, and party sync — which does write a tree — is
// unaffected.
//
// Two devices editing at once is settled last-writer-wins, per whole save,
// which is honest for a save file that is really one document. The one case
// worth asking about is the first sign-in: if this browser and the account each
// hold real inventories, that is not a conflict to resolve silently, so
// `openCloudConflictModal` puts the choice in front of the user.

const CLOUD_SAVE_DEBOUNCE = 1200;

// Identifies this tab, so our own writes don't bounce back as remote changes.
const cloudClientId = Math.random().toString(36).slice(2, 10);

// Who the ref belongs to. Held here rather than read back off state.auth so the
// two cannot disagree halfway through a sign-in.
let cloudUser = null;
let cloudSaveRef = null;
let cloudWriteTimer = null;
let cloudStatus = 'off'; // 'off' | 'syncing' | 'synced' | 'error'
let cloudStatusDetail = '';
let pendingRemoteSave = null; // waits for the drag in progress to finish
let remoteRetryTimer = null;

// =============================================================================
// LIFECYCLE
// =============================================================================
// Called by auth.js on every sign-in and sign-out.
function onAuthUserChanged(user) {
  stopCloudSync();
  cloudUser = user || null;
  if (!cloudUser || !firebaseDb) { setCloudStatus('off'); return; }

  cloudSaveRef = firebaseDb.ref(`users/${cloudUser.uid}/save`);
  reconcileWithCloud();
}

function stopCloudSync() {
  cloudUser = null;
  clearTimeout(cloudWriteTimer);
  clearTimeout(remoteRetryTimer);
  cloudWriteTimer = null;
  remoteRetryTimer = null;
  pendingRemoteSave = null;
  if (cloudSaveRef) { cloudSaveRef.off(); cloudSaveRef = null; }
}

function cloudSyncActive() {
  return !!(cloudSaveRef && cloudUser);
}

// What the account holds versus what this browser holds, on first sign-in.
async function reconcileWithCloud() {
  setCloudStatus('syncing');

  let remote;
  try {
    remote = (await cloudSaveRef.get()).val();
  } catch (err) {
    setCloudStatus('error', cloudErrorDetail(err));
    return;
  }

  const localJson = JSON.stringify(buildSavePayload());

  // Nothing up there yet — this browser's inventory becomes the account's.
  if (!remote || !remote.json) { pushCloudSave(); listenForRemoteSaves(); return; }

  // Same thing on both sides, or nothing of our own worth keeping.
  if (remote.json === localJson || !hasLocalSave()) {
    applyCloudSave(remote, { force: true });
    listenForRemoteSaves();
    return;
  }

  openCloudConflictModal(remote, localJson);
}

function listenForRemoteSaves() {
  if (!cloudSaveRef) return;
  cloudSaveRef.on('value', snap => {
    const remote = snap.val();
    if (!remote || !remote.json) return;
    if (remote.updatedBy === cloudClientId) { setCloudStatus('synced'); return; } // our own echo
    applyCloudSave(remote);
  }, err => setCloudStatus('error', cloudErrorDetail(err)));
}

// =============================================================================
// WRITING
// =============================================================================
// debouncedSync() calls this on every change, the same signal that writes
// localStorage.
function scheduleCloudSave() {
  if (!cloudSyncActive()) return;
  // While someone else's inventory is on screen, `state` is theirs — pushing it
  // to our account would overwrite our own save with their sheet.
  if (state.party.viewingPlayerId !== null) return;

  clearTimeout(cloudWriteTimer);
  setCloudStatus('syncing');
  cloudWriteTimer = setTimeout(pushCloudSave, CLOUD_SAVE_DEBOUNCE);
}

function pushCloudSave() {
  if (!cloudSyncActive()) return;
  if (state.party.viewingPlayerId !== null) return;

  cloudSaveRef.set({
    json: JSON.stringify(buildSavePayload()),
    updatedAt: Date.now(),
    updatedBy: cloudClientId,
  }).then(
    () => setCloudStatus('synced'),
    err => setCloudStatus('error', cloudErrorDetail(err)),
  );
}

// =============================================================================
// READING
// =============================================================================
// Mid-drag the dragged item is out of the grid and the ghost is following the
// cursor; replacing the whole save underneath that would strand it. Hold the
// incoming save and try again shortly.
function applyCloudSave(remote, { force = false } = {}) {
  if (!force && state.mode !== 'idle') {
    pendingRemoteSave = remote;
    clearTimeout(remoteRetryTimer);
    remoteRetryTimer = setTimeout(() => {
      const held = pendingRemoteSave;
      pendingRemoteSave = null;
      if (held) applyCloudSave(held);
    }, 1000);
    return;
  }

  let payload;
  try {
    payload = JSON.parse(remote.json);
  } catch {
    setCloudStatus('error', 'the account holds a save this version cannot read');
    return;
  }

  applySavePayload(payload);
  autoSave(); // keep the local copy in step; deliberately not debouncedSync(),
              // which would push this straight back where it came from
  renderLiveCharacter(); // the whole working copy was just replaced
  renderHomeScreen();    // a no-op unless the roster is what is on screen
  setCloudStatus('synced');
}

// =============================================================================
// FIRST SIGN-IN: TWO INVENTORIES
// =============================================================================
// A save is a whole roster now, so the summary names the active character and
// counts the rest. `describeSavePayload` in characters.js reads either version.
function describeSave(payload, savedAt) {
  const when = savedAt ? new Date(savedAt).toLocaleString() : 'unknown date';
  return `${describeSavePayload(payload)}\nlast saved ${when}`;
}

function openCloudConflictModal(remote, localJson) {
  let remotePayload = null;
  try { remotePayload = JSON.parse(remote.json); } catch { /* shown as unreadable */ }

  document.getElementById('cloud-local-summary').textContent =
    describeSave(JSON.parse(localJson), null).replace('last saved unknown date', 'in this browser now');
  document.getElementById('cloud-remote-summary').textContent =
    remotePayload ? describeSave(remotePayload, remote.updatedAt) : 'Unreadable save';

  const keepLocal = () => {
    hideModal('cloud-conflict-modal');
    pushCloudSave();          // this browser wins; the account is overwritten
    listenForRemoteSaves();
  };
  const keepRemote = () => {
    hideModal('cloud-conflict-modal');
    applyCloudSave(remote, { force: true });
    listenForRemoteSaves();
  };

  // Fresh listeners each time — the modal can be opened again on the next
  // sign-in, and a stale handler would resolve against the wrong save.
  const localBtn  = replaceWithClone(document.getElementById('cloud-keep-local'));
  const remoteBtn = replaceWithClone(document.getElementById('cloud-keep-remote'));
  localBtn.addEventListener('click', keepLocal);
  remoteBtn.addEventListener('click', keepRemote);

  setCloudStatus('syncing', 'waiting for you to choose');
  showModal('cloud-conflict-modal');
}

function replaceWithClone(el) {
  const clone = el.cloneNode(true);
  el.parentNode.replaceChild(clone, el);
  return clone;
}

// =============================================================================
// STATUS
// =============================================================================
function cloudErrorDetail(err) {
  if (err && err.code === 'PERMISSION_DENIED') {
    return 'your database rules do not allow users/<uid>/save — see database.rules.example.json';
  }
  return (err && err.message) || 'unknown error';
}

function setCloudStatus(status, detail = '') {
  cloudStatus = status;
  cloudStatusDetail = detail;
  updateCloudStatusUI();
}

function updateCloudStatusUI() {
  const el = document.getElementById('account-sync-status');
  if (!el) return;

  const text = {
    off:     '',
    syncing: 'Syncing…',
    synced:  'Inventory synced to this account',
    error:   'Sync failed',
  }[cloudStatus] ?? '';

  el.textContent = cloudStatusDetail ? `${text} — ${cloudStatusDetail}` : text;
  el.classList.toggle('sync-error', cloudStatus === 'error');
  el.classList.toggle('hidden', !text);
}
