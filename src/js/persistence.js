// =============================================================================
// PERSISTENCE — localStorage save/load and CSV export
// =============================================================================
'use strict';

// =============================================================================
// PERSISTENCE
// =============================================================================
const SAVE_KEY = 'dnd_inventory_v1';

document.getElementById('save-btn').addEventListener('click', saveState);
document.getElementById('load-btn').addEventListener('click', loadState);
document.getElementById('export-csv-btn').addEventListener('click', exportItemsCSV);

function csvField(val) {
  const s = String(val ?? '');
  return (s.includes(',') || s.includes('"') || s.includes('\n'))
    ? '"' + s.replace(/"/g, '""') + '"'
    : s;
}

function costToCSVStr(cost) {
  const c = parseCostObj(cost);
  const parts = [];
  if (c.pp) parts.push(`${c.pp}pp`);
  if (c.gp) parts.push(`${c.gp}gp`);
  if (c.ep) parts.push(`${c.ep}ep`);
  if (c.sp) parts.push(`${c.sp}sp`);
  if (c.cp) parts.push(`${c.cp}cp`);
  return parts.join(' ');
}

function exportItemsCSV() {
  const headers = ['name','rarity','description','cost','tags','damage','damageType',
                   'attunement','stackSize','image','shape','container','containerRows','containerCols',
                   'properties','mastery'];
  const rows = [headers.join(',')];
  Object.values(state.db).forEach(t => {
    const shapeStr = isStackable(t) ? '1' : normalizeShape(t.shape).map(r => r.join('')).join('|');
    rows.push([
      t.name,
      t.rarity,
      t.description || '',
      costToCSVStr(t.cost),
      (t.tags || []).join('|'),
      t.damage || '',
      t.damageType || '',
      t.attunement ? 'true' : '',
      isStackable(t) ? stackSizeOf(t) : '',
      t.image || '',
      shapeStr,
      t.container ? 'true' : '',
      t.containerRows != null ? t.containerRows : '',
      t.containerCols != null ? t.containerCols : '',
      (t.properties || []).join(';'),
      t.mastery || '',
    ].map(csvField).join(','));
  });
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'items.csv';
  a.click();
  URL.revokeObjectURL(url);
}
document.getElementById('stash-all-btn').addEventListener('click', stashAllItems);
document.getElementById('stash-delete-all-btn').addEventListener('click', () => {
  const activeContainerId = state.activeContainer;
  const unplaced = Object.values(state.instances).filter(i =>
    (i.containerId ?? null) === activeContainerId && (i.row === null || i.row === undefined)
  );
  if (!confirm(`Delete all ${unplaced.length} stashed item${unplaced.length > 1 ? 's' : ''}? This cannot be undone.`)) return;
  if (state.placing?.instanceId && state.instances[state.placing.instanceId]?.row === null) cancelPlacing();
  unplaced.forEach(inst => { delete state.instances[inst.id]; });
  renderStash();
  updateWeightDisplay();
  debouncedSync();
});

// Everything that belongs to the account rather than to this browser: the whole
// roster of characters, and which of them is in play. One builder, so the
// localStorage copy and the cloud copy can never drift apart — cloud-save.js
// stores the JSON of exactly this.
//
// The character on screen is the working copy of one slot, so it is flushed back
// into the roster first; `commitActiveCharacter()` declines when what is on
// screen is somebody else's sheet or the GM's placeholder.
const SAVE_VERSION = 2;

function buildSavePayload() {
  commitActiveCharacter();
  return {
    version: SAVE_VERSION,
    activeCharacterId: state.activeCharacterId,
    characters: state.characters,
  };
}

// The inverse. `normalizeSavePayload` in characters.js reads both shapes — a
// version-1 save is a single character at the top level — so nothing else has to
// know there were ever two. Renders are the caller's job: at boot there is
// nothing on screen yet, while a cloud save arriving mid-session must redraw.
function applySavePayload(data) {
  if (!data) return;
  const norm = normalizeSavePayload(data);
  state.characters = norm.characters;
  state.activeCharacterId = norm.activeCharacterId;
  ensureCharacter();              // also loads the active slot into live state
  loadActiveCharacterIntoLive();
}

function autoSave() {
  localStorage.setItem(SAVE_KEY, JSON.stringify(buildSavePayload()));
}

function hasLocalSave() {
  return !!localStorage.getItem(SAVE_KEY);
}

function autoLoad() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) return;
  try {
    applySavePayload(JSON.parse(raw));
  } catch {}
}

function saveState() {
  autoSave();
  flashButton(document.getElementById('save-btn'), 'Saved!');
}

function loadState() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) { alert('No saved data found.'); return; }
  try {
    applySavePayload(JSON.parse(raw));
    renderLiveCharacter();
    flashButton(document.getElementById('load-btn'), 'Loaded!');
  } catch {
    alert('Failed to load save data.');
  }
}

function flashButton(btn, text) {
  const orig = btn.textContent;
  btn.textContent = text;
  setTimeout(() => btn.textContent = orig, 1500);
}
