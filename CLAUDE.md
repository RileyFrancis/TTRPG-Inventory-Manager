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
src/css/*.css       All styles, one file per concern
src/js/*.js         Application logic, one file per concern
data/items.csv      Default item database
data/item_dtypes.csv  Reference only — the allowed values for each items.csv column
img/                Image assets (the tiled paper texture)
tools/              Standalone dev helpers (not part of the app)
```

- **`index.html`** — The script block at the bottom lists every JS file **in load order**.
  Adding a new file means adding a `<script>` tag there, in the right position.
- **`src/css/`** — One file per concern, like `src/js/`. `index.html`'s `<head>` lists
  every one **in cascade order**; adding a file means adding a `<link>` there, in the
  right position, and order changes are cascade changes. `tokens.css` must stay first —
  it defines every colour and geometry custom property the other files read, and carries
  the map of the whole set in its header. CSS custom properties drive the theme
  (`--cell`, `--cols`, rarity colors). Item rarity coloring is purely CSS via the
  `rarity-<name>` class + `--rc` variable inheritance.
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
| `item-sort.js` | The Browse list's sort order: the modes, their persistence, the sort menu |
| `shapes.js` | `rotateShapeCW`, `getRotatedShape`, shape cell/bbox math |
| `grid.js` | Fit tests, place/remove, `rebuildGrid`, id generation |
| `render-grid.js` | `renderGrid`, `renderAllItems` |
| `render-sidebar.js` | `renderItemList`, details panel |
| `render-stats.js` | Header weight / encumbrance readout |
| `drag-ghost.js` | Ghost element (`initGhostEl`, `moveGhost`, `highlightCells`) |
| `drag-scroll.js` | Edge auto-scroll: a held drag near a panel's edge pulls it along |
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
| `characters.js` | The account's roster of characters, and the home screen |
| `character-sheet.js` | Page one of the 2024 sheet: abilities, skills, combat stats |
| `equipment.js` | Equip slots, layout editor, equip/unequip |
| `shop.js` | The left panel's tabs, GM shop editor, player shopfront, paying |
| `tooltip.js` | Hover tooltip |
| `main.js` | `init()` and the single call to it |

### CSS file map

Loaded in this order. A rule's file is its subject; where two could claim it, the one
that owns the element wins.

| File | Contents |
|------|----------|
| `tokens.css` | Both palettes, `--cell` / `--cols`, and the map of this set |
| `base.css` | Reset, body, the grain overlay, type, form controls, buttons, `.hidden` |
| `icons.css` | The `img/icon` PNGs as `.ico` glyphs, masked over `currentColor` |
| `layout.css` | The app shell: header, weight bar, main split, panel resizing |
| `inventory.css` | The torn sheet, grid cells, placed items, the drag ghost |
| `sidebar.css` | The right panel: browse list, folders, details, context and sort menus |
| `modals.css` | Modal chrome, and the shape editor inside the item editor |
| `character.css` | The character tabs, and page one of the 2024 character sheet |
| `party.css` | Party header badge, the sidebar Party tab, party modal, kick |
| `equipment.css` | The equip rack, the left-panel tabs, the layout editor |
| `shop.css` | The GM shop editor, the player shopfront, and their modals |
| `tooltip.css` | The hover tooltip |
| `stash.css` | The stash (items needing placement) and the container tabs |
| `coins.css` | The multi-denomination cost input and the coin purse |
| `settings.css` | The settings modal, the theme picker, and the info pages |
| `auth.css` | The sign-in modal, the Settings account row, cloud conflict |
| `home.css` | The home button, the roster page, and the character cards |

### State model (`src/js/state.js`)

```
state.character   { id, name, level, race, classes[], abilities{str…cha}, strength,
                    background, subclass, xp, size, ac, speed, hp{…}, hitDice{…},
                    deathSaves{…}, inspiration, saveProf{}, skillProf{},
                    armorTraining{}, weaponProf, toolProf }   (the working copy)
state.characters  { [charId]: { character, instances, equipped, equipLayout, db } }
state.activeCharacterId  charId                     (which slot the working copy is)
state.screen      'app' | 'home'                    (the roster page is in front of the app)
state.grid        2D array [row][col] → instanceId | null
state.instances   { [instanceId]: { id, templateId, rotation, row, col, stackCount } }
state.db          { [templateId]: ItemTemplate }   (default + custom items)
state.folders     [{ id, name }]                    (Browse-list folders, ordered)
state.folderAssign    { [templateId]: folderId }    (overrides only; '__unfiled' = no folder)
state.folderCollapsed { [folderId]: true }
state.itemSort    'rarity' | 'name' | 'weight'      (Browse-list sort order)
state.shops       { [shopId]: Shop }                (the party's shops, from Firebase)
state.leftTab     'equip' | 'shop'                  (which left-panel pane shows)
state.shopOpenId  shopId | null                     (null = the list of shops)
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
- **The grid can shrink under the items on it.** Strength going down takes rows
  away, and editing a container template's `containerRows` / `containerCols`
  does the same inside a pack. `rebuildGrid()` therefore fit-tests every
  instance before re-placing it and calls `unplaceInstance()` on whatever no
  longer fits, which drops it into that grid's Needs Placement list. Skipping
  the re-place without clearing `row` / `col` is not a safe shortcut: the item
  keeps a position off the end of the grid, occupies no cell, and is drawn
  where `#inventory-grid`'s `overflow: hidden` clips it — invisible and
  unclickable, while `totalCarriedWeight()` goes on charging for it.

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

### Party membership

The roster under `parties/<code>/players` is the membership list, and the GM is
the only one who can shorten it — a **Kick** button on each entry in the Party
panel.

- **Removing the entry is the whole operation.** There is no "you were kicked"
  flag to write, read and clean up: a player's client sees itself gone from the
  roster snapshot and leaves. `sawSelfInRoster` is what tells a removal apart
  from a first snapshot that has not arrived yet, and it is set at join time
  because we wrote the entry ourselves.
- The kicked player loses nothing. Their roster entry was always a *copy* of a
  save that lives in their own browser and their own account.
- `partySelfRef` exists so `leaveParty()` can **cancel the onDisconnect**.
  Uncancelled, closing the tab later would write `connected: false` back into a
  party we have left — resurrecting a player the GM has just removed. For the
  same reason a kicked client sweeps its own node once it has stopped syncing:
  a sync already in flight lands as an `update()` on a missing path, which
  writes it back.
- The GM's own view is handed back first if they were looking at the player they
  are removing, so nobody is left editing a sheet that is no longer in the party.
- Like reveal, this is **pacing, not security**: a kicked player who reads the
  database directly can still write to `parties/<code>`. If the rules ever gate
  that path, membership belongs in them.

### Shops

A shop belongs to the *table*, not to a character: the GM builds it in advance,
reveals it when the party walks in, and everyone who can see it draws from one
shared pile of stock — a sword bought by one player is gone for the rest.

- Firebase is therefore the only copy. `state.shops` is a read-through cache of
  `parties/<code>/shops`, refreshed by the same subscription that carries the
  roster (`subscribeToShops`, called from `subscribeToParty`), and every GM edit
  writes straight there. **Nothing about a shop is in the save file** — a shop is
  not part of a character, and the GM's copy is the only one.
- **Stock is claimed by an RTDB `transaction()` before anything leaves the
  buyer's purse.** That is the whole point of the feature: two players hitting
  Buy on the last sword together, one wins, the loser is told and is not charged.
  Coins move only after `committed`.
- **Reveal is pacing, not security.** `shopVisibleToMe()` filters unrevealed
  shops on the client; a player who reads the database directly can still see a
  draft. Making that real would mean parking drafts under a GM-only path and
  moving a shop between paths on reveal — the audience list has the same
  caveat. If the rules ever gate `parties/<code>`, add `shops` to them.
- Reveal is stored as `revealed` + `audience` (`'all' | 'select'`) + a
  `players` map. That map is keyed by player id, and **a rejoin mints a new
  one** — so `playerNames` is written beside it and matched as a fallback,
  otherwise a shop revealed before a reload goes dark on the player it was for.
- Stock arrives two ways — the picker modal and a card **dragged out of Browse**
  — and both go through `addItemsToShop()`. An item already on the shelf gains
  one to its count rather than a second line. The drag is the folder-header
  pattern again: `getShopDropTargetAtPoint` is a bounding-rect test that
  `buildItemCard` checks *before* the grid, so a drop over the shop stocks the
  item instead of trying to place one in an inventory a GM may not even have.
  On a shop's own page the whole pane is the target; in the list each row is,
  so several shops can be filled without opening any.
- **Two prices per line.** The *base* is what the GM typed (or the item's own
  cost); `shop.priceModifier` — whole percent, absent means 100 — then scales
  every base together, so a hard season is one number rather than a pass over
  the stock list. `shopEntryBasePrice()` is what the entry editor edits;
  `shopEntryPrice(shop, entry)` / `shopEntryPriceCp()` is what the listing, the
  buy dialog and the purse all use, so the two can never disagree, and winding
  the markup back to 100 restores exactly what was typed. Scaling happens in
  copper and never rounds a real cost away to nothing. Players see only the
  scaled price — the markup is the GM's control, not a label on the shelf.
- A stock entry snapshots the whole item as **JSON in `template`**, so a shop can
  stock something the buyer has never owned and a later edit to the GM's
  catalogue cannot change a listing under the players. A string for the reason
  `cloud-save.js` uses one: RTDB drops nulls and empty objects and templates are
  full of both. `resolveShopTemplate()` matches the snapshot against the buyer's
  own `state.db` by id then by name before registering it as a custom item, so
  buying a second longsword does not fork the catalogue.
- `qty` of `-1` (`SHOP_UNLIMITED`) is a bottomless entry. It is a sentinel rather
  than a null because RTDB drops nulls.
- Paying is real: `planPayment()` spends the **smallest** coins first — that
  sheds loose change and leaves the big coins whole — and when what is left to
  pay is smaller than any coin still in the purse, breaks one and gives change.
  It refuses rather than swallowing a difference it cannot hand back. It only
  plans; `applyPayment()` moves the coins through the same
  `addCoinsToInventory` / `removeCoinsFromInventory` the purse buttons use, so
  coins come off the grid as well as the stash and the weight stays honest.

### The left panel and its tabs

The left panel is the equipment rack, plus — for a GM — their own tools. The tab
strip (`syncLeftPanel()` in `shop.js`) only appears when there are two panes to
choose between, so a solo player's panel is the bare equipment panel it always was.

- **A GM has no character**, so the equipment rack is only theirs to look at
  while a player is picked; with nobody picked the Shop is the whole panel
  rather than an empty rack of slots. That is `leftTabsAvailable()`, and it is
  also why the GM's tabs read Shop-then-Equipment while a player's read
  Equipment-then-Shop: each role's own thing comes first.
- A player has no Shop tab until a GM reveals one to them, at which point it
  appears on its own.
- Driven from `syncCharacterViewUI()`, the same single entry point the character
  tabs use — the two strips answer the same question ("who are we looking at?")
  and must not disagree.
- Deliberately **not** `.tab-btn` / `.tab-pane`: those belong to the sidebar, and
  `switchTab()` toggles every one of them on the page.

### Characters and the home screen

An account is a *player*, not a character: one person runs a fighter on Tuesdays
and a wizard on Fridays and both are theirs. So the save file holds a **roster**,
`state.characters`, and exactly one slot at a time is live in
`state.character` / `state.instances` / `state.equipped` / `state.db`.

- Live state stayed where it always was rather than being read through the
  roster, because every render path, the grid, the drag machinery and party sync
  already speak that language. The roster is the *store*; the live fields are the
  *working copy*. Exactly two functions bridge them and nothing else may:
  `commitActiveCharacter()` (working copy → slot) and
  `loadActiveCharacterIntoLive()` (slot → working copy).
- `commitActiveCharacter()` runs from `buildSavePayload()`, so every save flushes
  the character on screen back into its slot first and the two cannot drift.
- It **refuses** whenever the working copy is not your own character —
  `liveStateIsOwnCharacter()`. While another member's sheet is up, `state` is
  theirs; a GM has no character at all and their panel is the placeholder.
  Committing either would overwrite a character with someone else's inventory,
  and this guard is the only thing standing between the two. A GM's own character
  is reloaded from its slot by `leaveParty()`.
- The custom item catalogue is per character, so `loadActiveCharacterIntoLive()`
  rebuilds `state.db` from `DEFAULT_ITEMS` rather than merging — otherwise a
  character would inherit the custom items of whoever was on screen before.
- The roster is **never empty**: `ensureCharacter()` mints a fresh character on a
  first run, and deleting the last one hands back a new one rather than leaving
  the app with no character to be.
- The home screen is a page in front of the app (`state.screen`, a fixed overlay
  under the modal backdrop), not a panel inside it — picking a character is what
  happens before there is an inventory to look at. `renderHomeScreen()` returns
  early unless it is showing, so anything that replaces the world can call it
  freely.
- **A signed-in player starts there.** `handleAuthStateChange` opens it on any
  sign-in that nothing was waiting on — a sign-in *for* something (the party
  modal) goes there instead. Firebase restores its session asynchronously, so
  `maybeOpenHomeAtBoot()` guesses from `dnd_inventory_last_signin` (this
  browser's own flag, written by auth.js) rather than painting the inventory and
  yanking it away a moment later.
- One modal serves three jobs — the header's Edit Character, a card's Edit, and
  New Character. A **null** `charModalTargetId` means *the character on screen*,
  which is not always one of yours: a GM editing a player's Strength from the
  header edits the working copy and the party roster, never their own slot.

### The character sheet

Page one of the 2024 sheet, in `src/js/character-sheet.js`, shown in place of the
grid when a tab's *Character Sheet* is picked. It reads and writes the same
`state.character` as everything else and owns no data of its own.

- **What is typed and what is worked out.** Anything the rules derive
  unambiguously is derived and rendered as *text*, never as a box: ability
  modifiers, proficiency bonus (from level), every skill and save, passive
  Perception, initiative. What is left is what the rules cannot settle without
  knowing more than this app does — AC, speed, HP, hit dice — and those are
  inputs. A derived box that can be edited will disagree with itself; a typed box
  the app guesses at will fight homebrew. `.stat-tile.derived` is the visual half
  of the same promise.
- **`abilities.str` is the character's Strength, and the grid's.** The inventory
  has always sized itself from `state.character.strength`, so that field stays —
  as a *mirror*, written only by `normalizeCharacterMeta()`. One writer, so the
  two cannot drift, and a save or a party member from before the sheet still
  lands the right way up (`normalizeAbilities` takes the old `strength` as the
  fallback for `str`, so nobody silently becomes a 10). Editing Strength on the
  sheet resizes the grid exactly as the character modal does.
- The character modal's Strength box therefore writes **into** `abilities`, not
  beside it — `readCharModalFields(current)` merges. Writing a bare `strength`
  would be ignored, because `abilities` wins.
- Skill proficiency is **three-state** (none / proficient / expertise); saves are
  two. 2024 keeps expertise, and a rogue with a plain tick is simply wrong.
- The unique boxes are static markup in `index.html`, as everything referenced by
  JS is. The six abilities, six saves and eighteen skills are **built once** from
  the `ABILITIES` and `SKILLS` constants that define them — hand-writing eighteen
  rows would only give them somewhere to disagree with the constant. Built once
  and never rebuilt: `renderCharacterSheet()` only writes values into what is
  already there, so **an input never loses focus mid-keystroke**. It skips
  `document.activeElement` for the same reason — the sheet re-renders on every
  party roster update, and a sync landing mid-word must not reset the box.
- One delegated listener per event, not one per box: there are ~80 of them.
- Read-only when `isReadOnly()` — a player looking at someone else's sheet.
- **Not yet built:** the attacks table, and all of page two (spells, backstory,
  appearance, alignment, attunement). Equipment and coins are deliberately absent
  — the inventory and the coin purse already own them, and a second copy on the
  sheet would be a second answer.

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

### Edge auto-scroll

A drag holds the pointer button down, so the wheel is the only way to reach a
folder or a grid row that is scrolled out of view — and letting go to scroll ends
the drag. `src/js/drag-scroll.js` therefore pulls a container along while the
cursor rests near its edge, for both held drags (a browse card, a placed item)
but **not** placing mode: that follows a free cursor with no button down, and a
cursor left resting near an edge would scroll forever.

- Three calls per drag and no more: `startDragAutoScroll` at the point the drag
  becomes real, `updateDragAutoScroll` on each pointermove, `stopDragAutoScroll`
  on release *and* on the Escape cancel. The rAF loop runs for the whole drag
  rather than starting and stopping at the edge bands — the velocity is simply
  zero away from an edge, which leaves nothing to leak.
- **A frame that scrolls re-runs the drag's own pointermove logic** (the
  `refresh` callback — `dragMoveAt` / `dragRefresh`, both just the move handler
  with a synthetic `{clientX, clientY}`). The cursor has not moved but the
  content under it has, so the highlighted folder or grid cell would otherwise
  be a whole scroll out of date by the drop. It fires only on frames that
  actually moved, so the ends of a container cost nothing.
- `DRAG_SCROLLERS` is an explicit list — the same bounding-rect approach the
  equip cards and folder headers use, and for the same reason: the ghost is under
  the cursor and `elementFromPoint` would keep finding it.
- **The band reaches past a container's top and bottom, but never past its left
  and right.** Above and below a scroller is its own panel's header or footer, so
  overshooting the bottom edge should keep pulling rather than stall an inch
  short. The panels sit side by side, so a horizontal band would let a drag in
  one panel scroll its neighbour.
- Note the asymmetry this creates: past the edge the pull continues but the drop
  hit-tests (`getFolderDropAtPoint`, `cursorToGridPos`) return null, since the
  cursor is outside. That is right — overshooting is how you *reach* a target,
  not how you drop on one.
- `renderItemList` restores `#item-list`'s `scrollTop`, because filing an item is
  the one render that happens mid-gesture: rebuilding the list would otherwise
  throw the reader back to the top of a list auto-scroll had just carried them
  down.

### Persistence

`saveState` / `loadState` use `localStorage` key `dnd_inventory_v1`. Only custom items (not in `DEFAULT_ITEMS`) are saved; default items are always re-hydrated from `data/items.csv` on init. Placed instances are saved in full and re-placed via `rebuildGrid` on load.

The payload is **version 2**: the whole roster, `{ version, activeCharacterId,
characters }`. Version 1 was a single character at the top level and is still what
an older browser or an older cloud save holds, so `normalizeSavePayload()` in
`characters.js` reads both and folds a v1 save into a one-character roster —
the *only* place that knows there were ever two shapes. The key is unchanged
(`dnd_inventory_v1`): it names the storage slot, not the payload version, and
renaming it would orphan every existing save.

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
- **A whole folder is a drop target, not just its header.** `buildItemCard`'s
  drag checks `folderDropTargetFor` *before* the grid, so a card dropped
  anywhere among a folder's items files itself there instead of being placed.
  The list is a flat run of headers and cards, so a folder is the *band* from
  its header down to the next one: `getFolderDropAtPoint` walks the children in
  order rather than hit-testing each element, which is what makes the gaps
  between cards part of the band too. The empty space past the last card belongs
  to no folder — filing into whichever came last would be a guess.
  - The band highlights whole, header and cards together; the header alone would
    leave the cursor over unlit cards with no sign of where the item is going.
  - **A drop back into the item's own folder is not a target.** Order inside a
    folder is the sort's business, so there is nothing to reorder by hand and the
    drag simply reads as cancelled rather than as a move that changed nothing.
- A non-empty search expands every folder — a collapsed folder hiding the only
  match would read as "no results" — and the headers stop toggling while it does,
  as does the Collapse/Expand All button (`updateFolderToolbar`, disabled and
  labelled from the *stored* state, which is what clearing the search restores).

### Browse-list sorting

The order the Browse list is in, in `src/js/item-sort.js`. Like the folders it
describes the *catalogue*, not the character, so it has its own localStorage key
(`dnd_inventory_sort`) and is neither saved nor synced.

- **Every mode is a chain of keys, not one key.** Sorting purely by weight would
  scatter each weight's rarities at random; naming the tie-breakers keeps the
  list readable in every mode. The default is rarity → name → weight, which is
  the order the list has always used with weight now settling the last ties.
- Directions are fixed per key and not user-flippable: rarity reads best-first
  (that is what sorting loot by rarity means), name and weight ascending. A
  direction toggle would double the modes to say very little.
- `ITEM_SORTS` is the whole model — the menu is built from it, so adding a mode
  is one line. `sortItems()` is the only caller `renderItemList` needs.
- Sorting happens **before** `groupItemsByFolder`, which only buckets an
  already-sorted list, so items keep the chosen order inside their folders.
- The weight a mode sorts on is the figure the card *prints* (`itemSortWeight`,
  a stackable item's per-unit weight), so the order matches what the reader sees.

### Theming

Two palettes, both defined as CSS custom properties in `tokens.css`:
`:root` holds the light (aged parchment) tokens, `:root[data-theme="dark"]` the dark
(candlelit) ones. **Every colour is a token — never write a literal colour in a rule**,
or it will be wrong in one of the two themes.

- `<html data-theme>` is always `light` or `dark`, never unset. The inline script in
  `index.html` `<head>` sets it before first paint (no flash); `theme.js` owns it after.
- The stored *preference* (`dnd_inventory_theme` in `localStorage`) is `light`, `dark`,
  or `system`. `system` is re-resolved live from `prefers-color-scheme`.
- Deliberately **not** part of the `dnd_inventory_v1` save file: the theme belongs to the
  browser, not the character, and must be readable before app state loads.
- **The paper.** `img/paper-antique-seamless.jpg` (1919 × 1362, seamless) is a torn
  sheet drawn by `.paper-sheet::before` — one rule, two users: `#grid-paper` (the
  wrapper around the inventory grid) and `.sheet-scroll` (the character sheet's body).
  Both are **content**-sized, so the paper hugs what is drawn on it with an even
  half-inch margin (`inset: -0.5in`, exact — 1 CSS inch is 96px) rather than filling
  the panel and putting the tear out at the far edges where nothing is happening.
  `#inventory-panel` is now just the desk. `#grid-scroll` and `#character-sheet` are
  **transparent**; give either a background and it covers the paper.
  - `#grid-paper` exists only to carry the sheet: `#inventory-grid` is
    `overflow: hidden` for its own cells, which would clip the paper away. It is a
    plain wrapper — the JS only ever looks the grid up by id, so it is safe.
  - The wrapper's `margin` (62px) must exceed the paper's overhang plus half the
    displacement scale, or the ancestor's overflow trims the ragged edge back to a
    straight line. `#character-sheet` carries the same figure as side padding, for
    when the panel is squeezed narrow enough that `.sheet-scroll`'s auto side margins
    collapse to nothing.
  - Only the tile **width** is set; the height is `auto`, which preserves the aspect
    ratio without anyone doing the arithmetic. Never give it a second length.
  - It is faded by `--paper-veil`, a wash of `--bg` laid *over* the image — the same
    thing as opacity, but it stays an ordinary background layer. **Raise** the
    percentage to turn the texture down. Per theme, and not the same number: the
    texture is cream paper, so what suits parchment (26%) turns the candlelit theme
    grey and the grid stops reading against it (79%).
  - **The torn edge** is the `#paper-fray` SVG filter in `index.html`: feTurbulence
    makes noise, feDisplacementMap pushes the paper layer's pixels around by it, so
    the rectangle loses irregular bites at the edges. A *filter*, not a mask, because
    filters work in real pixels — the fray stays the same size whatever shape the
    panel is dragged into, where a stretched mask image would smear along the long
    side. Applied only to the paper layer, **never to an element with content**:
    displacing the grid or the sheet's text would be a disaster.
  - Three numbers have to stay in step. `scale` (34) is how deep the tear bites;
    the layer's `inset` (20px) must clear **half** of it, since the tear pushes
    outward as well as in, and past that the fray covers the desk instead of
    revealing it; the filter's own region (±6%) must exceed both or the displaced
    edge is clipped back into a straight line.
  - `--desk` is what shows around the tear. A frayed edge is only an edge if
    something different is behind it — with the desk near the paper's own tone the
    whole effect vanishes. `--paper-edge` is the burn around the rim, and it is
    ragged for free: the same displacement tears it along with the edge.
  - `pointer-events: none` on the layer, and `isolation: isolate` on each
    `.paper-sheet` so its `z-index: -1` paper sits below that sheet's own content
    instead of escaping behind the whole app.
  - `#svg-defs` is positioned absolute, not `display: none` — a hidden subtree cannot
    be referenced by `filter: url(#…)` everywhere, but an inline 0×0 SVG still opens a
    line box and pushes the page down by a line's height.
- Rarity and coin colours differ per theme (neon green vanishes on parchment). JS reads
  them from CSS via `rarityColor()` / `coinColor()` in `helpers.js`, which cache lookups;
  `applyTheme()` clears the cache and re-renders everything that bakes a colour into an
  inline style. **If you add a render path that inlines a palette colour, it must be
  re-run from `rerenderThemedContent()`.**

### Icons

`img/icon/*.png` are black silhouettes on transparency (Flaticon — the
attributions are in `icons.html`). They are drawn as CSS **masks** over
`currentColor`, never as `<img>`: an `<img>` would be black in both themes, and
black is not a token. As a mask each icon takes the colour of whatever it sits
in — `--accent` on a settings row, `--text-dim` on a card's menu button,
`--on-accent` on a primary button — and follows a theme switch for free.

- One class per file in `icons.css`, `.ico-<name>`, alongside the `.ico`
  primitive that does the masking. Sized in `em`, so an icon is as big as the
  text around it and the rule that sets `font-size` sizes both.
- Deliberately `.ico`, not `.icon`: `.icon-only` already means "a button with no
  label" on `.btn-sm`.
- From JS, `iconEl(name)` / `setIconLabel(el, name, text)` in `helpers.js` — the
  caller never sets a colour.
- Add a `-webkit-mask-*` beside every `mask-*`; the prefix is still needed.

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
