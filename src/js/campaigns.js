// =============================================================================
// CAMPAIGNS — the table a character sits at, and the section that lists them
// =============================================================================
'use strict';

// A party used to be a session: six letters, alive while somebody held them, and
// forgotten the moment everyone closed their tab. A **campaign** is the table
// itself — it has a name, it has a Game Master, it remembers who plays in it and
// which character each of them brings, and it is still there next Tuesday.
//
// That is not a bigger party. It is the same party with one thing fixed: a
// roster keyed by *person* rather than by *connection*. See the identity note at
// the top of party.js — that key is why a player who drops out and comes back
// rejoins themselves instead of appearing twice, and it is what lets the roster
// be read as a membership list at all.
//
// **Two halves, and neither is a copy of the other.**
//
//   parties/<code>/          in Firebase — the campaign. Shared, authoritative.
//     meta      { name, gmUid, gmName, createdAt }
//     gm        { name, uid, connected }
//     players   { [uid]: { name, uid, characterId, connected, character, … } }
//     shops     …
//
//   state.campaigns[code]    in the save file — this account's *bookmark*.
//     { code, name, role, characterId, gmName, memberCount, lastPlayed }
//
// The bookmark answers only what the home screen has to know before it has
// spoken to Firebase: that you have a seat somewhere, roughly what it looks
// like, and which character sits in it. Everything it caches — the name, the
// GM, the head count — is refreshed from the party itself the moment you are
// connected (`noteCampaignMeta` / `noteCampaignRoster`), and **nothing reads the
// bookmark to decide anything that matters**: `enterCampaign()` asks the party
// whether you are its GM rather than believing the role written here, because a
// bookmark is this browser's memory and the party is the fact.
//
// It rides in the save payload rather than a Firebase index of its own, so it
// follows the account across browsers for free — cloud-save.js already mirrors
// exactly this — and needs no second set of database rules. The cost is that a
// campaign somebody invites you to is not discoverable until you type its code
// once, which is the same as it ever was.

// =============================================================================
// THE MODEL
// =============================================================================
const CAMPAIGN_NAME_MAX = 40;

function normalizeCampaign(raw, code) {
  const c = raw ?? {};
  return {
    code: String(c.code ?? code ?? '').toUpperCase(),
    name: String(c.name ?? '').slice(0, CAMPAIGN_NAME_MAX),
    role: c.role === 'gm' ? 'gm' : 'player',
    // Which of *your* characters plays here. Null for a GM, who has none, and
    // null for a bookmark written before the field existed — `enterCampaign()`
    // falls back to whoever is active and writes the answer back.
    characterId: c.characterId ?? null,
    gmName: String(c.gmName ?? ''),
    memberCount: Number.isFinite(c.memberCount) ? c.memberCount : 0,
    lastPlayed: Number.isFinite(c.lastPlayed) ? c.lastPlayed : 0,
  };
}

function normalizeCampaigns(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  Object.entries(raw).forEach(([code, c]) => {
    const norm = normalizeCampaign(c, code);
    if (norm.code) out[norm.code] = norm;
  });
  return out;
}

// Most recently played first. A campaign you were at last night is the one you
// are most likely reaching for, and a table you left behind sinks on its own
// without anyone having to archive it.
function campaignList() {
  return Object.values(state.campaigns).sort((a, b) => b.lastPlayed - a.lastPlayed);
}

// What to call a campaign in a sentence. A party made before campaigns had names
// has only its code, and the code is a perfectly good name for it.
function campaignDisplayName(code) {
  const c = state.campaigns[code];
  if (c && c.name) return c.name;
  if (state.party.code === code && state.party.campaignName) return state.party.campaignName;
  return 'campaign ' + code;
}

function rememberCampaign(patch) {
  const code = String(patch.code ?? '').toUpperCase();
  if (!code) return;
  state.campaigns[code] = normalizeCampaign({ ...state.campaigns[code], ...patch, code }, code);
  debouncedSync();
  renderHomeScreen();
}

function forgetCampaign(code) {
  if (!code || !state.campaigns[code]) return;
  delete state.campaigns[code];
  debouncedSync();
  renderHomeScreen();
}

