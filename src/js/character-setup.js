// =============================================================================
// CHARACTER SETUP — the modal that edits what a character *is*
// =============================================================================
'use strict';

// One dialog, four jobs: the header's Edit Character, a roster card's Edit, New
// Character on the home screen, and the gear at the top right of the character
// sheet. It edits the things that describe a character rather than the things
// that happen to one — name, species, background, alignment, and the classes
// they have taken levels in. Strength is here too, because the inventory grid is
// sized from it and this has always been where it is set.
//
// **The class rows are why this left the sheet.** A multiclass is a *list* —
// Warlock 5 / Bard 2, each with its own subclass — and a list of rows that grows
// as you add classes does not belong across the top of a page that has to stay
// readable. So the sheet keeps the readout (the identity block under the name,
// which names each of these facts above its answer) and the editing happens
// here.
//
// `charModalTargetId` names the slot in the roster to edit. A null target is the
// character *on screen*, which is not always one of yours — a GM editing a
// player's Strength from the header is editing the working copy and the party
// roster, never their own slot.

let charModalTargetId = null;
let charModalIsNew = false;

// The class rows while the dialog is open: an array of `{ name, level,
// subclass }` edited in place and written to the character only on Save. A
// working copy, because Cancel has to mean something, and because the target may
// be a roster slot that is not the character on screen.
let charModalClasses = [];

const charClassRowsEl = document.getElementById('char-class-rows');
const charLevelFieldEl = document.getElementById('char-level-field');
const charTotalLevelEl = document.getElementById('char-total-level');

// =============================================================================
// OPENING AND SAVING
// =============================================================================
function openCharModal(targetId = null, { isNew = false } = {}) {
  charModalIsNew = isNew;
  charModalTargetId = isNew ? null : targetId;

  const c = charModalIsNew
    ? blankCharacterMeta('')
    : (charModalTargetId ? state.characters[charModalTargetId]?.character : null) ?? state.character;

  document.getElementById('character-modal-title').textContent =
    charModalIsNew ? 'New Character' : 'Character Setup';
  document.getElementById('char-name-input').value       = charModalIsNew ? '' : c.name;
  document.getElementById('char-str-input').value        = c.strength;
  document.getElementById('char-race-input').value       = c.race ?? '';
  document.getElementById('char-background-input').value = c.background ?? '';
  document.getElementById('char-alignment-input').value  = c.alignment ?? '';
  document.getElementById('char-level-input').value      = c.level ?? 1;
  document.getElementById('save-char-btn').textContent   = charModalIsNew ? 'Create' : 'Save';

  // A copy, not the character's own array — nothing here may reach the model
  // before Save.
  charModalClasses = classEntriesOf(c).map(e => ({ ...e }));

  // Hints, refreshed on open rather than once at load: custom classes and
  // species will arrive through the registries, and this is where they show up.
  fillDatalist(document.getElementById('class-options'), allClasses().map(d => d.name));
  fillDatalist(document.getElementById('species-options'), allSpecies().map(d => d.name));
  fillDatalist(document.getElementById('alignment-options'), ALIGNMENTS);

  renderCharClassRows();
  updateCharModalNote();
  showModal('character-modal');
  setTimeout(() => document.getElementById('char-name-input').focus(), 0);
}

// `current` is the character being edited, because Strength is now one of six
// abilities: it has to be written *into* the existing set rather than beside it,
// or normalizeCharacterMeta would take the untouched `abilities.str` and the box
// the user just typed in would appear to do nothing.
//
// `level` is the same shape of trap and is handled the same way: with classes it
// is a mirror of their sum and writing it does nothing, so it is only sent for a
// character who has none — which is the only time the box is on screen.
function readCharModalFields(current) {
  const str = parseInt(document.getElementById('char-str-input').value, 10);
  const level = parseInt(document.getElementById('char-level-input').value, 10);
  return {
    name: document.getElementById('char-name-input').value.trim() || 'Unnamed Hero',
    race: document.getElementById('char-race-input').value.trim(),
    background: document.getElementById('char-background-input').value.trim(),
    alignment: document.getElementById('char-alignment-input').value.trim(),
    classLevels: charModalClasses,
    level: Number.isFinite(level) ? level : (current?.level ?? 1),
    abilities: { ...(current?.abilities ?? {}), str: Number.isFinite(str) ? str : 10 },
  };
}

function updateCharModalNote() {
  const str = parseInt(document.getElementById('char-str-input').value) || 10;
  document.getElementById('modal-capacity-normal').textContent = str * 15 + ' slots';
  document.getElementById('modal-capacity-total').textContent  = str * 45 + ' slots';
}
document.getElementById('char-str-input').addEventListener('input', updateCharModalNote);

document.getElementById('save-char-btn').addEventListener('click', () => {
  const current = charModalIsNew ? null
    : (charModalTargetId ? state.characters[charModalTargetId]?.character : state.character);
  const fields = readCharModalFields(current);
  hideModal('character-modal');

  if (charModalIsNew) {
    const id = createCharacter(fields);
    // Straight into the new character, unless you are the GM — they have no
    // character in play, so creating one only adds it to the roster.
    if (canSelectCharacter()) { activateCharacter(id); closeHomeScreen(); }
    else { debouncedSync(); renderHomeScreen(); }
  } else if (charModalTargetId) {
    // A card on the home screen — the slot, which may not be the one on screen.
    updateCharacterMeta(charModalTargetId, fields);
  } else {
    // The header's Edit Character, or the sheet's gear: whoever is on screen,
    // yours or a player's.
    applyMetaToLiveCharacter(fields);
  }
  charModalTargetId = null;
  charModalIsNew = false;
});

