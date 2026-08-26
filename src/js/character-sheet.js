// =============================================================================
// CHARACTER SHEET — Page one of the 2024 sheet, rendered from state.character
// =============================================================================
'use strict';

// The sheet is the *other* view of a character, opposite the inventory, and it
// reads and writes the same `state.character` the rest of the app already uses.
// Nothing here owns data of its own.
//
// **What is typed and what is worked out.** Anything the rules derive
// unambiguously from something else is derived and shown as text, never as a
// box: modifiers from scores, proficiency bonus from level, each skill and save
// from its ability plus its proficiency, passive Perception, initiative. What is
// left is what the rules cannot settle without knowing more than this app
// does — AC, speed, HP, hit dice — and those are plain inputs. The line is
// deliberate: a derived box that can be edited is a box that will disagree with
// itself, and a typed box the app tries to guess is a box that fights homebrew.
//
// **`abilities.str` is the character's Strength, and the grid's.** The inventory
// has always sized itself from `state.character.strength`, so that field stays —
// but as a *mirror*, recomputed from `abilities.str` in `normalizeCharacterMeta()`
// and nowhere else. One writer, so the two cannot drift, and a save or a party
// member from before the sheet existed still lands the right way up.

// =============================================================================
// THE MODEL
// =============================================================================
const ABILITIES = [
  { id: 'str', label: 'Strength' },
  { id: 'dex', label: 'Dexterity' },
  { id: 'con', label: 'Constitution' },
  { id: 'int', label: 'Intelligence' },
  { id: 'wis', label: 'Wisdom' },
  { id: 'cha', label: 'Charisma' },
];

// The eighteen skills, alphabetical as they are printed, each tied to the
// ability its modifier comes from. That tie is now what *lays the sheet out* as
// well as what derives the number: `skillsOfAbility` groups on it, so the
// grouping cannot drift from the arithmetic.
const SKILLS = [
  { id: 'acrobatics',     label: 'Acrobatics',      ability: 'dex' },
  { id: 'animalHandling', label: 'Animal Handling', ability: 'wis' },
  { id: 'arcana',         label: 'Arcana',          ability: 'int' },
  { id: 'athletics',      label: 'Athletics',       ability: 'str' },
  { id: 'deception',      label: 'Deception',       ability: 'cha' },
  { id: 'history',        label: 'History',         ability: 'int' },
  { id: 'insight',        label: 'Insight',         ability: 'wis' },
  { id: 'intimidation',   label: 'Intimidation',    ability: 'cha' },
  { id: 'investigation',  label: 'Investigation',   ability: 'int' },
  { id: 'medicine',       label: 'Medicine',        ability: 'wis' },
  { id: 'nature',         label: 'Nature',          ability: 'int' },
  { id: 'perception',     label: 'Perception',      ability: 'wis' },
  { id: 'performance',    label: 'Performance',     ability: 'cha' },
  { id: 'persuasion',     label: 'Persuasion',      ability: 'cha' },
  { id: 'religion',       label: 'Religion',        ability: 'int' },
  { id: 'sleightOfHand',  label: 'Sleight of Hand', ability: 'dex' },
  { id: 'stealth',        label: 'Stealth',         ability: 'dex' },
  { id: 'survival',       label: 'Survival',        ability: 'wis' },
];

// Proficiency is three-state rather than a checkbox: 2024 keeps expertise, and
// a rogue with a plain tick in the box is simply wrong.
const PROF_NONE = 0, PROF_PROFICIENT = 1, PROF_EXPERTISE = 2;
const PROF_TITLES = ['Not proficient', 'Proficient', 'Expertise'];

const SIZES = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'];
const HIT_DICE = ['d6', 'd8', 'd10', 'd12'];

// Everything the sheet adds to a character, with its defaults. Read by
// `normalizeCharacterMeta()` so an older save gains the fields on load rather
// than the sheet having to cope with half of them missing.
function defaultSheetFields() {
  return {
    background: '', subclass: '', xp: 0, size: 'Medium',
    ac: 10, speed: 30,
    hp: { current: 0, max: 0, temp: 0 },
    hitDice: { die: 'd8', max: 1, spent: 0 },
    deathSaves: { successes: 0, failures: 0 },
    inspiration: false,
    saveProf: {},   // { [abilityId]: true }
    skillProf: {},  // { [skillId]: 0 | 1 | 2 }
    armorTraining: { light: false, medium: false, heavy: false, shields: false },
    weaponProf: '', toolProf: '',
  };
}

