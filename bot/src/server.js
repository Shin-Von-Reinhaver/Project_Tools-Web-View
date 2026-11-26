'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cfg = require('./config');
const db = require('./db');
const commands = require('./commands');
const wa = require('./whatsapp');

const sessions = new Map(); // token sesi -> kedaluwarsa
const fails = new Map();    // ip -> { n, until }
const SESSION_MS = 12 * 3600 * 1000;
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
const tokenOk = (given) => cfg.ownerToken.length >= 16 && crypto.timingSafeEqual(sha(given), sha(cfg.ownerToken));

const hits = new Map(); // ip -> [waktu, ...]
function rate(ip, max, ms) {
  const now = Date.now(), list = (hits.get(ip) || []).filter((t) => now - t < ms);
  list.push(now); hits.set(ip, list);
  return list.length <= max;
}

function cors(req, res) {
  const o = req.headers.origin;
  if (cfg.allowedOrigin.includes('*')) res.setHeader('Access-Control-Allow-Origin', '*');
  else if (o && cfg.allowedOrigin.includes(o)) { res.setHeader('Access-Control-Allow-Origin', o); res.setHeader('Vary', 'Origin'); }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
}
function send(res, code, obj) {
  const b = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(b);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let n = 0; const chunks = [];
    req.on('data', (c) => { n += c.length; if (n > 10000) { reject(new Error('Body terlalu besar')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { reject(new Error('JSON tidak valid')); } });
    req.on('error', reject);
  });
}
function authed(req) {
  const m = /^Bearer\s+([a-f0-9]{64})$/.exec(req.headers.authorization || '');
  if (!m) return false;
  const exp = sessions.get(m[1]);
  if (!exp) return false;
  if (exp < Date.now()) { sessions.delete(m[1]); return false; }
  return true;
}