document.getElementById('edit-character-btn').addEventListener('click', () => openCharModal());
document.getElementById('sheet-setup-btn').addEventListener('click', () => openCharModal());

// =============================================================================
// THE CLASS ROWS
// =============================================================================
// One row per class: its name, the level taken in it, and — once that class's
// own level has unlocked one — its subclass.
//
// **Rows are built once and then written into, never rebuilt on a keystroke.**
// The same rule the character sheet follows for its ~80 inputs, and for the same
// reason: a rebuild mid-word takes the focus out of the box being typed in. Only
// a row's *removal* rebuilds the list, because the indices below it all shift.
function renderCharClassRows() {
  charClassRowsEl.textContent = '';
  charModalClasses.forEach((entry, i) => charClassRowsEl.appendChild(charClassRow(entry, i)));
  syncCharClassSummary();
}

function charClassRow(entry, index) {
  const row = document.createElement('div');
  row.className = 'class-row';
  row.dataset.index = index;

  row.append(
    charRowField('Class', charTextInput(entry.name, 'class-row-name', {
      list: 'class-options', maxLength: 40, placeholder: 'e.g. Warlock',
    })),
    charRowField('Level', charLevelInput(entry.level), 'class-row-field-level'),
  );

  // The subclass field is the row's own, and so is the question of whether to
  // show it: a Warlock 5 has a patron to name and the Bard 2 beside them does
  // not. `syncCharClassRow()` below is what decides, and it runs on every edit
  // to this row.
  const sub = charRowField('Subclass', charTextInput(entry.subclass, 'class-row-subclass', {
    maxLength: 40, placeholder: 'Not yet chosen',
  }));
  sub.classList.add('class-row-sub');
  const dl = document.createElement('datalist');
  dl.id = `subclass-options-${index}`;
  sub.querySelector('input').setAttribute('list', dl.id);
  sub.appendChild(dl);
  row.appendChild(sub);

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'class-row-remove btn-sm icon-only';
  remove.title = 'Remove this class';
  remove.setAttribute('aria-label', 'Remove this class');
  remove.textContent = '×';
  row.appendChild(remove);

  syncCharClassRow(row, entry);
  return row;
}

function charRowField(label, input, extraClass = '') {
  const field = document.createElement('label');
  field.className = 'field class-row-field' + (extraClass ? ' ' + extraClass : '');
  const span = document.createElement('span');
  span.textContent = label;
  field.append(span, input);
  return field;
}

function charTextInput(value, className, { list, maxLength, placeholder } = {}) {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = className;
  input.value = value ?? '';
  if (list) input.setAttribute('list', list);
  if (maxLength) input.maxLength = maxLength;
  if (placeholder) input.placeholder = placeholder;
  return input;
}

function charLevelInput(value) {
  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'class-row-level';
  input.min = 1;
  input.max = MAX_LEVEL;
  input.value = value;
  return input;
}

// What a row shows once its class or level has changed: the subclasses this
// class actually offers, and whether to ask for one at all.
//
// **An unknown class shows the field.** `classUnlockKeys()` returns null when it
// has never heard of the class, and hiding a box we cannot reason about reads as
// the app having eaten a field someone was using — the same rule the sheet's own
// unlocks follow.
function syncCharClassRow(row, entry) {
  const def = findClassByName(entry.name);
  const keys = classUnlockKeys(def, entry.subclass, entry.level);
  const sub = row.querySelector('.class-row-sub');

  sub.classList.toggle('hidden', !!keys && !keys.has('subclass'));
  fillDatalist(row.querySelector('.class-row-sub datalist'),
    (def?.subclasses ?? []).map(sc => sc.name));
}

// The total under the rows is the character's level, and it is derived here for
// the same reason it is derived on the character: it is the sum, and a second
// place to type it would be a second place for it to be wrong.
//
// With no classes at all there is nothing to sum, so the plain Level box appears
// instead — a character can be levelled without this app knowing what they are.
function syncCharClassSummary() {
  const none = charModalClasses.length === 0;
  charLevelFieldEl.classList.toggle('hidden', !none);
  charTotalLevelEl.textContent = none
    ? ''
    : `Level ${totalLevelOf(sanitizeClassLevels(charModalClasses), 1)}`;
}

// One listener for the whole list rather than one per box, and the rows outlive
// none of them: the list is rebuilt on a removal, so per-row listeners would be
// re-attached every time.
charClassRowsEl.addEventListener('input', e => {
  const row = e.target.closest('.class-row');
  if (!row) return;
  const entry = charModalClasses[parseInt(row.dataset.index, 10)];
  if (!entry) return;

  if (e.target.classList.contains('class-row-name')) entry.name = e.target.value;
  else if (e.target.classList.contains('class-row-subclass')) entry.subclass = e.target.value;
  else if (e.target.classList.contains('class-row-level')) {
    const n = parseInt(e.target.value, 10);
    entry.level = Number.isFinite(n) ? clampLevel(n) : 1;
  }

  syncCharClassRow(row, entry);
  syncCharClassSummary();
});

charClassRowsEl.addEventListener('click', e => {
  const btn = e.target.closest('.class-row-remove');
  if (!btn) return;
  charModalClasses.splice(parseInt(btn.closest('.class-row').dataset.index, 10), 1);
  renderCharClassRows();   // every index below the gap has moved
});

document.getElementById('char-add-class-btn').addEventListener('click', () => {
  charModalClasses.push(blankClassEntry());
  const row = charClassRow(charModalClasses[charModalClasses.length - 1], charModalClasses.length - 1);
  charClassRowsEl.appendChild(row);
  syncCharClassSummary();
  row.querySelector('.class-row-name').focus();
});
