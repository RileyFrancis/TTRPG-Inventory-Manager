// =============================================================================
// CLASS FEATURES — what a character's class gives them, and the sheet's section
// =============================================================================
'use strict';

// The sheet reads `state.character.classes` (names, as typed) and `level`, and
// shows what those classes hand out. Three things live here: the **registry**
// (where a class definition comes from), the **section** that draws it, and the
// **unlocks** a feature can carry — parts of the sheet that stay hidden until
// the feature that grants them is owned.
//
// **The class data itself is not in this file.** It is `data/classes.json`,
// read the same way `data/items.csv` is, for the same reason: it is content,
// not code, and a release that adds a class should not be a code change. That
// file is also exactly the shape a user-authored class will take — data only,
// no behaviour — so the editor that eventually writes one has nothing new to
// learn.
//
// **The registry is the seam custom classes come through.** Nothing outside
// this file may reach into `DEFAULT_CLASSES`: everything goes through
// `allClasses()` and `findClassByName()`. When custom classes land they become
// one more source inside `allClasses()` and every caller gets them for free —
// the same shape `state.db` has, where `DEFAULT_ITEMS` are re-hydrated each boot
// and only the customs are saved.
//
// **Classes are matched by name, not by id**, because `classes` is a free-text
// field the player types ("Fighter, Rogue"). A name that matches nothing is not
// an error — it is a class this app has not been taught yet, and the section
// says so rather than going blank.
//
// **Levels are the character's total, not per-class.** The app tracks one
// `level`, so a multiclassed character is shown every listed class's features
// up to that level. That is wrong by the rules and right for what this app
// knows; when per-class levels exist, `characterClassLevel()` is the one place
// that has to learn about them.
//
// **Subclasses are a class in miniature** — `data/classes.json` nests them
// under `subclasses: [{ id, name, source, features }]`. The character has one
// free-text `subclass` field (like `classes`), matched against the subclasses
// of whichever class they hold; a match folds that subclass's features into
// the same list, gated by the same total level and tagged with the subclass
// name. `data-unlocked-by="subclass"` already hides the field itself until an
// owned feature grants it.
//
// **`source`** is a short book label ("PHB") carried by a class and,
// separately, by each subclass. The section shows it as a quiet caption above
// the cards; absent, it says nothing.

// =============================================================================
// LOADING THE CLASSES
// =============================================================================
// Synchronous, like `loadDefaultItems()`: it is content the app is expected to
// have, and a blocking read keeps every caller from having to cope with a
// half-loaded registry. It is also why the app needs an HTTP server rather than
// `file://`, and why the path is relative to the *document* rather than to this
// script.
let DEFAULT_CLASSES = [];

function loadDefaultClasses() {
  try {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', 'data/classes.json', false); // synchronous
    xhr.send();
    if (xhr.status !== 200) throw new Error(`HTTP ${xhr.status}`);
    // A host that answers unknown paths with its index page would otherwise
    // "find" a class list made of HTML — the same guard firebase-config.js uses.
    const body = xhr.responseText.trim();
    if (body.startsWith('<')) throw new Error('not JSON');
    DEFAULT_CLASSES = sanitizeClassList(JSON.parse(body).classes);
  } catch (e) {
    // Not fatal. The sheet is perfectly usable with no classes known — the
    // section simply says it has never heard of whatever was typed.
    DEFAULT_CLASSES = [];
  }
}

// Whatever came out of the file, reduced to the shape the rest of this file
// promises. A class with no usable features is dropped rather than left to
// render as an empty heading.
function sanitizeClassList(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(c => {
    const id = String(c?.id ?? '').trim();
    const name = String(c?.name ?? '').trim();
    if (!id || !name) return null;
    const features = (Array.isArray(c.features) ? c.features : [])
      .map(f => sanitizeFeature(f))
      .filter(Boolean);
    return features.length
      ? { id, name, source: cleanSource(c.source),
          subclasses: sanitizeSubclassList(c.subclasses), features }
      : null;
  }).filter(Boolean);
}

// A subclass is a class in miniature: an id, a name, its own `source`, and a
// list of features gated by the character's total level exactly as the class's
// own are. It carries no `subclasses` of its own. One with no usable features
// is dropped, like a class.
function sanitizeSubclassList(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(s => {
    const id = String(s?.id ?? '').trim();
    const name = String(s?.name ?? '').trim();
    if (!id || !name) return null;
    const features = (Array.isArray(s.features) ? s.features : [])
      .map(f => sanitizeFeature(f))
      .filter(Boolean);
    return features.length
      ? { id, name, source: cleanSource(s.source), features }
      : null;
  }).filter(Boolean);
}

