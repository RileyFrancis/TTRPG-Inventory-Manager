// =============================================================================
// RENDER-STATS — Header weight / encumbrance readout
// =============================================================================
'use strict';

// =============================================================================
// RENDERING — HEADER WEIGHT STATS
// =============================================================================
function getZoneEncumbrance() {
  const str = state.character.strength;
  let status = 0; // 0 = none, 1 = enc, 2 = heavy
  Object.values(state.instances).forEach(inst => {
    if (inst.containerId) return; // skip items stored inside containers
    if (inst.row === null || inst.row === undefined) return;
    const t = state.db[inst.templateId];
    if (!t) return;
    const shape = getRotatedShape(t.shape, inst.rotation);
    const bottomRow = inst.row + shape.length - 1;
    if (bottomRow >= str * 2) {
      status = Math.max(status, 2);
    } else if (bottomRow >= str) {
      status = Math.max(status, 1);
    }
  });
  return status;
}

function updateWeightDisplay() {
  const str = state.character.strength;
  const normal = str * 15;
  const enc = str * 30;
  const heavy = str * 45;
  const carried = Math.round(totalCarriedWeight() * 100) / 100;

  document.getElementById('weight-carried').textContent = `${carried} lb carried`;
  document.getElementById('weight-limits').textContent  = `${normal} / ${enc} / ${heavy} lb`;

  // Status: zone placement overrides weight-based encumbrance upward
  const zoneStatus = getZoneEncumbrance();
  const statusEl = document.getElementById('encumbrance-status');
  if (carried > enc || zoneStatus >= 2) {
    statusEl.textContent = 'Heavily Encumbered'; statusEl.className = 'heavy';
  } else if (carried > normal || zoneStatus >= 1) {
    statusEl.textContent = 'Encumbered'; statusEl.className = 'enc';
  } else {
    statusEl.textContent = ''; statusEl.className = '';
  }

  // Dynamic bar max: expands from normal → enc → heavy as thresholds are crossed
  const barMax = carried > enc ? heavy : (carried > normal ? enc : normal);
  const pct    = Math.min(carried / barMax, 1) * 100;

  const fillEl = document.getElementById('weight-bar-fill');
  fillEl.style.width = pct + '%';
  // Keep gradient colors anchored to absolute weights by scaling backgroundSize
  // so the color at the fill edge always reflects the real encumbrance level
  fillEl.style.backgroundSize = (heavy / barMax * 100).toFixed(2) + '% 100%';

  // Enc marker always visible at the normal threshold
  document.getElementById('weight-enc-marker').style.left = (normal / barMax * 100) + '%';

  // Heavy marker only appears once the bar has expanded into the heavy zone
  const heavyMarkerEl = document.getElementById('weight-heavy-marker');
  heavyMarkerEl.style.left = (enc / barMax * 100) + '%';
  heavyMarkerEl.style.display = barMax === heavy ? '' : 'none';

  // Header — the name only. Strength is read off the sheet and shown by the
  // limits above rather than printed again as a number.
  document.getElementById('char-name-display').textContent = state.character.name;
}