async function api(req, res, url) {
  const p = url.pathname;
  const d = db.get();

  if (req.method === 'GET' && p === '/api/status') {
    return send(res, 200, { name: cfg.botName, owner: cfg.ownerName, status: wa.state.status, online: wa.state.status === 'open',
      uptime: Math.floor((Date.now() - wa.state.since) / 1000), mode: d.mode, commands: commands.publicList().filter((c) => !c.ownerOnly).length,
      users: Object.keys(d.users).length, prefix: cfg.prefix, me: wa.state.me, total: d.stats.commands });
  }
  if (req.method === 'GET' && p === '/api/commands') return send(res, 200, { prefix: cfg.prefix, list: commands.publicList().filter((c) => !c.ownerOnly) });

  // API kirim pesan (gratis): kunci API lewat header "Authorization: Bearer <kunci>" atau parameter ?key=
  if (p === '/api/send' && (req.method === 'GET' || req.method === 'POST')) {
    const body = req.method === 'POST' ? await readBody(req) : {};
    const q = (k) => body[k] ?? url.searchParams.get(k);
    const bearer = /^Bearer\s+(\S+)$/.exec(req.headers.authorization || '');
    const key = (bearer && bearer[1]) || q('key');
    if (!key || !tokenOk(key)) return send(res, 401, { error: 'Kunci API salah atau belum dikirim' });
    if (!rate(req.socket.remoteAddress, 30, 60000)) return send(res, 429, { error: 'Terlalu banyak permintaan (maks 30 per menit)' });
    const to = String(q('to') || '').trim(), text = String(q('message') ?? q('text') ?? '').trim();
    if (!/^\d{8,15}$/.test(to.replace(/\D/g, '')) && !/^\d{10,25}@g\.us$/.test(to)) return send(res, 400, { error: 'Parameter "to" harus nomor internasional, contoh 6281234567890' });
    if (!text) return send(res, 400, { error: 'Parameter "message" kosong' });
    try { return send(res, 200, { ok: true, id: await wa.sendText(to, text) }); }
    catch (e) { return send(res, e.message.includes('belum tersambung') ? 503 : 400, { error: e.message }); }
  }

  if (req.method === 'POST' && p === '/api/login') {
    const ip = req.socket.remoteAddress || '?';
    const f = fails.get(ip);
    if (f && f.until > Date.now() && f.n >= 5) return send(res, 429, { error: 'Terlalu banyak percobaan. Coba lagi nanti.' });
        const body = await readBody(req);
    if (!body.token || !tokenOk(body.token)) {
      const n = (f && f.until > Date.now() ? f.n : 0) + 1; fails.set(ip, { n, until: Date.now() + 10 * 60 * 1000 });
      return send(res, 401, { error: 'Token salah' });
    }
    fails.delete(ip);
    const s = crypto.randomBytes(32).toString('hex'); sessions.set(s, Date.now() + SESSION_MS);
    return send(res, 200, { ok: true, session: s, owner: cfg.ownerName, expiresIn: SESSION_MS / 1000 });
  }

  if (!p.startsWith('/api/owner/')) return send(res, 404, { error: 'Tidak ditemukan' });
  if (!authed(req)) return send(res, 401, { error: 'Belum masuk sebagai pemilik' });

  if (req.method === 'POST' && p === '/api/owner/logout-panel') { const m = /Bearer\s+(\S+)/.exec(req.headers.authorization); sessions.delete(m[1]); return send(res, 200, { ok: true }); }
  if (req.method === 'GET' && p === '/api/owner/state') {
    const top = Object.entries(d.stats.byCommand).sort((a, b) => b[1] - a[1]).slice(0, 5);
    return send(res, 200, { status: wa.state.status, qr: wa.state.qr, pairingCode: wa.state.pairingCode, me: wa.state.me, lastError: wa.state.lastError,
      mode: d.mode, banned: d.banned.length, users: Object.keys(d.users).length, totalCommands: d.stats.commands, top });
  }
  if (req.method === 'POST' && p === '/api/owner/pair') {
    try { const b = await readBody(req); return send(res, 200, { code: await wa.requestPair(b.number) }); }
    catch (e) { return send(res, 400, { error: e.message }); }
  }
  if (req.method === 'POST' && p === '/api/owner/mode') {
    const b = await readBody(req);
    if (!['public', 'self'].includes(b.mode)) return send(res, 400, { error: 'Mode harus public atau self' });
    d.mode = b.mode; db.save(); return send(res, 200, { ok: true, mode: d.mode });
  }
  if (req.method === 'POST' && p === '/api/owner/restart') { wa.restart(); return send(res, 200, { ok: true }); }
  if (req.method === 'POST' && p === '/api/owner/logout') { await wa.logout(); return send(res, 200, { ok: true }); }
  return send(res, 404, { error: 'Tidak ditemukan' });
}

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname); if (rel === '/') rel = '/index.html';
  const full = path.resolve(cfg.rootDir, '.' + rel);
  const botDir = path.resolve(cfg.rootDir, 'bot');
  const ok = full.startsWith(path.resolve(cfg.rootDir) + path.sep) && !full.startsWith(botDir) && !rel.split('/').some((s) => s.startsWith('.'));
  if (!ok || !TYPES[path.extname(full).toLowerCase()] || !fs.existsSync(full) || !fs.statSync(full).isFile()) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(full).toLowerCase()], 'X-Content-Type-Options': 'nosniff' });
  fs.createReadStream(full).pipe(res);
}

function create() {
  return http.createServer(async (req, res) => {
    try {
      cors(req, res);
      if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
      const url = new URL(req.url, 'http://x');
      if (url.pathname.startsWith('/api/')) return await api(req, res, url);
      if (cfg.serveStatic && req.method === 'GET') return serveStatic(req, res, url);
      res.writeHead(404); res.end('Not found');
    } catch (e) { if (!res.headersSent) send(res, 400, { error: e.message }); else res.end(); }
  });
}
module.exports = { create, _sessions: sessions, _hits: hits };
