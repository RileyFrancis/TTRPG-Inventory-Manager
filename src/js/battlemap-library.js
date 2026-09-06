// =============================================================================
// BATTLEMAP LIBRARY — the GM's Maps pane, and the import / creature dialogs
// =============================================================================
'use strict';

// A third pane beside Equipment and Shop, on exactly the terms the Shop pane
// already set: it is the GM's own tool, so it appears for a GM and for nobody
// else, and it comes first in their strip because their own things do. The list
// is the library; opening one map is where its grid, its reveal and its
// clearing-out live.
//
// Everything a *player* does with a map happens on the map itself — there is no
// player half of this file. That is the split the whole feature is built on:
// the library is about which maps exist, and `battlemap-view.js` is about the
// one the party is standing on.

// =============================================================================
// THE PANE
// =============================================================================
function renderMapPanel() {
  const pane = document.getElementById('left-pane-map');
  if (!pane) return;
  pane.innerHTML = '';
  if (!state.party.active) return;
  const map = state.mapLibraryOpenId ? mapById(state.mapLibraryOpenId) : null;
  if (map) renderMapDetail(pane, map);
  else renderMapList(pane);
}

function renderMapList(pane) {
  const head = document.createElement('div');
  head.className = 'shop-head';
  const title = document.createElement('span');
  title.className = 'shop-head-title';
  title.textContent = 'Battle Maps';
  head.appendChild(title);
  pane.appendChild(head);

  const body = document.createElement('div');
  body.className = 'shop-body';

  const maps = allMaps();
  if (!maps.length) {
    const empty = document.createElement('p');
    empty.className = 'shop-empty';
    empty.textContent = 'No maps yet. Import a picture of one, line the grid up on it, and reveal it when the party walks in.';
    body.appendChild(empty);
  }

  maps.forEach(map => body.appendChild(buildMapRow(map)));
  pane.appendChild(body);

  const footer = document.createElement('div');
  footer.className = 'shop-footer';
  const btn = document.createElement('button');
  btn.className = 'btn-primary';
  setIconLabel(btn, 'plus', 'Import Map');
  btn.addEventListener('click', () => openMapModal(null));
  footer.appendChild(btn);
  pane.appendChild(footer);
}

function buildMapRow(map) {
  const row = document.createElement('div');
  row.className = 'map-row'
    + (map.id === activeMapId() ? ' in-play' : '')
    + (map.revealed ? ' revealed' : '');

  const open = document.createElement('button');
  open.className = 'map-row-open';
  open.title = 'Open this map’s settings';

  const thumb = document.createElement('span');
  thumb.className = 'map-thumb';
  if (map.image) thumb.style.backgroundImage = 'url("' + map.image + '")';
  open.appendChild(thumb);

  const info = document.createElement('span');
  info.className = 'map-row-info';
  const nm = document.createElement('span');
  nm.className = 'map-row-name';
  nm.textContent = map.name;
  const n = mapTokens(map).length;
  const sub = document.createElement('span');
  sub.className = 'map-row-sub';
  sub.textContent = [
    map.id === activeMapId() ? 'In play' : null,
    map.revealed ? 'Revealed' : 'Hidden',
    n + ' creature' + (n === 1 ? '' : 's'),
  ].filter(Boolean).join(' · ');
  info.appendChild(nm);
  info.appendChild(sub);
  open.appendChild(info);
  open.addEventListener('click', () => { state.mapLibraryOpenId = map.id; renderMapPanel(); });
  row.appendChild(open);

  // The two things a GM reaches for mid-session without opening anything: put
  // the party on this map, and let them see it. They are separate on purpose —
  // laying out the next room while the party is still in this one is the whole
  // reason a map has a reveal at all.
  const play = document.createElement('button');
  play.className = 'map-row-btn' + (map.id === activeMapId() ? ' on' : '');
  play.title = map.id === activeMapId() ? 'The party is on this map' : 'Put the party on this map';
  play.textContent = '▶';
  play.addEventListener('click', () => setActiveMap(map.id === activeMapId() ? null : map.id));

  const eye = document.createElement('button');
  eye.className = 'map-row-btn' + (map.revealed ? ' on' : '');
  eye.title = map.revealed ? 'Hide this map from the players' : 'Show this map to the players';
  eye.appendChild(iconEl(map.revealed ? 'show' : 'hide'));
  eye.addEventListener('click', () => setMapRevealed(map.id, !map.revealed));

  row.appendChild(play);
  row.appendChild(eye);
  return row;
}

