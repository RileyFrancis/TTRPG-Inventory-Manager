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
VERSION             The app version, one line — bump by hand when deploying
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
| `panels.js` | Side-panel resize handles, collapse, and reopen buttons |
| `firebase-config.js` | Parses `.env` → `FIREBASE_CONFIG` (`null` when absent) |
| `party.js` | Firebase party sync + party UI |
| `auth.js` | Firebase sign-in, the login modal, the Settings account row |
| `cloud-save.js` | Mirrors the save file to `users/<uid>/save` while signed in |
| `character-tabs.js` | Per-character tabs above the inventory + sheet/inventory switch |
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
state.auth        { user, ready }                   (signed-in account, or null)
state.view        'inventory' | 'sheet'             (which view of the selected character)
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

### Side panels

Both side panels resize by the handle on their inner border (`panels.js`), and
fold away entirely when dragged narrower than `PANEL_COLLAPSE_AT`, leaving a
round reopen button in that corner. Widths and collapsed flags are this
*browser's* window furniture, so like the theme and the folders they live in
their own key (`dnd_inventory_panels`) and never enter the save file or party
data.

- Widths are CSS custom properties (`--equip-w` / `--sidebar-w`) set on `#app`;
  `:root` holds the defaults. One class per side (`equip-collapsed` /
  `sidebar-collapsed`) hides the panel *and* its handle, shows the reopen
  button, and pads `#character-tabs` clear of it.
- Collapse happens live from the raw cursor position, not on release, so
  dragging back out brings the panel straight back without the button.
- `.panel-resizer` **must stay `position: relative`**. It straddles the seam on
  negative margins, and `#inventory-panel` is positioned and later in the DOM —
  unpositioned, the handle's `z-index` does nothing and the inventory panel eats
  the clicks on half of it.

### Character tabs

The strip above the inventory (`character-tabs.js`) holds one tab per character —
your own, plus every other member of the party — and clicking one opens a
two-item menu, because each character has two views.

- The selection is split in two, and only half of it is new. **Which** character
  is shown remains `state.party.viewingPlayerId`, so the tabs and the sidebar's
  Party panel are two faces of one selection; **which view** is `state.view`.
  Neither is saved: both are UI position, not character data.
- `syncCharacterViewUI()` is the single entry point for "who or what we're
  looking at changed". `updatePartyPanel()` calls it, which is what keeps the
  tabs in step with roster updates arriving from Firebase, and stops a
  deselected player's sheet from staying on screen.
- The sheet/inventory swap is one class, `sheet-view` on `#inventory-panel`, so
  the grid, stash and container tabs stay hidden by CSS rather than by JS that
  would fight their own `.hidden` toggling.
- A GM has no own-tab (no character of their own) and no active tab until they
  pick a player. `#character-tabs` is positioned above `#gm-placeholder`, which
  paints over the whole panel — that is exactly when the tabs are needed.
- `#character-sheet` is a placeholder pending the real sheet.
- One key per half of the selection: **Tab** flips the shown character between
  their two views, **Shift+Tab** walks to the next tab, and **1–9** jump to a tab
  by position. They keep the other half of the selection intact — cycling stays
  on the same view, Tab stays on the same character. Suppressed while typing,
  while any modal is open, and unless `state.mode === 'idle'`
  (`characterShortcutsAllowed`), because a character swap mid-drag would strand
  the item that dragging has taken out of the grid.

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

### Versioning

The version is a one-line `VERSION` file at the project root — deliberately not in the
source, so a release bump never means editing code. `loadAppVersion()` in `main.js`
fetches it into `APP_VERSION` and the Settings footer.

- **Async, unlike `items.csv` and `.env`.** Those use blocking XHR because `init()` cannot
  run without them; nothing waits on the version, so it must not hold up the boot.
- A missing file leaves the footer blank and changes nothing else — and the same
  `startsWith('<')` guard as `firebase-config.js` applies, since a host that answers
  unknown paths with its index page would otherwise "find" a version made of HTML.
