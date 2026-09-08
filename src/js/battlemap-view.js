// =============================================================================
// BATTLEMAP VIEW — the map itself: the camera, the canvas, the fog, the pointer
// =============================================================================
'use strict';

// The map is the **third view of the middle panel**, beside the inventory grid
// and the character sheet — `state.view === 'map'`, and `.map-view` on
// `#inventory-panel` is the whole of the swap, exactly as `.sheet-view` is.
//
// It used to be a page over the whole app, and that was the wrong shape for it.
// A board is where the party is standing, which is the same question the middle
// panel already answers; taking the screen over to show one cost the reader the
// character tabs above it, the chat and the dice beside it, and — for the GM —
// the Maps pane holding the grid controls they were trying to line the board up
// with. Every one of those is something you want *while* looking at the map.
//
// The one way it is not like the other two views: it is not a view of a
// *character*. So it is reached by the button in the corner rather than from a
// tab's menu, and a GM with nobody selected is allowed to be on it — the
// placeholder that otherwise covers this panel stands down for it.
//
// One `<canvas>`, drawn on demand. Not a rAF loop — nothing on a battle map
// animates on its own, and a loop repainting a 2400px picture sixty times a
// second to show the same thing is a laptop fan for no reason. Every path that
// changes what is on screen ends in `drawBattlemap()`.
//
// **The camera is this browser's furniture**, like the panel widths and the
// sheet layout: where *you* have scrolled to on a shared map says nothing about
// the map, and a GM zoomed in on a doorway must not drag every player's view
// along with them. It is not saved and never synced.
//
// **The fog is a second canvas**, at the picture's own resolution, holding one
// question per pixel: can the party see this? It is rebuilt only when something
// that could change the answer moves, and then read twice — drawn over the map,
// and sampled under each creature to decide whether that creature is on screen
// at all. One source for both, so what is hidden and what is dark can never
// disagree.

// =============================================================================
// THE VIEW'S OWN STATE
// =============================================================================
let mapOpen = false;
let mapViewId = null;          // which map a GM has open; players follow the party's
let mapCam = { x: 0, y: 0, scale: 1 };   // the world point at the centre, and the zoom
let mapTool = 'select';
let mapSelectedTokenId = null;

let mapCanvas = null, mapCtx = null;
let mapCanvasW = 0, mapCanvasH = 0;      // CSS pixels

// The picture, kept as one <img> and reloaded only when the map changes.
let mapImage = null, mapImageSrc = null, mapImageReady = false;

// The fog, at the picture's resolution (capped). `fogDirty` is what keeps it
// from being recomputed on every pan.
let fogCanvas = null, fogCtx = null, fogScale = 1, fogDirty = true;
let hiddenTokenIds = new Set();
const FOG_MAX_DIM = 1600;

// **How soft the fog's edge is, as a fraction of the map's longer side.** A
// fraction rather than a number of pixels: the softness then reads the same on a
// small map and a large one, and it is the map the reader is looking at rather
// than the fog canvas, whose resolution is an implementation detail that changes
// with `FOG_MAX_DIM`. Under a hundredth of the board — enough that a shadow has
// no drawn edge, small enough that it is still an answer about where the light
// stops.
const FOG_BLUR_FRACTION = 0.008;
const FOG_BLUR_MIN_PX = 2;

// A gesture in flight: a pan, a token being dragged, a shape being drawn, or
// the grid being stretched or slid.
let mapPan = null;      // { sx, sy, camX, camY }
let mapTokenDrag = null;// { id, x, y, dx, dy, moved }
let mapDrawing = null;  // { tool, x0, y0, x1, y1 }
let mapGridDrag = null; // { mode, held, pivot, sx, sy, grid0, grid, moved }

const MAP_MIN_SCALE = 0.05;
const MAP_MAX_SCALE = 8;

// **The Grid tool's handles are the picture's own corners and edges.** Drag one
// and the grid is magnified about the point opposite — a corner about the corner
// diagonally across, an edge about the middle of the edge facing it. Drag
// anywhere else and the whole grid slides. See THE GRID'S HANDLES below.
//
// Their reach is in *screen* pixels: a handle is something the hand aims at, so
// it is the same size however far the board is zoomed out.
const GRID_HANDLE_PX = 13;

// =============================================================================
// WHAT IS BEING LOOKED AT
// =============================================================================
// A player is always shown the map the party is on, because that is what "the
// map" means to them. A GM has a library, so they are shown the one they opened
// — which is normally the one in play, since opening a map from the library
// puts the party on it first.
function viewedMap() {
  if (!isMapGM()) return mapForViewer();
  return mapById(mapViewId) || mapForViewer();
}

// **Whether the middle panel is showing the board**, which is not the same as
// `state.view === 'map'`: the map can be pulled out from under the reader — a
// GM deleting it, or un-revealing it — and the panel then falls back to the
// grid while the field still says 'map'. Exactly the shape of the sheet's own
// `hasViewedCharacter()` caveat, and the reason this is a function both halves
// of the screen ask rather than a test each writes out for itself.
//
// `viewedMap()` rather than `mapForViewer()`: a GM opening a map from their
// library puts the party on it and shows it in the same breath, and the write
// saying which map is active has not come back from Firebase yet.
function mapViewIsShowing() {
  return state.view === 'map' && !!viewedMap();
}

// The button in the corner of the inventory panel exists only when there is
// something behind it. A player with no revealed map, or anyone with no
// campaign at all, gets no button rather than a button that opens nothing —
// and nobody gets one while the map is already what this panel is showing.
function syncMapButton() {
  const btn = document.getElementById('map-btn');
  if (!btn) return;
  const map = mapForViewer();
  const show = !!map && state.view !== 'map';
  btn.classList.toggle('hidden', !show);
  btn.title = map ? 'Open the battle map — ' + map.name : 'Battle map';
  // The stash's header runs along the bottom of the panel and the button lands
  // on it, so it is padded clear — see the note in battlemap.css.
  document.getElementById('inventory-panel').classList.toggle('has-map-btn', show);
}

// =============================================================================
// OPENING AND CLOSING
// =============================================================================
// Which view the reader was on before the map took the panel, so closing it
// hands them back what they were reading rather than always the grid. Session
// only, like every other piece of "where am I" in this app.
let mapReturnView = 'inventory';

