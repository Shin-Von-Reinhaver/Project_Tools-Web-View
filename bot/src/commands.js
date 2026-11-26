'use strict';
const cfg = require('./config');
const db = require('./db');
const media = require('./media');
const reminders = require('./reminders');

const pdfQueue = new Map(); // nomor -> { items: Buffer[], at }
const PDF_MAX = 15;
const startedAt = Date.now();

const fmtUp = (ms) => {
  const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
  return (d ? d + 'h ' : '') + (h ? h + 'j ' : '') + m + 'm ' + (s % 60) + 'd';
};

/** Kalkulator aman: hanya angka dan operator, tanpa eval variabel. */
function safeCalc(expr) {
  const e = String(expr).replace(/\s+/g, '').replace(/,/g, '.').replace(/x/gi, '*').replace(/\^/g, '**').replace(/:/g, '/');
  if (!e || e.length > 80) throw new Error('Ekspresi kosong atau terlalu panjang');
  if (!/^[0-9+\-*/().%]+$/.test(e)) throw new Error('Hanya angka dan + - * / ^ % ( ) yang diizinkan');
  if (/\*\*\d{3,}/.test(e)) throw new Error('Pangkat terlalu besar');
  const v = Function('"use strict";return (' + e + ')')();
  if (typeof v !== 'number' || !isFinite(v)) throw new Error('Hasil tidak valid');
  return v;
}

const fmtWhen = (t) => new Date(t).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

const need = (ctx, kinds) => async () => {
  const m = await ctx.getMedia();
  if (!m || !kinds.includes(m.kind)) return null;
  return m;
};

