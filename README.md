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
- **Party play** — share a session code with your GM or players via Firebase Realtime Database
- **Configure Slots** — fully customizable equipment panel with custom sections, reordering, and per-slot options

## Running

No build step required. Serve the project root over HTTP:

```bash
python3 -m http.server 8787
```

Then open [http://localhost:8787](http://localhost:8787).

> Opening `index.html` directly as a `file://` URL works but is not recommended.

## Files

| File | Purpose |
|------|---------|
| `index.html` | Static shell — all DOM elements with stable IDs |
| `style.css` | All styles; CSS custom properties drive the theme |
| `app.js` | All application logic |
| `items.js` | Default item database (`DEFAULT_ITEMS` array) |
| `items/images/` | Item artwork |

## Item Database

Edit `items.js` to add, remove, or modify the default items available in every session. Each item is a plain object:

```js
{
  id: 'longsword',
  name: 'Longsword',
  rarity: 'common',           // common | uncommon | rare | very_rare | legendary | artifact
  description: 'A standard longsword.',
  cost: 15,                   // gold pieces
  tags: ['weapon', 'melee'],
  damage: '1d8',              // optional
  damageType: 'slashing',     // optional
  attunement: false,
  stackable: false,
  shape: [                    // 2D array of 0/1; weight = number of 1s (1 lb per cell)
    [1, 1, 1],
    [0, 0, 1],
  ],
  image: 'items/images/longsword.png', // optional
}
```

Custom items created in-app are saved to `localStorage` and persist between sessions.

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
3. Add your config to the `firebaseConfig` object near the bottom of `app.js`

Without a Firebase config the app runs fully offline; party features are simply unavailable.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `R` | Rotate held item 90° clockwise |
| `Escape` | Cancel placement or drag |
| Right-click | Open context menu on a placed item |