function openBattlemap(mapId) {
  const map = mapId ? mapById(mapId) : mapForViewer();
  if (!map) return;
  mapViewId = map.id;
  mapSelectedTokenId = null;
  mapTool = 'select';
  fogDirty = true;
  if (state.view !== 'map') mapReturnView = state.view;
  // The GM's grid controls live in the Maps pane, and lining a grid up on a
  // picture is done by looking at the picture — so opening a map puts that pane
  // in front of them. It is the one pane whose subject is the thing now filling
  // the middle of the screen.
  if (isMapGM()) {
    state.mapLibraryOpenId = map.id;
    if (leftTabsAvailable().includes('map')) state.leftTab = 'map';
  }
  // Everything the panel has to do to show a map happens in onMapViewShown(),
  // driven from the single "what are we looking at" entry point — so opening
  // the map from here and arriving at it any other way cannot disagree.
  setInventoryView('map');
}

function closeBattlemap() {
  if (state.view !== 'map') return;
  setInventoryView(mapReturnView === 'map' ? 'inventory' : mapReturnView);
}

// Which map the camera was last framed for. Framing is not something to do
// every time the map is looked at: a GM who has zoomed into a doorway, glanced
// at a player's sheet and come back must find the doorway, not the whole board.
// It is a *different* map that has never been framed.
let mapFramedId = null;

// The panel has just started showing the map. **Called on every pass through
// `syncCharacterViewUI()`, which a party roster snapshot drives — so it does
// nothing at all unless the map was not already up.** Setting the canvas size
// clears it, and rebuilding the toolbar throws away whatever button the cursor
// was over; neither belongs on a presence heartbeat. A panel resize is the
// ResizeObserver's, and a data change is `onBattlemapDataChanged()`'s.
function onMapViewShown() {
  const wasOpen = mapOpen;
  mapOpen = true;
  if (!wasOpen) {
    // The canvas has no size until the panel is showing it, so it is measured
    // here rather than when the map was asked for.
    ensureMapCanvas();
    resizeMapCanvas();
    const map = viewedMap();
    if (map) {
      loadMapImage(map);
      if (mapFramedId !== map.id) { mapFramedId = map.id; fitMapToView(map); }
    }
    fogDirty = true;
    renderMapToolbar();
    drawBattlemap();
  }
  syncGridHint();
}

// The panel has stopped showing the map. A gesture in flight is abandoned —
// there is no canvas under the cursor any more to finish it on.
function onMapViewHidden() {
  if (!mapOpen) return;
  mapOpen = false;
  mapPan = mapTokenDrag = mapDrawing = mapGridDrag = null;
  mapSelectedTokenId = null;
  syncGridHint();
}

// Everything arriving from Firebase lands here — a creature somebody else
// moved, a wall the GM drew, the map being swapped out from under the party.
function onBattlemapDataChanged() {
  if (!mapOpen) return;
  const map = viewedMap();
  // The map was deleted, or a player's map was hidden again mid-session. There
  // is nothing to show, so the panel hands the reader back their inventory
  // rather than standing empty.
  if (!map) { closeBattlemap(); return; }
  loadMapImage(map);
  fogDirty = true;
  renderMapToolbar();
  drawBattlemap();
}

// =============================================================================
// THE PICTURE
// =============================================================================
function loadMapImage(map) {
  if (mapImageSrc === map.image && mapImage) return;
  mapImageSrc = map.image;
  mapImageReady = false;
  mapImage = new Image();
  mapImage.crossOrigin = 'anonymous';
  mapImage.onload = () => { mapImageReady = true; drawBattlemap(); };
  mapImage.onerror = () => { mapImageReady = false; drawBattlemap(); };
  mapImage.src = map.image || '';
}

// The picture's own pixels are the model's frame of reference, so the stored
// dimensions are what everything is measured against — never the <img>'s, which
// are not known until it loads and are not what the coordinates were written in.
function mapBounds(map) {
  return { x: 0, y: 0, w: map.w || 1000, h: map.h || 1000 };
}

// =============================================================================
// THE CAMERA
// =============================================================================
function worldToScreen(wx, wy) {
  return {
    x: (wx - mapCam.x) * mapCam.scale + mapCanvasW / 2,
    y: (wy - mapCam.y) * mapCam.scale + mapCanvasH / 2,
  };
}

function screenToWorld(clientX, clientY) {
  const b = mapCanvas.getBoundingClientRect();
  return {
    x: (clientX - b.left - mapCanvasW / 2) / mapCam.scale + mapCam.x,
    y: (clientY - b.top - mapCanvasH / 2) / mapCam.scale + mapCam.y,
  };
}

function fitMapToView(map) {
  const b = mapBounds(map);
  if (!mapCanvasW || !mapCanvasH) return;
  const s = Math.min(mapCanvasW / b.w, mapCanvasH / b.h) * 0.96;
  mapCam = { x: b.w / 2, y: b.h / 2, scale: Math.max(MAP_MIN_SCALE, Math.min(MAP_MAX_SCALE, s)) };
}

// Zoom about the cursor rather than about the centre: the thing under the
// pointer is the thing being looked at, and it should stay put.
function zoomMapAt(clientX, clientY, factor) {
  const before = screenToWorld(clientX, clientY);
  mapCam.scale = Math.max(MAP_MIN_SCALE, Math.min(MAP_MAX_SCALE, mapCam.scale * factor));
  const after = screenToWorld(clientX, clientY);
  mapCam.x += before.x - after.x;
  mapCam.y += before.y - after.y;
  drawBattlemap();
}

// =============================================================================
// THE FOG
// =============================================================================
// Rebuilt from the map's walls and whoever is standing on it, then used twice:
// painted over the board, and sampled under each creature. Black means "the
// party cannot see here", so punching a hole in it is what vision does.
//
// **A map with nobody on it has no fog at all.** With no party member to see
// out of, the honest arithmetic is that nothing is visible — and a board that
// opens entirely black the first time it is used reads as broken rather than as
// dark. Fog begins the moment somebody is standing there to cast it.
// **The edge of a shadow is not a line.** Light falls off, eyes are not
// cameras, and a hard black boundary crossing a picture of a room reads as a
// polygon rather than as dark. So every hole the vision cuts, and every region
// the GM paints, is drawn through a blur.
//
// It is done to the **shapes as they are cut**, not to the finished canvas. A
// blur over the whole thing would soften the fog's own outer boundary too, and
// that boundary is the edge of the map — where the dark has to stay solid, or
// the board would end in a glow of half-light leaking in from beyond the
// picture.
//
// The radius is in fog-canvas pixels, which is where the drawing happens.
// Returns `null` where the browser has no canvas filters, and the caller then
// draws exactly what it always did: a crisp edge is a worse shadow, not a broken
// one.
function fogBlurFilter(fx) {
  const px = Math.max(FOG_BLUR_MIN_PX, Math.round(Math.max(fogCanvas.width, fogCanvas.height) * FOG_BLUR_FRACTION));
  const filter = 'blur(' + px + 'px)';
  fx.filter = filter;
  const supported = fx.filter === filter;
  fx.filter = 'none';
  return supported ? filter : null;
}

