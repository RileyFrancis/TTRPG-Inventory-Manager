// =============================================================================
// DICE — rolling, and the three places a roll is seen
// =============================================================================
'use strict';

// A roll is one event with three audiences, and each wants a different amount
// of it:
//
//   you            the number, large, in the middle of the screen — then it
//                  flies to the corner and joins your last three
//   the table      a line in the chat log, because a roll is a thing *said*
//   everyone else  a speech bubble over your tab, so a roll is noticed without
//                  anyone having to be looking at the log
//
// **There is no `parties/<code>/rolls`.** A roll *is* a chat message — one with
// a `kind` of `'roll'` and the numbers carried beside the sentence — and that
// is the whole of the plumbing. The log is already ordered by the server,
// already subscribed by everyone holding the code, already capped at a sane
// tail, and already stamps the speaker's name on each line rather than looking
// it up when it is drawn. A second collection would need every one of those
// properties again and would still have to be interleaved with the conversation
// to be read in order. So the bubbles over the tabs ride that subscription too:
// `noteRollFeed()` is called from it, and nothing in this file talks to Firebase
// except `postRollToChat()`.
//
// Which is also why rolling **works with no campaign at all**. The big number
// and the corner stack are local; the two audiences that are other people
// simply do not happen without a table to be at.

// =============================================================================
// THE MODEL
// =============================================================================
// The faces the tray offers, in the order dice are always listed.
const DICE_FACES = [4, 6, 8, 10, 12, 20, 100];

// How many of your own rolls the corner keeps. Three is the ask, and it is also
// about as many as can fade back legibly before the oldest is invisible anyway.
const ROLL_HISTORY = 3;

// How long the number holds in the middle before it flies, and how long the
// flight takes. The dwell is what makes it read as a *result* rather than a
// flicker on the way to somewhere else.
const ROLL_DWELL_MS  = 950;
const ROLL_FLIGHT_MS = 620;

// How long another player's roll hangs over their tab: long enough to catch out
// of the corner of an eye, short enough not to sit on the tab strip. The last
// stretch of it is the fade, which the CSS owns and this file only times.
const TAB_BUBBLE_MS = 4500;
const TAB_BUBBLE_FADE_MS = 400;

// Your own rolls, oldest first — session-only, like the chat log and for the
// same reason: what you rolled is not part of a character, and nobody wants it
// restored next Tuesday. Never in the save file, never synced.
let rollHistory = [];

// A local counter, used only to match a flier to the chip it is flying to.
let rollSeq = 0;

const diceStageEl   = document.getElementById('dice-stage');
const diceHistoryEl = document.getElementById('dice-history');
const diceBubbleEl  = document.getElementById('dice-tab-bubbles');

// =============================================================================
// ROLLING
// =============================================================================
function rollOneDie(faces) {
  return 1 + Math.floor(Math.random() * faces);
}

// The one way a roll happens. Everything above it — a skill row, a saving
// throw, a die in the tray — only works out a label and a modifier.
function performRoll({ label, faces = 20, count = 1, mod = 0 }) {
  count = Math.max(1, Math.min(20, parseInt(count, 10) || 1));
  mod   = Math.max(-99, Math.min(99, parseInt(mod, 10) || 0));

  const dice = [];
  for (let i = 0; i < count; i++) dice.push(rollOneDie(faces));

  const roll = {
    id: ++rollSeq,
    label: label || count + 'd' + faces,
    faces, count, mod, dice,
    total: dice.reduce((a, b) => a + b, 0) + mod,
  };

  showOwnRoll(roll);    // the middle of the screen, then the corner
  postRollToChat(roll); // and the table, when there is one
  return roll;
}

// A natural 20 or a natural 1, and only on a single d20 — three d20s summed
// have no such thing, and calling one of them a crit would be a lie.
function rollCrit(r) {
  if (r.faces !== 20 || r.count !== 1) return '';
  if (r.dice[0] === 20) return 'crit';
  if (r.dice[0] === 1)  return 'fumble';
  return '';
}

