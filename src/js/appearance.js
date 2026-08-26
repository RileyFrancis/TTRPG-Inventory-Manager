// =============================================================================
// APPEARANCE — the accent colours the app is drawn in, and the wheel that sets them
// =============================================================================
'use strict';

// Light/dark is the *palette*; this is the *colour* — the one hue everything
// gold in the app is drawn in. They are two halves of one Appearance page but
// two concerns, so light/dark stays in theme.js and the accent lives here.
//
// **What the user picks is a hue and a saturation. Never a lightness.**
// That is the whole design, and it is what keeps a custom colour readable:
// each theme already knows how light its accent has to be to sit on its own
// background — dark brown on parchment (L 33%), light gold on candlelit
// (L 56%) — so a pick supplies the *colour* and the theme supplies the
// *contrast*. A pale yellow chosen in dark mode cannot come out invisible on
// cream paper, because the light palette never uses the pale version of it.
// The wheel therefore has no lightness slider: there is nothing there to offer.
//
//   picked hsl(0, 66%)  ->  light theme  hsl(0, 66%, 33%)   a deep brick
//                       ->  dark  theme  hsl(0, 66%, 56%)   a warm coral
//
// **Both themes are resolved at pick time, not at paint time.** `vars` holds a
// finished map of CSS properties for each theme, so switching theme — or the
// inline script in index.html <head> painting before any of this has loaded —
// is a matter of reading strings out of storage, never of doing colour maths.
// That is what lets the no-flash script stay four lines instead of carrying its
// own copy of hslToHex.
//
// **Nothing has to re-render.** `rerenderThemedContent()` exists because rarity
// and coin colours get baked into inline styles; the accent never is — it is
// read straight from `var(--accent)` by 153 rules and nothing else — so setting
// the property on <html> is the entire operation. Live drag-preview is free.
//
// Stored per browser (`dnd_inventory_colors`), like the theme, the folders and
// the panel widths: it describes this browser's idea of the app, not anything
// about a character, and it must be readable before app state loads.

const ACCENT_KEY = 'dnd_inventory_colors';

// The three roles, the tokens each drives, and the saturation and lightness
// each theme wants for each of them. Every figure is a default from tokens.css
// measured back into HSL, so an untouched app and a custom colour are built the
// same way — nothing here is invented.
//
// **A role can drive a whole family, not just one token.** `surface` is the
// interesting one: panels, the page behind them, the desk under the paper and
// both border shades are one colour seen at six depths, so they move together
// and keep their ladder. The *first* token is the role's reference — it is what
// the swatch shows, what the wheel is painted at, and what the other tokens'
// saturations are measured against.
//
//   --panel    L 91   the panels themselves, the lightest step
//   --surface  L 86
//   --bg       L 78   the page behind them: the same colour, darker
//   --border   L 63
//   --border2  L 50
//   --desk     L 48   under the torn paper, darkest of all
//
// So "the background is a darker version of the panel colour" is not a rule
// applied afterwards — it is what having one hue and six lightnesses *means*.
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
      { name: '--bg',      light: { s: 42, l: 78 }, dark: { s: 29, l:  6 } },
      { name: '--border',  light: { s: 37, l: 63 }, dark: { s: 28, l: 19 } },
      { name: '--border2', light: { s: 29, l: 50 }, dark: { s: 30, l: 28 } },
      { name: '--desk',    light: { s: 27, l: 48 }, dark: { s: 24, l:  4 } },
    ],
  },
};

// Every property this module may write on <html>. Listed so a reset can *remove*
// what it no longer sets and hand the palette back to tokens.css, rather than
// leaving a stale override behind.
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

// The token a role is *named* by: the one its swatch shows, its wheel is
// painted at, and its family's saturations are measured against.
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

// WCAG relative luminance, which is what "is this light or dark" has to mean
// here: a saturated yellow and a saturated blue at the same HSL lightness are
// nowhere near as bright as each other, and picking the ink off `l` alone would
// put black text on the blue.
function relativeLuminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

