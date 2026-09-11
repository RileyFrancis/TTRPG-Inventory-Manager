# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository.
[ARCHITECTURE.md](ARCHITECTURE.md) is the shorter map; this file is the rationale
behind each subsystem and which parts are load-bearing.

## Running the App

No build step. Serve the project root over HTTP (needed for `localStorage` and
correct MIME types):

```bash
python3 -m http.server 8787
# then open http://localhost:8787
```

`file://` works but is not recommended — `.env` and `data/*.csv` may not load.

## Architecture

No framework, no bundler, no dependencies. Static files served as-is:

```
index.html          Static shell — every DOM element referenced by JS, with stable IDs
VERSION             App version, one line — bump by hand when deploying
src/css/*.css       All styles, one file per concern
src/js/*.js         Application logic, one file per concern
data/items.csv      Default item database, loaded at startup
data/_item_dtypes.csv  Reference only — the allowed values for each items.csv column
data/classes.json   The classes the app knows, and the features each grants
data/species.json   The species the app knows, and the traits each grants
img/                Image assets (icon set, paper texture)
functions/          Cloudflare Pages Function serving Firebase keys on a deploy
tools/              Standalone dev helpers (not part of the app)
```

- **`index.html`** — the script block at the bottom lists every JS file **in load
  order**; adding a file means adding a `<script>` tag in the right position.
- **`src/css/`** — one file per concern. `index.html`'s `<head>` lists every one
  **in cascade order**; order changes are cascade changes. `tokens.css` must stay
  first — it defines every colour and geometry custom property. Item rarity
  colouring is purely CSS via the `rarity-<name>` class + `--rc` inheritance.
- **`src/js/`** — plain classic scripts sharing globals, **not** ES modules. No
  `import`/`export`: a top-level `function` or `const` in one file is visible to
  all later files. Each file has its own `'use strict';`. Top-level code runs at
  load time in file order, so order changes are behaviour changes.

### JS file map

| File | Contents |
|------|----------|
| `items.js` | CSV parsing → `DEFAULT_ITEMS` (`loadDefaultItems`); variant materialization |
| `constants.js` | `CELL`, `GRID_COLS`, `RARITY_META`, `RARITY_ORDER`, `getDefaultEquipLayout` |
| `state.js` | The `state` object and convenience accessors |
| `folders.js` | Browse-list folders: model, per-browser persistence, folder modals |
| `item-sort.js` | The Browse list's sort order: modes, persistence, sort menu |
| `shapes.js` | `rotateShapeCW`, `getRotatedShape`, shape cell/bbox math |
| `grid.js` | Fit tests, place/remove, `rebuildGrid`, id generation, deferred resize |
| `render-grid.js` | `renderGrid`, `renderAllItems` |
| `render-sidebar.js` | `renderItemList`, details panel |
| `render-stats.js` | Header weight / encumbrance readout |
| `drag-ghost.js` | Ghost element (`initGhostEl`, `moveGhost`, `highlightCells`) |
| `drag-scroll.js` | Edge auto-scroll for held drags near a panel's edge |
| `interaction-placing.js` | PLACING mode |
| `interaction-drag.js` | DRAGGING mode + R-key rotation |
| `interaction-context.js` | Item clicks, context menu |
| `modals.js` | Tabs, filters, character / item-editor / stack modals |
| `helpers.js` | Shared formatting + lookup helpers |
| `persistence.js` | `saveState`, `loadState`, `exportItemsCSV` |
| `theme.js` | Light/dark palette switching + the settings modal |
| `appearance.js` | The accent colour, its per-theme resolution, the hue wheel |
| `panels.js` | Side-panel resize handles, collapse, reopen buttons |
| `firebase-config.js` | Parses `.env` → `FIREBASE_CONFIG` (`null` when absent) |
| `party.js` | Firebase party sync + party UI + presence |
| `campaigns.js` | Campaigns: the bookmark model, entering/leaving, the home section |
| `auth.js` | Firebase sign-in, the login modal, the Settings account row |
| `cloud-save.js` | Mirrors the save file to `users/<uid>/save` while signed in |
| `character-tabs.js` | Per-character tabs + sheet/inventory switch |
| `characters.js` | The account's roster, the class-levels model, the home screen |
| `character-setup.js` | The Character Setup modal: name, species, background, class rows |
| `character-sheet.js` | Page one of the 2024 sheet: abilities, skills, combat stats |
| `sheet-layout.js` | The sheet's sections as widgets: split tree, drag-to-tile, seams |
| `class-features.js` | The class registry, and the Class Features section |
| `species-traits.js` | The species registry, and the Species Traits section |
| `markdown.js` | Markdown → HTML for the written sections, and the sanitizer |
| `sheet-prose.js` | Backstory & Appearance: the editor/preview swap |
| `equipment.js` | Equip slots, layout editor, equip/unequip |
| `shop.js` | The left panel's tabs, GM shop editor, player shopfront, paying |
| `chat.js` | The campaign's chat log, and the sidebar's Chat pane |
| `dice.js` | Rolling: the tumbling number, corner stack, advantage wheel, tray |
| `battlemap.js` | Battle maps: the model, the Firebase seam, line of sight |
| `battlemap-library.js` | The GM's Maps pane, the import / creature dialogs |
| `battlemap-view.js` | The map view: camera, canvas, fog, pointer |
| `battlemap-initiative.js` | The turn order: model, panel, the GM's group roll |
| `tooltip.js` | Hover tooltip |
| `main.js` | `init()` and the single call to it |

### CSS file map

Loaded in this order. A rule's file is its subject; where two could claim it, the
one that owns the element wins.

| File | Contents |
|------|----------|
| `tokens.css` | Both palettes, `--cell` / `--cols`, and the map of this set |
| `base.css` | Reset, body, grain overlay, type, form controls, buttons, `.hidden` |
| `icons.css` | The `img/icon` PNGs as `.ico` glyphs, masked over `currentColor` |
| `layout.css` | The app shell: header, weight bar, main split, panel resizing |
| `inventory.css` | The torn sheet, grid cells, placed items, the drag ghost |
| `sidebar.css` | The right panel: browse list, folders, details, context/sort menus |
| `modals.css` | Modal chrome, and the shape editor inside the item editor |
| `character.css` | The character tabs, and page one of the 2024 sheet |
| `character-setup.css` | The sheet's gear button, and the class rows in the setup modal |
| `sheet-layout.css` | The sheet's split containers, resize seams, drop feedback |
| `class-features.css` | Feature cards, corner badges, Markdown in a description — Class Features *and* Species Traits |
| `sheet-prose.css` | The written sections: the bar, the editor, the rendered prose |
| `party.css` | Party header badge, the sidebar Party tab, kick |
| `campaigns.css` | The home screen's Campaigns section, its cards, the campaign modal |
| `equipment.css` | The equip rack, the left-panel tabs, the layout editor |
| `shop.css` | The GM shop editor, the player shopfront, their modals |
| `chat.css` | The sidebar's Chat pane, its messages and composer, a roll said in it |
| `dice.css` | The flying number, corner stack, wheel, hover card, tray |
| `battlemap.css` | The map button, the map view, the GM's library pane |
| `initiative.css` | The turn order panel over the board, its group-roll dialog |
| `tooltip.css` | The hover tooltip |
| `stash.css` | The stash (items needing placement) and the container tabs |
| `coins.css` | The multi-denomination cost input and the coin purse |
| `settings.css` | The settings modal, the theme picker, the info pages |
| `appearance.css` | The Appearance page's colour rows and the hue wheel |
| `auth.css` | The sign-in modal, the Settings account row, cloud conflict |
| `home.css` | The home button, the roster page, the character cards |

### State model (`src/js/state.js`)

```
state.character   { id, name, race, abilities{str…cha}, background, alignment,
                    xp, size, ac, speed,
                    hp{…}, hitDice{…}, deathSaves{…}, inspiration,
                    saveProf{}, skillProf{}, armorTraining{}, weaponProf, toolProf,
                    classLevels[{ name, level, subclass }],  (the classes, authoritative)
                    classes[], level, subclass, strength }   (mirrors of the above)
state.characters  { [charId]: { character, instances, equipped, equipLayout, db } }
state.activeCharacterId  charId                     (which slot the working copy is)
state.campaigns   { [code]: { code, name, role, characterId, gmName,
                              memberCount, lastPlayed } }   (bookmarks, in the save)
state.screen      'app' | 'home'
state.grid        2D array [row][col] → instanceId | null
state.instances   { [instanceId]: { id, templateId, rotation, row, col, stackCount } }
state.db          { [templateId]: ItemTemplate }   (default + custom items)
state.folders     [{ id, name }]
state.folderAssign    { [templateId]: folderId }    (overrides only; '__unfiled' = no folder)
state.folderCollapsed { [folderId]: true }
state.itemSort    'rarity' | 'name' | 'weight'
state.shops       { [shopId]: Shop }                (party's shops, from Firebase)
state.battlemap   { activeId, maps{} }              (party's maps, from Firebase;
                                                     a map's `initiative` is the turn order)
state.leftTab     'equip' | 'shop' | 'map'
state.shopOpenId  shopId | null                     (null = the list of shops)
state.mapLibraryOpenId  mapId | null                (null = the list of maps)
state.auth        { user, ready }
state.view        'inventory' | 'sheet' | 'map'
state.mode        'idle' | 'placing' | 'dragging'
state.placing     { templateId, rotation }
state.dragging    { instanceId, anchorRow, anchorCol, origRow, origCol, origRotation }
```

### Grid geometry

- 15 columns fixed (`GRID_COLS`); rows = `strength × 3` (three equal zones).
  Strength is 0–30, so a grid of no rows is legal.
- Cell size = 44px (`CELL`).
- Zone 0–(str-1): Normal carry; str–(2·str-1): Encumbered; 2·str–(3·str-1):
  Heavily Encumbered.
- `state.grid` is the authoritative occupancy map; placed-item `<div>`s are
  purely visual and rebuilt by `renderAllItems()`.
