// =============================================================================
// SPECIES TRAITS — what a character's species gives them, and the sheet section
// =============================================================================
'use strict';

// The sheet reads `state.character.race` (a name, as typed) and `level`, and
// shows what that species hands out. This file is deliberately the same shape as
// class-features.js: a **registry** saying where a species definition comes
// from, and a **section** that draws it. Read that file's header first — the
// reasoning there applies here almost line for line, and where the two differ
// it is called out below.
//
// **The species data is not in this file.** It is `data/species.json`, read the
// same blocking way `data/items.csv` and `data/classes.json` are, for the same
// reason: it is content, not code, and a release that adds a species should not
// be a code change. That file is already the shape a user-authored species will
// take — data only, no behaviour.
//
// **The registry is the seam custom species come through.** Nothing outside this
// file may reach into `DEFAULT_SPECIES`: everything goes through `allSpecies()`
// and `findSpeciesByName()`. When custom species land they become one more
// source inside `allSpecies()` and every caller gets them for free.
//
// **A species is matched by name, not id**, because `race` is a free-text field
// the player types. A name that matches nothing is not an error — it is a
// species this app has not been taught yet, and the section says so by name
// rather than going blank.
//
// **One species, not a list.** `race` is a single field, where `classes` is a
// list — so there is no equivalent of the per-card class tag, and no sort by
// species. That is the whole of the difference in the model.

// =============================================================================
// LOADING THE SPECIES
// =============================================================================
let DEFAULT_SPECIES = [];

function loadDefaultSpecies() {
  try {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', 'data/species.json', false); // synchronous
    xhr.send();
    if (xhr.status !== 200) throw new Error(`HTTP ${xhr.status}`);
    // A host that answers unknown paths with its index page would otherwise
    // "find" a species list made of HTML — the same guard firebase-config.js
    // and class-features.js use.
    const body = xhr.responseText.trim();
    if (body.startsWith('<')) throw new Error('not JSON');
    DEFAULT_SPECIES = sanitizeSpeciesList(JSON.parse(body).species);
  } catch (e) {
    // Not fatal. The sheet is perfectly usable with no species known — the
    // section simply says it has never heard of whatever was typed.
    DEFAULT_SPECIES = [];
  }
}

// Whatever came out of the file, reduced to the shape the rest of this file
// promises. A species with no usable traits is dropped rather than left to
// render as an empty heading.
function sanitizeSpeciesList(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(s => {
    const id = String(s?.id ?? '').trim();
    const name = String(s?.name ?? '').trim();
    if (!id || !name) return null;
    const traits = (Array.isArray(s.traits) ? s.traits : [])
      .map(t => sanitizeTrait(t))
      .filter(Boolean);
    return traits.length ? { id, name, traits } : null;
  }).filter(Boolean);
}

// **`level` is optional here, where a class feature's is required.** Almost
// every species trait arrives at level 1, so writing `"level": 1` on each of
// them would be ceremony that only invites a typo; the few that scale say so.
function sanitizeTrait(t) {
  const id = String(t?.id ?? '').trim();
  const name = String(t?.name ?? '').trim();
  if (!id || !name) return null;
  const level = parseInt(t?.level, 10);
  return {
    id, name,
    level: Number.isFinite(level) ? Math.max(1, Math.min(20, level)) : 1,
    description: normalizeDescription(t?.description), // shared, as below
    unlocks: normalizeUnlocks(t?.unlocks),              // shared with class-features.js
  };
}

loadDefaultSpecies();

// =============================================================================
// THE REGISTRY
// =============================================================================
// Every species the app knows. The single seam custom species will come
// through: add the player's own definitions here and the section, the lookup
// and the unlocks all follow.
function allSpecies() {
  return DEFAULT_SPECIES.slice();
}

// Names are typed by hand, so match loosely — trimmed and case-insensitive.
// Ids are matched too, so a stored id keeps working if the display name is ever
// edited.
function findSpeciesByName(name) {
  const key = String(name ?? '').trim().toLowerCase();
  if (!key) return null;
  return allSpecies().find(s => s.name.toLowerCase() === key || s.id === key) ?? null;
}

// The level a character counts as, for a given species. One place, so a species
// that ever counts levels differently has somewhere to land.
function characterSpeciesLevel(character, _speciesDef) {
  return Math.max(1, Math.min(20, parseInt(character?.level, 10) || 1));
}

