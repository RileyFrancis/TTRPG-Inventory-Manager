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
data/classes.json   The classes the app knows, and the features each grants
data/species.json   The species the app knows, and the traits each grants
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
| `appearance.js` | The accent colour, its per-theme resolution, and the hue wheel |
| `panels.js` | Side-panel resize handles, collapse, and reopen buttons |
| `firebase-config.js` | Parses `.env` → `FIREBASE_CONFIG` (`null` when absent) |
| `party.js` | Firebase party sync + party UI |
| `auth.js` | Firebase sign-in, the login modal, the Settings account row |
| `cloud-save.js` | Mirrors the save file to `users/<uid>/save` while signed in |
| `character-tabs.js` | Per-character tabs above the inventory + sheet/inventory switch |
| `characters.js` | The account's roster of characters, the class-levels model, and the home screen |
| `character-setup.js` | The Character Setup modal: name, species, background, and the class rows |
| `character-sheet.js` | Page one of the 2024 sheet: abilities, skills, combat stats |
| `sheet-layout.js` | The sheet's sections as widgets: the split tree, drag-to-tile, seams |
| `class-features.js` | The class registry, and the sheet's Class Features section |
| `species-traits.js` | The species registry, and the sheet's Species Traits section |
| `markdown.js` | Markdown to HTML for the written sections, and the sanitizer |
| `sheet-prose.js` | Backstory & Appearance: the editor/preview swap |
| `equipment.js` | Equip slots, layout editor, equip/unequip |
| `shop.js` | The left panel's tabs, GM shop editor, player shopfront, paying |
| `tooltip.js` | Hover tooltip |
| `main.js` | `init()` and the single call to it |

### CSS file map

Loaded in this order. A rule's file is its subject; where two could claim it, the one
that owns the element wins.

| File | Contents |
|------|----------|
| `tokens.css` | Both palettes, the three type faces, `--cell` / `--cols`, and the map of this set |
| `base.css` | Reset, body, the grain overlay, type, form controls, buttons, `.hidden` |
| `icons.css` | The `img/icon` PNGs as `.ico` glyphs, masked over `currentColor` |
| `layout.css` | The app shell: header, weight bar, main split, panel resizing |
| `inventory.css` | The torn sheet, grid cells, placed items, the drag ghost |
| `sidebar.css` | The right panel: browse list, folders, details, context and sort menus |
| `modals.css` | Modal chrome, and the shape editor inside the item editor |
| `character.css` | The character tabs, and page one of the 2024 character sheet |
| `character-setup.css` | The sheet's gear button, and the class rows in the setup modal |
| `sheet-layout.css` | The sheet's split containers, resize seams, and drop feedback |
| `class-features.css` | The feature cards, corner badges, and the Markdown inside a description — for Class Features *and* Species Traits |
| `sheet-prose.css` | The written sections: the bar, the editor, and the rendered prose |
| `party.css` | Party header badge, the sidebar Party tab, party modal, kick |
| `equipment.css` | The equip rack, the left-panel tabs, the layout editor |
| `shop.css` | The GM shop editor, the player shopfront, and their modals |
| `tooltip.css` | The hover tooltip |
| `stash.css` | The stash (items needing placement) and the container tabs |
| `coins.css` | The multi-denomination cost input and the coin purse |
| `settings.css` | The settings modal, the theme picker, and the info pages |
| `appearance.css` | The Appearance page's colour rows and the hue wheel |
| `auth.css` | The sign-in modal, the Settings account row, cloud conflict |
| `home.css` | The home button, the roster page, and the character cards |

### State model (`src/js/state.js`)