// Source material — a short label like "PHB", free text and trimmed. Absent
// reads as "" and the section simply says nothing about where a class is from.
function cleanSource(raw) {
  return String(raw ?? '').trim().slice(0, 40);
}

function sanitizeFeature(f) {
  const id = String(f?.id ?? '').trim();
  const name = String(f?.name ?? '').trim();
  const level = parseInt(f?.level, 10);
  if (!id || !name || !Number.isFinite(level)) return null;
  return {
    id, name,
    level: Math.max(1, Math.min(20, level)),
    description: normalizeDescription(f?.description),
    unlocks: normalizeUnlocks(f?.unlocks),
  };
}

// One key or several, always read back as an array — so the JSON can say either
// and nothing downstream has to check which.
function normalizeUnlocks(raw) {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list.map(k => String(k).trim()).filter(Boolean);
}

// **A description is Markdown**, rendered by markdown.js exactly as a backstory
// is — so a feature can bold the name of a mechanic and list what it grants
// rather than running it all together in one sentence.
//
// JSON has no multi-line string, and a bulleted feature written as one
// `"...\n- one\n- two"` line is unreadable in the file it has to be edited in.
// So an **array is accepted**, which is the convention `data/classes.json`
// already uses for its own `_comment` block. Shared with species-traits.js,
// whose traits are the same kind of thing.
//
// **An entry is a block, not a line.** Blocks are separated by a blank line,
// so a paragraph is one entry and nothing has to type `""` between them:
//
//     [ "Enter a Rage as a Bonus Action.",     ->  <p>Enter a Rage…</p>
//       "- **Damage Resistance.** …",          ->  <ul><li>…</li>
//       "- **Rage Damage.** …",                ->      <li>…</li></ul>
//       "It lasts until your next turn." ]     ->  <p>It lasts…</p>
//
// **Except a list item, which joins to the line above it.** A blank line
// between two bullets does not make a longer list — `collectListItems()` stops
// at it, so they come out as two separate one-item lists with a gap between.
// Nobody writing `- a` and `- b` on two entries means that, so the one case
// where the blank line would be wrong is the one case it is not inserted.
// `MD_LIST_RE` is markdown.js's own test, borrowed rather than copied, so what
// counts as a list line here cannot drift from what the parser does with it.
//
// **A nested array is one block whose lines are kept together**, for the two
// things that need consecutive lines and are not lists: a hand-written
// `<table>` (the raw-HTML branch reads to the next blank line) and a stanza
// wanting hard breaks mid-paragraph.
function normalizeDescription(raw) {
  if (!Array.isArray(raw)) return String(raw ?? '');

  const blocks = raw.map(b => Array.isArray(b)
    ? b.map(line => String(line ?? '')).join('\n')
    : String(b ?? ''));

  return blocks.reduce((acc, block, i) => {
    if (i === 0) return block;
    const prevLine = acc.slice(acc.lastIndexOf('\n') + 1);
    const thisLine = block.slice(0, block.indexOf('\n') + 1 || undefined);
    const runOn = MD_LIST_RE.test(prevLine) && MD_LIST_RE.test(thisLine);
    return acc + (runOn ? '\n' : '\n\n') + block;
  }, '');
}

loadDefaultClasses();

// =============================================================================
// THE REGISTRY
// =============================================================================
// Every class the app knows. The single seam custom classes will come through:
// add the player's own definitions here and the section, the lookup and the
// unlocks all follow.
function allClasses() {
  return DEFAULT_CLASSES.slice();
}

// Names are typed by hand, so match loosely — trimmed and case-insensitive.
// Ids are matched too, so a stored id keeps working if the display name is
// ever edited.
function findClassByName(name) {
  const key = String(name ?? '').trim().toLowerCase();
  if (!key) return null;
  return allClasses().find(c => c.name.toLowerCase() === key || c.id === key) ?? null;
}

// A character has one free-text `subclass` field, like `classes` — matched
// against the subclasses of whichever class they hold. Loose match on name or
// id, as everywhere else. A name matching nothing is not an error: the app has
// simply not been taught that subclass, and its features do not appear.
function findSubclassByName(classDef, name) {
  const key = String(name ?? '').trim().toLowerCase();
  if (!key || !classDef) return null;
  return (classDef.subclasses ?? []).find(
    s => s.name.toLowerCase() === key || s.id === key) ?? null;
}

// The level a character counts as, for a given class. One place, so per-class
// levels have somewhere to land later — see the file header.
function characterClassLevel(character, _classDef) {
  return Math.max(1, Math.min(20, parseInt(character?.level, 10) || 1));
}