function buildFog(map) {
  const b = mapBounds(map);
  const sources = visionSources(map);
  const masks = mapMasks(map);
  hiddenTokenIds = new Set();

  if (!sources.length && !masks.length) { fogCanvas = fogCtx = null; fogDirty = false; return; }

  fogScale = Math.min(1, FOG_MAX_DIM / Math.max(b.w, b.h));
  if (!fogCanvas) fogCanvas = document.createElement('canvas');
  fogCanvas.width = Math.max(1, Math.round(b.w * fogScale));
  fogCanvas.height = Math.max(1, Math.round(b.h * fogScale));
  fogCtx = fogCanvas.getContext('2d', { willReadFrequently: true });

  const fx = fogCtx;
  fx.setTransform(fogScale, 0, 0, fogScale, 0, 0);
  fx.filter = 'none';
  fx.globalCompositeOperation = 'source-over';
  fx.fillStyle = '#000';
  fx.fillRect(0, 0, b.w, b.h);

  // The dark itself is laid down hard — it is the whole canvas, and its only
  // edge is the edge of the map. Everything cut *out* of it is what gets the
  // soft edge.
  const blur = fogBlurFilter(fx);

  // What each party member can see, cut straight out of the dark.
  const walls = mapWalls(map);
  fx.globalCompositeOperation = 'destination-out';
  fx.fillStyle = '#000';
  if (blur) fx.filter = blur;
  sources.forEach(t => {
    const at = tokenDrawPos(t);
    const poly = computeVisionPolygon(at.x, at.y, walls, b);
    if (poly.length < 3) return;
    fx.beginPath();
    fx.moveTo(poly[0][0], poly[0][1]);
    for (let i = 1; i < poly.length; i++) fx.lineTo(poly[i][0], poly[i][1]);
    fx.closePath();
    fx.fill();
  });

  // The GM's own hand, applied over the arithmetic. A revealed region beats
  // what the walls say; an obscured one beats everything, so it goes last —
  // "I have decided you cannot see this" is the strongest claim on the map.
  // Softened alike: a hand-drawn region is still a claim about what can be seen,
  // and the one place on the board where the dark had a drawn edge would be
  // exactly the place the eye went to.
  masks.filter(m => m.mode === 'show').forEach(m => fx.fillRect(m.x, m.y, m.w, m.h));
  fx.globalCompositeOperation = 'source-over';
  fx.fillStyle = '#000';
  masks.filter(m => m.mode === 'hide').forEach(m => fx.fillRect(m.x, m.y, m.w, m.h));
  fx.filter = 'none';

  // Which creatures that leaves off the board. Sampled from the fog rather than
  // recomputed from the polygons, so what is hidden and what is dark are one
  // answer: a creature is on screen if any part of its disc is in the light.
  //
  // The blur costs this nothing. A half-alpha threshold on a soft edge is the
  // middle of the ramp, which is where the hard edge used to be — so a creature
  // standing on the boundary is judged exactly as before, and one standing in
  // the new penumbra is judged by whether it is more in the light than out.
  mapTokens(map).forEach(t => {
    const at = tokenDrawPos(t);
    const r = tokenRadius(map, t) * 0.7;
    const probes = [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]];
    const seen = probes.some(p => fogAlphaAt(at.x + p[0], at.y + p[1]) < 128);
    if (!seen) hiddenTokenIds.add(t.id);
  });

  fogDirty = false;
}

function fogAlphaAt(wx, wy) {
  if (!fogCtx) return 0;
  const x = Math.round(wx * fogScale), y = Math.round(wy * fogScale);
  if (x < 0 || y < 0 || x >= fogCanvas.width || y >= fogCanvas.height) return 255; // off the map is dark
  try { return fogCtx.getImageData(x, y, 1, 1).data[3]; } catch { return 0; }
}

// A token being dragged is drawn — and casts its vision — from where the cursor
// has it, not from where the database still says it is.
function tokenDrawPos(token) {
  if (mapTokenDrag && mapTokenDrag.id === token.id) return { x: mapTokenDrag.x, y: mapTokenDrag.y };
  return { x: token.x, y: token.y };
}

// =============================================================================
// DRAWING
// =============================================================================
function ensureMapCanvas() {
  if (mapCanvas) return;
  mapCanvas = document.getElementById('map-canvas');
  mapCtx = mapCanvas.getContext('2d');
  mapCanvas.addEventListener('pointerdown', onMapPointerDown);
  mapCanvas.addEventListener('pointermove', onMapPointerMove);
  mapCanvas.addEventListener('pointerup', onMapPointerUp);
  mapCanvas.addEventListener('pointercancel', onMapPointerUp);
  mapCanvas.addEventListener('dblclick', onMapDoubleClick);
  mapCanvas.addEventListener('wheel', onMapWheel, { passive: false });
  // The right button pans, so the browser's own menu would land on every pan.
  mapCanvas.addEventListener('contextmenu', e => e.preventDefault());
  new ResizeObserver(() => { resizeMapCanvas(); drawBattlemap(); }).observe(mapCanvas.parentElement);
}

function resizeMapCanvas() {
  if (!mapCanvas) return;
  const b = mapCanvas.parentElement.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  mapCanvasW = Math.max(1, Math.round(b.width));
  mapCanvasH = Math.max(1, Math.round(b.height));
  mapCanvas.width = Math.round(mapCanvasW * dpr);
  mapCanvas.height = Math.round(mapCanvasH * dpr);
  mapCanvas.style.width = mapCanvasW + 'px';
  mapCanvas.style.height = mapCanvasH + 'px';
}

