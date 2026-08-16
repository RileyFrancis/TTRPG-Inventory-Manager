// =============================================================================
// EQUIPMENT — Equipment slots, layout editor, equip/unequip
// =============================================================================
'use strict';

// =============================================================================
// EQUIPMENT
// =============================================================================
function getEquippedSlot(instanceId) {
  return Object.entries(state.equipped).find(([, id]) => id === instanceId)?.[0] ?? null;
}

function equipItem(instanceId, slotId) {
  // Remove from any slot it's already in
  for (const s of Object.keys(state.equipped)) {
    if (state.equipped[s] === instanceId) delete state.equipped[s];
  }
  state.equipped[slotId] = instanceId;
  renderAllItems();
  debouncedSync();
}

function unequipItem(slotId) {
  delete state.equipped[slotId];
  renderAllItems();
  debouncedSync();
}

function unequipInstance(instanceId) {
  const slotId = getEquippedSlot(instanceId);
  if (slotId) unequipItem(slotId);
}

function renderEquipPanel() {
  // The equipment pane, not the whole left panel — the Shop pane is its sibling.
  const panel = document.getElementById('left-pane-equip');
  if (!panel) return;
  panel.innerHTML = '';

  const scrollArea = document.createElement('div');
  scrollArea.id = 'equip-slots-scroll';

  function makeSlotCard(slot) {
    const instId = state.equipped[slot.id] ?? null;
    const inst   = instId ? state.instances[instId] : null;
    const t      = inst ? state.db[inst.templateId] : null;

    const card = document.createElement('div');
    card.className = 'eq-card' + (t ? ' filled' : '');
    card.dataset.slotId = slot.id;

    const labelEl = document.createElement('span');
    labelEl.className = 'eq-card-label';
    labelEl.textContent = slot.panelLabel || slot.label;

    const itemEl = document.createElement('span');
    itemEl.className = 'eq-card-item';
    itemEl.textContent = t ? t.name : '—';

    card.appendChild(labelEl);
    card.appendChild(itemEl);

    if (t && !isReadOnly()) {
      const unequipBtn = document.createElement('button');
      unequipBtn.className = 'eq-card-unequip';
      unequipBtn.textContent = '×';
      unequipBtn.title = 'Unequip';
      unequipBtn.addEventListener('click', e => { e.stopPropagation(); unequipItem(slot.id); });
      card.appendChild(unequipBtn);
    }

    if (inst) {
      card.addEventListener('pointerenter', e => startTooltipTimer(inst.id, e.clientX, e.clientY));
      card.addEventListener('pointerleave', clearTooltip);
    }

    if (!isReadOnly()) {
      card.addEventListener('click', () => openSlotPicker(slot.id));
    }

    return card;
  }

  let currentSection = null;
  let rowBuffer = [];

  function flushRowBuffer() {
    if (!rowBuffer.length) return;
    const rowDiv = document.createElement('div');
    rowDiv.className = 'eq-weapons-row';
    rowBuffer.forEach(card => rowDiv.appendChild(card));
    currentSection.appendChild(rowDiv);
    rowBuffer = [];
  }

  state.equipLayout.forEach(item => {
    if (item.type === 'header') {
      flushRowBuffer();
      currentSection = document.createElement('div');
      currentSection.className = 'eq-section';
      const hdr = document.createElement('div');
      hdr.className = 'eq-section-header';
      hdr.textContent = item.label;
      currentSection.appendChild(hdr);
      scrollArea.appendChild(currentSection);
    } else if (item.type === 'slot' && item.visible !== false) {
      if (!currentSection) {
        currentSection = document.createElement('div');
        currentSection.className = 'eq-section';
        scrollArea.appendChild(currentSection);
      }
      const card = makeSlotCard(item);
      if (item.inRow) {
        rowBuffer.push(card);
      } else {
        flushRowBuffer();
        currentSection.appendChild(card);
      }
    }
  });

  flushRowBuffer();

  panel.appendChild(scrollArea);

  // Coin purse
  const coinPurse = document.createElement('div');
  coinPurse.id = 'coin-purse';
  const cpHdr = document.createElement('div');
  cpHdr.className = 'coin-purse-header';
  cpHdr.textContent = 'Coin Purse';
  coinPurse.appendChild(cpHdr);
  const cpGrid = document.createElement('div');
  cpGrid.className = 'coin-purse-grid';
  const counts = getCoinCounts();
  const coinTemplates = getCoinTemplates();
  const coinDefs = ['pp', 'gp', 'ep', 'sp', 'cp'].map(denom => ({
    templateId: coinTemplates[denom],   // null if the CSV has no coin of this denomination
    label: denom.toUpperCase(),
    count: counts[denom],
    color: coinColor(denom),
  }));
  coinDefs.forEach(({ templateId, label, count, color }) => {
    const item = document.createElement('div');
    item.className = 'coin-item' + (count === 0 ? ' empty' : '');
    const lbl = document.createElement('span');
    lbl.className = 'coin-label';
    lbl.style.color = color;
    lbl.textContent = label;
    const cnt = document.createElement('span');
    cnt.className = 'coin-count';
    cnt.textContent = count.toLocaleString();
    item.appendChild(lbl);
    item.appendChild(cnt);
    // No template for this denomination means nothing to add or remove — show
    // the tally, but don't offer buttons that could only fail.
    if (!isReadOnly() && templateId) {
      item.classList.add('clickable');
      const actions = document.createElement('div');
      actions.className = 'coin-actions';
      const addBtn = document.createElement('button');
      addBtn.className = 'coin-action-btn';
      addBtn.textContent = '+';
      addBtn.title = `Add ${label}`;
      addBtn.addEventListener('click', e => { e.stopPropagation(); openAddCoinsModal(templateId); });
      const remBtn = document.createElement('button');
      remBtn.className = 'coin-action-btn';
      remBtn.textContent = '−';
      remBtn.title = `Remove ${label}`;
      remBtn.disabled = count === 0;
      remBtn.addEventListener('click', e => { e.stopPropagation(); openRemoveCoinsModal(templateId); });
      actions.appendChild(addBtn);
      actions.appendChild(remBtn);
      item.appendChild(actions);
    }
    cpGrid.appendChild(item);
  });
  coinPurse.appendChild(cpGrid);
  panel.appendChild(coinPurse);

  const footer = document.createElement('div');
  footer.id = 'equip-panel-footer';
  const settingsBtn = document.createElement('button');
  settingsBtn.className = 'btn-sm';
  settingsBtn.textContent = '⚙ Configure Slots';
  settingsBtn.addEventListener('click', openEquipSettings);
  footer.appendChild(settingsBtn);
  panel.appendChild(footer);
}