const registry = [
  // ---------- Umum ----------
  { name: 'menu', aliases: ['help', 'bantuan'], category: 'Umum', desc: 'Tampilkan daftar perintah', usage: 'menu',
    run: async (ctx) => {
      const cats = {};
      for (const c of registry) { if (c.hidden || (c.ownerOnly && !ctx.isOwner)) continue; (cats[c.category] = cats[c.category] || []).push(c); }
      let t = `*${cfg.botName}*\nPemilik: ${cfg.ownerName}\nAktif: ${fmtUp(Date.now() - startedAt)}\n`;
      for (const [k, list] of Object.entries(cats)) t += `\n*${k}*\n` + list.map((c) => `• ${ctx.prefix}${c.usage} — ${c.desc}`).join('\n') + '\n';
      t += `\nKetik ${ctx.prefix}menu kapan saja. Untuk perintah media, kirim atau balas gambar/video dengan perintahnya.`;
      return ctx.reply(t.trim());
    } },
  { name: 'ping', category: 'Umum', desc: 'Cek kecepatan respons', usage: 'ping',
    run: async (ctx) => { const t = Date.now(); await ctx.reply('Pong! 🏓'); return ctx.reply(`Respons ${Date.now() - t} ms · aktif ${fmtUp(Date.now() - startedAt)}`); } },
  { name: 'info', aliases: ['botinfo'], category: 'Umum', desc: 'Info bot dan statistik', usage: 'info',
    run: async (ctx) => {
      const d = db.get();
      return ctx.reply(`*${cfg.botName}*\nPemilik: ${cfg.ownerName}\nMode: ${d.mode}\nPengguna: ${Object.keys(d.users).length}\nPerintah dijalankan: ${d.stats.commands}\nAktif: ${fmtUp(Date.now() - startedAt)}\nNode ${process.version}`);
    } },
  { name: 'owner', aliases: ['creator'], category: 'Umum', desc: 'Kontak pemilik bot', usage: 'owner',
    run: async (ctx) => ctx.reply(`Pemilik bot: *${cfg.ownerName}*` + (cfg.ownerNumbers[0] ? `\nwa.me/${cfg.ownerNumbers[0]}` : '')) },

  // ---------- Media ----------
  { name: 'sticker', aliases: ['s', 'stiker'], category: 'Media', desc: 'Gambar/video/GIF jadi stiker. Video maks 10 dtk & 500 KB. Opsi: crop, angka = durasi dtk, 70% = resolusi', usage: 'sticker [crop] [6] [70%]', heavy: true,
    run: async (ctx) => {
      const m = await need(ctx, ['image', 'video', 'sticker'])();
      if (!m) return ctx.reply(`Kirim atau balas gambar/video dengan *${ctx.prefix}sticker*.\nVideo: atur sendiri bila hasil terlalu besar, mis. *${ctx.prefix}sticker 6* (durasi 6 detik) atau *${ctx.prefix}sticker 70%* (resolusi 70%).`);
      const opt = { mode: /crop|penuh|cover/i.test(ctx.text) ? 'cover' : 'contain', pack: cfg.stickerPack, author: cfg.stickerAuthor };
      for (const t of ctx.args) {
        let x;
        if ((x = /^(\d{2,3})%$/.exec(t))) opt.scale = Math.min(100, Math.max(30, +x[1])) / 100;
        else if ((x = /^(\d{1,2})(?:s|dtk|detik)?$/i.exec(t)) && +x[1] > 0) opt.seconds = Math.min(media.MAX_STICKER_SECONDS, +x[1]);
      }
      if (m.kind === 'sticker') return ctx.sendSticker(m.buffer);
      if (m.kind === 'video') {
        if (!opt.seconds && m.seconds > media.MAX_STICKER_SECONDS) await ctx.reply(`Video ${m.seconds} detik. Hanya ${media.MAX_STICKER_SECONDS} detik pertama yang dipakai (batas stiker WhatsApp).`);
        const r = await media.videoToStickerInfo(m.buffer, opt);
        await ctx.sendSticker(r.buffer);
        return ctx.reply(`Stiker ${r.width}×${r.height} · ${r.seconds.toFixed(1)} dtk · ${Math.round(r.bytes / 1024)} KB`
          + (r.reduced ? `\nDiperpendek/diperkecil otomatis agar ≤ 500 KB. Atur sendiri: ${ctx.prefix}sticker 6 atau ${ctx.prefix}sticker 70%` : ''));
      }
      return ctx.sendSticker(await media.imageToSticker(m.buffer, opt));
    } },
  { name: 'tomp3', aliases: ['mp3'], category: 'Media', desc: 'Balas video/pesan suara untuk jadi MP3', usage: 'tomp3', heavy: true,
    run: async (ctx) => {
      const m = await need(ctx, ['video', 'audio'])();
      if (!m) return ctx.reply(`Kirim atau balas video/pesan suara dengan *${ctx.prefix}tomp3*.`);
      return ctx.sendAudio(await media.toAudio(m.buffer));
    } },
  { name: 'kompresvideo', aliases: ['kvideo'], category: 'Media', desc: 'Kecilkan video ke ukuran tertentu (MB, default 15, batas kirim WhatsApp 16)', usage: 'kompresvideo [MB]', heavy: true,
    run: async (ctx) => {
      const m = await need(ctx, ['video'])();
      if (!m) return ctx.reply(`Kirim atau balas video dengan *${ctx.prefix}kompresvideo 10* (target 10 MB).`);
      const mb = Math.min(64, Math.max(1, parseFloat(String(ctx.args[0] || '15').replace(',', '.')) || 15));
      await ctx.reply('Memproses video, mohon tunggu…');
      const out = await media.compressVideo(m.buffer, mb);
      return ctx.sendVideo(out, `${(m.buffer.length / 1048576).toFixed(1)} MB → ${(out.length / 1048576).toFixed(1)} MB`);
    } },
  { name: 'potong', aliases: ['trim'], category: 'Media', desc: 'Potong video: potong <mulai> <selesai> (detik atau mm:ss)', usage: 'potong 5 15', heavy: true,
    run: async (ctx) => {
      const m = await need(ctx, ['video'])();
      const sec = (t) => { const p = String(t || '').split(':').map(Number); return p.some(isNaN) ? NaN : p.reduce((a, v) => a * 60 + v, 0); };
      const [from, to] = [sec(ctx.args[0]), sec(ctx.args[1])];
      if (!m || isNaN(from) || isNaN(to)) return ctx.reply(`Kirim atau balas video dengan *${ctx.prefix}potong 5 15* (dari detik 5 sampai 15) atau *${ctx.prefix}potong 0:30 1:10*.`);
      if (to <= from) return ctx.reply('Waktu selesai harus lebih besar dari waktu mulai.');
      if (m.seconds && from >= m.seconds) return ctx.reply(`Video hanya ${m.seconds} detik.`);
      return ctx.sendVideo(await media.trimVideo(m.buffer, from, to), `Potongan ${from}–${to} detik`);
    } },
  { name: 'toimg', aliases: ['toimage'], category: 'Media', desc: 'Balas stiker untuk jadi gambar (GIF bila animasi)', usage: 'toimg', heavy: true,
    run: async (ctx) => {
      const m = await need(ctx, ['sticker'])();
      if (!m) return ctx.reply(`Balas sebuah stiker dengan *${ctx.prefix}toimg*.`);
      const r = await media.stickerToImage(m.buffer);
      return r.type === 'gif' ? ctx.sendDoc(r.buffer, 'stiker.gif', 'image/gif') : ctx.sendImage(r.buffer, 'Selesai');
    } },
  { name: 'resize', category: 'Media', desc: 'Ubah ukuran gambar (sisi terpanjang, px)', usage: 'resize <px>', heavy: true,
    run: async (ctx) => {
      const px = parseInt(ctx.args[0], 10);
      if (!px || px < 32 || px > 6000) return ctx.reply(`Contoh: balas gambar dengan *${ctx.prefix}resize 800* (32 sampai 6000).`);
      const m = await need(ctx, ['image'])();
      if (!m) return ctx.reply('Kirim atau balas sebuah gambar.');
      return ctx.sendDoc(await media.resizeImage(m.buffer, px), `resize-${px}.jpg`, 'image/jpeg');
    } },
  { name: 'kompres', aliases: ['compress'], category: 'Media', desc: 'Kompres gambar ke target KB', usage: 'kompres <kb>', heavy: true,
    run: async (ctx) => {
      const kb = parseInt(ctx.args[0], 10);
      if (!kb || kb < 10 || kb > 20000) return ctx.reply(`Contoh: balas gambar dengan *${ctx.prefix}kompres 200* (10 sampai 20000 KB).`);
      const m = await need(ctx, ['image'])();
      if (!m) return ctx.reply('Kirim atau balas sebuah gambar.');
      const out = await media.compressImage(m.buffer, kb);
      return ctx.sendDoc(out, `kompres-${Math.round(out.length / 1024)}kb.jpg`, 'image/jpeg');
    } },
  { name: 'topdf', category: 'Media', desc: 'Satu gambar jadi PDF', usage: 'topdf', heavy: true,
    run: async (ctx) => {
      const m = await need(ctx, ['image'])();
      if (!m) return ctx.reply(`Kirim atau balas gambar dengan *${ctx.prefix}topdf*. Untuk banyak gambar pakai *${ctx.prefix}pdfadd* lalu *${ctx.prefix}pdfdone*.`);
      return ctx.sendDoc(await media.imagesToPdf([m.buffer]), 'dokumen.pdf', 'application/pdf');
    } },
  { name: 'pdfadd', category: 'Media', desc: 'Tambah gambar ke antrean PDF (maks 15)', usage: 'pdfadd', heavy: true,
    run: async (ctx) => {
      const m = await need(ctx, ['image'])();
      if (!m) return ctx.reply('Kirim atau balas gambar yang ingin ditambahkan.');
      const q = pdfQueue.get(ctx.sender) || { items: [], at: 0 };
      if (q.items.length >= PDF_MAX) return ctx.reply(`Antrean penuh (${PDF_MAX}). Ketik *${ctx.prefix}pdfdone*.`);
      q.items.push(m.buffer); q.at = Date.now(); pdfQueue.set(ctx.sender, q);
      return ctx.reply(`Ditambahkan. Antrean: ${q.items.length} gambar. Ketik *${ctx.prefix}pdfdone* bila sudah selesai.`);
    } },
  { name: 'pdfdone', category: 'Media', desc: 'Buat PDF dari antrean gambar', usage: 'pdfdone', heavy: true,
    run: async (ctx) => {
      const q = pdfQueue.get(ctx.sender);
      if (!q || !q.items.length) return ctx.reply(`Antrean kosong. Tambahkan gambar dengan *${ctx.prefix}pdfadd*.`);
      pdfQueue.delete(ctx.sender);
      return ctx.sendDoc(await media.imagesToPdf(q.items), 'dokumen.pdf', 'application/pdf');
    } },
  { name: 'pdfbatal', category: 'Media', desc: 'Kosongkan antrean PDF', usage: 'pdfbatal',
    run: async (ctx) => { pdfQueue.delete(ctx.sender); return ctx.reply('Antrean PDF dikosongkan.'); } },

  // ---------- Alat ----------
  { name: 'qr', category: 'Alat', desc: 'Buat kode QR dari teks/tautan', usage: 'qr <teks>',
    run: async (ctx) => {
      if (!ctx.text) return ctx.reply(`Contoh: *${ctx.prefix}qr https://contoh.com*`);
      return ctx.sendImage(await media.makeQr(ctx.text), 'Kode QR');
    } },
  { name: 'hitung', aliases: ['calc'], category: 'Alat', desc: 'Kalkulator (+ - * / ^ %)', usage: 'hitung <ekspresi>',
    run: async (ctx) => {
      if (!ctx.text) return ctx.reply(`Contoh: *${ctx.prefix}hitung (12+8)*3/4*`);
      try { return ctx.reply(`${ctx.text} = *${safeCalc(ctx.text)}*`); } catch (e) { return ctx.reply('Tidak bisa dihitung: ' + e.message); }
    } },
  { name: 'pilih', category: 'Alat', desc: 'Pilih acak dari beberapa opsi (pisah |)', usage: 'pilih a | b | c',
    run: async (ctx) => {
      const o = ctx.text.split('|').map((s) => s.trim()).filter(Boolean);
      if (o.length < 2) return ctx.reply(`Contoh: *${ctx.prefix}pilih makan | tidur | main*`);
      return ctx.reply('Pilihanku: *' + o[Math.floor(Math.random() * o.length)] + '*');
    } },
  { name: 'dadu', category: 'Alat', desc: 'Lempar dadu (opsional jumlah sisi)', usage: 'dadu [sisi]',
    run: async (ctx) => { const n = Math.min(1000, Math.max(2, parseInt(ctx.args[0], 10) || 6)); return ctx.reply(`🎲 d${n}: *${1 + Math.floor(Math.random() * n)}*`); } },

  // ---------- Pemilik ----------
  { name: 'mode', category: 'Pemilik', ownerOnly: true, desc: 'Atur mode: public atau self', usage: 'mode public|self',
    run: async (ctx) => {
      const v = (ctx.args[0] || '').toLowerCase();
      if (!['public', 'self'].includes(v)) return ctx.reply(`Mode sekarang: *${db.get().mode}*. Pakai: ${ctx.prefix}mode public atau ${ctx.prefix}mode self`);
      db.get().mode = v; db.save();
      return ctx.reply(`Mode diubah ke *${v}*.` + (v === 'self' ? ' Hanya pemilik yang dilayani.' : ''));
    } },
  { name: 'ban', category: 'Pemilik', ownerOnly: true, desc: 'Blokir pengguna dari bot', usage: 'ban <nomor>',
    run: async (ctx) => {
      const n = cfg.digits(ctx.args[0] || ctx.mentioned[0] || '');
      if (!n) return ctx.reply(`Contoh: ${ctx.prefix}ban 6281234567890 (atau tag orangnya)`);
      if (cfg.ownerNumbers.includes(n)) return ctx.reply('Pemilik tidak bisa diblokir.');
      const d = db.get(); if (!d.banned.includes(n)) d.banned.push(n); db.save();
      return ctx.reply(`${n} diblokir dari bot.`);
    } },
  { name: 'unban', category: 'Pemilik', ownerOnly: true, desc: 'Buka blokir pengguna', usage: 'unban <nomor>',
    run: async (ctx) => {
      const n = cfg.digits(ctx.args[0] || ctx.mentioned[0] || '');
      const d = db.get(); d.banned = d.banned.filter((x) => x !== n); db.save();
      return ctx.reply(`${n || 'Nomor'} dibuka blokirnya.`);
    } },
  { name: 'bc', aliases: ['broadcast'], category: 'Pemilik', ownerOnly: true, desc: 'Kirim pesan ke semua pengguna bot', usage: 'bc <pesan>',
    run: async (ctx) => {
      if (!ctx.text) return ctx.reply(`Contoh: ${ctx.prefix}bc Halo semua!`);
      const list = Object.keys(db.get().users).filter((n) => !db.get().banned.includes(n));
      await ctx.reply(`Mengirim ke ${list.length} pengguna (jeda 2 detik per pesan)…`);
      let ok = 0;
      for (const n of list) { try { await ctx.sendTo(n + '@s.whatsapp.net', `📢 *Pengumuman*\n${ctx.text}`); ok++; } catch (e) { /* lewati */ } await new Promise((r) => setTimeout(r, 2000)); }
      return ctx.reply(`Selesai: ${ok}/${list.length} terkirim.`);
    } },
  { name: 'stats', category: 'Pemilik', ownerOnly: true, desc: 'Statistik penggunaan perintah', usage: 'stats',
    run: async (ctx) => {
      const d = db.get(), top = Object.entries(d.stats.byCommand).sort((a, b) => b[1] - a[1]).slice(0, 8);
      return ctx.reply(`Pengguna: ${Object.keys(d.users).length}\nDiblokir: ${d.banned.length}\nTotal perintah: ${d.stats.commands}\n\n` + (top.map(([k, v]) => `${k}: ${v}`).join('\n') || 'Belum ada data'));
    } },
  // ---------- Pengingat ----------
  { name: 'ingatkan', aliases: ['remind', 'pengingat'], category: 'Alat', desc: 'Pengingat: ingatkan 10m minum obat | 1j30m | 14:30 rapat', usage: 'ingatkan 10m <pesan>',
    run: async (ctx) => {
      const [when, ...rest] = ctx.args, text = rest.join(' ').trim(), at = reminders.parseWhen(when);
      if (!at || !text) return ctx.reply(`Format: *${ctx.prefix}ingatkan 10m minum obat*\nWaktu: d=detik, m=menit, j=jam, h=hari (mis. 1j30m, 2h) atau jam 14:30 (waktu server). Maks 30 hari.`);
      const r = reminders.add({ chat: ctx.chat || ctx.sender + '@s.whatsapp.net', sender: ctx.sender, at, text });
      return ctx.reply(`⏰ Siap. Pengingat #${r.id} pada ${fmtWhen(at)}:\n${text}`);
    } },
  { name: 'pengingatku', aliases: ['ingatan'], category: 'Alat', desc: 'Daftar pengingat aktif; batalkan dengan batalingat <no>', usage: 'pengingatku',
    run: async (ctx) => {
      const l = reminders.list(ctx.sender);
      return ctx.reply(l.length ? l.map((r) => `#${r.id} · ${fmtWhen(r.at)} · ${r.text}`).join('\n') + `\n\nBatalkan: ${ctx.prefix}batalingat <no>` : 'Belum ada pengingat aktif.');
    } },
  { name: 'batalingat', aliases: ['hapusingat'], category: 'Alat', desc: 'Batalkan pengingat berdasarkan nomor', usage: 'batalingat <no>',
    run: async (ctx) => {
      const id = parseInt(String(ctx.args[0] || '').replace('#', ''), 10);
      if (!id) return ctx.reply(`Contoh: *${ctx.prefix}batalingat 3* (lihat nomor lewat ${ctx.prefix}pengingatku)`);
      return ctx.reply(reminders.remove(id, ctx.sender, ctx.isOwner) ? `Pengingat #${id} dibatalkan.` : 'Pengingat tidak ditemukan.');
    } },
];

const index = new Map();
for (const c of registry) { index.set(c.name, c); (c.aliases || []).forEach((a) => index.set(a, c)); }
const find = (n) => index.get(String(n).toLowerCase());

/** Daftar perintah untuk panel web (tanpa fungsi). */
const publicList = () => registry.filter((c) => !c.hidden).map((c) => ({ name: c.name, aliases: c.aliases || [], category: c.category, desc: c.desc, usage: c.usage, ownerOnly: !!c.ownerOnly }));

module.exports = { registry, find, publicList, safeCalc, fmtUp, pdfQueue };