// Six scores, always. `strengthFallback` is the pre-sheet `strength` field, so a
// character made before the sheet keeps the Strength their inventory was sized
// for instead of silently becoming a 10.
function normalizeAbilities(raw, strengthFallback) {
  const out = {};
  ABILITIES.forEach(a => {
    const v = parseInt(raw?.[a.id], 10);
    out[a.id] = Number.isFinite(v) ? clampScore(v)
              : (a.id === 'str' ? clampScore(parseInt(strengthFallback, 10) || 10) : 10);
  });
  return out;
}

function clampScore(n) { return Math.max(1, Math.min(30, n)); }

// In printed order, so a group lists its skills the way the sheet always has.
function skillsOfAbility(abilityId) {
  return SKILLS.filter(s => s.ability === abilityId);
}

// =============================================================================
// DERIVATION
// =============================================================================
function abilityScoreOf(id) { return state.character.abilities?.[id] ?? 10; }
function abilityModOf(id)   { return Math.floor((abilityScoreOf(id) - 10) / 2); }

// 2024 keeps the 5e progression: +2 at level 1, stepping every four levels.
function proficiencyBonus() {
  const level = Math.max(1, Math.min(20, parseInt(state.character.level, 10) || 1));
  return 2 + Math.floor((level - 1) / 4);
}

function skillProfOf(skillId) { return state.character.skillProf?.[skillId] ?? PROF_NONE; }
function saveProfOf(abilityId) { return !!state.character.saveProf?.[abilityId]; }

function skillModOf(skill) {
  return abilityModOf(skill.ability) + proficiencyBonus() * skillProfOf(skill.id);
}

function saveModOf(abilityId) {
  return abilityModOf(abilityId) + (saveProfOf(abilityId) ? proficiencyBonus() : 0);
}

function passivePerception() {
  return 10 + skillModOf(SKILLS.find(s => s.id === 'perception'));
}

function initiativeBonus() { return abilityModOf('dex'); }

// Signed, the way a modifier is always written.
function formatMod(n) { return (n >= 0 ? '+' : '-') + Math.abs(n); }

// =============================================================================
// BUILDING THE REPEATED PARTS
// =============================================================================
// The unique boxes are static markup in index.html, as everything referenced by
// JS is. The six ability groups are not unique — they are the ABILITIES and
// SKILLS tables above, rendered once. Hand-writing eighteen skill rows would
// only give them a second place to disagree with the constant that defines them.
//
// **One group per ability, not three lists.** Everything on this half of the
// sheet is one number read three ways — the modifier, the save that adds
// proficiency to it, and the skills that do the same — so they are shown
// together and a change to the score visibly moves the rows underneath it. It
// also retires the "DEX" tag each skill row used to carry: the group it sits in
// is the tag, and says it once instead of eighteen times.
//
// Built once at boot, never rebuilt: `renderCharacterSheet()` only writes values
// into what is already here, so an input never loses focus mid-keystroke.
let sheetBuilt = false;

function buildCharacterSheet() {
  if (sheetBuilt) return;
  sheetBuilt = true;

  const abilBox = document.getElementById('sheet-abilities');
  ABILITIES.forEach(a => abilBox.appendChild(abilityGroup(a)));

  // Where the sections *sit* is the reader's own arrangement, and it is put
  // together here for the same reason the ability groups are: once, when the
  // sheet is first opened. See src/js/sheet-layout.js — nothing below this line
  // knows or cares which slot a section ended up in.
  ensureSheetLayout();
}