function renderMapDetail(pane, map) {
  const head = document.createElement('div');
  head.className = 'shop-head';
  const back = document.createElement('button');
  back.className = 'shop-back';
  back.textContent = '‹ Battle Maps';
  back.addEventListener('click', () => { state.mapLibraryOpenId = null; renderMapPanel(); });
  head.appendChild(back);

  const edit = document.createElement('button');
  edit.className = 'shop-head-btn';
  edit.title = 'Rename this map or replace its picture';
  edit.textContent = '✎';
  edit.addEventListener('click', () => openMapModal(map.id));
  const del = document.createElement('button');
  del.className = 'shop-head-btn danger';
  del.title = 'Delete this map';
  del.textContent = '✕';
  del.addEventListener('click', () => deleteMap(map));
  head.appendChild(edit);
  head.appendChild(del);
  pane.appendChild(head);

  const body = document.createElement('div');
  body.className = 'shop-body';

  const title = document.createElement('div');
  title.className = 'shop-title';
  title.textContent = map.name;
  body.appendChild(title);

  const preview = document.createElement('button');
  preview.className = 'map-preview';
  if (map.image) preview.style.backgroundImage = 'url("' + map.image + '")';
  preview.title = 'Put the party here and open it';
  preview.addEventListener('click', () => { setActiveMap(map.id); openBattlemap(map.id); });
  body.appendChild(preview);

  const openBtn = document.createElement('button');
  openBtn.className = 'btn-primary map-open-btn';
  setIconLabel(openBtn, 'map', map.id === activeMapId() ? 'Open Map' : 'Play This Map');
  openBtn.addEventListener('click', () => { setActiveMap(map.id); openBattlemap(map.id); });
  body.appendChild(openBtn);

  // ── Visible to ────────────────────────────────────────────────────────
  body.appendChild(mapSectionHdr('Visible To'));
  const seg = document.createElement('div');
  seg.className = 'segmented shop-seg';
  [[false, 'Hidden'], [true, 'Everyone']].forEach(pair => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'seg-btn' + (!!map.revealed === pair[0] ? ' active' : '');
    b.textContent = pair[1];
    b.addEventListener('click', () => setMapRevealed(map.id, pair[0]));
    seg.appendChild(b);
  });
  body.appendChild(seg);
  const note = document.createElement('p');
  note.className = 'shop-price-note';
  note.textContent = map.revealed
    ? 'The players can open this map whenever it is the one in play.'
    : 'Only you can see this map. Lay the room out before they walk into it.';
  body.appendChild(note);

  // ── The grid ──────────────────────────────────────────────────────────
  body.appendChild(mapSectionHdr('Grid'));
  body.appendChild(buildGridControls(map));

  // ── Clearing out ──────────────────────────────────────────────────────
  body.appendChild(mapSectionHdr('Clear'));
  const clears = document.createElement('div');
  clears.className = 'map-clear-row';
  [
    ['tokens', 'Creatures', 'creature', mapTokens(map).length],
    ['walls',  'Walls',     'wall',     mapWalls(map).length],
    ['masks',  'Fog Edits', 'fog edit', mapMasks(map).length],
  ].forEach(spec => {
    const b = document.createElement('button');
    b.className = 'btn-sm';
    b.textContent = spec[1] + ' (' + spec[3] + ')';
    b.disabled = !spec[3];
    b.title = 'Remove every ' + spec[2] + ' from this map';
    b.addEventListener('click', () => clearMapPieces(map.id, spec[0], spec[2]));
    clears.appendChild(b);
  });
  body.appendChild(clears);

  pane.appendChild(body);
}

function mapSectionHdr(text) {
  const h = document.createElement('div');
  h.className = 'shop-section-hdr';
  h.textContent = text;
  return h;
}