- **The grid can shrink under the items on it** — Strength going down, or editing
  a container template's `containerRows`/`containerCols`. `rebuildGrid()`
  fit-tests every instance before re-placing it and calls `unplaceInstance()` on
  whatever no longer fits (dropping it into that grid's Needs Placement list).
  Skipping the re-place without clearing `row`/`col` is unsafe: the item then
  occupies no cell, is clipped invisible by `#inventory-grid`'s `overflow:
  hidden`, and `totalCarriedWeight()` still charges for it.
- **The deferred resize.** A Strength typed on the sheet resizes the grid only
  when the reader goes back to the inventory (`markGridSizeDirty()` /
  `rebuildGridIfSizeDirty()` in `grid.js`, marked from `commitSheetEdit()`,
  settled by `syncCharacterViewUI()`). A number box passes through 0 and 1 on the
  way from 8 to 16; rebuilding on each keystroke would eject the whole pack, and
  finishing the number does not undo it (the ejection cleared every `row`/`col`).
  - Nothing is inconsistent while it waits: `state.grid` and its instances still
    agree; only `state.character.strength` has run ahead, read only by the
    header's weight readout.
  - The flag is cleared in **`initGrid()`**, not only in
    `rebuildGridIfSizeDirty()`, so a rebuild from any cause (boot, character swap,
    party sync) also satisfies the pending resize.
  - A save taken before the reader returns keeps each item's `row`/`col`, and the
    `rebuildGrid()` in `init()` settles it on the next load.

### Item shapes

Shapes are 2D arrays of `0`/`1`. Weight = count of `1`s (1 lb per cell).
`rotateShapeCW` rotates 90° clockwise; instances store a `rotation` index (0–3)
and `getRotatedShape(baseShape, rotation)` applies it. Stackable items always use
`[[1]]` and carry a `stackSize` — how many units fit in that one cell, so each
unit weighs `1 / stackSize`. `stackSize` absent or `1` means the item does not
stack. Read it through `stackSizeOf` / `isStackable` / `unitWeight` in
`helpers.js`, never off the template directly — those helpers also translate the
pre-`stackSize` `stackable` + `weightEach` pair still present in old saves and
party data.

### Item variants

A row's `variants` column (e.g. `+1 (uncommon, 500gp); +2 (rare); +3`) is a
+1/+2/+3-style family sharing one base item — `parseVariantSpecs()` /
`parseVariantSpec()` in `items.js`. Either half of a variant's parens, or the
parens entirely, is optional: whatever's missing is inherited from the base
row's own rarity/cost. A bare label with nothing in parens (`Ornate`) inherits
both.

- **A variant is materialized as a full item template of its own**
  (`materializeVariants()`, run once after the CSV parse), named `"<base name>
  <label>"` and appended to `DEFAULT_ITEMS` — so it lands in `state.db` and is
  placeable, stashable and sellable exactly like any other item, with nothing
  elsewhere needing to know it's derived. It carries `variantOf` (the base's id)
  and `variantLabel`; the base carries `variantIds`, the list of what it made.
  A variant's own `variantSpecs`/`variantIds` are empty — variants don't nest.
  Because it lives in `DEFAULT_ITEMS`, `getCustomDb()`'s `!DEFAULT_ITEMS.find(…)`
  filter already treats it as a default: never saved, rebuilt fresh on every load.
- **A variant is never a top-level Browse entry.** `renderItemList()` filters
  out anything with `variantOf` before sorting/foldering; `appendVariantRows()`
  is what actually draws them, directly under the base's card, indented
  (`.item-card-variant`), and only while that base's id is in
  `expandedVariantIds` (session-only, like a folder's collapsed state).
- **The dog-ear is the affordance and the toggle is on the whole card.**
  `buildItemCard()` adds `.has-variants` and a corner `.item-card-variant-tag`
  triangle whenever `variantIds` is non-empty; the card's existing click (the
  one that starts placing the base item) also flips its id in
  `expandedVariantIds` before that click's own `renderItemList()`, so one
  rebuild shows both the placing highlight and the newly (un)folded family.
- `folderItemCount()` excludes variants for the same reason the list does — its
  count backs the delete-folder confirmation, which should match what the
  folder visibly holds.

### Side panels

Both side panels resize by the handle on their inner border (`panels.js`), and
fold away when dragged narrower than `PANEL_COLLAPSE_AT`, leaving a round reopen
button. Widths and collapsed flags are this *browser's* window furniture — like
the theme and folders they live in their own key (`dnd_inventory_panels`) and
never enter the save file or party data.

- Widths are CSS custom properties (`--equip-w` / `--sidebar-w`) set on `#app`;
  `:root` holds the defaults. One class per side (`equip-collapsed` /
  `sidebar-collapsed`) hides the panel *and* its handle, shows the reopen button,
  and pads `#character-tabs` clear of it.
- Collapse happens live from the raw cursor position, not on release.
- `.panel-resizer` **must stay `position: relative`** — it straddles the seam on
  negative margins, and unpositioned its `z-index` does nothing, so the
  positioned `#inventory-panel` eats the clicks on half of it.

### Campaigns

A **campaign** is a persistent party: it has a name, a Game Master, and remembers
who plays in it and which character each brings. The model is
`src/js/campaigns.js`; the live session under it is `party.js`.

> A roster entry is keyed by the player's **account uid**, not by a per-join
> session id.

That single change is the whole of the duplicate-player fix: keyed by the
account there is nowhere for a duplicate to be, a rejoin lands on the node you
already had, and the roster can be *read* as membership — a list that outlives
every session in it. `ownPlayerId()` is the one way to ask.

- **The GM is the exception, deliberately.** Their node is `parties/<code>/gm`
  (one node, not a keyed collection). Their uid is recorded there and in
  `meta.gmUid`, which is how a campaign remembers who runs it.
- **Legacy `p_…` entries** are swept on join by `sweepLegacySelfEntries()`,
  matched on the typed name. Best-effort; a leftover it misses is one Kick away.
- Shop reveals: `shop.players` is keyed by the same uids and survives a rejoin.
  `shop.playerNames` stays as a name-match fallback for reveals written under the
  old per-session keys.

**Two halves, neither a copy of the other:**

```
parties/<code>/          in Firebase — the campaign. Shared, authoritative.
  meta      { name, gmUid, gmName, createdAt }
  gm        { name, uid, connected }
  players   { [uid]: { name, uid, characterId, connected, character, … } }
  shops     …

state.campaigns[code]    in the save file — this account's *bookmark*.
  { code, name, role, characterId, gmName, memberCount, lastPlayed }
```

