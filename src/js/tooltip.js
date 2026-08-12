// =============================================================================
// TOOLTIP — Hover tooltip for items
// =============================================================================
'use strict';

// =============================================================================
// TOOLTIP
// =============================================================================
let tooltipTimer = null;

function startTooltipTimer(instanceId, x, y) {
  clearTooltip();
  tooltipTimer = setTimeout(() => showItemTooltip(instanceId, x, y), 1200);
}

function clearTooltip() {
  clearTimeout(tooltipTimer);
  tooltipTimer = null;
  const el = document.getElementById('item-tooltip');
  el.classList.add('hidden');
  el.innerHTML = '';
}

function showItemTooltip(instanceId, x, y) {
  const inst = state.instances[instanceId];
  if (!inst) return;
  const t = state.db[inst.templateId];
  if (!t) return;
  const weight = t.stackable
    ? `${Math.round(t.weightEach * (inst.stackCount ?? 1) * 100) / 100} lb (×${inst.stackCount ?? 1})`
    : `${shapeWeight(getRotatedShape(t.shape, inst.rotation))} lb`;
  renderTooltip(t, weight, x, y);
}

function showTemplateTooltip(templateId, x, y) {
  const t = state.db[templateId];
  if (!t) return;
  const weight = t.stackable ? `${t.weightEach} lb each` : `${shapeWeight(t.shape)} lb`;
  renderTooltip(t, weight, x, y);
}

function renderTooltip(t, weight, x, y) {
  const el    = document.getElementById('item-tooltip');
  const color = RARITY_META[t.rarity]?.color ?? '#888';

  const dmgHtml    = t.damage
    ? `<div class="tip-row"><span>Damage</span><span>${t.damage}${t.damageType ? ' ' + t.damageType : ''}</span></div>`
    : '';
  const costHtml   = hasCost(t.cost)
    ? `<div class="tip-row"><span>Cost</span><span>${formatCost(t.cost)}</span></div>`
    : '';
  const attuneHtml = t.attunement
    ? `<div class="tip-attune">Requires Attunement</div>`
    : '';
  const descHtml   = t.description
    ? `<div class="tip-desc">${t.description}</div>`
    : '';
  const tagsHtml   = t.tags?.length
    ? `<div class="tip-tags">${t.tags.map(tag => `<span class="tag-pill">${tag}</span>`).join('')}</div>`
    : '';

  el.innerHTML = `
    <div class="tip-header">
      <span class="tip-name">${t.name}</span>
      <span class="tip-rarity" style="color:${color}">${RARITY_META[t.rarity]?.label ?? ''}</span>
    </div>
    ${attuneHtml}
    <div class="tip-row"><span>Weight</span><span>${weight}</span></div>
    ${costHtml}
    ${dmgHtml}
    ${descHtml}
    ${tagsHtml}
  `;

  el.classList.remove('hidden');

  const pad = 12, tipW = 240;
  let left = x + pad, top = y + pad;
  if (left + tipW > window.innerWidth - pad) left = x - tipW - pad;
  el.style.left = left + 'px';
  el.style.top  = top + 'px';
  if (top + el.offsetHeight > window.innerHeight - pad) {
    el.style.top = (window.innerHeight - el.offsetHeight - pad) + 'px';
  }
}
