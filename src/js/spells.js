// =============================================================================
// SPELLS — spell slots and the spells a character's classes give access to
// =============================================================================
'use strict';

// Same shape as class-features.js / species-traits.js: two small registries —
// `data/spell-slots.json` (how many slots of each spell level a class grants,
// indexed by that class's OWN level) and `data/spells.json` (every spell this
// app knows, each tagged with the classes that can cast it) — and a section
// that draws them onto a third view of a character, alongside the inventory
// and the sheet. A character's classes are matched by name, exactly as
// class-features.js matches them; a class this app has no slot table for grants
// no spells at all, the same way an unknown class shows no features.
//
// The per-class combination here is a SUM across the character's classes, not
// the real multiclass spell-slot table the rules define (which blends caster
// levels before consulting a single shared table) — a deliberate
// simplification for a small, content-driven feature, not a claim to be exact
// for a heavily multiclassed spellcaster.
//
// The whole sheet can be turned off per character (`character.spellsEnabled`,
// default on), from Character Setup — see character-setup.js — for a
// character with no need of it.
//
// The Available Spells panel (in the sidebar's Spells tab) is not limited to
// the character's own classes the way Spell Slots and Spells Known are — a
// feat (Magic Initiate and the like) can grant a spell from a class with no
// levels in it at all, so its class checkboxes always list every class this
// app's spell data knows of, just unchecked by default for any the character
// doesn't actually have. See `spellbookClassRows()` / `spellbookAvailableSpells()`.

// =============================================================================
// LOADING THE REGISTRIES
// =============================================================================
let DEFAULT_SPELL_SLOTS = [];
let DEFAULT_SPELLS = [];

function loadDefaultSpellSlots() {
  try {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', 'data/spell-slots.json', false); // synchronous, like classes.json
    xhr.send();
    if (xhr.status !== 200) throw new Error(`HTTP ${xhr.status}`);
    const body = xhr.responseText.trim();
    if (body.startsWith('<')) throw new Error('not JSON'); // an unknown-path index page
    DEFAULT_SPELL_SLOTS = sanitizeSpellSlotClasses(JSON.parse(body).classes);
  } catch (e) {
    DEFAULT_SPELL_SLOTS = []; // not fatal — the sheet is usable with no slot table known
  }
}

function loadDefaultSpells() {
  try {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', 'data/spells.json', false);
    xhr.send();
    if (xhr.status !== 200) throw new Error(`HTTP ${xhr.status}`);
    const body = xhr.responseText.trim();
    if (body.startsWith('<')) throw new Error('not JSON');
    DEFAULT_SPELLS = sanitizeSpellList(JSON.parse(body).spells);
  } catch (e) {
    DEFAULT_SPELLS = [];
  }
}

function sanitizeSpellSlotClasses(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(c => {
    const name = String(c?.name ?? '').trim();
    if (!name) return null;
    const slotsByLevel = {};
    Object.entries(c?.slotsByLevel ?? {}).forEach(([level, slots]) => {
      const lvl = parseInt(level, 10);
      if (!Number.isFinite(lvl) || lvl < 1 || lvl > 20) return;
      if (!Array.isArray(slots)) return;
      slotsByLevel[lvl] = Array.from({ length: 9 }, (_, i) => Math.max(0, parseInt(slots[i], 10) || 0));
    });
    return Object.keys(slotsByLevel).length ? { name, slotsByLevel } : null;
  }).filter(Boolean);
}

function sanitizeSpellList(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(s => {
    const id = String(s?.id ?? '').trim();
    const name = String(s?.name ?? '').trim();
    const level = parseInt(s?.level, 10);
    if (!id || !name || !Number.isFinite(level)) return null;
    const classes = (Array.isArray(s?.classes) ? s.classes : [])
      .map(c => String(c).trim()).filter(Boolean);
    if (!classes.length) return null;
    return {
      id, name,
      level: Math.max(0, Math.min(9, level)),
      school: String(s?.school ?? '').trim(),
      castingTime: String(s?.castingTime ?? '').trim(),
      range: String(s?.range ?? '').trim(),
      components: String(s?.components ?? '').trim(),
      duration: String(s?.duration ?? '').trim(),
      classes,
      source: cleanSource(s?.source), // short book label, same helper class-features.js uses
      description: String(s?.description ?? ''),
    };
  }).filter(Boolean);
}

