// =============================================================================
// DICE — rolling, and the four places a roll is seen
// =============================================================================
'use strict';

// A roll is one event with three audiences, and each wants a different amount
// of it:
//
//   you            the number, large, in the middle of the screen — it spins,
//                  settles, then flies to the corner and joins your last three
//   the table      a line in the chat log, because a roll is a thing *said*
//   everyone else  a speech bubble over your tab, so a roll is noticed without
//                  anyone having to be looking at the log
//
// And a fourth, which is you again a moment later: **hovering a corner chip
// opens the whole working** — every die, the one advantage threw away, and each
// score and proficiency that made up the modifier.
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

// **How long a roll takes is deliberately not fixed.** The number tumbles
// through other values before it settles, and the whole business runs 1–3
// seconds — a die you can time to the millisecond has no suspense in it, and
// the same beat every time turns into a delay to sit through rather than a
// result to wait for. The last stretch is the settle: the true number, held
// still, so it is read as an answer before it is thrown to the corner.
const ROLL_SPIN_MIN_MS = 1000;
const ROLL_SPIN_MAX_MS = 3000;
const ROLL_SETTLE_MS   = 450;

// An advantage roll has a second act, so its 1-to-3 seconds are spent
// differently: the tumble is shortened by exactly what the two extra beats
// cost, rather than bolted on to the end of a full-length one. The first is how
// long both numbers stand side by side before either is judged — long enough to
// read them and see for yourself which one wins — and the second is the
// grey-out and the slide to the middle.
const ROLL_PAIR_HOLD_MS = 450;
const ROLL_RESOLVE_MS   = 520;

// However the arithmetic falls out, the tumble gets at least this much: at the
// very bottom of the range the two extra beats would otherwise eat all of it.
const ROLL_SPIN_MIN_FLOOR_MS = 320;

// The tumble's own pacing: the gap between one number and the next, at the
// start and at the very end. Fast to slow is what reads as a die losing speed.
const ROLL_TICK_FAST_MS = 40;
const ROLL_TICK_SLOW_MS = 205;

// How long the flight to the corner takes.
const ROLL_FLIGHT_MS = 620;

// How long another player's roll hangs over their tab: long enough to catch out
// of the corner of an eye, short enough not to sit on the tab strip. The last
// stretch of it is the fade, which the CSS owns and this file only times.
const TAB_BUBBLE_MS = 4500;
const TAB_BUBBLE_FADE_MS = 400;

// The two things a d20 can be rolled at instead of straight. Keyed by the value
// stored on a roll, so the map is also the set of legal modes.
const ROLL_MODES = {
  adv: { label: 'Advantage',    short: 'Adv', glyph: '▲' },
  dis: { label: 'Disadvantage', short: 'Dis', glyph: '▼' },
};

// Your own rolls, oldest first — session-only, like the chat log and for the
// same reason: what you rolled is not part of a character, and nobody wants it
// restored next Tuesday. Never in the save file, never synced.
let rollHistory = [];

// A local counter, used only to match a flier to the chip it is flying to, and
// a chip to the roll its hover detail is drawn from.
let rollSeq = 0;

const diceStageEl   = document.getElementById('dice-stage');
const diceHistoryEl = document.getElementById('dice-history');
const diceBubbleEl  = document.getElementById('dice-tab-bubbles');
const rollWheelEl   = document.getElementById('roll-wheel');
const rollDetailEl  = document.getElementById('roll-detail');

// =============================================================================
// ROLLING
// =============================================================================
function rollOneDie(faces) {
  return 1 + Math.floor(Math.random() * faces);
}

function rollPool(faces, count) {
  const out = [];
  for (let i = 0; i < count; i++) out.push(rollOneDie(faces));
  return out;
}

function poolTotal(pool) {
  return pool.reduce((a, b) => a + b, 0);
}