- The bookmark answers only what the home screen must know **before** it has
  spoken to Firebase. Everything cached in it is refreshed from the party
  (`noteCampaignMeta` / `noteCampaignRoster`, driven by party.js's subscriptions).
- **Nothing reads the bookmark to decide anything that matters.**
  `enterCampaign()` asks the *party* whether you are its GM (`meta.gmUid`), not
  the local `role` — so a GM signing in on a new machine still lands right.
- Neither refresh calls `debouncedSync()` — they fire on every roster snapshot;
  the next real edit carries them.
- It rides in the **save payload** (v3), so it follows the account across
  browsers for free (cloud-save.js already mirrors it) with no new database
  rules. Cost: a campaign is not discoverable until you have typed its code once.

**Leaving the session is not leaving the campaign.** Closing the tab or pressing
Leave Party ends the connection only — the roster entry stays. `leaveCampaign()`
is the separate act that gives up the seat, and for a **GM it deletes the
campaign outright** (a record with nobody running it is dead). A kick reaches
both halves: the entry goes *and* `handleRemovedFromParty()` drops the bookmark.

**The section sits above Your Characters** on the home screen. A campaign card is
a `.char-card` with two extra pieces. Clicking one enters it, switching to the
remembered character *first* so the roster entry is right the first time.

**One door in.** The campaign modal (create / join) is opened from the home
screen *and* the sidebar's Party tab, so the two can never differ. Everything
goes through `requireAuth()` — the buttons stay live when signed out and ask for
the account when pressed.

**Known gap.** A party created before this — no `meta.gmUid` — reads as having no
GM. Those parties were session-scoped and unbookmarkable, so nothing can click
into one; they die with the session they were made in.

### The sidebar's tabs

The right panel shows the tabs that belong to what the inventory panel is
showing:

```
inventory view    Browse · Details · Party
sheet view        Chat · Dice · Party
map view          Chat · Dice · Party      (the same three, deliberately)
```

Party is in **both**, which is why `SIDEBAR_TAB_VIEW` in `modals.js` is a map
with a null in it rather than two flat lists.

- **`sidebarView()` is not `state.view`.** A GM who deselects a player keeps
  `state.view === 'sheet'` while the panel shows their placeholder; reading the
  raw field would strand them on Chat/Dice with no **Browse** (the pane they
  stock shops from). It reproduces the `showSheet` test `syncCharacterViewUI()`
  uses for `.sheet-view`.
- **The battle map answers `'sheet'`** rather than earning a third row — the
  question is "which panes belong beside it", and that is Chat, Dice, Party.
- **Asking for a tab is asking for the view it lives in.** A shop entry clicked
  from the character sheet calls `switchTab('details')`; the honest answer is to
  show the item, which means going where items are shown. That one line in
  `switchTab()` is why every existing caller kept working untouched.
- **Only the sheet can be refused** (`hasViewedCharacter()` in `switchTab()`) — a
  GM with nobody picked has no character to show one of. Asked of an inventory
  pane it would refuse a move that is always possible.
- `activateSidebarTab()` is the plain DOM half (light one button, show one
  pane); `syncSidebarTabs()` calls *it*, not `switchTab()`, so the two cannot
  recurse. `syncSidebarTabs()` falls back to the first visible tab if a view
  switch hid the active one. Driven from `syncCharacterViewUI()`.

### Chat

Talk belongs to the **table**: `parties/<code>/chat`, one log for everyone
holding the code. `src/js/chat.js`.

```
parties/<code>/chat/<pushId>   { uid, name, text, at }
```

- A **push id**, not a client-minted one: RTDB's are ordered by server time and
  unique across clients with no coordination. The renderer sorts them explicitly.
- A **read-through cache** like `state.shops`, refreshed by `subscribeToChat`
  (called from `subscribeToParty`). Nothing about it is in the save file.
- Only `limitToLast(200)` (`CHAT_HISTORY`) is subscribed.
- **`name` is stamped on the message, not looked up when drawn** — who said a
  thing is a fact about the moment it was said. It is the *account's* name.
- **`textContent`, never `innerHTML`, and markdown.js is deliberately not
  involved** — a chat line did not ask to be formatted. This is the one pane
  where another player's typing lands in your browser every few seconds.
- **Pinned-to-bottom is measured, not assumed** — a new message must not yank a
  reader out of scrolled-up history, nor strand them above the newest line.
  Sending is always an intent to follow. `onChatTabShown()` renders rather than
  only scrolling (the first time, the pane has never been drawn).
- **Your own lines hang right, everyone else's hang left.** `.chat-msg` is a
  column whose cross-axis alignment picks the edge; `.chat-msg-head` reverses for
  your own so the name is against the edge either way. Needs a `max-width` on the
  bubble and the accent edge crossing to the right with it. Text inside stays
  left-aligned.
- **A roll is a message too** (`kind: 'roll'`) — see *Dice*. chat.js draws it as
  a card, working only from the payload; `rollMessageBody()` is the whole of that.
- The composer survives `body.party-readonly` — reading another player's sheet is
  read-only, but talking to them is not.
- With no campaign (or signed out) the pane says so.

### Dice

A roll is **one event with three audiences**: the roller (the big tumbling
number, then a corner chip whose hover opens the whole working), the table (a
line in the chat log), and everyone else (a bubble over the roller's tab).
`src/js/dice.js`.

**There is no `parties/<code>/rolls`.** A roll *is* a chat message:

```
parties/<code>/chat/<pushId>
  { uid, name, text, at,
    kind: 'roll',
    roll: { label, total, mode, faces, count, mod, dice[], dropped[] } }
```

The log is already ordered by the server, subscribed by everyone, capped, and
name-stamped — a rolls collection would need all of that again and would still
have to be interleaved with the conversation to read in order. So the tab
bubbles ride the chat subscription too: `noteRollFeed()` is called from it, and
nothing in dice.js talks to Firebase except `postRollToChat()`. Rolling
therefore **works with no campaign at all** — the big number and corner stack
are local; `canChat()` makes the other two audiences silently not happen.

- **`parts` is deliberately not in the payload** — it is what the sheet knew at
  roll time (which ability, off what score, which proficiency), for the hover
  card on your *own* corner chips. Nobody else is offered that card.
- **`text` is written anyway**, as the plain sentence ("🎲 13 Arcana · 1d20 (9) +
  4"), for anything reading the log that does not know what a roll is. The
  renderer never reads it — `rollMessageBody()` works from the payload alone.
- **Nothing about a roll is in the save file.** `rollHistory` is session-only.

**The tumble.** The number arrives spinning through other plausible values, then
locks on. Runs a **random 1–3 seconds** (a fixed beat becomes a delay to sit
through).

- The values shown on the way past are made by **rolling the same pool again**,
  so a `3d6 + 2` never flashes a value it could not produce.
- The gap between numbers eases on `t²` — almost all the slowing is at the end.
- A `setTimeout` chain, not `requestAnimationFrame` — a background tab stops
  rAF entirely, and a roll thrown in one must still land.
- **Nothing gives the answer away early.** The detail line is held until the
  answer is final (`visibility`, not `display`, so height does not change). The
  crit colour waits too — that is the whole of the `.settled` gate;
  `:not(.dropped)` keeps it off the die that lost.
- Two class names: **`locked`** = the dice stopped; **`settled`** = the answer is
  final. Same instant for a straight roll; two beats apart for advantage.
- The waiting chip is `pointer-events: none` as well as invisible, or hovering
  where it will land would open the working while the number is still tumbling.
- **A second roll supersedes the first** — `flyRoll()` finishes any flier still
  in the air (no flight, no fade).

**An advantage roll tumbles two numbers side by side.** Both spin, both stop,
both stand for a beat, then the loser greys and shrinks while the winner slides
to the middle. Same 1–3 seconds — the extra beats come *out of* the tumble.

- **Both figures are whole totals** (pool + modifier), so the number that wins is
  the number that flies to the corner.
- **Each number's box is fixed for the whole roll** at the widest total the pool
  can reach (`totalBoxWidth()`, in `ch`, tabular figures) — a box that grew with
  the digit count would shove its neighbour on every tick.
- **Drawn in roll order** (`keptIndex`) — drawing the kept one first would put
  the winner on the left every time.
- The loser is greyed and shrunk, not removed — advantage is only legible if
  what it discarded is still there. It shrinks **away from its neighbour** (the
  winner is sliding through where it was); at exactly a half the clearance is
  `gap/2` whatever the digits.
- The lock beat's keyframes own `transform`, which the resolve then needs — so
  the beat is scoped to end at `settled` on a paired roll. A straight roll keeps
  the unscoped version.
- **Both halves move by transform only** — the row never reflows, so the flier's
  box (measured a moment later for the flight) does not shift.
- `centreWinner()` reads **`offsetLeft`/`offsetWidth`, never
  `getBoundingClientRect()`** — the rect is the transformed one, and these
  elements sit under the entrance tumble which scales the block. Offsets are
  layout values. It re-runs on `document.fonts.ready` for the first-view race
  where digit widths measure in the fallback font.

**The flight.** The chip is put into the corner *first*, held invisible
(`.roll-chip.landing`), and the flier is aimed at where it actually landed —
measuring the real destination is the only way the flight ends exactly on it.

- The flier is built **at rest** (`translate(-50%, -50%)` only) — the entrance
  tumble lives on the *inner* element, keeping the flier's own transform free for
  the flight and its box truthful when measured.
- `landRoll()` reveals the chip with the same call that removes the flier.
- `transitionend` fires per property and not at all in a background tab, so the
  **timeout is the one that counts**.
- No destination (corner behind the home page, history reset mid-flight) → it
  fades where it stands.
- **The wash hangs off the flier, not the inner element** — the flier's
  transform carries it to the corner, the inner's does the tumble alone, so the
  number turns and the light behind it does not. Its size is fixed (two lengths,
  `closest-side`), not `inset`-relative, or it would breathe with the digit
  count. Its colour is **`--panel`**, not `--bg` (which is locked dark in both
  palettes and would smudge the parchment).

**The corner** (`#dice-history`) is inside `#inventory-panel` — a roll is the
*app's* answer, and the middle is where a flung number can come from anywhere.
Newest at the bottom. `z-index: 7` clears `#gm-placeholder` (5) and the character
tabs (6); `pointer-events: none` throughout except the three chips, so the stash
underneath stays clickable. Age (`.age-0` … `.age-2`) drives the fade.

**The bubbles are a fixed layer**, not children of the tabs (`#character-tabs`
scrolls sideways and clips overflow). `renderTabBubbles()` is called from the end
of `renderCharacterTabs()` and re-aims from the tabs each time.

- A bubble is **rebuilt on every roster update**, so its animations start at the
  point in their lives they have actually reached (negative `animation-delay`
  runs the entrance forward, the fade is delayed by what is left).
- The tail points at the **middle of the tab** (`--tail-x`) even when the bubble
  is clamped sideways to stay on screen.
- `seenRollIds` is **null until the first snapshot** — joining delivers the whole
  tail at once and every line in it is history. `resetRollFeed()` puts it back to
  null when the log is torn down.
- A GM has no tab, so a GM's roll is dropped from the bubbles (still said in the
  log).

**Advantage, on a held press.** Press and hold any modifier or die and two
options open either side of the cursor; slide onto one and let go. Letting go in
the middle rolls straight, so the gesture costs an ordinary click nothing.
**Disadvantage left, advantage right.**

- The wheel opens after a short hold **or** as soon as the pointer moves 9px.
- The pointer is **captured on the button that started it**.
- **Advantage rolls the whole pool twice and keeps the better total** — for 1d20
  that is the rule as written; for the tray's 3d6 it is the only meaningful
  reading. The discarded pool is kept as `dropped`.
- **The wheel is small on purpose**, opening on the cursor and nudged only as far
  as needed to stay on screen — every pixel of nudge is a lie about where the hub
  is. So the caption under it ("Adv" / "Dis" / "Straight roll") carries the
  words. Its reach is declared once in the CSS (`--wheel-w`, `--wheel-gap`,
  `--wheel-h`) and read back by `openRollWheel()`.
- `lastPointerRollAt` stops the browser's post-press `click` from rolling twice.
  It is stamped even on an **abandoned** gesture (Escape, cancelled pointer). A
  click with no pointer sequence before it is a keyboard one and is the only kind
  let through.

**The working, on hover.** Hovering a corner chip opens the whole roll: every die
face, the pool advantage discarded (struck through), and each score and
proficiency behind the modifier as its own raw number.

- **`parts` is collected at roll time**, not worked out on hover — the sheet
  moves.
- The container stays `pointer-events: none`; only the three chips take events.
- A card, not a `title` — a native tooltip cannot strike through the discarded
  die.

**What can be rolled.** Every sheet target says what it is in one `data-roll`
attribute (`skill:arcana`, `save:dex`, `ability:cha`, `initiative`), read by
`sheetRollSpec()`. The **modifier is never stored on the element** — it is asked
of the sheet when the press is let go. `parts` is that same answer taken apart.

- A prof row is **two** buttons: the dot (changes proficiency) and the
  name-plus-modifier (rolls it).
- **Not gated by `isReadOnly()`** — rolling writes nothing, and the roll is
  attributed to the *account* that clicked, so a GM rolling a player's Perception
  is honest and useful.
- The tray's seven faces are built from `DICE_FACES`; count and modifier are read
  when a face is clicked, so the tray keeps no state.
- **A crit is a natural 20 or 1 on a single d20, and only there** — read off the
  **kept** die; colour *and* the word in the detail line.
- The Adv/Dis tag is **one pill across four surfaces** (chip, bubble, chat card,
  flier), built by `rollModePill()`. It lives in dice.css even inside a chat
  message.

**The label leads the number everywhere:** "14 Arcana", not "Arcana: 14".

### Presence — the green dot

The dot beside a roster entry is green **iff that person has the app open on this
campaign right now**. `startPresence()` / `endPresence()` / `isPlayerOnline()` in
`party.js`.

**Two facts, not one.** `connected` is what the client last claimed; `lastSeen`
is when. A claim with no heartbeat behind it lapses on its own. Heartbeat 40s,
stale at 105s (~2.5 missed beats).

- **`onDisconnect` is armed from `.info/connected`, not once at join** — RTDB
  *consumes* the handler when it fires and does not re-arm it, so a single wifi
  blip used to spend it. `.info/connected` fires on every (re)connection.
- **`connected: true` is written inside the handler's `.then()`**, never before —
  a drop between the two would leave a live seat with nothing watching it.
- **`endPresence()` writes the `false` itself**, before cancelling the handler.
  Once a seat is keyed by account and *persists*, cancelling alone leaves a green
  dot on an empty chair.
- **`lastSeen` is stamped by the server and read against the server's clock**
  (`.info/serverTimeOffset`).
- **The heartbeat is not folded into `syncPartyState()`** — that writes to
  whichever node is being edited, which for a GM is one of the players.
  `beatPresence()` only ever touches `partySelfRef`.
- **An entry with no `lastSeen` at all reads as offline** — it is a record left
  behind by a session that ended before any of this worked.
- **`startPresenceSweep()` re-checks every 15s** for as long as a session is
  open — a claim lapses by the passage of time, which is not an event Firebase
  wakes us for. It compares a signature first and redraws only when an answer
  changed.
- The panel and the character tabs both ask `isPlayerOnline()`.

### Party membership

The roster under `parties/<code>/players` is the membership list, keyed by
account (see *Campaigns*). The GM is the only one who can shorten it: a **Kick**
button on each Party-panel entry.

- **Removing the entry is the whole operation** — no "you were kicked" flag. A
  player's client sees itself gone from the roster snapshot and leaves.
  `sawSelfInRoster` (set at join) tells a removal from a not-yet-arrived first
  snapshot.
- The kicked player loses nothing — their roster entry was always a *copy*.
- `partySelfRef` exists so `leaveParty()` can **cancel the onDisconnect** —
  uncancelled, closing the tab later would write `connected: false` back into a
  party we have left. A kicked client also sweeps its own node once it stops
  syncing (a sync in flight lands as an `update()` on a missing path and
  recreates it).
- The GM's own view is handed back first if they were looking at the kicked
  player.
- This is **pacing, not security** — a kicked player who reads the database
  directly can still write to `parties/<code>`.

### Shops

A shop belongs to the *table*: the GM builds it, reveals it, and everyone who can
see it draws from one shared pile of stock.

- `state.shops` is a read-through cache of `parties/<code>/shops`, refreshed by
  `subscribeToShops` (from `subscribeToParty`). **Nothing about a shop is in the
  save file.**
- **Stock is claimed by an RTDB `transaction()` before anything leaves the
  buyer's purse** — two players hitting Buy on the last sword, one wins, the
  loser is told and not charged. Coins move only after `committed`.
- **Reveal is pacing, not security** (`shopVisibleToMe()` filters on the client).
- Reveal is stored as `revealed` + `audience` (`'all' | 'select'`) + a `players`
  map keyed by account uid. `playerNames` is a name-match fallback for reveals
  written under the old per-session ids.
- Stock arrives two ways — the picker modal and a card **dragged out of Browse** —
  both through `addItemsToShop()` (an item already on the shelf gains one to its
  count). The drag is the folder-header pattern: `getShopDropTargetAtPoint` is a
  bounding-rect test `buildItemCard` checks *before* the grid.
- **Two prices per line.** The *base* is what the GM typed (or the item's cost);
  `shop.priceModifier` (whole percent, absent = 100) scales every base together.
  `shopEntryBasePrice()` is what the editor edits; `shopEntryPrice(shop, entry)`
  / `shopEntryPriceCp()` is what the listing, buy dialog and purse use. Scaling
  is in copper and never rounds a real cost to nothing. Players see only the
  scaled price.
- A stock entry snapshots the whole item as **JSON in `template`** (a string,
  because RTDB drops nulls and empty objects and templates are full of both).
  `resolveShopTemplate()` matches the snapshot against the buyer's own `state.db`
  by id then name before registering it as a custom item.
- `qty` of `-1` (`SHOP_UNLIMITED`) is a bottomless entry (a sentinel, not null).
- Paying is real: `planPayment()` spends the **smallest** coins first and breaks
  a coin for change when what is left is smaller than any coin in the purse. It
  refuses rather than swallow a difference it cannot hand back. `applyPayment()`
  moves coins through the same `addCoinsToInventory` / `removeCoinsFromInventory`
  the purse buttons use.

### Battle maps

A map belongs to the **table**, like a shop and the chat log. Three files:
`battlemap.js` (model, Firebase seam, geometry), `battlemap-library.js` (GM's
pane, dialogs), `battlemap-view.js` (the map itself).

```
parties/<code>/battlemap/activeId          which map the party is on
parties/<code>/battlemap/maps/<mapId>
  { id, name, image, w, h, order, revealed, createdAt,
    grid:   { type, size, offsetX, offsetY, visible },
    tokens: { <id>: { id, name, icon, x, y, size, hostility, ownerUid } },
    walls:  { <id>: { id, kind:'rect'|'circle', x, y, w, h, r } },
    masks:  { <id>: { id, mode:'hide'|'show', x, y, w, h } },
    elevation: { <id>: { id, kind, x, y, w, h, height } } }   (height: ft, -500..500)
```

- **Nothing about a map is in the save file.** `state.battlemap` is a
  read-through cache refreshed by `subscribeToBattlemap` (from
  `subscribeToParty`).
- **Reveal is pacing, not security**, and so is the fog — both are computed and
  drawn on the reader's own machine from data every member can read.
- There is **no map without a campaign** — the corner button is simply absent.

**Every coordinate in the model is in the picture's own pixels.** Never screen
pixels, never cells — the camera is this browser's furniture and the grid moves
under the tokens whenever the GM nudges it. Image pixels are the one frame every
client already agrees on. `mapBounds()` reads the *stored* `w`/`h`, not the
`<img>`'s.

**The picture is stored with the map**, as a data URL — a link rots and the app
has no file storage. An imported file is scaled to `MAP_IMAGE_MAX_DIM` and
re-encoded as JPEG. A **link** the browser will not redraw cross-origin is kept
as the link (works as a picture, cannot be shrunk).

#### The fog

Worked out as a **polygon per party member**, not a grid of lit cells.

- `computeVisionPolygon()` casts a fan of rays, each stopping at the nearest
  wall. `visionAngles()` also aims **three rays at every corner** (one either
  side by a hair) — the straddling pair is what makes a shadow's edge a straight
  line. A circle gets its two tangents.
- **Every angle is normalized into `[0, 2π)` before that list is sorted, and that
  one line is the difference between a shadow and no shadow** — `Math.atan2`
  answers in `(-π, π]` and the uniform fan is written over `[0, 2π)`; sorted raw,
  the two numberings interleave and the coarse pass paints over the shadow the
  corner rays cut.
- Near-identical angles are dropped (threshold well under `VISION_NUDGE`).
- A wall **containing** the source is skipped.
- The result is one **offscreen canvas** at the picture's resolution (capped by
  `FOG_MAX_DIM`), black where the party cannot see. Read twice — drawn over the
  board, and sampled under each creature (5 probes across its disc) — so what is
  hidden and what is dark are **one answer**.
- **The edge of a shadow is not a line** — every hole the vision cuts, and every
  GM-painted region, is drawn through a canvas `blur()`.
  - Applied to the **shapes as they are cut**, never the finished canvas —
    blurring the whole thing would soften the fog's own outer boundary (the edge
    of the map, where the dark must stay solid).
  - The radius is a **fraction of the map's longer side** (`FOG_BLUR_FRACTION`,
    under 1/100), so softness reads the same on any map size.
  - The GM's own regions are softened alike.
  - Costs the creature test nothing — a half-alpha threshold on a soft edge is
    the middle of the ramp, where the hard edge used to be.
  - `fogBlurFilter()` **feature-detects and returns `null`** where a browser has
    no canvas filters; buildFog then draws a crisp edge (a worse shadow, not a
    broken one).
