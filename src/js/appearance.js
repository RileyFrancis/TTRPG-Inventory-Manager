// =============================================================================
// APPEARANCE — the accent colours the app is drawn in, and the wheel that sets them
// =============================================================================
'use strict';

// theme.js owns light/dark (the palette); this owns the accent (the colour).
//
// What the user picks is a hue and a saturation — never a lightness. Each theme
// knows how light its accent must be to sit on its own background (L 33% on
// parchment, L 56% by candlelight), so a pick supplies the colour and the theme
// supplies the contrast. `vars` holds a finished per-theme map of CSS properties
// resolved at pick time, so switching theme (and the no-flash script in <head>)
// never does colour maths. Setting the property on <html> is the whole of
// applying it — the accent is never baked into an inline style. Stored per
// browser (`dnd_inventory_colors`), not in the save file. See CLAUDE.md § The accent colour.

const ACCENT_KEY = 'dnd_inventory_colors';

// The three roles, the tokens each drives, and the saturation/lightness each
// theme wants for each. Every figure is a tokens.css default measured back into
// HSL, so an untouched app and a custom colour are built the same way.
//
// A role can drive a whole FAMILY: `surface` is panels, the page behind them,
// the desk under the paper and both borders — one hue at six lightnesses, so
// "the background is a darker version of the panel colour" is what having one
// hue and six lightnesses means. The first token is the role's reference.
const ACCENT_ROLES = {
  primary: {
    label: 'Primary',
    tokens: [{ name: '--accent', light: { s: 66, l: 33 }, dark: { s: 61, l: 56 } }],
  },
  secondary: {
    label: 'Secondary',
    tokens: [{ name: '--accent-soft', light: { s: 46, l: 47 }, dark: { s: 52, l: 47 } }],
  },
  surface: {
    label: 'Panels',
    tokens: [
      { name: '--panel',   light: { s: 66, l: 91 }, dark: { s: 25, l: 12 } },
      { name: '--surface', light: { s: 55, l: 86 }, dark: { s: 29, l:  9 } },
      { name: '--field',   light: { s: 42, l: 78 }, dark: { s: 29, l:  6 } },
      { name: '--border',  light: { s: 37, l: 63 }, dark: { s: 28, l: 19 } },
      { name: '--border2', light: { s: 29, l: 50 }, dark: { s: 30, l: 28 } },
      { name: '--desk',    light: { s: 27, l: 48 }, dark: { s: 24, l:  4 } },

      // The inventory grid is deliberately NOT here — it keeps the palette's own
      // colours whatever the panels are tinted to.

      // `--bg` does not join the HSL ladder — it takes the panel's hue only, at
      // a fixed OKLCH lightness and chroma (`oklch` not `hsl` because perceptual
      // lightness is what "this dark" has to mean for any hue). The lightness is
      // per palette and mirrors tokens.css — the ground has to clear its own
      // panels (dark palette's sit at OKLCH 0.247, light's at 0.95).
      { name: '--bg', oklch: { light: { l: 0.32, c: 0.04 }, dark: { l: 0.25, c: 0.04 } } },
    ],
  },
};

// Every property this module may write on <html> — so a reset can REMOVE what it
// no longer sets and hand the palette back to tokens.css.
const ACCENT_MANAGED = ['--on-accent'].concat(
  Object.values(ACCENT_ROLES).flatMap(r => r.tokens.map(t => t.name))
);

// { primary: {h,s}|null, secondary: {h,s}|null, vars: { light:{}, dark:{} } }
let accentPrefs = defaultAccentPrefs();

function defaultAccentPrefs() {
  const out = { vars: { light: {}, dark: {} } };
  Object.keys(ACCENT_ROLES).forEach(role => { out[role] = null; });
  return out;
}

// The token a role is named by — its swatch, its wheel face, and what its
// family's saturations are measured against.
function roleReferenceToken(role) { return ACCENT_ROLES[role].tokens[0]; }

// =============================================================================
// COLOUR MATHS
// =============================================================================
function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(100, s)) / 100;
  l = Math.max(0, Math.min(100, l)) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rgb;
  if (h < 60)       rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else              rgb = [c, 0, x];
  return '#' + rgb.map(v => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
}

// WCAG relative luminance — "is this light or dark" has to mean this here, since
// a saturated yellow and a saturated blue at the same HSL lightness are nowhere
// near as bright as each other.
function relativeLuminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