function contrastRatio(a, b) {
  const la = relativeLuminance(a), lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// Whichever of the palette's two inks reads better on this fill. Read from the
// tokens rather than written out again, so there is one copy of each value.
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
// *relative to the role's reference token* — so a family keeps the shape it had
// (the desk was always the flattest step, the panel the richest) whatever hue is
// poured into it.
//
// The pinned lightness is also what stops a strong pick going garish. `s: 100`
// sounds alarming until you notice the light theme's panel is fixed at L 91%:
// `hsl(210, 100%, 91%)` is a pale blue tint, not a blue. The theme constrains
// the chroma for free, exactly as it does for the accent.
function resolveRoleTokens(role, pick, theme) {
  const tokens = ACCENT_ROLES[role].tokens;
  const ref = tokens[0][theme].s;
  const out = {};
  tokens.forEach(t => {
    const s = ref ? pick.s * (t[theme].s / ref) : pick.s;
    out[t.name] = hslToHex(pick.h, Math.max(0, Math.min(100, s)), t[theme].l);
  });
  return out;
}

// Both themes, up front. See the header: the paint path never does maths.
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
      // Untouched, the secondary follows the primary — a slightly calmer
      // version of it, which is exactly the relationship the default gold pair
      // has. Setting it explicitly is what breaks the link.
      Object.assign(out[theme], resolveRoleTokens(
        'secondary', { h: p.h, s: Math.max(0, p.s - 8) }, theme));
    }

    // The panels stand on their own: nothing follows them and they follow
    // nothing. A page tinted to match its own accent is a much louder app than
    // anyone asked for.
    if (prefs.surface) Object.assign(out[theme], resolveRoleTokens('surface', prefs.surface, theme));
  });

  return out;
}

// Paint whichever half of `vars` matches the palette now showing. Called by
// `applyTheme()` as well, since a theme switch changes which half applies.
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
  // Recomputed rather than trusted: `vars` is a cache of the two fields above,
  // and a stored map that disagreed with them would paint a colour the wheel
  // does not show.
  out.vars = computeAccentVars(out);
  return out;
}

function saveAccentPrefs() {
  try { localStorage.setItem(ACCENT_KEY, JSON.stringify(accentPrefs)); } catch (e) { /* non-fatal */ }
}

// =============================================================================
// SETTING A COLOUR
// =============================================================================
// `commit` is false while a wheel drag is in flight: the app recolours live on
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

// What the swatch for a role is showing right now — the custom colour if there
// is one, otherwise whatever tokens.css is currently painting.
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
// A hue ring with saturation falling off toward a grey centre. Hand-drawn from
// two gradients rather than a canvas, so it stays crisp at any size.
//
// **This is the one place a literal colour belongs in this app.** Everything
// else must be a token or it will be wrong in one of the two palettes — but a
// spectrum is not themed, it *is* the colours, and it means the same thing in
// both. The gradient is built at the lightness the role will actually be given,
// so the wheel is a preview of the result rather than of some nominal L 50%.
let wheelRole = null;
let wheelDragging = false;

// The wheel is drawn at the lightness the role will actually be given, so it
// previews the result — but only as far as that stays *legible*. A panel is
// L 91% on parchment and L 12% by candlelight, and a wheel at either is a flat
// white or a flat black disc with no hues to tell apart. So the face is clamped
// into a band where colour still reads, and the swatch beside the row (plus the
// app itself, which recolours live) shows the true result.
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

// Screen point → hue and saturation. Hue is the angle clockwise from the top,
// which is where `conic-gradient(from 0deg, …)` starts, so the knob always sits
// on the colour it names. Saturation is the distance out, clamped at the rim so
// a drag that leaves the wheel keeps tracking the hue instead of stopping dead.
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
  // Reopening on the row that is already open closes it, the way a disclosure
  // should — the swatch is a toggle, not a one-way door.
  document.querySelectorAll('.color-row').forEach(row => {
    row.classList.toggle('open', row.dataset.role === role);
  });
  document.getElementById('wheel-title').textContent = ACCENT_ROLES[role].label;
  // Moved under the row it belongs to, so the panel reads as that row opening
  // rather than as a floating dialog that has to be positioned and clipped.
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
    // Nothing to reset when the role is already the palette's own.
    if (clear) clear.disabled = !accentPrefs[role];
  });

  if (wheelRole) {
    const hexEl = document.getElementById('wheel-hex');
    if (hexEl) hexEl.textContent = currentAccentHex(wheelRole);
  }
}

// The page is opened fresh each time, so this is where the wheel is put away
// and the swatches are brought up to date.
function openAppearanceModal() {
  closeColorWheel();
  updateThemePickerUI(getThemePreference());
  updateAppearanceUI();
  hideModal('settings-modal');
  showModal('appearance-modal');
}

// Called from `initTheme()`, which is where the two halves of Appearance meet.
// Everything is wired here rather than at load time: theme.js is parsed first
// and would bind `undefined` if it tried to reach these handlers from its own
// top level.
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