// Everything the character's classes offer, in the order the section shows it:
// by level, then by class, then as written. `owned` is what the level gate
// decides — the list is always complete, and the *section* chooses what to draw.
function classFeaturesFor(character) {
  const names = character?.classes ?? [];
  const multi = names.length > 1;
  const rows = [];

  names.forEach(name => {
    const def = findClassByName(name);
    if (!def) return;
    const level = characterClassLevel(character, def);

    def.features.forEach((f, i) => rows.push({
      ...f,
      className: def.name,
      showClass: multi,     // one class needs no label on every card
      sub: 0,               // base features sort before the subclass's
      order: i,
      owned: f.level <= level,
    }));

    // The chosen subclass's own features, if this class recognises what the
    // character typed. They interleave with the base features by level but
    // sort after them at a shared level, and always carry the subclass name.
    const subclass = findSubclassByName(def, character?.subclass);
    if (subclass) {
      subclass.features.forEach((f, i) => rows.push({
        ...f,
        className: def.name,
        subclassName: subclass.name,
        showClass: multi,
        sub: 1,
        order: i,
        owned: f.level <= level,
      }));
    }
  });

  rows.sort((a, b) =>
    a.level - b.level ||
    a.className.localeCompare(b.className) ||
    a.sub - b.sub ||
    a.order - b.order);
  return rows;
}

// The names typed that this app has never heard of. Not an error — the section
// says so, and it is the honest answer until custom classes exist.
function unknownClassNames(character) {
  return (character?.classes ?? []).filter(n => !findClassByName(n));
}

// =============================================================================
// UNLOCKS — sheet parts that arrive with a feature
// =============================================================================
// A feature may name parts of the sheet it brings with it (`"unlocks":
// ["subclass"]`). The sheet marks those parts `data-unlocked-by="subclass"`,
// and they stay hidden until some *owned* feature names them. Today that is the
// Subclass field, which is meaningless on a level-1 character.
//
// The key is a plain string shared between the JSON and the markup, rather than
// a selector or an element id, so the data never has to know how the sheet is
// built — a part can move, or be drawn by something else entirely, and the
// class file is unaffected.
function unlockedSheetKeys(character) {
  const keys = new Set();
  classFeaturesFor(character).forEach(row => {
    if (row.owned) row.unlocks.forEach(k => keys.add(k));
  });
  return keys;
}

// **A class the app does not know disables the whole mechanism.** If someone
// plays a Bard, this file has no idea what a Bard gets or when, so hiding their
// Subclass field would be an invention — and one that looks like the app has
// eaten a box they were using. Unlocks only speak when every class listed is
// one we can actually reason about.
function featureUnlocksAreAuthoritative(character) {
  const names = character?.classes ?? [];
  return names.length > 0 && names.every(n => !!findClassByName(n));
}

// **Both registries feed one key space.** A species trait may unlock a part of
// the sheet exactly as a class feature may, so the keys are unioned here and the
// markup never has to know which kind of thing granted it. This function owns
// the mechanism; species-traits.js supplies its half through the two functions
// called below.
//
// The *authoritative* test is an AND, and has to be: if either half of what the
// character is cannot be reasoned about, a hidden box might be one they should
// have, and hiding it reads as the app having eaten a field they were using.
function applyFeatureUnlocks() {
  const authoritative = featureUnlocksAreAuthoritative(state.character)
                     && speciesUnlocksAreAuthoritative(state.character);

  let keys = null;
  if (authoritative) {
    keys = unlockedSheetKeys(state.character);
    speciesUnlockKeys(state.character).forEach(k => keys.add(k));
  }

  document.querySelectorAll('#character-sheet [data-unlocked-by]').forEach(el => {
    const key = el.dataset.unlockedBy;
    el.classList.toggle('hidden', !!keys && !keys.has(key));
  });
}

// =============================================================================
// THE SECTION
// =============================================================================
// Session-only, and deliberately not persisted: which half of a list you are
// looking at is a glance, not a setting, and the useful default — what you
// actually have — is the one you want on opening the sheet.
let showLockedFeatures = false;

// Which cards are folded shut, for the same reason and by the same argument:
// reading a long section by collapsing what you have already read is a glance,
// not a property of the character. So it is a Set in memory — never in the save
// file, never synced, gone on reload — and every card opens expanded, which is
// the state that shows you what you have.
//
// **Keyed with the section's scope, not the bare id.** Class feature ids are
// bare words (`rage`) where species trait ids are prefixed (`dwarf-darkvision`),
// so the two files could collide on one, and a collision here would fold a card
// in one section because you folded an unrelated one in the other. Ids in this
// project are hand-written and the coin purse is the standing reminder of what
// assuming they are unique costs.
const collapsedFeatures = new Set();

