// =============================================================================
// CHARACTERS — The account's roster of characters, and the home screen
// =============================================================================
'use strict';

// An account is a *player*, not a character: one person may run a fighter on
// Tuesdays and a wizard on Fridays, and both belong to them. So the save file
// holds a roster — `state.characters`, keyed by id — and exactly one of them is
// live in `state.character` / `state.instances` / `state.equipped` at a time.
//
// Live state stays where it always was rather than being read through the
// roster, because every render path, the grid, the drag machinery and the party
// sync already speak that language. The roster is the *store*; the live fields
// are the *working copy*. Two functions bridge them, and nothing else may:
//
//   commitActiveCharacter()       working copy → slot
//   loadActiveCharacterIntoLive() slot → working copy
//
// `commitActiveCharacter()` runs from `buildSavePayload()`, so every save — local
// or cloud — flushes the character on screen back into its slot first and the
// two can never disagree.
//
// Crucially it refuses when the working copy is *not* your own character: while
// you are looking at another party member's sheet, or while you are the GM (who
// has no character, and whose panel is the placeholder), `state` is somebody
// else's or nobody's, and writing it into your slot would overwrite a character
// with someone else's inventory.

// =============================================================================
// MODEL
// =============================================================================
function newCharacterId() {
  return 'c_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}

// Every field a card shows, in the shape the rest of the app expects. `id` is
// carried on the character itself so a slot and its meta can never be orphaned.
function blankCharacterMeta(name = 'Unnamed Hero') {
  return { id: newCharacterId(), name, strength: 10, level: 1, race: '', classes: [] };
}

// Old saves — and party data from an older client — carry only name + strength.
function normalizeCharacterMeta(meta, id) {
  const m = meta ?? {};
  return {
    id: id ?? m.id ?? newCharacterId(),
    name: String(m.name ?? 'Unnamed Hero'),
    strength: Math.max(1, Math.min(30, parseInt(m.strength, 10) || 10)),
    level: Math.max(1, Math.min(20, parseInt(m.level, 10) || 1)),
    race: String(m.race ?? ''),
    classes: Array.isArray(m.classes)
      ? m.classes.map(c => String(c).trim()).filter(Boolean)
      : String(m.classes ?? '').split(/[,/]/).map(c => c.trim()).filter(Boolean),
  };
}

function characterSlot(meta, rest = {}) {
  return {
    character:   normalizeCharacterMeta(meta),
    instances:   rest.instances   ?? {},
    equipped:    rest.equipped    ?? {},
    equipLayout: rest.equipLayout ?? [],
    db:          rest.db          ?? {},
  };
}

// Insertion order — the order they were created in, which is the order the cards
// appear in and the order the roster reads.
function characterList() {
  return Object.values(state.characters);
}

// The roster is never empty: deleting the last character hands back a fresh one
// rather than leaving the app with no character to be.
function ensureCharacter() {
  if (state.activeCharacterId && state.characters[state.activeCharacterId]) return;
  const first = characterList()[0];
  if (first) { state.activeCharacterId = first.character.id; loadActiveCharacterIntoLive(); return; }
  const slot = characterSlot(blankCharacterMeta());
  state.characters[slot.character.id] = slot;
  state.activeCharacterId = slot.character.id;
  loadActiveCharacterIntoLive();
}

// =============================================================================
// THE BRIDGE: LIVE STATE ⇄ SLOT
// =============================================================================
// True only when what is on screen is genuinely this account's active character.
// A GM has no character of their own, and while another member's sheet is up the
// working copy is theirs — in both cases the slot must be left alone.
function liveStateIsOwnCharacter() {
  if (!state.activeCharacterId || !state.characters[state.activeCharacterId]) return false;
  if (state.party.active && state.party.viewingPlayerId !== null) return false;
  if (state.party.active && state.party.role === 'gm') return false;
  return true;
}

function commitActiveCharacter() {
  if (!liveStateIsOwnCharacter()) return;
  state.characters[state.activeCharacterId] = {
    character:   { ...state.character, id: state.activeCharacterId },
    instances:   state.instances,
    equipped:    state.equipped,
    equipLayout: state.equipLayout,
    db:          getCustomDb(),
  };
}

// The custom item catalogue is per character, so it is rebuilt from the defaults
// each time rather than merged — otherwise a character would inherit the custom
// items of whoever was on screen before them.
function loadActiveCharacterIntoLive() {
  const slot = state.characters[state.activeCharacterId];
  if (!slot) return;
  state.character   = { ...slot.character };
  state.instances   = slot.instances   ? { ...slot.instances } : {};
  state.equipped    = slot.equipped    ? { ...slot.equipped }  : {};
  state.equipLayout = slot.equipLayout ? [...slot.equipLayout] : [];
  state.db = {};
  DEFAULT_ITEMS.forEach(t => { state.db[t.id] = t; });
  Object.assign(state.db, slot.db ?? {});
  // A character with no layout of its own — a new one, or a save from before
  // layouts were stored — goes through loadSlotConfig() rather than straight to
  // the defaults, so this browser's pre-layout `dnd_slot_config` is still
  // migrated. It returns early once a layout is set, so this cannot clobber one.
  if (!state.equipLayout.length) loadSlotConfig();
  syncNextId();
}

// Everything that has to be redrawn when the working copy is replaced wholesale.
function renderLiveCharacter() {
  rebuildGrid();
  renderItemList();
  renderEquipPanel();
  renderStash();
  updateWeightDisplay();
  syncCharacterViewUI();
}

function activateCharacter(id) {
  if (!state.characters[id]) return;
  if (state.activeCharacterId === id) return;
  cancelPlacing();
  commitActiveCharacter();   // whatever is on screen goes back to its own slot first
  state.activeCharacterId = id;
  loadActiveCharacterIntoLive();
  renderLiveCharacter();
  debouncedSync();           // saves, and republishes to the party roster
}

function createCharacter(meta) {
  const slot = characterSlot(meta);
  state.characters[slot.character.id] = slot;
  return slot.character.id;
}

function deleteCharacter(id) {
  if (!state.characters[id]) return;
  const wasActive = state.activeCharacterId === id;
  delete state.characters[id];
  if (wasActive) {
    state.activeCharacterId = null;
    ensureCharacter();       // falls back to another, or mints a fresh one
    renderLiveCharacter();
  }
  debouncedSync();
  renderHomeScreen();
}

// Writes a character's details back — to the slot, and to the working copy too
// when that character is the one on screen.
function updateCharacterMeta(id, meta) {
  const slot = state.characters[id];
  if (!slot) return;
  slot.character = normalizeCharacterMeta({ ...slot.character, ...meta }, id);
  if (state.activeCharacterId === id && liveStateIsOwnCharacter()) {
    const strengthChanged = state.character.strength !== slot.character.strength;
    state.character = { ...slot.character };
    if (strengthChanged) rebuildGrid();
    updateWeightDisplay();
    syncCharacterViewUI();
  }
  debouncedSync();
  renderHomeScreen();
}

// The header's Edit Character edits *the character on screen*, which is not
// always one of yours: a GM editing a player's Strength is editing the working
// copy, and `debouncedSync()` publishes that to the player's roster entry. When
// it is your own, the next save commits it back into the slot.
function applyMetaToLiveCharacter(meta) {
  const next = normalizeCharacterMeta({ ...state.character, ...meta }, state.character.id ?? null);
  const strengthChanged = state.character.strength !== next.strength;
  state.character = next;
  if (strengthChanged) rebuildGrid();
  updateWeightDisplay();
  syncCharacterViewUI(); // the tab and the sheet both carry the name
  debouncedSync();
  renderHomeScreen();
}

// =============================================================================
// SAVE PAYLOAD SHAPE
// =============================================================================
// Version 1 was a single character at the top level. It is still what an older
// browser or an older cloud save holds, so it is read here and folded into a
// one-character roster rather than migrated by hand anywhere else.
function normalizeSavePayload(data) {
  const characters = {};
  let activeId = null;

  if (data && data.characters && typeof data.characters === 'object') {
    Object.entries(data.characters).forEach(([id, raw]) => {
      const slot = characterSlot(normalizeCharacterMeta(raw?.character, id), raw ?? {});
      characters[slot.character.id] = slot;
    });
    activeId = data.activeCharacterId ?? null;
  } else if (data && (data.character || data.instances)) {
    const slot = characterSlot(normalizeCharacterMeta(data.character), data);
    characters[slot.character.id] = slot;
    activeId = slot.character.id;
  }

  if (!activeId || !characters[activeId]) activeId = Object.keys(characters)[0] ?? null;
  return { characters, activeCharacterId: activeId };
}

// What the cloud-conflict modal reads: one line about a whole save, whichever
// version it happens to be written in.
function describeSavePayload(data) {
  const { characters, activeCharacterId } = normalizeSavePayload(data);
  const list = Object.values(characters);
  if (!list.length) return 'Empty save';
  const active = characters[activeCharacterId] ?? list[0];
  const count = Object.keys(active.instances ?? {}).length;
  const others = list.length - 1;
  return `${active.character.name} — ${count} item${count === 1 ? '' : 's'}` +
         (others > 0 ? `\n+ ${others} other character${others === 1 ? '' : 's'}` : '');
}

// =============================================================================
// THE HOME SCREEN
// =============================================================================
// A page of its own rather than a panel: picking a character is what you do
// *before* there is an inventory to look at, and on a return visit it is the
// first thing a signed-in player sees.

const homeScreenEl = document.getElementById('home-screen');
const homeGridEl   = document.getElementById('home-card-grid');
const homeMenuEl   = document.getElementById('char-card-menu');

// Which card's ⋯ menu is open, or null.
let openCardMenuId = null;

// A GM is running the table, not playing a character — their panel is the
// placeholder and the party tabs are how they look at anyone. Their own roster
// is still theirs to edit, just not to step into from here.
function canSelectCharacter() {
  return !(state.party.active && state.party.role === 'gm');
}

function openHomeScreen() {
  // Somebody else's sheet must not still be the working copy when a card is
  // clicked — hand the view back before the roster becomes selectable.
  if (state.party.viewingPlayerId !== null) switchViewToOwn();
  state.screen = 'home';
  homeScreenEl.classList.remove('hidden');
  renderHomeScreen();
}

function closeHomeScreen() {
  state.screen = 'app';
  closeCardMenu();
  homeScreenEl.classList.add('hidden');
}

function describeCharacterClasses(c) {
  return (c.classes ?? []).join(' / ');
}

function renderHomeScreen() {
  if (state.screen !== 'home') return;

  const note = document.getElementById('home-note');
  if (canSelectCharacter()) {
    note.classList.add('hidden');
  } else {
    note.textContent = 'You are running this party as Game Master, so no character of ' +
                       'your own is in play. Your roster is still yours to edit — pick a ' +
                       'player from the character tabs to look at theirs.';
    note.classList.remove('hidden');
  }

  homeGridEl.innerHTML = '';
  const list = characterList();

  if (!list.length) {
    const empty = document.createElement('p');
    empty.className = 'home-empty';
    empty.textContent = 'No characters yet. Create one to get started.';
    homeGridEl.appendChild(empty);
    return;
  }

  list.forEach(slot => {
    const c = slot.character;
    const isActive = c.id === state.activeCharacterId;

    const card = document.createElement('div');
    card.className = 'char-card' + (isActive ? ' active' : '') +
                     (canSelectCharacter() ? ' selectable' : '');
    card.dataset.charId = c.id;

    const menuBtn = document.createElement('button');
    menuBtn.className = 'char-card-menu-btn';
    menuBtn.title = 'Edit or delete this character';
    menuBtn.setAttribute('aria-label', 'Character options');
    menuBtn.textContent = '⋯'; // ⋯
    menuBtn.addEventListener('click', e => {
      e.stopPropagation();
      toggleCardMenu(c.id, menuBtn);
    });
    card.appendChild(menuBtn);

    const nameEl = document.createElement('div');
    nameEl.className = 'char-card-name';
    nameEl.textContent = c.name;
    card.appendChild(nameEl);

    const levelEl = document.createElement('div');
    levelEl.className = 'char-card-level';
    levelEl.textContent = 'Level ' + c.level;
    card.appendChild(levelEl);

    [['Class', describeCharacterClasses(c) || '—'],
     ['Race',  c.race || '—']].forEach(([label, value]) => {
      const row = document.createElement('div');
      row.className = 'char-card-row';
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
    const count = Object.keys(slot.instances ?? {}).length;
    foot.textContent = `STR ${c.strength} · ${count} item${count === 1 ? '' : 's'}`;
    card.appendChild(foot);

    if (isActive) {
      const badge = document.createElement('span');
      badge.className = 'char-card-badge';
      badge.textContent = 'Active';
      card.appendChild(badge);
    }

    if (canSelectCharacter()) {
      card.addEventListener('click', () => {
        activateCharacter(c.id);
        closeHomeScreen();
      });
    }

    homeGridEl.appendChild(card);
  });
}

// =============================================================================
// THE ⋯ MENU
// =============================================================================
function toggleCardMenu(id, btn) {
  if (openCardMenuId === id) { closeCardMenu(); return; }
  openCardMenuId = id;
  const r = btn.getBoundingClientRect();
  homeMenuEl.classList.remove('hidden'); // measurable only once shown
  const width = homeMenuEl.offsetWidth;
  homeMenuEl.style.top  = (r.bottom + 4) + 'px';
  homeMenuEl.style.left = Math.max(4, Math.min(r.right - width, window.innerWidth - width - 4)) + 'px';
}

function closeCardMenu() {
  openCardMenuId = null;
  homeMenuEl.classList.add('hidden');
}

document.getElementById('char-card-edit').addEventListener('click', e => {
  e.stopPropagation();
  const id = openCardMenuId;
  closeCardMenu();
  if (id) openCharModal(id);
});

document.getElementById('char-card-delete').addEventListener('click', e => {
  e.stopPropagation();
  const id = openCardMenuId;
  closeCardMenu();
  if (!id) return;
  const slot = state.characters[id];
  if (!slot) return;
  const count = Object.keys(slot.instances ?? {}).length;
  if (!confirm(`Delete ${slot.character.name}?\n\n` +
               `Their ${count} item${count === 1 ? '' : 's'} and equipment go with them. ` +
               'This cannot be undone.')) return;
  deleteCharacter(id);
});

document.addEventListener('click', e => {
  if (openCardMenuId === null) return;
  if (homeMenuEl.contains(e.target)) return;
  closeCardMenu();
});

// =============================================================================
// WIRING
// =============================================================================
document.getElementById('home-btn').addEventListener('click', () => {
  if (state.screen === 'home') closeHomeScreen();
  else openHomeScreen();
});

document.getElementById('home-close-btn').addEventListener('click', closeHomeScreen);

document.getElementById('home-new-char-btn').addEventListener('click', () => {
  openCharModal(null, { isNew: true });
});

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || state.screen !== 'home') return;
  if (document.querySelector('.modal:not(.hidden)')) return; // the modal closes first
  if (openCardMenuId !== null) { closeCardMenu(); return; }
  closeHomeScreen();
});

// =============================================================================
// LANDING HERE ON A RETURN VISIT
// =============================================================================
// A signed-in player is a player with a roster, so the roster is where they
// start. Firebase restores its session asynchronously, though, and waiting for
// it would mean painting the inventory first and yanking it away a moment
// later — so the last known sign-in is remembered here, in this browser, purely
// to know which screen to open at boot. auth.js keeps it honest, clearing it the
// moment Firebase reports nobody is signed in.
const LAST_SIGNIN_KEY = 'dnd_inventory_last_signin';

function rememberSignedIn(signedIn) {
  try {
    if (signedIn) localStorage.setItem(LAST_SIGNIN_KEY, '1');
    else localStorage.removeItem(LAST_SIGNIN_KEY);
  } catch { /* private mode — the boot simply starts on the inventory */ }
}

function wasSignedInLastVisit() {
  try { return !!localStorage.getItem(LAST_SIGNIN_KEY); } catch { return false; }
}

function maybeOpenHomeAtBoot() {
  if (wasSignedInLastVisit()) openHomeScreen();
}
