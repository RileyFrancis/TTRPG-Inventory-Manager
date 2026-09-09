// =============================================================================
// SHEET PROSE — the written sections, and the editor/preview swap
// =============================================================================
'use strict';

// Backstory & Personality and Appearance: two Markdown fields with an
// editor/preview swap. Neither owns data — they are `data-sheet` fields on
// `state.character` (the `data-prose` key IS the `data-sheet` path). The mode is
// session-only, a guess overridden by the toggle: a section with writing opens
// formatted, an empty one opens in the editor. See markdown.js for the sanitizer.

const PROSE_MODES = {};        // sectionKey -> 'edit' | 'preview', once chosen
let proseCharacterId = null;   // whose sheet the modes above belong to

// A section's mode: the reader's choice if made, else the guess (writing →
// preview, empty → edit).
function proseModeOf(key) {
  if (PROSE_MODES[key]) return PROSE_MODES[key];
  return String(readSheetPath(key) ?? '').trim() ? 'preview' : 'edit';
}

// Called from `renderCharacterSheet()`, so it follows a keystroke, a party
// roster update and a character switch without a trigger of its own.
function renderSheetProse() {
  // A different character is different writing — carrying the modes over would
  // open someone else's blank sheet in preview.
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

    // Only rendered when on screen — every keystroke re-renders the sheet.
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

// One listener for every written section. Read-only does not gate it — someone
// reading another player's sheet can still swap to the editor to see how a
// passage was written (the textarea is disabled by `renderCharacterSheet()`).
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
