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

// Everything that belongs to the character rather than to this browser. One
// builder, so the localStorage copy and the cloud copy can never drift apart —
// cloud-save.js stores the JSON of exactly this.
function buildSavePayload() {
  return {
    character:   state.character,
    instances:   state.instances,
    equipped:    state.equipped,
    equipLayout: state.equipLayout,
    db: Object.fromEntries(
      Object.entries(state.db).filter(([id]) => !DEFAULT_ITEMS.find(t => t.id === id))
    ),
  };
}

// The inverse. Custom items merge over the defaults already in state.db;
// everything else replaces. Renders are the caller's job — at boot there is
// nothing on screen yet, while a cloud save arriving mid-session must redraw.
function applySavePayload(data) {
  if (!data) return;
  if (data.character)   state.character   = data.character;
  if (data.db)          Object.assign(state.db, data.db);
  if (data.instances)   state.instances   = data.instances;
  if (data.equipped)    state.equipped    = data.equipped;
  if (data.equipLayout) state.equipLayout = data.equipLayout;
  syncNextId();
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
    const data = JSON.parse(raw);
    state.character = data.character ?? state.character;
    Object.assign(state.db, data.db ?? {});
    state.instances = data.instances ?? {};
    state.equipped  = data.equipped  ?? {};
    syncNextId();
    rebuildGrid();
    renderItemList();
    renderEquipPanel();
    syncCharacterViewUI();
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
