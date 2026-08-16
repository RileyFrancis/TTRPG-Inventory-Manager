// =============================================================================
// FIREBASE-CONFIG — Reads Firebase credentials from the project's .env file
// =============================================================================
'use strict';

// =============================================================================
// FIREBASE CONFIGURATION
// =============================================================================
// Values live in `.env` at the project root (gitignored — see .env.example).
// Loaded with a synchronous XHR, the same way items.js loads data/items.csv, so
// FIREBASE_CONFIG is populated before init() runs.
//
// Two files are tried, same format, first hit wins:
//
//   firebase.env  generated at deploy time by tools/build-firebase-env.js from
//                 the host's environment variables. `.env` is gitignored so it
//                 never reaches a deploy, and Cloudflare Pages would not serve
//                 it anyway — it skips every path starting with a dot.
//   .env          the local development copy.
//
// Either file is fetched by the browser, so it is readable by anyone who can
// reach the site. That is fine for Firebase web config — it is public by design
// and access is enforced by your Realtime Database rules — but never put real
// secrets in it.

// .env key → Firebase config key
const FIREBASE_ENV_KEYS = {
  FIREBASE_API_KEY:             'apiKey',
  FIREBASE_AUTH_DOMAIN:         'authDomain',
  FIREBASE_DATABASE_URL:        'databaseURL',
  FIREBASE_PROJECT_ID:          'projectId',
  FIREBASE_STORAGE_BUCKET:      'storageBucket',
  FIREBASE_MESSAGING_SENDER_ID: 'messagingSenderId',
  FIREBASE_APP_ID:              'appId',
};

// Parse dotenv-style text: KEY=value per line, # comments, optional quotes.
function parseEnv(text) {
  const env = {};
  text.split('\n').forEach(rawLine => {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) return;
    const eq = line.indexOf('=');
    if (eq === -1) return;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    // Strip matching surrounding quotes, if present
    if (val.length >= 2 && (val[0] === '"' || val[0] === "'") && val[val.length - 1] === val[0]) {
      val = val.slice(1, -1);
    }
    if (key) env[key] = val;
  });
  return env;
}

// Tried in order; the deploy-time file wins so a stale local copy of it cannot
// shadow the `.env` a developer is editing... and vice versa, only one of the
// two normally exists at all.
const FIREBASE_ENV_FILES = ['firebase.env', '.env'];

// Null when the file isn't there. Note the HTML guard: a static host that
// answers 404s with its index page (Cloudflare Pages does) returns 200 and a
// pageful of markup for a file that does not exist, which would otherwise parse
// as an env file with no keys in it.
function readEnvFile(path) {
  try {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', path, false); // synchronous — must resolve before init()
    xhr.send();
    if (xhr.status !== 200) return null;
    if (xhr.responseText.trimStart().startsWith('<')) return null;
    return parseEnv(xhr.responseText);
  } catch (err) {
    return null; // file:// or a blocked request — same as absent
  }
}

function loadFirebaseConfig() {
  for (const path of FIREBASE_ENV_FILES) {
    const env = readEnvFile(path);
    if (!env) continue;

    const config = {};
    const missing = [];
    Object.entries(FIREBASE_ENV_KEYS).forEach(([envKey, configKey]) => {
      const val = env[envKey];
      if (val) config[configKey] = val;
      else missing.push(envKey);
    });

    // databaseURL is the only value party sync genuinely cannot work without.
    // Without it the file tells us nothing, so keep looking rather than give up.
    if (!config.databaseURL) {
      console.warn(`${path} is missing ` + missing.join(', ') + ' — ignoring it.');
      continue;
    }
    if (missing.length) {
      console.warn(`${path} is missing ` + missing.join(', ') + ' — party sync may misbehave.');
    }
    return config;
  }

  console.info('No Firebase config found (looked for ' + FIREBASE_ENV_FILES.join(', ') + ') — ' +
               'party features disabled. Copy .env.example to .env to enable them locally; ' +
               'when hosting, see tools/build-firebase-env.js.');
  return null;
}

const FIREBASE_CONFIG = loadFirebaseConfig();