```
state.character   { id, name, race, abilities{str…cha}, background, alignment,
                    xp, size, ac, speed,
                    hp{…}, hitDice{…}, deathSaves{…}, inspiration,
                    saveProf{}, skillProf{}, armorTraining{}, weaponProf,
                    toolProf,
                    classLevels[{ name, level, subclass }],  (the classes, authoritative)
                    classes[], level, subclass, strength }   (mirrors of the two above)
                                                          (the whole thing: the working copy)
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

- 15 columns fixed (`GRID_COLS`), rows = `strength × 3` (three equal zones).
  Strength is 0–30, so a grid of no rows at all is a legal state
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
- **A Strength typed on the sheet resizes the grid only when the reader goes
  back to the inventory** (`markGridSizeDirty()` / `rebuildGridIfSizeDirty()` in
  `grid.js`, marked from `commitSheetEdit()` and settled by
  `syncCharacterViewUI()`). A number box is edited a keystroke at a time, so the
  way from 8 to 16 runs through an empty box (0 rows) and then 1 (three rows) —
  and rebuilding on each would empty the pack onto the Needs Placement list.
  **That is not undone by finishing the number**, because the ejection cleared
  every `row` / `col` on the way past. So the resize waits for the number the
  reader settled on.
  - Nothing is inconsistent while it waits: `state.grid` and the instances in it
    still agree, the grid is just still sized for the previous Strength. Only
    `state.character.strength` has run ahead, and its one live reader is the
    header's weight readout — numbers, not cells, and right to preview the edit.
  - The flag is cleared in **`initGrid()`**, not only in
    `rebuildGridIfSizeDirty()`, so a rebuild from any other cause (a boot, a
    character swap, a party sync) also satisfies the pending resize rather than
    leaving a stale flag to fire a second identical rebuild.
  - A save taken before the reader returns keeps each item's `row` / `col`, and
    the `rebuildGrid()` in `init()` settles it on the next load — once, on a
    finished number.

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
- One modal serves three jobs — the sheet's gear, a card's Edit, and New
  Character. A **null** `charModalTargetId` means *the character on screen*,
  which is not always one of yours: a GM editing a player from the gear edits the
  working copy and the party roster, never their own slot.

### Multiclassing and Character Setup

A character's classes are **`classLevels`**: an ordered list of
`{ name, level, subclass }`, one entry per class, each carrying its own level and
its own subclass. A Warlock 5 / Bard 2 is two entries, and the character is level
7. The model lives in `src/js/characters.js`; the editor is
`src/js/character-setup.js`.

- **The three fields that came before it are kept as mirrors** — `classes` (the
  names), `level` (the sum, capped at 20) and `subclass` (the first one set) —
  written only by `normalizeCharacterMeta()`, exactly as `strength` mirrors
  `abilities.str` and for the same two reasons. Every existing reader keeps
  working untouched (the home cards, the party panel, the proficiency bonus, the
  species traits), and a party member on an older client still renders a sensible
  line instead of `[object Object]`. One writer, so the two cannot drift:
  **writing a bare `level` on a character who has classes does nothing**, just as
  writing a bare `strength` does nothing.
- **`classEntriesOf(c)` is the one way to read a character's classes.** A
  character that has been through `normalizeCharacterMeta()` hands its list
  straight back; anything that has not — a roster entry from an older client,
  carrying only names and one level — is folded on the way out, so no caller has
  to know which kind it was given.
- **The migration guesses only for a multiclass.** The old model had one level
  every listed class was read at, so a "Fighter, Rogue" at 5 says nothing about
  how those five levels were spent. The first class is given what is left after
  one level each for the rest, so the *total* — which the proficiency bonus and
  the species traits are worked out from — comes through exactly right. A single
  class, which is nearly every character, is migrated with no guessing at all.
- **The proficiency bonus is worked out from the total, not per class.** That is
  right by the rules, and it is why the sum has to be a real field rather than
  something each reader adds up for itself.

**The modal.** One dialog, three jobs: the gear at the top right of the
character sheet, a roster card's Edit, and New Character.
`charModalTargetId` names the slot to edit; a null target is the character *on
screen*, which is not always one of yours.

- **The header has no Edit Character button and no STR readout.** The sheet owns
  the six ability scores, and the grid has always sized itself from
  `abilities.str` through the `strength` mirror — so a number in the header was
  one more place for it to go stale, and the weight bar beside it already says
  what that Strength buys. The gear replaces the button for both cases the button
  covered: your own character, and — since `isReadOnly()` is false for a GM — a
  player's.

- **The class rows are why this left the sheet.** A multiclass is a list, and a
  list that grows as classes are added does not belong across the top of a page
  that has to stay readable. So the sheet keeps the readout and the gear opens
  the editor. Species, background and alignment came with it: they answer the
  same question ("who is this?"), and splitting that answer across two editors is
  how two editors come to disagree.
- `charModalClasses` is a **working copy**, written to the character only on
  Save — Cancel has to mean something, and the target may be a slot that is not
  on screen.
- **Rows are built once and written into, never rebuilt on a keystroke** — the
  rule the sheet follows for its ~80 inputs, for the same reason: a rebuild
  mid-word takes the focus out of the box. Only a *removal* rebuilds the list,
  because every index below the gap shifts.
- The total under the rows is derived and never typed. With **no** classes there
  is nothing to sum, so a plain Level box appears in its place — a character can
  be levelled without this app knowing what they are, and that is the only time
  `level` is written directly.
- Class, subclass, species and alignment are free text with a `<datalist>`
  hint, never a constraint — `ALIGNMENTS` offers the nine, and a table running
  "Unaligned" or its own scheme can still type one. The class list is shared by
  every row; each row mints its **own** subclass list, because those differ by
  class.

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
- **What a character *is* is not edited here.** Their classes and the level
  taken in each, their subclasses, species, background and alignment are edited
  in the **Character Setup** modal behind the gear at the top right — see
  *Multiclassing and Character Setup* below. A multiclass is a list rather than a
  field, and a list that grows as classes are added does not belong across the
  top of a page that has to stay readable. XP stays a box, because it is not part
  of what a character is — it is a number that changes at the table, like HP.
- **The identity block is the readout of all of it** (`renderSheetIdentity()`):
  a row of facts under the name, each **named above and answered below** —
  Class, Species, Background, Alignment, Level, in the order the 2024 sheet
  prints them. It was one run-on line, which is fine as the party panel's
  subtitle and wrong as the sheet's own heading: nothing in "Level 7 · Tiefling ·
  Warlock 5 / Bard 2 · Soldier" says which word is the species and which the
  background, so a reader has to already know the answer to read it. A label
  over each value says it once and costs a line.
  - **No box, no border, no rule** — these are not fields any more, they are what
    the character is, printed. Chrome around them would make them look editable,
    which is exactly what the gear took away.
  - Each fact is only as wide as its content and the gap does the separating, so
    the row reads as a run of captions rather than a table. It wraps whole facts
    on a narrow sheet, never a label away from its value.
  - **Every fact is drawn whether it is set or not**, with an em dash for a
    blank. A column that vanished would shuffle the rest along and leave the
    reader working out which one went; a dash holds its place.
  - A class's own level is printed **only in a multiclass** ("Warlock 5 (Fiend
    Patron) / Bard 2"). With one class it would only say again what the Level
    column already says.
- **`abilities.str` is the character's Strength, and the grid's.** The inventory
  has always sized itself from `state.character.strength`, so that field stays —
  as a *mirror*, written only by `normalizeCharacterMeta()`. One writer, so the
  two cannot drift, and a save or a party member from before the sheet still
  lands the right way up (`normalizeAbilities` takes the old `strength` as the
  fallback for `str`, so nobody silently becomes a 10). Editing Strength here
  resizes the grid, through `commitSheetEdit()` — though not until the reader
  goes back to the inventory; see *the deferred resize* under Grid geometry.
- **This is the only place a score is typed.** The header's STR readout and the
  Character Setup modal's Strength box are both gone — they were from before the
  sheet existed, and each was a second editor for a value this section owns. The
  six scores **all start at 10**, so a character created from the roster is a
  sound level-1 with a 30-row grid until someone opens the sheet.
  `readCharModalFields()` therefore returns **no `abilities` key at all**: every
  caller merges it over the character being edited, so omitting it is what
  carries the existing scores through, and on New Character
  `normalizeAbilities()` fills all six with 10.
- **Scores run 0–30** (`clampScore`). Zero is a real score — a creature drained
  to 0 Strength is incapacitated — so it is allowed rather than floored to 1, and
  a grid of no rows is the honest reading of it. `updateWeightDisplay()` floors
  its divisor at 1 for exactly that case: at Strength 0 all three thresholds are
  0, and every ratio would be `0/0`, which the browser drops as an invalid
  length, leaving the weight bar silently showing its last width.
- Skill proficiency is **three-state** (none / proficient / expertise); saves are
  two. 2024 keeps expertise, and a rogue with a plain tick is simply wrong.
- **One group per ability, not three lists.** Everything on that half of the
  sheet is one number read three ways, so `abilityGroup()` boxes them together:
  the modifier large with the score beside it in a smaller box, the **bolded**
  saving throw directly under and ruled off from what follows, then the skills
  that read off that ability (`skillsOfAbility`, which groups on the same
  `ability` field `skillModOf` derives from — the layout cannot drift from the
  arithmetic). It retires the per-row `DEX` tag: the group *is* the tag, said
  once rather than eighteen times. Constitution has no skills and its group is
  simply short.
- `.ability-groups` is **two columns and never three**. The percentage in
  `minmax(max(196px, 46%), 1fr)` is the ceiling — a track can be no narrower
  than 46% of the row, so a third will not fit — while the 196px floor still
  drops it to one column on a squeezed sheet. Past 50% only one column would
  ever fit; at a third, three would.
- **Where the sections sit is no longer settled here.** Each is a widget in the
  split tree — see *The sheet's layout* above. The 2:1 the abilities used to be
  given by hand (`flex: 2 1 420px`) is now the default layout's opening share,
  and the reader drags the seam to change it.
- The unique boxes are static markup in `index.html`, as everything referenced by
  JS is. The six ability groups are **built once** from
  the `ABILITIES` and `SKILLS` constants that define them — hand-writing eighteen
  rows would only give them somewhere to disagree with the constant. Built once
  and never rebuilt: `renderCharacterSheet()` only writes values into what is
  already there, so **an input never loses focus mid-keystroke**. It skips
  `document.activeElement` for the same reason — the sheet re-renders on every
  party roster update, and a sync landing mid-word must not reset the box.
- One delegated listener per event, not one per box: there are ~80 of them.
- Read-only when `isReadOnly()` — a player looking at someone else's sheet.
- **Class features** and **species traits** are their own sections, built from
  registries — see *Class features* and *Species traits* below.
- **Backstory & Personality** and **Appearance** are Markdown, with an
  editor/preview swap — see *The written sections* below.
- **Not yet built:** the attacks table, and the rest of page two (spells,
  alignment, attunement). Equipment and coins are deliberately absent — the
  inventory and the coin purse already own them, and a second copy on the sheet
  would be a second answer.

### The sheet's layout

Every section of the character sheet is a **widget**, and where the widgets sit
is a **tree of splits** rather than a list (`src/js/sheet-layout.js`). Drag a
section by its title and drop it on an edge, and that edge splits.

The tree is what answers the question a flat list cannot — when does a section
run the full width, and when is it stopped by a neighbour?

> A widget has no width of its own. It fills its slot, and the *drop* chooses
> which slot — so a section's extent is decided by the depth it was dropped at,
> not by a number stored on it.

Drop a section on the sheet's own top edge and it becomes a band across
everything. Drop it on the top edge of Combat, which is sharing a row with
Abilities, and it spans that column only, stopped by Abilities — because the
slot it split was Combat's, and Combat's slot is half a row. Same gesture, two
answers, and neither is configured anywhere.

```
col[ Proficiencies, row[ Abilities, col[ Combat, HP ] ] ]