// The one way a roll happens. Everything above it — a skill row, a saving
// throw, a die in the tray — only works out a label, a modifier and a mode.
//
// **Advantage rolls the whole pool twice and keeps the better one**, rather
// than being special-cased to a single d20. For 1d20 that is exactly the rule
// as written; for the tray's 3d6 it is the only reading of "advantage" that
// means anything, and having one rule means the two can never disagree.
function performRoll({ label, faces = 20, count = 1, mod = 0, mode = 'normal', parts = [] }) {
  count = Math.max(1, Math.min(20, parseInt(count, 10) || 1));
  mod   = Math.max(-99, Math.min(99, parseInt(mod, 10) || 0));
  if (!ROLL_MODES[mode]) mode = 'normal';

  let dice, dropped = [], keptIndex = 0;
  if (mode === 'normal') {
    dice = rollPool(faces, count);
  } else {
    const a = rollPool(faces, count);
    const b = rollPool(faces, count);
    const keepA = mode === 'adv' ? poolTotal(a) >= poolTotal(b) : poolTotal(a) <= poolTotal(b);
    dice      = keepA ? a : b;
    dropped   = keepA ? b : a;
    // **Which side won, in the order the two were rolled.** The flier shows
    // them side by side and greys the loser, and it has to be able to put them
    // back in the order they came in: drawing the kept one first would put the
    // winner on the left every single time, which gives the answer away before
    // either number has stopped moving. Local only — nothing outside the flier
    // needs it, so it stays out of the chat payload.
    keptIndex = keepA ? 0 : 1;
  }

  const roll = {
    id: ++rollSeq,
    label: label || count + 'd' + faces,
    faces, count, mod, mode, dice, dropped, keptIndex, parts,
    total: poolTotal(dice) + mod,
  };

  showOwnRoll(roll);    // the middle of the screen, then the corner
  postRollToChat(roll); // and the table, when there is one
  return roll;
}

// A natural 20 or a natural 1, and only on a single d20 — three d20s summed
// have no such thing, and calling one of them a crit would be a lie. It is read
// off the *kept* die, which is the one that counted.
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

function rollModeLong(r)  { return ROLL_MODES[r.mode]?.label ?? ''; }
function rollModeShort(r) { return ROLL_MODES[r.mode]?.short ?? ''; }

function formatSigned(n) { return (n >= 0 ? '+' : '−') + Math.abs(n); }

// " + 3" / " − 2" / "" — the trailing half of a formula.
function modSuffix(mod) {
  return mod ? ' ' + (mod > 0 ? '+' : '−') + ' ' + Math.abs(mod) : '';
}

// "1d20 + 3" — what was asked for, with nothing of the answer in it.
function rollFormula(r) {
  return r.count + 'd' + r.faces + modSuffix(r.mod);
}

// "1d20 (9) + 3" — what was actually on the dice, which is the half a total
// throws away, plus whatever advantage discarded to get there.
function rollBreakdown(r) {
  const dropped = rollDiceList(r, 'dropped');
  let s = r.count + 'd' + r.faces + ' (' + rollDiceList(r).join(', ') + ')' + modSuffix(r.mod);
  if (dropped.length) {
    s += ' · dropped ' + (dropped.length > 1
      ? dropped.join(', ') + ' = ' + poolTotal(dropped)
      : dropped[0]);
  }
  return s;
}

// Everything under the number, in one line: what was remarkable about it, how
// it was rolled, and then the arithmetic. Shared by the flier and the chat card
// so the two cannot describe one roll differently.
function rollDetailLine(r) {
  const bits = [];
  const crit = rollCrit(r);
  if (crit === 'crit')   bits.push('Natural 20');
  if (crit === 'fumble') bits.push('Natural 1');
  const mode = rollModeLong(r);
  if (mode) bits.push(mode);
  bits.push(rollBreakdown(r));
  return bits.join(' · ');
}

// The two totals an advantage roll produced, in the order they were rolled —
// what the flier shows side by side. Each is a whole total rather than a bare
// die, so the number that wins is the number that flies to the corner: the
// reader never has to watch one figure turn into a different one.
function rollPairTotals(r) {
  const other = poolTotal(rollDiceList(r, 'dropped')) + r.mod;
  return r.keptIndex === 1 ? [other, r.total] : [r.total, other];
}

// Whether this roll is drawn as two numbers. A mode with nothing discarded is
// not — a remote roll from a client that never sent `dropped` still has to draw.
function rollIsPaired(r) {
  return !!ROLL_MODES[r.mode] && rollDiceList(r, 'dropped').length > 0;
}

// The plain-text form, stamped on the chat message as its `text`. Anything that
// reads the log without knowing what a roll is — an older client, a copy-paste,
// an export written later — still gets the sentence rather than a blank line.
function rollSentence(r) {
  return '🎲 ' + r.total + ' ' + r.label + ' · ' + rollDetailLine(r);
}

// The small Adv / Dis tag, built once and used by every surface that draws a
// roll — the corner chip, the tab bubble and the chat card — so a mode cannot
// be shown three different ways. `long` is for the flier, which has the room.
function rollModePill(r, long) {
  if (!ROLL_MODES[r.mode]) return null;
  const el = document.createElement('span');
  el.className = 'roll-mode-pill ' + r.mode;
  el.textContent = long ? rollModeLong(r) : rollModeShort(r);
  return el;
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
  hideRollDetail(); // the chip it was describing is about to be thrown away
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
    // No `title`. Hovering opens the full working instead — see
    // `showRollDetail()` — and a native tooltip would only race it.
    const pill = rollModePill(r);
    if (pill) chip.appendChild(pill);
    diceHistoryEl.appendChild(chip);
  });
}