- Pages serves everything `must-revalidate`, so the number on the live site is always the
  deployed one rather than a cached leftover.

### Accounts and cloud save

Signing in is never a door the app opens behind. The inventory is usable signed out,
on `localStorage`, exactly as before — an account only unlocks **party play** (other
people's data) and **cloud save**.

- Every gated entry point goes through `requireAuth(reason, action)` in `auth.js`. It
  runs `action` immediately when signed in, otherwise opens the login modal with the
  reason showing and runs it on success. Only the party buttons use it; **do not gate
  the inventory itself**.
- Firebase restores a session asynchronously, hence `state.auth.ready`. Before it flips,
  "no user" means "not known yet" — gating on `user` alone flashes the login screen at
  someone who is already signed in.
- `cloud-save.js` stores the entire save as **one JSON string** at `users/<uid>/save`.
  Not a tree: RTDB drops nulls and empty objects, and the save file is full of both (an
  unplaced item's `row` is `null`, an empty inventory is `{}`), so a tree write would
  silently fail to replicate a deletion. Party sync still writes a tree — that is
  deliberate, it is read field by field.
- `buildSavePayload()` / `applySavePayload()` in `persistence.js` are the single shape
  shared by the local and cloud copies. Anything added to one is in both for free.
- Writes are suppressed while `state.party.viewingPlayerId !== null` — `state` is then
  somebody else's character, and pushing it would overwrite your own save. Incoming
  saves are held while `state.mode !== 'idle'` and retried, because replacing the world
  mid-drag strands the item that dragging took out of the grid.
- Our own writes echo back through the `on('value')` listener; `cloudClientId` tags each
  write so they can be ignored. Conflicts are last-writer-wins, except the first sign-in
  with real data on both sides, which asks (`openCloudConflictModal`).
- The Firebase console needs Email/Password and Google enabled, the host in Authorized
  domains, and the rules from `database.rules.example.json` — without those rules the
  save writes are refused and the status line says so.

### Configuration

`firebase-config.js` uses the same synchronous-XHR pattern to read the Firebase settings
from the project root and parse them into `FIREBASE_CONFIG`. Both paths are relative to the
**document**, not the script.

- Two sources, same `KEY=value` text, first hit wins: `.env` locally, `/firebase-env` on a
  deploy. The deploy needs its own source because `.env` is gitignored and never reaches
  the host — and **Cloudflare Pages will not serve any path beginning with a dot**
  regardless. `functions/firebase-env.js` is a Pages Function (anything under `functions/`
  is deployed as a Worker with no build step) that reads the `FIREBASE_*` variables from
  the Pages dashboard, which is what keeps them out of the public repo. `.env.example` is
  the committed template — keep it in sync when adding a key, along with the `KEYS` list
  in the Function.
- Which is tried first depends on `location.hostname`, purely to avoid a certain miss: a
  deploy has no `.env`, a plain local static server has no Functions runtime. Both are
  always tried, so neither environment is locked out.
- A missing file does **not** reliably mean a 404: Pages answers unknown paths with its
  index page, i.e. HTTP 200 and a pageful of HTML. `readEnvFile` rejects a body starting
  with `<` for that reason, and a file that parses but has no `FIREBASE_DATABASE_URL` is
  skipped rather than fatal, so the next candidate still gets its turn.
- When `.env` is absent or has no `FIREBASE_DATABASE_URL`, `FIREBASE_CONFIG` is `null` and
  `initFirebase()` returns early — the app must stay fully usable offline. Preserve that
  guard when touching party code.
- The party buttons then explain themselves through `partyUnavailableMessage()`, which
  separates the three causes that all look alike from the button (no `.env` — usually
  because the page was opened over `file://`, where it cannot be read; no SDK; or
  `initializeApp` throwing). Keep it in step with any new failure mode.
- `.env` is served to the browser and readable at `/.env`. It holds Firebase web config,
  which is public by design. Never move real secrets into it.
