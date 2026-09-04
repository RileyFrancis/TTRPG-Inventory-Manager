// =============================================================================
// CHAT — the table's conversation, in the sidebar beside the character sheet
// =============================================================================
'use strict';

// Talk belongs to the **table**, not to a character: the same argument the shops
// make. So it lives under `parties/<code>/chat`, everyone holding the code reads
// one log, and there is nothing to say with no campaign open — the tab says so
// rather than offering an input that could only talk to itself.
//
//   parties/<code>/chat/<pushId>   { uid, name, text, at }
//
// A **push id**, not a key of our own devising. RTDB's are ordered by server
// time and unique across clients without coordination, which is exactly the
// property a chat log needs and the one thing a client-side id cannot promise:
// two people typing at once must not be able to land on the same key, and the
// order they arrive in must be the order everyone reads.
//
// The log is a **read-through cache** like `state.shops`, refreshed by a
// subscription that rides along with the roster (`subscribeToChat`, called from
// `subscribeToParty`). Nothing about it is in the save file — a conversation is
// not part of a character, and every member already holds the same copy.
//
// **`name` is stamped on the message, not looked up when it is drawn.** Who said
// a thing is a fact about the moment it was said: renaming a character, or a
// player leaving the campaign entirely, must not rewrite or blank the history.
// It is the same reason a shop entry snapshots its template.

// Only the tail is subscribed. A campaign that has run for a year should not
// cost a year of messages to open a tab, and nobody scrolls past a few hundred.
const CHAT_HISTORY = 200;
const CHAT_MAX_LEN = 2000;

let partyChatRef = null;

// The messages we hold, oldest first. Not in `state`, because unlike the shops
// nothing outside this file reads them.
let chatMessages = [];

// Whether the reader is pinned to the bottom. A message arriving must not yank
// someone out of the history they scrolled up to read, and must not leave them
// stranded above the newest line when they were following along.
let chatPinnedToBottom = true;

const chatLogEl   = document.getElementById('chat-log');
const chatBodyEl  = document.getElementById('chat-body');
const chatEmptyEl = document.getElementById('chat-empty');
const chatFormEl  = document.getElementById('chat-form');
const chatInputEl = document.getElementById('chat-input');

// =============================================================================
// THE SUBSCRIPTION
// =============================================================================
function subscribeToChat(code) {
  unsubscribeFromChat();
  if (!firebaseDb) return;
  partyChatRef = firebaseDb.ref(`parties/${code}/chat`).limitToLast(CHAT_HISTORY);
  partyChatRef.on('value', snap => {
    const val = snap.val() ?? {};
    // Object key order is not a guarantee worth resting a transcript on, so the
    // push ids are sorted explicitly — they sort lexicographically into
    // chronological order, which is what they are designed for.
    chatMessages = Object.keys(val).sort().map(id => ({ id, ...val[id] }));
    renderChat();
  });
}

function unsubscribeFromChat() {
  if (partyChatRef) { partyChatRef.off(); partyChatRef = null; }
  chatMessages = [];
  chatPinnedToBottom = true;
  renderChat();
}

// =============================================================================
// SENDING
// =============================================================================
function canChat() {
  return !!(firebaseDb && state.party.active && state.party.code && isSignedIn());
}

// The name to speak under: the account's, because chat is between *players*.
// A GM has no character and would otherwise be nameless.
function chatAuthorName() {
  return accountDisplayName() || state.party.playerName || 'Someone';
}

async function sendChatMessage(text) {
  const body = text.trim().slice(0, CHAT_MAX_LEN);
  if (!body || !canChat()) return;

  // Sending is always an intent to follow the conversation, however far up the
  // reader had scrolled.
  chatPinnedToBottom = true;

  try {
    await firebaseDb.ref(`parties/${state.party.code}/chat`).push({
      uid: ownPlayerId(),
      name: chatAuthorName(),
      text: body,
      at: firebase.database.ServerValue.TIMESTAMP,
    });
  } catch (e) {
    alert('Message not sent: ' + e.message);
  }
}

// =============================================================================
// RENDERING
// =============================================================================
// Called whenever the tab is shown, so a reader arriving at Chat lands at the
// newest line rather than wherever the scroll happened to be left.
function onChatTabShown() {
  chatPinnedToBottom = true;
  // A render, not just a scroll: the first time this tab is shown the pane has
  // never been drawn at all — the sidebar boots on Browse, and Chat only exists
  // once the reader opens a character sheet. `renderChat()` scrolls for us,
  // because we have just declared ourselves pinned.
  renderChat();
}

