// =============================================================================
// BATTLEMAP — the table's maps: the model, the GM's library, and line of sight
// =============================================================================
'use strict';

// A battle map belongs to the **table**, exactly as a shop and the chat log do.
// The GM keeps a library of them, picks the one the party is standing on, and
// reveals it when they walk in; everyone holding the code then draws the same
// map, the same creatures on it and the same walls between them. So Firebase is
// the only copy — `state.battlemap` is a read-through cache of
// `parties/<code>/battlemap`, refreshed by the subscription that already
// carries the roster, the shops and the chat.
//
//   parties/<code>/battlemap/activeId          which map the party is on
//   parties/<code>/battlemap/maps/<mapId>
//     { id, name, image, w, h, order, revealed, createdAt,
//       grid:   { type, size, offsetX, offsetY, visible },
//       tokens: { <id>: { id, name, icon, x, y, size, hostility, ownerUid } },
//       walls:  { <id>: { id, kind:'rect'|'circle', x, y, w, h, r } },
//       masks:  { <id>: { id, mode:'hide'|'show', x, y, w, h } } }
//
// **Nothing about a map is in the save file.** A map is not part of a
// character, and the GM's copy is the only one — the same argument shop.js
// makes, and the reason there is no map at all without a campaign to be at.
//
// **Every coordinate in the model is in the image's own pixels**, never in
// screen pixels and never in cells. The camera is this browser's furniture and
// the grid can be resized under the tokens at any moment; a token stored in
// either of those frames would move the instant somebody else zoomed, or the
// GM nudged the grid a pixel to line it up. Image pixels are the one frame
// every client already agrees on, because they come with the picture.
//
// Reveal is **pacing, not security**, exactly as a shop's is: an unrevealed map
// is filtered out on the client, and a player reading the database directly
// could still find it. The fog of war carries the same caveat and is worth
// stating on its own — see the note above `computeVision()`.
//
// This file is the model, the Firebase seam, the GM's library panel and the
// geometry. `battlemap-view.js` is the map itself: the camera, the canvas and
// every pointer that lands on it.

// =============================================================================
// SHAPE OF A MAP
// =============================================================================
const MAP_GRID_DEFAULT = { type: 'square', size: 70, offsetX: 0, offsetY: 0, visible: true };

// Hostility is the token's whole colour scheme, and the three are the three
// answers a table actually gives about a creature on the board. The `color`
// here is only the fallback: the real one is the `--hostility-*` token, so each
// palette can tune it — see hostilityColor() below.
const HOSTILITY = {
  party:   { label: 'Party',   color: '#2f7d3f' },
  neutral: { label: 'Neutral', color: '#b08108' },
  hostile: { label: 'Hostile', color: '#a5312a' },
};
const HOSTILITY_ORDER = ['party', 'neutral', 'hostile'];

// Sizes as the rules give them, measured in grid cells. A token's `size` is
// stored as that number rather than as the word, so the geometry never has to
// look one up — and a homebrew creature can be given a size the list has no
// name for without anything breaking.
const CREATURE_SIZES = [
  { id: 'tiny',        label: 'Tiny',        cells: 0.5 },
  { id: 'medium',      label: 'Small / Medium', cells: 1 },
  { id: 'large',       label: 'Large',       cells: 2 },
  { id: 'huge',        label: 'Huge',        cells: 3 },
  { id: 'gargantuan',  label: 'Gargantuan',  cells: 4 },
];

// The glyph in the middle of the disc. Deliberately a short, opinionated list
// rather than a free text field: a token is read at a glance across a shared
// map, and two characters of someone's own choosing is how you get a board
// nobody else can parse.
const CREATURE_ICONS = [
  '🗡️', '🏹', '🛡️', '🪄', '✨', '🎵', '🐺', '🐉', '🕷️', '🦇',
  '💀', '👹', '👻', '🧟', '🐻', '🐍', '🔥', '🧊', '⭐', '❓',
];

function mapGrid(map) {
  return { ...MAP_GRID_DEFAULT, ...(map?.grid ?? {}) };
}

// One cell, in image pixels. Never let this be zero: it divides.
function mapCellSize(map) {
  const s = mapGrid(map).size;
  return Number.isFinite(s) && s >= 4 ? s : MAP_GRID_DEFAULT.size;
}

function mapTokens(map) {
  return Object.values(map?.tokens ?? {}).filter(t => t && t.id);
}
function mapWalls(map) {
  return Object.values(map?.walls ?? {}).filter(w => w && w.id);
}
function mapMasks(map) {
  return Object.values(map?.masks ?? {}).filter(m => m && m.id);
}