function openEquipSettings() {
  let draft = JSON.parse(JSON.stringify(state.equipLayout));

  const list = document.getElementById('equip-settings-list');

  // Index of the row being dragged, or null. The rows are rebuilt on every
  // crossing, so the drag is tracked by position in `draft`, not by element.
  let dragIndex = null;

  function renderDraft() {
    list.innerHTML = '';

    draft.forEach((item, idx) => {
      const row = document.createElement('div');
      row.className = 'es-row' + (item.type === 'header' ? ' es-header-row' : '')
        + (idx === dragIndex ? ' es-dragging' : '');

      const grip = document.createElement('span');
      grip.className = 'es-grip';
      grip.title = 'Drag to reorder';
      grip.textContent = '⠿';
      grip.addEventListener('pointerdown', e => startRowDrag(e, idx));

      const labelInput = document.createElement('input');
      labelInput.type = 'text';
      labelInput.className = 'es-label-input';
      labelInput.value = item.label;
      labelInput.addEventListener('input', e => { draft[idx].label = e.target.value; });

      const delBtn = document.createElement('button');
      delBtn.className = 'btn-icon danger';
      delBtn.title = 'Remove';
      delBtn.textContent = '×';
      delBtn.addEventListener('click', () => { draft.splice(idx, 1); renderDraft(); });

      row.appendChild(grip);
      row.appendChild(labelInput);

      if (item.type === 'slot') {
        function makeToggle(title, symbol, getter, setter) {
          const lbl = document.createElement('label');
          lbl.className = 'es-toggle';
          lbl.title = title;
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.checked = getter();
          cb.addEventListener('change', () => setter(cb.checked));
          lbl.appendChild(cb);
          const sym = document.createElement('span');
          sym.textContent = symbol;
          lbl.appendChild(sym);
          return lbl;
        }
        row.appendChild(makeToggle('Show in panel', '👁', () => item.visible !== false, v => { draft[idx].visible = v; }));
        row.appendChild(makeToggle('Side-by-side', '⇔', () => !!item.inRow, v => { draft[idx].inRow = v; }));
        row.appendChild(makeToggle('Attunement only', '✦', () => !!item.attuneOnly, v => { draft[idx].attuneOnly = v; }));
      }

      row.appendChild(delBtn);
      list.appendChild(row);
    });
  }

  // Grab a row by its grip and drag it through the list. The move/up listeners
  // live on the document, not the grip: re-rendering destroys the element the
  // drag started on, which would drop a pointer capture on the spot.
  function startRowDrag(e, idx) {
    if (e.button !== 0) return;
    e.preventDefault(); // no text selection, and the label input keeps its focus
    dragIndex = idx;
    document.body.style.userSelect = 'none';
    renderDraft();

    const onMove = me => {
      // Reorder as soon as the cursor passes another row's midpoint, so the
      // list under the cursor always shows where the row would land.
      const rows = [...list.querySelectorAll('.es-row')];
      let target = rows.findIndex(r => {
        const b = r.getBoundingClientRect();
        return me.clientY < b.top + b.height / 2;
      });
      if (target === -1) target = rows.length - 1;

      // Dragging against either end of a scrolled list pulls it along.
      const box = list.getBoundingClientRect();
      if (me.clientY < box.top + 24)         list.scrollTop -= 8;
      else if (me.clientY > box.bottom - 24) list.scrollTop += 8;

      if (target === dragIndex) return;
      const [moved] = draft.splice(dragIndex, 1);
      draft.splice(target, 0, moved);
      dragIndex = target;
      renderDraft();
    };

    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.body.style.userSelect = '';
      dragIndex = null;
      renderDraft();
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  renderDraft();

  // New rows land at the bottom of the list, which the pinned toolbar is no
  // longer next to — scroll down so the row you just added is on screen.
  function addRow(item) {
    draft.push(item);
    renderDraft();
    list.scrollTop = list.scrollHeight;
  }

  document.getElementById('es-add-header-btn').onclick = () =>
    addRow({ type: 'header', label: 'New Section' });

  document.getElementById('es-add-slot-btn').onclick = () =>
    addRow({ type: 'slot', id: 'slot_' + Math.random().toString(36).slice(2, 6), label: 'New Slot', panelLabel: '', attuneOnly: false, inRow: false, visible: true });

  document.getElementById('es-reset-btn').onclick = () => { draft = getDefaultEquipLayout(); renderDraft(); };

  document.getElementById('equip-settings-apply-btn').onclick = () => {
    state.equipLayout = draft;
    saveSlotConfig();
    renderEquipPanel();
    hideModal('equip-settings-modal');
  };

  showModal('equip-settings-modal');
}

function saveSlotConfig() {
  localStorage.setItem('dnd_slot_config', JSON.stringify(state.equipLayout));
}

function loadSlotConfig() {
  if (state.equipLayout.length) return; // already restored by autoLoad
  try {
    const raw = localStorage.getItem('dnd_slot_config');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]?.type) {
        state.equipLayout = parsed;
      } else if (Array.isArray(parsed)) {
        // Migrate old format (list of disabled slot ID strings)
        const layout = getDefaultEquipLayout();
        parsed.forEach(id => {
          const s = layout.find(item => item.type === 'slot' && item.id === id);
          if (s) s.visible = false;
        });
        state.equipLayout = layout;
      }
    }
  } catch {}
  if (!state.equipLayout.length) state.equipLayout = getDefaultEquipLayout();
}