function featureKey(row, scope) {
  return `${scope}:${row.id}`;
}

function toggleFeatureCollapsed(key) {
  if (!collapsedFeatures.delete(key)) collapsedFeatures.add(key);
  return !collapsedFeatures.has(key);   // the new expanded state
}

function renderClassFeatures() {
  const box = document.getElementById('sheet-features');
  const btn = document.getElementById('feature-toggle-locked');
  if (!box) return;

  applyFeatureUnlocks();
  populateSubclassOptions(state.character);

  const rows = classFeaturesFor(state.character);
  const locked = rows.filter(r => !r.owned).length;

  // Nothing to toggle when nothing is out of reach — a button that cannot
  // change what you see is noise.
  if (btn) {
    btn.classList.toggle('hidden', locked === 0);
    setIconLabel(btn, showLockedFeatures ? 'hide' : 'show',
      showLockedFeatures ? 'Hide locked' : `Show all (${locked})`);
    btn.title = showLockedFeatures
      ? 'Show only the features you have'
      : 'Also show features from levels you have not reached';
  }

  box.textContent = '';

  if (!rows.length) {
    box.appendChild(featureEmptyState(state.character));
    return;
  }

  rows.forEach(row => {
    if (!row.owned && !showLockedFeatures) return;
    box.appendChild(featureCard(row));
  });

  // Every feature is locked and the reader has chosen not to see them.
  if (!box.children.length) box.appendChild(featureNote('Nothing unlocked at this level yet.'));

  // A quiet citation under the cards — class and subclass book(s).
  const sources = classSourceSummary(state.character);
  if (sources) box.appendChild(featureSourceNote(sources));

  const unknown = unknownClassNames(state.character);
  if (unknown.length) {
    box.appendChild(featureNote(
      `No features known for ${unknown.map(n => `“${n}”`).join(', ')}.`));
  }
}

// The level rides the card's top-left corner rather than sitting inside it —
// the badge is what you scan the list by, so it breaks the edge to be read
// before the card it belongs to. `.feature-list` carries the padding that keeps
// the overhang from being clipped.
//
// **Shared with the species traits section**, which draws the same card from the
// same list shape (see species-traits.js). `opts.badge` is what it varies: a
// species grants almost everything at level 1, and a column of identical badges
// is noise where information should be. Class features always carry theirs.
function featureCard(row, opts = {}) {
  const withBadge = opts.badge !== false;
  const key = featureKey(row, opts.scope ?? 'class');
  const expanded = !collapsedFeatures.has(key);

  const card = document.createElement('article');
  card.className = 'feature-card' + (row.owned ? '' : ' locked')
                 + (withBadge ? '' : ' no-badge')
                 + (expanded ? '' : ' collapsed');
  card.dataset.featureKey = key;

  const level = document.createElement('span');
  level.className = 'feature-level';
  level.textContent = row.level;
  level.title = `Unlocked at level ${row.level}`;

  // **The name is a real `<button>` inside the heading**, which is the standard
  // disclosure pattern: the heading keeps its meaning for anything reading the
  // sheet's structure, and the button is a control that Tab reaches and Enter
  // and Space work on without a keydown handler of our own. Styled back to bare
  // text in the CSS, so the card looks exactly as it did before it could fold.
  //
  // Clicking anywhere on the card also toggles it — that is the delegated
  // listener at the bottom of this file, which this button's click reaches by
  // bubbling rather than by a second listener, so the two cannot double-fire.
  const name = document.createElement('h4');
  name.className = 'feature-name';

  const nameBtn = document.createElement('button');
  nameBtn.type = 'button';
  nameBtn.className = 'feature-name-btn';
  nameBtn.textContent = row.name;
  nameBtn.setAttribute('aria-expanded', String(expanded));
  name.appendChild(nameBtn);

  // The small right-aligned tag: the class name when multiclassed (one class
  // needs no label on every card), and the subclass name whenever a feature
  // comes from one — that earns saying, single class or not.
  const tagText = row.subclassName
    ? (row.showClass ? `${row.className} · ${row.subclassName}` : row.subclassName)
    : (row.showClass ? row.className : '');
  if (tagText) {
    const tag = document.createElement('span');
    tag.className = 'feature-class';
    tag.textContent = tagText;
    name.appendChild(tag);
  }

  // A `<div>`, not a `<p>`: the description is Markdown, and what comes back is
  // block-level — a paragraph cannot legally hold a list or a second paragraph,
  // and a browser would close it early and strand the rest outside the card.
  //
  // `renderMarkdownInto` is the *only* way markup may be built from a string
  // here — it sanitizes on the way in. That matters even though today's
  // descriptions are ours: a user-authored class will sync to Firebase and
  // render in the GM's browser exactly as a player's backstory does.
  const desc = document.createElement('div');
  desc.className = 'feature-desc';
  desc.id = 'fd-' + key.replace(/[^\w-]/g, '-');
  nameBtn.setAttribute('aria-controls', desc.id);
  renderMarkdownInto(desc, row.description);

  const text = document.createElement('div');
  text.className = 'feature-text';
  text.append(name, desc);

  if (withBadge) card.append(level, text);
  else card.append(text);
  return card;
}