function drawBattlemap() {
  if (!mapOpen || !mapCanvas) return;
  const map = viewedMap();
  const ctx = mapCtx;
  const dpr = window.devicePixelRatio || 1;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, mapCanvasW, mapCanvasH);
  document.getElementById('map-empty').classList.toggle('hidden', !!map);
  if (!map) return;

  if (fogDirty) buildFog(map);

  const b = mapBounds(map);
  ctx.save();
  ctx.translate(mapCanvasW / 2 - mapCam.x * mapCam.scale, mapCanvasH / 2 - mapCam.y * mapCam.scale);
  ctx.scale(mapCam.scale, mapCam.scale);

  // The board itself
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(b.x, b.y, b.w, b.h);
  if (mapImageReady) ctx.drawImage(mapImage, b.x, b.y, b.w, b.h);

  drawMapGrid(ctx, map, b);
  if (canEditMap()) drawMapWalls(ctx, map);
  drawMapFog(ctx, b);
  if (canEditMap()) drawMapMasks(ctx, map);
  drawMapTokens(ctx, map);
  drawMapDrawing(ctx);
  if (mapTool === 'grid' && canEditMap()) drawGridHandles(ctx, map);

  ctx.restore();
}

// The grid as it is *being* dragged, which is not yet the grid as it is stored:
// a size or an offset is written once, on release, rather than a write per
// pointermove into a database every other member is reading. Everything that
// draws the grid asks these two rather than the model's own, so what is under
// the cursor is what the release will commit.
function viewGrid(map) {
  return mapGridDrag ? mapGridDrag.grid : mapGrid(map);
}
function viewCellSize(map) {
  const s = viewGrid(map).size;
  return Number.isFinite(s) && s >= 4 ? s : mapCellSize(map);
}

function drawMapGrid(ctx, map, b) {
  const g = viewGrid(map);
  // While the Grid tool is up the grid is what is being worked on, so it is
  // drawn whether or not it is switched on for play and whether or not it is
  // faint enough to read against the picture. Turning it off to look at the map
  // and then being unable to line it up is the trap this avoids.
  const tuning = mapTool === 'grid';
  if (g.visible === false && !tuning) return;
  const cell = viewCellSize(map);
  if (cell * mapCam.scale < 4) return; // too fine to read; drawing it is just noise

  ctx.save();
  ctx.beginPath();
  ctx.rect(b.x, b.y, b.w, b.h);
  ctx.clip();
  ctx.strokeStyle = tuning ? 'rgba(255, 196, 64, 0.85)' : 'rgba(0,0,0,0.38)';
  ctx.lineWidth = Math.max(tuning ? 1 : 0.6, (tuning ? 1.5 : 1) / mapCam.scale);
  const startX = g.offsetX - Math.ceil((g.offsetX - b.x) / cell) * cell;
  const startY = g.offsetY - Math.ceil((g.offsetY - b.y) / cell) * cell;
  ctx.beginPath();
  for (let x = startX; x <= b.x + b.w; x += cell) { ctx.moveTo(x, b.y); ctx.lineTo(x, b.y + b.h); }
  for (let y = startY; y <= b.y + b.h; y += cell) { ctx.moveTo(b.x, y); ctx.lineTo(b.x + b.w, y); }
  ctx.stroke();
  ctx.restore();
}

// Walls are the GM's own notes about the room, not part of the picture, so only
// the GM sees them — a player sees what they do, which is the dark behind them.
function drawMapWalls(ctx, map) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 92, 92, 0.9)';
  ctx.fillStyle = 'rgba(255, 92, 92, 0.16)';
  ctx.lineWidth = Math.max(1, 2 / mapCam.scale);
  mapWalls(map).forEach(w => {
    ctx.beginPath();
    if (w.kind === 'circle') ctx.arc(w.x, w.y, w.r || 1, 0, Math.PI * 2);
    else ctx.rect(w.x, w.y, w.w, w.h);
    ctx.fill();
    ctx.stroke();
  });
  ctx.restore();
}

function drawMapMasks(ctx, map) {
  ctx.save();
  ctx.lineWidth = Math.max(1, 2 / mapCam.scale);
  ctx.setLineDash([8 / mapCam.scale, 6 / mapCam.scale]);
  mapMasks(map).forEach(m => {
    ctx.strokeStyle = m.mode === 'hide' ? 'rgba(150, 110, 220, 0.95)' : 'rgba(90, 210, 130, 0.95)';
    ctx.strokeRect(m.x, m.y, m.w, m.h);
  });
  ctx.restore();
}

// The GM is shown the fog as a wash rather than as a wall: they have to see
// both what the players cannot see *and* what is standing in it.
function drawMapFog(ctx, b) {
  if (!fogCanvas) return;
  ctx.save();
  ctx.globalAlpha = canEditMap() ? 0.45 : 1;
  ctx.drawImage(fogCanvas, b.x, b.y, b.w, b.h);
  ctx.restore();
}