+======================================+
|  Identity                   (pinned) |
+======================================+
|  Proficiencies         (full width)  |
+------------------+-------------------+
|  Abilities       |  Combat           |
|  & Skills        +-------------------+
|                  |  Hit Points       |
+------------------+-------------------+
```

**The identity block is pinned above all of it, and is not in the tree.** Whose
sheet this is heads the page; it cannot be dragged away and nothing can be
dropped above it. There is no `pinned` flag in the model to honour and no
special case in the drag — it simply lives **outside `#sheet-layout`** in
`index.html`, `SHEET_WIDGET_IDS` is read from the store inside, and every hit
test is scoped to the tree. A section that is not in the tree cannot be moved by
a thing that only moves the tree. `sanitizeSheetLayout()` therefore drops an
`identity` node left in a layout stored before this, exactly as it drops any
other id it does not recognise, and the sheet heals itself on load. It carries
no section title either — the character's own name heads the page, and an
"Identity" rule above it only said again what the name says — so there is no
handle to hover or grab; the `pinned` class does nothing but keep the
drop-target outline off it mid-drag.

- A node is `{ t:'w', id, size }` or `{ t:'s', dir:'row'|'col', size, kids[] }`.
  `size` is the node's share of its parent and lives **on the node**, so it
  travels with a section when one is moved.
- **Horizontal splits share space; vertical ones stack at their natural
  height.** The asymmetry is the document underneath asserting itself: the sheet
  is a scrolling page of paper — `.paper-sheet` is content-sized so its torn
  edge hugs what is drawn on it — and a page has a width but not a height. So a
  row divides its width by the shares and gets a **draggable seam** between each
  pair; a column's children are simply as tall as their contents and have no
  seam. Forcing one would clip a section or leave a hole under it.
- The JS writes **only** `--share` on a node's element. What that share is spent
  on is settled in `sheet-layout.css` by the *parent's* direction. That is what
  lets a row fold into a column on one class with nothing to rewrite and no
  sizes lost.
- `normalizeSheetLayout()` runs after every edit and is what keeps the tree
  honest: a split holding one child, a row nested directly in a row, a container
  emptied by the section just dragged out of it. It **mutates and preserves node
  identity**, because a drop holds a reference to the node it landed on and has
  to find it again afterwards.
- A drop removes the section **first**, normalizes, and only then inserts — so
  the tree the insert works on is the one the drop will actually produce.
- Where a section joins a split that already runs the right way, it takes **half
  of the target's share** and the other children do not shuffle.

**Folding.** A row too narrow to give every child `SHEET_MIN_COL` stops being a
row and stacks (`foldNarrowRows`, driven by a `ResizeObserver`). This is the
same fold the sheet has always done, moved off `flex-wrap` — which cannot honour
the shares the seams set — and onto a measurement. Folds are applied
**outermost-in** (document order gives that for free: a row that folds hands its
width back to the rows inside it). The **hysteresis is not a nicety**: folding
makes the sheet taller, a taller sheet can bring in `#character-sheet`'s
scrollbar, and the scrollbar takes back the very width that was measured.
`scrollbar-gutter: stable` removes most of that; `SHEET_FOLD_SLACK` makes it
impossible.

**The layout is this browser's furniture, not the character's.** Like the theme,
the panel widths and the browse folders, it describes how *you* read a sheet
rather than anything about who is on it — and a GM paging through the party must
keep their own arrangement rather than adopting each player's. So it lives in
its own key (`dnd_inventory_sheet_layout`), is **not** in the save file, and is
never synced. That is also why a **read-only sheet is still rearrangeable**:
moving a section writes nothing to the character.

- The sections are written once as static markup in `#sheet-widget-store`, and
  the renderer **moves** them into the tree — every id, value and listener
  survives a rearrange. `renderSheetLayout()` is called when the sheet is first
  built and after a drop or a reset, and deliberately **not** from
  `renderCharacterSheet()`, which runs on every party roster update.
- `SHEET_WIDGET_IDS` is read from the markup rather than written out again in
  the JS: the sections *are* the markup, and a second list would only be
  somewhere for the two to disagree. `sanitizeSheetLayout()` therefore copes
  with a stored layout from a version with a different set of sections — unknown
  ids are dropped, missing ones appended.
