'use strict';
/** Tampilan menu WhatsApp: kartu info, kategori bernomor, halaman detail per kategori. */

const CATS = [
  ['Umum', '🏠', 'Info & bantuan'],
  ['Stiker & Gambar', '🖼️', 'Stiker, ukuran, filter, PDF'],
  ['Video & Audio', '🎬', 'Kompres, potong, efek, GIF'],
  ['Utilitas', '🧮', 'Hitung, satuan, kurs, tanggal'],
  ['Teks', '✍️', 'Huruf, gaya, terbilang, daftar'],
  ['Developer', '💻', 'JSON, hash, JWT, regex, cron'],
  ['QR & Link', '🔳', 'QR, Wi-Fi, tautan WhatsApp'],
  ['Pengingat', '⏰', 'Pengingat terjadwal'],
  ['Pemilik', '👑', 'Khusus pemilik bot'],
];
const META = Object.fromEntries(CATS.map(([n, e, d]) => [n, { emoji: e, desc: d }]));

const bold = (s) => [...s].map((c) => { const k = c.codePointAt(0); return k >= 65 && k <= 90 ? String.fromCodePoint(0x1D5D4 + k - 65) : k >= 97 && k <= 122 ? String.fromCodePoint(0x1D5EE + k - 97) : c; }).join('');

function greeting(now = new Date()) {
  const h = new Date(now.getTime() + 7 * 3600000).getUTCHours();
  return h < 4 ? ['🌙', 'Selamat malam'] : h < 11 ? ['🌅', 'Selamat pagi'] : h < 15 ? ['☀️', 'Selamat siang'] : h < 18 ? ['🌇', 'Selamat sore'] : ['🌃', 'Selamat malam'];
}

/** Kelompokkan perintah yang tampil untuk pengguna ini, urut sesuai CATS. */
function group(registry, isOwner) {
  const map = new Map();
  for (const c of registry) {
    if (c.hidden || (c.ownerOnly && !isOwner)) continue;
    if (!map.has(c.category)) map.set(c.category, []);
    map.get(c.category).push(c);
  }
  const order = CATS.map((x) => x[0]);
  return [...map.entries()].sort((a, b) => (order.indexOf(a[0]) + 99) % 99 - (order.indexOf(b[0]) + 99) % 99 || a[0].localeCompare(b[0]));
}

const RULE = '┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈';

function header(info) {
  const [em, hi] = greeting(info.now);
  return [
    '╭━━━━━━━━━━━━━━━━━━━╮',
    `┃   ✦ ${bold(info.botName.toUpperCase())} ✦`,
    '╰━━━━━━━━━━━━━━━━━━━╯',
    `${em} ${hi}, *${info.userName || 'kawan'}*!`,
    '',
    '┏━━━━━━━━━━━━━━━━━━━┓',
    `┃ 👑 Pemilik  : ${info.ownerName}`,
    `┃ ⚡ Mode     : ${info.mode}`,
    `┃ ⏳ Aktif    : ${info.uptime}`,
    `┃ 🧰 Perintah : ${info.total}`,
    '┗━━━━━━━━━━━━━━━━━━━┛',
  ].join('\n');
}

const wrapNames = (names, width = 34) => {
  const lines = []; let cur = '';
  for (const n of names) { if ((cur + ' ' + n).trim().length > width && cur) { lines.push(cur); cur = n; } else cur = (cur + ' ' + n).trim(); }
  if (cur) lines.push(cur);
  return lines;
};