// The grid has to be lined up on somebody else's picture, which is a fiddly job
// done by eye. So the size and the two offsets are number boxes with steppers
// either side, and the map behind them redraws as they move — the answer is on
// the map, not in the numbers. The map is in the middle panel now, so it is
// genuinely beside them while they are turned.
//
// **The numbers are fractional, and that is what makes a grid line up at all.**
// A cell rounded to a whole pixel is out by up to half of one, which nobody can
// see on one square and everybody can see thirty squares later — a 70.5px grid
// forced to 70 has walked a full square off the picture by the far edge. That
// drift is what "the grid cannot be made the right size" was. The steppers
// still move by a whole pixel, because that is the unit a hand nudges in; only
// what may be *stored* has changed.
//
// It is still a fiddly job done by eye, though, which is why the real answer to
// sizing is the **Grid tool** on the map itself: drag a box across a few of the
// picture's own squares and it works the size out — see calibrateMapGrid() in
// battlemap-view.js. These boxes are where that answer lands.
function buildGridControls(map) {
  const wrap = document.createElement('div');
  wrap.className = 'map-grid-controls';

  const row = (label, key, min, max, hint) => {
    const g = mapGrid(map);
    const r = document.createElement('div');
    r.className = 'map-grid-row';
    const lbl = document.createElement('span');
    lbl.className = 'map-grid-label';
    lbl.textContent = label;
    lbl.title = hint;

    const dec = document.createElement('button');
    dec.className = 'shop-price-step';
    dec.type = 'button';
    dec.textContent = '−';
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'shop-price-input';
    input.min = min; input.max = max;
    // `any` rather than a decimal step: the steppers below are the whole-pixel
    // nudge, and the browser's own validation must not round off an exact size
    // the calibration drag worked out.
    input.step = 'any';
    input.value = roundGridValue(g[key]);
    input.title = hint;
    const inc = document.createElement('button');
    inc.className = 'shop-price-step';
    inc.type = 'button';
    inc.textContent = '+';

    const set = v => {
      const clamped = Math.max(min, Math.min(max, roundGridValue(v)));
      input.value = clamped;
      updateMapGrid(map.id, { [key]: clamped });
    };
    const cur = () => { const v = parseFloat(input.value); return Number.isFinite(v) ? v : 0; };
    // A stepper nudges by a whole pixel *from wherever the value is*, so a
    // calibrated 70.42 steps to 69.42 rather than snapping to 69 and throwing
    // the alignment away.
    dec.addEventListener('click', () => set(cur() - 1));
    inc.addEventListener('click', () => set(cur() + 1));
    // On change rather than input: every keystroke would be its own write.
    input.addEventListener('change', () => set(Number.isFinite(parseFloat(input.value)) ? parseFloat(input.value) : min));

    r.appendChild(lbl);
    r.appendChild(dec);
    r.appendChild(input);
    r.appendChild(inc);
    return r;
  };

  wrap.appendChild(row('Cell', 'size', 8, 600, 'How many of the picture’s own pixels one square is — decimals welcome, and usually necessary'));
  wrap.appendChild(row('Left', 'offsetX', -600, 600, 'Slide the whole grid sideways'));
  wrap.appendChild(row('Top', 'offsetY', -600, 600, 'Slide the whole grid up and down'));

  const g = mapGrid(map);
  const show = document.createElement('label');
  show.className = 'checkbox-label';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = g.visible !== false;
  cb.addEventListener('change', () => updateMapGrid(map.id, { visible: cb.checked }));
  const sp = document.createElement('span');
  sp.textContent = 'Draw the grid on the map';
  show.appendChild(cb);
  show.appendChild(sp);
  wrap.appendChild(show);

  const hint = document.createElement('p');
  hint.className = 'shop-price-note';
  hint.textContent = 'Pick the Grid tool on the map and drag a box across a few of the picture’s own '
    + 'squares to work the size out. Creatures snap to these squares whether the grid is drawn or '
    + 'not. Hex grids are not built yet.';
  wrap.appendChild(hint);

  return wrap;
}

// =============================================================================
// IMPORTING A MAP
// =============================================================================
// A map arrives as a picture, from a file on the GM's disk or from a link. It
// is then stored **with the map in the database**, as a data URL, rather than
// as a pointer to wherever it came from: a link rots, a file on one person's
// disk is not a map anybody else can open, and this project has no file storage
// of its own to put one in. That is a real cost — the picture is the whole of a
// map's weight — so an imported file is scaled down to something a table can
// actually read off a screen before it is stored.
//
// A **link** the browser refuses to redraw (a host that will not share its
// pixels across origins) is kept as the link itself. It still works as a
// picture; it simply cannot be shrunk on the way in, and a member whose network
// cannot reach that host sees an empty map rather than a slow one.
const MAP_IMAGE_MAX_DIM = 2400;  // px on the long side after scaling
const MAP_IMAGE_QUALITY = 0.82;  // JPEG, which is what a photographed map wants
const MAP_IMAGE_MAX_BYTES = 6 * 1024 * 1024;

let mapModalId = null;
let mapModalImage = null; // { src, w, h } — the pending picture, not yet written

