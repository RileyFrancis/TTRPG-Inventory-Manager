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
  const panel = document.getElementById('equip-panel');
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
  const { cp, sp, ep, gp, pp } = getCoinCounts();
  const coinDefs = [
    { templateId: 'coin_pp', label: 'PP', count: pp, color: coinColor('pp') },
    { templateId: 'coin_gp', label: 'GP', count: gp, color: coinColor('gp') },
    { templateId: 'coin_ep', label: 'EP', count: ep, color: coinColor('ep') },
    { templateId: 'coin_sp', label: 'SP', count: sp, color: coinColor('sp') },
    { templateId: 'coin_cp', label: 'CP', count: cp, color: coinColor('cp') },
  ];
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
    if (!isReadOnly()) {
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

  function renderDraft() {
    list.innerHTML = '';

    draft.forEach((item, idx) => {
      const row = document.createElement('div');
      row.className = 'es-row' + (item.type === 'header' ? ' es-header-row' : '');

      const upBtn = document.createElement('button');
      upBtn.className = 'btn-icon';
      upBtn.title = 'Move up';
      upBtn.textContent = '▲';
      upBtn.disabled = idx === 0;
      upBtn.addEventListener('click', () => {
        if (idx > 0) { [draft[idx - 1], draft[idx]] = [draft[idx], draft[idx - 1]]; renderDraft(); }
      });

      const dnBtn = document.createElement('button');
      dnBtn.className = 'btn-icon';
      dnBtn.title = 'Move down';
      dnBtn.textContent = '▼';
      dnBtn.disabled = idx === draft.length - 1;
      dnBtn.addEventListener('click', () => {
        if (idx < draft.length - 1) { [draft[idx + 1], draft[idx]] = [draft[idx], draft[idx + 1]]; renderDraft(); }
      });

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

      row.appendChild(upBtn);
      row.appendChild(dnBtn);
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

    const addRow = document.createElement('div');
    addRow.className = 'es-add-row';

    const addHdrBtn = document.createElement('button');
    addHdrBtn.className = 'btn-sm';
    addHdrBtn.textContent = '+ Header';
    addHdrBtn.addEventListener('click', () => {
      draft.push({ type: 'header', label: 'New Section' });
      renderDraft();
    });

    const addSlotBtn = document.createElement('button');
    addSlotBtn.className = 'btn-sm';
    addSlotBtn.textContent = '+ Slot';
    addSlotBtn.addEventListener('click', () => {
      draft.push({ type: 'slot', id: 'slot_' + Math.random().toString(36).slice(2, 6), label: 'New Slot', panelLabel: '', attuneOnly: false, inRow: false, visible: true });
      renderDraft();
    });

    const resetBtn = document.createElement('button');
    resetBtn.className = 'btn-sm';
    resetBtn.textContent = '↺ Defaults';
    resetBtn.addEventListener('click', () => { draft = getDefaultEquipLayout(); renderDraft(); });

    addRow.appendChild(addHdrBtn);
    addRow.appendChild(addSlotBtn);
    addRow.appendChild(resetBtn);
    list.appendChild(addRow);
  }

  renderDraft();

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
