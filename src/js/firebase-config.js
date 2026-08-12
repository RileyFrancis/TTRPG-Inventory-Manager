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
// `.env` is fetched by the browser, so it is readable by anyone who can reach
// the site. That is fine for Firebase web config — it is public by design and
// access is enforced by your Realtime Database rules — but never put real
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

function loadFirebaseConfig() {
  let env;
  try {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', '.env', false); // synchronous — must resolve before init()
    xhr.send();
    if (xhr.status !== 200) throw new Error(`HTTP ${xhr.status}`);
    env = parseEnv(xhr.responseText);
  } catch (err) {
    console.info('No .env found — party features disabled. Copy .env.example to .env to enable them.');
    return null;
  }

  const config = {};
  const missing = [];
  Object.entries(FIREBASE_ENV_KEYS).forEach(([envKey, configKey]) => {
    const val = env[envKey];
    if (val) config[configKey] = val;
    else missing.push(envKey);
  });

  // databaseURL is the only value party sync genuinely cannot work without.
  if (!config.databaseURL) {
    console.warn('.env is missing ' + missing.join(', ') + ' — party features disabled.');
    return null;
  }
  if (missing.length) {
    console.warn('.env is missing ' + missing.join(', ') + ' — party sync may misbehave.');
  }
  return config;
}

const FIREBASE_CONFIG = loadFirebaseConfig();