// Everything the character's species offers, in the order the section shows it:
// by level, then as written. `owned` is what the level gate decides — the list
// is always complete, and the *section* chooses what to draw.
function speciesTraitsFor(character) {
  const def = findSpeciesByName(character?.race);
  if (!def) return [];
  const level = characterSpeciesLevel(character, def);
  return def.traits
    .map((t, i) => ({ ...t, speciesName: def.name, order: i, owned: t.level <= level }))
    .sort((a, b) => a.level - b.level || a.order - b.order);
}

// The name typed that this app has never heard of, or '' when the field is
// blank or known. Not an error — the section says so, and it is the honest
// answer until custom species exist.
function unknownSpeciesName(character) {
  const typed = String(character?.race ?? '').trim();
  return typed && !findSpeciesByName(typed) ? typed : '';
}

// =============================================================================
// UNLOCKS
// =============================================================================
// A trait may name parts of the sheet it brings with it, exactly as a class
// feature may — same key space, same `data-unlocked-by` markup. The two are
// unioned by `applyFeatureUnlocks()` in class-features.js, which owns the
// mechanism; these two functions are this file's half of the answer.
function speciesUnlockKeys(character) {
  const keys = new Set();
  speciesTraitsFor(character).forEach(row => {
    if (row.owned) row.unlocks.forEach(k => keys.add(k));
  });
  return keys;
}

// **A species the app does not know disables the mechanism**, for the reason
// class-features.js spells out: hiding a box because of a species we cannot
// reason about would be an invention. A *blank* species is authoritative — it
// grants nothing and hides nothing, which is the honest reading of an empty
// field.
function speciesUnlocksAreAuthoritative(character) {
  return !unknownSpeciesName(character);
}

// =============================================================================
// THE SECTION
// =============================================================================
// Session-only, and deliberately not persisted — the same reasoning as the
// class features toggle: which half of a list you are looking at is a glance,
// not a setting.
let showLockedTraits = false;

// Like the class-features section: `renderCharacterSheet()` calls this on every
// keystroke and party sync, but it only changes with the character's species,
// level, and the show-locked toggle. Skip the rebuild when none of those moved.
let speciesTraitsSig = null;

function speciesTraitsSignature() {
  const c = state.character || {};
  return [c.race || '', c.level ?? '', showLockedTraits ? '1' : '0'].join('‖');
}

function renderSpeciesTraits() {
  const box = document.getElementById('sheet-species-traits');
  const btn = document.getElementById('trait-toggle-locked');
  if (!box) return;

  const sig = speciesTraitsSignature();
  if (sig === speciesTraitsSig) return;
  speciesTraitsSig = sig;

  const rows = speciesTraitsFor(state.character);
  const locked = rows.filter(r => !r.owned).length;

  // Nothing to toggle when nothing is out of reach — a button that cannot
  // change what you see is noise.
  if (btn) {
    btn.classList.toggle('hidden', locked === 0);
    setIconLabel(btn, showLockedTraits ? 'hide' : 'show',
      showLockedTraits ? 'Hide locked' : `Show all (${locked})`);
    btn.title = showLockedTraits
      ? 'Show only the traits you have'
      : 'Also show traits from levels you have not reached';
  }

  box.textContent = '';

  if (!rows.length) {
    box.appendChild(speciesEmptyState(state.character));
    return;
  }

  // **The level badge is drawn only when the levels differ.** For a class the
  // badge is what the list is scanned by; for a species almost everything
  // arrives at level 1, and a column of identical "1"s is noise standing where
  // information should be. So it earns its place per list rather than always.
  //
  // Judged on the rows actually **drawn**, not on every row there is: a badge
  // describes what you can see. So a level-1 Dragonborn — whose one later trait
  // is hidden — gets no badges, and they appear when the reader asks to see the
  // locked traits and the levels start to differ.
  const drawn = rows.filter(r => r.owned || showLockedTraits);
  const graded = drawn.some(r => r.level > 1);

  drawn.forEach(row => {
    box.appendChild(featureCard({ ...row, showClass: false },
      { badge: graded, scope: 'species' }));
  });

  // Every trait is locked and the reader has chosen not to see them.
  if (!box.children.length) box.appendChild(featureNote('Nothing unlocked at this level yet.'));
}

function speciesEmptyState(character) {
  const unknown = unknownSpeciesName(character);
  return featureNote(unknown
    ? `No traits known for “${unknown}”.`
    : 'Set a species in Character Setup to see its traits.');
}

document.getElementById('trait-toggle-locked').addEventListener('click', () => {
  showLockedTraits = !showLockedTraits;
  renderSpeciesTraits();
});