// A token's radius in image pixels. Tokens are circular — that is the whole of
// how hostility is read — so one number describes the whole footprint.
function tokenRadius(map, token) {
  return (token.size ?? 1) * mapCellSize(map) / 2;
}

// Read out of CSS and cached, exactly as rarityColor() is and for the same
// reason: the value is baked into a canvas fill and into the icon buttons'
// inline `--hc`, so a palette swap has to clear the cache and redraw. That is
// `rerenderThemedContent()`'s job, and it calls the clear below.
let _hostilityColorCache = {};

function hostilityColor(h) {
  const key = HOSTILITY[h] ? h : 'neutral';
  if (_hostilityColorCache[key]) return _hostilityColorCache[key];
  const fromCss = getComputedStyle(document.documentElement)
    .getPropertyValue('--hostility-' + key).trim();
  const color = fromCss || HOSTILITY[key].color;
  _hostilityColorCache[key] = color;
  return color;
}

function clearHostilityColorCache() { _hostilityColorCache = {}; }

function newMapId()   { return 'map_'  + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6); }
function newPieceId(p) { return p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6); }

// =============================================================================
// FIREBASE
// =============================================================================
function battlemapPath(rest) {
  return `parties/${state.party.code}/battlemap` + (rest ? '/' + rest : '');
}
function battlemapRef(rest) { return firebaseDb.ref(battlemapPath(rest)); }
function mapRef(mapId, rest) { return battlemapRef('maps/' + mapId + (rest ? '/' + rest : '')); }

let partyBattlemapRef = null;

function subscribeToBattlemap(code) {
  unsubscribeFromBattlemap();
  if (!firebaseDb) return;
  partyBattlemapRef = firebaseDb.ref(`parties/${code}/battlemap`);
  partyBattlemapRef.on('value', snap => {
    const val = snap.val() ?? {};
    state.battlemap = { activeId: val.activeId ?? null, maps: val.maps ?? {} };
    // The map the GM was editing may have been deleted from another tab.
    if (state.mapLibraryOpenId && !state.battlemap.maps[state.mapLibraryOpenId]) state.mapLibraryOpenId = null;
    onBattlemapChanged();
  });
}

function unsubscribeFromBattlemap() {
  if (partyBattlemapRef) { partyBattlemapRef.off(); partyBattlemapRef = null; }
  state.battlemap = { activeId: null, maps: {} };
  state.mapLibraryOpenId = null;
  onBattlemapChanged();
}

// Everything that has to notice a map changing, in one place — the library
// pane, the button that opens the map, and the map itself when it is up.
function onBattlemapChanged() {
  syncLeftPanel();      // a first map makes the GM's Maps tab appear
  syncMapButton();
  onBattlemapDataChanged(); // battlemap-view.js — redraws, or closes a map that went away
}

// =============================================================================
// WHO SEES WHAT
// =============================================================================
function isMapGM() { return state.party.active && state.party.role === 'gm'; }

// The GM alone edits the map itself. Adding a creature is everyone's — see
// canAddCreature() — but the terrain, the grid and the fog are the GM's account
// of the world, and two people redrawing a wall at once is not a feature.
function canEditMap() { return isMapGM(); }

// A creature is something anybody at the table puts on the board: a player
// marking where their familiar went, the GM dropping in a wolf. Deliberately
// not gated by isReadOnly() — that guards a *character*, and a token on a
// shared map is not one.
function canAddCreature() { return state.party.active && isSignedIn(); }