- Dragging uses pointer events and bounding-rect hit tests, not the HTML5
  drag-and-drop API, to agree with the drop feedback the browse list and equip
  rack already give. The drop's edge is picked by **fraction** of each dimension
  rather than raw pixels, so a short wide section and a tall narrow one both
  have four reachable edges.
- The rim band is tested first and is thin; everywhere else inside the sheet
  resolves to the nearest section, because a drag that lands on nothing reads as
  broken. A drop back onto the section's own slot is refused, but still labelled
  ("Back where it started") — refusing silently is the one thing it must not do.
- `#character-sheet` is in `DRAG_SCROLLERS`, so a long sheet scrolls under a held
  drag exactly as the browse list does.
- `resetSheetLayout()` **has no caller.** The Reset Layout button it sat behind
  has been taken off the sheet — it is layout furniture, not part of a character
  sheet — and it is waiting to be wired up somewhere better (Settings is the
  obvious home, beside the theme picker, which is furniture of the same kind).
  Kept because an arrangement is otherwise only recoverable by clearing the
  browser's storage.

### Class features

The sheet's Class Features section reads `state.character.classes` (names, as
typed) and `level`, and shows what those classes hand out. Two halves live in
`src/js/class-features.js`: the **registry** — where a class definition comes
from — and the section that draws it.

**The class data is not in the JS.** It is `data/classes.json`, read at load
with a blocking `XMLHttpRequest` exactly as `data/items.csv` is, and for the
same reason: it is content, not code, and adding a class should not be a code
change. That file is also already the shape a user-authored class will take —
data only, no behaviour — so the editor that eventually writes one has nothing
new to learn.

```
{ id, name, source?, features: [{ id, name, level, description, unlocks? }],
  subclasses?: [{ id, name, source?, features: [ …same as above… ] }] }
```

**The registry is the seam custom classes come through.** Nothing outside
`class-features.js` may reach into `DEFAULT_CLASSES`: everything goes through
`allClasses()` and `findClassByName()`. When custom classes land they become one
more source inside `allClasses()` and every caller gets them for free — the same
shape `state.db` has, where `DEFAULT_ITEMS` are re-hydrated each boot and only
the customs are saved. `sanitizeClassList()` is what lets the file be edited by
hand without taking the sheet down: a malformed class or feature is dropped, and
an unreadable file leaves the registry empty rather than throwing.

- A feature's `id` is stable and never derived from position. (An item's id
  *is* its CSV row number, and that has bitten this project before — see the
  coin purse.) Order within a level is the order written.
- **Classes are matched by name, not id**, because a class entry's `name` is a
  free-text field the player types. A name that matches nothing is not an error —
  it is a class the app has not been taught yet, and the section says so by name
  rather than going blank. Ids are accepted too, so a stored id survives a
  rename.
- **Every class is read at its own level.** The section iterates
  `classEntriesOf(character)`, and each entry carries the level taken in that
  class: a Warlock 5 / Bard 2 sees the Warlock list up to 5 and the Bard list up
  to 2. `characterClassLevel()` is where that lands — the seam this section
  always said would learn about per-class levels. The character's *total* level
  (the sum) is still what the proficiency bonus and the species traits are
  worked out from, which is right by the rules.
- `classFeaturesFor()` returns the **complete** list sorted by level → class →
  written order, each row carrying an `owned` flag. The level gate decides
  `owned`; the *section* decides what to draw. Keeping those apart is what makes
  the show/hide toggle a filter over one list rather than two code paths.
- The class name is tagged onto a card only when there is more than one class
  (`showClass`) — one class does not need saying on every card.
- **Subclasses nest under the class** (`subclasses[]`, sanitized by
  `sanitizeSubclassList()` — the same shape as a class minus its own
  `subclasses`). **Each class entry carries its own free-text `subclass`**,
  matched by `findSubclassByName(classDef, name)` against the subclasses of that
  class. A match folds that subclass's features into the same list
  (`classFeaturesFor()`), gated by *that class's* level, sorted after the base
  features at a shared level (`sub` key), and tagged with the subclass name on
  every card — single class or not. The Subclass **field** is a row in the
  Character Setup modal, shown only once that class's own level has unlocked it
  (`classUnlockKeys()` — see *Unlocks* below); each row mints its own
  `<datalist>`, filled by `fillDatalist()` from that class's subclasses, as a
  hint only.
- **`source`** is a short book label ("PHB") on a class and, separately, on
  each subclass. `classSourceSummary()` renders the known ones as a quiet
  `.feature-sources` caption above the cards; nothing carrying a source means
  no caption. `cleanSource()` trims and caps it.
- Descriptions are terse summaries of the mechanic, written for this app. Do not
  paste rulebook text in.
- **A description is Markdown**, rendered by `markdown.js` through the same
  `renderMarkdownInto()` the written sections use — so a feature can bold the
  name of a mechanic and list what it grants rather than running it all into one
  sentence. That makes the class and species files a *second consumer of the
  sanitizer*, which is the point: a user-authored class will sync to Firebase and
  render in the GM's browser exactly as a player's backstory does. `.feature-desc`
  is therefore a `<div>`, never a `<p>` — a paragraph cannot legally hold the
  list or second paragraph the renderer emits.
- **`description` may be an array** (`normalizeDescription()`, shared with
  species-traits.js). JSON has no multi-line string, and a bulleted feature
  written as one `"…\n- one\n- two"` line is unreadable in the file it has to be
  hand-edited in. It is the convention the files' own `_comment` blocks already
  use. That is also the answer to "should this be YAML" — it should not: a
  parser is a dependency, and this app has none.
  - **An entry is a block, not a line.** Entries are separated by a *blank*
    line, so a paragraph is one entry and nothing has to type `""` between them.
  - **Except a list item, which joins to the line above.** `collectListItems()`
    stops at a blank line, so a blank between two bullets yields two separate
    one-item lists with a gap — never what someone writing `- a` / `- b` on two
    entries meant. The one case where the blank line would be wrong is the one
    case it is not inserted. The test is `MD_LIST_RE`, **borrowed from
    markdown.js rather than copied**, so what counts as a list line here cannot
    drift from what the parser does with it.
  - **A nested array is one block with its lines kept together**, for the two
    things that need consecutive lines and are not lists: a hand-written
    `<table>` (the raw-HTML branch reads to the next blank line), and a stanza
    wanting hard breaks mid-paragraph.
  - Borrowing `MD_LIST_RE` is why **`markdown.js` now loads before
    `class-features.js`**: the JSON is parsed at load time, not at render, so
    the regex has to exist by then. markdown.js declares only functions and
    constants, so it is safe that early.

