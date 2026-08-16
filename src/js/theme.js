// =============================================================================
// THEME — Light / dark palette switching, persisted across sessions
// =============================================================================
'use strict';

// =============================================================================
// THEME
// =============================================================================
// The `data-theme` attribute on <html> is always one of 'light' | 'dark'; the
// inline script in index.html <head> sets it before first paint. What we store
// is the *preference*, which may also be 'system' — resolved against the OS
// setting here and re-resolved whenever the OS setting changes.
//
// Kept out of the main save file (dnd_inventory_v1) deliberately: the theme
// belongs to this browser, not to the character, and it has to be readable
// before any app state loads.

const THEME_KEY = 'dnd_inventory_theme';
const THEME_CHOICES = ['light', 'dark', 'system'];

const systemDarkQuery = window.matchMedia
  ? window.matchMedia('(prefers-color-scheme: dark)')
  : null;

function getThemePreference() {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    return THEME_CHOICES.includes(stored) ? stored : 'system';
  } catch (e) {
    return 'system'; // private mode / storage disabled
  }
}

function systemPrefersDark() {
  return !!(systemDarkQuery && systemDarkQuery.matches);
}

// 'system' → whichever palette the OS is asking for right now
function resolveTheme(pref) {
  if (pref === 'light' || pref === 'dark') return pref;
  return systemPrefersDark() ? 'dark' : 'light';
}

// Paint the resolved palette and bring rarity-coloured DOM back in sync.
function applyTheme(pref, { rerender = true } = {}) {
  document.documentElement.setAttribute('data-theme', resolveTheme(pref));
  clearRarityColorCache();
  updateThemePickerUI(pref);
  if (rerender) rerenderThemedContent();
}

function setThemePreference(pref) {
  if (!THEME_CHOICES.includes(pref)) return;
  try { localStorage.setItem(THEME_KEY, pref); } catch (e) { /* non-fatal */ }
  applyTheme(pref);
}

// Rarity colours are read from CSS and baked into inline styles when these
// render, so a palette swap means re-running them.
function rerenderThemedContent() {
  renderAllItems();
  renderItemList();
  renderStash();
  renderEquipPanel();
  renderShopPanel(); // rarity swatches and coin colours are inlined there too

  // Repaint the details panel in place — deliberately not via
  // show*Details(), which would also yank the user to the Details tab.
  const sel = state.selected;
  if (sel && sel.type === 'instance') {
    const inst = state.instances[sel.id];
    const t = inst && state.db[inst.templateId];
    if (t) populateDetailsPanel(t, inst);
  } else if (sel && sel.type === 'template') {
    const t = state.db[sel.id];
    if (t) populateDetailsPanel(t);
  }
}

function updateThemePickerUI(pref) {
  document.querySelectorAll('#theme-picker .seg-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.themeChoice === pref);
  });
  const hint = document.getElementById('theme-hint');
  if (!hint) return;
  hint.textContent = pref === 'system'
    ? `Following your device, which is currently ${systemPrefersDark() ? 'dark' : 'light'}.`
    : `Always ${pref}, on this browser.`;
}

function initTheme() {
  const pref = getThemePreference();
  applyTheme(pref, { rerender: false }); // init() renders everything right after

  document.querySelectorAll('#theme-picker .seg-btn').forEach(btn => {
    btn.addEventListener('click', () => setThemePreference(btn.dataset.themeChoice));
  });

  // Track the OS setting while the preference is 'system'
  if (systemDarkQuery) {
    const onSystemChange = () => {
      if (getThemePreference() === 'system') applyTheme('system');
    };
    if (systemDarkQuery.addEventListener) systemDarkQuery.addEventListener('change', onSystemChange);
    else systemDarkQuery.addListener(onSystemChange); // older Safari
  }
}

function openSettingsModal() {
  updateThemePickerUI(getThemePreference());
  showModal('settings-modal');
}

document.getElementById('settings-btn').addEventListener('click', openSettingsModal);

// The info pages replace the settings modal rather than stacking on top of it —
// a click on the backdrop closes every open modal, so two at once would both go.
document.getElementById('how-to-btn').addEventListener('click', () => {
  hideModal('settings-modal');
  showModal('how-to-modal');
});
document.getElementById('about-btn').addEventListener('click', () => {
  hideModal('settings-modal');
  showModal('about-modal');
});
document.querySelectorAll('.settings-back-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const modal = btn.closest('.modal');
    if (modal) hideModal(modal.id);
    openSettingsModal();
  });
});
