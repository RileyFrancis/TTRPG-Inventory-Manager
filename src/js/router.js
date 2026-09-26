// =============================================================================
// ROUTER — The address bar: which page is on screen, as a URL
// =============================================================================
'use strict';

// Still one page. The URL is a readout of state, written from it — never a
// second source of truth that state is read back out of:
//
//   home                  the home screen
//   character#<charId>    the app, solo, with that roster slot live
//   campaign#<code>       the app, seated at that table (GM or player)
//
// Each is one path segment, written relative to the page, so every relative
// asset path (`data/items.csv`, `src/js/…`) still resolves from the site root,
// and a copy hosted under a sub-folder keeps working. The host has to answer
// those paths with index.html — `_redirects` on Cloudflare Pages, and
// `tools/serve.py` locally (plain `python3 -m http.server` 404s them).
//
// `file://` has no paths to rewrite, so there the router is off entirely and the
// app behaves as it always did.

const ROUTER_ON = location.protocol !== 'file:';

// Set while a Back/Forward is being applied, so the screen changes it triggers
// do not push fresh history entries on top of the one being walked to.
let applyingRoute = false;

function parseRoute() {
  const segment = location.pathname.split('/').filter(Boolean).pop() ?? '';
  const arg = decodeURIComponent(location.hash.slice(1));
  if (segment === 'character' && arg) return { page: 'character', id: arg };
  if (segment === 'campaign'  && arg) return { page: 'campaign',  code: arg };
  return { page: 'home' };
}

// The URL the current state should be showing.
function routeForState() {
  if (state.screen === 'home') return 'home';
  if (state.party.active && state.party.code) return 'campaign#' + encodeURIComponent(state.party.code);
  return 'character#' + encodeURIComponent(state.activeCharacterId ?? '');
}

// Called after anything that changes which page is on screen. A new page is a
// new history entry (so Back returns to the roster); `replace` corrects the
// current one instead — at boot, and after a route that could not be honoured.
function syncRoute({ replace = false } = {}) {
  if (!ROUTER_ON) return;
  const target = new URL(routeForState(), location.href);
  if (target.href === location.href) return;
  const push = !replace && !applyingRoute;
  try {
    history[push ? 'pushState' : 'replaceState'](null, '', target.href);
  } catch { /* a sandboxed frame may refuse — the app itself does not care */ }
}

// Makes state match a route, as far as it can. Anything it cannot honour — an id
// not in this roster, a campaign not currently joined, a GM asking for a
// character — is simply not done; the caller then rewrites the URL to whatever
// is really on screen.
function applyRoute(route) {
  if (route.page === 'character') {
    if (!state.party.active && state.characters[route.id]) {
      activateCharacter(route.id); // a no-op when it is already the live one
      if (state.screen === 'home') closeHomeScreen();
      return;
    }
  } else if (route.page === 'campaign') {
    // Joining is an async, signed-in affair (enterCampaign()); a URL only walks
    // back onto a table this tab is already sitting at.
    if (state.party.active && state.party.code === route.code) {
      if (state.screen === 'home') closeHomeScreen();
      return;
    }
  }
  if (state.screen !== 'home') openHomeScreen();
}

// Boot: in place of the unconditional openHomeScreen() — a reload of a
// character's page lands back on that character. A bare `/` becomes `/home`.
function applyBootRoute() {
  if (!ROUTER_ON) { openHomeScreen(); return; }
  state.screen = 'home'; // so a honoured character route runs closeHomeScreen()
  applyingRoute = true;
  try {
    const route = parseRoute();
    if (route.page === 'character' && state.characters[route.id]) applyRoute(route);
    else openHomeScreen(); // a campaign needs a sign-in first; home is where you rejoin
  } finally {
    applyingRoute = false;
  }
  syncRoute({ replace: true });
}

if (ROUTER_ON) {
  // Back/Forward, and a hand-edited hash (`hashchange` alone would miss Back).
  const onNavigate = () => {
    applyingRoute = true;
    try { applyRoute(parseRoute()); }
    finally { applyingRoute = false; }
    syncRoute({ replace: true });
  };
  window.addEventListener('popstate', onNavigate);
  window.addEventListener('hashchange', onNavigate);
}