loadDefaultSpellSlots();
loadDefaultSpells();

// =============================================================================
// THE REGISTRIES
// =============================================================================
function allSpells() {
  return DEFAULT_SPELLS.slice();
}

// Trimmed, case-insensitive — the same free-text match class-features.js uses
// for `findClassByName()`, just against the slot table's own class list.
function findSpellSlotClass(name) {
  const key = String(name ?? '').trim().toLowerCase();
  if (!key) return null;
  return DEFAULT_SPELL_SLOTS.find(c => c.name.toLowerCase() === key) ?? null;
}

// The slots array [level1..level9] a class of the given level has, walking
// down to the nearest level actually present — the table above happens to be
// dense, but a hand-authored one need not be.
function spellSlotsForClass(className, level) {
  const def = findSpellSlotClass(className);
  if (!def) return null;
  const lvl = Math.max(1, Math.min(20, parseInt(level, 10) || 1));
  for (let l = lvl; l >= 1; l--) {
    if (def.slotsByLevel[l]) return def.slotsByLevel[l];
  }
  return [0, 0, 0, 0, 0, 0, 0, 0, 0];
}

// A character's classes that this app has a slot table for, each with its own
// slots and the highest spell level those slots reach (0 = cantrips only).
// Whether the app knows the character's OTHER classes is irrelevant here —
// same as `characterClassLevel()` reading one class at a time.
function spellcastingEntriesOf(character) {
  return classEntriesOf(character)
    .filter(e => findSpellSlotClass(e.name))
    .map(e => {
      const slots = spellSlotsForClass(e.name, e.level);
      let maxSpellLevel = 0;
      slots.forEach((n, i) => { if (n > 0) maxSpellLevel = i + 1; });
      return { name: e.name, level: e.level, slots, maxSpellLevel };
    });
}

// A simple elementwise sum across the character's spellcasting classes — see
// the file header for why this is not the rules' own multiclass table.
function combinedSpellSlots(entries) {
  const totals = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  entries.forEach(e => e.slots.forEach((n, i) => { totals[i] += n; }));
  return totals;
}

function classMatchesAny(className, names) {
  const key = className.trim().toLowerCase();
  return names.some(n => n.trim().toLowerCase() === key);
}

// Whether the sheet's own view is offered at all for this character — a
// per-character preference set in Character Setup, on by default so an older
// save (no field yet) still gets it.
function spellSheetEnabled(character) {
  return character?.spellsEnabled !== false;
}

// Whether a spell is on the character's own list, kept separately from
// availability: `spellbookAvailableSpells()` answers "could this character
// ever cast it", this answers "have they actually picked it" for the
// Available Spells panel's toggle and #spell-list's own filter.
function isSpellKnown(character, spellId) {
  return Array.isArray(character?.knownSpells) && character.knownSpells.includes(spellId);
}

// The panel's whole write path — a card's click, nothing else touches
// `knownSpells`. Guarded the way every other character edit is
// (`isReadOnly()`), since a picker card is a button, not an `<input>`
// `renderCharacterSheet()` can just disable.
function toggleKnownSpell(spellId) {
  if (isReadOnly()) return;
  const known = Array.isArray(state.character.knownSpells) ? state.character.knownSpells.slice() : [];
  const at = known.indexOf(spellId);
  if (at === -1) known.push(spellId); else known.splice(at, 1);
  state.character.knownSpells = known;
  renderSpellSheetContent(); // bypasses the signature gate — classes/level didn't change
  debouncedSync();
}

// =============================================================================
// THE AVAILABLE SPELLS PANEL — the pool, and its filter/sort preferences
// =============================================================================
// This browser's furniture, like item-sort.js's own key — a way of reading the
// spell list, not a fact about any character. Never saved or synced.
const SPELLBOOK_PREFS_KEY = 'dnd_inventory_spellbook';
const SPELLBOOK_SORT_MODES = ['class', 'school', 'all'];

function loadSpellbookPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(SPELLBOOK_PREFS_KEY));
    return {
      sortMode: SPELLBOOK_SORT_MODES.includes(raw?.sortMode) ? raw.sortMode : 'class',
      hiddenClasses: Array.isArray(raw?.hiddenClasses) ? raw.hiddenClasses.filter(x => typeof x === 'string') : [],
      shownExtraClasses: Array.isArray(raw?.shownExtraClasses) ? raw.shownExtraClasses.filter(x => typeof x === 'string') : [],
      hiddenSchools: Array.isArray(raw?.hiddenSchools) ? raw.hiddenSchools.filter(x => typeof x === 'string') : [],
    };
  } catch (e) {
    return { sortMode: 'class', hiddenClasses: [], shownExtraClasses: [], hiddenSchools: [] };
  }
}

let spellbookPrefs = loadSpellbookPrefs();

function saveSpellbookPrefs() {
  try { localStorage.setItem(SPELLBOOK_PREFS_KEY, JSON.stringify(spellbookPrefs)); } catch (e) { /* private mode */ }
}

// Every class this app's spell data knows of, alphabetically — deliberately
// not limited to the character's own classes. A feat (Magic Initiate and the
// like) can grant a spell from a class the character has no levels in at all,
// so the panel must be able to show any class's list on request.
function spellbookAllClassNames() {
  const names = new Set();
  allSpells().forEach(s => s.classes.forEach(c => names.add(c)));
  return [...names].sort((a, b) => a.localeCompare(b));
}

// The rows the panel offers: the character's own spellcasting classes first
// (their own class order, carrying their own `entry` for the level gate
// below), then every other class, alphabetically. `own` decides both that
// gate and which preference list a checkbox toggles.
function spellbookClassRows(entries) {
  const ownNames = new Set(entries.map(e => e.name));
  const extra = spellbookAllClassNames().filter(n => !ownNames.has(n));
  return entries.map(e => ({ name: e.name, own: true, entry: e }))
    .concat(extra.map(name => ({ name, own: false, entry: null })));
}

// An owned class defaults to shown — `hiddenClasses` is an opt-OUT list, same
// as `hiddenSchools`. Any other class defaults to hidden — `shownExtraClasses`
// is an opt-IN list — so "every class is an option, but only your own are
// checked to start" needs no first-run bookkeeping: an empty prefs object
// already means exactly that.
function spellbookClassChecked(row) {
  return row.own
    ? !spellbookPrefs.hiddenClasses.includes(row.name)
    : spellbookPrefs.shownExtraClasses.includes(row.name);
}

function setSpellbookClassChecked(row, checked) {
  const list = row.own ? spellbookPrefs.hiddenClasses : spellbookPrefs.shownExtraClasses;
  const member = row.own ? !checked : checked;
  const at = list.indexOf(row.name);
  if (member && at === -1) list.push(row.name);
  else if (!member && at !== -1) list.splice(at, 1);
  saveSpellbookPrefs();
  renderSpellSheetContent();
}

// Whether `row`'s class actually grants `spell` — the one reachability rule
// everything else in this section is built from. An owned class is gated by
// its own slots, same as ever; any other class has no level to gate it by, so
// a name match is reachable outright. Tag membership alone is *not* enough
// for an owned class past its own cap — a spell tagged with both an owned and
// an unrelated class (e.g. Misty Step, Wizard/Warlock) must not read as
// "granted by Wizard" for a Wizard too low-level to actually reach it, even
// though it's still reachable overall via the other tag.
function spellGrantsRow(spell, row) {
  if (!classMatchesAny(row.name, spell.classes)) return false;
  if (!row.own) return true;
  return spell.level === 0 || row.entry.maxSpellLevel >= spell.level;
}

