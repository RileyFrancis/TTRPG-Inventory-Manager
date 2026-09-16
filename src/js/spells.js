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

// Cantrips need no slot — knowing the class is enough. A leveled spell needs
// at least one of the character's matching classes to have reached a slot of
// that level.
function spellAvailableTo(spell, entries) {
  return entries.some(e => {
    if (!classMatchesAny(e.name, spell.classes)) return false;
    return spell.level === 0 || e.maxSpellLevel >= spell.level;
  });
}

// Every spell the character's known classes currently give access to, sorted
// by level then name. `entries` is `spellcastingEntriesOf(character)`, taken
// as a parameter so a caller that already has it (the section, below) need not
// walk the class list twice.
function spellsForCharacter(character, entries) {
  if (!entries.length) return [];
  return allSpells()
    .filter(s => spellAvailableTo(s, entries))
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
}

// Whether the sheet's own view is offered at all for this character — a
// per-character preference set in Character Setup, on by default so an older
// save (no field yet) still gets it.
function spellSheetEnabled(character) {
  return character?.spellsEnabled !== false;
}

// Whether a spell is on the character's own list, kept separately from
// availability: `spellAvailableTo()` answers "could this character ever cast
// it", this answers "have they actually picked it" for the Available Spells
// panel's toggle and #spell-list's own filter.
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
  const pickerBox = document.getElementById('spell-picker-list');
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
    return;
  }

  const totals = combinedSpellSlots(entries);
  if (totals.some(n => n > 0)) {
    totals.forEach((count, i) => { if (count > 0) slotsBox.appendChild(spellSlotTile(i + 1, count)); });
  } else {
    slotsBox.appendChild(spellNote('No spell slots yet — cantrips only.'));
  }

  const available = spellsForCharacter(character, entries);
  if (!available.length) {
    listBox.appendChild(spellNote('No spells known at this level yet.'));
    pickerBox.appendChild(spellNote('No spells known at this level yet.'));
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
  let pickerLastLevel = null;
  available.forEach(spell => {
    if (spell.level !== pickerLastLevel) {
      pickerLastLevel = spell.level;
      pickerBox.appendChild(spellLevelHeading(spell.level));
    }
    pickerBox.appendChild(spellPickerCard(spell, isSpellKnown(character, spell.id), readOnly));
  });
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
  if (spell.school) {
    const school = document.createElement('span');
    school.className = 'spell-school';
    school.textContent = spell.school;
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
// a Browse card starting a placement is its whole click.
function spellPickerCard(spell, known, readOnly) {
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
  meta.textContent = spell.school || spellLevelLabel(spell.level);

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
