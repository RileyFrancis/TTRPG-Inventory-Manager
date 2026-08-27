// =============================================================================
// SHEET PROSE — the written sections, and the editor/preview swap
// =============================================================================
'use strict';

// Backstory & Personality and Appearance are the parts of a character the rules
// have nothing to say about, so they are not boxes and derived numbers but a
// page to write on. Each is one Markdown field with two faces: the textarea you
// write in, and the formatted version you read. See markdown.js for what the
// formatting covers and — more importantly — what the sanitizer refuses to
// render.
//
// **Neither section owns any data.** They are two more `data-sheet` fields on
// `state.character`, written by the same delegated listener as every other box
// on the sheet, saved by the same save, synced by the same sync.
//
// **The mode is not a setting.** Which face you are looking at is a glance, the
// same argument the class features toggle makes, so it is session-only and
// never persisted. What it *is* is a sensible guess: a section with something
// written in it opens formatted, because that is the readable form and reading
// is what you are usually there for; an empty one opens in the editor, because
// there is nothing to read and a blank preview is a dead end. Touch the toggle
// and the guess gives way to your choice, until the sheet on screen changes to
// a different character.

// One entry per written section. The `data-prose` key is also the `data-sheet`
// path, so a section needs no wiring of its own beyond a row here and the
// markup in index.html.
const PROSE_MODES = {};        // sectionKey -> 'edit' | 'preview', once chosen
let proseCharacterId = null;   // whose sheet the modes above belong to

// A section's mode: the reader's choice if they have made one, otherwise the
// guess described in the header.
function proseModeOf(key) {
  if (PROSE_MODES[key]) return PROSE_MODES[key];
  return String(readSheetPath(key) ?? '').trim() ? 'preview' : 'edit';
}

// Called from `renderCharacterSheet()`, so it follows a keystroke, a party
// roster update and a character switch without a trigger of its own.
function renderSheetProse() {
  // A different character is a different set of writing, and carrying the last
  // one's modes over would open someone else's blank sheet in preview.
  const id = state.character?.id ?? null;
  if (id !== proseCharacterId) {
    proseCharacterId = id;
    Object.keys(PROSE_MODES).forEach(k => delete PROSE_MODES[k]);
  }

  document.querySelectorAll('#character-sheet [data-prose]').forEach(section => {
    const key = section.dataset.prose;
    const previewing = proseModeOf(key) === 'preview';
    section.classList.toggle('previewing', previewing);

    const btn = section.querySelector('.prose-toggle');
    if (btn) {
      // The button says what you will get, not what you are looking at.
      btn.textContent = previewing ? 'Edit' : 'Preview';
      btn.title = previewing
        ? 'Go back to the text and edit it'
        : 'See this formatted, with the Markdown and HTML applied';
    }

    // **Only rendered when it is on screen.** Every keystroke re-renders the
    // sheet, and parsing the whole backstory each time to update something
    // nobody is looking at would be work for nothing.
    if (!previewing) return;

    const preview = section.querySelector('.prose-preview');
    const text = String(readSheetPath(key) ?? '');
    if (text.trim()) {
      renderMarkdownInto(preview, text);
    } else {
      preview.textContent = '';
      preview.appendChild(proseEmptyNote(section));
    }
  });
}

function proseEmptyNote(section) {
  const p = document.createElement('p');
  p.className = 'prose-empty';
  p.textContent = section.dataset.proseEmpty || 'Nothing written yet.';
  return p;
}

// One listener for every written section, on the sheet itself — the same
// pattern the rest of the sheet uses rather than a handler per button.
//
// **Read-only does not gate this.** Someone looking at another player's sheet
// can still swap to the editor to see how a passage was written; the textarea
// itself is disabled by `renderCharacterSheet()` along with every other input,
// so nothing can be changed from there.
document.getElementById('character-sheet').addEventListener('click', e => {
  const btn = e.target.closest('.prose-toggle');
  if (!btn) return;

  const section = btn.closest('[data-prose]');
  const key = section.dataset.prose;
  PROSE_MODES[key] = proseModeOf(key) === 'preview' ? 'edit' : 'preview';
  renderSheetProse();

  // Switching *to* the editor is a move made in order to type.
  if (PROSE_MODES[key] === 'edit') {
    const input = section.querySelector('.prose-input');
    if (input && !input.disabled) input.focus();
  }
});