// The OKLCH hue of an sRGB colour (sRGB → linear → LMS → OKLab → angle). NOT the
// HSL hue the wheel hands out — the two disagree by tens of degrees. Deriving it
// from the resolved panel colour keeps the ground matched to the panels.
function oklchHueOf(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const r = lin((n >> 16) & 255), g = lin((n >> 8) & 255), b = lin(n & 255);

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;

  const h = (Math.atan2(B, A) * 180) / Math.PI;
  return h < 0 ? h + 360 : h;
}

function contrastRatio(a, b) {
  const la = relativeLuminance(a), lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// Whichever of the palette's two inks reads better on this fill.
function readableInkOn(hex) {
  const css = getComputedStyle(document.documentElement);
  const ink = (css.getPropertyValue('--ink') || '#1a1206').trim();
  const paper = (css.getPropertyValue('--paper') || '#fdf6e4').trim();
  return contrastRatio(hex, ink) >= contrastRatio(hex, paper) ? ink : paper;
}

// =============================================================================
// RESOLVING AND APPLYING
// =============================================================================
// Every token a role owns, at one theme. The pick supplies the hue; each token
// keeps its own lightness, and its saturation is scaled by how saturated it is
// relative to the role's reference token, so a family keeps its shape. The
// pinned lightness also stops a strong pick going garish: `hsl(210, 100%, 91%)`
// is a pale blue tint, not a blue.
function resolveRoleTokens(role, pick, theme) {
  const tokens = ACCENT_ROLES[role].tokens;
  const refToken = tokens[0];
  const ref = refToken[theme].s;
  const out = {};

  tokens.forEach(t => {
    if (t.oklch) return; // resolved below, off the finished reference colour
    const s = ref ? pick.s * (t[theme].s / ref) : pick.s;
    out[t.name] = hslToHex(pick.h, Math.max(0, Math.min(100, s)), t[theme].l);
  });

  // Second pass: an `oklch` token reads the hue of the RESOLVED reference.
  const refHex = out[refToken.name];
  tokens.forEach(t => {
    if (!t.oklch || !refHex) return;
    const { l, c } = t.oklch[theme];
    out[t.name] = `oklch(${l} ${c} ${oklchHueOf(refHex).toFixed(1)})`;
  });

  return out;
}

// Both themes, up front — the paint path never does maths.
function computeAccentVars(prefs) {
  const out = { light: {}, dark: {} };

  ['light', 'dark'].forEach(theme => {
    const p = prefs.primary;
    if (p) {
      Object.assign(out[theme], resolveRoleTokens('primary', p, theme));
      out[theme]['--on-accent'] = readableInkOn(out[theme]['--accent']);
    }

    const s = prefs.secondary;
    if (s) {
      Object.assign(out[theme], resolveRoleTokens('secondary', s, theme));
    } else if (p) {
      // Untouched, the secondary follows the primary eight points calmer.
      Object.assign(out[theme], resolveRoleTokens(
        'secondary', { h: p.h, s: Math.max(0, p.s - 8) }, theme));
    }

    // The panels stand on their own — nothing follows them, they follow nothing.
    if (prefs.surface) Object.assign(out[theme], resolveRoleTokens('surface', prefs.surface, theme));
  });

  return out;
}

// Paint whichever half of `vars` matches the palette now showing. Also called by
// `applyTheme()`, since a theme switch changes which half applies.
function applyAccentVars() {
  const theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  const vars = (accentPrefs.vars && accentPrefs.vars[theme]) || {};
  ACCENT_MANAGED.forEach(prop => {
    if (vars[prop]) document.documentElement.style.setProperty(prop, vars[prop]);
    else document.documentElement.style.removeProperty(prop);
  });
}

// =============================================================================
// PERSISTENCE
// =============================================================================
function loadAccentPrefs() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(ACCENT_KEY)); } catch (e) { raw = null; }
  accentPrefs = sanitizeAccentPrefs(raw);
}

function sanitizeAccentPrefs(raw) {
  const out = defaultAccentPrefs();
  if (!raw || typeof raw !== 'object') return out;
  Object.keys(ACCENT_ROLES).forEach(role => {
    const v = raw[role];
    if (!v || typeof v !== 'object') return;
    const h = parseFloat(v.h), s = parseFloat(v.s);
    if (!Number.isFinite(h) || !Number.isFinite(s)) return;
    out[role] = { h: ((h % 360) + 360) % 360, s: Math.max(0, Math.min(100, s)) };
  });
  // Recomputed, not trusted — a stored map that disagreed with the two fields
  // above would paint a colour the wheel does not show.
  out.vars = computeAccentVars(out);
  return out;
}