- Order at the end of `buildFog()`: vision cuts holes, a **Reveal** region cuts
  one, an **Obscure** region is painted last.
- **A map with nobody on it has no fog at all** — with no member to see out of,
  the arithmetic says nothing is visible, and an all-black board reads as broken.
- The GM sees the fog as a **wash** (0.45) and hidden creatures dimmed, not gone.
- **The fog settles when a creature is let go, and not before** (`fogDirty` set
  in `onMapPointerUp()` alone) — a fog that followed the drag would hand anyone a
  free look down every corridor. Rebuild is ~10ms on a deliberately extreme map.
- One player seeing what another sees falls out of the fog being a **union**.

#### Elevation

The GM paints zones with the **Height** tool (`map.elevation`, shaped exactly
like a wall: `kind:'rect'|'circle'|'poly'`, plus `height`). `height` is feet
from the base map, an integer in `[-500, 500]` (`clampElevHeight()`); the base
map itself is height 0 and has no shape. Unpainted ground is 0; a token's own
height is whatever zone it stands in (`elevationAt()`). Read a zone's height
through **`elevZoneHeight(z)`**, never `z.height` directly — it also maps a
legacy `level:'low'|'high'` zone onto `∓20` ft. Model and geometry are in
`battlemap.js`'s **GEOMETRY — elevation** section; the Height tool (with its
starting-height box), right-click-to-edit, and rendering are in
`battlemap-view.js`, alongside Wall and Fog.

- **Looking down is free, looking up is tapered, never blocked outright.** A
  viewer sees every level below their own at any distance. The taper only
  touches a ray once it would cross into ground *higher* than the viewer's own —
  `elevationRayLimit()` shortens that ray exactly the way a wall would shorten
  `computeVisionPolygon()`'s, except by how far rather than whether at all, and
  the two combine with a plain `Math.min`.
- **The formula.** `f(d) = floor(2d / h)` tiles past the rise's near edge are
  visible, where `d` is the viewer's own distance back from it and `h` is the
  zone's height **relative to the viewer** (`elevZoneHeight(zone) −
  sourceHeight`) — both in **feet** (`elevationRayLimit()` scales the ray's
  pixel distances by `MAP_FEET_PER_CELL / cellPx`). `h ≤ 0` — level with or
  above the zone — is `elevationVisibleTiles()`'s `Infinity`, i.e. seen
  unimpeded.
- **Two things can shorten a ray, independently, and it takes whichever is
  shortest:**
  - If the **viewer's own zone is below the base map** (`elevZoneHeight < 0`),
    leaving it is itself a rise to base (`h = −ownHeight`) — `d` is measured to
    wherever that ground ends, via `rayRectSpan()`/`rayCircleSpan()` (both roots
    of the intersection, not just the near one `rayRect()`/`rayCircle()` give a
    wall, because this needs how far the ray travels *inside* the viewer's own
    zone).
  - **Entering a zone higher than the viewer**, at whatever distance the ray
    first reaches it, using *that zone's own* height relative to the viewer —
    regardless of the ground in between, because `h` is how far up the *viewer*
    is trying to see, not the local terrain step. So a viewer at −15 looking at
    a +10 zone across the base map uses `h = 25` for that zone's cutoff, and
    seeing a rise beyond a rise needs *both* cutoffs to allow it, not just the
    nearer one.
- **Elevation zones are aimed at like walls** (`visionAngles()`'s
  `extraShapes` parameter) so their edges cut a crisp line in the fog too —
  the taper still needs a sharp boundary to taper *from*.
- **Elevation zones never block a ray outright** the way a wall does — they
  only ever shorten it, so a viewer standing far enough back always sees
  *some* distance onto higher ground, never zero, past the zero-tiles-visible
  case the formula returns up close.

#### The board

- **The third view of the middle panel** (`state.view === 'map'`, `.map-view` on
  `#inventory-panel`), driven by `syncCharacterViewUI()` like `.sheet-view`.
- **It is the one view that is not a view of a character**: reached from the
  corner button and the Maps pane, not a tab menu; a **GM with nobody selected
  may be on it**, so `#gm-placeholder` stands down for `.map-view`; the sidebar
  answers `'sheet'` for it.
- **`mapViewIsShowing()` is the one answer both halves of the screen ask** — not
  `state.view === 'map'`, because a map can be pulled out from under the reader
  (deleted, un-revealed) while the field still says `map`.
- **`onMapViewShown()` does nothing unless the map was not already up** — it is
  called on every pass through `syncCharacterViewUI()` (a roster snapshot drives
  it), and setting the canvas size / rebuilding the toolbar must not happen on a
  presence heartbeat.
- **Closing hands back the view you came from** (`mapReturnView`); the camera is
  framed per *map* (`mapFramedId`).
- One `<canvas>`, **drawn on demand** — every path that changes the screen ends
  in `drawBattlemap()`.
- **The camera is not synced** and not even stored.
- **The button is bottom-left of the middle panel**, inside `#inventory-panel`,
  `z-index: 7`. Unlike the dice it takes clicks, so the stash header is padded
  clear of it (`has-map-btn`). Absent unless there is a map to open (for a
  player, one revealed), and absent once the map is up.
- **Opening a map puts the GM's Maps pane in front of them** and switches the
  left panel to it.
- The map's keyboard handler ignores a key pressed into an `input`, `textarea`
  or `select` — the chat composer is beside it.

#### Who may do what

- **The GM alone edits the map** (terrain, grid, fog) — `canEditMap()`.
- **A creature is anybody's** (`canAddCreature()`) — deliberately *not* gated by
  `isReadOnly()`, which guards a *character*.
- **A creature is removed by whoever put it there, or the GM** (`canRemoveToken()`,
  on the `ownerUid` stamped at creation).
- Hostility is the token's **whole colour scheme** — `--hostility-*` are
  per-theme tokens read through `hostilityColor()`, baked into a canvas fill and
  the icon buttons' inline `--hc`, so **`rerenderThemedContent()` clears that
  cache and redraws**.
- **Snapping depends on the footprint** (`snapToGrid()`) — an odd cell count
  centres on a square, an even one on the line between two. Tiny centres like
  Medium. Editing size re-snaps.
- **Only a square grid is built** — `grid.type` is the seam a hex grid would
  arrive through.

#### Lining the grid up

- **The figures are fractional** (`roundGridValue()`, two places) — a map is
  rarely a whole number of pixels per square, and rounding accumulates drift of
  up to half a pixel per square. Steppers still nudge by a whole pixel.