function scrollChatToBottom() {
  chatLogEl.scrollTop = chatLogEl.scrollHeight;
}

function renderChat() {
  if (!chatLogEl) return;

  const open = canChat();
  chatBodyEl.classList.toggle('hidden', !open);
  chatEmptyEl.classList.toggle('hidden', open);

  if (!open) {
    chatEmptyEl.textContent = state.party.active
      ? 'Sign in to join the conversation.'
      : 'Chat belongs to a campaign. Open one from your home screen and the table can talk here.';
    return;
  }

  // Measured *before* the rebuild: afterwards the log is a different height and
  // the old scrollTop means nothing.
  const wasPinned = chatPinnedToBottom;

  chatLogEl.innerHTML = '';

  if (!chatMessages.length) {
    const empty = document.createElement('p');
    empty.className = 'chat-log-empty';
    empty.textContent = 'Nothing said yet.';
    chatLogEl.appendChild(empty);
    return;
  }

  const me = ownPlayerId();
  let lastUid = null;
  let lastAt = 0;

  chatMessages.forEach(m => {
    // Consecutive lines from one person inside a few minutes are one turn in the
    // conversation, so the name is said once. A gap means the conversation
    // resumed, and it is worth saying again.
    const sameSpeaker = m.uid === lastUid && Number(m.at) - lastAt < 300000;

    const row = document.createElement('div');
    row.className = 'chat-msg' + (m.uid === me ? ' own' : '') + (sameSpeaker ? ' run-on' : '');

    if (!sameSpeaker) {
      const head = document.createElement('div');
      head.className = 'chat-msg-head';

      const who = document.createElement('span');
      who.className = 'chat-msg-name';
      who.textContent = m.name || 'Someone';

      const when = document.createElement('span');
      when.className = 'chat-msg-time';
      when.textContent = formatChatTime(m.at);

      head.append(who, when);
      row.appendChild(head);
    }

    // textContent, never innerHTML. Chat is the one place in this app where
    // another player's typing is drawn in your browser every few seconds, and
    // markdown.js's sanitizer is for prose that asked to be formatted — a chat
    // line did not, so it is not parsed at all and there is nothing to escape.
    const body = document.createElement('div');
    body.className = 'chat-msg-text';
    body.textContent = m.text ?? '';
    row.appendChild(body);

    chatLogEl.appendChild(row);
    lastUid = m.uid;
    lastAt = Number(m.at) || 0;
  });

  if (wasPinned) scrollChatToBottom();
}

// Clock time for today, and the date once it is not today. A transcript read
// back the next session should say which evening a line came from.
function formatChatTime(at) {
  const ms = Number(at);
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const d = new Date(ms);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const today = new Date();
  const sameDay = d.getFullYear() === today.getFullYear() &&
                  d.getMonth() === today.getMonth() &&
                  d.getDate() === today.getDate();
  return sameDay ? time : d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' · ' + time;
}

// =============================================================================
// WIRING
// =============================================================================
chatFormEl.addEventListener('submit', e => {
  e.preventDefault();
  const text = chatInputEl.value;
  chatInputEl.value = '';
  autoGrowChatInput();
  sendChatMessage(text);
});

// Enter sends; Shift+Enter is a newline. A textarea rather than an input so the
// second of those is possible at all, and so a long message is visible while it
// is being written.
chatInputEl.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || e.shiftKey) return;
  e.preventDefault();
  chatFormEl.requestSubmit();
});

// Grows with the message to a few lines, then scrolls. Reset to `auto` first or
// the box can only ever get taller.
const CHAT_INPUT_MAX_H = 120;
function autoGrowChatInput() {
  chatInputEl.style.height = 'auto';
  chatInputEl.style.height = Math.min(chatInputEl.scrollHeight, CHAT_INPUT_MAX_H) + 'px';
}
chatInputEl.addEventListener('input', autoGrowChatInput);

// What "pinned" means, measured rather than assumed: within a line or so of the
// bottom counts as following along, so a fractional scroll position or a
// rounding difference does not unstick the log.
chatLogEl.addEventListener('scroll', () => {
  const slack = chatLogEl.scrollHeight - chatLogEl.clientHeight - chatLogEl.scrollTop;
  chatPinnedToBottom = slack < 24;
});
