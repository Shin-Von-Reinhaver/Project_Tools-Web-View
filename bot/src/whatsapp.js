'use strict';
const fs = require('fs');
const pino = require('pino');
const QRCode = require('qrcode');
const cfg = require('./config');
const db = require('./db');
const { dispatch } = require('./handler');

const logger = pino({ level: process.env.LOG_LEVEL || 'silent' });

const state = { status: 'idle', qr: null, pairingCode: null, me: null, since: Date.now(), lastError: null };
let sock = null, starting = false, retry = 0, stopped = false;
const sentIds = new Set();
let qrShown = 0;
const track = (r) => { if (r?.key?.id) { sentIds.add(r.key.id); if (sentIds.size > 500) sentIds.delete(sentIds.values().next().value); } return r; };

const baileys = () => require('@whiskeysockets/baileys');
const numOf = (jid) => String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '');

/** Membuka lapisan pesan (ephemeral, view-once, dll.) sampai isi sebenarnya. */
function unwrap(m) {
  let x = m;
  for (let i = 0; i < 6 && x; i++) {
    const n = x.ephemeralMessage?.message || x.viewOnceMessage?.message || x.viewOnceMessageV2?.message || x.viewOnceMessageV2Extension?.message || x.documentWithCaptionMessage?.message || x.editedMessage?.message?.protocolMessage?.editedMessage;
    if (!n) break; x = n;
  }
  return x || {};
}
const textOf = (m) => m.conversation || m.extendedTextMessage?.text || m.imageMessage?.caption || m.videoMessage?.caption || m.documentMessage?.caption || '';
const ctxInfoOf = (m) => m.extendedTextMessage?.contextInfo || m.imageMessage?.contextInfo || m.videoMessage?.contextInfo || m.stickerMessage?.contextInfo || m.documentMessage?.contextInfo || {};

function mediaKind(m) {
  if (m.imageMessage) return 'image';
  if (m.videoMessage) return 'video';
  if (m.stickerMessage) return 'sticker';
  if (m.audioMessage) return 'audio';
  if (m.documentMessage && /^image\//.test(m.documentMessage.mimetype || '')) return 'image';
  return null;
}

async function buildCtx(msg) {
  const { downloadMediaMessage } = baileys();
  const jid = msg.key.remoteJid;
  const isGroup = jid.endsWith('@g.us');
  const senderJid = isGroup ? (msg.key.participant || '') : jid;
  const sender = numOf(msg.key.fromMe ? (sock.user && sock.user.id) : senderJid);
  const inner = unwrap(msg.message);
  const info = ctxInfoOf(inner);
  const quotedRaw = info.quotedMessage ? unwrap(info.quotedMessage) : null;

  const send = async (to, content, opt) => track(await sock.sendMessage(to, content, opt));
  const q = { quoted: msg };

  return {
    chat: jid, sender, isGroup, name: msg.pushName || '',
    isOwner: cfg.ownerNumbers.includes(sender) || (msg.key.fromMe && (cfg.allowSelf || cfg.autoOwner)),
    mentioned: (info.mentionedJid || []).map(numOf),
    reply: (t) => send(jid, { text: String(t).slice(0, 4000) }, q),
    sendImage: (buffer, caption) => send(jid, { image: buffer, caption }, q),
    sendSticker: (buffer) => send(jid, { sticker: buffer }, q),
    sendVideo: (buffer, caption) => send(jid, { video: buffer, caption, mimetype: 'video/mp4' }, q),
    sendAudio: (buffer) => send(jid, { audio: buffer, mimetype: 'audio/mpeg' }, q),
    sendDoc: (buffer, fileName, mimetype) => send(jid, { document: buffer, fileName, mimetype }, q),
    sendTo: (to, text) => send(to, { text }),
    getMedia: async () => {
      // Prioritas: media pada pesan itu sendiri, lalu pesan yang dibalas.
      const candidates = [[inner, msg], quotedRaw && [quotedRaw, { key: { remoteJid: jid, id: info.stanzaId, participant: info.participant, fromMe: false }, message: info.quotedMessage }]].filter(Boolean);
      for (const [m, full] of candidates) {
        const kind = mediaKind(m); if (!kind) continue;
        const node = m.imageMessage || m.videoMessage || m.stickerMessage || m.audioMessage || m.documentMessage;
        const size = Number(node.fileLength || 0);
        if (size > 25 * 1024 * 1024) throw new Error('Berkas terlalu besar (maks 25 MB)');
        const buffer = await downloadMediaMessage(full, 'buffer', {}, { logger, reuploadRequest: sock.updateMediaMessage });
        return { kind, buffer, mimetype: node.mimetype, seconds: node.seconds || 0 };
      }
      return null;
    },
    _raw: textOf(inner),
  };
}

async function onMessages({ messages, type }) {
  if (type !== 'notify') return;
  for (const msg of messages) {
    try {
      if (!msg.message || msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid?.endsWith('@newsletter')) continue;
      if (sentIds.has(msg.key.id)) continue;
      if (msg.key.fromMe && !(cfg.allowSelf || cfg.autoOwner)) continue;
      const ctx = await buildCtx(msg);
      if (!ctx._raw) continue;
      await dispatch(ctx, ctx._raw);
    } catch (e) { console.error('[wa] gagal memproses pesan:', e.message); }
  }
}

async function start() {
  if (starting || stopped || sock) return;
  starting = true;
  try {
    const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers } = baileys();
    fs.mkdirSync(cfg.authDir, { recursive: true });
    const { state: auth, saveCreds } = await useMultiFileAuthState(cfg.authDir);
    let version; try { version = (await fetchLatestBaileysVersion()).version; } catch (_) { /* pakai bawaan */ }
    state.status = 'connecting'; state.qr = null; state.lastError = null;
    const me = makeWASocket({ version, auth, logger, browser: Browsers.ubuntu('Chrome'), printQRInTerminal: false, markOnlineOnConnect: false, syncFullHistory: false });
    sock = me;
    me.ev.on('creds.update', saveCreds);
    me.ev.on('messages.upsert', onMessages);
    me.ev.on('connection.update', async (u) => {
      if (sock !== me) return; // soket lama (sudah diganti) diabaikan
      if (u.qr) {
        state.status = 'qr';
        try { state.qr = await QRCode.toDataURL(u.qr, { margin: 1, width: 320 }); } catch (_) { /* abaikan */ }
        if (!cfg.isTermux && qrShown++ < 2) QRCode.toString(u.qr, { type: 'terminal', small: true }).then((t) => console.log('\n[wa] Pindai QR ini (WhatsApp > Perangkat tertaut), atau pakai panel web:\n' + t)).catch(() => {});
      }
      if (u.connection === 'open') { state.status = 'open'; state.qr = null; state.pairingCode = null; state.me = numOf(me.user?.id); state.since = Date.now(); retry = 0; qrShown = 0; console.log('[wa] terhubung sebagai', state.me); }
      if (u.connection === 'close') {
        const code = u.lastDisconnect?.error?.output?.statusCode;
        state.me = null; state.qr = null;
        if (code === DisconnectReason.loggedOut) {
          state.status = 'logged_out'; console.log('[wa] sesi keluar, hapus auth dan minta QR baru');
          fs.rmSync(cfg.authDir, { recursive: true, force: true });
        } else { state.status = 'closed'; state.lastError = 'Terputus (kode ' + code + ')'; }
        sock = null; starting = false;
        if (!stopped) setTimeout(start, Math.min(30000, 2000 * ++retry));
      }
    });
  } catch (e) {
    state.status = 'closed'; state.lastError = e.message; console.error('[wa] gagal memulai:', e.message);
    sock = null; starting = false; if (!stopped) setTimeout(start, Math.min(30000, 3000 * ++retry));
    return;
  }
  starting = false;
}