function drawMapTokens(ctx, map) {
  const cell = mapCellSize(map);
  mapTokens(map).forEach(token => {
    if (!canEditMap() && hiddenTokenIds.has(token.id)) return;
    const at = tokenDrawPos(token);
    const r = tokenRadius(map, token);
    const color = hostilityColor(token.hostility);
    const dim = canEditMap() && hiddenTokenIds.has(token.id);

    ctx.save();
    ctx.globalAlpha = dim ? 0.5 : 1;

    ctx.beginPath();
    ctx.arc(at.x, at.y, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(16, 12, 8, 0.82)';
    ctx.fill();
    ctx.lineWidth = Math.max(2, r * 0.14);
    ctx.strokeStyle = color;
    ctx.stroke();

    if (token.id === mapSelectedTokenId) {
      ctx.beginPath();
      ctx.arc(at.x, at.y, r + ctx.lineWidth, 0, Math.PI * 2);
      ctx.setLineDash([r * 0.3, r * 0.22]);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = Math.max(1.5, r * 0.08);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (token.icon) {
      ctx.font = (r * 1.05) + 'px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(token.icon, at.x, at.y + r * 0.05);
    }

    if (token.name) {
      const fs = Math.max(9, cell * 0.24);
      ctx.font = '600 ' + fs + 'px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const y = at.y + r + fs * 0.35;
      const w = ctx.measureText(token.name).width;
      ctx.fillStyle = 'rgba(12, 9, 5, 0.78)';
      ctx.fillRect(at.x - w / 2 - fs * 0.3, y - fs * 0.12, w + fs * 0.6, fs * 1.25);
      ctx.fillStyle = '#fff';
      ctx.fillText(token.name, at.x, y);
    }
    ctx.restore();
  });
}

// The shape under the cursor while it is being dragged out. Drawn from the same
// numbers the write will use, so what is committed is what was shown.
function drawMapDrawing(ctx) {
  if (!mapDrawing) return;
  const r = drawingRect(mapDrawing);
  ctx.save();
  ctx.lineWidth = Math.max(1, 2 / mapCam.scale);
  ctx.setLineDash([8 / mapCam.scale, 6 / mapCam.scale]);
  const tone = {
    'wall-rect':   'rgba(255, 92, 92, 0.95)',
    'wall-circle': 'rgba(255, 92, 92, 0.95)',
    'fog-hide':    'rgba(150, 110, 220, 0.95)',
    'fog-show':    'rgba(90, 210, 130, 0.95)',
  }[mapDrawing.tool] || 'rgba(255, 255, 255, 0.95)';
  ctx.strokeStyle = tone;
  ctx.fillStyle = tone.replace(/[\d.]+\)$/, '0.18)');
  ctx.beginPath();
  if (mapDrawing.tool === 'wall-circle') {
    ctx.arc(mapDrawing.x0, mapDrawing.y0, drawingRadius(mapDrawing), 0, Math.PI * 2);
  } else {
    ctx.rect(r.x, r.y, r.w, r.h);
  }
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// The rectangle a drag has swept out, whichever corner it was started from, and
// the radius a circle has reached. Both read the same `mapDrawing` the commit
// does, so the shape written is the shape that was shown.
function drawingRect(d) {
  return {
    x: Math.min(d.x0, d.x1), y: Math.min(d.y0, d.y1),
    w: Math.abs(d.x1 - d.x0), h: Math.abs(d.y1 - d.y0),
  };
}
function drawingRadius(d) { return Math.hypot(d.x1 - d.x0, d.y1 - d.y0); }

// =============================================================================
// THE GRID'S HANDLES
// =============================================================================
// **The grid is lined up by dragging the picture it has to line up with.** The
// handles are the map's own corners and edges: pull one and the grid is
// magnified about the point opposite — a corner about the corner diagonally
// across, an edge about the middle of the edge facing it — so that point stays
// welded where it is and the squares grow or shrink under the hand. Drag
// anywhere else and the whole grid slides.
//
// There is nothing else to set, and that is the point. A grid on somebody else's
// picture is two questions — how big is a square, and where does the run of them
// start — and a scale about a fixed point answers both at once, because the
// pivot *is* the start. The old versions of this both asked the reader for a
// third thing that was really about the tool rather than the map: a box to count
// squares in, then a frame to say how many squares it spanned. A corner of the
// picture needs no such thing, and it is the longest lever the map has to offer,
// so it is also the most precise: a square out by a pixel at one corner is
// visibly out by twenty at the other, and the drag divides that error by every
// square in between.
//
// **An edge is the same gesture with one axis held back.** A corner is pulled
// diagonally and both axes have an opinion about the magnification; an edge is
// pushed straight in or out and only the axis it faces does, so movement along
// the edge is ignored rather than averaged in. That is what makes it the finer
// of the two — a hand crossing the picture sideways cannot nudge the answer —
// and it is why the two kinds of handle differ in exactly one field.
//
// Nothing here is stored. The handles are drawn while the tool is up and are
// otherwise not part of the map at all.

// Where the handles are, in the picture's own pixels. `ix` / `iy` run 0 to 1
// across the map, so a half is the middle of an edge and the pivot is always
// `1 - i` — one rule that gives the corner its diagonal and the edge its
// opposite side without either being written out.
const GRID_HANDLE_SPOTS = [
  { ix: 0,   iy: 0,   axis: null },   // the four corners: both axes speak
  { ix: 1,   iy: 0,   axis: null },
  { ix: 0,   iy: 1,   axis: null },
  { ix: 1,   iy: 1,   axis: null },
  { ix: 0.5, iy: 0,   axis: 'y' },    // the four edges: only the axis they face
  { ix: 0.5, iy: 1,   axis: 'y' },
  { ix: 0,   iy: 0.5, axis: 'x' },
  { ix: 1,   iy: 0.5, axis: 'x' },
];

function mapGridHandles(map) {
  const b = mapBounds(map);
  return GRID_HANDLE_SPOTS.map(h => ({
    ...h,
    x: b.x + h.ix * b.w,
    y: b.y + h.iy * b.h,
    pivot: { x: b.x + (1 - h.ix) * b.w, y: b.y + (1 - h.iy) * b.h },
  }));
}

// Which handle the pointer is on, measured in **screen** pixels for the reason
// they are drawn at a fixed screen size: they are targets for the hand, not
// marks on the board. A handle scrolled off the edge simply cannot be grabbed —
// Fit brings the whole picture, and all eight, back.
//
// Nearest wins, so on a map squeezed small enough for a corner and an edge to
// overlap the reader gets whichever they were actually closer to.
function gridHandleAtPoint(map, clientX, clientY) {
  const r = mapCanvas.getBoundingClientRect();
  const px = clientX - r.left, py = clientY - r.top;
  let best = null, bestD = GRID_HANDLE_PX + 5;
  mapGridHandles(map).forEach(h => {
    const at = worldToScreen(h.x, h.y);
    const d = Math.hypot(px - at.x, py - at.y);
    if (d <= bestD) { bestD = d; best = h; }
  });
  return best;
}

// **How far the handle has been pulled, as one number.** Each axis says what it
// thinks the magnification is — how far the pointer now stands from the pivot,
// against how far the handle stood from it.
//
// A corner averages the two. Averaged rather than measured along the diagonal,
// so the answer does not depend on the shape of the picture: on a map twice as
// wide as it is tall, a diagonal measurement would let sideways movement do most
// of the work and the grid would pull unevenly under the hand.
//
// **An edge asks only the axis it faces**, which is the whole of what an edge
// handle is for. Its other axis is a span of zero — the handle and its pivot
// share that coordinate — so there is no ratio there to take, and movement along
// the edge is not a magnification of anything.
//
// A drag straight past the pivot is a magnification of nothing, and the size
// clamp is what catches it.
function scaleGridDrag(map, drag, w) {
  const held = drag.held, pivot = drag.pivot;
  const spanX = held.x - pivot.x, spanY = held.y - pivot.y;
  const kx = held.axis === 'y' || !spanX ? null : Math.abs((w.x - pivot.x) / spanX);
  const ky = held.axis === 'x' || !spanY ? null : Math.abs((w.y - pivot.y) / spanY);
  const ks = [kx, ky].filter(k => k !== null);
  if (!ks.length) return;
  const k = ks.reduce((a, b) => a + b, 0) / ks.length;
  drag.grid = { ...drag.grid0, ...scaleGridAbout(drag.grid0, pivot, k) };
}

function slideGridDrag(map, drag, e) {
  const dx = (e.clientX - drag.sx) / mapCam.scale;
  const dy = (e.clientY - drag.sy) / mapCam.scale;
  drag.grid = { ...drag.grid0, ...slideGridBy(drag.grid0, dx, dy) };
}

// The cursor a handle deserves: an edge moves one way, a corner both.
function gridHandleCursor(h) {
  if (h.axis === 'x') return 'ew-resize';
  if (h.axis === 'y') return 'ns-resize';
  return h.ix === h.iy ? 'nwse-resize' : 'nesw-resize';
}

// The handles, and — while one is held — what the drag has made of the squares.
// A corner is a square block and an edge is a bar lying along the edge it
// belongs to, so which axis a handle will move is legible before it is touched.
function drawGridHandles(ctx, map) {
  const accent = 'rgba(255, 196, 64, ';
  const px = 1 / mapCam.scale;           // one screen pixel, in image pixels
  const size = GRID_HANDLE_PX * px;
  const held = mapGridDrag && mapGridDrag.mode === 'scale' ? mapGridDrag.held : null;

  ctx.save();
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(20, 14, 6, 0.9)';
  ctx.lineWidth = Math.max(1, px);
  const LONG = size * 2.6, THIN = size * 0.55;
  mapGridHandles(map).forEach(h => {
    const on = held && held.ix === h.ix && held.iy === h.iy;
    ctx.fillStyle = accent + (on ? '1)' : '0.9)');
    // Lying along its own edge, and thin across it: the shape of a handle says
    // which way it will move before it is touched.
    const w = h.axis === 'y' ? LONG : h.axis === 'x' ? THIN : size;
    const t = h.axis === 'y' ? THIN : h.axis === 'x' ? LONG : size;
    // Tucked inside the picture rather than centred on the rim: half a handle
    // hanging off the map is half a handle to aim at, and the rim is exactly
    // where the reader has the least room.
    const x = h.x - (h.ix === 1 ? w : h.ix === 0.5 ? w / 2 : 0);
    const y = h.y - (h.iy === 1 ? t : h.iy === 0.5 ? t / 2 : 0);
    ctx.fillRect(x, y, w, t);
    ctx.strokeRect(x, y, w, t);
  });
  if (held) drawGridScaleLabel(ctx, map, held);
  ctx.restore();
}

// The size the squares have reached, said at the handle being pulled. The bar
// under the map says it too, but a reader mid-drag is looking at the handle in
// their hand and at the lines moving under it, not at a caption by their knee.
function drawGridScaleLabel(ctx, map, held) {
  const text = roundGridValue(viewCellSize(map)) + ' px per square';
  const fs = 13 / mapCam.scale;
  const pad = 10 / mapCam.scale;

  ctx.save();
  ctx.font = '600 ' + fs + 'px system-ui, sans-serif';
  // Pushed inwards off whichever edges the handle sits on, and centred on the
  // one it sits in the middle of — so the readout is on the board wherever the
  // handle is.
  ctx.textAlign = held.ix === 0 ? 'left' : held.ix === 1 ? 'right' : 'center';
  ctx.textBaseline = held.iy === 0 ? 'top' : held.iy === 1 ? 'bottom' : 'middle';
  const w = ctx.measureText(text).width;
  const x = held.x + (held.ix === 0 ? pad : held.ix === 1 ? -pad : 0);
  const y = held.y + (held.iy === 0 ? pad : held.iy === 1 ? -pad : 0);
  const boxX = (held.ix === 0 ? x : held.ix === 1 ? x - w : x - w / 2) - fs * 0.5;
  const boxY = (held.iy === 0 ? y : held.iy === 1 ? y - fs * 1.2 : y - fs * 0.6) - fs * 0.25;
  ctx.fillStyle = 'rgba(12, 9, 5, 0.82)';
  ctx.fillRect(boxX, boxY, w + fs, fs * 1.7);
  ctx.fillStyle = '#ffd479';
  ctx.fillText(text, x, y);
  ctx.restore();
}

// =============================================================================
// THE POINTER
// =============================================================================
function tokenAtPoint(map, x, y) {
  // Backwards, so the one drawn last — the one on top — is the one hit.
  const tokens = mapTokens(map);
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i];
    if (!canEditMap() && hiddenTokenIds.has(t.id)) continue;
    const at = tokenDrawPos(t);
    const r = tokenRadius(map, t);
    if (Math.hypot(x - at.x, y - at.y) <= r) return t;
  }
  return null;
}

