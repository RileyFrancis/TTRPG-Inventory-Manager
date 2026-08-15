// =============================================================================
// RENDER-SIDEBAR — Sidebar item list + item details panel
// =============================================================================
'use strict';

// =============================================================================
// RENDERING — SIDEBAR ITEM LIST
// =============================================================================
function renderItemList() {
  const listEl = document.getElementById('item-list');
  const search = document.getElementById('item-search').value.trim().toLowerCase();
  const rarityF = document.getElementById('rarity-filter').value;
  const tagF = document.getElementById('tag-filter').value;

  const items = Object.values(state.db).filter(t => {
    if (search && !t.name.toLowerCase().includes(search) && !t.description.toLowerCase().includes(search)) return false;
    if (rarityF && t.rarity !== rarityF) return false;
    if (tagF && !t.tags.includes(tagF)) return false;
    return true;
  });

  // Sort: rarity order desc, then name
  items.sort((a, b) => {
    const rd = RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity);
    return rd !== 0 ? rd : a.name.localeCompare(b.name);
  });

  listEl.innerHTML = '';
  items.forEach(t => {
    const card = document.createElement('div');
    card.className = 'item-card';
    card.dataset.templateId = t.id;
    if (state.placing && state.placing.templateId === t.id) card.classList.add('placing');

    const color = rarityColor(t.rarity);

    const swatch = document.createElement('div');
    swatch.className = 'item-card-swatch';
    swatch.style.background = color;

    const info = document.createElement('div');
    info.className = 'item-card-info';
    const nm = document.createElement('div');
    nm.className = 'item-card-name';
    nm.textContent = t.name;
    const sub = document.createElement('div');
    sub.className = 'item-card-sub';
    const w = isStackable(t)
      ? `${formatWeight(unitWeight(t))} lb ea · stack ×${stackSizeOf(t)}`
      : `${shapeWeight(t.shape)} lb`;
    sub.textContent = `${RARITY_META[t.rarity]?.label} · ${w}`;

    info.appendChild(nm);
    info.appendChild(sub);

    const shapePreview = buildMiniShapePreview(t.shape, color);

    card.appendChild(swatch);
    card.appendChild(info);
    card.appendChild(shapePreview);

    card.addEventListener('pointerdown', e => {
      if (e.button !== 0 || isReadOnly()) return;
      e.preventDefault(); // prevent text selection on mousedown
      const tid = t.id;
      const startX = e.clientX, startY = e.clientY;
      let dragging = false;

      const onMove = me => {
        if (!dragging && Math.hypot(me.clientX - startX, me.clientY - startY) < 5) return;
        if (!dragging) {
          dragging = true;
          document.body.style.userSelect = 'none';
          cancelPlacing(); // exit any existing placing mode cleanly
        }
        const tmpl = state.db[tid];
        if (!tmpl) return;
        const shape = getRotatedShape(tmpl.shape, 0);
        initGhostEl(shape, tmpl.rarity);

        const pos = cursorToGridPos(me.clientX, me.clientY, 0, 0);
        if (pos) {
          const sp = getGhostScreenPos(0, 0, pos.row, pos.col);
          const valid = canPlace(shape, pos.row, pos.col);
          setGhostVisibility(true);
          moveGhost(sp.x, sp.y, valid);
          highlightCells(shape, pos.row, pos.col, valid);
        } else {
          setGhostVisibility(false);
          clearHighlights();
        }
        // No equip-slot highlighting for new items (not yet placed)
        document.querySelectorAll('.eq-card.drag-hover').forEach(c => c.classList.remove('drag-hover'));
      };

      const onUp = ue => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.body.style.userSelect = '';
        if (!dragging) {
          // Treat as click → enter placing mode as before
          startPlacing(tid);
          return;
        }
        // End of drag: restore ghost visibility and clean up
        setGhostVisibility(true);
        hideGhost();
        clearHighlights();
        document.querySelectorAll('.eq-card.drag-hover').forEach(c => c.classList.remove('drag-hover'));

        const tmpl = state.db[tid];
        if (!tmpl) return;
        const shape = getRotatedShape(tmpl.shape, 0);
        const pos = cursorToGridPos(ue.clientX, ue.clientY, 0, 0);
        if (pos && canPlace(shape, pos.row, pos.col)) {
          if (isStackable(tmpl)) {
            openStackModal(stackSizeOf(tmpl),
              count => finalizePlacement(tmpl, shape, 0, pos.row, pos.col, count));
          } else {
            finalizePlacement(tmpl, shape, 0, pos.row, pos.col, 1);
          }
        }
        // If dropped outside/invalid, silently cancel — no placing mode
      };

      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    });
    card.addEventListener('pointerenter', e => {
      tooltipTimer = setTimeout(() => showTemplateTooltip(t.id, e.clientX, e.clientY), 1000);
    });
    card.addEventListener('pointerleave', clearTooltip);
    card.addEventListener('contextmenu', e => {
      e.preventDefault();
      showTemplateContextMenu(t.id, e.clientX, e.clientY);
    });

    listEl.appendChild(card);
  });

  // Rebuild tag filter
  populateTagFilter();
}

function buildMiniShapePreview(shape, color) {
  const norm = normalizeShape(shape);
  const { rows, cols } = shapeDims(norm);
  const clampR = Math.min(rows, 6), clampC = Math.min(cols, 6);
  const div = document.createElement('div');
  div.className = 'item-card-shape';
  div.style.gridTemplateColumns = `repeat(${clampC}, 7px)`;
  div.style.gridTemplateRows    = `repeat(${clampR}, 7px)`;
  for (let r = 0; r < clampR; r++) for (let c = 0; c < clampC; c++) {
    const cell = document.createElement('div');
    cell.className = 'card-cell ' + (norm[r]?.[c] ? 'filled' : 'empty');
    if (norm[r]?.[c]) cell.style.background = color;
    div.appendChild(cell);
  }
  return div;
}