function openMapModal(mapId) {
  mapModalId = mapId;
  const map = mapId ? mapById(mapId) : null;
  mapModalImage = map && map.image ? { src: map.image, w: map.w, h: map.h } : null;

  document.getElementById('map-modal-title').textContent = map ? 'Edit Map' : 'Import Map';
  document.getElementById('map-name-input').value = map ? map.name : '';
  document.getElementById('map-url-input').value = '';
  document.getElementById('map-file-input').value = '';
  document.getElementById('map-confirm-btn').textContent = map ? 'Save' : 'Import';
  updateMapModalPreview('');
  showModal('map-modal');
}

function updateMapModalPreview(status) {
  const prev = document.getElementById('map-modal-preview');
  prev.style.backgroundImage = mapModalImage ? 'url("' + mapModalImage.src + '")' : '';
  prev.classList.toggle('empty', !mapModalImage);
  document.getElementById('map-modal-status').textContent = status || (mapModalImage
    ? mapModalImage.w + ' × ' + mapModalImage.h + ' pixels'
    : 'No picture chosen yet.');
}

// Loads a picture, scales it down if it is bigger than a table needs, and hands
// back a data URL with the dimensions that URL actually has. The dimensions
// matter as much as the picture does: every coordinate in the model is in
// *these* pixels.
function prepareMapImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // a canvas tainted by the picture cannot be read back
    img.onload = () => {
      const scale = Math.min(1, MAP_IMAGE_MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      if (scale === 1 && src.startsWith('data:') && src.length < MAP_IMAGE_MAX_BYTES) {
        resolve({ src, w, h });
        return;
      }
      try {
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve({ src: c.toDataURL('image/jpeg', MAP_IMAGE_QUALITY), w, h });
      } catch {
        resolve({ src, w: img.naturalWidth, h: img.naturalHeight });
      }
    };
    img.onerror = () => reject(new Error('That picture could not be loaded.'));
    img.src = src;
  });
}

document.getElementById('map-file-input').addEventListener('change', e => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  updateMapModalPreview('Reading the picture…');
  const reader = new FileReader();
  reader.onload = () => {
    prepareMapImage(String(reader.result))
      .then(img => { mapModalImage = img; updateMapModalPreview(''); })
      .catch(err => updateMapModalPreview(err.message));
  };
  reader.onerror = () => updateMapModalPreview('That file could not be read.');
  reader.readAsDataURL(file);
});

document.getElementById('map-url-btn').addEventListener('click', () => {
  const url = document.getElementById('map-url-input').value.trim();
  if (!url) return;
  updateMapModalPreview('Fetching the picture…');
  prepareMapImage(url)
    .then(img => { mapModalImage = img; updateMapModalPreview(''); })
    .catch(err => updateMapModalPreview(err.message));
});

document.getElementById('map-confirm-btn').addEventListener('click', () => {
  const name = document.getElementById('map-name-input').value.trim();
  if (!name) { alert('Give the map a name.'); return; }
  if (!mapModalImage) { alert('Choose a picture for the map.'); return; }
  if (mapModalImage.src.length > MAP_IMAGE_MAX_BYTES) {
    alert('That picture is too large to share with the party. Try a smaller one.');
    return;
  }

  const patch = { name, image: mapModalImage.src, w: mapModalImage.w, h: mapModalImage.h };
  if (mapModalId) {
    mapRef(mapModalId).update(patch);
  } else {
    const id = newMapId();
    // Opened before the write, so the echo of our own write lands on a panel
    // already showing the new map rather than bouncing back to the list.
    state.mapLibraryOpenId = id;
    mapRef(id).set({
      id, name: patch.name, image: patch.image, w: patch.w, h: patch.h,
      revealed: false,
      order: Date.now(),
      createdAt: Date.now(),
      grid: Object.assign({}, MAP_GRID_DEFAULT),
    });
  }
  hideModal('map-modal');
});

// =============================================================================
// A CREATURE
// =============================================================================
// One dialog for putting a creature on the board and for editing one already
// there, in the shape every other editor in this app takes. The three things it
// asks are the three the feature is built on: what it looks like, how big it
// is, and whose side it is on — and the third is the one that colours it, so
// the icons repaint as it changes rather than showing a colour the creature is
// about to stop being.
let creatureModalTarget = null; // { mapId, tokenId } — a null tokenId is a new one
let creatureModalIcon = CREATURE_ICONS[0];
let creatureModalHostility = 'hostile';
let creatureModalPos = null;    // where on the map it was asked for