// =============================================================================
// HOW A ROLL READS
// =============================================================================
// "14 Arcana" — the number first, because the number is what is being said and
// the label is only what it was about. That is the shape the whole feature is
// written in: the total is the large thing everywhere it appears, and the label
// rides beside or beneath it.

// "1d20 + 3" — what was asked for, with nothing of the answer in it.
function rollFormula(r) {
  const mod = r.mod ? ' ' + (r.mod > 0 ? '+' : '−') + ' ' + Math.abs(r.mod) : '';
  return r.count + 'd' + r.faces + mod;
}

// "1d20 (9) + 3" — what was actually on the dice, which is the half a total
// throws away. Shown under the label wherever there is room for it.
function rollBreakdown(r) {
  const dice = (r.dice ?? []).join(', ');
  const mod = r.mod ? ' ' + (r.mod > 0 ? '+' : '−') + ' ' + Math.abs(r.mod) : '';
  return r.count + 'd' + r.faces + ' (' + dice + ')' + mod;
}

// The plain-text form, stamped on the chat message as its `text`. Anything that
// reads the log without knowing what a roll is — an older client, a copy-paste,
// an export written later — still gets the sentence rather than a blank line.
function rollSentence(r) {
  return '🎲 ' + r.total + ' ' + r.label + ' · ' + rollBreakdown(r);
}

// =============================================================================
// 1 · THE MIDDLE OF THE SCREEN, THEN THE CORNER
// =============================================================================
// The chip is put into the corner *first* and held invisible, and the flier is
// then aimed at where it actually landed. Measuring the real destination is the
// only way the flight can end exactly on it: a computed guess drifts the moment
// the panel is resized, the stash appears, or a third chip pushes the stack up.
function showOwnRoll(roll) {
  rollHistory.push(roll);
  if (rollHistory.length > ROLL_HISTORY) rollHistory.shift();
  renderRollHistory(roll.id); // draws the newest chip, but holds it invisible
  flyRoll(roll);
}

function renderRollHistory(landingId) {
  if (!diceHistoryEl) return;
  diceHistoryEl.textContent = '';
  diceHistoryEl.classList.toggle('hidden', rollHistory.length === 0);

  const newest = rollHistory.length - 1;
  rollHistory.forEach((r, i) => {
    const chip = document.createElement('div');
    // Age, not index: the newest sits at the bottom at full strength and each
    // one behind it is a step further back. How far back is the CSS's business.
    chip.className = 'roll-chip age-' + (newest - i);
    const crit = rollCrit(r);
    if (crit) chip.classList.add(crit);
    if (r.id === landingId) chip.classList.add('landing');
    chip.dataset.rollId = r.id;

    const total = document.createElement('span');
    total.className = 'roll-chip-total';
    total.textContent = r.total;

    const label = document.createElement('span');
    label.className = 'roll-chip-label';
    label.textContent = r.label;

    chip.append(total, label);
    chip.title = r.total + ' ' + r.label + ' — ' + rollBreakdown(r);
    diceHistoryEl.appendChild(chip);
  });
}

// The big one. It is built *at rest* — `translate(-50%, -50%)` and nothing
// else — so the entrance tumble lives on the inner element instead. That keeps
// the flier's own transform free for the flight, and keeps its bounding box
// truthful at the moment the flight is measured.
function flyRoll(roll) {
  if (!diceStageEl) return;

  const flier = document.createElement('div');
  flier.className = 'roll-flier';
  const crit = rollCrit(roll);
  if (crit) flier.classList.add(crit);

  const inner = document.createElement('div');
  inner.className = 'roll-flier-inner';

  const total = document.createElement('div');
  total.className = 'roll-flier-total';
  total.textContent = roll.total;

  const label = document.createElement('div');
  label.className = 'roll-flier-label';
  label.textContent = roll.label;

  const detail = document.createElement('div');
  detail.className = 'roll-flier-detail';
  detail.textContent = rollBreakdown(roll);

  inner.append(total, label, detail);
  flier.appendChild(inner);
  diceStageEl.appendChild(flier);
  diceStageEl.classList.remove('hidden');

  setTimeout(() => landRoll(flier, roll), ROLL_DWELL_MS);
}

