// =============================================================================
// MARKDOWN — the prose sections' formatting, and the sanitizer that lands it
// =============================================================================
'use strict';

// The character sheet's written sections (Backstory & Personality, Appearance)
// are Markdown, and **raw HTML in them is deliberately allowed** — the point is
// that a player can reach past what this renderer offers and format something
// the way they want it.
//
// **This is the only place in the app that turns a string into markup.**
// Everywhere else builds DOM with `createElement` and `textContent`, which
// cannot inject anything. So the safety of the whole feature is the sanitizer
// at the bottom of this file, and it is not optional:
//
//   A character sheet is not private. Party sync copies it to Firebase, and
//   every other member of the party — and the GM — renders it in their own
//   browser. Unsanitized, a `<script>` or an `onerror=` in a player's backstory
//   would run on the GM's machine, against the GM's signed-in Firebase session.
//
// So the rule is: **formatting is allowed, behaviour is not.** Tags that lay
// text out are kept; anything that can execute, fetch, navigate on its own or
// collect input is dropped. `<b>`, `<span style>` and `<table>` all work.
// `<script>`, `<iframe>`, `onclick=` and `javascript:` do not, and are removed
// without comment rather than escaped into visible noise.
//
// No dependency, because the app has none. What is implemented is the common
// half of Markdown — headings, emphasis, lists, quotes, code, links, images,
// rules. Tables are *not* parsed from pipe syntax; a `<table>` written by hand
// is passed through, which is the escape hatch for everything not listed here.

// =============================================================================
// THE ENTRY POINT
// =============================================================================
// Renders `src` into `el`, replacing what was there. The two steps are kept
// separate below — text to markup, then markup to a scrubbed fragment — but no
// caller should ever run only the first.
function renderMarkdownInto(el, src) {
  el.textContent = '';
  el.appendChild(markdownToFragment(src));
}

function markdownToFragment(src) {
  return sanitizeHTML(markdownToHTML(src));
}

// =============================================================================
// BLOCKS
// =============================================================================
const MD_LIST_RE = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;

function markdownToHTML(src) {
  const lines = String(src ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i++; continue; }

    // ── Fenced code ── everything to the closing fence, verbatim.
    const fence = line.match(/^\s{0,3}(```+|~~~+)\s*([\w-]*)\s*$/);
    if (fence) {
      const close = fence[1][0];
      const body = [];
      i++;
      while (i < lines.length && !new RegExp('^\\s{0,3}' + close + '{3,}\\s*$').test(lines[i])) {
        body.push(lines[i]); i++;
      }
      i++; // the closing fence, or the end of the text
      const lang = fence[2] ? ` class="language-${fence[2].replace(/[^\w-]/g, '')}"` : '';
      out.push(`<pre><code${lang}>${escapeHTML(body.join('\n'))}</code></pre>`);
      continue;
    }

    // ── Horizontal rule ── before headings, so `---` is never a stray heading.
    if (/^\s{0,3}([-*_])\s*(?:\1\s*){2,}$/.test(line)) { out.push('<hr>'); i++; continue; }

    // ── ATX heading ──
    const h = line.match(/^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (h) {
      const n = h[1].length;
      out.push(`<h${n}>${inlineMarkdown(h[2])}</h${n}>`);
      i++;
      continue;
    }

    // ── Blockquote ── the marker is stripped and what is left is Markdown in
    // its own right, so a quote can hold a list or a heading.
    if (/^\s{0,3}>/.test(line)) {
      const body = [];
      while (i < lines.length && /^\s{0,3}>/.test(lines[i])) {
        body.push(lines[i].replace(/^\s{0,3}>\s?/, '')); i++;
      }
      out.push(`<blockquote>${markdownToHTML(body.join('\n'))}</blockquote>`);
      continue;
    }

    // ── List ──
    if (MD_LIST_RE.test(line)) {
      const [items, next] = collectListItems(lines, i);
      out.push(buildList(items, 0, items[0].indent)[0]);
      i = next;
      continue;
    }

    // ── A raw HTML block ── a line opening with a tag hands the rest of the
    // paragraph over untouched, so a hand-written <table> survives intact
    // instead of being wrapped in a <p> and inline-formatted.
    if (/^\s{0,3}<[a-zA-Z!/]/.test(line)) {
      const body = [];
      while (i < lines.length && lines[i].trim()) { body.push(lines[i]); i++; }
      out.push(body.join('\n'));
      continue;
    }

    // ── Paragraph ── to the next blank line or block opener.
    const para = [];
    while (i < lines.length && lines[i].trim()
           && !MD_LIST_RE.test(lines[i])
           && !/^\s{0,3}(#{1,6}\s|>|```|~~~|<[a-zA-Z!/])/.test(lines[i])
           && !/^\s{0,3}([-*_])\s*(?:\1\s*){2,}$/.test(lines[i])) {
      para.push(lines[i]); i++;
    }

    // **The loop above must always consume something.** The tests that stop a
    // paragraph are looser than the ones that open a block — "```js extra" is
    // not a fence this parser recognises, but it does stop a paragraph — so a
    // line can fall through every branch and leave `i` where it was. That is a
    // hang, on text a player is allowed to type. Whatever reaches here with
    // nothing collected is taken as one line of paragraph, which both advances
    // and shows the writer what they wrote.
    if (!para.length) { para.push(lines[i]); i++; }

    out.push(`<p>${inlineMarkdown(para.join('\n'))}</p>`);
  }

  return out.join('\n');
}