// Every row among `classRows` that actually grants this spell — own classes
// first, in class order, extra classes after. A spell shared by two of them
// (e.g. Guidance for a Cleric/Druid) is listed under both, the same way a
// real spellbook would repeat it.
function spellGrantingClasses(spell, classRows) {
  return classRows.filter(r => spellGrantsRow(spell, r)).map(r => r.name);
}

// The panel's whole pool, independent of which checkboxes are currently on —
// those only decide what's *displayed* (`spellbookSections()`), not what's
// known. A spell reachable via any row at all (owned-and-in-range, or simply
// tagged with a class the character has no levels in) belongs in the pool;
// the checkbox, defaulting off for a class the character doesn't have, is
// what actually keeps it out of sight until asked for.
function spellbookAvailableSpells(classRows) {
  return allSpells()
    .filter(spell => spellGrantingClasses(spell, classRows).length > 0)
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
}

function spellbookAvailableSchools(available) {
  const schools = new Set(available.map(s => s.school || 'Other'));
  return [...schools].sort((a, b) => a.localeCompare(b));
}

// Groups `available` for the panel per `prefs`: by class (checked classes, in
// `classRows` order), by school (alphabetical), or `all` (one flat list) —
// sorted by level then name within every group either way. An unchecked class
// or school drops its spells from view entirely (never from `knownSpells`
// itself — see `renderSpellSheetContent()`). A spell surviving via more than
// one checked class is listed once per class group, but only once for
// school/all (a spell has one school, and `all` has no groups to repeat it
// into).
function spellbookSections(available, classRows, prefs) {
  const byLevelThenName = (a, b) => a.level - b.level || a.name.localeCompare(b.name);
  const enabledNames = new Set(classRows.filter(spellbookClassChecked).map(r => r.name));
  const isVisible = spell => {
    if (prefs.hiddenSchools.includes(spell.school || 'Other')) return false;
    return spellGrantingClasses(spell, classRows).some(c => enabledNames.has(c));
  };

  if (prefs.sortMode === 'all') {
    const spells = available.filter(isVisible).sort(byLevelThenName);
    return spells.length ? [{ heading: null, spells }] : [];
  }

  if (prefs.sortMode === 'school') {
    const bySchool = new Map();
    available.forEach(spell => {
      if (!isVisible(spell)) return;
      const school = spell.school || 'Other';
      if (!bySchool.has(school)) bySchool.set(school, []);
      bySchool.get(school).push(spell);
    });
    return [...bySchool.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([heading, spells]) => ({ heading, spells: spells.sort(byLevelThenName) }));
  }

  const byClass = new Map();
  classRows.forEach(row => { if (spellbookClassChecked(row)) byClass.set(row.name, []); });
  available.forEach(spell => {
    if (prefs.hiddenSchools.includes(spell.school || 'Other')) return;
    spellGrantingClasses(spell, classRows).forEach(cls => {
      if (byClass.has(cls)) byClass.get(cls).push(spell);
    });
  });
  return [...byClass.entries()]
    .filter(([, spells]) => spells.length)
    .map(([heading, spells]) => ({ heading, spells: spells.sort(byLevelThenName) }));
}

// The meta line on a picker card — whichever axis isn't already the group
// heading is the useful thing to print beside the spell's name; `all` has no
// heading at all, so it gets both.
function spellPickerMeta(spell, classRows, prefs) {
  const classes = spellGrantingClasses(spell, classRows);
  if (prefs.sortMode === 'school') return classes.join(', ') || (spell.school || '');
  if (prefs.sortMode === 'all') return [spell.school, classes.join(', ')].filter(Boolean).join(' · ');
  return spell.school || spellLevelLabel(spell.level);
}