// The two refreshes, called from party.js's subscriptions. Both are no-ops for a
// campaign we hold no bookmark for — a GM looking at a party they joined by code
// on someone else's machine should not have one minted behind their back.
//
// Neither calls `debouncedSync()`: these fire on every roster update, and a save
// per snapshot to cache a head count would be a great deal of writing for a
// number nobody is waiting on. The next real edit carries them.
function noteCampaignMeta(code, meta) {
  const entry = state.campaigns[code];
  if (!entry || !meta) return;
  entry.name = String(meta.name ?? entry.name).slice(0, CAMPAIGN_NAME_MAX);
  entry.gmName = String(meta.gmName ?? entry.gmName);
  renderHomeScreen();
}

function noteCampaignRoster(code, players) {
  const entry = state.campaigns[code];
  if (!entry) return;
  entry.memberCount = Object.keys(players ?? {}).length;
  renderHomeScreen();
}

// A player switching characters from the roster page while seated at a table is
// changing which character sits in that seat — so the campaign remembers the new
// one. Called from `activateCharacter()`; the republish to the party roster is
// already handled by the `debouncedSync()` there.
function noteActiveCharacterForCampaign() {
  const { active, code, role } = state.party;
  if (!active || role !== 'player' || !state.campaigns[code]) return;
  state.campaigns[code].characterId = state.activeCharacterId;
}

// =============================================================================
// ENTERING AND LEAVING
// =============================================================================
// The one path in, from a card on the home screen. It asks the *party* what role
// we hold rather than trusting the bookmark: a GM signed in on a new browser, or
// a bookmark written by an older version, must still land in the right chair,
// and `meta.gmUid` is the only thing that actually knows.
async function enterCampaign(code) {
  if (!isSignedIn()) {
    requireAuth('Campaigns need an account, so your table knows who is who.', () => enterCampaign(code));
    return;
  }
  if (state.party.active) {
    if (state.party.code === code) { closeHomeScreen(); switchTab('party'); return; }
    if (!confirm('Leave ' + campaignDisplayName(state.party.code) + ' and go to ' +
                 campaignDisplayName(code) + '?')) return;
    leaveParty();
  }

  const meta = await fetchCampaignMeta(code);
  if (!meta) {
    if (confirm('Campaign ' + code + ' no longer exists.\n\nRemove it from your list?')) forgetCampaign(code);
    return;
  }

  const uid = ownPlayerId();
  const asGM = !!meta.gmUid && meta.gmUid === uid;

  // A player brings the character this campaign remembers. Switching to them
  // *before* the join is what makes the roster entry right the first time,
  // rather than publishing whoever happened to be on screen and correcting it.
  if (!asGM) {
    const wanted = state.campaigns[code]?.characterId;
    if (wanted && state.characters[wanted] && wanted !== state.activeCharacterId) activateCharacter(wanted);
  }

  const entered = asGM
    ? await enterCampaignAsGM(code, meta)
    : await enterCampaignAsPlayer(code, accountDisplayName() || state.character.name || 'Player', meta);
  if (!entered) return;

  rememberCampaign({
    code,
    name: meta.name ?? '',
    role: asGM ? 'gm' : 'player',
    characterId: asGM ? null : state.activeCharacterId,
    gmName: meta.gmName ?? '',
    lastPlayed: Date.now(),
  });

  closeHomeScreen();
}

// Resigning the seat, as against ending the session. Leave Party stops
// connecting; this stops belonging — the roster entry goes, so the GM's list
// stops carrying you and rejoining needs the code again.
//
// A GM's campaign is not theirs to resign from: with nobody running it the
// record is dead, so their version deletes it outright and says so.
async function leaveCampaign(code) {
  const entry = state.campaigns[code];
  if (!entry) return;
  const isGM = entry.role === 'gm';

  const warning = isGM
    ? 'Delete ' + campaignDisplayName(code) + '?\n\n' +
      'It is deleted for everyone: the roster, the shops and the code all go, and ' +
      'the players in it are dropped. Their own characters and inventories are ' +
      'untouched. This cannot be undone.'
    : 'Leave ' + campaignDisplayName(code) + '?\n\n' +
      'You give up your seat at this table. Your character and everything in your ' +
      'inventory stay yours — rejoining just needs the code again.';
  if (!confirm(warning)) return;

  if (state.party.active && state.party.code === code) leaveParty();

  if (firebaseDb) {
    const path = isGM ? 'parties/' + code : 'parties/' + code + '/players/' + ownPlayerId();
    try {
      await firebaseDb.ref(path).remove();
    } catch (e) {
      alert('Could not reach the campaign to leave it cleanly: ' + e.message +
            '\n\nIt has been taken off your list here.');
    }
  }

  forgetCampaign(code);
}