function onMapPointerDown(e) {
  const map = viewedMap();
  if (!map) return;
  mapCanvas.setPointerCapture(e.pointerId);
  const w = screenToWorld(e.clientX, e.clientY);

  // The middle and right buttons always pan, whatever tool is up: reaching the
  // far side of a map must not mean putting a tool down first.
  if (e.button === 1 || e.button === 2) { mapPan = { sx: e.clientX, sy: e.clientY, camX: mapCam.x, camY: mapCam.y }; return; }
  if (e.button !== 0) return;

  if (mapTool === 'erase') { eraseMapPieceAt(map, w); return; }

  // The Grid tool is the picture: a corner or an edge of the map magnifies the
  // grid about the point opposite, anywhere else slides the whole thing. Sliding
  // from anywhere rather than from some handle is deliberate — the grid runs over
  // the whole picture, so the whole picture is its middle.
  if (mapTool === 'grid') {
    const handle = gridHandleAtPoint(map, e.clientX, e.clientY);
    const grid0 = mapGrid(map);
    mapGridDrag = handle
      ? { mode: 'scale', held: handle, pivot: handle.pivot, grid0, grid: grid0, moved: false }
      : { mode: 'slide', sx: e.clientX, sy: e.clientY, grid0, grid: grid0, moved: false };
    drawBattlemap();
    return;
  }

  if (mapTool === 'select') {
    const token = tokenAtPoint(map, w.x, w.y);
    if (token) {
      mapSelectedTokenId = token.id;
      mapTokenDrag = { id: token.id, x: token.x, y: token.y, dx: token.x - w.x, dy: token.y - w.y, moved: false };
      renderMapToolbar();
      drawBattlemap();
      return;
    }
    mapSelectedTokenId = null;
    renderMapToolbar();
    mapPan = { sx: e.clientX, sy: e.clientY, camX: mapCam.x, camY: mapCam.y };
    drawBattlemap();
    return;
  }

  mapDrawing = { tool: mapTool, x0: w.x, y0: w.y, x1: w.x, y1: w.y };
}