// The big one. It is built *at rest* — `translate(-50%, -50%)` and nothing
// else — so the entrance tumble lives on the inner element instead. That keeps
// the flier's own transform free for the flight, and keeps its bounding box
// truthful at the moment the flight is measured.
//
// The **wash behind the number is the flier's own `::before`, not the inner
// one's**: it has to travel to the corner with the number (it is the ground the
// number is read against the whole way) but must not tumble with it, and a
// spinning disc of light is a different, much sillier effect. One transform
// each: the flier's carries both of them to the corner, the inner's does the
// tumble alone.
function flyRoll(roll) {
  if (!diceStageEl) return;

  // A second roll while one is still in the air supersedes it. Two numbers
  // tumbling over each other in the middle of the screen is unreadable, and the
  // older one has a chip waiting for it either way.
  [...diceStageEl.children].forEach(finishFlierNow);

  const paired = rollIsPaired(roll);

  const flier = document.createElement('div');
  flier.className = 'roll-flier spinning' + (paired ? ' paired' : '');
  // The crit class is set now but **spends the whole tumble doing nothing**:
  // the green and the red are gated on `.settled` in the CSS. A number that
  // turns green the moment it appears has told you it is a 20 before it has
  // finished deciding to be one, which is the whole of the suspense given away
  // in the first frame.
  const crit = rollCrit(roll);
  if (crit) flier.classList.add(crit);

  const inner = document.createElement('div');
  inner.className = 'roll-flier-inner';

  // One row, holding one number or two. A single roll is the same structure
  // with one child, so nothing below here has two shapes to cope with.
  const totals = document.createElement('div');
  totals.className = 'roll-flier-totals';
  // Each number is given the widest box this roll could ever need, up front and
  // for the whole of its life. A tumbling total runs through one, two and three
  // digits, and a box that grew with it would shove its neighbour sideways on
  // every tick — two numbers jittering away from each other are much harder to
  // read than two numbers changing.
  const width = totalBoxWidth(roll);
  const nums = (paired ? [0, 1] : [0]).map(() => {
    const n = document.createElement('div');
    n.className = 'roll-flier-total';
    n.style.width = width + 'ch';
    n.textContent = fakeTotal(roll);
    totals.appendChild(n);
    return n;
  });

  const label = document.createElement('div');
  label.className = 'roll-flier-label';
  label.textContent = roll.label;
  const pill = rollModePill(roll, true);
  if (pill) label.appendChild(pill);

  const detail = document.createElement('div');
  detail.className = 'roll-flier-detail';
  detail.textContent = rollDetailLine(roll);

  inner.append(totals, label, detail);
  flier.appendChild(inner);
  // Which chip this one belongs to, so a flier cut short by the next roll can
  // still reveal the right one without anybody keeping a table of the two.
  flier.__rollId = roll.id;
  diceStageEl.appendChild(flier);
  diceStageEl.classList.remove('hidden');

  spinFlier(flier, totals, nums, roll, paired);
}

// How wide a box this roll's totals need, in `ch` — which with tabular figures
// is exactly one digit. Worked out from the extremes the pool can actually
// reach rather than from the number in hand, so the box is right on the first
// tick and never changes again.
//
// A **fixed** width rather than a minimum: a font whose digits are not truly
// tabular could still overrun a minimum and start the jitter again, whereas an
// overrun of a fixed box spills evenly either side of centred text and moves
// nothing. The sign gets a fraction of a digit, since a modifier can drag a
// total below zero and a minus is narrower than a numeral.
function totalBoxWidth(r) {
  const hi = r.count * r.faces + r.mod;
  const lo = r.count + r.mod;
  const digits = n => String(Math.abs(n)).length;
  return Math.max(digits(hi), digits(lo)) + (lo < 0 || hi < 0 ? 0.6 : 0);
}

// A plausible number to show on the way past: the same pool, rolled again. Made
// the honest way rather than from a range, so a 3d6 + 2 never flashes a 4 it
// could not have produced and a d100 tumbles through three digits like a d100.
function fakeTotal(roll) {
  return poolTotal(rollPool(roll.faces, roll.count)) + roll.mod;
}