- **The Grid tool's handles are the picture's own corners and edges.** Pull one
  and the grid magnifies about the point opposite (`scaleGridAbout()`); drag
  anywhere else and it slides (`slideGridBy()`). A scale about a fixed point
  answers both "how big is a square" and "where does the run start" at once — the
  pivot *is* the start (`pivot + (line - pivot) * k`). The far side is the
  longest lever, where a per-corner error is most visible and the drag divides it
  away.
  - A corner's magnification is the **average of what each axis says** (not a
    diagonal distance, which would let a wide map's sideways movement dominate).
  - An **edge is the same gesture with one axis held back** (`axis` in
    `GRID_HANDLE_SPOTS`) — finer, and the handle for when only the size is wrong.
    It still scales about a point (the middle of the opposite edge).
  - Both live on one rule: `ix`/`iy` run 0→1 across the map and the pivot is
    `1 - i`.
  - The applied factor is taken from the **clamped** size, so at the size limits
    the offset does not go on scaling and sliding the grid sideways.
- **Sizing and positioning are two gestures** — scaling preserves where the pivot
  sits in its square, so it cannot fix a right-size grid in the wrong place.
- **Nothing about the tool is stored.**
- **The grid is written once, on release** — every pointermove draws from a
  pending copy (`viewGrid()` / `viewCellSize()`). A click that never moved writes
  nothing; Escape abandons the drag.
- **The size is shown at the handle** as well as in the bar under the map.
- **The left button slides the grid while this tool is up** (not pan). Middle and
  right still pan.
- While the tool is up the grid is drawn **in accent, whether or not it is
  switched on for play**.
- The numeric controls stay in the **Maps pane**, which opening a map brings up.

### Initiative

The turn order lives with the map it is fought on —
`parties/<code>/battlemap/maps/<mapId>/initiative` — so "has this player rolled
already?" is answered by *this map's* entries, it rides `subscribeToBattlemap`,
and it is thrown away with the map. `src/js/battlemap-initiative.js`.

```
initiative
  round   1, 2, 3 …
  turn    <entryId>          whose turn it is, named rather than numbered
  entries { <id>: { id, kind, name, score, at, uid?, tokens?, icon?, hostility? } }
```

- **The turn is an entry id, never an index** — the order is not a fixed list (a
  late roller drops into the middle mid-fight; the GM can remove a group).
  `initiativeActiveEntry()` heals a dangling turn by falling back to the top.
- **The order is score, then the moment of the roll, then the id** — an arbitrary
  but *stable* tie-break, so every client sorts the same list the same way.
- **A player joins by rolling Initiative** — from their sheet or the board. The
  panel's **Roll Initiative** button carries the sheet's `data-roll="initiative"`
  and is wired to the same dice.js listeners, so it *is* that roll (same
  modifier, flight, log line, hold-for-advantage).
  - Offered exactly when pressing it would do something: **not to a GM** (whose
    button is the +), **not while reading someone else's sheet**, **not once you
    are in the order**.
  - It sits under the list (a labelled button among glyphs) and survives
    collapsing.
- One hook, `noteRollForInitiative()`, called from `performRoll()` for every
  roll and interested in exactly one (`kind: 'initiative'` — the only thing
  `kind` on a roll is for; not in the chat payload).
  - **Your own first roll, and only that.** *Own*, because a GM reading a
    player's sheet rolls as the GM (`liveStateIsOwnCharacter()`). *First*,
    because rolling twice must not let anyone pick the better number — the roll
    still happens and is still said, it just does not move them.
- **The GM rolls for the board in groups** — tick any number of creatures, one
  d20 for the lot, one shared place. The modifier is typed in the dialog (this
  app has no monster stats). Goes through `performRoll()` like everything else.
  - Creatures already in the order are not offered again.
  - The suggested name is the creatures' shared name; **the count is not in it**
    (the row draws it as a badge).
- **An account's creatures are not all its character** — a player's entry names a
  *uid* and finds its creature via `ownerUid`. But a GM stamps their own uid on
  every monster, so the match is `ownerUid` **and** party hostility
  (`initiativeEntryClaims()`).
- **Running the fight is the GM's.** Wrapping past the end is the next round (the
  only place `round` changes). A player may still take *themselves* out.

**The panel** sits over the top left of the board. **Collapsed it says only whose
turn it is**; expanded it is the whole order. Both are the same list (collapsing
hides inactive rows in CSS). Collapsed-ness is session-only.

- **The panel is part of the board, not something a fight brings with it** — the
  GM's + and the player's Roll Initiative both live in it before there is an
  order.
- **Hovering either half lights the other** — one piece of state
  (`initiativeHoverId`, an *entry* id). The board's half is asked on every
  pointermove, so `setInitiativeHover()` returns early when the answer is
  unchanged and re-marks rows in place rather than rebuilding.
- **The turn is drawn on the creature too**, in the panel's accent; the hover in
  white. `initiativeMarks()` works them out once per frame.
- A row's glyph is read off the **live token**, not the entry.
- The panel inlines hostility colours, so it re-renders from
  `rerenderThemedContent()`.

### The left panel and its tabs

The left panel is the equipment rack, plus — for a GM — their own tools. The tab
strip (`syncLeftPanel()` in `shop.js`) appears only when there are two panes to
choose between.

- **A GM has no character**, so with nobody picked the Shop is the whole panel
  rather than an empty rack (`leftTabsAvailable()`). The GM's tabs read
  Shop-then-Equipment while a player's read Equipment-then-Shop — each role's own
  thing first.
- A player has no Shop tab until a GM reveals one.
- **Maps is the GM's alone** — a player reaches the one map that concerns them by
  the corner button.
- Driven from `syncCharacterViewUI()`.
- Deliberately **not** `.tab-btn` / `.tab-pane` (those belong to the sidebar, and
  `switchTab()` toggles every one on the page).

### Characters and the home screen

The save file holds a **roster**, `state.characters`, and exactly one slot at a
time is live in `state.character` / `state.instances` / `state.equipped` /
`state.db`.

- Live state stayed where it always was — every render path, the grid, the drag
  machinery and party sync already speak that language. The roster is the
  *store*; the live fields are the *working copy*. Exactly two functions bridge
  them: `commitActiveCharacter()` (working copy → slot) and
  `loadActiveCharacterIntoLive()` (slot → working copy).
- `commitActiveCharacter()` runs from `buildSavePayload()`, so every save flushes
  the character on screen back to its slot first.
- It **refuses** whenever the working copy is not your own character
  (`liveStateIsOwnCharacter()`) — another member's sheet, or a GM with none. A
  GM's own character is reloaded from its slot by `leaveParty()`.
- The custom item catalogue is per character, so `loadActiveCharacterIntoLive()`
  rebuilds `state.db` from `DEFAULT_ITEMS` rather than merging.
- The roster is **never empty** — `ensureCharacter()` mints one on first run, and
  deleting the last hands back a new one.
- The home screen is a page in front of the app (`state.screen`, a fixed overlay
  under the modal backdrop). It carries **two** sections, campaigns above
  characters; `renderHomeScreen()` draws both and returns early unless showing.
- **You leave it by choosing something, not dismissing it** — no Back button;
  Escape still closes it. The one reader with nothing to click is a **GM**, whose
  character cards are not selectable; their way back is the campaign card, and
  `renderHomeScreen()`'s note says so.
- **A signed-in player starts there.** `handleAuthStateChange` opens it on any
  sign-in nothing was waiting on. `maybeOpenHomeAtBoot()` guesses from
  `dnd_inventory_last_signin` (this browser's flag) rather than painting the
  inventory and yanking it away.
- One modal serves three jobs — the sheet's gear, a card's Edit, New Character. A
  **null** `charModalTargetId` means the character on screen, not always one of
  yours.

### Multiclassing and Character Setup

A character's classes are **`classLevels`**: an ordered list of `{ name, level,
subclass }`, one entry per class. A Warlock 5 / Bard 2 is two entries; the
character is level 7. Model in `src/js/characters.js`; editor in
`src/js/character-setup.js`.

- **Three mirror fields** — `classes` (names), `level` (sum, capped 20),
  `subclass` (first one set) — written only by `normalizeCharacterMeta()`, like
  `strength` mirrors `abilities.str`. Every existing reader keeps working, and a
  party member on an older client renders a sensible line. Writing a bare `level`
  on a character who has classes does nothing.
- **`classEntriesOf(c)` is the one way to read a character's classes** — a
  normalized character hands its list back; anything older is folded on the way
  out.
- **The migration guesses only for a multiclass** — the old model had one level
  for every listed class, so the first class gets what is left after one level
  each for the rest (the *total* comes through exactly). A single class is
  migrated with no guessing.
- **The proficiency bonus is worked out from the total, not per class** — right
  by the rules, and why the sum must be a real field.

**The modal.** `charModalTargetId` names the slot to edit; a null target is the
character on screen.

- **The header has no Edit Character button and no STR readout** — the sheet owns
  the six ability scores, and the weight bar already says what Strength buys. The
  gear replaces the button for both cases (your own character, and a player's,
  since `isReadOnly()` is false for a GM).
- **The class rows are why this left the sheet** — a growing list does not belong
  across the top of a page. Species, background and alignment came with it.
- `charModalClasses` is a **working copy**, written to the character only on
  Save.
- **Rows are built once and written into, never rebuilt on a keystroke** — only a
  *removal* rebuilds the list.
- The total under the rows is derived. With **no** classes a plain Level box
  appears in its place — the only time `level` is written directly.
- Class, subclass, species and alignment are free text with a `<datalist>` hint,
  never a constraint (`ALIGNMENTS` offers the nine). Each row mints its own
  subclass list.

### The character sheet

Page one of the 2024 sheet, `src/js/character-sheet.js`. Reads and writes the
same `state.character`; owns no data.

- **What is typed and what is worked out.** Anything the rules derive
  unambiguously is derived and rendered as *text* (modifiers, proficiency bonus,
  skills, saves, passive Perception, initiative). What the rules cannot settle
  without knowing more (AC, speed, HP, hit dice) is an input.
  `.stat-tile.derived` is the visual half of that promise.
- **What a character *is* is not edited here** — classes, levels, subclasses,
  species, background, alignment are in the **Character Setup** modal behind the
  gear. XP stays a box (a number that changes at the table, like HP).
- **The identity block is the readout of all of it** (`renderSheetIdentity()`) —
  a row of facts under the name, each named above and answered below (Class,
  Species, Background, Alignment, Level). No box, no border. Each fact is only as
  wide as its content; it wraps whole facts, never a label from its value. Every
  fact is drawn whether set or not (em dash for a blank). A class's own level is
  printed **only in a multiclass**.
- **`abilities.str` is the character's Strength, and the grid's** — the `strength`
  mirror is written only by `normalizeCharacterMeta()` (with the old `strength`
  as the fallback for `str`). Editing Strength here resizes the grid through
  `commitSheetEdit()` — see *the deferred resize* under Grid geometry.
- **This is the only place a score is typed.** The six scores all start at 10.
  `readCharModalFields()` returns **no `abilities` key** — callers merge it over
  the character, so omitting it carries existing scores through, and on New
  Character `normalizeAbilities()` fills all six with 10.
- **Scores run 0–30** (`clampScore`). Zero is a real score. `updateWeightDisplay()`
  floors its divisor at 1 for that case (at Strength 0 every ratio would be `0/0`,
  which the browser drops, freezing the weight bar).
- Skill proficiency is **three-state** (none / proficient / expertise); saves are
  two.
- **One group per ability, not three lists** (`abilityGroup()`) — the modifier
  large with the score beside it, the bolded saving throw under, then the skills
  that read off that ability (`skillsOfAbility`, grouping on the same `ability`
  field `skillModOf` derives from). Retires the per-row `DEX` tag.
- `.ability-groups` is **two columns and never three** — `minmax(max(196px,
  46%), 1fr)`: the 46% ceiling blocks a third track, the 196px floor drops to
  one column when squeezed.
- Where sections sit is settled by the split tree — see *The sheet's layout*.
- The unique boxes are static markup in `index.html`. The six ability groups are
  **built once** from `ABILITIES` and `SKILLS`, then only written into —
  **an input never loses focus mid-keystroke**, and it skips
  `document.activeElement` because the sheet re-renders on every party roster
  update.
- One delegated listener per event, not one per box (~80 of them).
- Read-only when `isReadOnly()`.
- **Not yet built:** the attacks table, the rest of page two (spells, alignment,
  attunement). Equipment and coins are deliberately absent — the inventory and
  purse own them.

### The sheet's layout

Each section is a **widget**; where the widgets sit is a **tree of splits**
(`src/js/sheet-layout.js`). Drag a section by its title, drop on an edge, that
edge splits. A widget has no width of its own — it fills its slot, and the drop
chooses which slot, so a section's extent is set by the depth it was dropped at.

```
col[ Proficiencies, row[ Abilities, col[ Combat, HP ] ] ]
```

- A node is `{ t:'w', id, size }` or `{ t:'s', dir:'row'|'col', size, kids[] }`.
  `size` is the node's share of its parent, and lives **on the node** so it
  travels with a moved section.
- **Horizontal splits share space; vertical ones stack at their natural
  height** — the sheet is a scrolling page of paper, which has a width but not a
  height. A row divides its width and gets a **draggable seam** between each
  pair; a column has no seam.
- The JS writes **only** `--share` on a node's element; `sheet-layout.css` spends
  it per the *parent's* direction, so a row folds into a column with nothing to
  rewrite.
- `normalizeSheetLayout()` runs after every edit (a split with one child, a row
  nested in a row, an emptied container). It **mutates and preserves node
  identity** — a drop holds a reference to the node it landed on.
- A drop removes the section **first**, normalizes, then inserts.
- Joining a split that already runs the right way takes **half the target's
  share**; the other children do not shuffle.
- **The identity block is pinned above all of it and is not in the tree** — it
  lives **outside `#sheet-layout`** in `index.html`, every hit test is scoped to
  the tree, and `sanitizeSheetLayout()` drops an `identity` node left in an old
  stored layout.