function onMapPointerMove(e) {
  if (mapPan) {
    mapCam.x = mapPan.camX - (e.clientX - mapPan.sx) / mapCam.scale;
    mapCam.y = mapPan.camY - (e.clientY - mapPan.sy) / mapCam.scale;
    drawBattlemap();
    return;
  }
  const map = viewedMap();
  if (!map) return;
  const w = screenToWorld(e.clientX, e.clientY);

  if (mapGridDrag) {
    if (mapGridDrag.mode === 'scale') scaleGridDrag(map, mapGridDrag, w);
    else slideGridDrag(map, mapGridDrag, e);
    mapGridDrag.moved = true;
    syncGridHint();
    drawBattlemap();
    return;
  }

  if (mapTokenDrag) {
    mapTokenDrag.x = w.x + mapTokenDrag.dx;
    mapTokenDrag.y = w.y + mapTokenDrag.dy;
    mapTokenDrag.moved = true;
    // **The fog does not follow the drag.** It is rebuilt when the creature is
    // let go, and not before — see the note on onMapPointerUp(). So the token
    // moves under the cursor and the dark stays where it was until the move is
    // a move rather than a look.
    drawBattlemap();
    return;
  }

  if (mapDrawing) {
    mapDrawing.x1 = w.x;
    mapDrawing.y1 = w.y;
    drawBattlemap();
    return;
  }

  // Nothing is held: the cursor is what says a corner or an edge of the picture
  // is a handle before it is grabbed — and which way that one will move — while
  // everywhere else says it will move the grid bodily.
  if (mapTool === 'grid') {
    const handle = gridHandleAtPoint(map, e.clientX, e.clientY);
    mapCanvas.style.cursor = handle ? gridHandleCursor(handle) : 'move';
  }
}

function onMapPointerUp(e) {
  if (mapCanvas.hasPointerCapture(e.pointerId)) mapCanvas.releasePointerCapture(e.pointerId);
  const map = viewedMap();
  mapPan = null;

  // The grid is written **once, on release**. Every pointermove has already
  // been drawn from the pending copy, so the reader has watched the answer the
  // whole way — but a write per move would be a write per move into a database
  // every other member of the party is reading.
  if (mapGridDrag) {
    const drag = mapGridDrag;
    mapGridDrag = null;
    // A click that never moved is not an edit. Without this every stray click
    // with the tool up would write the grid back to itself, and every member of
    // the party would be handed a snapshot to redraw for nothing.
    if (map && drag.moved) updateMapGrid(map.id, drag.grid);

    syncGridHint();
    drawBattlemap();
    return;
  }

  if (mapTokenDrag) {
    const drag = mapTokenDrag;
    mapTokenDrag = null;
    if (map && drag.moved) {
      const token = (map.tokens || {})[drag.id];
      const snapped = snapToGrid(map, drag.x, drag.y, token ? token.size : 1);
      updateToken(map.id, drag.id, snapped);
    }
    // **The fog settles here, and only here.** A creature carries the light, so
    // a fog that followed the drag would let anyone sweep their own token across
    // the board and read the whole map back out of the shadows without ever
    // letting go — a look costing nothing, and undoable. Where a creature is put
    // down is a decision; where it passed through on the way is not.
    fogDirty = true;
    drawBattlemap();
    return;
  }

  if (mapDrawing && map) {
    commitMapDrawing(map, mapDrawing);
    mapDrawing = null;
    drawBattlemap();
  }
}

function onMapDoubleClick(e) {
  const map = viewedMap();
  if (!map) return;
  const w = screenToWorld(e.clientX, e.clientY);
  const token = tokenAtPoint(map, w.x, w.y);
  // A double-click on a creature edits it; on bare board it puts a new one
  // exactly where the pointer is, which is the fastest way to lay out a fight.
  if (token) openCreatureModal(map.id, token.id, null);
  else if (canAddCreature()) openCreatureModal(map.id, null, w);
}

function onMapWheel(e) {
  e.preventDefault();
  zoomMapAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : 1 / 1.12);
}

// A shape too small to have been meant is a click that slipped, not a wall.
const MAP_MIN_SHAPE = 6;

function commitMapDrawing(map, d) {
  if (!canEditMap()) return;
  const r = drawingRect(d);
  if (d.tool === 'wall-circle') {
    const radius = drawingRadius(d);
    if (radius < MAP_MIN_SHAPE) return;
    addWall(map.id, { kind: 'circle', x: d.x0, y: d.y0, r: radius });
  } else if (d.tool === 'wall-rect') {
    if (r.w < MAP_MIN_SHAPE || r.h < MAP_MIN_SHAPE) return;
    addWall(map.id, { kind: 'rect', x: r.x, y: r.y, w: r.w, h: r.h });
  } else if (d.tool === 'fog-hide' || d.tool === 'fog-show') {
    if (r.w < MAP_MIN_SHAPE || r.h < MAP_MIN_SHAPE) return;
    addMask(map.id, { mode: d.tool === 'fog-hide' ? 'hide' : 'show', x: r.x, y: r.y, w: r.w, h: r.h });
  }
  fogDirty = true;
}

// The eraser takes whatever the GM drew, topmost first — a fog edit sits over a
// wall on the screen, so it comes off first too.
function eraseMapPieceAt(map, w) {
  const mask = mapMasks(map).slice().reverse()
    .find(m => w.x >= m.x && w.x <= m.x + m.w && w.y >= m.y && w.y <= m.y + m.h);
  if (mask) { removePiece(map.id, 'masks', mask.id); fogDirty = true; return; }
  const wall = mapWalls(map).slice().reverse().find(o => pointInWall(w.x, w.y, o));
  if (wall) { removePiece(map.id, 'walls', wall.id); fogDirty = true; }
}