function allMaps() {
  return Object.values(state.battlemap?.maps ?? {})
    .filter(m => m && m.id)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

function mapById(id) { return id ? (state.battlemap?.maps ?? {})[id] ?? null : null; }

function activeMapId() { return state.battlemap?.activeId ?? null; }

// The map the party is standing on, as *this* reader is allowed to see it. A
// GM always gets it; a player gets it only once it is revealed, so a GM can lay
// the next room out with the party still in this one.
function mapForViewer() {
  const map = mapById(activeMapId());
  if (!map) return null;
  if (isMapGM()) return map;
  return map.revealed ? map : null;
}

// =============================================================================
// GM EDITS
// =============================================================================
function setActiveMap(mapId) {
  if (!canEditMap() || !firebaseDb) return;
  battlemapRef('activeId').set(mapId ?? null);
}

function setMapRevealed(mapId, revealed) {
  if (!canEditMap() || !firebaseDb) return;
  mapRef(mapId).update({ revealed: !!revealed });
}

function deleteMap(map) {
  if (!canEditMap() || !firebaseDb) return;
  if (!confirm(`Delete “${map.name}”? Its creatures, walls and fog go with it.`)) return;
  if (state.mapLibraryOpenId === map.id) state.mapLibraryOpenId = null;
  if (activeMapId() === map.id) battlemapRef('activeId').set(null);
  mapRef(map.id).remove();
  renderMapPanel();
}

function updateMapGrid(mapId, patch) {
  if (!canEditMap() || !firebaseDb) return;
  const map = mapById(mapId);
  if (!map) return;
  mapRef(mapId, 'grid').set({ ...mapGrid(map), ...patch });
}

// ─── CREATURES ─────────────────────────────────────────────────────────────
function addToken(mapId, token) {
  if (!canAddCreature() || !firebaseDb) return null;
  const id = newPieceId('tok');
  mapRef(mapId, 'tokens/' + id).set({ ...token, id, ownerUid: ownPlayerId() ?? '' });
  return id;
}

function updateToken(mapId, tokenId, patch) {
  if (!firebaseDb || !state.party.active) return;
  mapRef(mapId, 'tokens/' + tokenId).update(patch);
}

// A creature is removed by whoever put it there, or by the GM. The board is
// shared, but a player sweeping away the GM's ambush is not a shared gesture.
function canRemoveToken(token) {
  return canEditMap() || (token.ownerUid && token.ownerUid === ownPlayerId());
}

function removeToken(mapId, tokenId) {
  if (!firebaseDb) return;
  mapRef(mapId, 'tokens/' + tokenId).remove();
}

// ─── WALLS AND FOG REGIONS ─────────────────────────────────────────────────
function addWall(mapId, wall) {
  if (!canEditMap() || !firebaseDb) return;
  const id = newPieceId('wall');
  mapRef(mapId, 'walls/' + id).set({ ...wall, id });
}

function addMask(mapId, mask) {
  if (!canEditMap() || !firebaseDb) return;
  const id = newPieceId('mask');
  mapRef(mapId, 'masks/' + id).set({ ...mask, id });
}

function removePiece(mapId, kind, id) {
  if (!canEditMap() || !firebaseDb) return;
  mapRef(mapId, kind + '/' + id).remove();
}

function clearMapPieces(mapId, kind, label) {
  if (!canEditMap() || !firebaseDb) return;
  if (!confirm(`Remove every ${label} from this map?`)) return;
  mapRef(mapId, kind).remove();
}

// =============================================================================
// GEOMETRY — line of sight
// =============================================================================
// The players see in straight lines from every party member, and a wall the GM
// has drawn stops the line where it meets it. That is the whole rule, and it is
// worked out here as a *polygon per source* rather than as a grid of lit cells:
// a map is a picture rather than a lattice, the grid can be moved under it, and
// a shadow that steps in whole cells would be a different game's fog.
//
// **It is pacing, not security**, and for the same reason a shop's reveal is:
// the fog is computed and drawn on the player's own machine from data every
// member can read. Somebody reading the database directly sees the whole board.
// Making that real would mean the GM's client publishing a per-player view, and
// the trade is not obviously worth it for a table that has agreed to play.

// A ray against an axis-aligned rectangle — the slab method. Returns the
// distance to the near face, or null for a miss. The ray's direction is a unit
// vector, so t comes back in image pixels.
function rayRect(ox, oy, dx, dy, r) {
  let tmin = -Infinity, tmax = Infinity;
  const slab = (o, d, lo, hi) => {
    if (Math.abs(d) < 1e-9) return o >= lo && o <= hi;
    const t1 = (lo - o) / d, t2 = (hi - o) / d;
    tmin = Math.max(tmin, Math.min(t1, t2));
    tmax = Math.min(tmax, Math.max(t1, t2));
    return true;
  };
  if (!slab(ox, dx, r.x, r.x + r.w)) return null;
  if (!slab(oy, dy, r.y, r.y + r.h)) return null;
  if (tmax < Math.max(tmin, 0)) return null;
  return tmin > 0 ? tmin : null; // a source inside the box is handled by the caller
}

function rayCircle(ox, oy, dx, dy, c) {
  const fx = ox - c.x, fy = oy - c.y;
  const b = 2 * (fx * dx + fy * dy);
  const cc = fx * fx + fy * fy - c.r * c.r;
  const disc = b * b - 4 * cc;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  const t1 = (-b - s) / 2, t2 = (-b + s) / 2;
  if (t1 > 0) return t1;
  if (t2 > 0) return t2;
  return null;
}

function pointInWall(x, y, w) {
  if (w.kind === 'circle') {
    const dx = x - w.x, dy = y - w.y;
    return dx * dx + dy * dy <= (w.r ?? 0) * (w.r ?? 0);
  }
  return x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h;
}

// The angles worth casting at. A uniform sweep alone leaves a rectangle's
// shadow with a scalloped edge — the polygon can only turn where a ray landed —
// so every corner gets three rays, one either side of it by a hair. The pair
// straddling the corner is what makes the shadow's edge a straight line: one
// ray stops on the box, its twin carries on past it.
const VISION_SWEEP = 180;   // the uniform fan, in rays
const VISION_NUDGE = 0.0006; // radians either side of a corner

function visionAngles(ox, oy, walls, bounds) {
  const angles = [];
  for (let i = 0; i < VISION_SWEEP; i++) angles.push(i * 2 * Math.PI / VISION_SWEEP);

  const aim = (px, py) => {
    const a = Math.atan2(py - oy, px - ox);
    angles.push(a - VISION_NUDGE, a, a + VISION_NUDGE);
  };

  walls.forEach(w => {
    if (w.kind === 'circle') {
      // The two tangents: past either of them the ray misses the disc entirely,
      // which is exactly where the shadow's edge is.
      const dx = w.x - ox, dy = w.y - oy;
      const d = Math.hypot(dx, dy);
      if (d <= (w.r ?? 0) || !d) return;
      const base = Math.atan2(dy, dx);
      const spread = Math.asin(Math.min(1, (w.r ?? 0) / d));
      angles.push(base - spread - VISION_NUDGE, base - spread + VISION_NUDGE,
                  base + spread - VISION_NUDGE, base + spread + VISION_NUDGE);
    } else {
      aim(w.x, w.y); aim(w.x + w.w, w.y); aim(w.x, w.y + w.h); aim(w.x + w.w, w.y + w.h);
    }
  });
  // The map's own corners, so the fan reaches them cleanly rather than by luck.
  aim(bounds.x, bounds.y); aim(bounds.x + bounds.w, bounds.y);
  aim(bounds.x, bounds.y + bounds.h); aim(bounds.x + bounds.w, bounds.y + bounds.h);

  return angles.sort((a, b) => a - b);
}

// The polygon one creature can see, in image pixels. Walls containing the
// source are skipped: a token nudged onto a wall the GM drew round a tree
// should not go blind, and there is no reading of "inside the obstacle" that
// makes a useful answer.
function computeVisionPolygon(ox, oy, walls, bounds) {
  const live = walls.filter(w => !pointInWall(ox, oy, w));
  // Never further than the far corner of the map, so the fan always terminates.
  const reach = Math.hypot(bounds.w, bounds.h) + Math.hypot(ox - bounds.x, oy - bounds.y);

  return visionAngles(ox, oy, live, bounds).map(a => {
    const dx = Math.cos(a), dy = Math.sin(a);
    let t = reach;
    for (const w of live) {
      const hit = w.kind === 'circle' ? rayCircle(ox, oy, dx, dy, w) : rayRect(ox, oy, dx, dy, w);
      if (hit !== null && hit < t) t = hit;
    }
    return [ox + dx * t, oy + dy * t];
  });
}

// Every creature the party can see out of. Green is the party, and a player
// seeing what another player sees falls straight out of that being a *union*
// rather than a per-viewer answer — which is what the request asked for, and
// what a table sitting round one board actually does.
function visionSources(map) {
  return mapTokens(map).filter(t => t.hostility === 'party');
}

// =============================================================================
// GEOMETRY — snapping
// =============================================================================
// A creature stands *in* squares, so where it snaps depends on how many it
// covers: an odd footprint centres on a square, an even one on the line between
// two, which is where a Large creature actually sits. Halving the cell for a
// tiny creature would put it in a corner the rules have nothing to say about,
// so it centres like a medium one.
function snapToGrid(map, x, y, sizeCells) {
  const g = mapGrid(map);
  const cell = mapCellSize(map);
  const cells = Math.max(1, Math.round(sizeCells ?? 1));
  const half = cells % 2 === 1 ? cell / 2 : 0;
  const snap = (v, off) => Math.round((v - off - half) / cell) * cell + off + half;
  return { x: snap(x, g.offsetX), y: snap(y, g.offsetY) };
}