- **Folding.** A row too narrow for every child to get `SHEET_MIN_COL` stacks
  (`foldNarrowRows`, driven by a `ResizeObserver`), applied outermost-in
  (document order). Hysteresis (`SHEET_FOLD_SLACK`) is **not a nicety** — folding
  makes the sheet taller, a taller sheet brings in the scrollbar, and the
  scrollbar takes back the width that was measured. `scrollbar-gutter: stable`
  removes most of it.
- **The layout is this browser's furniture** (`dnd_inventory_sheet_layout`), not
  in the save file, never synced — a GM paging through the party keeps their own
  arrangement, and a **read-only sheet is still rearrangeable**.
- The sections are written once as static markup in `#sheet-widget-store`; the
  renderer **moves** them into the tree, so every id, value and listener
  survives. `renderSheetLayout()` runs when the sheet is first built and after a
  drop or reset, **not** from `renderCharacterSheet()`.
- `SHEET_WIDGET_IDS` is read from the markup, not written out in JS.
  `sanitizeSheetLayout()` drops unknown ids and appends missing ones.
- Dragging uses pointer events and bounding-rect hit tests (not the HTML5 DnD
  API), the edge picked by **fraction** of each dimension. The rim band is tested
  first; everywhere else resolves to the nearest section. A drop onto the
  section's own slot is refused but labelled ("Back where it started").
- `#character-sheet` is in `DRAG_SCROLLERS`.
- `resetSheetLayout()` **has no caller** — the Reset Layout button was taken off
  the sheet (it is furniture, not part of a character) and is waiting to be wired
  up somewhere better (Settings). Kept because an arrangement is otherwise only
  recoverable by clearing browser storage.

### Class features

Reads `state.character.classes` (names, as typed) and `level`. Two halves in
`src/js/class-features.js`: the **registry** and the section that draws it.

**The class data is `data/classes.json`**, read at load with a blocking
`XMLHttpRequest` like `data/items.csv` — content, not code, and already the shape
a user-authored class will take.

```
{ id, name, source?, features: [{ id, name, level, description, unlocks? }],
  subclasses?: [{ id, name, source?, features: [ …same… ] }] }
```

**The registry is the seam custom classes come through** — nothing outside
`class-features.js` may reach into `DEFAULT_CLASSES`; everything goes through
`allClasses()` and `findClassByName()`. `sanitizeClassList()` drops a malformed
class or feature and leaves an unreadable file as an empty registry.

- A feature's `id` is stable and never derived from position. Order within a
  level is the order written.
- **Classes are matched by name, not id** — a class entry's `name` is free text.
  A name that matches nothing is a class the app has not been taught yet, and the
  section says so by name. Ids are accepted too.
- **Every class is read at its own level** (`characterClassLevel()`) — a Warlock
  5 / Bard 2 sees the Warlock list to 5 and the Bard list to 2. The *total* level
  still drives the proficiency bonus and species traits.
- `classFeaturesFor()` returns the **complete** list sorted by level → class →
  written order, each row with an `owned` flag. The level gate decides `owned`;
  the section decides what to draw (so the show/hide toggle is a filter over one
  list, not two code paths).
- The class name is tagged on a card only when there is more than one class
  (`showClass`).
- **Subclasses nest under the class** (`subclasses[]`, `sanitizeSubclassList()`).
  Each class entry carries its own free-text `subclass`, matched by
  `findSubclassByName(classDef, name)`; a match folds those features into the
  same list (gated by that class's level, sorted after base features at a shared
  level, tagged with the subclass name). The Subclass **field** is a Character
  Setup row, shown only once that class's level has unlocked it
  (`classUnlockKeys()`), each row minting its own `<datalist>` via
  `fillDatalist()`.
- **`source`** is a short book label ("PHB"), separately on a class and each
  subclass. `classSourceSummary()` renders known ones as a `.feature-sources`
  caption; `cleanSource()` trims and caps it.
- Descriptions are terse summaries written for this app — do not paste rulebook
  text.
- **A description is Markdown**, rendered through the same `renderMarkdownInto()`
  the written sections use — so the class and species files are a second consumer
  of the sanitizer. `.feature-desc` is a `<div>`, never a `<p>`.
- **`description` may be an array** (`normalizeDescription()`, shared with
  species-traits.js) — JSON has no multi-line string.
  - An entry is a **block**, separated by a *blank* line.
  - **Except a list item, which joins to the line above** — `collectListItems()`
    stops at a blank line. The test is `MD_LIST_RE`, **borrowed from
    markdown.js**, which is why markdown.js now loads before class-features.js
    (the JSON is parsed at load time).
  - **A nested array is one block with its lines kept together** — a hand-written
    `<table>`, or a stanza wanting hard breaks.

**Unlocks — parts of the app that arrive with a feature.** A feature may name
parts (`"unlocks": ["subclass"]`); markup marks them `data-unlocked-by="subclass"`
and they stay hidden until an *owned* feature names them. The only key in use is
the Subclass field.

- The key is a plain string shared between JSON and markup — never a selector or
  element id, so the data never has to know how the sheet is built.
- **The subclass key is asked per class** (`classUnlockKeys(classDef, subclass,
  level)`) — a Warlock 5 / Bard 2 has a patron and no Bard college.
- **A class the app does not know shows the field** — `classUnlockKeys()` returns
  `null`, not an empty set, and the caller must show. Hiding a box for a
  Bloodhunter would be an invention.
- `applyFeatureUnlocks()` / `featureUnlocksAreAuthoritative()` are the same
  question asked of the *character*, unioned with the species' keys. It has no
  targets today (a species **Lineage** field will arrive through it). Runs from
  `renderClassFeatures()`, toggling `.hidden` without touching a value.

**The section.** `renderClassFeatures()` is called from `renderCharacterSheet()`.

- **One card per row, always the section's full width** — a list read top to
  bottom is what the section is for.
- The **level badge rides the card's top-left corner**, a third of it hanging
  outside — so **no ancestor may clip it** (nothing in `class-features.css` uses
  `overflow: hidden`). The ring in the badge's `box-shadow` is the card's own
  background.
- Locked features are drawn as a plan — dashed edge, no fill, hollow badge.
- The show/hide toggle **hides itself when nothing is locked**. State is
  session-only.
- The toggle sits inside `.widget-title` (also the drag handle), so
  `sheet-layout.js` ignores a pointerdown on a `button`/`a`/field.

**Folding a card shut.** Clicking a card collapses it to its name. Session-only
(`collapsedFeatures` Set in memory), never saved or synced.

- **The name is a real `<button>` inside the heading** — the standard disclosure
  pattern; Tab reaches it, Enter/Space work on it, no keydown handler here.
  `.feature-name-btn` styles it back to bare text.
- One delegated listener **per section**, not per card — the sections are rebuilt
  on every render while the containers are static markup. Wired from
  `class-features.js` because `featureCard()` is (species traits fold too).
- The button's click reaches that listener **by bubbling**.
- The key is `scope:id` (`class:rage`, `species:dwarf-darkvision`), not the bare
  id — class ids are bare words, species ids prefixed, so the two files could
  collide.
- The toggle flips classes and `aria-expanded` and **does not re-render the
  section** — the Set is read at build time, so state survives a render driven by
  anything else.
- A click that ends a drag-select does not fold.
- **No caret or chevron** — the hover lift (`border-color: var(--accent)`) is the
  affordance, same as `.folder-header`.

### Species traits

Reads `state.character.race` and `level`. Deliberately the same shape as
`class-features.js`, in `src/js/species-traits.js` — same registry shape, card,
toggle. Read the Class features section first; only the differences follow.

- **The data is `data/species.json`**, read the same blocking way.
  `{ id, name, traits: [{ id, name, level?, description, unlocks? }] }`.
- **`level` is optional here** and defaults to 1 — almost every species trait is
  level 1; the handful that scale say so.
- **One species, not a list** — no per-card species tag, no sort by species.
- **The level badge is drawn only when the levels differ**, judged on the rows
  actually drawn — a column of identical `1`s is noise. `featureCard(row, {
  badge })` and `.feature-card.no-badge`.
- The cards and CSS are **shared, not copied** — `featureCard()` / `featureNote()`
  live in `class-features.js`. This is why **`species-traits.js` must load after
  `class-features.js`** (it calls `normalizeUnlocks()` while parsing the JSON).

**Unlocks are a union.** `applyFeatureUnlocks()` in `class-features.js` owns the
mechanism and gathers both sets; `speciesUnlockKeys()` /
`speciesUnlocksAreAuthoritative()` are the species half.

- The authoritative test is an **AND** — if either half of what the character is
  cannot be reasoned about, a hidden box might be one they should have. A
  Fighter/Warforged keeps their Subclass field.
- A **blank** species is authoritative (grants and hides nothing). Only a *typed
  and unknown* one disables the mechanism.
- No species uses `unlocks` today — a Lineage field is the obvious next one.