// A run of list lines, flattened with their indent depth. A line that is
// indented but is not itself an item is a continuation of the one above it —
// which is what lets a bullet carry a second line without breaking the list.
function collectListItems(lines, start) {
  const items = [];
  let i = start;

  while (i < lines.length) {
    const m = lines[i].match(MD_LIST_RE);
    if (!m) break;
    items.push({
      indent: m[1].replace(/\t/g, '    ').length,
      ordered: /\d/.test(m[2]),
      text: m[3],
    });
    i++;
    while (i < lines.length && lines[i].trim()
           && !MD_LIST_RE.test(lines[i]) && /^\s{2,}\S/.test(lines[i])) {
      items[items.length - 1].text += '\n' + lines[i].trim();
      i++;
    }
  }
  return [items, i];
}

// Nesting is by indent: a deeper item becomes a list inside the item above it.
// Returns the html and where it stopped, so the caller can carry on from there.
function buildList(items, pos, indent) {
  const ordered = items[pos].ordered;
  const parts = [];

  while (pos < items.length && items[pos].indent >= indent) {
    if (items[pos].indent > indent) {
      if (!parts.length) break;             // over-indented with nothing to nest under
      const [inner, next] = buildList(items, pos, items[pos].indent);
      parts[parts.length - 1] += inner;
      pos = next;
      continue;
    }
    if (items[pos].ordered !== ordered) break; // a bullet list ends an ordered one
    parts.push(inlineMarkdown(items[pos].text));
    pos++;
  }

  const tag = ordered ? 'ol' : 'ul';
  return [`<${tag}>${parts.map(p => `<li>${p}</li>`).join('')}</${tag}>`, pos];
}

// =============================================================================
// INLINE
// =============================================================================
// Code spans and backslash escapes are lifted out first and put back last, so
// nothing inside them is formatted and `\*` stays an asterisk.
//
// The parked text is stood in for by `@@MD<n>@@`. A sentinel has to be
// something the writer will not type, and a printable one is chosen over a
// control character deliberately: a NUL in a source file is invisible in a diff
// and does not survive every editor. If someone does write `@@MD0@@` in a
// backstory the worst case is that it comes out as one of their own code spans,
// which is cosmetic.
function inlineMarkdown(text) {
  const held = [];
  const hold = s => `@@MD${held.push(s) - 1}@@`;

  let s = String(text)
    .replace(/`([^`]+)`/g, (m, code) => hold(`<code>${escapeHTML(code)}</code>`))
    .replace(/\\([\\`*_{}\[\]()#+\-.!~>])/g, (m, ch) => hold(escapeHTML(ch)));

  // Images before links — the syntax differs by one leading character.
  s = s.replace(/!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+"([^"]*)")?\s*\)/g,
    (m, alt, src, title) =>
      `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}"${title ? ` title="${escapeAttr(title)}"` : ''}>`);

  s = s.replace(/\[([^\]]+)\]\(\s*([^)\s]+)(?:\s+"([^"]*)")?\s*\)/g,
    (m, label, href, title) =>
      `<a href="${escapeAttr(href)}"${title ? ` title="${escapeAttr(title)}"` : ''}>${label}</a>`);

  // `**` before `*`, so the longer marker wins. The `_` forms additionally
  // refuse to fire inside a word, or snake_case names would come out italic.
  s = s.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>')
       .replace(/(^|[^\w\\])__(?=\S)([\s\S]*?\S)__(?!\w)/g, '$1<strong>$2</strong>')
       .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>')
       .replace(/\*(?=\S)([\s\S]*?\S)\*/g, '<em>$1</em>')
       .replace(/(^|[^\w\\])_(?=\S)([\s\S]*?\S)_(?!\w)/g, '$1<em>$2</em>');

  // **A single newline is a line break.** Standard Markdown folds one into a
  // space and wants two trailing spaces for a break, which is a rule nobody
  // writing a backstory in a box knows. What you typed is what you get.
  s = s.replace(/\n/g, '<br>');

  return s.replace(/@@MD([0-9]+)@@/g, (m, n) => held[n]);
}