let equipModalInstanceId = null;

// Called from context menu "Equip…" — picks a slot for the given item
function openEquipModal(instanceId) {
  equipModalInstanceId = instanceId;
  const inst = state.instances[instanceId];
  const t    = inst ? state.db[inst.templateId] : null;

  document.getElementById('equip-modal').querySelector('h2').textContent = 'Equip to Slot';

  const picker = document.getElementById('equip-slot-picker');
  picker.innerHTML = '';

  const eligibleSlots = state.equipLayout.filter(item =>
    item.type === 'slot' && item.visible !== false && !(item.attuneOnly && !t?.attunement)
  );

  eligibleSlots.forEach(slot => {
    const occupantId   = state.equipped[slot.id];
    const occupantInst = occupantId ? state.instances[occupantId] : null;
    const occupantName = occupantInst ? state.db[occupantInst.templateId]?.name : null;

    const btn = document.createElement('button');
    btn.className = 'btn-sm equip-slot-pick-btn';
    btn.textContent = slot.label + (occupantName ? ` (${occupantName})` : '');
    btn.addEventListener('click', () => { equipItem(instanceId, slot.id); hideModal('equip-modal'); });
    picker.appendChild(btn);
  });

  showModal('equip-modal');
}

// Called from clicking a slot in the equip panel — picks an item for the given slot
function openSlotPicker(slotId) {
  clearTooltip();
  const slot = getSlotDef(slotId);
  if (!slot) return;

  document.getElementById('equip-modal').querySelector('h2').textContent = slot.label;

  const picker = document.getElementById('equip-slot-picker');
  picker.innerHTML = '';

  // Unequip option when slot is occupied
  const currentId = state.equipped[slotId];
  if (currentId) {
    const unequipBtn = document.createElement('button');
    unequipBtn.className = 'btn-sm equip-slot-pick-btn danger';
    unequipBtn.textContent = 'Unequip';
    unequipBtn.addEventListener('click', () => { unequipItem(slotId); hideModal('equip-modal'); });
    picker.appendChild(unequipBtn);
  }

  const candidates = Object.values(state.instances).filter(inst => {
    const tmpl = state.db[inst.templateId];
    if (!tmpl) return false;
    if (slot.attuneOnly && !tmpl.attunement) return false;
    return true;
  });

  if (candidates.length === 0) {
    const msg = document.createElement('p');
    msg.className = 'modal-note';
    msg.textContent = slot.attuneOnly
      ? 'No items requiring attunement in your inventory.'
      : 'No items in your inventory.';
    picker.appendChild(msg);
  } else {
    candidates.forEach(inst => {
      const tmpl         = state.db[inst.templateId];
      const alreadyHere  = state.equipped[slotId] === inst.id;
      const btn = document.createElement('button');
      btn.className = 'btn-sm equip-slot-pick-btn' + (alreadyHere ? ' active' : '');
      btn.textContent = tmpl.name
        + (inst.stackCount > 1 ? ` ×${inst.stackCount}` : '')
        + (alreadyHere ? ' (equipped)' : '');
      btn.addEventListener('click', () => { equipItem(inst.id, slotId); hideModal('equip-modal'); });
      picker.appendChild(btn);
    });
  }

  showModal('equip-modal');
}