// Measure, then move. Both rectangles are read in the same frame and before
// anything is written, so nothing here forces a second layout.
function landRoll(flier, roll) {
  const chip = diceHistoryEl
    ? diceHistoryEl.querySelector('.roll-chip[data-roll-id="' + roll.id + '"]')
    : null;
  const from = flier.getBoundingClientRect();
  const to   = chip ? chip.getBoundingClientRect() : null;

  const finish = () => {
    flier.remove();
    // The chip is revealed by the same call that removes the flier, so the
    // number is never in two places at once, and never in neither.
    if (chip) chip.classList.remove('landing');
    if (!diceStageEl.childElementCount) diceStageEl.classList.add('hidden');
  };

  // No destination: the corner is behind the home page, or the history was
  // reset mid-flight. Fade out where it stands rather than flying at a
  // rectangle that is not there.
  if (!to || !to.width || !from.height) {
    flier.classList.add('gone');
    setTimeout(finish, 280);
    return;
  }

  const dx = (to.left + to.width  / 2) - (from.left + from.width  / 2);
  const dy = (to.top  + to.height / 2) - (from.top  + from.height / 2);
  // Scaled by *height*: the chip is far wider than it is tall relative to the
  // flier, and matching the height is what makes the number land the right size.
  const scale = Math.max(0.08, to.height / from.height);

  flier.classList.add('flying');
  flier.style.transitionDuration = ROLL_FLIGHT_MS + 'ms';
  flier.style.transform = 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px)) scale(' + scale + ')';
  flier.style.opacity = '0.2';

  // `transitionend` fires per property, and never at all if the element is not
  // painted (a background tab). The timeout is therefore the one that counts,
  // and the event only ever gets there first.
  let done = false;
  const once = () => { if (done) return; done = true; finish(); };
  flier.addEventListener('transitionend', once, { once: true });
  setTimeout(once, ROLL_FLIGHT_MS + 120);
}

// =============================================================================
// 2 · THE CHAT LOG
// =============================================================================
// The message is pushed from here rather than from chat.js so that everything
// about a roll's *shape* stays in one file; chat.js only has to know how to
// draw one. `canChat()` is the same gate an ordinary line goes through, so a
// solo player, a signed-out one and one with no campaign all fall through it
// silently — the roll still happened, it was simply not said to anybody.
function postRollToChat(r) {
  if (typeof canChat !== 'function' || !canChat()) return;

  chatFollowNewest(); // saying something is an intent to watch it land

  firebaseDb.ref('parties/' + state.party.code + '/chat').push({
    uid: ownPlayerId(),
    name: chatAuthorName(),
    kind: 'roll',
    text: rollSentence(r),
    // Flat and complete: the renderer at the other end works only from this and
    // never from a lookup, exactly as a shop entry snapshots its template.
    roll: {
      label: r.label, total: r.total,
      faces: r.faces, count: r.count, mod: r.mod, dice: r.dice,
    },
    at: firebase.database.ServerValue.TIMESTAMP,
  }).catch(() => { /* a roll that could not be said is still a roll */ });
}

// RTDB hands an array back as an array when its keys are 0…n and as an object
// when they are not. Neither is worth trusting at a call site.
function rollDiceList(roll) {
  const d = roll ? roll.dice : null;
  return Array.isArray(d) ? d : Object.values(d ?? {});
}

// Rebuilds a roll from what a chat message carries, so a remote roll and a
// local one can share every formatter above.
function rollFromMessage(m) {
  const r = m.roll ?? {};
  return {
    label: r.label || 'Roll',
    total: Number(r.total) || 0,
    faces: Number(r.faces) || 20,
    count: Number(r.count) || 1,
    mod:   Number(r.mod)   || 0,
    dice:  rollDiceList(r),
  };
}