function openCreatureModal(mapId, tokenId, pos) {
  const map = mapById(mapId);
  if (!map) return;
  const token = tokenId ? (map.tokens || {})[tokenId] : null;

  creatureModalTarget = { mapId, tokenId: tokenId || null };
  creatureModalPos = pos || null;
  creatureModalIcon = (token && token.icon) || CREATURE_ICONS[0];
  // A GM reaching for this is nearly always adding a monster; a player is
  // nearly always adding something of their own.
  creatureModalHostility = (token && token.hostility) || (isMapGM() ? 'hostile' : 'party');

  document.getElementById('creature-modal-title').textContent = token ? 'Edit Creature' : 'New Creature';
  document.getElementById('creature-name-input').value = (token && token.name) || '';
  document.getElementById('creature-confirm-btn').textContent = token ? 'Save' : 'Place';
  document.getElementById('creature-delete-btn').classList.toggle('hidden', !(token && canRemoveToken(token)));

  const sizeSel = document.getElementById('creature-size-select');
  sizeSel.innerHTML = '';
  CREATURE_SIZES.forEach(s => {
    const opt = document.createElement('option');
    opt.value = String(s.cells);
    opt.textContent = s.label + ' · ' + (s.cells === 0.5 ? '½' : s.cells)
      + ' square' + (s.cells === 1 ? '' : 's');
    sizeSel.appendChild(opt);
  });
  sizeSel.value = String((token && token.size) || 1);

  renderCreatureHostility();
  renderCreatureIcons();
  showModal('creature-modal');
}

function renderCreatureHostility() {
  const seg = document.getElementById('creature-hostility');
  seg.innerHTML = '';
  HOSTILITY_ORDER.forEach(key => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'seg-btn hostility-btn' + (key === creatureModalHostility ? ' active' : '');
    b.style.setProperty('--hc', hostilityColor(key));
    const dot = document.createElement('span');
    dot.className = 'hostility-dot';
    b.appendChild(dot);
    b.appendChild(document.createTextNode(HOSTILITY[key].label));
    b.addEventListener('click', () => {
      creatureModalHostility = key;
      renderCreatureHostility();
      renderCreatureIcons();
    });
    seg.appendChild(b);
  });
}

function renderCreatureIcons() {
  const grid = document.getElementById('creature-icons');
  grid.innerHTML = '';
  CREATURE_ICONS.forEach(icon => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'creature-icon-btn' + (icon === creatureModalIcon ? ' active' : '');
    b.style.setProperty('--hc', hostilityColor(creatureModalHostility));
    b.textContent = icon;
    b.addEventListener('click', () => { creatureModalIcon = icon; renderCreatureIcons(); });
    grid.appendChild(b);
  });
}

document.getElementById('creature-confirm-btn').addEventListener('click', () => {
  if (!creatureModalTarget) return;
  const mapId = creatureModalTarget.mapId;
  const tokenId = creatureModalTarget.tokenId;
  const map = mapById(mapId);
  if (!map) { hideModal('creature-modal'); return; }

  const name = document.getElementById('creature-name-input').value.trim().slice(0, 40);
  const size = parseFloat(document.getElementById('creature-size-select').value) || 1;
  const fields = { name, size, icon: creatureModalIcon, hostility: creatureModalHostility };

  if (tokenId) {
    // The footprint may have changed, so it re-snaps: a Large creature centres
    // on a line where a Medium one centres in a square.
    const token = (map.tokens || {})[tokenId] || { x: 0, y: 0 };
    const snapped = snapToGrid(map, token.x, token.y, size);
    updateToken(mapId, tokenId, Object.assign({}, fields, snapped));
  } else {
    // Dropped where it was asked for, or in the middle of the map when the
    // dialog was opened from the toolbar rather than from a spot on the board.
    const at = creatureModalPos || { x: (map.w || 1000) / 2, y: (map.h || 1000) / 2 };
    const snapped = snapToGrid(map, at.x, at.y, size);
    addToken(mapId, Object.assign({}, fields, snapped));
  }
  hideModal('creature-modal');
});

document.getElementById('creature-delete-btn').addEventListener('click', () => {
  if (!creatureModalTarget || !creatureModalTarget.tokenId) return;
  removeToken(creatureModalTarget.mapId, creatureModalTarget.tokenId);
  hideModal('creature-modal');
});