// The tumble. Numbers arrive fast and then further and further apart, which is
// what a die losing speed looks like; the gap is eased on `t²` so almost all of
// the slowing happens at the end, where it is the suspense rather than a wait.
//
// A `setTimeout` chain rather than rAF, deliberately: a background tab stops
// painting and stops rAF entirely, and a roll thrown in one has to still land
// in the corner rather than hang there forever. Throttled timers make the
// tumble slower and coarser in a tab nobody is looking at, which is exactly
// what should happen to it.
function spinFlier(flier, totalsEl, nums, roll, paired) {
  // The two extra beats an advantage roll needs come out of the tumble rather
  // than being added after it, so the whole thing still runs the 1–3 seconds a
  // straight roll does.
  const whole = ROLL_SPIN_MIN_MS + Math.random() * (ROLL_SPIN_MAX_MS - ROLL_SPIN_MIN_MS);
  const beats = paired ? ROLL_PAIR_HOLD_MS + ROLL_RESOLVE_MS : ROLL_SETTLE_MS;
  const spinMs = Math.max(ROLL_SPIN_MIN_FLOOR_MS, whole - beats);
  const start = performance.now();
  let timer = null;

  const tick = () => {
    const t = Math.min(1, (performance.now() - start) / spinMs);
    if (t >= 1) { lock(); return; }
    // Both sides tumble independently — they are two separate dice, and two
    // numbers changing in lockstep would look like one number drawn twice.
    nums.forEach(n => { n.textContent = fakeTotal(roll); });
    timer = setTimeout(tick, ROLL_TICK_FAST_MS + (ROLL_TICK_SLOW_MS - ROLL_TICK_FAST_MS) * t * t);
  };

  // Both dice have stopped. For a straight roll that is also the answer; for an
  // advantage roll the two numbers now stand side by side, undecided, for long
  // enough that the reader can see for themselves which one is going to win.
  const lock = () => {
    const finals = paired ? rollPairTotals(roll) : [roll.total];
    nums.forEach((n, i) => { n.textContent = finals[i]; });
    flier.classList.remove('spinning');
    flier.classList.add('locked');
    timer = paired
      ? setTimeout(resolve, ROLL_PAIR_HOLD_MS)
      : setTimeout(settle, 0);
  };

  // The judgement: the loser greys out and shrinks where it stands, and the
  // winner slides into the middle of the row and becomes the roll.
  const resolve = () => {
    const loser = nums[roll.keptIndex === 0 ? 1 : 0];
    const winner = nums[roll.keptIndex];
    loser.classList.add('dropped');
    centreWinner(totalsEl, winner);
    // A roll thrown in the first moment of a page view is measured in the
    // fallback font, because the display face has not arrived yet — and digit
    // widths differ enough to leave the winner visibly off centre. Nothing else
    // here waits on fonts; this one measurement re-runs when they land, and
    // `document.fonts.ready` is already resolved every time after the first.
    if (document.fonts && document.fonts.status !== 'loaded') {
      document.fonts.ready.then(() => centreWinner(totalsEl, winner));
    }
    settle();
  };

  // The answer is final. Only now does the detail line appear — it names every
  // die, so showing it earlier would give the answer away — and only now is a
  // natural 20 or a natural 1 allowed its colour.
  const settle = () => {
    flier.classList.add('settled');
    timer = setTimeout(() => landRoll(flier, roll), paired ? ROLL_RESOLVE_MS : ROLL_SETTLE_MS);
  };

  // What "stop what you are doing" means for this flier, whichever part of its
  // life it is in. Held on the element so the next roll can reach it without
  // this file keeping a list; the caller removes the element straight after, so
  // there is nothing to tidy but the timer.
  flier.__finishNow = () => clearTimeout(timer);

  tick();
}

// Slides the surviving number into the middle of the row. Measured rather than
// computed: the two numbers are as wide as their own digits, so where the
// middle is depends on what was rolled. It moves by transform alone, so the row
// never reflows and the flier's box — which the flight is measured against a
// moment later — does not move under it.
//
// **`offsetLeft` and `offsetWidth`, not `getBoundingClientRect()`.** The rect is
// the *transformed* one, and both of these elements sit under the entrance
// tumble, which scales the whole inner block. Read through a rect, the answer
// comes back multiplied by whatever the tumble happened to be at — and the
// tumble only reliably finishes before this runs by a couple of hundred
// milliseconds. Offsets are layout values, so they are the same answer whatever
// is being done to the pixels above them.
//
// Both offsets are relative to `.roll-flier`, the nearest positioned ancestor,
// so the difference between them is meaningful. The transform is cleared first
// so the reading is of where the number *lives* rather than where a previous
// call put it, which is what makes this safe to run twice.
function centreWinner(totalsEl, winner) {
  winner.style.transform = '';
  const rowCentre = totalsEl.offsetLeft + totalsEl.offsetWidth / 2;
  const winCentre = winner.offsetLeft + winner.offsetWidth / 2;
  winner.style.transform = 'translateX(' + (rowCentre - winCentre) + 'px)';
}

