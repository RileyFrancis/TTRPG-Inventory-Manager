// =============================================================================
// ITEM-SORT — The order the Browse list puts items in
// =============================================================================
'use strict';

// =============================================================================
// SORTING
// =============================================================================
// Like the folders, the sort order describes the *catalogue view*, not the
// character: it is this browser's own preference, so it lives in its own
// localStorage key and never enters the save file or party data.
//
// Every mode is a *chain* of keys, not a single one. Sorting purely by weight
// would scatter a folder's rarities at random inside each weight; naming the
// tie-breakers keeps the list stable and readable whichever mode is picked.
// The default — rarity, then name, then weight — is the order the list has
// always used, now with weight settling the last ties.
//
// Each key has one fixed direction — rarity best-first (that is what "sort by
// rarity" means for loot), name and weight ascending — and the reverse toggle
// negates the *whole chain* rather than just the leading key, so the list a
// reader sees is exactly the one they had, upside down. Flipping only the
// primary key would leave the tie-breakers running the other way and shuffle
// items that never moved.

const ITEM_SORT_KEY = 'dnd_inventory_sort';

// What a card claims to weigh — the same figure buildItemCard prints, so the
// order matches what the reader can see.
function itemSortWeight(t) {
  return isStackable(t) ? unitWeight(t) : shapeWeight(t.shape);
}

const ITEM_SORT_KEYS = {
  // Descending: an unknown rarity indexes -1 and falls to the bottom.
  rarity: (a, b) => RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity),
  name:   (a, b) => a.name.localeCompare(b.name),
  weight: (a, b) => itemSortWeight(a) - itemSortWeight(b),
};

// The first entry is the default, and the menu is built from this list — adding
// a mode means adding a line here and nothing else. `dir` names the two
// directions in that mode's own words: "reversed" is meaningless on a button,
// where "Worst first" says what the reader will actually get.
const ITEM_SORTS = [
  { id: 'rarity', label: 'Rarity', keys: ['rarity', 'name', 'weight'], dir: ['Best first', 'Worst first'] },
  { id: 'name',   label: 'Name',   keys: ['name', 'rarity', 'weight'], dir: ['A to Z', 'Z to A'] },
  { id: 'weight', label: 'Weight', keys: ['weight', 'rarity', 'name'], dir: ['Lightest first', 'Heaviest first'] },
];

function getItemSort() {
  return ITEM_SORTS.find(s => s.id === state.itemSort) ?? ITEM_SORTS[0];
}

// The key held a bare mode id before there was a direction to remember, so a
// value that is not JSON is read as that id and the direction defaults.
function loadItemSort() {
  try {
    const raw = localStorage.getItem(ITEM_SORT_KEY);
    if (raw) {
      const data = raw.startsWith('{') ? JSON.parse(raw) : { id: raw };
      if (ITEM_SORTS.some(s => s.id === data.id)) state.itemSort = data.id;
      state.itemSortReverse = !!data.reverse;
    }
  } catch (e) { /* storage disabled or corrupt — the defaults stand */ }
  updateSortButton();
}

function saveItemSort() {
  try {
    localStorage.setItem(ITEM_SORT_KEY, JSON.stringify({
      id: state.itemSort,
      reverse: state.itemSortReverse,
    }));
  } catch (e) { /* non-fatal */ }
}

function setItemSort(id) {
  if (!ITEM_SORTS.some(s => s.id === id)) return;
  state.itemSort = id;
  saveItemSort();
  updateSortButton();
}

function setItemSortReverse(reverse) {
  state.itemSortReverse = !!reverse;
  saveItemSort();
  updateSortButton();
}

// Sorts in place and returns the same array, the way Array#sort does.
function sortItems(items) {
  const chain = getItemSort().keys.map(k => ITEM_SORT_KEYS[k]);
  const sign = state.itemSortReverse ? -1 : 1;
  return items.sort((a, b) => {
    for (const cmp of chain) {
      const d = cmp(a, b);
      if (d !== 0) return d * sign;
    }
    return 0;
  });
}

// =============================================================================
// SORT MENU
// =============================================================================
// The options are built from ITEM_SORTS rather than written into index.html:
// three hand-written buttons would only give the constant somewhere to disagree.
const sortMenuEl   = document.getElementById('sort-menu');
const sortBtnEl    = document.getElementById('sort-btn');
const sortDirBtnEl = document.getElementById('sort-dir-btn');

// The arrow points the way the chain runs: down for the mode's own order, up
// for the reverse of it.
function updateSortButton() {
  const sort = getItemSort();
  sortBtnEl.textContent = '⇅ ' + sort.label;
  sortBtnEl.title = `Sorted by ${sort.label.toLowerCase()} — click to change`;
  sortDirBtnEl.textContent = state.itemSortReverse ? '↑' : '↓';
  sortDirBtnEl.title = `${sort.dir[state.itemSortReverse ? 1 : 0]} — click to reverse`;
}

function buildSortMenu() {
  sortMenuEl.innerHTML = '';
  ITEM_SORTS.forEach(sort => {
    const btn = document.createElement('button');
    const check = document.createElement('span');
    check.className = 'sort-check';
    check.textContent = sort.id === getItemSort().id ? '✓' : '';
    btn.appendChild(check);
    btn.appendChild(document.createTextNode(sort.label));
    btn.addEventListener('click', () => {
      hideSortMenu();
      setItemSort(sort.id);
      renderItemList();
    });
    sortMenuEl.appendChild(btn);
  });
}

function showSortMenu() {
  buildSortMenu();
  sortMenuEl.classList.remove('hidden');
  // Anchored under the button, and nudged back on screen if the panel has been
  // dragged narrow enough that the menu would hang off the right edge.
  const r = sortBtnEl.getBoundingClientRect();
  const w = sortMenuEl.offsetWidth;
  sortMenuEl.style.left = Math.max(4, Math.min(r.left, window.innerWidth - w - 4)) + 'px';
  sortMenuEl.style.top  = (r.bottom + 4) + 'px';
}

function hideSortMenu() {
  sortMenuEl.classList.add('hidden');
}

sortDirBtnEl.addEventListener('click', () => {
  setItemSortReverse(!state.itemSortReverse);
  renderItemList();
});

sortBtnEl.addEventListener('click', e => {
  e.stopPropagation(); // the document listener below would close it again
  if (sortMenuEl.classList.contains('hidden')) showSortMenu();
  else hideSortMenu();
});
document.addEventListener('click', hideSortMenu);