function populateTagFilter() {
  const sel = document.getElementById('tag-filter');
  const current = sel.value;
  const allTags = new Set();
  Object.values(state.db).forEach(t => t.tags.forEach(tag => allTags.add(tag)));
  sel.innerHTML = '<option value="">All Tags</option>';
  [...allTags].sort().forEach(tag => {
    const opt = document.createElement('option');
    opt.value = tag; opt.textContent = tag;
    sel.appendChild(opt);
  });
  sel.value = current;
}

// =============================================================================
// RENDERING — DETAILS PANEL
// =============================================================================
function showTemplateDetails(templateId) {
  state.selected = { type: 'template', id: templateId };
  const t = state.db[templateId];
  if (!t) return;
  populateDetailsPanel(t);
  switchTab('details');

  document.getElementById('details-place-btn').classList.remove('hidden');
  document.getElementById('details-place-btn').onclick = () => startPlacing(t.id);
  document.getElementById('details-stash-btn').onclick = () => { addToStash(t.id); switchTab('browse'); };
  document.getElementById('details-edit-btn').onclick  = () => openItemModal(t.id);
  document.getElementById('details-delete-btn').textContent = 'Delete';
  document.getElementById('details-delete-btn').onclick = () => deleteTemplate(t.id);
}

function showInstanceDetails(instanceId) {
  const inst = state.instances[instanceId];
  if (!inst) return;
  const t = state.db[inst.templateId];
  if (!t) return;

  state.selected = { type: 'instance', id: instanceId };
  populateDetailsPanel(t, inst);
  switchTab('details');

  document.getElementById('details-place-btn').classList.add('hidden');
  document.getElementById('details-stash-btn').onclick = () => {
    if (inst.row !== null && inst.row !== undefined) {
      unequipInstance(instanceId);
      removeFromGrid(instanceId);
      inst.row = null;
      inst.col = null;
      renderAllItems();
      updateWeightDisplay();
      debouncedSync();
    }
    switchTab('browse');
  };
  document.getElementById('details-edit-btn').onclick = () => openItemModal(t.id);
  document.getElementById('details-delete-btn').textContent = 'Remove';
  document.getElementById('details-delete-btn').onclick = () => {
    removeInstance(instanceId);
    document.getElementById('details-content').classList.add('hidden');
    document.getElementById('details-placeholder').classList.remove('hidden');
  };
}

function populateDetailsPanel(t, inst) {
  const color = rarityColor(t.rarity);
  const shape = inst ? getRotatedShape(t.shape, inst.rotation ?? 0) : t.shape;
  const weight = isStackable(t)
    ? (inst ? `${formatWeight(unitWeight(t) * (inst.stackCount ?? 1))} lb (×${inst.stackCount ?? 1})` : `${formatWeight(unitWeight(t))} lb each`)
    : `${shapeWeight(shape)} lb`;

  document.getElementById('details-placeholder').classList.add('hidden');
  document.getElementById('details-content').classList.remove('hidden');

  document.getElementById('details-name').textContent = t.name;
  const badge = document.getElementById('details-rarity-badge');
  badge.textContent = RARITY_META[t.rarity]?.label;
  badge.style.background = color + '33';
  badge.style.color = color;
  badge.style.border = `1px solid ${color}66`;

  renderDetailsShapePreview(shape, color);

  const imgEl = document.getElementById('details-image');
  if (t.image) { imgEl.src = t.image; imgEl.classList.remove('hidden'); }
  else imgEl.classList.add('hidden');

  document.getElementById('details-weight').textContent = weight;
  document.getElementById('details-cost').textContent =
    hasCost(t.cost) ? formatCost(t.cost) : 'Priceless';

  const stackRow = document.getElementById('details-stack-row');
  if (isStackable(t)) {
    stackRow.classList.remove('hidden');
    document.getElementById('details-stack').textContent = inst
      ? `${inst.stackCount ?? 1} / ${stackSizeOf(t)}`
      : `×${stackSizeOf(t)} max`;
  } else {
    stackRow.classList.add('hidden');
  }

  const damageRow = document.getElementById('details-damage-row');
  if (t.damage) {
    damageRow.classList.remove('hidden');
    document.getElementById('details-damage').textContent =
      `${t.damage}${t.damageType ? ' ' + t.damageType : ''}`;
  } else {
    damageRow.classList.add('hidden');
  }

  document.getElementById('details-attunement-row').classList.toggle('hidden', !t.attunement);

  const tagsEl = document.getElementById('details-tags');
  tagsEl.innerHTML = '';
  t.tags.forEach(tag => {
    const pill = document.createElement('span');
    pill.className = 'tag-pill';
    pill.textContent = tag;
    tagsEl.appendChild(pill);
  });

  document.getElementById('details-desc').textContent = t.description || '';
}

function renderDetailsShapePreview(shape, color) {
  const preview = document.getElementById('details-shape-preview');
  const norm = normalizeShape(shape);
  const { rows, cols } = shapeDims(norm);
  preview.style.gridTemplateColumns = `repeat(${cols}, 20px)`;
  preview.style.gridTemplateRows    = `repeat(${rows}, 20px)`;
  preview.innerHTML = '';
  norm.forEach(row => row.forEach(v => {
    const cell = document.createElement('div');
    cell.className = 'prev-cell ' + (v ? 'filled' : 'empty');
    if (v) { cell.style.background = color + '55'; cell.style.borderColor = color; }
    preview.appendChild(cell);
  }));
}