// Used when a new roll supersedes one still in the air: no flight, no fade —
// the number simply appears in the chip that was already waiting for it.
function finishFlierNow(flier) {
  flier.__finishNow?.();
  const id = flier.__rollId;
  flier.remove();
  if (id !== undefined) revealChip(id);
  if (!diceStageEl.childElementCount) diceStageEl.classList.add('hidden');
}

function revealChip(rollId) {
  diceHistoryEl
    ?.querySelector('.roll-chip[data-roll-id="' + rollId + '"]')
    ?.classList.remove('landing');
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
    //
    // **`parts` is deliberately not sent.** It is what the *sheet* knew at the
    // moment of the roll — which ability, which proficiency, off what score —
    // and it exists for the hover detail on your own corner chips. Nobody else
    // is offered that, so shipping every roller's ability scores into a shared
    // log would be a payload nothing reads.
    roll: {
      label: r.label, total: r.total, mode: r.mode,
      faces: r.faces, count: r.count, mod: r.mod,
      dice: r.dice, dropped: r.dropped,
    },
    at: firebase.database.ServerValue.TIMESTAMP,
  }).catch(() => { /* a roll that could not be said is still a roll */ });
}

// RTDB hands an array back as an array when its keys are 0…n and as an object
// when they are not — and drops it entirely when it is empty, which `dropped`
// is on every ordinary roll. Neither is worth trusting at a call site.
function rollDiceList(roll, key) {
  const d = roll ? roll[key ?? 'dice'] : null;
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
    mode:  ROLL_MODES[r.mode] ? r.mode : 'normal',
    dice:    rollDiceList(r),
    dropped: rollDiceList(r, 'dropped'),
    parts: [],
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
const tabBubbles = new Map(); // tab key → { total, label, crit, mode, at, timer }

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
    mode: roll.mode,
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
    const pill = rollModePill(b);
    if (pill) bubble.appendChild(pill);
    diceBubbleEl.appendChild(bubble);

    // Measured after the text is in — a bubble is as wide as the label it
    // carries — and clamped so the rightmost tab's cannot hang off the window.
    const w = bubble.offsetWidth;
    const clamped = Math.max(6, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 6));
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
// 4 · THE WORKING, ON HOVER
// =============================================================================
// A total is an answer with its reasoning thrown away, and the reasoning is
// exactly what gets argued about at a table. So hovering a chip in the corner
// opens the whole of it: every die face, the pool advantage discarded, and each
// score and proficiency that went into the modifier — the *raw* numbers, not
// the one they add up to.
//
// This is why `parts` is collected at roll time rather than worked out here.
// The sheet moves: a level gained or a proficiency ticked between the roll and
// the hover would otherwise rewrite the history of a roll already made.
function showRollDetail(chip) {
  const roll = rollHistory.find(r => String(r.id) === chip.dataset.rollId);
  if (!roll || !rollDetailEl) return;

  rollDetailEl.textContent = '';

  const head = document.createElement('div');
  head.className = 'roll-detail-head';
  const name = document.createElement('span');
  name.className = 'roll-detail-name';
  name.textContent = roll.label;
  head.appendChild(name);
  const pill = rollModePill(roll);
  if (pill) head.appendChild(pill);
  rollDetailEl.appendChild(head);

  // Each die on its own line, kept ones first. A dropped pool is drawn the same
  // way and then struck through: what advantage did is only legible if the
  // thing it discarded is shown beside what it kept.
  const dice = document.createElement('div');
  dice.className = 'roll-detail-group';
  rollDiceList(roll).forEach(v => dice.appendChild(
    rollDetailRow('d' + roll.faces, '', String(v), rollDieRowClass(roll, v))));
  rollDiceList(roll, 'dropped').forEach(v => dice.appendChild(
    rollDetailRow('d' + roll.faces, roll.mode === 'adv' ? 'lower' : 'higher',
                  String(v), 'dropped')));
  rollDetailEl.appendChild(dice);

  // Where the modifier came from. An empty `parts` — a bare tray roll with no
  // modifier — simply has no group, rather than a heading over nothing.
  const parts = (roll.parts ?? []).filter(p => p);
  if (parts.length) {
    const box = document.createElement('div');
    box.className = 'roll-detail-group';
    parts.forEach(p => box.appendChild(
      rollDetailRow(p.label, p.note ?? '', formatSigned(p.value))));
    rollDetailEl.appendChild(box);
  }

  const foot = document.createElement('div');
  foot.className = 'roll-detail-group total';
  foot.appendChild(rollDetailRow('Total', rollFormula(roll), String(roll.total)));
  rollDetailEl.appendChild(foot);

  rollDetailEl.classList.remove('hidden');
  positionRollDetail(chip);
}

