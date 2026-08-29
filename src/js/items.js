// =============================================================================
// DEFAULT ITEM DATABASE — data/items.csv
// =============================================================================
// Edit data/items.csv to add, remove, or modify the built-in item list.
//
// Columns: name, rarity, description, cost, tags, damage, damageType,
//          attunement, stackSize, image, shape,
//          container, containerRows, containerCols, properties, mastery, source
//
// source     — the source material the item comes from, e.g. PHB, DMG, TCoE.
//              "HB" (homebrew) is used for items the player adds in-app.
// tags       — pipe-separated list, e.g.  weapon|melee|finesse
// properties — semicolon-separated list, e.g.  finesse;light;thrown
// shape      — rows pipe-separated, each row is 0/1 digits,  e.g.  11|01|10
//              weight = number of 1s (1 lb per cell)
// stackSize  — how many fit in one cell, e.g. 20 (each then weighs 1/20 lb)
//              blank or 1 = does not stack
// id is auto-assigned from the row number (no id column needed)

let DEFAULT_ITEMS = [];

function parseCSVRow(line) {
  const fields = [];
  let i = 0;
  while (i <= line.length) {
    if (i === line.length) { fields.push(''); break; }
    if (line[i] === '"') {
      let val = '';
      i++;
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') { val += '"'; i += 2; }
        else if (line[i] === '"') { i++; break; }
        else { val += line[i++]; }
      }
      fields.push(val);
      if (line[i] === ',') i++;
    } else {
      const end = line.indexOf(',', i);
      if (end === -1) { fields.push(line.slice(i)); break; }
      fields.push(line.slice(i, end));
      i = end + 1;
    }
  }
  return fields;
}

function parseCost(str) {
  const zero = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
  if (!str || !str.trim()) return zero;
  const trimmed = str.trim();
  // Plain number → treat as gp (backwards compat)
  if (/^[\d.]+$/.test(trimmed)) return { ...zero, gp: parseFloat(trimmed) };
  const result = { ...zero };
  const re = /(\d+(?:\.\d+)?)\s*(cp|sp|ep|gp|pp)/gi;
  let m;
  while ((m = re.exec(trimmed)) !== null) {
    const denom = m[2].toLowerCase();
    if (denom in result) result[denom] += parseFloat(m[1]);
  }
  return result;
}

function parseShape(str) {
  if (!str || !str.trim()) return [[1]];
  return str.trim().split('|').map(row => row.split('').map(c => parseInt(c, 10)));
}

function parseStackSize(str, legacyStackable, legacyWeightEach) {
  if (str && str.trim()) return parseInt(str, 10);
  // CSVs written before the stackSize column carried stackable + weightEach.
  if (legacyStackable === 'true' && legacyWeightEach) return Math.round(1 / parseFloat(legacyWeightEach));
  return undefined;
}

function loadDefaultItems() {
  try {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', 'data/items.csv', false); // synchronous
    xhr.send();
    if (xhr.status !== 200) throw new Error(`HTTP ${xhr.status}`);
    const lines = xhr.responseText.split('\n').map(l => l.trim()).filter(l => l);
    if (lines.length < 2) return;
    const headers = parseCSVRow(lines[0]);
    DEFAULT_ITEMS = lines.slice(1).map((line, rowIndex) => {
      const vals = parseCSVRow(line);
      const v = col => vals[headers.indexOf(col)] ?? '';
      return {
        id:          String(rowIndex + 1),
        name:        v('name'),
        rarity:      v('rarity') || 'common',
        description: v('description'),
        cost:        parseCost(v('cost')),
        tags:        v('tags') ? v('tags').split('|') : [],
        damage:      v('damage')     || undefined,
        damageType:  v('damageType') || undefined,
        attunement:  v('attunement') === 'true',
        stackSize:   parseStackSize(v('stackSize'), v('stackable'), v('weightEach')),
        image:       v('image') || '',
        shape:       parseShape(v('shape')),
        container:      v('container') === 'true',
        containerRows:  v('containerRows') ? parseInt(v('containerRows'), 10) : undefined,
        containerCols:  v('containerCols') ? parseInt(v('containerCols'), 10) : undefined,
        properties:  v('properties') ? v('properties').split(';').map(s => s.trim()).filter(Boolean) : [],
        mastery:     v('mastery') || undefined,
        source:      v('source') || undefined,
      };
    }).filter(t => t.name);
  } catch (err) {
    console.error('Failed to load data/items.csv:', err);
  }
}
