// =============================================================================
// INTERACTION-CONTEXT — Item click handling and the right-click context menu
// =============================================================================
'use strict';

// =============================================================================
// INTERACTION — ITEM CLICKS & CONTEXT MENU
// =============================================================================

function onItemContextMenu(e) {
  e.preventDefault();
  e.stopPropagation();
  if (isReadOnly()) return;
  const instanceId = e.currentTarget.dataset.instanceId;
  showInstanceContextMenu(instanceId, e.clientX, e.clientY);
}

// Close context menu on any click
document.addEventListener('click', () => hideContextMenu());
document.addEventListener('contextmenu', () => {});

const ctxMenu = document.getElementById('context-menu');
let ctxInstanceId = null;

function showInstanceContextMenu(instanceId, x, y) {
  ctxInstanceId = instanceId;
  const equipped = !!getEquippedSlot(instanceId);
  document.getElementById('ctx-equip').style.display     = equipped ? 'none' : '';
  document.getElementById('ctx-unequip').style.display   = equipped ? '' : 'none';
  document.getElementById('ctx-duplicate').style.display = '';
  document.getElementById('ctx-stash').style.display     = '';
  ctxMenu.style.left = x + 'px';
  ctxMenu.style.top  = y + 'px';
  ctxMenu.classList.remove('hidden');
}

function showTemplateContextMenu(templateId, x, y) {
  // Inline: just show edit/delete for templates
  ctxInstanceId = null;
  ctxMenu.style.left = x + 'px';
  ctxMenu.style.top  = y + 'px';
  document.getElementById('ctx-rotate').style.display = 'none';
  ctxMenu.classList.remove('hidden');
  document.getElementById('ctx-edit').onclick = () => { openItemModal(templateId); hideContextMenu(); };
  document.getElementById('ctx-remove').onclick = () => { deleteTemplate(templateId); hideContextMenu(); };
}

function hideContextMenu() {
  ctxMenu.classList.add('hidden');
  document.getElementById('ctx-rotate').style.display    = '';
  document.getElementById('ctx-equip').style.display     = '';
  document.getElementById('ctx-unequip').style.display   = 'none';
  document.getElementById('ctx-duplicate').style.display = 'none';
  document.getElementById('ctx-stash').style.display     = 'none';
}

document.getElementById('ctx-rotate').addEventListener('click', () => {
  if (!ctxInstanceId) return;
  rotateInstance(ctxInstanceId);
  hideContextMenu();
});
document.getElementById('ctx-equip').addEventListener('click', () => {
  if (!ctxInstanceId) return;
  openEquipModal(ctxInstanceId);
  hideContextMenu();
});
document.getElementById('ctx-unequip').addEventListener('click', () => {
  if (!ctxInstanceId) return;
  unequipInstance(ctxInstanceId);
  hideContextMenu();
});
document.getElementById('ctx-edit').addEventListener('click', () => {
  if (!ctxInstanceId) return;
  const inst = state.instances[ctxInstanceId];
  if (inst) openItemModal(inst.templateId);
  hideContextMenu();
});
document.getElementById('ctx-duplicate').addEventListener('click', () => {
  if (!ctxInstanceId) return;
  const inst = state.instances[ctxInstanceId];
  if (inst) startPlacing(inst.templateId);
  hideContextMenu();
});
document.getElementById('ctx-stash').addEventListener('click', () => {
  if (!ctxInstanceId) return;
  const inst = state.instances[ctxInstanceId];
  if (inst) {
    unequipInstance(ctxInstanceId);
    removeFromGrid(ctxInstanceId);
    inst.row = null;
    inst.col = null;
    renderAllItems();
    updateWeightDisplay();
    debouncedSync();
  }
  hideContextMenu();
});
document.getElementById('ctx-remove').addEventListener('click', () => {
  if (!ctxInstanceId) return;
  removeInstance(ctxInstanceId);
  hideContextMenu();
});

function rotateInstance(instanceId) {
  const inst = state.instances[instanceId];
  if (!inst) return;
  const template = state.db[inst.templateId];
  const newRot = (inst.rotation + 1) % 4;
  const newShape = getRotatedShape(template.shape, newRot);
  if (canPlace(newShape, inst.row, inst.col, instanceId)) {
    removeFromGrid(instanceId);
    inst.rotation = newRot;
    placeOnGrid(instanceId, newShape, inst.row, inst.col);
    renderAllItems();
    debouncedSync();
  }
}

function removeInstance(instanceId) {
  const inst = state.instances[instanceId];
  const t = inst ? state.db[inst.templateId] : null;
  if (t?.container) {
    // Remove all items stored inside this container
    Object.keys(state.instances).forEach(id => {
      if (state.instances[id]?.containerId === instanceId) delete state.instances[id];
    });
    delete state.containerGrids[instanceId];
    if (state.activeContainer === instanceId) {
      state.activeContainer = null;
      buildGrid();
    }
  }
  removeFromGrid(instanceId);
  delete state.instances[instanceId];
  renderContainerTabs();
  renderAllItems();
  updateWeightDisplay();
  debouncedSync();
}

function deleteTemplate(templateId) {
  if (!confirm(`Delete "${state.db[templateId]?.name}" from the item database? Placed items will remain.`)) return;
  delete state.db[templateId];
  renderItemList();
  document.getElementById('details-content').classList.add('hidden');
  document.getElementById('details-placeholder').classList.remove('hidden');
}