// =============================================================================
// 3 · SPEECH BUBBLES OVER THE TABS
// =============================================================================
// Somebody else's roll should be noticed without the log being open, and the
// tab strip is already the one place every player in the party is named. So the
// roll is said *by their tab*, in a bubble that points at it.
//
// The bubbles are a **fixed layer**, not children of the tabs: `#character-tabs`
// scrolls horizontally and clips what overflows it, so a bubble hanging below a
// tab would be sliced off at the strip's own edge.
const tabBubbles = new Map(); // tab key → { total, label, crit, timer }

// null until the first chat snapshot has been seen. Joining a campaign delivers
// the whole tail at once, and every line in it is history — a bubble per line
// would be a wall of them for rolls made hours ago.
let seenRollIds = null;

function noteRollFeed(messages) {
  const first = seenRollIds === null;
  if (first) seenRollIds = new Set();
  const me = ownPlayerId();

  messages.forEach(m => {
    if (m.kind !== 'roll' || !m.roll || seenRollIds.has(m.id)) return;
    seenRollIds.add(m.id);
    if (first) return;        // the backlog is not news
    if (m.uid === me) return; // we watched our own land in the corner
    popTabBubble(m.uid, rollFromMessage(m));
  });
}

// Called when the log is torn down — leaving a session, or switching campaigns.
// Without it the next campaign's tail would read as a burst of live rolls.
function resetRollFeed() {
  seenRollIds = null;
  tabBubbles.forEach(b => clearTimeout(b.timer));
  tabBubbles.clear();
  renderTabBubbles();
}

function popTabBubble(uid, roll) {
  // A player's tab is keyed by their account id. A roll from somebody who is
  // not on the strip — a GM, or a player who has since left — has nothing to
  // point at, and `renderTabBubbles()` quietly drops it.
  const existing = tabBubbles.get(uid);
  if (existing) clearTimeout(existing.timer);

  tabBubbles.set(uid, {
    total: roll.total,
    label: roll.label,
    crit: rollCrit(roll),
    // When it was said, so a redraw can put the bubble back at the age it had
    // reached rather than starting its life over — see renderTabBubbles().
    at: Date.now(),
    timer: setTimeout(() => { tabBubbles.delete(uid); renderTabBubbles(); }, TAB_BUBBLE_MS),
  });
  renderTabBubbles();
}

// Rebuilt from the tabs each time rather than held onto: `renderCharacterTabs()`
// throws its buttons away on every roster update, so a bubble parented to one —
// or merely positioned once — would be orphaned or left pointing at nothing.
// It is called from the end of that render for exactly this reason.
function renderTabBubbles() {
  if (!diceBubbleEl) return;
  diceBubbleEl.textContent = '';
  if (!tabBubbles.size || !charTabsEl) return;

  tabBubbles.forEach((b, key) => {
    const tab = charTabsEl.querySelector('.char-tab[data-tab-key="' + CSS.escape(key) + '"]');
    if (!tab) return;
    const r = tab.getBoundingClientRect();
    if (!r.width) return; // the strip is hidden — nothing to point at

    const bubble = document.createElement('div');
    bubble.className = 'tab-bubble' + (b.crit ? ' ' + b.crit : '');

    const total = document.createElement('span');
    total.className = 'tab-bubble-total';
    total.textContent = b.total;

    const label = document.createElement('span');
    label.className = 'tab-bubble-label';
    label.textContent = b.label;

    bubble.append(total, label);
    diceBubbleEl.appendChild(bubble);

    // Measured after the text is in — a bubble is as wide as the label it
    // carries — and clamped so the rightmost tab's cannot hang off the window.
    const w = bubble.offsetWidth;
    const left = r.left + r.width / 2 - w / 2;
    const clamped = Math.max(6, Math.min(left, window.innerWidth - w - 6));
    bubble.style.left = clamped + 'px';
    bubble.style.top  = (r.bottom + 8) + 'px';
    // The tail points back at the middle of the tab even when the clamp has
    // shifted the bubble sideways, so it never points at the wrong player.
    bubble.style.setProperty('--tail-x',
      Math.max(10, Math.min(r.left + r.width / 2 - clamped, w - 10)) + 'px');

    // The bubble is rebuilt on every roster update, so its two animations are
    // started at the point in their lives the bubble has actually reached: a
    // negative delay runs one forward to where it should already be, and the
    // fade is delayed by whatever is left. Without this a heartbeat landing
    // mid-life would replay the pop and reset the countdown to leave.
    const age = Date.now() - b.at;
    bubble.style.animationDelay =
      (-age) + 'ms, ' + Math.max(0, TAB_BUBBLE_MS - TAB_BUBBLE_FADE_MS - age) + 'ms';
  });
}

