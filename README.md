# TTRPG Inventory Manager

A browser-based inventory manager for tabletop RPGs (D&D 5e and similar systems). Items have physical shapes that occupy cells in a grid, inspired by games like Resident Evil and Escape from Tarkov.

## Features

- **Grid-based inventory** — items occupy 2D shapes on a tetris-style grid
- **Drag and drop** — drag items within the grid or directly onto equipment slots
- **Equipment panel** — configurable slots for armor, weapons, wondrous items, and anything you add
- **Item editor** — create custom items with shapes, images, damage, rarity, tags, and more
- **Stackable items** — arrows, potions, and other small items stack within a single cell
- **Encumbrance tracking** — weight bar with STR-based carry zones (normal / encumbered / heavily encumbered)
- **Auto-save** — inventory state persists automatically between browser sessions
- **Light & dark themes** — parchment or candlelight, switchable from the ⚙ settings button
- **Party play** — share a session code with your GM or players via Firebase Realtime Database
- **Configure Slots** — fully customizable equipment panel with custom sections, reordering, and per-slot options

## Running

No build step required. Serve the project root over HTTP:

```bash
python3 -m http.server 8787
```

Then open [http://localhost:8787](http://localhost:8787).

> Opening `index.html` directly as a `file://` URL works but is not recommended.

## Project Layout

```
index.html              Static shell — all DOM elements with stable IDs
.env                    Firebase credentials (gitignored, optional)
.env.example            Template for .env
src/
  css/style.css         All styles; CSS custom properties drive the theme
  js/                   Application logic, one file per concern (see below)
data/
  items.csv             Default item database (loaded at startup)
  generic_items.csv     Reference data, not loaded
  items_old.csv         Reference data, not loaded
tools/
  shape-editor.html     Standalone helper for drawing item shapes
```

### `src/js/`

Plain `<script>` files sharing globals — no bundler, no modules. `index.html` loads them
in dependency order; **that order matters** and is documented in the script block there.

| File | Purpose |
|------|---------|
| `items.js` | Parses `data/items.csv` into `DEFAULT_ITEMS` |
| `constants.js` | Tunables, rarity metadata, equipment slot definitions |
| `state.js` | The single mutable `state` object + convenience accessors |
| `shapes.js` | Shape math: rotation, cell coords, bounding boxes |
| `grid.js` | Grid occupancy: fit tests, place/remove, id generation |
| `render-grid.js` | Draws grid cells and placed-item elements |
| `render-sidebar.js` | Sidebar item list + details panel |
| `render-stats.js` | Header weight / encumbrance readout |
| `drag-ghost.js` | Floating ghost element shared by placing and dragging |
| `interaction-placing.js` | PLACING mode — ghost follows cursor, click to drop |
| `interaction-drag.js` | DRAGGING mode for placed items, plus R-key rotation |
| `interaction-context.js` | Item clicks and the right-click context menu |
| `modals.js` | Tabs, filters, character / item-editor / stack modals |
| `helpers.js` | Shared formatting and lookup helpers |
| `persistence.js` | `localStorage` save/load and CSV export |
| `theme.js` | Light/dark switching and the settings modal |
| `firebase-config.js` | Reads Firebase credentials from `.env` into `FIREBASE_CONFIG` |
| `party.js` | Party sync over Firebase + party UI |
| `equipment.js` | Equipment slots, layout editor, equip/unequip |
| `tooltip.js` | Hover tooltip for items |
| `main.js` | Entry point — boots the app |

## Item Database

Edit `data/items.csv` to add, remove, or modify the default items available in every
session. One row per item; `id` is assigned automatically from the row number.

| Column | Notes |
|--------|-------|
| `name` | Required — rows without a name are skipped |
| `rarity` | `common` \| `uncommon` \| `rare` \| `very_rare` \| `legendary` \| `artifact` \| `special` |
| `description` | Free text |
| `cost` | `15 gp`, `2 sp 4 cp`, … (a bare number is read as gp) |
| `tags` | Pipe-separated — `weapon\|melee\|finesse` |
| `damage`, `damageType`, `mastery` | Optional weapon fields |
| `attunement`, `stackable`, `container` | `true` / `false` |
| `weightEach` | For stackables; `maxStack = 1 / weightEach` |
| `shape` | Rows pipe-separated, each row 0/1 digits — `11\|01\|10`. Weight = number of `1`s |
| `containerRows`, `containerCols` | Interior grid size for containers |
| `properties` | Semicolon-separated — `finesse;light;thrown` |
| `image` | Path to artwork, relative to the project root |

`tools/shape-editor.html` draws a shape visually and prints the `shape` string to paste in.

Custom items created in-app are saved to `localStorage` and persist between sessions.

## Themes

Click **⚙** in the header to open Settings and choose **Light**, **Dark**, or **System**.

- *Light* is aged parchment with sepia ink; *Dark* is a candlelit tavern in oiled leather
  and gold leaf.
- *System* follows your OS setting and updates live if you change it.
- The choice is remembered per browser (`localStorage`), separately from your inventory
  save, and is applied before the page paints so there is no flash of the wrong theme.

Both palettes are CSS custom properties at the top of `src/css/style.css` — edit the
`:root` block for light, `:root[data-theme="dark"]` for dark. Rarity and coin colours are
tuned per theme, since the bright greens that read well on black disappear on parchment.

## Equipment Slots

Click **⚙ Configure Slots** at the bottom of the equipment panel to open the layout editor:

- **+ Header** — add a new section label
- **+ Slot** — add a new equipment slot
- **▲ / ▼** — reorder items
- **👁** — show or hide the slot in the panel
- **⇔** — render the slot side-by-side with adjacent `⇔` slots (useful for weapon rows)
- **✦** — restrict the slot to items that require attunement
- **↺ Defaults** — reset to the standard D&D 5e layout

## Party Play

Party sync uses Firebase Realtime Database. To enable it:

1. Create a project at [Firebase Console](https://console.firebase.google.com/)
2. Enable the Realtime Database
3. Copy `.env.example` to `.env` and fill in your project's values:

```bash
cp .env.example .env
```

```ini
FIREBASE_API_KEY=AIza...
FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
FIREBASE_DATABASE_URL=https://your-project-default-rtdb.firebaseio.com
FIREBASE_PROJECT_ID=your-project
FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
FIREBASE_MESSAGING_SENDER_ID=000000000000
FIREBASE_APP_ID=1:000000000000:web:abc123
```

`src/js/firebase-config.js` fetches `.env` at page load and parses it into
`FIREBASE_CONFIG`. `.env` is gitignored, so your credentials stay out of the repo.
Without it the app runs fully offline and party features are simply unavailable —
you'll see one informational line in the console.

> **`.env` is not a secret store here.** It is fetched by the browser, so anyone
> who can reach the site can read it at `/.env`. That is fine for Firebase web
> config — those values are public by design, and access is enforced by your
> [Realtime Database security rules](https://firebase.google.com/docs/database/security),
> not by hiding the keys. Never put real secrets (API tokens, private keys,
> passwords) in this file.

> **Deploying to GitHub Pages?** Jekyll skips files beginning with `.`, which
> would make `/.env` a 404 and silently disable party play. Add an empty
> `.nojekyll` file at the repo root to turn that off.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `R` | Rotate held item 90° clockwise |
| `Escape` | Cancel placement or drag |
| Right-click | Open context menu on a placed item |