// =============================================================================
// THE TOOLBAR
// =============================================================================
// Rebuilt whenever what it can offer changes, because most of what it offers is
// conditional: the drawing tools are the GM's, the creature buttons need a
// selection, and a player's strip is the short one that is left.
const MAP_TOOLS = [
  { id: 'select',      label: 'Select',  hint: 'Move creatures · drag the board to pan',   gm: false },
  { id: 'grid',        label: 'Grid',    hint: 'Line the grid up: drag a corner or edge of the map to size the squares, anywhere else to slide them', gm: true },
  { id: 'wall-rect',   label: 'Wall',    hint: 'Drag a rectangle over a wall — it blocks sight', gm: true },
  { id: 'wall-circle', label: 'Pillar',  hint: 'Drag out a circle over a tree or a pillar', gm: true },
  { id: 'fog-hide',    label: 'Obscure', hint: 'Drag a region the players cannot see into', gm: true },
  { id: 'fog-show',    label: 'Reveal',  hint: 'Drag a region the players can always see',  gm: true },
  { id: 'erase',       label: 'Erase',   hint: 'Click a wall or a fog edit to remove it',   gm: true },
];

// **The Grid tool's own bar, under the map**: what the two gestures are, and
// what the grid is at this moment. A gesture nobody can guess at needs saying
// once, where it is being done — and the numbers beside it are the same three
// the Maps pane has in boxes, so a reader watching the lines move can read what
// they have arrived at without looking away from the picture.
//
// There is nothing to set here. Everything the tool needs is on the map: the
// corners of the picture, and everywhere else.
function syncGridHint() {
  const el = document.getElementById('map-grid-hint');
  if (!el) return;
  const map = viewedMap();
  const on = mapOpen && mapTool === 'grid' && !!map && canEditMap();
  el.classList.toggle('hidden', !on);
  if (!on) return;
  const g = viewGrid(map);
  el.textContent = 'Drag a corner or an edge of the map to grow or shrink the squares — the far side stays put. '
    + 'Drag anywhere else to slide the grid. '
    + 'Now: ' + roundGridValue(g.size) + ' px, offset ' + roundGridValue(g.offsetX)
    + ' / ' + roundGridValue(g.offsetY) + '.';
}

function renderMapToolbar() {
  const map = viewedMap();
  document.getElementById('map-title').textContent = map ? map.name : 'Battle Map';

  // No role badge here any more: the map shares the panel with the header's
  // party badge now rather than covering it, and this strip has to survive
  // being squeezed into a middle panel the reader has dragged narrow.
  const gm = canEditMap();

  const tools = document.getElementById('map-tools');
  tools.innerHTML = '';
  if (!MAP_TOOLS.some(t => t.id === mapTool && (!t.gm || gm))) mapTool = 'select';
  MAP_TOOLS.filter(t => !t.gm || gm).forEach(t => {
    const b = document.createElement('button');
    b.className = 'map-tool' + (t.id === mapTool ? ' active' : '');
    b.textContent = t.label;
    b.title = t.hint;
    b.addEventListener('click', () => {
      mapTool = t.id;
      // The resize cursor belongs to the Grid tool, so it is put down with it.
      if (mapTool !== 'grid' && mapCanvas) mapCanvas.style.cursor = '';
      renderMapToolbar();
      drawBattlemap();
    });
    tools.appendChild(b);
  });
  syncGridHint();

  const acts = document.getElementById('map-actions');
  acts.innerHTML = '';

  if (canAddCreature() && map) {
    const add = document.createElement('button');
    add.className = 'btn-sm';
    setIconLabel(add, 'plus', 'Creature');
    add.title = 'Put a creature in the middle of the map — or double-click where you want it';
    add.addEventListener('click', () => openCreatureModal(map.id, null, null));
    acts.appendChild(add);
  }

  const selected = map && mapSelectedTokenId ? (map.tokens || {})[mapSelectedTokenId] : null;
  if (selected) {
    const edit = document.createElement('button');
    edit.className = 'btn-sm';
    edit.textContent = 'Edit ' + (selected.name || 'Creature');
    edit.addEventListener('click', () => openCreatureModal(map.id, selected.id, null));
    acts.appendChild(edit);
    if (canRemoveToken(selected)) {
      const rm = document.createElement('button');
      rm.className = 'btn-sm danger';
      rm.textContent = 'Remove';
      rm.addEventListener('click', () => {
        removeToken(map.id, selected.id);
        mapSelectedTokenId = null;
        renderMapToolbar();
      });
      acts.appendChild(rm);
    }
  }

  if (gm && map) {
    const g = mapGrid(map);
    const gridBtn = document.createElement('button');
    gridBtn.className = 'btn-sm' + (g.visible === false ? '' : ' on');
    gridBtn.textContent = g.visible === false ? 'Grid Off' : 'Grid On';
    gridBtn.title = 'Draw the grid on the map — creatures snap to it either way';
    gridBtn.addEventListener('click', () => updateMapGrid(map.id, { visible: g.visible === false }));
    acts.appendChild(gridBtn);
  }

  const fit = document.createElement('button');
  fit.className = 'btn-sm';
  fit.textContent = 'Fit';
  fit.title = 'Frame the whole map';
  fit.addEventListener('click', () => { if (map) { fitMapToView(map); drawBattlemap(); } });
  acts.appendChild(fit);
}

// =============================================================================
// WIRING
// =============================================================================
document.getElementById('map-btn').addEventListener('click', () => openBattlemap());
document.getElementById('map-close-btn').addEventListener('click', closeBattlemap);

document.addEventListener('keydown', e => {
  if (!mapOpen) return;
  if (document.querySelector('.modal:not(.hidden)')) return;
  // The map lives in a panel now, beside a chat box and a sheet full of fields.
  // A key pressed into one of those is not a key pressed at the board.
  const t = e.target;
  if (t && t.matches && t.matches('input, textarea, select')) return;
  if (t && t.isContentEditable) return;
  if (e.key === 'Escape') {
    // A shape half drawn — or a grid half dragged — is what Escape is refusing,
    // not the whole map.
    if (mapDrawing) { mapDrawing = null; drawBattlemap(); return; }
    if (mapGridDrag) { mapGridDrag = null; drawBattlemap(); return; }
    closeBattlemap();
  } else if ((e.key === 'Delete' || e.key === 'Backspace') && mapSelectedTokenId) {
    const map = viewedMap();
    const token = map ? (map.tokens || {})[mapSelectedTokenId] : null;
    if (token && canRemoveToken(token)) {
      removeToken(map.id, token.id);
      mapSelectedTokenId = null;
      renderMapToolbar();
    }
  }
});