// A natural 20 or a natural 1 is worth marking on the die itself, not only on
// the card as a whole — with three dice in the pool it is the only way to see
// which one it was.
function rollDieRowClass(roll, value) {
  if (roll.faces !== 20) return '';
  if (value === 20) return 'crit';
  if (value === 1)  return 'fumble';
  return '';
}

function rollDetailRow(label, note, value, cls) {
  const row = document.createElement('div');
  row.className = 'roll-detail-row' + (cls ? ' ' + cls : '');

  const l = document.createElement('span');
  l.className = 'roll-detail-label';
  l.textContent = label;

  const n = document.createElement('span');
  n.className = 'roll-detail-note';
  n.textContent = note;

  const v = document.createElement('span');
  v.className = 'roll-detail-value';
  v.textContent = value;

  row.append(l, n, v);
  return row;
}

// To the *left* of the chip, and bottom-aligned with it. The stack lives in the
// bottom-right corner, so there is room on exactly one side and below it there
// is none at all; clamped to the window for the case where the panels have been
// dragged narrow enough that there is not.
function positionRollDetail(chip) {
  const c = chip.getBoundingClientRect();
  const d = rollDetailEl.getBoundingClientRect(); // measurable now it is shown
  const left = Math.max(8, Math.min(c.left - d.width - 10, window.innerWidth - d.width - 8));
  const top  = Math.max(8, Math.min(c.bottom - d.height, window.innerHeight - d.height - 8));
  rollDetailEl.style.left = left + 'px';
  rollDetailEl.style.top  = top + 'px';
}

function hideRollDetail() {
  if (!rollDetailEl) return;
  rollDetailEl.classList.add('hidden');
  rollDetailEl.textContent = '';
}

// Delegated, because the chips are rebuilt on every roll while the container is
// static markup that outlives them. `pointerover` rather than `mouseenter` so
// moving between two chips swaps the card instead of needing to leave first.
diceHistoryEl.addEventListener('pointerover', e => {
  const chip = e.target.closest('.roll-chip');
  if (chip) showRollDetail(chip);
});
diceHistoryEl.addEventListener('pointerleave', hideRollDetail);

// =============================================================================
// ADVANTAGE AND DISADVANTAGE — the press-and-hold wheel
// =============================================================================
// Press and hold a modifier or a die, and two options open either side of the
// cursor; slide onto one and let go to roll it that way. Letting go without
// leaving the middle rolls straight, so the gesture costs an ordinary click
// nothing — which is the whole reason it is a hold rather than a modifier key
// or a third button beside every one of the sheet's twenty-five roll targets.
//
// **Disadvantage is on the left and advantage on the right**, because that is
// where they are on a number line and there is nothing else to go on.

// How long a press has to be held before the wheel opens on its own, and how
// far the pointer has to move to open it sooner. The second is what keeps a
// decisive flick from feeling ignored while the timer is still counting.
const WHEEL_HOLD_MS = 180;
const WHEEL_REACH   = 9;

// How far from the origin counts as having chosen a side. Wide enough that a
// hand shaking on the button is still a straight roll.
const WHEEL_DEADZONE = 26;

// The live gesture, or null. One at a time by construction: a second pointer
// going down cancels the first rather than racing it.
let rollGesture = null;

// When a roll was last made by the pointer flow, so the `click` that follows
// can be ignored. Keyboard-driven clicks (Enter or Space on the button) arrive
// with no pointer sequence in front of them and are the only ones this lets
// through — which is what keeps every roll target reachable from the keyboard.
let lastPointerRollAt = 0;

function beginRollGesture(e, el, spec) {
  if (e.button !== 0) return;
  finishRollGesture(false);
  if (!spec()) return; // nothing to roll — an unknown key, or a stale target

  rollGesture = {
    spec, el, mode: 'normal', shown: false,
    x0: e.clientX, y0: e.clientY, pointerId: e.pointerId,
    timer: setTimeout(openRollWheel, WHEEL_HOLD_MS),
  };
  // Captured so the pointer can leave the button — which it must, since the
  // options are further away than the button is wide — without the gesture
  // ending or another element claiming the drag.
  try { el.setPointerCapture(e.pointerId); } catch (_) { /* no capture, still works */ }
}