/** Kirim pesan teks ke nomor (format internasional) atau ID grup. Dipakai API /api/send. */
async function sendText(to, text) {
  if (!sock || state.status !== 'open') throw new Error('WhatsApp belum tersambung');
  const jid = String(to).includes('@') ? String(to) : cfg.digits(to) + '@s.whatsapp.net';
  if (jid.endsWith('@s.whatsapp.net')) {
    try { const [r] = await sock.onWhatsApp(jid); if (r && !r.exists) throw new Error('Nomor tidak terdaftar di WhatsApp'); }
    catch (e) { if (/terdaftar/.test(e.message)) throw e; }
  }
  const r = await sock.sendMessage(jid, { text: String(text).slice(0, 4000) });
  return track(r)?.key?.id || null;
}

async function requestPair(number) {
  const n = cfg.digits(number);
  if (n.length < 8) throw new Error('Nomor tidak valid (pakai format internasional, contoh 6281234567890)');
  if (!sock) throw new Error('Bot belum siap, coba lagi beberapa detik');
  if (sock.authState.creds.registered) throw new Error('Perangkat sudah tertaut');
  const code = await sock.requestPairingCode(n);
  state.pairingCode = code; return code;
}

async function logout() {
  try { if (sock) await sock.logout(); } catch (_) { /* sudah putus */ }
  fs.rmSync(cfg.authDir, { recursive: true, force: true });
  state.status = 'logged_out'; state.me = null; state.qr = null;
  if (sock) { try { sock.end(undefined); } catch (_) { /* abaikan */ } sock = null; }
  starting = false; setTimeout(start, 800);
}
function restart() { try { sock && sock.end(undefined); } catch (_) { /* abaikan */ } sock = null; starting = false; retry = 0; setTimeout(start, 500); }
function stop() { stopped = true; try { sock && sock.end(undefined); } catch (_) { /* abaikan */ } }

module.exports = { start, stop, restart, logout, requestPair, sendText, state, _internals: { unwrap, textOf, mediaKind } };