### The written sections

Backstory & Personality and Appearance: `src/js/sheet-prose.js` (the sections),
`src/js/markdown.js` (the formatting).

- **Neither section owns data** — two `data-sheet` string fields on
  `state.character` (`backstory`, `appearance`), written/saved/synced by the same
  machinery as every other box. `data-prose` on the wrapper *is* the `data-sheet`
  path.
- **The mode is not a setting** — session-only. It is a guess: a section with
  writing opens formatted, an empty one opens in the editor. The toggle replaces
  the guess with your choice until the sheet changes character
  (`proseCharacterId`).
- **The preview is only rendered when it is on screen** — every keystroke
  re-renders the sheet.
- Read-only does not gate the swap; the textarea is disabled by
  `renderCharacterSheet()`.
- The toggle is at the top left of the widget *body*, not the title (the title is
  the drag handle).

**Markdown, and the sanitizer that is not optional.** `markdown.js` is the only
place in the app that turns a string into markup.

> A character sheet is not private. Party sync copies it to Firebase, and every
> other member renders it in their own browser. Unsanitized, a `<script>` or an
> `onerror=` in a player's backstory would run on the GM's machine, against the
> GM's signed-in Firebase session.

- **Formatting is allowed, behaviour is not.** Raw HTML passes through on
  purpose; `MD_ALLOWED_TAGS` / `MD_ALLOWED_ATTRS` decide what survives. `<b>`,
  `<span style>`, a hand-written `<table>` work; `<script>`, `<iframe>`, `on*=`,
  `javascript:` do not.
- An unknown tag is **unwrapped** — its text is the player's writing.
  `MD_DROP_WHOLE` is the short list that goes with its contents instead.
- Parsing happens in a detached `<template>` (no browsing context).
- URLs are checked after control chars, spaces and entities are stripped
  (`stripInvisible`) — `java&#9;script:` is a URL a browser will run. `style` is
  refused whole if it contains `url(`, `@import` etc.
- `on*` attributes are dropped **before** the allowlist is consulted.
- **Every block branch must consume a line** — the tests that end a paragraph are
  looser than the ones that open a block, so a line like ```` ```js extra ````
  can fall through all of them; not advancing `i` is an infinite loop on text a
  player may type.
- A single newline is a **line break**, not a space.
- Pipe tables are **not** parsed — a hand-written `<table>` is the escape hatch,
  styled by `sheet-prose.css`.

### Character tabs

The strip above the inventory (`character-tabs.js`) holds one tab per character
(your own, plus every party member). Clicking one opens a two-item menu.

- **Which** character is shown is `state.party.viewingPlayerId` (shared with the
  Party panel); **which view** is `state.view`. Neither is saved.
- `syncCharacterViewUI()` is the single entry point for "who or what we're
  looking at changed". `updatePartyPanel()` calls it.
- The sheet/inventory swap is one class, `sheet-view` on `#inventory-panel`.
- A GM has no own-tab and no active tab until they pick a player.
- One key per half of the selection: **Tab** flips the shown character between
  its two views, **Shift+Tab** walks to the next tab, **1–9** jump by position.
  Suppressed while typing, while any modal is open, and unless `state.mode ===
  'idle'` (`characterShortcutsAllowed`).

### Coins

Coins are ordinary stackable items — the coin purse is a readout over
`state.instances`, so coins weigh what they weigh and `removeCoinsFromInventory`
pulls them off the grid as well as the stash.

**A default item's id is its row number in `data/items.csv`**, so it changes the
moment a row is inserted above it — never write one into the code. The coins are
found by identity in `getCoinTemplates()`: the `currency`-tagged item whose cost
is exactly one of its own denomination. Keeping the tag and the `1cp` / `1sp` / …
costs on those CSV rows is what keeps the purse wired up.

### Interaction state machine

```
IDLE
  click sidebar card  → PLACING (ghost follows cursor, snaps to grid)
  pointerdown on item → DRAGGING (item removed from grid, ghost appears)
  pointerdown on stash card → DRAGGING (origRow/origCol null)

PLACING
  mousemove  → initGhostEl + moveGhost + highlightCells
  R key      → increment rotation, rebuild ghost in place
  click grid → finalizePlacement (stays in PLACING for rapid multi-drop)
  right-click / Escape → cancelPlacing → IDLE

DRAGGING
  pointermove → moveGhost + highlightCells
  R key       → rotateAnchorCW, increment rotation, rebuild ghost
  pointerup   → place at new position / equip slot, or restore → IDLE
  Escape      → restore original position/rotation → IDLE
```

`cursorToGridPos` returns `null` when the cursor is outside `#grid-scroll`,
gating all grid snapping.

### Edge auto-scroll

A drag holds the pointer button down, so `src/js/drag-scroll.js` pulls a
container along while the cursor rests near its edge — for held drags (a browse
card, a placed item) but **not** placing mode (a free cursor left near an edge
would scroll forever).

- Three calls per drag: `startDragAutoScroll` (drag becomes real),
  `updateDragAutoScroll` (each pointermove), `stopDragAutoScroll` (release *and*
  Escape). The rAF loop runs for the whole drag — velocity is simply zero away
  from an edge.
- **A frame that scrolls re-runs the drag's own pointermove logic** (`dragMoveAt`
  / `dragRefresh`, the move handler with a synthetic `{clientX, clientY}`) — the
  cursor has not moved but the content under it has.
- `DRAG_SCROLLERS` is an explicit list (bounding-rect, like the equip cards and
  folder headers — the ghost is under the cursor and `elementFromPoint` would
  keep finding it).
- **The band reaches past a container's top and bottom, never its left and
  right** — above/below is the panel's own header or footer; the panels sit side
  by side, so a horizontal band would scroll a neighbour.
- Past the edge the pull continues but the drop hit-tests
  (`getFolderDropAtPoint`, `cursorToGridPos`) return null — overshooting is how
  you *reach* a target, not how you drop on one.
- `renderItemList` restores `#item-list`'s `scrollTop` — filing an item is the
  one render that happens mid-gesture.

### Persistence

`saveState` / `loadState` use `localStorage` key `dnd_inventory_v1`. Only custom
items (not in `DEFAULT_ITEMS`) are saved; default items are re-hydrated from
`data/items.csv` on init. Placed instances are saved in full and re-placed via
`rebuildGrid` on load.

The payload is **version 3**: `{ version, activeCharacterId, characters,
campaigns }`. Version 2 was the same without `campaigns` (reads as an account
that has not joined one — no migration). Version 1 was a single character at the
top level, still what an older browser or cloud save holds;
`normalizeSavePayload()` in `characters.js` folds a v1 save into a one-character
roster — the only place that knows there were two shapes. The key is unchanged
(`dnd_inventory_v1`) — it names the storage slot, not the payload version.

`class-features.js` reads `data/classes.json` and `species-traits.js` reads
`data/species.json` the same blocking way; both are skipped silently if missing.

`items.js` reads `data/items.csv` with a **synchronous** `XMLHttpRequest` so
`DEFAULT_ITEMS` is populated before `init()` runs — which is why the app needs an
HTTP server rather than `file://`, and why the CSV path is relative to the
project root.

### Browse-list folders

User-made groups for the Browse tab, in `src/js/folders.js`. They describe the
*catalogue*, not the character — own `localStorage` key
(`dnd_inventory_folders`), not in the save file, never synced.

- A folder never owns items: `state.folderAssign` maps templateId → folderId.
  Deleting a folder only drops assignments (`deleteFolder`); items fall back to
  their default folder, or to **Unfiled** (a virtual group rendered last, never
  stored).
- Every item is filed by default. `DEFAULT_FOLDERS` (Weapons / Armor / Currency /
  Gear, the last matching everything) is seeded once per browser, tracked by the
  `seeded` flag. Ordinary folders afterwards.
- `folderAssign` holds only *overrides*. An item with no entry follows
  `defaultFolderIdFor()` (tags, then id, then a name match so a renamed default
  keeps working); the `UNFILED_ID` sentinel means a deliberate "no folder". Read
  the resolved folder with `folderOf()`, the override with `explicitFolderOf()`.
  `setItemFolder(id, null)` hands an item back to auto.
- **Restore Defaults** (`restoreDefaultFolders`) empties `folderAssign` whole,
  re-creating any missing default folder first (or `defaultFolderIdFor` has no
  answer). Folders the user made are left standing.
- With no folders at all, `renderItemList` renders the flat list.
- **A whole folder is a drop target, not just its header.** `buildItemCard`'s
  drag checks `folderDropTargetFor` *before* the grid. The list is a flat run of
  headers and cards, so a folder is the *band* from its header to the next;
  `getFolderDropAtPoint` walks the children in order, so the gaps between cards
  are part of the band. The space past the last card belongs to no folder.
  - `showFolderDropFeedback()` in `drag-ghost.js` is the whole of the drag's
    feedback in one call — band, chip, and the answer the drop will act on. It
    returns `hovering`, true over any folder band including the item's own.
  - The band highlights whole (header + cards).
  - **The band is the area, the chip is the answer** — `#folder-drop-hint` rides
    the cursor naming the folder ("Move to Weapons") because a folder is often
    taller than the list. It flips sides at the viewport edge.
  - The card left behind is faded (`.item-card.dragging`); the ghost is hidden
    over the list.
  - **A drop back into the item's own folder is not a target** — order inside a
    folder is the sort's business. That folder still answers (outlined dashed,
    `.drop-current`, under "Already in Currency") — refusing silently is the one
    thing it must not do.
- A non-empty search expands every folder and freezes the headers and the
  Collapse/Expand All button (`updateFolderToolbar`, driven by the *stored*
  state, which clearing the search restores).

### Browse-list sorting

`src/js/item-sort.js`. Own `localStorage` key (`dnd_inventory_sort`), not saved
or synced.

- **Every mode is a chain of keys** — sorting purely by weight would scatter each
  weight's rarities. Default is rarity → name → weight.
- Each key has one fixed direction; the toolbar's arrow toggle
  (`state.itemSortReverse`) negates the **whole chain**. A stored bare id is the
  pre-direction shape and still reads. `dir` on each mode names its two
  directions in that mode's own words ("Worst first", "Z to A").
- The reverse turns each folder's contents over; the **folders keep their own
  order**.
- `ITEM_SORTS` is the whole model; `sortItems()` is the only caller
  `renderItemList` needs.
- Sorting happens **before** `groupItemsByFolder`.
- The weight a mode sorts on is the figure the card *prints* (`itemSortWeight`).

### Theming

Two palettes as CSS custom properties in `tokens.css`: `:root` holds the light
(aged parchment) tokens, `:root[data-theme="dark"]` the dark (candlelit) ones.
**Every colour is a token — never write a literal colour in a rule** (except the
hue wheel in `appearance.css`, which is the spectrum itself).

- `<html data-theme>` is always `light` or `dark`. The inline script in
  `index.html` `<head>` sets it before first paint; `theme.js` owns it after.
  That script also applies the **custom accent** before first paint.
- The theme picker lives on the **Appearance page** (Settings → Appearance),
  beside the colour wheel.
- `--accent` / `--accent-soft` / `--on-accent`, and the whole panel family
  (`--panel` / `--surface` / `--field` / `--border` / `--border2` / `--desk` /
  `--bg`), can be **overridden per browser** by a user colour, set as inline
  properties on `<html>`. `ACCENT_MANAGED` in `appearance.js` is the full list,
  built from the roles.