// The wheel opens *on* the cursor, and is nudged only as far as it must be to
// stay on screen. A die at the right-hand edge of the window has barely fifty
// pixels beside it, which is why the two options are small — the further the
// wheel has to be shifted to fit, the further the cursor sits from the hub it
// is being measured against, and the shift is a lie about where the middle is.
// Small options make that lie small, and the caption under the hub is what
// spells out in full what the two abbreviations mean.
function openRollWheel() {
  if (!rollGesture || rollGesture.shown) return;
  rollGesture.shown = true;

  // How far the wheel reaches, read from the CSS that draws it rather than
  // written out again here. One source of truth: change an option's width in
  // the stylesheet and the clamp follows it.
  const cs = getComputedStyle(rollWheelEl);
  const reachX = parseFloat(cs.getPropertyValue('--wheel-gap')) +
                 parseFloat(cs.getPropertyValue('--wheel-w'));
  const reachY = parseFloat(cs.getPropertyValue('--wheel-h')) / 2;
  const pad = 6;

  rollWheelEl.style.setProperty('--wx',
    Math.max(reachX + pad, Math.min(rollGesture.x0, window.innerWidth - reachX - pad)) + 'px');
  rollWheelEl.style.setProperty('--wy',
    Math.max(reachY + pad, Math.min(rollGesture.y0, window.innerHeight - reachY - pad)) + 'px');

  rollWheelEl.classList.remove('hidden');
  paintRollWheel();
}

function paintRollWheel() {
  const mode = rollGesture?.mode ?? 'normal';
  rollWheelEl.querySelectorAll('.roll-wheel-opt').forEach(o => {
    o.classList.toggle('active', o.dataset.mode === mode);
  });
  rollWheelEl.classList.toggle('picked', mode !== 'normal');
  // Letting go in the middle is a real choice, not the absence of one, so it is
  // named as plainly as the other two.
  rollWheelEl.querySelector('.roll-wheel-caption').textContent =
    ROLL_MODES[mode]?.label ?? 'Straight roll';
}

// `roll` is false for the ways a gesture ends without one — Escape, a cancelled
// pointer, or a fresh press landing on top of it. `lastPointerRollAt` is
// stamped either way: the browser still delivers a `click` after a press the
// user backed out of, and that click must not roll what Escape just refused.
function finishRollGesture(roll) {
  const g = rollGesture;
  if (!g) return;
  rollGesture = null;

  clearTimeout(g.timer);
  rollWheelEl.classList.add('hidden');
  rollWheelEl.classList.remove('picked');
  try { g.el.releasePointerCapture(g.pointerId); } catch (_) { /* never captured */ }

  lastPointerRollAt = Date.now();
  // The spec is read *now* rather than at press time, so a roll always uses the
  // modifier the sheet is showing at the moment it is let go.
  if (roll) performRoll({ ...g.spec(), mode: g.mode });
}

window.addEventListener('pointermove', e => {
  if (!rollGesture) return;
  const dx = e.clientX - rollGesture.x0;
  const dy = e.clientY - rollGesture.y0;
  if (!rollGesture.shown && Math.hypot(dx, dy) > WHEEL_REACH) openRollWheel();
  if (!rollGesture.shown) return;
  rollGesture.mode = Math.abs(dx) < WHEEL_DEADZONE ? 'normal' : (dx < 0 ? 'dis' : 'adv');
  paintRollWheel();
});

window.addEventListener('pointerup',     () => finishRollGesture(true));
window.addEventListener('pointercancel', () => finishRollGesture(false));
window.addEventListener('keydown', e => {
  if (e.key === 'Escape' && rollGesture) finishRollGesture(false);
});

// The keyboard's way in, and the fallback for any pointer sequence that did not
// produce a roll of its own.
function rollFromClick(spec) {
  if (Date.now() - lastPointerRollAt < 400) return;
  const s = spec();
  if (s) performRoll({ ...s, mode: 'normal' });
}

