// =============================================================================
// CHARACTER TABS — One tab per character, above the inventory
// =============================================================================
'use strict';

// The strip above the inventory holds one tab per character you can look at:
// your own, plus everyone else in the party. A tab is not a plain switch —
// clicking one opens a two-item menu, because every character has two views
// (their character sheet and their inventory) and the tab is how you choose.
//
// *Which* character is shown stays where it always lived, in
// `state.party.viewingPlayerId`, so these tabs and the sidebar's Party panel are
// two faces of one selection — switch from either and both follow. Only the
// sheet/inventory choice is new, in `state.view`.

const charTabsEl    = document.getElementById('character-tabs');
const charTabMenuEl = document.getElementById('char-tab-menu');

// 'own' is a key, not a player id: your own character is local state, not a row
// in the party roster, and it has to work with no party at all.
const OWN_TAB = 'own';

// Key of the tab whose menu is open, or null. Held across re-renders so a party
// sync landing between the click and the choice doesn't snap the menu shut.
let openTabMenuKey = null;

// =============================================================================
// THE TABS
// =============================================================================
function characterTabList() {
  const { active, role, players, playerId, playerName, viewingPlayerId } = state.party;

  if (!active) return [{ key: OWN_TAB, name: state.character.name, own: true, connected: true }];

  const tabs = [];

  // A GM has no character of their own, so they get no own-tab — only the
  // players. Everyone else leads with themselves.
  if (role === 'player') {
    // While viewing someone else, `state.character` is *theirs*; our own name
    // has to come from the roster copy we published.
    const ownName = viewingPlayerId === null
      ? state.character.name
      : (players[playerId]?.character?.name ?? playerName);
    tabs.push({ key: OWN_TAB, name: ownName, own: true, connected: true });
  }

  Object.entries(players ?? {}).forEach(([id, p]) => {
    if (role === 'player' && id === playerId) return; // already the own-tab
    tabs.push({ key: id, name: p.character?.name ?? p.name, own: false, connected: isPlayerOnline(p) });
  });

  return tabs;
}

// Null for a GM who has not picked a player yet — nobody is being shown.
function activeTabKey() {
  if (!state.party.active) return OWN_TAB;
  if (state.party.viewingPlayerId !== null) return state.party.viewingPlayerId;
  return state.party.role === 'gm' ? null : OWN_TAB;
}

function renderCharacterTabs() {
  const active = activeTabKey();
  charTabsEl.innerHTML = '';

  characterTabList().forEach(tab => {
    const btn = document.createElement('button');
    btn.className = 'char-tab' + (tab.key === active ? ' active' : '');
    btn.dataset.tabKey = tab.key;

    // Connection state matters for the other party members, never for yourself.
    if (state.party.active && !tab.own) {
      const dot = document.createElement('span');
      dot.className = 'party-dot ' + (tab.connected ? 'online' : 'offline');
      btn.appendChild(dot);
    }

    const name = document.createElement('span');
    name.className = 'char-tab-name';
    name.textContent = tab.name;
    btn.appendChild(name);

    const caret = document.createElement('span');
    caret.className = 'char-tab-caret';
    caret.textContent = '▾';
    btn.appendChild(caret);

    btn.addEventListener('click', e => {
      e.stopPropagation(); // the document listener below closes on outside clicks
      toggleCharacterTabMenu(tab.key, btn);
    });

    charTabsEl.appendChild(btn);
  });

  // Put an open menu back under its tab, or drop it if that tab is gone.
  if (openTabMenuKey !== null) {
    const btn = charTabsEl.querySelector(`[data-tab-key="${CSS.escape(openTabMenuKey)}"]`);
    if (btn) positionCharacterTabMenu(btn);
    else closeCharacterTabMenu();
  }

  // Another player's roll pops a speech bubble over their tab (src/js/dice.js).
  // The buttons above were just thrown away and rebuilt, so the bubbles are
  // re-aimed here rather than being left pointing at elements that are gone.
  renderTabBubbles();
}

// =============================================================================
// THE DROPDOWN
// =============================================================================
function toggleCharacterTabMenu(key, btn) {
  if (openTabMenuKey === key) { closeCharacterTabMenu(); return; }
  openTabMenuKey = key;
  updateCharacterTabMenuState();
  positionCharacterTabMenu(btn);
}

function positionCharacterTabMenu(btn) {
  const r = btn.getBoundingClientRect();
  charTabMenuEl.classList.remove('hidden'); // measurable only once shown
  const width = charTabMenuEl.offsetWidth;
  charTabMenuEl.style.top  = (r.bottom + 2) + 'px';
  // Clamped so the rightmost tab's menu can't hang off the window edge.
  charTabMenuEl.style.left = Math.max(4, Math.min(r.left, window.innerWidth - width - 4)) + 'px';
}

function closeCharacterTabMenu() {
  openTabMenuKey = null;
  charTabMenuEl.classList.add('hidden');
}

// The tick marks the view you are already on, which only means anything on the
// tab of the character currently being shown.
function updateCharacterTabMenuState() {
  const onShownCharacter = openTabMenuKey === activeTabKey();
  charTabMenuEl.querySelectorAll('.char-view-btn').forEach(b => {
    b.classList.toggle('active', onShownCharacter && b.dataset.view === state.view);
  });
}

charTabMenuEl.querySelectorAll('.char-view-btn').forEach(btn => {
  btn.addEventListener('click', e => {
    e.stopPropagation();
    const key = openTabMenuKey;
    closeCharacterTabMenu();
    if (key !== null) selectCharacterView(key, btn.dataset.view);
  });
});

document.addEventListener('click', e => {
  if (openTabMenuKey === null) return;
  if (charTabMenuEl.contains(e.target) || charTabsEl.contains(e.target)) return;
  closeCharacterTabMenu();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeCharacterTabMenu();
});