// The strip scrolls and the window resizes; either moves a tab out from under
// its bubble. Both are cheap, and only ever run while a bubble is up.
window.addEventListener('resize', () => { if (tabBubbles.size) renderTabBubbles(); });
charTabsEl.addEventListener('scroll', () => { if (tabBubbles.size) renderTabBubbles(); });

// =============================================================================
// ROLLING FROM THE CHARACTER SHEET
// =============================================================================
// Every roll target on the sheet says what it is in one `data-roll` attribute,
// and this is the only thing that reads it. The modifier itself is never stored
// on the element — it is asked of the sheet at the moment of the click, so a
// roll cannot be made with a number that has since changed underneath it.
function sheetRollSpec(key) {
  const [kind, id] = key.split(':');

  if (kind === 'skill') {
    const s = SKILLS.find(x => x.id === id);
    return s ? { label: s.label, mod: skillModOf(s) } : null;
  }
  if (kind === 'save') {
    const a = ABILITIES.find(x => x.id === id);
    return a ? { label: a.label + ' Save', mod: saveModOf(id) } : null;
  }
  if (kind === 'ability') {
    const a = ABILITIES.find(x => x.id === id);
    return a ? { label: a.label + ' Check', mod: abilityModOf(id) } : null;
  }
  if (kind === 'initiative') return { label: 'Initiative', mod: initiativeBonus() };
  return null;
}

// One delegated listener for the whole sheet, like every other listener on it —
// there are twenty-five roll targets and they all do the same thing.
//
// **Deliberately not gated by `isReadOnly()`.** Rolling writes nothing to the
// character, and the roll is attributed to the *account* that clicked it rather
// than to the sheet it was read off — so a GM rolling a player's Perception is
// both honest and useful.
document.getElementById('character-sheet').addEventListener('click', e => {
  const el = e.target.closest('[data-roll]');
  if (!el) return;
  const spec = sheetRollSpec(el.dataset.roll);
  if (spec) performRoll({ label: spec.label, faces: 20, count: 1, mod: spec.mod });
});

// =============================================================================
// THE DICE TRAY
// =============================================================================
// Seven faces, built from DICE_FACES rather than written out — the same
// argument the sheet's ability groups make. The count and the modifier above
// them are read at the moment a face is clicked, so the tray keeps no state of
// its own that could fall out of step with its boxes.
const diceCountEl = document.getElementById('dice-count');
const diceModEl   = document.getElementById('dice-mod');

function buildDiceTray() {
  const box = document.getElementById('dice-faces');
  if (!box || box.childElementCount) return;

  DICE_FACES.forEach(faces => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'die-btn';
    btn.dataset.faces = faces;
    btn.title = 'Roll d' + faces;

    const face = document.createElement('span');
    face.className = 'die-face';
    face.textContent = 'd' + faces;

    btn.appendChild(face);
    btn.addEventListener('click', () => rollFromTray(faces));
    box.appendChild(btn);
  });
}

function rollFromTray(faces) {
  const count = Math.max(1, Math.min(20, parseInt(diceCountEl.value, 10) || 1));
  const mod   = Math.max(-30, Math.min(30, parseInt(diceModEl.value, 10) || 0));
  // No label but the formula: a bare handful of dice is not *about* anything,
  // and "3d6 + 1" is the most that can honestly be said it was for.
  performRoll({ label: rollFormula({ count, faces, mod }), faces, count, mod });
}

const diceClearBtn = document.getElementById('dice-clear-btn');
if (diceClearBtn) diceClearBtn.addEventListener('click', () => {
  diceCountEl.value = 1;
  diceModEl.value = 0;
});

buildDiceTray();