function saveAccentPrefs() {
  try { localStorage.setItem(ACCENT_KEY, JSON.stringify(accentPrefs)); } catch (e) { /* non-fatal */ }
}

// =============================================================================
// SETTING A COLOUR
// =============================================================================
// `commit` is false while a wheel drag is in flight — the app recolours live on
// every pointermove, but only the release writes to storage.
function setAccentColor(role, h, s, { commit = true } = {}) {
  if (!ACCENT_ROLES[role]) return;
  accentPrefs[role] = { h: ((h % 360) + 360) % 360, s: Math.max(0, Math.min(100, s)) };
  accentPrefs.vars = computeAccentVars(accentPrefs);
  applyAccentVars();
  updateAppearanceUI();
  if (commit) saveAccentPrefs();
}

function clearAccentColor(role) {
  if (!ACCENT_ROLES[role]) return;
  accentPrefs[role] = null;
  accentPrefs.vars = computeAccentVars(accentPrefs);
  applyAccentVars();
  updateAppearanceUI();
  saveAccentPrefs();
}

// What the swatch is showing — the custom colour if there is one, else whatever
// tokens.css is currently painting.
function currentAccentHex(role) {
  const theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  const token = roleReferenceToken(role).name;
  const custom = accentPrefs.vars?.[theme]?.[token];
  if (custom) return custom;
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim() || '#000000';
}

// =============================================================================
// THE WHEEL
// =============================================================================
// A hue ring with saturation falling off toward a grey centre, from two
// gradients rather than a canvas so it stays crisp at any size. The one place a
// literal colour belongs in this app — a spectrum is not themed, it IS the
// colours. Built at the lightness the role will actually be given, so it previews
// the result.
let wheelRole = null;
let wheelDragging = false;

// Clamped into a band where colour still reads — a panel is L 91% on parchment
// and L 12% by candlelight, and a wheel at either is a flat disc. The swatch and
// the app itself carry the true result.
const WHEEL_FACE_MIN = 38;
const WHEEL_FACE_MAX = 62;

function wheelFaceLightness(role) {
  const theme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  const l = roleReferenceToken(role)[theme].l;
  return Math.max(WHEEL_FACE_MIN, Math.min(WHEEL_FACE_MAX, l));
}

function paintWheelFace(role) {
  const l = wheelFaceLightness(role);
  const stops = [];
  for (let h = 0; h <= 360; h += 30) stops.push(`hsl(${h} 100% ${l}%)`);
  const wheel = document.getElementById('color-wheel');
  wheel.style.background =
    `radial-gradient(circle closest-side, hsl(0 0% ${l}%), hsl(0 0% ${l}% / 0) 70%), ` +
    `conic-gradient(from 0deg, ${stops.join(', ')})`;
}

// Screen point → hue (angle clockwise from the top, where the conic-gradient
// starts) and saturation (distance out, clamped at the rim so a drag off the
// wheel keeps tracking the hue).
function wheelValueAt(clientX, clientY) {
  const wheel = document.getElementById('color-wheel');
  const r = wheel.getBoundingClientRect();
  const dx = clientX - (r.left + r.width / 2);
  const dy = clientY - (r.top + r.height / 2);
  const radius = r.width / 2;
  return {
    h: ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360,
    s: Math.max(0, Math.min(100, (Math.hypot(dx, dy) / radius) * 100)),
  };
}

function placeWheelKnob(role) {
  const knob = document.getElementById('color-wheel-knob');
  const set = accentPrefs[role];
  if (!set) { knob.classList.add('hidden'); return; }
  knob.classList.remove('hidden');
  // Back out from hue/saturation to the point that produced them.
  const rad = ((set.h - 90) * Math.PI) / 180;
  const dist = set.s / 2; // percent of the wheel's width, from the centre
  knob.style.left = `${50 + Math.cos(rad) * dist}%`;
  knob.style.top  = `${50 + Math.sin(rad) * dist}%`;
  knob.style.background = currentAccentHex(role);
}