// A score, its save, and the skills that read off it.
function abilityGroup(a) {
  const group = document.createElement('section');
  group.className = 'ability-group';

  const name = document.createElement('h4');
  name.className = 'ability-name';
  name.textContent = a.label;

  // The modifier is the figure actually rolled with, so it is the big one; the
  // score sits beside it as the smaller number it is worked out from.
  const mod = document.createElement('div');
  mod.className = 'ability-mod';
  mod.id = `sheet-mod-${a.id}`;

  const score = document.createElement('input');
  score.type = 'number';
  score.className = 'ability-score';
  score.min = 1; score.max = 30;
  score.dataset.sheet = `abilities.${a.id}`;
  score.dataset.kind = 'int';
  score.setAttribute('aria-label', a.label + ' score');

  const scoreBox = document.createElement('label');
  scoreBox.className = 'ability-score-box';
  const scoreCap = document.createElement('span');
  scoreCap.textContent = 'Score';
  scoreBox.append(scoreCap, score);

  const head = document.createElement('div');
  head.className = 'ability-head';
  head.append(mod, scoreBox);

  const rows = document.createElement('div');
  rows.className = 'prof-list';

  // The save leads the group and is bolded: it belongs to the ability itself,
  // where the skills below are each their own thing.
  const save = profRow({
    dot: { path: `saveProf.${a.id}`, kind: 'bool' },
    label: 'Saving Throw',
    valueId: `sheet-save-${a.id}`,
  });
  save.classList.add('save-row');
  rows.appendChild(save);

  skillsOfAbility(a.id).forEach(s => rows.appendChild(profRow({
    dot: { path: `skillProf.${s.id}`, kind: 'prof' },
    label: s.label,
    valueId: `sheet-skill-${s.id}`,
  })));

  group.append(name, head, rows);
  return group;
}

// One row of "proficiency dot · name · derived modifier". The dot is a button
// rather than a checkbox because the skill version cycles through three states.
function profRow({ dot, label, valueId }) {
  const row = document.createElement('div');
  row.className = 'prof-row';

  const btn = document.createElement('button');
  btn.className = 'prof-dot';
  btn.dataset.sheet = dot.path;
  btn.dataset.kind = dot.kind;
  btn.type = 'button';

  const name = document.createElement('span');
  name.className = 'prof-name';
  name.textContent = label;

  const value = document.createElement('span');
  value.className = 'prof-value';
  value.id = valueId;

  row.append(btn, name, value);
  return row;
}

// =============================================================================
// RENDERING
// =============================================================================
// Writes current values into the sheet that `buildCharacterSheet()` already put
// on the page. Called from `syncCharacterViewUI()`, which also fires on every
// party roster update — hence the focus guard: a sync landing mid-word must not
// reset the box being typed into, nor jump the caret to the end.
function renderCharacterSheet() {
  buildCharacterSheet();

  const c = state.character;
  const readOnly = isReadOnly();
  document.getElementById('character-sheet').classList.toggle('sheet-readonly', readOnly);

  // Every plain input, by the path it edits.
  document.querySelectorAll('#character-sheet [data-sheet]').forEach(el => {
    const kind = el.dataset.kind;
    if (kind === 'bool' || kind === 'prof') {
      renderProfDot(el, kind);
      el.disabled = readOnly;
      return;
    }
    el.disabled = readOnly;
    if (kind === 'check') { el.checked = !!readSheetPath(el.dataset.sheet); return; }
    if (el === document.activeElement) return; // being typed into
    if (kind === 'classlist') {
      el.value = (c.classes ?? []).join(', ');
      return;
    }
    const v = readSheetPath(el.dataset.sheet);
    el.value = v === null || v === undefined ? '' : v;
  });

  // Derived: the numbers the rules work out for you.
  ABILITIES.forEach(a => {
    document.getElementById(`sheet-mod-${a.id}`).textContent  = formatMod(abilityModOf(a.id));
    document.getElementById(`sheet-save-${a.id}`).textContent = formatMod(saveModOf(a.id));
  });
  SKILLS.forEach(s => {
    document.getElementById(`sheet-skill-${s.id}`).textContent = formatMod(skillModOf(s));
  });

  document.getElementById('sheet-prof-bonus').textContent = formatMod(proficiencyBonus());
  document.getElementById('sheet-initiative').textContent = formatMod(initiativeBonus());
  document.getElementById('sheet-passive').textContent    = passivePerception();

  // The identity line under the name — the same summary the party panel shows.
  document.getElementById('sheet-identity').textContent = describePartyCharacter(c) || 'Adventurer';

  renderDeathSaves(readOnly);
}

function renderProfDot(el, kind) {
  const level = kind === 'bool'
    ? (readSheetPath(el.dataset.sheet) ? PROF_PROFICIENT : PROF_NONE)
    : (readSheetPath(el.dataset.sheet) || PROF_NONE);
  el.dataset.level = level;
  el.title = kind === 'bool'
    ? (level ? 'Proficient' : 'Not proficient')
    : PROF_TITLES[level];
}