async function renameCampaign(code, name) {
  const entry = state.campaigns[code];
  if (!entry || entry.role !== 'gm' || !firebaseDb) return;
  try {
    await firebaseDb.ref('parties/' + code + '/meta').update({ name });
  } catch (e) {
    alert('Could not rename the campaign: ' + e.message);
    return;
  }
  rememberCampaign({ code, name });
}

// =============================================================================
// THE HOME SCREEN SECTION
// =============================================================================
// Above the character roster, because it is the larger question: *which table*
// comes before *which character*, and a player arriving for a session is
// reaching for the campaign, not for a card they would then have to remember to
// connect. The two sections are deliberately the same kind of thing to look at —
// a grid of cards under a ruled heading — so the page reads as one page.

const campaignGridEl = document.getElementById('campaign-card-grid');
const campaignNoteEl = document.getElementById('campaign-note');
const campaignMenuEl = document.getElementById('campaign-card-menu');

let openCampaignMenuCode = null;

function renderCampaignSection() {
  if (state.screen !== 'home') return;

  // Signed out there is nothing to list: a seat at a table is held by an account.
  // Saying so beats an empty grid — but the buttons stay live, because
  // `requireAuth()` is how every other gated entry point in this app behaves and
  // a disabled button would leave the note pointing at a door that cannot be
  // opened. Pressing one asks for the account and then does what was asked.
  const signedIn = isSignedIn();
  campaignNoteEl.classList.toggle('hidden', signedIn);
  if (!signedIn) {
    campaignNoteEl.textContent = state.auth.ready
      ? 'Sign in to play in a campaign. Your characters are yours either way — an ' +
        'account is only what lets a table tell one player from another.'
      : 'Checking your account…';
  }

  campaignGridEl.innerHTML = '';
  const list = signedIn ? campaignList() : [];

  if (!list.length) {
    if (signedIn) {
      const empty = document.createElement('p');
      empty.className = 'home-empty';
      empty.textContent = 'No campaigns yet. Create one to run a table, or join one with its code.';
      campaignGridEl.appendChild(empty);
    }
    return;
  }

  list.forEach(c => campaignGridEl.appendChild(campaignCard(c)));
}

function campaignCard(c) {
  const isCurrent = state.party.active && state.party.code === c.code;
  const isGM = c.role === 'gm';

  const card = document.createElement('div');
  card.className = 'char-card campaign-card selectable' + (isCurrent ? ' active' : '');
  card.dataset.campaignCode = c.code;

  const menuBtn = document.createElement('button');
  menuBtn.className = 'char-card-menu-btn';
  menuBtn.title = 'Campaign options';
  menuBtn.setAttribute('aria-label', 'Campaign options');
  menuBtn.appendChild(iconEl('dots'));
  menuBtn.addEventListener('click', e => {
    e.stopPropagation();
    toggleCampaignMenu(c.code, menuBtn);
  });
  card.appendChild(menuBtn);

  const nameEl = document.createElement('div');
  nameEl.className = 'char-card-name';
  nameEl.textContent = c.name || c.code;
  card.appendChild(nameEl);

  const roleEl = document.createElement('div');
  roleEl.className = 'campaign-card-role ' + c.role;
  roleEl.textContent = isGM ? 'Game Master' : 'Player';
  card.appendChild(roleEl);

  // Every row is drawn whether it is filled or not, for the reason the sheet's
  // identity block gives: a row that vanished would shuffle the others along and
  // leave the reader working out which one went.
  const playing = isGM
    ? '—'
    : (state.characters[c.characterId]?.character.name ?? 'Not chosen yet');
  [['Code', c.code, 'campaign-code-row'],
   ['GM', isGM ? 'You' : (c.gmName || '—'), ''],
   ['Playing', playing, '']].forEach(([label, value, cls]) => {
    const row = document.createElement('div');
    row.className = 'char-card-row' + (cls ? ' ' + cls : '');
    const k = document.createElement('span');
    k.className = 'char-card-key';
    k.textContent = label;
    const v = document.createElement('span');
    v.className = 'char-card-val';
    v.textContent = value;
    row.append(k, v);
    card.appendChild(row);
  });

  const foot = document.createElement('div');
  foot.className = 'char-card-foot';
  const n = c.memberCount;
  foot.textContent = n + ' player' + (n === 1 ? '' : 's') +
                     (c.lastPlayed ? ' · ' + describeLastPlayed(c.lastPlayed) : '');
  card.appendChild(foot);

  if (isCurrent) {
    const badge = document.createElement('span');
    badge.className = 'char-card-badge';
    badge.textContent = 'In session';
    card.appendChild(badge);
  }

  card.addEventListener('click', () => enterCampaign(c.code));
  return card;
}