function escapeHTML(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s) {
  return escapeHTML(s).replace(/"/g, '&quot;');
}

// =============================================================================
// THE SANITIZER
// =============================================================================
// See the file header for why this exists. The allowlists are the contract:
// anything not named here does not survive.

// Laid out, not run. Everything here is inert markup whose whole job is how the
// text looks.
const MD_ALLOWED_TAGS = new Set([
  'p', 'br', 'hr', 'div', 'span',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'strong', 'b', 'em', 'i', 'u', 's', 'del', 'ins', 'mark', 'small', 'sub', 'sup',
  'code', 'pre', 'kbd', 'samp', 'var', 'abbr', 'cite', 'q', 'time',
  'blockquote', 'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'a', 'img', 'figure', 'figcaption',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
]);

// Dropped **with their contents**. An unknown tag is merely unwrapped — its
// text is the player's writing and is kept — but the text inside a `<script>`
// *is* the payload, so these go whole.
const MD_DROP_WHOLE = new Set([
  'script', 'style', 'iframe', 'object', 'embed', 'applet', 'link', 'meta',
  'base', 'form', 'input', 'button', 'select', 'option', 'textarea', 'noscript',
  'template', 'svg', 'math', 'audio', 'video', 'source', 'track', 'canvas',
  'frame', 'frameset', 'portal', 'dialog',
]);

const MD_ALLOWED_ATTRS = {
  '*':  ['title', 'style', 'dir', 'lang'],
  a:    ['href', 'target', 'rel'],
  img:  ['src', 'alt', 'width', 'height'],
  ol:   ['start', 'reversed', 'type'],
  li:   ['value'],
  th:   ['colspan', 'rowspan', 'scope'],
  td:   ['colspan', 'rowspan'],
  col:  ['span'],
  colgroup: ['span'],
  time: ['datetime'],
  code: ['class'],   // the language- hint this file writes, nothing else
};

// Anything the browser ignores when it reads a URL, removed before the scheme
// is looked at: control characters, spaces, and HTML entities. `java&#9;script:`
// and `java script:` are both URLs a browser will happily run, and both walk
// straight past a naive prefix check.
function stripInvisible(raw) {
  return String(raw)
    .replace(/&#[^;]{1,8};?/g, '')
    .split('')
    .filter(ch => { const c = ch.charCodeAt(0); return c > 32 && c !== 127; })
    .join('');
}

// `javascript:` and friends, however they are spelled.
function safeURL(raw, kinds) {
  const url = stripInvisible(raw).toLowerCase();
  if (/^[a-z][a-z0-9+.-]*:/.test(url)) {
    const scheme = url.slice(0, url.indexOf(':'));
    if (scheme === 'data') return kinds.data && /^data:image\/(png|jpe?g|gif|webp|avif);base64,/.test(url);
    return kinds.schemes.includes(scheme);
  }
  return true; // relative, anchor, or protocol-relative — nothing executable
}

// `url()` can fetch, `expression()` used to execute, `@import` pulls a
// stylesheet in. Formatting does not need any of them.
function safeStyle(value) {
  return !/(url\s*\(|expression\s*\(|javascript\s*:|@import|behaviou?r\s*:|-moz-binding)/i.test(value);
}

function sanitizeHTML(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;          // inert: a template's content has no browsing
  scrubNode(tpl.content);        // context, so nothing here loads or runs
  return tpl.content;
}

function scrubNode(node) {
  // A live list would shift under the unwrapping below.
  Array.from(node.childNodes).forEach(child => {
    if (child.nodeType === Node.COMMENT_NODE) { child.remove(); return; }
    if (child.nodeType !== Node.ELEMENT_NODE) return;

    const tag = child.tagName.toLowerCase();

    if (MD_DROP_WHOLE.has(tag)) { child.remove(); return; }

    if (!MD_ALLOWED_TAGS.has(tag)) {
      // Unwrap: keep the writing, lose the tag.
      scrubNode(child);
      child.replaceWith(...Array.from(child.childNodes));
      return;
    }

    scrubAttributes(child, tag);
    scrubNode(child);
  });
}

function scrubAttributes(el, tag) {
  const allowed = (MD_ALLOWED_ATTRS['*'] ?? []).concat(MD_ALLOWED_ATTRS[tag] ?? []);

  Array.from(el.attributes).forEach(attr => {
    const name = attr.name.toLowerCase();
    const value = attr.value;

    // Every `on*` handler, whatever it is attached to. Checked before the
    // allowlist rather than relying on it, because this is the one class of
    // attribute that must never survive a later edit to the lists above.
    if (name.startsWith('on') || !allowed.includes(name)) { el.removeAttribute(attr.name); return; }

    if (name === 'href' && !safeURL(value, { schemes: ['http', 'https', 'mailto', 'tel'], data: false })) {
      el.removeAttribute(attr.name);
    } else if (name === 'src' && !safeURL(value, { schemes: ['http', 'https'], data: true })) {
      el.removeAttribute(attr.name);
    } else if (name === 'style' && !safeStyle(value)) {
      el.removeAttribute(attr.name);
    } else if (name === 'class' && tag === 'code' && !/^language-[\w-]+$/.test(value)) {
      el.removeAttribute(attr.name);
    }
  });

  // A link that opens elsewhere must not hand the opener over with it.
  if (tag === 'a' && el.getAttribute('target')) {
    el.setAttribute('rel', 'noopener noreferrer');
  }
}