/** Menu utama: kartu info + tiap kategori dengan daftar nama perintah ringkas. */
function overview(registry, info) {
  const groups = group(registry, info.isOwner), p = info.prefix;
  const total = groups.reduce((a, [, l]) => a + l.length, 0);
  let t = header({ ...info, total });
  groups.forEach(([cat, list], i) => {
    const m = META[cat] || { emoji: '📌', desc: '' };
    t += `\n\n╭─❮ ${m.emoji} *${cat.toUpperCase()}* ❯ ${i + 1}\n`;
    t += wrapNames(list.map((c) => '`' + p + c.name + '`')).map((l) => '│ ' + l).join('\n');
    t += '\n╰' + RULE;
  });
  t += `\n\n💡 *Detail & contoh:*\n• ${p}menu <nomor/nama> — mis. ${p}menu 4 atau ${p}menu utilitas\n• ${p}menu semua — semua perintah beserta fungsinya\n📎 Perintah media: kirim atau *balas* gambar/video/audio dengan perintahnya.\n\n_Sumber alat: Shin Tools — sama dengan versi web._`;
  return [t];
}

/** Halaman satu kategori: perintah, fungsi, dan cara pakai. */
function page(cat, list, info) {
  const m = META[cat] || { emoji: '📌', desc: '' }, p = info.prefix;
  let t = `╭━━━━━━━━━━━━━━━━━━━╮\n┃ ${m.emoji} *${cat.toUpperCase()}*\n┃ ${m.desc}\n╰━━━━━━━━━━━━━━━━━━━╯\n`;
  for (const c of list) {
    t += `\n➤ *${p}${c.usage}*\n   ╰ ${c.desc}` + (c.aliases && c.aliases.length ? `\n   ╰ alias: ${c.aliases.map((a) => p + a).join(' ')}` : '');
  }
  t += `\n\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n↩️ ${p}menu — kembali ke daftar kategori`;
  return t;
}

/** Semua perintah, dipecah jadi beberapa pesan agar tidak terpotong batas WhatsApp. */
function full(registry, info) {
  const groups = group(registry, info.isOwner), p = info.prefix, out = [];
  let cur = header({ ...info, total: groups.reduce((a, [, l]) => a + l.length, 0) });
  for (const [cat, list] of groups) {
    const m = META[cat] || { emoji: '📌' };
    const blk = `\n\n╭─❮ ${m.emoji} *${cat.toUpperCase()}* ❯\n` + list.map((c) => `│ ➤ ${p}${c.usage}\n│    ${c.desc}`).join('\n') + '\n╰' + RULE;
    if ((cur + blk).length > 3600) { out.push(cur); cur = blk.trim(); } else cur += blk;
  }
  out.push(cur);
  return out;
}

/** Cari kategori dari nomor atau nama (awalan, tanpa huruf besar/kecil). */
function findCategory(groups, q) {
  const s = String(q || '').trim().toLowerCase(); if (!s) return null;
  if (/^\d+$/.test(s)) return groups[+s - 1] || null;
  return groups.find(([n]) => n.toLowerCase() === s) || groups.find(([n]) => n.toLowerCase().startsWith(s)) || groups.find(([n]) => n.toLowerCase().includes(s)) || null;
}

function build(registry, info, arg) {
  const a = String(arg || '').trim().toLowerCase();
  if (!a) return overview(registry, info);
  if (['semua', 'all', 'full', 'lengkap'].includes(a)) return full(registry, info);
  const groups = group(registry, info.isOwner), hit = findCategory(groups, a);
  if (hit) return [page(hit[0], hit[1], info)];
  const cmd = registry.find((c) => !c.hidden && (!c.ownerOnly || info.isOwner) && (c.name === a || (c.aliases || []).includes(a)));
  if (cmd) return [`➤ *${info.prefix}${cmd.usage}*\n   ╰ ${cmd.desc}\n   ╰ kategori: ${cmd.category}` + (cmd.aliases && cmd.aliases.length ? `\n   ╰ alias: ${cmd.aliases.map((x) => info.prefix + x).join(' ')}` : '')];
  return [`Kategori atau perintah "${arg}" tidak ditemukan.\nKetik *${info.prefix}menu* untuk daftar kategori.`];
}

module.exports = { build, overview, page, full, group, findCategory, greeting, CATS, META };