function openColorWheel(role) {
  wheelRole = role;
  const pop = document.getElementById('color-wheel-pop');
  // Reopening on the row that is already open closes it — the swatch is a toggle.
  document.querySelectorAll('.color-row').forEach(row => {
    row.classList.toggle('open', row.dataset.role === role);
  });
  document.getElementById('wheel-title').textContent = ACCENT_ROLES[role].label;
  // Moved under the row it belongs to, so the panel reads as that row opening.
  document.querySelector(`.color-row[data-role="${role}"]`).after(pop);
  pop.classList.remove('hidden');
  paintWheelFace(role);
  placeWheelKnob(role);
  updateAppearanceUI();
}

function closeColorWheel() {
  wheelRole = null;
  document.getElementById('color-wheel-pop').classList.add('hidden');
  document.querySelectorAll('.color-row').forEach(row => row.classList.remove('open'));
}

function onWheelPointerDown(e) {
  if (!wheelRole || e.button !== 0) return;
  e.preventDefault();
  wheelDragging = true;
  const wheel = document.getElementById('color-wheel');
  wheel.setPointerCapture(e.pointerId);
  applyWheelPoint(e.clientX, e.clientY, false);
}

function onWheelPointerMove(e) {
  if (!wheelDragging) return;
  applyWheelPoint(e.clientX, e.clientY, false);
}

function onWheelPointerUp(e) {
  if (!wheelDragging) return;
  wheelDragging = false;
  applyWheelPoint(e.clientX, e.clientY, true); // the release is what is stored
}

function applyWheelPoint(x, y, commit) {
  const { h, s } = wheelValueAt(x, y);
  setAccentColor(wheelRole, h, s, { commit });
  placeWheelKnob(wheelRole);
}

// =============================================================================
// THE APPEARANCE PAGE
// =============================================================================
function updateAppearanceUI() {
  Object.keys(ACCENT_ROLES).forEach(role => {
    const swatch = document.getElementById(`color-swatch-${role}`);
    const value  = document.getElementById(`color-value-${role}`);
    const clear  = document.querySelector(`.color-clear[data-role="${role}"]`);
    if (!swatch) return;

    const hex = currentAccentHex(role);
    swatch.style.background = hex;
    swatch.setAttribute('aria-label', `${ACCENT_ROLES[role].label} colour, ${hex}`);
    if (value) {
      const custom = !!accentPrefs[role];
      value.textContent = custom ? hex : `${hex} · default`;
      value.classList.toggle('is-default', !custom);
    }
    if (clear) clear.disabled = !accentPrefs[role]; // nothing to reset when it is the default
  });

  if (wheelRole) {
    const hexEl = document.getElementById('wheel-hex');
    if (hexEl) hexEl.textContent = currentAccentHex(wheelRole);
  }
}

// The page is opened fresh each time — put the wheel away and bring the swatches
// up to date.
function openAppearanceModal() {
  closeColorWheel();
  updateThemePickerUI(getThemePreference());
  updateAppearanceUI();
  hideModal('settings-modal');
  showModal('appearance-modal');
}

// Called from `initTheme()`. Everything is wired here rather than at load time:
// theme.js is parsed first and would bind `undefined` reaching these handlers
// from its own top level.
function initAppearance() {
  loadAccentPrefs();
  applyAccentVars();

  document.getElementById('appearance-btn').addEventListener('click', openAppearanceModal);

  document.querySelectorAll('.color-swatch').forEach(btn => {
    btn.addEventListener('click', () => {
      const role = btn.dataset.role;
      if (wheelRole === role) closeColorWheel();
      else openColorWheel(role);
    });
  });

  document.querySelectorAll('.color-clear').forEach(btn => {
    btn.addEventListener('click', () => {
      clearAccentColor(btn.dataset.role);
      if (wheelRole === btn.dataset.role) placeWheelKnob(btn.dataset.role);
    });
  });

  const wheel = document.getElementById('color-wheel');
  wheel.addEventListener('pointerdown', onWheelPointerDown);
  wheel.addEventListener('pointermove', onWheelPointerMove);
  wheel.addEventListener('pointerup', onWheelPointerUp);
  wheel.addEventListener('pointercancel', onWheelPointerUp);

  document.getElementById('wheel-close').addEventListener('click', closeColorWheel);
  document.getElementById('wheel-default-btn').addEventListener('click', () => {
    if (wheelRole) clearAccentColor(wheelRole);
    if (wheelRole) placeWheelKnob(wheelRole);
  });

  updateAppearanceUI();
}