// Coarse on purpose: "when did I last sit at this table" wants a shape, not a
// timestamp, and the list is already ordered by the real number.
function describeLastPlayed(ms) {
  const days = Math.floor((Date.now() - ms) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return days + ' days ago';
  if (days < 365) return Math.round(days / 30) + ' months ago';
  return 'over a year ago';
}

// =============================================================================
// THE ⋯ MENU
// =============================================================================
function toggleCampaignMenu(code, btn) {
  if (openCampaignMenuCode === code) { closeCampaignMenu(); return; }
  closeCardMenu(); // the character cards' menu, so only one is ever open
  openCampaignMenuCode = code;

  const isGM = state.campaigns[code]?.role === 'gm';
  document.getElementById('campaign-card-rename').classList.toggle('hidden', !isGM);
  document.getElementById('campaign-card-leave').textContent =
    isGM ? 'Delete Campaign' : 'Leave Campaign';

  const r = btn.getBoundingClientRect();
  campaignMenuEl.classList.remove('hidden'); // measurable only once shown
  const width = campaignMenuEl.offsetWidth;
  campaignMenuEl.style.top  = (r.bottom + 4) + 'px';
  campaignMenuEl.style.left = Math.max(4, Math.min(r.right - width, window.innerWidth - width - 4)) + 'px';
}

function closeCampaignMenu() {
  openCampaignMenuCode = null;
  campaignMenuEl.classList.add('hidden');
}

// =============================================================================
// THE CAMPAIGN MODAL
// =============================================================================
// One dialog, two jobs, exactly as the character modal is one dialog for three:
// creating a table and joining one are the same question asked from either side,
// and splitting them into two dialogs is how two dialogs come to disagree about
// what a campaign is.
let campaignModalMode = 'create'; // 'create' | 'join'

function openCampaignModal(mode = 'create') {
  setCampaignModalMode(mode);
  document.getElementById('campaign-name-input').value = '';
  document.getElementById('campaign-code-input').value = '';
  fillCampaignCharacterSelect();
  showModal('campaign-modal');
  setTimeout(() => {
    document.getElementById(campaignModalMode === 'join' ? 'campaign-code-input' : 'campaign-name-input').focus();
  }, 0);
}

function setCampaignModalMode(mode) {
  campaignModalMode = mode === 'join' ? 'join' : 'create';
  const join = campaignModalMode === 'join';
  document.querySelectorAll('.campaign-mode-btn').forEach(b =>
    b.classList.toggle('active', (b.dataset.mode === 'join') === join));
  document.getElementById('campaign-create-fields').classList.toggle('hidden', join);
  document.getElementById('campaign-join-fields').classList.toggle('hidden', !join);
  document.getElementById('campaign-confirm-btn').textContent = join ? 'Join Campaign' : 'Create Campaign';
}

// The character who will sit in the seat. A GM picks none, so this appears on
// the join form only.
function fillCampaignCharacterSelect() {
  const sel = document.getElementById('campaign-character-select');
  sel.innerHTML = '';
  characterList().forEach(slot => {
    const opt = document.createElement('option');
    opt.value = slot.character.id;
    opt.textContent = slot.character.name + ' · Level ' + slot.character.level;
    sel.appendChild(opt);
  });
  sel.value = state.activeCharacterId ?? '';
}

async function submitCampaignModal() {
  const btn = document.getElementById('campaign-confirm-btn');
  btn.disabled = true;
  try {
    if (campaignModalMode === 'create') await submitCampaignCreate();
    else await submitCampaignJoin();
  } finally {
    btn.disabled = false;
  }
}

async function submitCampaignCreate() {
  const name = document.getElementById('campaign-name-input').value.trim().slice(0, CAMPAIGN_NAME_MAX);
  if (!name) { alert('Give the campaign a name — it is what your players will see.'); return; }

  if (state.party.active) leaveParty();
  const code = await createCampaign(name);
  if (!code) return;

  rememberCampaign({
    code, name, role: 'gm', characterId: null,
    gmName: accountDisplayName() || 'Game Master',
    memberCount: 0, lastPlayed: Date.now(),
  });
  closeHomeScreen();
  alert(name + ' is ready.\n\nIts code is ' + code + ' — share that with your players.');
}

async function submitCampaignJoin() {
  const code = document.getElementById('campaign-code-input').value.trim().toUpperCase();
  if (code.length !== 6) { alert('A campaign code is 6 characters.'); return; }

  const charId = document.getElementById('campaign-character-select').value;
  if (!charId || !state.characters[charId]) { alert('Pick the character who plays in this campaign.'); return; }

  const meta = await fetchCampaignMeta(code);
  if (!meta) { alert('No campaign with that code. Check it and try again.'); return; }

  // Bookmark the seat *before* entering, so `enterCampaign()` finds the chosen
  // character where it looks for it rather than publishing whoever was on screen.
  rememberCampaign({
    code,
    name: meta.name ?? '',
    role: meta.gmUid === ownPlayerId() ? 'gm' : 'player',
    characterId: charId,
    gmName: meta.gmName ?? '',
    lastPlayed: Date.now(),
  });

  hideModal('campaign-modal');
  await enterCampaign(code);
}

// =============================================================================
// WIRING
// =============================================================================
document.getElementById('campaign-new-btn').addEventListener('click', () => {
  requireAuth('Creating a campaign needs an account, so your table knows who is running it.',
              () => openCampaignModal('create'));
});

document.getElementById('campaign-join-btn').addEventListener('click', () => {
  requireAuth('Joining a campaign needs an account, so your group can tell who is who.',
              () => openCampaignModal('join'));
});

document.querySelectorAll('.campaign-mode-btn').forEach(btn => {
  btn.addEventListener('click', () => setCampaignModalMode(btn.dataset.mode));
});

document.getElementById('campaign-confirm-btn').addEventListener('click', submitCampaignModal);

document.querySelectorAll('#campaign-modal input').forEach(input => {
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); submitCampaignModal(); }
  });
});

document.getElementById('campaign-card-rename').addEventListener('click', e => {
  e.stopPropagation();
  const code = openCampaignMenuCode;
  closeCampaignMenu();
  if (!code) return;
  const current = state.campaigns[code]?.name ?? '';
  const name = prompt('Campaign name', current);
  if (name === null) return;
  const trimmed = name.trim().slice(0, CAMPAIGN_NAME_MAX);
  if (trimmed && trimmed !== current) renameCampaign(code, trimmed);
});

document.getElementById('campaign-card-copy').addEventListener('click', e => {
  e.stopPropagation();
  const code = openCampaignMenuCode;
  closeCampaignMenu();
  if (code) navigator.clipboard.writeText(code).catch(() => {});
});

document.getElementById('campaign-card-leave').addEventListener('click', e => {
  e.stopPropagation();
  const code = openCampaignMenuCode;
  closeCampaignMenu();
  if (code) leaveCampaign(code);
});

document.addEventListener('click', e => {
  if (openCampaignMenuCode === null) return;
  if (campaignMenuEl.contains(e.target)) return;
  closeCampaignMenu();
});