function renderSpellbookSettings(classRows, available) {
  const classBox = document.getElementById('spellbook-class-filters');
  const schoolBox = document.getElementById('spellbook-school-filters');
  if (!classBox || !schoolBox) return;

  classBox.textContent = '';
  classRows.forEach(row => {
    classBox.appendChild(spellbookFilterCheckbox(
      row.name, spellbookClassChecked(row),
      checked => setSpellbookClassChecked(row, checked)));
  });

  schoolBox.textContent = '';
  spellbookAvailableSchools(available).forEach(school => {
    schoolBox.appendChild(spellbookFilterCheckbox(
      school, !spellbookPrefs.hiddenSchools.includes(school),
      checked => setSpellbookFilter('hiddenSchools', school, !checked)));
  });

  document.querySelectorAll('#spellbook-sort input[name="spellbook-sort"]').forEach(radio => {
    radio.checked = radio.value === spellbookPrefs.sortMode;
  });
}

function spellbookFilterCheckbox(label, checked, onChange) {
  const wrap = document.createElement('label');
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = checked;
  box.addEventListener('change', () => onChange(box.checked));
  wrap.append(box, document.createTextNode(label));
  return wrap;
}

function setSpellbookFilter(prefKey, name, hidden) {
  const list = spellbookPrefs[prefKey];
  const at = list.indexOf(name);
  if (hidden && at === -1) list.push(name);
  else if (!hidden && at !== -1) list.splice(at, 1);
  saveSpellbookPrefs();
  renderSpellSheetContent();
}

document.getElementById('spellbook-settings-btn').addEventListener('click', () => {
  document.getElementById('spellbook-settings').classList.toggle('hidden');
});

document.querySelectorAll('#spellbook-sort input[name="spellbook-sort"]').forEach(radio => {
  radio.addEventListener('change', () => {
    if (!radio.checked) return;
    spellbookPrefs.sortMode = SPELLBOOK_SORT_MODES.includes(radio.value) ? radio.value : 'class';
    saveSpellbookPrefs();
    renderSpellSheetContent();
  });
});

// =============================================================================
// THE SECTION
// =============================================================================
// `syncCharacterViewUI()` re-runs on every roster sync, but this view only
// changes with classes and levels — same guard as `classFeaturesSig`.
let spellSheetSig = null;

function spellSheetSignature() {
  const c = state.character || {};
  return classEntriesOf(c).map(e => `${e.name}:${e.level}`).join('␟');
}

function renderSpellSheet() {
  const sig = spellSheetSignature();
  if (sig === spellSheetSig) return;
  spellSheetSig = sig;
  renderSpellSheetContent();
}

// The actual draw, split out from the signature gate above so
// `toggleKnownSpell()` can force a repaint on every click — picking a spell
// changes nothing the signature watches (classes/level).
function renderSpellSheetContent() {
  const slotsBox = document.getElementById('spell-slots');
  const listBox = document.getElementById('spell-list');
  const pickerBox = document.getElementById('spellbook-list');
  if (!slotsBox || !listBox || !pickerBox) return;

  const character = state.character;
  const entries = spellcastingEntriesOf(character);

  slotsBox.textContent = '';
  listBox.textContent = '';
  pickerBox.textContent = '';

  if (!entries.length) {
    const names = classEntriesOf(character).map(e => e.name);
    const note = names.length
      ? `No known spellcasting class among ${names.map(n => `“${n}”`).join(', ')}.`
      : 'Add a class in Character Setup to see its spells.';
    listBox.appendChild(spellNote(note));
    pickerBox.appendChild(spellNote(note));
    renderSpellbookSettings([], []);
    return;
  }

  const totals = combinedSpellSlots(entries);
  if (totals.some(n => n > 0)) {
    totals.forEach((count, i) => { if (count > 0) slotsBox.appendChild(spellSlotTile(i + 1, count)); });
  } else {
    slotsBox.appendChild(spellNote('No spell slots yet — cantrips only.'));
  }

  const classRows = spellbookClassRows(entries);
  const available = spellbookAvailableSpells(classRows);
  renderSpellbookSettings(classRows, available);

  if (!available.length) {
    listBox.appendChild(spellNote('No spells known at this level yet.'));
    pickerBox.appendChild(spellNote('No spells available at this level yet.'));
    return;
  }

  const known = available.filter(s => isSpellKnown(character, s.id));
  if (!known.length) {
    listBox.appendChild(spellNote('Nothing picked yet — choose from Available Spells.'));
  } else {
    let lastLevel = null;
    known.forEach(spell => {
      if (spell.level !== lastLevel) {
        lastLevel = spell.level;
        listBox.appendChild(spellLevelHeading(spell.level));
      }
      listBox.appendChild(spellCard(spell));
    });
  }

  const readOnly = isReadOnly();
  const sections = spellbookSections(available, classRows, spellbookPrefs);
  if (!sections.length) {
    pickerBox.appendChild(spellNote('Nothing matches the current filters.'));
    return;
  }
  sections.forEach(({ heading, spells }) => {
    if (heading) pickerBox.appendChild(spellbookGroupHeading(heading));
    let lastLevel = null;
    spells.forEach(spell => {
      if (spell.level !== lastLevel) {
        lastLevel = spell.level;
        pickerBox.appendChild(spellLevelHeading(spell.level));
      }
      pickerBox.appendChild(spellPickerCard(
        spell, isSpellKnown(character, spell.id), readOnly,
        spellPickerMeta(spell, classRows, spellbookPrefs)));
    });
  });
}