// =============================================================================
// SWITCHING
// =============================================================================
// Picking from a tab's menu can change both halves of the selection at once:
// whose character it is, and which of their two views to show.
function selectCharacterView(key, view) {
  if (key === OWN_TAB) {
    if (state.party.viewingPlayerId !== null) switchViewToOwn();
  } else if (state.party.viewingPlayerId !== key) {
    switchViewToPlayer(key);
  }
  setInventoryView(view);
}

// Three views now, and the third is the odd one out: the battle map is not a
// view *of a character*, it is where the party is standing. So it is never
// reached from a tab's menu — only from the corner button and from the Maps
// pane — and `selectCharacterView()` below never passes it.
const INVENTORY_VIEWS = ['inventory', 'sheet', 'map'];

function setInventoryView(view) {
  state.view = INVENTORY_VIEWS.includes(view) ? view : 'inventory';
  syncCharacterViewUI();
  updateViewingBanner(); // the banner names the view it is talking about
}

// A GM who hasn't picked a player has no character to show a sheet for.
function hasViewedCharacter() {
  return !(state.party.active && state.party.role === 'gm' && state.party.viewingPlayerId === null);
}

// The one entry point for "who or what we're looking at changed" — the party UI
// calls it too, so deselecting a player can't leave their sheet on screen.
function syncCharacterViewUI() {
  // The map answers to the party rather than to a character, so it survives a
  // GM having nobody selected — but not the map itself going away underneath
  // it, which is what a player being un-revealed looks like from here.
  const showMap = mapViewIsShowing();
  const showSheet = !showMap && state.view === 'sheet' && hasViewedCharacter();
  const panel = document.getElementById('inventory-panel');
  panel.classList.toggle('map-view', showMap);
  panel.classList.toggle('sheet-view', showSheet);
  // Arriving at the inventory is where a Strength typed on the sheet finally
  // resizes the grid — see the deferred resize in grid.js. This is the single
  // entry point for "what are we looking at changed", so it is the one place
  // that can know, and it costs nothing when nothing was edited.
  if (!showSheet && !showMap) rebuildGridIfSizeDirty();
  if (showSheet) renderCharacterSheet();
  // The canvas has no size until the panel is showing it, so the map is told
  // it is on screen from here rather than from whatever asked for it. Both
  // halves are called unconditionally — each is a no-op when nothing changed —
  // so no caller has to remember which way the swap went.
  if (showMap) onMapViewShown(); else onMapViewHidden();
  // The corner button is the way *in*, so it stands down once you are there.
  syncMapButton();
  renderCharacterTabs();
  // The sidebar's tabs answer the same question these do — Browse and Details
  // belong beside a grid of items, Chat and Dice beside a character sheet.
  syncSidebarTabs();
  // The left panel's tabs follow the same selection: a GM with nobody picked has
  // no equipment to show, and deselecting must not leave a player's slots up.
  syncLeftPanel();
}

// renderCharacterSheet() lives in character-sheet.js — the sheet is a page of
// its own now, not the two lines this file used to draw.

// =============================================================================
// KEYBOARD SHORTCUTS
// =============================================================================
// The two halves of the selection get a key each: Tab flips between the two
// views of whoever is shown, Shift+Tab walks to the next character. The number
// keys are that same walk by absolute position — 1 is the leftmost tab — so any
// character in a small party is one keypress away.

// Off while typing, while a modal is up, and mid-drag: switching character with
// an item in the air would strand it, since a dragged item is out of the grid
// until pointerup.
function characterShortcutsAllowed(e) {
  if (e.ctrlKey || e.altKey || e.metaKey) return false;
  const t = e.target;
  if (t && t.matches && t.matches('input, textarea, select')) return false;
  if (t && t.isContentEditable) return false;
  if (document.querySelector('.modal:not(.hidden)')) return false;
  if (state.screen !== 'app') return false; // the home screen is a page, not the tabs
  return state.mode === 'idle';
}

function toggleInventoryView() {
  if (!hasViewedCharacter()) return; // a GM with nobody picked has no sheet to show
  // From the map, this key means "back to the character" rather than "the other
  // page of them": the map is not one of the two pages it flips between, and
  // landing on the sheet from a board would be an arbitrary choice of which.
  if (state.view === 'map') { setInventoryView('inventory'); return; }
  setInventoryView(state.view === 'sheet' ? 'inventory' : 'sheet');
}

// Keeps the current view: this half of the selection is about *who*, not about
// which of their two pages you are reading. Asking for a character while the
// board is up is asking to leave the board, though — the map is nobody's page.
function showCharacterAt(index) {
  const tab = characterTabList()[index];
  if (tab) selectCharacterView(tab.key, state.view === 'map' ? 'inventory' : state.view);
}

function cycleCharacter(step) {
  const tabs = characterTabList();
  if (!tabs.length) return;
  // A GM who has picked nobody has no active tab, so findIndex gives -1 and the
  // first step lands on the leftmost player — which is what they want anyway.
  const current = tabs.findIndex(t => t.key === activeTabKey());
  const next = (((current + step) % tabs.length) + tabs.length) % tabs.length;
  showCharacterAt(next);
}

document.addEventListener('keydown', e => {
  if (!characterShortcutsAllowed(e)) return;

  if (e.key === 'Tab') {
    e.preventDefault(); // a view switch, not focus movement
    closeCharacterTabMenu();
    if (e.shiftKey) cycleCharacter(1);
    else toggleInventoryView();
    return;
  }

  if (e.shiftKey) return;
  if (e.key.length === 1 && e.key >= '1' && e.key <= '9') {
    closeCharacterTabMenu();
    showCharacterAt(Number(e.key) - 1);
  }
});
