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
// Directions are fixed per key and not user-flippable: rarity reads best-first
// (that is what "sort by rarity" means for loot), name and weight read
// ascending. A direction toggle would double the modes to say very little.

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
// a mode means adding a line here and nothing else.
const ITEM_SORTS = [
  { id: 'rarity', label: 'Rarity', keys: ['rarity', 'name', 'weight'] },
  { id: 'name',   label: 'Name',   keys: ['name', 'rarity', 'weight'] },
  { id: 'weight', label: 'Weight', keys: ['weight', 'rarity', 'name'] },
];

function getItemSort() {
  return ITEM_SORTS.find(s => s.id === state.itemSort) ?? ITEM_SORTS[0];
}

function loadItemSort() {
  try {
    const raw = localStorage.getItem(ITEM_SORT_KEY);
    if (raw && ITEM_SORTS.some(s => s.id === raw)) state.itemSort = raw;
  } catch (e) { /* storage disabled — the default stands */ }
  updateSortButton();
}

function setItemSort(id) {
  if (!ITEM_SORTS.some(s => s.id === id)) return;
  state.itemSort = id;
  try { localStorage.setItem(ITEM_SORT_KEY, id); } catch (e) { /* non-fatal */ }
  updateSortButton();
}

// Sorts in place and returns the same array, the way Array#sort does.
function sortItems(items) {
  const chain = getItemSort().keys.map(k => ITEM_SORT_KEYS[k]);
  return items.sort((a, b) => {
    for (const cmp of chain) {
      const d = cmp(a, b);
      if (d !== 0) return d;
    }
    return 0;
  });
}

// =============================================================================
// SORT MENU
// =============================================================================
// The options are built from ITEM_SORTS rather than written into index.html:
// three hand-written buttons would only give the constant somewhere to disagree.
const sortMenuEl = document.getElementById('sort-menu');
const sortBtnEl  = document.getElementById('sort-btn');

function updateSortButton() {
  sortBtnEl.textContent = '⇅ ' + getItemSort().label;
  sortBtnEl.title = `Sorted by ${getItemSort().label.toLowerCase()} — click to change`;
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

sortBtnEl.addEventListener('click', e => {
  e.stopPropagation(); // the document listener below would close it again
  if (sortMenuEl.classList.contains('hidden')) showSortMenu();
  else hideSortMenu();
});
document.addEventListener('click', hideSortMenu);
