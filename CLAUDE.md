# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the App

No build step. Serve the project root over HTTP (required for `localStorage` and correct MIME types):

```bash
python3 -m http.server 8787
# then open http://localhost:8787
```

Opening `index.html` directly as a `file://` URL works but is not recommended.

## Architecture

Three files, no framework, no bundler, no dependencies:

- **`index.html`** — Static shell. All DOM elements referenced by JS are declared here with stable IDs. Script tag at the bottom loads `app.js`.
- **`style.css`** — CSS custom properties drive the theme (`--cell`, `--cols`, rarity colors). Item rarity coloring is purely CSS via the `rarity-<name>` class + `--rc` variable inheritance.
- **`app.js`** — All logic in one file, organized into clearly labeled sections (see section headers).

### State model (`app.js`)

```
state.character   { name, strength }
state.grid        2D array [row][col] → instanceId | null
state.instances   { [instanceId]: { id, templateId, rotation, row, col, stackCount } }
state.db          { [templateId]: ItemTemplate }   (default + custom items)
state.mode        'idle' | 'placing' | 'dragging'
state.placing     { templateId, rotation }
state.dragging    { instanceId, anchorRow, anchorCol, origRow, origCol, origRotation }
```

### Grid geometry

- 15 columns fixed (`GRID_COLS`), rows = `strength × 3` (three equal zones)
- Cell size = 44 px (`CELL` constant)
- Zone 0–(str-1): Normal carry; zone str–(2·str-1): Encumbered; zone 2·str–(3·str-1): Heavily Encumbered
- `state.grid` is the authoritative occupancy map; placed-item `<div>`s are purely visual and are rebuilt by `renderAllItems()`

### Item shapes

Shapes are 2D arrays of `0`/`1`. Weight = count of `1`s (1 lb per cell). `rotateShapeCW` rotates 90° clockwise; instances store a `rotation` index (0–3) and `getRotatedShape(baseShape, rotation)` applies it. Stackable items always use `[[1]]`; `weightEach < 1` with `maxStack = 1 / weightEach` (must divide evenly).

### Interaction state machine

```
IDLE
  click sidebar card  → PLACING (ghost follows cursor, snaps to grid)
  pointerdown on item → DRAGGING (item removed from grid, ghost appears)

PLACING
  mousemove  → initGhostEl + moveGhost + highlightCells
  R key      → increment rotation, rebuild ghost in place
  click grid → finalizePlacement (stays in PLACING for rapid multi-drop)
  right-click / Escape → cancelPlacing → IDLE

DRAGGING
  pointermove → moveGhost + highlightCells
  R key       → rotateAnchorCW, increment rotation, rebuild ghost
  pointerup   → place at new position or restore to original → IDLE
  Escape      → restore original position/rotation → IDLE
```

`cursorToGridPos` returns `null` when the cursor is outside `#grid-scroll`, gating all grid snapping.

### Persistence

`saveState` / `loadState` use `localStorage` key `dnd_inventory_v1`. Only custom items (not in `DEFAULT_ITEMS`) are saved; default items are always re-hydrated from the hardcoded array on init. Placed instances are saved in full and re-placed via `rebuildGrid` on load.
