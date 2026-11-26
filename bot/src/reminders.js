'use strict';
const db = require('./db');

const MAX_PER_USER = 10, MAX_MS = 30 * 24 * 3600 * 1000;

/** "10m", "2j", "1j30m", "45d", "1h" (d=detik, m=menit, j=jam, h=hari) atau jam "14:30" (waktu server). */
function parseWhen(tok, now = Date.now()) {
  tok = String(tok || '').toLowerCase().trim();
  let m = /^(?:(\d+)h)?(?:(\d+)j)?(?:(\d+)m)?(?:(\d+)d)?$/.exec(tok);
  if (m && tok) {
    const ms = ((+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0)) * 1000;
    return ms >= 1000 && ms <= MAX_MS ? now + ms : null;
  }
  m = /^(\d{1,2})[:.](\d{2})$/.exec(tok);
  if (m && +m[1] < 24 && +m[2] < 60) {
    const d = new Date(now); d.setHours(+m[1], +m[2], 0, 0);
    if (d.getTime() <= now) d.setDate(d.getDate() + 1);
    return d.getTime();
  }
  return null;
}

function add({ chat, sender, at, text }) {
  const d = db.get();
  if (d.reminders.filter((r) => r.sender === sender).length >= MAX_PER_USER) throw new Error(`Maksimal ${MAX_PER_USER} pengingat aktif per orang`);
  d.remSeq = (d.remSeq || 0) + 1;
  const r = { id: d.remSeq, chat, sender, at, text: String(text).slice(0, 500), tries: 0 };
  d.reminders.push(r); db.save();
  return r;
}
const list = (sender) => db.get().reminders.filter((r) => r.sender === sender).sort((a, b) => a.at - b.at);
function remove(id, sender, isOwner) {
  const d = db.get(), i = d.reminders.findIndex((r) => r.id === id && (isOwner || r.sender === sender));
  if (i < 0) return false;
  d.reminders.splice(i, 1); db.save();
  return true;
}

let ticking = false;
/** Kirim pengingat yang sudah jatuh tempo. send(chat, teks) dipanggil per pengingat; gagal = dicoba lagi (maks 5x). */
async function tick(send, now = Date.now()) {
  if (ticking) return 0;
  ticking = true;
  let sent = 0;
  try {
    const d = db.get();
    for (const r of d.reminders.filter((x) => x.at <= now)) {
      const late = now - r.at > 120000 ? ' (terlambat karena bot sempat mati)' : '';
      try { await send(r.chat, `⏰ Pengingat: ${r.text}${late}`); sent++; r.done = true; }
      catch (_) { if (++r.tries >= 5 || now - r.at > 7 * 86400000) r.done = true; }
    }
    if (d.reminders.some((r) => r.done)) { d.reminders = d.reminders.filter((r) => !r.done); db.save(); }
  } finally { ticking = false; }
  return sent;
}

module.exports = { parseWhen, add, list, remove, tick };