// =============================================================================
// ROLLING FROM THE CHARACTER SHEET
// =============================================================================
// Every roll target on the sheet says what it is in one `data-roll` attribute,
// and this is the only thing that reads it. The modifier itself is never stored
// on the element — it is asked of the sheet at the moment of the gesture, so a
// roll cannot be made with a number that has since changed underneath it.
//
// `parts` is the same answer taken apart: the ability the modifier came off,
// the score behind it, and the proficiency added to it. It is what the corner's
// hover detail shows, and it has to be captured here because only the sheet
// knows it — by the time a chip is hovered, the roll is history.
function sheetRollSpec(key) {
  const [kind, id] = key.split(':');
  const pb = proficiencyBonus();
  const ability = a => ({
    label: ABILITIES.find(x => x.id === a).label,
    value: abilityModOf(a),
    note: 'score ' + abilityScoreOf(a),
  });

  if (kind === 'skill') {
    const s = SKILLS.find(x => x.id === id);
    if (!s) return null;
    const level = skillProfOf(s.id);
    return {
      label: s.label, faces: 20, count: 1, mod: skillModOf(s),
      parts: [
        ability(s.ability),
        level ? { label: level === PROF_EXPERTISE ? 'Expertise' : 'Proficiency', value: pb * level } : null,
      ].filter(Boolean),
    };
  }
  if (kind === 'save') {
    const a = ABILITIES.find(x => x.id === id);
    if (!a) return null;
    return {
      label: a.label + ' Save', faces: 20, count: 1, mod: saveModOf(id),
      parts: [
        ability(id),
        saveProfOf(id) ? { label: 'Proficiency', value: pb } : null,
      ].filter(Boolean),
    };
  }
  if (kind === 'ability') {
    const a = ABILITIES.find(x => x.id === id);
    if (!a) return null;
    return { label: a.label + ' Check', faces: 20, count: 1, mod: abilityModOf(id), parts: [ability(id)] };
  }
  if (kind === 'initiative') {
    return { label: 'Initiative', faces: 20, count: 1, mod: initiativeBonus(), parts: [ability('dex')] };
  }
  return null;
}

// One delegated pair for the whole sheet, like every other listener on it —
// there are twenty-five roll targets and they all do the same thing.
//
// **Deliberately not gated by `isReadOnly()`.** Rolling writes nothing to the
// character, and the roll is attributed to the *account* that clicked it rather
// than to the sheet it was read off — so a GM rolling a player's Perception is
// both honest and useful.
const sheetRollEl = document.getElementById('character-sheet');

sheetRollEl.addEventListener('pointerdown', e => {
  const el = e.target.closest('[data-roll]');
  if (el) beginRollGesture(e, el, () => sheetRollSpec(el.dataset.roll));
});

sheetRollEl.addEventListener('click', e => {
  const el = e.target.closest('[data-roll]');
  if (el) rollFromClick(() => sheetRollSpec(el.dataset.roll));
});

// =============================================================================
// THE DICE TRAY
// =============================================================================
// Seven faces, built from DICE_FACES rather than written out — the same
// argument the sheet's ability groups make. The count and the modifier above
// them are read at the moment a face is let go, so the tray keeps no state of
// its own that could fall out of step with its boxes.
const diceCountEl = document.getElementById('dice-count');
const diceModEl   = document.getElementById('dice-mod');
const diceFacesEl = document.getElementById('dice-faces');

function trayRollSpec(faces) {
  const count = Math.max(1, Math.min(20, parseInt(diceCountEl.value, 10) || 1));
  const mod   = Math.max(-30, Math.min(30, parseInt(diceModEl.value, 10) || 0));
  // No label but the formula: a bare handful of dice is not *about* anything,
  // and "3d6 + 2" is the most that can honestly be said it was for.
  return {
    label: rollFormula({ count, faces, mod }),
    faces, count, mod,
    parts: mod ? [{ label: 'Modifier', value: mod }] : [],
  };
}

function buildDiceTray() {
  if (!diceFacesEl || diceFacesEl.childElementCount) return;

  DICE_FACES.forEach(faces => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'die-btn';
    btn.dataset.faces = faces;
    btn.title = 'Roll d' + faces + ' — hold and slide for advantage';

    const face = document.createElement('span');
    face.className = 'die-face';
    face.textContent = 'd' + faces;

    btn.appendChild(face);
    diceFacesEl.appendChild(btn);
  });
}

// Delegated for the same reason the sheet's are: the gesture is identical, and
// one pair of listeners cannot drift from another the way seven pairs can.
diceFacesEl.addEventListener('pointerdown', e => {
  const btn = e.target.closest('.die-btn');
  if (btn) beginRollGesture(e, btn, () => trayRollSpec(Number(btn.dataset.faces)));
});

diceFacesEl.addEventListener('click', e => {
  const btn = e.target.closest('.die-btn');
  if (btn) rollFromClick(() => trayRollSpec(Number(btn.dataset.faces)));
});

const diceClearBtn = document.getElementById('dice-clear-btn');
if (diceClearBtn) diceClearBtn.addEventListener('click', () => {
  diceCountEl.value = 1;
  diceModEl.value = 0;
});

buildDiceTray();