**Unlocks — parts of the app that arrive with a feature.** A feature may name
parts it brings with it (`"unlocks": ["subclass"]`). Markup marks those parts
`data-unlocked-by="subclass"`, and they stay hidden until an *owned* feature
names them. The only key in use is the Subclass field, which means nothing on a
level-1 character.

- The key is a plain string shared between the JSON and the markup, never a
  selector or an element id, so the data never has to know how the sheet is
  built. That proved itself: the Subclass field moved off the sheet and into the
  Character Setup modal without `data/classes.json` changing a character.
- **The subclass key is asked per class, not of the character**
  (`classUnlockKeys(classDef, subclass, level)`), because a Warlock 5 / Bard 2
  has a patron and no Bard college. The Character Setup modal gates each class
  row's Subclass field with it, at that class's own level.
- **A class the app does not know shows the field.** `classUnlockKeys()` returns
  `null` rather than an empty set for a class it has never heard of, and the
  caller must show. If someone plays a Bloodhunter this app has no idea what one
  gets or when, so hiding their Subclass field would be an invention — and one
  that reads as the app having eaten a box they were using.
- `applyFeatureUnlocks()` / `featureUnlocksAreAuthoritative()` are the same
  question asked of the *character* — the right one for a part of the sheet that
  belongs to no class in particular, unioned with the species' keys. It has no
  targets today, and is what a species **Lineage** field will arrive through. It
  runs from `renderClassFeatures()`, so it follows a level or class edit without
  its own trigger, and toggles `.hidden` without ever touching a value: hiding a
  box must not clear what is in it.

**The section.** `renderClassFeatures()` is called from
`renderCharacterSheet()`, since it is driven by `classLevels` and `level`, and
every path that edits those ends in a sheet render — it needs no trigger of its
own.

- **One card per row, always the section's full width.** A run of cards read top
  to bottom is a list of what you have in level order, which is what the section
  is for; columns turn it into a grid to be searched, and squeeze each
  description into a narrow strip of four-word lines.
- The **level badge rides the card's top-left corner**, roughly a third of it
  hanging outside. It is what the list is scanned by, so it breaks the edge to
  be read before the card it belongs to. That costs two things: the card needs a
  margin to hang into (`.feature-list`'s padding) and **no ancestor may clip
  it** — which is why nothing in `class-features.css` uses `overflow: hidden`.
  The ring in the badge's `box-shadow` is the card's own background, and is what
  makes it read as punched through the corner rather than dropped on top.
- Locked features are drawn as a plan rather than a possession — dashed edge,
  no fill, hollow badge — so they are legible but never mistakable for something
  usable.
- The show/hide toggle **hides itself when nothing is locked**: a button that
  cannot change what you see is noise. Its state is session-only and
  deliberately not persisted — which half of a list you are looking at is a
  glance, not a setting, and the useful default is what you actually have.
- The toggle sits *inside* `.widget-title`, which is also the section's drag
  handle. `sheet-layout.js` therefore ignores a pointerdown that lands on a
  `button`/`a`/field — without that the button would still work, but the
  smallest wobble would pick the section up instead.

**Folding a card shut.** Clicking a card collapses it to its name, and clicking
it again opens it. Like the locked-features toggle it is **session-only** — a
`collapsedFeatures` Set in memory, never in the save file and never synced,
because reading a long section by folding away what you have already read is a
glance, not a property of the character. Every card opens expanded.

- **The name is a real `<button>` inside the heading** — the standard disclosure
  pattern. The heading keeps its meaning in the sheet's structure, and the
  button is what Tab reaches and what Enter and Space work on, so there is no
  keydown handler here at all. `.feature-name-btn` styles it back to bare text
  (`font`/`color: inherit` from `.feature-name`, so the two cannot drift), which
  is what keeps an expanded card pixel-identical to the one that could not fold.
- One delegated listener **per section**, not per card, for the reason the sheet
  gives about its ~80 inputs — and here also because the sections are rebuilt on
  every render while the containers are static markup that outlives them. Both
  are wired from `class-features.js` because `featureCard()` is: species traits
  fold too, and a fold that worked in one section only would be exactly the
  drift that sharing the card prevents.
- The button's own click reaches that listener **by bubbling**, not by a second
  listener, so a click on the name cannot toggle twice.
- The key is `scope:id` (`class:rage`, `species:dwarf-darkvision`), not the bare
  id. Class ids are bare words where species ids are prefixed, so the two files
  could collide on one — and a collision would fold a card in one section
  because you folded an unrelated one in the other. The coin purse is the
  standing reminder of what assuming a hand-written id is unique costs.
- The toggle flips classes and `aria-expanded` on the card that was hit and
  deliberately **does not re-render the section**: a render rebuilds every card,
  throwing away keyboard focus mid-click and costing a Markdown parse per
  feature to change one `display`. The Set is read at build time, so the state
  still survives a render driven by anything else (a party sync).
- Clicks on a link, field or other control inside a description are left alone,
  and **a click that ends a drag-select does not fold** — that is a reader
  highlighting a passage to copy, not asking for the card to shut under them.
- **No caret or chevron**, on purpose: an expanded card was to look exactly as
  it always has, and a glyph at rest is a change to that. The hover lift
  (`border-color: var(--accent)`) is the affordance instead, the same one
  `.folder-header` uses for the same gesture.

### Species traits

The sheet's Species Traits section reads `state.character.race` (a name, as
typed) and `level`, and shows what that species hands out. It is deliberately
`class-features.js` again, in `src/js/species-traits.js`: same registry shape,
same card, same locked/unlocked toggle, same reasoning. Read the Class features
section above first — what follows is only where the two differ.

- **The data is `data/species.json`**, read the same blocking way and for the
  same reason: content, not code. `{ id, name, traits: [...] }`, and a trait is
  `{ id, name, level?, description, unlocks? }`.
- **`level` is optional here** and defaults to 1, where a class feature's is
  required. Almost every species trait arrives at level 1, so writing it on each
  of them would be ceremony that only invites a typo; the handful that scale
  (Draconic Flight, Large Form, Celestial Revelation) say so.
- **One species, not a list.** `race` is a single field where `classes` is a
  list, so there is no per-card species tag and no sort by species. That is the
  whole of the difference in the model.
- **The level badge is drawn only when the levels differ**, judged on the rows
  actually *drawn*. For a class the badge is what the list is scanned by; for a
  species almost everything is level 1, and a column of identical `1`s is noise
  standing where information should be. So a level-1 Dragonborn gets no badges,
  and they appear when the reader asks to see the locked trait and the levels
  start to differ. `featureCard(row, { badge })` and `.feature-card.no-badge`
  are the two halves of that.