function spellbookGroupHeading(text) {
  const h = document.createElement('h4');
  h.className = 'spellbook-group-heading';
  h.textContent = text;
  return h;
}

function spellLevelLabel(level) {
  if (level === 0) return 'Cantrips';
  const suffix = level === 1 ? 'st' : level === 2 ? 'nd' : level === 3 ? 'rd' : 'th';
  return `${level}${suffix} Level`;
}

function spellSlotTile(level, count) {
  const tile = document.createElement('div');
  tile.className = 'spell-slot-tile';

  const lvl = document.createElement('span');
  lvl.className = 'spell-slot-level';
  lvl.textContent = spellLevelLabel(level);

  const n = document.createElement('span');
  n.className = 'spell-slot-count';
  n.textContent = count;

  tile.append(lvl, n);
  return tile;
}

function spellLevelHeading(level) {
  const h = document.createElement('h4');
  h.className = 'spell-level-heading';
  h.textContent = spellLevelLabel(level);
  return h;
}

function spellCard(spell) {
  const card = document.createElement('article');
  card.className = 'spell-card';

  const head = document.createElement('div');
  head.className = 'spell-card-head';
  const name = document.createElement('h5');
  name.className = 'spell-name';
  name.textContent = spell.name;
  head.appendChild(name);
  const schoolText = [spell.school, spell.source].filter(Boolean).join(' · ');
  if (schoolText) {
    const school = document.createElement('span');
    school.className = 'spell-school';
    school.textContent = schoolText;
    head.appendChild(school);
  }

  const meta = document.createElement('div');
  meta.className = 'spell-meta';
  [spell.castingTime, spell.range, spell.components, spell.duration].filter(Boolean).forEach(text => {
    const span = document.createElement('span');
    span.className = 'spell-meta-item';
    span.textContent = text;
    meta.appendChild(span);
  });

  const desc = document.createElement('p');
  desc.className = 'spell-desc';
  desc.textContent = spell.description;

  card.append(head, meta, desc);
  return card;
}

// A row in the Available Spells panel — the whole card is the toggle, same as
// a Browse card starting a placement is its whole click. `metaText` is
// whichever axis isn't already the group heading (see `spellPickerMeta()`).
function spellPickerCard(spell, known, readOnly, metaText) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'spell-pick-card' + (known ? ' known' : '');
  card.disabled = readOnly;
  card.title = spell.description || spell.name;

  const dot = document.createElement('span');
  dot.className = 'spell-pick-dot';

  const name = document.createElement('span');
  name.className = 'spell-pick-name';
  name.textContent = spell.name;

  const meta = document.createElement('span');
  meta.className = 'spell-pick-meta';
  meta.textContent = metaText || '';

  card.append(dot, name, meta);
  card.addEventListener('click', () => toggleKnownSpell(spell.id));
  return card;
}

function spellNote(text) {
  const p = document.createElement('p');
  p.className = 'spell-note';
  p.textContent = text;
  return p;
}
