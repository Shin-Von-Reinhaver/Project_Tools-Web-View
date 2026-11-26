'use strict';
const cfg = require('./config');
const db = require('./db');
const commands = require('./commands');

const lastUse = new Map(); // nomor -> timestamp
const busy = new Set();    // nomor yang sedang memproses perintah berat

/**
 * Memproses satu pesan teks. Mengembalikan 'ignored' | 'blocked' | 'cooldown' | 'busy' | 'unknown' | 'ok' | 'error'.
 * ctx wajib punya: sender, isOwner, reply(), plus fungsi media yang dipakai perintah.
 */
async function dispatch(ctx, raw) {
  const text = String(raw || '').trim();
  if (!text.startsWith(cfg.prefix)) return 'ignored';
  const body = text.slice(cfg.prefix.length).trim();
  if (!body) return 'ignored';
  const [name, ...args] = body.split(/\s+/);
  const cmd = commands.find(name);
  if (!cmd) return 'unknown'; // diam saja, tidak membalas perintah yang tidak dikenal

  const d = db.get();
  if (!ctx.isOwner && d.banned.includes(ctx.sender)) return 'blocked';
  if (!ctx.isOwner && d.mode === 'self') return 'blocked';
  if (cmd.ownerOnly && !ctx.isOwner) { await ctx.reply('Perintah ini hanya untuk pemilik bot.'); return 'blocked'; }

  const now = Date.now();
  if (!ctx.isOwner && now - (lastUse.get(ctx.sender) || 0) < cfg.cooldownMs) return 'cooldown';
  lastUse.set(ctx.sender, now);

  if (cmd.heavy) {
    if (busy.has(ctx.sender)) { await ctx.reply('Tunggu, permintaan sebelumnya masih diproses.'); return 'busy'; }
    busy.add(ctx.sender);
  }
  ctx.prefix = cfg.prefix;
  ctx.args = args;
  ctx.text = body.slice(name.length).trim();
  ctx.mentioned = ctx.mentioned || [];
  try {
    db.touchUser(ctx.sender, ctx.name);
    db.countCommand(cmd.name);
    await cmd.run(ctx);
    return 'ok';
  } catch (e) {
    console.error(`[cmd:${cmd.name}]`, e && e.message);
    try { await ctx.reply('Terjadi kesalahan: ' + (e && e.message ? e.message : 'tidak diketahui')); } catch (_) { /* abaikan */ }
    return 'error';
  } finally {
    busy.delete(ctx.sender);
  }
}

module.exports = { dispatch, _lastUse: lastUse };