// Three pips a side, filled left to right — the paper sheet's own shape, and
// easier to read at a glance than a number when it matters most.
function renderDeathSaves(readOnly) {
  [['successes', 'sheet-death-succ'], ['failures', 'sheet-death-fail']].forEach(([key, boxId]) => {
    const box = document.getElementById(boxId);
    const filled = state.character.deathSaves?.[key] ?? 0;
    box.innerHTML = '';
    for (let i = 1; i <= 3; i++) {
      const pip = document.createElement('button');
      pip.type = 'button';
      pip.className = 'death-pip' + (i <= filled ? ' filled' : '');
      pip.title = `${i} ${key}`;
      pip.disabled = readOnly;
      // Clicking the pip you are on clears back to it minus one, so a
      // miscount is undone with the same click that made it.
      pip.addEventListener('click', () => {
        setSheetPath(`deathSaves.${key}`, i === filled ? i - 1 : i);
        commitSheetEdit(`deathSaves.${key}`);
      });
      box.appendChild(pip);
    }
  });
}

// =============================================================================
// EDITING
// =============================================================================
function readSheetPath(path) {
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), state.character);
}

function setSheetPath(path, value) {
  const parts = path.split('.');
  let obj = state.character;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof obj[parts[i]] !== 'object' || obj[parts[i]] === null) obj[parts[i]] = {};
    obj = obj[parts[i]];
  }
  obj[parts[parts.length - 1]] = value;
}

// One listener for the whole sheet rather than one per box — there are roughly
// eighty of them, and they all do the same thing.
function onSheetInput(e) {
  const el = e.target.closest('[data-sheet]');
  if (!el || isReadOnly()) return;
  const kind = el.dataset.kind;
  if (kind === 'bool' || kind === 'prof') return; // buttons, handled on click

  let value;
  if (kind === 'check') {
    value = el.checked;
  } else if (kind === 'classlist') {
    // The same comma-separated list the character modal takes, so the two
    // editors of one field agree on what a multiclass looks like.
    value = el.value.split(/[,/]/).map(s => s.trim()).filter(Boolean);
  } else if (kind === 'int') {
    const n = parseInt(el.value, 10);
    value = Number.isFinite(n) ? n : 0;
    if (el.dataset.sheet.startsWith('abilities.')) value = clampScore(value);
  } else {
    value = el.value;
  }
  setSheetPath(el.dataset.sheet, value);
  commitSheetEdit(el.dataset.sheet);
}

// One listener for the whole sheet rather than one per box — there are roughly
// eighty of them and they all do the same thing. Both events, because a
// checkbox or a select does not reliably report through 'input' everywhere;
// writing the same value twice costs nothing.
const sheetEl = document.getElementById('character-sheet');
sheetEl.addEventListener('input', onSheetInput);
sheetEl.addEventListener('change', onSheetInput);

sheetEl.addEventListener('click', e => {
  const el = e.target.closest('.prof-dot');
  if (!el || isReadOnly()) return;
  const kind = el.dataset.kind;
  const current = readSheetPath(el.dataset.sheet);
  // Saves are proficient or not; skills cycle on through expertise.
  const next = kind === 'bool' ? !current : ((parseInt(current, 10) || 0) + 1) % 3;
  setSheetPath(el.dataset.sheet, next);
  commitSheetEdit(el.dataset.sheet);
});

// What has to happen after any edit. Strength is the one field with a
// consequence outside the sheet: the inventory grid is sized from it, so
// changing it here resizes the grid exactly as the character modal does.
function commitSheetEdit(path) {
  if (path === 'abilities.str') {
    state.character.strength = state.character.abilities.str;
    rebuildGrid();
  }
  // Unconditional: this is what writes the name and Strength in the header, so
  // renaming a character on the sheet has to run it too — not only a change
  // that happens to touch the grid.
  updateWeightDisplay();
  if (path === 'level' || path === 'name') syncCharacterViewUI();
  renderCharacterSheet(); // the derived numbers move with almost everything
  renderHomeScreen();     // a card may be showing the level or the name
  debouncedSync();
}