function featureEmptyState(character) {
  const names = character?.classes ?? [];
  return featureNote(names.length
    ? `No features known for ${names.map(n => `“${n}”`).join(', ')}.`
    : 'Set a class in the Identity section to see its features.');
}

function featureNote(text) {
  const p = document.createElement('p');
  p.className = 'feature-note';
  p.textContent = text;
  return p;
}

// A quiet caption above the cards naming where each known class — and its
// chosen subclass — comes from. Built only from what carries a `source`, and
// skipped entirely when nothing does.
function classSourceSummary(character) {
  const parts = [];
  (character?.classes ?? []).forEach(name => {
    const def = findClassByName(name);
    if (!def) return;
    if (def.source) parts.push(`${def.name} — ${def.source}`);
    const subclass = findSubclassByName(def, character?.subclass);
    if (subclass?.source) parts.push(`${subclass.name} — ${subclass.source}`);
  });
  return parts.join(' · ');
}

function featureSourceNote(text) {
  const p = document.createElement('p');
  p.className = 'feature-sources';
  p.textContent = text;
  return p;
}

// Feeds the Subclass field's datalist with the subclasses of whatever classes
// the character holds — a hint, not a constraint: the field stays free text,
// exactly as the Class field is.
function populateSubclassOptions(character) {
  const dl = document.getElementById('subclass-options');
  if (!dl) return;
  const names = [];
  (character?.classes ?? []).forEach(name => {
    const def = findClassByName(name);
    (def?.subclasses ?? []).forEach(s => names.push(s.name));
  });
  dl.textContent = '';
  [...new Set(names)].forEach(n => {
    const opt = document.createElement('option');
    opt.value = n;
    dl.appendChild(opt);
  });
}

document.getElementById('feature-toggle-locked').addEventListener('click', () => {
  showLockedFeatures = !showLockedFeatures;
  renderClassFeatures();
});

// =============================================================================
// FOLDING A CARD SHUT
// =============================================================================
// **One listener per section, not one per card** — the same argument the sheet
// makes about its ~80 inputs, and these sections are rebuilt on every render, so
// per-card listeners would be re-attached each time. The containers themselves
// are static markup and outlive every rebuild, so a listener on them does not.
//
// Both sections are wired from here because `featureCard()` is here: the card is
// one kind of thing drawn off two registries, and a fold that worked in one
// section but not the other would be the two copies drifting that sharing the
// card exists to prevent.
//
// The toggle only flips classes and the aria state on the card that was hit. It
// deliberately does **not** re-render the section: a render rebuilds every card,
// which would throw away keyboard focus mid-click and cost a Markdown parse per
// feature to change one `display`.
function initFeatureFolding() {
  ['sheet-features', 'sheet-species-traits'].forEach(id => {
    const box = document.getElementById(id);
    if (box) box.addEventListener('click', onFeatureCardClick);
  });
}

function onFeatureCardClick(e) {
  const card = e.target.closest('.feature-card');
  if (!card) return;

  // A description is Markdown and may hold a link — and the section's own
  // controls sit in the title above it. Anything that is already a control
  // keeps its own click.
  if (e.target.closest('a, input, textarea, select, label')) return;
  if (e.target.closest('button') && !e.target.closest('.feature-name-btn')) return;

  // A click that ends a drag-select is the reader highlighting a passage to
  // copy, not asking for the card to shut under their cursor.
  const sel = window.getSelection();
  if (sel && !sel.isCollapsed && card.contains(sel.anchorNode)) return;

  const expanded = toggleFeatureCollapsed(card.dataset.featureKey);
  card.classList.toggle('collapsed', !expanded);
  const btn = card.querySelector('.feature-name-btn');
  if (btn) btn.setAttribute('aria-expanded', String(expanded));
}

initFeatureFolding();
