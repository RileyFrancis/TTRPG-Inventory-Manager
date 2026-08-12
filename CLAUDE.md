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

No framework, no bundler, no dependencies. Static files served as-is:

```
index.html          Static shell — every DOM element referenced by JS, with stable IDs
src/css/style.css   All styles
src/js/*.js         Application logic, one file per concern
data/items.csv      Default item database
tools/              Standalone dev helpers (not part of the app)
```

- **`index.html`** — The script block at the bottom lists every JS file **in load order**.
  Adding a new file means adding a `<script>` tag there, in the right position.
- **`src/css/style.css`** — CSS custom properties drive the theme (`--cell`, `--cols`, rarity colors). Item rarity coloring is purely CSS via the `rarity-<name>` class + `--rc` variable inheritance.
- **`src/js/`** — Plain classic scripts sharing globals; **not** ES modules. There are no
  `import`/`export` statements — a `function` or `const` declared at the top level of one
  file is visible to all later files. Each file carries its own `'use strict';` (strict mode
  is per-script). Top-level code (element lookups, `addEventListener` calls) runs at load
  time in file order, so order changes are behavior changes.

### JS file map

| File | Contents |
|------|----------|
| `items.js` | CSV parsing → `DEFAULT_ITEMS` (`loadDefaultItems`) |
| `constants.js` | `CELL`, `GRID_COLS`, `RARITY_META`, `RARITY_ORDER`, `EQUIP_SLOTS` |
| `state.js` | The `state` object and convenience accessors |
| `shapes.js` | `rotateShapeCW`, `getRotatedShape`, shape cell/bbox math |
| `grid.js` | Fit tests, place/remove, `rebuildGrid`, id generation |
| `render-grid.js` | `renderGrid`, `renderAllItems` |
| `render-sidebar.js` | `renderItemList`, details panel |
| `render-stats.js` | Header weight / encumbrance readout |
| `drag-ghost.js` | Ghost element (`initGhostEl`, `moveGhost`, `highlightCells`) |
| `interaction-placing.js` | PLACING mode |
| `interaction-drag.js` | DRAGGING mode + R-key rotation |
| `interaction-context.js` | Item clicks, context menu |
| `modals.js` | Tabs, filters, character / item-editor / stack modals |
| `helpers.js` | Shared formatting + lookup helpers |
| `persistence.js` | `saveState`, `loadState`, `exportItemsCSV` |
| `firebase-config.js` | `FIREBASE_CONFIG` only |
| `party.js` | Firebase party sync + party UI |
| `equipment.js` | Equip slots, layout editor, equip/unequip |
| `tooltip.js` | Hover tooltip |
| `main.js` | `init()` and the single call to it |

### State model (`src/js/state.js`)

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

`saveState` / `loadState` use `localStorage` key `dnd_inventory_v1`. Only custom items (not in `DEFAULT_ITEMS`) are saved; default items are always re-hydrated from `data/items.csv` on init. Placed instances are saved in full and re-placed via `rebuildGrid` on load.

`items.js` reads `data/items.csv` with a **synchronous** `XMLHttpRequest` so `DEFAULT_ITEMS`
is populated before `init()` runs. That is why the app needs an HTTP server rather than
`file://`, and why the CSV path is relative to the project root, not to `src/js/`.
