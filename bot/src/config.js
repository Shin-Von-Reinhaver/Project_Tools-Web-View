'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

(function loadEnv() {
  const f = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || line.trim().startsWith('#')) continue;
    if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
})();

const env = (k, d) => (process.env[k] !== undefined && process.env[k] !== '' ? process.env[k] : d);
const digits = (s) => String(s || '').replace(/\D/g, '');
const dataDir = env('DATA_DIR', path.join(__dirname, '..', 'data'));

/** Kunci API: dari .env, atau dibuat otomatis sekali lalu disimpan di data/config.json. */
function loadKey() {
  const given = env('OWNER_TOKEN', '');
  if (given) return given;
  const f = path.join(dataDir, 'config.json');
  try {
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (j.token && j.token.length >= 16) return j.token;
  } catch (_) { /* belum ada */ }
  const token = crypto.randomBytes(18).toString('base64url');
  try { fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(f, JSON.stringify({ token })); } catch (_) { /* tetap dipakai di memori */ }
  return token;
}

const ownerNumbers = env('OWNER_NUMBER', '').split(',').map(digits).filter(Boolean);
const port = parseInt(env('PORT', '3000'), 10);

module.exports = {
  botName: env('BOT_NAME', 'Shin Bot'),
  prefix: env('PREFIX', '.'),
  ownerNumbers,
  // Tanpa OWNER_NUMBER, nomor yang ditautkan ke bot otomatis menjadi pemilik.
  autoOwner: ownerNumbers.length === 0,
  ownerName: env('OWNER_NAME', 'Creator'),
  ownerToken: loadKey(),
  port,
  publicUrl: env('PUBLIC_URL', '').replace(/\/+$/, ''),
  panelUrl: env('PANEL_URL', '').replace(/\/+$/, ''),
  tunnel: env('TUNNEL', '0') === '1',
  pairNumber: digits(env('PAIR_NUMBER', '')),
  isTermux: !!process.env.TERMUX_VERSION || /com\.termux/.test(process.env.PREFIX || ''),
  openBrowser: env('OPEN_BROWSER', '1') === '1',
  allowedOrigin: env('ALLOWED_ORIGIN', '*').split(',').map((s) => s.trim()).filter(Boolean),
  allowSelf: env('ALLOW_SELF', '0') === '1',
  serveStatic: env('SERVE_STATIC', '1') === '1',
  stickerPack: env('STICKER_PACK', 'Shin Bot'),
  stickerAuthor: env('STICKER_AUTHOR', 'Shin Von Reinhaver'),
  authDir: path.join(__dirname, '..', 'auth'),
  dataDir,
  rootDir: path.join(__dirname, '..', '..'),
  cooldownMs: 3000,
  digits,
};
