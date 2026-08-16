// =============================================================================
// /firebase-env — Serves the Firebase settings from the host's environment
// =============================================================================
// A Cloudflare Pages Function. Anything under functions/ is deployed as a
// Worker automatically — no build step, no build command — and the variables
// set in Pages → Settings → Variables and Secrets arrive in `context.env`.
// This file's name is its route: /firebase-env.
//
// It exists because the deployed site has no `.env` to read. That file is
// gitignored, so it never reaches the host, and Cloudflare Pages would not
// serve it anyway: it skips every path beginning with a dot. Keeping the values
// in the dashboard rather than in the repo is the point of doing it this way.
//
// The response is the same KEY=value text `.env` holds, so firebase-config.js
// parses one format whichever source answered.
//
// This does NOT make the config secret. Any visitor can read this response,
// just as they can read the config out of the running page — the browser has to
// receive it to connect at all. Your Realtime Database rules are what guard the
// data; this only keeps the values out of a public repo.

const KEYS = [
  'FIREBASE_API_KEY',
  'FIREBASE_AUTH_DOMAIN',
  'FIREBASE_DATABASE_URL',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_STORAGE_BUCKET',
  'FIREBASE_MESSAGING_SENDER_ID',
  'FIREBASE_APP_ID',
];

const TEXT = { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' };

export function onRequestGet(context) {
  const env = context.env ?? {};
  const lines = [];

  for (const key of KEYS) {
    const value = String(env[key] ?? '').trim();
    if (value) lines.push(`${key}=${value}`);
  }

  // databaseURL is the one value party sync cannot work without — the same test
  // firebase-config.js applies in the browser. Without it, answer as if this
  // route did not exist, which is exactly what an unconfigured deploy means.
  if (!env.FIREBASE_DATABASE_URL) {
    return new Response(
      '# FIREBASE_DATABASE_URL is not set for this deployment.\n' +
      '# Add the FIREBASE_* variables under Pages → Settings → Variables and Secrets.\n',
      { status: 404, headers: TEXT },
    );
  }

  return new Response(lines.join('\n') + '\n', { headers: TEXT });
}