- `--text` / `--text-dim` deliberately **do not** follow a custom panel colour —
  each theme pins its surfaces' lightness, so the ink still reads.
- The stored *preference* (`dnd_inventory_theme`) is `light`, `dark`, or
  `system`. `system` is re-resolved live from `prefers-color-scheme`.
- **Not** part of `dnd_inventory_v1` — the theme belongs to the browser and must
  be readable before app state loads.
- **The paper.** `img/paper-antique-seamless.jpg` (1919 × 1362, seamless) is a
  torn sheet drawn by `.paper-sheet::before` — one rule, two users: `#grid-paper`
  (wraps the inventory grid) and `.sheet-scroll` (the sheet's body). Both are
  **content**-sized (`inset: -0.5in`), so the paper hugs what is drawn on it.
  `#grid-scroll` and `#character-sheet` are **transparent** — give either a
  background and it covers the paper.
  - `#grid-paper` exists only to carry the sheet — `#inventory-grid` is `overflow:
    hidden` for its cells, which would clip the paper. A plain wrapper (the JS
    only looks the grid up by id).
  - The wrapper's `margin` (62px) must exceed the paper's overhang plus half the
    displacement scale, or the ancestor's overflow trims the ragged edge straight.
    `#character-sheet` carries the same figure as side padding.
  - Only the tile **width** is set; height is `auto`. Never give it a second
    length.
  - Faded by `--paper-veil`, a wash of `--bg` laid *over* the image. **Raise**
    the percentage to turn the texture down. Per theme (26% parchment, 79%
    candlelit — the texture is cream paper).
  - **The torn edge** is the `#paper-fray` SVG filter in `index.html`
    (feTurbulence + feDisplacementMap). A *filter*, not a mask, so the fray stays
    the same size whatever shape the panel is. Applied only to the paper layer,
    **never to an element with content**.
  - Three numbers stay in step: `scale` (34, how deep the tear bites); the
    layer's `inset` (20px, must clear **half** of it); the filter's own region
    (±6%, must exceed both).
  - `--desk` is what shows around the tear (a frayed edge is only an edge if
    something different is behind it). `--paper-edge` is the burn around the rim,
    ragged for free.
  - `pointer-events: none` on the layer; `isolation: isolate` on each
    `.paper-sheet` so its `z-index: -1` paper sits below that sheet's content,
    not behind the whole app.
  - `#svg-defs` is `position: absolute`, not `display: none` — a hidden subtree
    cannot be referenced by `filter: url(#…)`, but an inline 0×0 SVG still opens a
    line box.
- Rarity and coin colours differ per theme; JS reads them from CSS via
  `rarityColor()` / `coinColor()` in `helpers.js` (cached). `applyTheme()` clears
  the cache and re-renders. **If you add a render path that inlines a palette
  colour, re-run it from `rerenderThemedContent()`.**

### The accent colour

`src/js/appearance.js`. Light/dark is the palette; this is the *colour* — the one
hue everything gold is drawn in.

**What the user picks is a hue and a saturation. Never a lightness.** Each theme
knows how light its accent must be to sit on its own background (dark brown on
parchment L 33%, light gold on candlelit L 56%), so a pick supplies the colour
and the theme supplies the contrast. The wheel has no lightness slider.

```
picked hsl(0, 66%)  ->  light theme  hsl(0, 66%, 33%)   a deep brick
                    ->  dark  theme  hsl(0, 66%, 56%)   a warm coral
```

- Three roles. `primary` drives `--accent`; `secondary` drives `--accent-soft`
  (the gold rules and gradients); `surface` drives the whole panel family. Until
  the secondary is set on its own it **follows the primary**, eight points
  calmer. The panels follow nothing and nothing follows them.
- **A role can drive a family** — `surface` is one hue at six lightnesses:

  ```
  --panel    L 91   the panels themselves, the lightest step
  --surface  L 86
  --field    L 78   recessed wells: inputs, equip slots, shape-editor cells
  --border   L 63
  --border2  L 50
  --desk     L 48   under the torn paper, darkest of the ladder
  ```

  (Light-theme figures; the dark palette has its own, 12 down to 4.)
  `--paper-veil` is a `color-mix` over `--field`.
- **The inventory grid is deliberately not in the family** — its cells and carry
  zones keep the palette's own colours whatever the panels are tinted to.
- **`--bg` is not on that ladder** — it takes the panel's *hue* only, at a fixed
  `oklch(L 0.04 H)`, so the app always sits on a deep near-neutral ground. `oklch`
  rather than `hsl` because perceptual lightness is what "this dark" has to mean
  when the hue can be anything. The hue comes from the **resolved panel colour**
  via `oklchHueOf()`.
- **`--field` exists because `--bg` used to do two jobs** (the ground *and* every
  recessed well) — at L 0.25 the light theme's inputs would be near-black. `--bg`
  now paints only `body` and `#home-screen`.
- **`--on-bg`** is the ink for anything drawn straight onto the ground — always
  `--paper` (the ground is locked dark in both palettes). Never use `--text`
  there.
- **The ground's lightness is per palette** — 0.32 on parchment, 0.25 by
  candlelight — the one figure to touch if the ground wants nudging. It lives in
  `tokens.css` and `ACCENT_ROLES.surface` in `appearance.js`, which must agree.
  They differ because the ground must clear its own panels: the dark palette's
  panels sit at OKLCH 0.247, so 0.25 puts `--panel` against `--bg` at a contrast
  ratio of **1.00** — **deliberate and signed off**, one continuous dark surface
  held by a 1px border. The first token is the role's reference.
- Pinned lightness stops a strong pick going garish — `hsl(210, 100%, 91%)` is a
  pale blue tint, not a blue.
- `--on-accent` is derived — whichever of `--ink` / `--paper` has the better
  **WCAG contrast ratio** against the resolved accent (not HSL lightness).
- `--ink` and `--paper` are declared once in `tokens.css` **outside both
  `[data-theme]` blocks** — they are what `--on-accent` is chosen between, and
  each theme picks one. `appearance.js` reads them.
- **Both themes are resolved at pick time, not at paint time** — the stored
  `vars` is a finished per-theme map of CSS properties, so switching theme is
  reading strings, never colour maths (which is what keeps the no-flash script
  four lines). `sanitizeAccentPrefs()` recomputes `vars` on load.
- **Nothing re-renders** — the accent is read straight from `var(--accent)` by
  ~150 rules and nothing in JS, so setting the property on `<html>` is the whole
  operation. Only the pointer *release* writes to storage.
- A reset **removes** the property (`ACCENT_MANAGED`), handing the palette back
  to `tokens.css` rather than pinning a stale override.
- Stored per browser (`dnd_inventory_colors`), not in the save file, never
  synced.
- The wheel is hue around, saturation outward, from two CSS gradients — **the
  only literal colours in the app, and they belong there**. The gradient is
  rebuilt at the lightness the role will get, **clamped to a legible band**
  (`WHEEL_FACE_MIN`/`MAX`).
- The wheel panel is **moved under whichever row was clicked** rather than
  floating.
- **`appearance.js` loads after `theme.js`, so it wires its own button** —
  theme.js's listeners run at *load* time and `openAppearanceModal` is not
  defined yet. Runtime calls (`applyAccentVars()`, `updateAppearanceUI()`,
  `initAppearance()`) are fine.

### Icons

`img/icon/*.png` are black silhouettes on transparency (Flaticon — attributions
in `icons.html`). Drawn as CSS **masks** over `currentColor`, never as `<img>`
(which would be black in both themes). As a mask each icon takes the colour of
whatever it sits in.

- One class per file in `icons.css`, `.ico-<name>`, alongside the `.ico`
  primitive. Sized in `em`.
- Deliberately `.ico`, not `.icon` (`.icon-only` already means "a button with no
  label").
- From JS: `iconEl(name)` / `setIconLabel(el, name, text)` in `helpers.js`.
- Add a `-webkit-mask-*` beside every `mask-*`.

### Versioning

The version is a one-line `VERSION` file at the project root — not in the source,
so a release bump never means editing code. `loadAppVersion()` in `main.js`
fetches it into `APP_VERSION` and the Settings footer.

- **Async**, unlike `items.csv` and `.env` (which block because `init()` needs
  them) — nothing waits on the version.
- A missing file leaves the footer blank; the same `startsWith('<')` guard as
  `firebase-config.js` applies (a host answering unknown paths with its index
  page).
- Pages serves everything `must-revalidate`.

### Accounts and cloud save

The inventory is usable signed out, on `localStorage`. An account only unlocks
**party play** and **cloud save**.

- Every gated entry point goes through `requireAuth(reason, action)` in
  `auth.js` — runs `action` immediately when signed in, else opens the login
  modal and runs it on success. **Do not gate the inventory itself.**
- Firebase restores a session asynchronously, hence `state.auth.ready` — before
  it flips, "no user" means "not known yet".
- `cloud-save.js` stores the entire save as **one JSON string** at
  `users/<uid>/save` — not a tree, because RTDB drops nulls and empty objects
  and the save file is full of both, so a tree write would silently fail to
  replicate a deletion. Party sync still writes a tree (read field by field).
- `buildSavePayload()` / `applySavePayload()` in `persistence.js` are the single
  shape shared by the local and cloud copies.
- Writes are suppressed while `state.party.viewingPlayerId !== null` (`state` is
  then someone else's character). Incoming saves are held while `state.mode !==
  'idle'` and retried.
- Our own writes echo back through the `on('value')` listener; `cloudClientId`
  tags each write so they can be ignored. Conflicts are last-writer-wins, except
  the first sign-in with real data on both sides (`openCloudConflictModal`).
- The Firebase console needs Email/Password and Google enabled, the host in
  Authorized domains, and the rules from `database.rules.example.json`.

### Configuration

`firebase-config.js` reads the Firebase settings from the project root with a
synchronous XHR and parses them into `FIREBASE_CONFIG`. Both paths are relative
to the **document**.

- Two sources, same `KEY=value` text, first hit wins: `.env` locally,
  `/firebase-env` on a deploy. The deploy needs its own source because `.env` is
  gitignored and **Cloudflare Pages will not serve any dot-prefixed path**.
  `functions/firebase-env.js` is a Pages Function reading the `FIREBASE_*`
  variables from the Pages dashboard. `.env.example` is the committed template —
  keep it and the `KEYS` list in the Function in sync when adding a key.
- Which is tried first depends on `location.hostname`, only to avoid a certain
  miss. Both are always tried.
- A missing file does **not** reliably 404 — Pages answers unknown paths with its
  index page (HTTP 200, a pageful of HTML). `readEnvFile` rejects a body starting
  with `<`; a file with no `FIREBASE_DATABASE_URL` is skipped rather than fatal.
- When `.env` is absent or has no `FIREBASE_DATABASE_URL`, `FIREBASE_CONFIG` is
  `null` and `initFirebase()` returns early — **the app must stay fully usable
  offline**. Preserve that guard when touching party code.
- The party buttons explain themselves through `partyUnavailableMessage()`, which
  separates the three look-alike causes (no `.env` — usually `file://`; no SDK;
  `initializeApp` throwing).
- `.env` is served to the browser and readable at `/.env` — it holds Firebase web
  config, public by design. Never move real secrets into it.