- The cards and their CSS are **shared, not copied** — `featureCard()` and
  `featureNote()` live in `class-features.js`, and `class-features.css` styles
  both sections. They are one kind of thing (a named thing you have, with a
  level it arrived at) read off two registries; two copies would only drift.
  That sharing is why **`species-traits.js` must load after `class-features.js`**:
  it calls `normalizeUnlocks()` while parsing the JSON, which happens at load
  time rather than at render.

**Unlocks are now a union.** A species trait may name parts of the sheet exactly
as a class feature may — same key space, same `data-unlocked-by` markup.
`applyFeatureUnlocks()` in `class-features.js` still owns the mechanism and
gathers both sets of keys; `speciesUnlockKeys()` / `speciesUnlocksAreAuthoritative()`
are the species half.

- The authoritative test is an **AND**, and has to be: if either half of what
  the character is cannot be reasoned about, a hidden box might be one they
  should have, and hiding it reads as the app having eaten a field. So a
  Fighter/Warforged keeps their Subclass field, because this app has never heard
  of a Warforged and will not guess on its behalf.
- A **blank** species is authoritative — it grants nothing and hides nothing,
  which is the honest reading of an empty field. Only a *typed and unknown* one
  disables the mechanism.
- No species in `data/species.json` uses `unlocks` today. The support is there
  because a user-authored species is expected to, and because a Lineage field
  (Elven Lineage, Fiendish Legacy) is the obvious next one to arrive — it is
  exactly the Subclass field's shape.

### The written sections

Backstory & Personality and Appearance are the parts of a character the rules
have nothing to say about, so they are not boxes and derived numbers but a page
to write on. `src/js/sheet-prose.js` is the sections; `src/js/markdown.js` is
the formatting.

- **Neither section owns data.** They are two more `data-sheet` string fields on
  `state.character` (`backstory`, `appearance`), written by the same delegated
  listener as every other box, saved by the same save, synced by the same sync.
  `data-prose` on the wrapper *is* the `data-sheet` path, so a section needs no
  table in the JS — a row of markup is the whole of adding one.
- **The mode is not a setting.** Which face you are looking at is a glance —
  the same argument the feature toggles make — so it is session-only. What it
  *is* is a guess: a section with writing in it opens formatted, because that is
  the readable form; an empty one opens in the editor, because a blank preview
  is a dead end. Touching the toggle replaces the guess with your choice, until
  the sheet on screen changes to a different character (`proseCharacterId`).
- **The preview is only rendered when it is on screen.** Every keystroke
  re-renders the sheet, and parsing a whole backstory each time to update
  something nobody is looking at would be work for nothing.
- Read-only does not gate the swap: someone looking at another player's sheet
  can still read how a passage was written. The textarea is disabled by
  `renderCharacterSheet()` along with every other input, so nothing can change.
- The toggle is at the top left of the widget *body*, not in the title — the
  title is the drag handle and already carries the section's name at the left.

**Markdown, and the sanitizer that is not optional.** `markdown.js` is the only
place in the app that turns a string into markup; everywhere else builds DOM
with `createElement` and `textContent`, which cannot inject anything.

> A character sheet is not private. Party sync copies it to Firebase, and every
> other member — and the GM — renders it in their own browser. Unsanitized, a
> `<script>` or an `onerror=` in a player's backstory would run on the GM's
> machine, against the GM's signed-in Firebase session.

- So the rule is **formatting is allowed, behaviour is not**. Raw HTML passes
  through on purpose, because reaching past what the renderer offers is the
  point; then `MD_ALLOWED_TAGS` / `MD_ALLOWED_ATTRS` decide what survives.
  `<b>`, `<span style>` and a hand-written `<table>` all work; `<script>`,
  `<iframe>`, `on*=` and `javascript:` do not.
- An unknown tag is **unwrapped** — its text is the player's writing and is
  kept. `MD_DROP_WHOLE` is the short list that goes with its contents instead,
  because inside a `<script>` the text *is* the payload.
- Parsing happens in a detached `<template>`, whose content has no browsing
  context — nothing loads or runs while it is being scrubbed.
- URLs are checked after control characters, spaces and entities are stripped
  (`stripInvisible`), because `java&#9;script:` is a URL a browser will happily
  run and a naive prefix check will happily pass. `style` is refused whole if it
  contains `url(`, `@import` or friends: formatting needs none of them.
- `on*` attributes are dropped **before** the allowlist is consulted rather than
  by relying on it — that is the one class of attribute a later edit to the
  lists must not be able to let through.
- **Every block branch must consume a line.** The tests that end a paragraph are
  looser than the ones that open a block, so a line like ```` ```js extra ````
  can fall through all of them; leaving `i` where it was is an infinite loop, on
  text a player is allowed to type. Whatever reaches the end with nothing
  collected is taken as one line of paragraph.
- A single newline is a **line break**, not a space. Standard Markdown wants two
  trailing spaces, which is a rule nobody writing a backstory in a box knows.
- Pipe tables are **not** parsed. A hand-written `<table>` is the escape hatch,
  and `sheet-prose.css` styles one to match the sheet.

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

`class-features.js` reads `data/classes.json` the same blocking way, and
`species-traits.js` reads `data/species.json` beside it. Both are skipped over
silently if missing — the sheet is usable with no classes or species known, it
simply says it has not heard of whatever was typed.

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
- **Restore Defaults** (`restoreDefaultFolders`) empties `folderAssign` whole —
  it holds nothing but hand-filed overrides, so clearing it *is* "nobody filed
  anything by hand". It re-creates any missing default folder first, because
  otherwise `defaultFolderIdFor` has no answer and every item the button just
  freed lands in Unfiled. Folders the user made are left standing: the button
  restores where items *are*, and deleting someone's folders is a different
  operation nobody asked for. A re-created folder is appended, like seeding.
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
  - `showFolderDropFeedback()` in `drag-ghost.js` is the whole of the drag's
    feedback in one call — band, chip and the answer the drop will act on come
    out of one place, so they cannot disagree. It hands back `hovering`, which
    is true over *any* folder band including the item's own: the grid never gets
    a look in while the cursor is over the list.
  - The band highlights whole, header and cards together; the header alone would
    leave the cursor over unlit cards with no sign of where the item is going.
  - **The band is the area, the chip is the answer.** `#folder-drop-hint` rides
    the cursor naming the folder ("Move to Weapons") because a folder is often
    taller than the list: hovering cards halfway down Weapons lights a header
    that has scrolled out of sight, leaving the drag unnamed. It flips to the
    other side of the cursor at the viewport edge, measured after its text is in
    — the chip is as wide as the folder's name.
  - The card left behind is faded (`.item-card.dragging`), so a drag over the
    list reads as moving *that* item rather than as hovering the folder. The
    ghost is hidden over the list, so without it nothing marks what is in flight.
  - **A drop back into the item's own folder is not a target.** Order inside a
    folder is the sort's business, so there is nothing to reorder by hand and the
    drag simply reads as cancelled rather than as a move that changed nothing.
    That folder still answers, though — outlined and dashed (`.drop-current`)
    under a quiet "Already in Currency" — because an unlit band under the cursor
    is indistinguishable from a broken drag. Refusing silently is the one thing
    it must not do.
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
- Each key has one fixed direction — rarity best-first (that is what sorting
  loot by rarity means), name and weight ascending — and the toolbar's arrow
  toggle (`state.itemSortReverse`) negates the **whole chain**, so the list is
  exactly the one the reader had, upside down. Flipping only the leading key
  would leave the tie-breakers running the other way and shuffle items that
  never moved. The reverse rides in the same localStorage key; a stored bare id
  is the pre-direction shape and still reads. `dir` on each mode names its two
  directions in that mode's own words ("Worst first", "Z to A") — the button
  says what the reader will get, not "reversed".
