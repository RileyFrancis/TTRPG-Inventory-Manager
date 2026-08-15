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
data/item_dtypes.csv  Reference only — the allowed values for each items.csv column
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
| `folders.js` | Browse-list folders: model, per-browser persistence, folder modals |
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
| `theme.js` | Light/dark palette switching + the settings modal |
| `firebase-config.js` | Parses `.env` → `FIREBASE_CONFIG` (`null` when absent) |
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
state.folders     [{ id, name }]                    (Browse-list folders, ordered)
state.folderAssign    { [templateId]: folderId }    (overrides only; '__unfiled' = no folder)
state.folderCollapsed { [folderId]: true }
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

Shapes are 2D arrays of `0`/`1`. Weight = count of `1`s (1 lb per cell). `rotateShapeCW` rotates 90° clockwise; instances store a `rotation` index (0–3) and `getRotatedShape(baseShape, rotation)` applies it. Stackable items always use `[[1]]` and carry a `stackSize` — how many units fit in that one cell, so each unit weighs `1 / stackSize`. `stackSize` absent or `1` means the item does not stack. Read it through `stackSizeOf` / `isStackable` / `unitWeight` in `helpers.js`, never off the template directly: those helpers also translate the pre-`stackSize` `stackable` + `weightEach` pair still present in old saves and party data.

### Coins

Coins are ordinary stackable items — the coin purse is a readout over
`state.instances`, not a separate store, so coins weigh what they weigh and
`removeCoinsFromInventory` will pull them off the grid as well as the stash.

**A default item's id is its row number in `data/items.csv`**, so it changes the
moment a row is inserted above it — never write one into the code (hard-coded
`coin_cp`-style ids are exactly how the purse silently went dead). The coins are
found by identity instead, in `getCoinTemplates()`: the `currency`-tagged item
whose cost is exactly one of its own denomination. Keeping the tag and the `1cp`
/ `1sp` / … costs on those CSV rows is what keeps the purse wired up.

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

### Browse-list folders

User-made groups for the Browse tab, in `src/js/folders.js`. Like the theme, they
describe the *catalogue*, not the character, so they live in their own
`localStorage` key (`dnd_inventory_folders`) and are **not** part of
`dnd_inventory_v1` and never synced to the party — a GM paging through players'
sheets keeps their own folders.

- A folder never owns items: `state.folderAssign` maps templateId → folderId. So
  deleting a folder only drops assignments (`deleteFolder`); the items themselves
  are untouched and fall back to their default folder, or to **Unfiled** — a
  virtual group rendered last that is never stored — when that folder is gone too.
- Every item is filed by default. `DEFAULT_FOLDERS` (Weapons / Armor / Currency /
  Gear, the last matching everything) is seeded once per browser — first run, or
  the first load for a browser whose stored folders predate it, tracked by the
  `seeded` flag in the folder payload. They are ordinary folders afterwards:
  renaming or deleting them sticks, and nothing re-creates them.
- `folderAssign` therefore holds only *overrides*. An item with no entry follows
  `defaultFolderIdFor()` (matched on tags, by id, falling back to a name match so
  a renamed default keeps working); the `UNFILED_ID` sentinel is stored to mean a
  deliberate "no folder", telling it apart from "never filed by hand". Read the
  resolved folder with `folderOf()` and the override with `explicitFolderOf()` —
  the item editor and the picker modal show the override, so an auto-filed item
  reads as *Automatic*, and `setItemFolder(id, null)` hands it back to auto.
- With no folders at all (the user deleted every one), `renderItemList` renders
  the flat list exactly as before.
- Folder headers double as drop targets: `buildItemCard`'s drag checks
  `getFolderHeaderAtPoint` (bounding-rect hit test, same approach as the equip
  cards) *before* the grid, so a drop on a header files the item instead of placing it.
- A non-empty search expands every folder — a collapsed folder hiding the only
  match would read as "no results" — and the headers stop toggling while it does,
  as does the Collapse/Expand All button (`updateFolderToolbar`, disabled and
  labelled from the *stored* state, which is what clearing the search restores).

### Theming

Two palettes, both defined as CSS custom properties at the top of `style.css`:
`:root` holds the light (aged parchment) tokens, `:root[data-theme="dark"]` the dark
(candlelit) ones. **Every colour is a token — never write a literal colour in a rule**,
or it will be wrong in one of the two themes.

- `<html data-theme>` is always `light` or `dark`, never unset. The inline script in
  `index.html` `<head>` sets it before first paint (no flash); `theme.js` owns it after.
- The stored *preference* (`dnd_inventory_theme` in `localStorage`) is `light`, `dark`,
  or `system`. `system` is re-resolved live from `prefers-color-scheme`.
- Deliberately **not** part of the `dnd_inventory_v1` save file: the theme belongs to the
  browser, not the character, and must be readable before app state loads.
- Rarity and coin colours differ per theme (neon green vanishes on parchment). JS reads
  them from CSS via `rarityColor()` / `coinColor()` in `helpers.js`, which cache lookups;
  `applyTheme()` clears the cache and re-renders everything that bakes a colour into an
  inline style. **If you add a render path that inlines a palette colour, it must be
  re-run from `rerenderThemedContent()`.**

### Configuration

`firebase-config.js` uses the same synchronous-XHR pattern to read `.env` from the project
root and parse it into `FIREBASE_CONFIG`. Both paths are relative to the **document**, not
the script.

- `.env` is gitignored; `.env.example` is the committed template. Keep them in sync when
  adding a key.
- When `.env` is absent or has no `FIREBASE_DATABASE_URL`, `FIREBASE_CONFIG` is `null` and
  `initFirebase()` returns early — the app must stay fully usable offline. Preserve that
  guard when touching party code.
- `.env` is served to the browser and readable at `/.env`. It holds Firebase web config,
  which is public by design. Never move real secrets into it.
