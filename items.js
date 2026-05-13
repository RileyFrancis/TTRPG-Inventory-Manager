// =============================================================================
// DEFAULT ITEM DATABASE — items/items.csv
// =============================================================================
// Edit items/items.csv to add, remove, or modify the built-in item list.
//
// Columns: id, name, rarity, description, cost, tags, damage, damageType,
//          attunement, stackable, weightEach, image, shape
//
// tags  — pipe-separated list, e.g.  weapon|melee|finesse
// shape — rows pipe-separated, each row is binary digits, e.g. 11|01|10
//         weight = number of 1s (1 lb per cell)

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

function parseShape(str) {
  if (!str || !str.trim()) return [[1]];
  return str.trim().split('|').map(row => row.split('').map(c => parseInt(c, 10)));
}

function loadDefaultItems() {
  try {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', 'items/items.csv', false); // synchronous
    xhr.send();
    if (xhr.status !== 200) throw new Error(`HTTP ${xhr.status}`);
    const text = xhr.responseText;
    const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    if (lines.length < 2) return;
    const headers = parseCSVRow(lines[0]);

    DEFAULT_ITEMS = lines.slice(1).map(line => {
      const vals = parseCSVRow(line);
      const v = (col) => vals[headers.indexOf(col)] ?? '';
      return {
        id:          v('id'),
        name:        v('name'),
        rarity:      v('rarity') || 'common',
        description: v('description'),
        cost:        parseFloat(v('cost')) || 0,
        tags:        v('tags') ? v('tags').split('|') : [],
        damage:      v('damage')     || undefined,
        damageType:  v('damageType') || undefined,
        attunement:  v('attunement') === 'true',
        stackable:   v('stackable')  === 'true',
        weightEach:  v('weightEach') ? parseFloat(v('weightEach')) : undefined,
        image:       v('image') || '',
        shape:       parseShape(v('shape')),
      };
    }).filter(t => t.id);
  } catch (err) {
    console.error('Failed to load items/items.csv:', err);
  }
}