- The reverse turns each folder's contents over; the **folders keep their own
  order**, which is the user's arrangement rather than the sort's.
- `ITEM_SORTS` is the whole model — the menu is built from it, so adding a mode
  is one line. `sortItems()` is the only caller `renderItemList` needs.
- Sorting happens **before** `groupItemsByFolder`, which only buckets an
  already-sorted list, so items keep the chosen order inside their folders.
- The weight a mode sorts on is the figure the card *prints* (`itemSortWeight`,
  a stackable item's per-unit weight), so the order matches what the reader sees.

### Typography

Three faces, three tokens, all in `tokens.css`:

| Token | Face | Where |
|-------|------|-------|
| `--font-title` | **Bradley Gratis** | Names and page headings — nothing else |
| `--font-display` | Cinzel, falling back to Palatino | The small-caps chrome, 9–14px |
| `--font-body` | Segoe UI / system | Everything read as text |

- **Bradley Gratis is served from the repo** (`fonts/bradley-gratis/`, one
  `@font-face` in `tokens.css` beside the token that names it), like every other
  asset here. It is Phinney's 1895 Bradley digitized by Justin Callaghan and
  **dedicated to the public domain**, so it can be embedded and served freely.
  19KB, and `font-display: swap` so a header paints in the fallback rather than
  sitting invisible while it arrives.
- **The split between `--font-title` and `--font-display` is the whole point.**
  The title face is ornate art nouveau: it is magnificent at 19px and up and
  turns to mush at the 9–14px uppercase, letter-spaced sizes the rest of the app
  runs at. So it is spent only on things that are *named*: the character's name
  (header and sheet), a roster card's name, the roster page's own heading, the
  site name, a dialog's title. Everything else — section headings, tab labels,
  folder names, feature names, buttons — stays on `--font-display`, which is what
  that token has always been for.
- **The rules that use it ask for `font-weight: 400`.** There is one weight in
  the file, so at 700 the browser synthesizes a bold by smearing the outlines
  sideways, which on strokes this ornate reads as a printing fault. Each of those
  headers was also given a couple of extra pixels, because the face runs small
  for its size next to Cinzel.
- **It has no `/`, `—` or `·`.** Those fall through to the next family in the
  stack, so nothing set in it should depend on them lining up. Today nothing
  does — the identity block's separators are all `--font-body`.
- **Its capital T reads as a C** at the sizes used here, which is why the site
  name renders "CCRPG Manager". The letterform's bracket serifs curl in and close
  the top. Known, and the fix if it grates is one token on `.home-banner-title`.

### Theming

Two palettes, both defined as CSS custom properties in `tokens.css`:
`:root` holds the light (aged parchment) tokens, `:root[data-theme="dark"]` the dark
(candlelit) ones. **Every colour is a token — never write a literal colour in a rule**,
or it will be wrong in one of the two themes. The single exception is the hue wheel in
`appearance.css`, which is not a themed surface but the spectrum itself — see
*The accent colour* above.

- `<html data-theme>` is always `light` or `dark`, never unset. The inline script in
  `index.html` `<head>` sets it before first paint (no flash); `theme.js` owns it after.
  That script also applies the **custom accent** before first paint, for the same reason.
- The theme picker itself lives on the **Appearance page** (Settings → Appearance),
  beside the colour wheel — the two halves of one question.
- `--accent` / `--accent-soft` / `--on-accent`, and the whole panel family
  (`--panel` / `--surface` / `--field` / `--border` / `--border2` / `--desk` / `--bg`), can be
  **overridden per browser** by a user-chosen colour, set as inline properties on
  `<html>`. Anything reading them still just reads the token; see *The accent colour*
  for how the two themes are resolved. `ACCENT_MANAGED` in `appearance.js` is the full
  list, and it is built from the roles rather than written out.
- `--text` / `--text-dim` deliberately **do not** follow a custom panel colour. They do
  not need to: each theme pins its surfaces' lightness, so a light theme's panels stay
  light however they are tinted and the ink still reads.
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

### The accent colour

Light/dark is the *palette*; this is the *colour* — the one hue everything gold
in the app is drawn in. Both are reached from **Settings → Appearance**, which
is an info page like How to Use and About: the theme picker lives there now, not
on the Settings page itself. Light/dark stays in `theme.js`; the colour is
`src/js/appearance.js`.

**What the user picks is a hue and a saturation. Never a lightness.** That is
the whole design, and it is what keeps a custom colour readable. Each theme
already knows how light its accent has to be to sit on its own background —
dark brown on parchment (L 33%), light gold on candlelit (L 56%) — so a pick
supplies the *colour* and the theme supplies the *contrast*:

```
picked hsl(0, 66%)  ->  light theme  hsl(0, 66%, 33%)   a deep brick
                    ->  dark  theme  hsl(0, 66%, 56%)   a warm coral
```

A pale yellow chosen in dark mode cannot come out invisible on cream paper,
because the light palette never uses the pale version of it. The wheel therefore
has **no lightness slider**: there is nothing there to offer.

- Three roles. `primary` drives `--accent`; `secondary` drives `--accent-soft`
  (the gold rules and gradients); `surface` drives the whole panel family.
  Until the secondary is set on its own it **follows the primary**, eight points
  calmer — which is the relationship the default gold pair already has. Setting
  it explicitly is what breaks the link; resetting it restores it. The panels
  follow nothing and nothing follows them: a page tinted to match its own accent
  is a much louder app than anyone asked for.
- **A role can drive a family, not just one token.** `surface` is one hue at six
  lightnesses, so "the background is a darker version of the panel colour" is
  not a rule applied afterwards — it is what having one hue and six lightnesses
  *means*:

  ```
  --panel    L 91   the panels themselves, the lightest step
  --surface  L 86
  --field    L 78   recessed wells: inputs, equip slots, shape-editor cells
  --border   L 63
  --border2  L 50
  --desk     L 48   under the torn paper, darkest of the ladder
  ```

  (Light-theme figures; the dark palette has its own ladder, 12 down to 4.)
  `--paper-veil` is a `color-mix` over `--field`, so it follows for free.
- **The inventory grid is deliberately not in the family.** Its cells, its
  carry zones and everything drawn on them keep the palette's own colours
  whatever the panels are tinted to. The grid is the parchment a character's kit
  is laid out on, not part of the app's chrome, and it should read as itself
  rather than as another panel.
- **`--bg` is not on that ladder.** The page behind everything takes the panel's
  *hue* and nothing else, at a fixed `oklch(L 0.04 H)` — so the app always sits
  on a deep, near-neutral ground and the panels read as lit sheets on it.
  `oklch` rather than `hsl` because that is the whole point: perceptual
  lightness is what "this dark" has to mean when the hue can be anything, and an
  HSL lightness of 25% is a very different darkness for yellow than for blue.
  The hue comes from the **resolved panel colour** via `oklchHueOf()`, not from
  the pick — OKLCH and HSL hues disagree, sometimes by tens of degrees (an HSL
  pick of 200 lands at OKLCH 231).
- **`--field` exists because `--bg` used to do two jobs** — the page ground *and*
  every recessed well. They parted company the moment the ground went dark: at
  L 0.25 the light theme's inputs would have been near-black boxes holding dark
  brown text (contrast 1.12). A field is a dip in the panel, so it belongs to the
  panel's ladder. `--bg` now paints only `body` and `#home-screen`.
- **`--on-bg`** is the ink for anything drawn straight onto the ground (the
  roster page's heading and empty state). Unlike `--on-accent` it needs no
  deriving and is not per-theme: the ground is locked dark in both palettes, so
  it is always `--paper`. Never use `--text` there.
- **The ground's lightness is per palette — 0.32 on parchment, 0.25 by
  candlelight** — and it is the one figure to touch if the ground wants nudging.
  It lives in two places that must agree: `tokens.css` for the stock palettes and
  `ACCENT_ROLES.surface` in `appearance.js` for a custom colour. The chroma
  (0.04) and the hue rule are shared.

  They differ because the ground has to clear its own panels. The dark palette's
  panels sit at OKLCH 0.247, so 0.25 puts the ground level with them — `--panel`
  against `--bg` is a contrast ratio of **1.00**, and on the roster page the
  cards are held by their 1px border alone. That is **deliberate and signed off**:
  it reads as one continuous dark surface. The light palette's panels are at 0.95
  with room to spare, so its ground is lifted to 0.32 (10.97 against the panels)
  where 0.25 was heavier than wanted.
  The **first token is the role's reference**: what the swatch shows, what the
  wheel is painted at, and what the family's saturations are scaled against —
  so the desk stays the flattest step and the panel the richest, whatever hue is
  poured in.
- Pinned lightness is also what stops a strong pick going garish. `s: 100`
  sounds alarming until you notice a light-theme panel is fixed at L 91%:
  `hsl(210, 100%, 91%)` is a pale blue tint, not a blue. The theme constrains
  the chroma for free.
- `--on-accent` is derived, never picked: whichever of `--ink` / `--paper` has
  the better **WCAG contrast ratio** against the resolved accent. Not chosen off
  HSL lightness — a saturated yellow and a saturated blue at the same `l` are
  nowhere near as bright as each other, and lightness alone would put black text
  on the blue.
- `--ink` and `--paper` are declared once in `tokens.css` **outside both
  `[data-theme]` blocks**, because they are not a palette's choice — they are
  the two things `--on-accent` is chosen *between*, and each theme just picks
  one. `appearance.js` reads them rather than carrying a second copy.
- **Both themes are resolved at pick time, not at paint time.** The stored
  `vars` is a finished map of CSS properties per theme, so switching theme is
  reading strings out of storage and never colour maths. That is what lets the
  no-flash script in `index.html` `<head>` stay four lines instead of carrying
  its own `hslToHex` — it applies the custom accent before first paint exactly
  as it already applied `data-theme`. `sanitizeAccentPrefs()` recomputes `vars`
  on load rather than trusting it, so a hand-edited cache cannot paint a colour
  the wheel does not show.
- **Nothing re-renders.** `rerenderThemedContent()` exists because rarity and
  coin colours are baked into inline styles; the accent never is — it is read
  straight from `var(--accent)` by ~150 rules and by nothing in JS — so setting
  the property on `<html>` is the entire operation. Live drag-preview on the
  wheel is free, and only the pointer *release* writes to storage.
- A reset **removes** the property rather than writing the old value back, which
  hands the palette to `tokens.css` instead of pinning a stale override.
  `ACCENT_MANAGED` is the list of what may be removed.
- Stored per browser (`dnd_inventory_colors`), like the theme, the folders, the
  panel widths and the sheet layout: it describes this browser's idea of the
  app, not anything about a character, and must be readable before app state
  loads. Not in the save file, never synced.
- The wheel is hue around and saturation outward, drawn from two CSS gradients
  rather than a canvas. **It holds the only literal colours in the app, and they
  belong there**: everything else must be a token or it is wrong in one of the
  two palettes, but a spectrum is not themed — it *is* the colours, and it means
  the same thing in both. The gradient is rebuilt at the lightness the role will
  actually be given, so the wheel previews the result rather than a nominal 50%
  — **clamped to a legible band** (`WHEEL_FACE_MIN`/`MAX`), because a panel is
  L 91% on parchment and L 12% by candlelight, and a wheel at either is a flat
  white or a flat black disc with no hues to tell apart. The swatch beside the
  row, and the app recolouring live, carry the true result.
- The wheel panel is **moved under whichever row was clicked** rather than
  floating, so a row reads as opening. This modal can scroll on a short window,
  and a popover would need positioning and clipping logic to survive that for no
  gain.
- **`appearance.js` loads after `theme.js`, so it wires its own button.**
  theme.js's listeners run at *load* time and `openAppearanceModal` is not
  defined yet at that point — binding it from there attaches `undefined`
  silently, with no error to notice. Anything of appearance's that theme.js
  needs is called at *runtime* (`applyAccentVars()` and `updateAppearanceUI()`
  from `applyTheme`, `initAppearance()` from `initTheme`), which is fine.

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
