'use strict';
const cfg = require('./config');
const db = require('./db');
const media = require('./media');
const reminders = require('./reminders');
const tools = require('./tools');
const menu = require('./menu');

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


/** Teks perintah; bila kosong, pakai teks pesan yang dibalas. */
const bodyOf = (ctx) => (ctx.text || ctx.quotedText || '').trim();
/** Untuk perintah berpola "<sub> <isi>": bila isi kosong, ambil dari pesan yang dibalas. */
const withQuoted = (ctx) => {
  const sub = ctx.args[0] || '';
  const rest = ctx.text.slice(ctx.text.indexOf(sub) + sub.length).trim();
  return [ctx.args, !rest && ctx.quotedText ? (ctx.text + '\n' + ctx.quotedText).trim() : ctx.text];
};
/** Ubah "Contoh: diskon 1 2" menjadi "Contoh: .diskon 1 2" agar sesuai awalan bot. */
const addPrefix = (prefix, msg) => {
  const names = [...new Set(registry.flatMap((c) => [c.name, ...(c.aliases || []).filter((a) => a.length > 2)]))].sort((a, b) => b.length - a.length);
  const re = new RegExp('(^|\\n)((?:Contoh: |• )?)(' + names.join('|') + ')(?=[ \\n]|$)', 'g');
  return msg.replace(re, (m, a, b, c) => a + b + prefix + c);
};
/** Bungkus perintah teks: galat validasi tampil ramah, bukan "Terjadi kesalahan". */
const T = (fn) => async (ctx) => {
  let r;
  try { r = await fn(ctx); } catch (e) { return ctx.reply('⚠️ ' + addPrefix(ctx.prefix, e.message || 'Gagal diproses')); }
  if (r) return ctx.reply(r);
};
const sub = (ctx, kinds, hint) => async () => {
  const m = await ctx.getMedia();
  if (!m || !kinds.includes(m.kind)) throw new Error(hint);
  return m;
};
function parseSatuan(args) {
  const a = args.slice(); const m = /^(-?[\d.,]+)(.*)$/.exec(a[0] || '');
  if (!m) throw new Error('Contoh: satuan 5 km m\nsatuan 100 c f\nsatuan 2 gb mb');
  a[0] = m[1]; if (m[2]) a.splice(1, 0, m[2]);
  const rest = a.slice(1).filter((x) => !/^(ke|to|->|→)$/i.test(x));
  if (rest.length < 2) throw new Error('Contoh: satuan 5 km m\nsatuan 100 c f\nsatuan 2 gb mb');
  const v = parseFloat(a[0].replace(',', '.')); if (!Number.isFinite(v)) throw new Error('Nilai harus angka');
  const r = tools.convert(v, rest[0], rest[1]);
  return `📏 ${tools.nf(v, 6)} ${r.from} = *${tools.nf(r.result, 8)} ${r.to}*  _(${r.cat})_`;
}

const registry = [
  // ---------- Umum ----------
  { name: 'menu', aliases: ['help', 'bantuan', 'start'], category: 'Umum', desc: 'Daftar perintah. Detail: menu <nomor/nama>, semua: menu semua', usage: 'menu [kategori]',
    run: async (ctx) => {
      const info = { botName: cfg.botName, ownerName: cfg.ownerName, mode: db.get().mode, uptime: fmtUp(Date.now() - startedAt), userName: ctx.name, prefix: ctx.prefix, isOwner: !!ctx.isOwner, now: new Date() };
      for (const part of menu.build(registry, info, ctx.text)) await ctx.reply(part);
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
  { name: 'sticker', aliases: ['s', 'stiker'], category: 'Stiker & Gambar', desc: 'Gambar/video/GIF jadi stiker. Video maks 10 dtk & 500 KB. Opsi: crop, angka = durasi dtk, 70% = resolusi', usage: 'sticker [crop] [6] [70%]', heavy: true,
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
  { name: 'tomp3', aliases: ['mp3'], category: 'Video & Audio', desc: 'Balas video/pesan suara untuk jadi MP3', usage: 'tomp3', heavy: true,
    run: async (ctx) => {
      const m = await need(ctx, ['video', 'audio'])();
      if (!m) return ctx.reply(`Kirim atau balas video/pesan suara dengan *${ctx.prefix}tomp3*.`);
      return ctx.sendAudio(await media.toAudio(m.buffer));
    } },
  { name: 'kompresvideo', aliases: ['kvideo'], category: 'Video & Audio', desc: 'Kecilkan video ke ukuran tertentu (MB, default 15, batas kirim WhatsApp 16)', usage: 'kompresvideo [MB]', heavy: true,
    run: async (ctx) => {
      const m = await need(ctx, ['video'])();
      if (!m) return ctx.reply(`Kirim atau balas video dengan *${ctx.prefix}kompresvideo 10* (target 10 MB).`);
      const mb = Math.min(64, Math.max(1, parseFloat(String(ctx.args[0] || '15').replace(',', '.')) || 15));
      await ctx.reply('Memproses video, mohon tunggu…');
      const out = await media.compressVideo(m.buffer, mb);
      return ctx.sendVideo(out, `${(m.buffer.length / 1048576).toFixed(1)} MB → ${(out.length / 1048576).toFixed(1)} MB`);
    } },
  { name: 'potong', aliases: ['trim'], category: 'Video & Audio', desc: 'Potong video: potong <mulai> <selesai> (detik atau mm:ss)', usage: 'potong 5 15', heavy: true,
    run: async (ctx) => {
      const m = await need(ctx, ['video'])();
      const sec = (t) => { const p = String(t || '').split(':').map(Number); return p.some(isNaN) ? NaN : p.reduce((a, v) => a * 60 + v, 0); };
      const [from, to] = [sec(ctx.args[0]), sec(ctx.args[1])];
      if (!m || isNaN(from) || isNaN(to)) return ctx.reply(`Kirim atau balas video dengan *${ctx.prefix}potong 5 15* (dari detik 5 sampai 15) atau *${ctx.prefix}potong 0:30 1:10*.`);
      if (to <= from) return ctx.reply('Waktu selesai harus lebih besar dari waktu mulai.');
      if (m.seconds && from >= m.seconds) return ctx.reply(`Video hanya ${m.seconds} detik.`);
      return ctx.sendVideo(await media.trimVideo(m.buffer, from, to), `Potongan ${from}–${to} detik`);
    } },
  { name: 'toimg', aliases: ['toimage'], category: 'Stiker & Gambar', desc: 'Balas stiker untuk jadi gambar (GIF bila animasi)', usage: 'toimg', heavy: true,
    run: async (ctx) => {
      const m = await need(ctx, ['sticker'])();
      if (!m) return ctx.reply(`Balas sebuah stiker dengan *${ctx.prefix}toimg*.`);
      const r = await media.stickerToImage(m.buffer);
      return r.type === 'gif' ? ctx.sendDoc(r.buffer, 'stiker.gif', 'image/gif') : ctx.sendImage(r.buffer, 'Selesai');
    } },
  { name: 'resize', category: 'Stiker & Gambar', desc: 'Ubah ukuran gambar (sisi terpanjang, px)', usage: 'resize <px>', heavy: true,
    run: async (ctx) => {
      const px = parseInt(ctx.args[0], 10);
      if (!px || px < 32 || px > 6000) return ctx.reply(`Contoh: balas gambar dengan *${ctx.prefix}resize 800* (32 sampai 6000).`);
      const m = await need(ctx, ['image'])();
      if (!m) return ctx.reply('Kirim atau balas sebuah gambar.');
      return ctx.sendDoc(await media.resizeImage(m.buffer, px), `resize-${px}.jpg`, 'image/jpeg');
    } },
  { name: 'kompres', aliases: ['compress'], category: 'Stiker & Gambar', desc: 'Kompres gambar ke target KB', usage: 'kompres <kb>', heavy: true,
    run: async (ctx) => {
      const kb = parseInt(ctx.args[0], 10);
      if (!kb || kb < 10 || kb > 20000) return ctx.reply(`Contoh: balas gambar dengan *${ctx.prefix}kompres 200* (10 sampai 20000 KB).`);
      const m = await need(ctx, ['image'])();
      if (!m) return ctx.reply('Kirim atau balas sebuah gambar.');
      const out = await media.compressImage(m.buffer, kb);
      return ctx.sendDoc(out, `kompres-${Math.round(out.length / 1024)}kb.jpg`, 'image/jpeg');
    } },
  { name: 'topdf', category: 'Stiker & Gambar', desc: 'Satu gambar jadi PDF', usage: 'topdf', heavy: true,
    run: async (ctx) => {
      const m = await need(ctx, ['image'])();
      if (!m) return ctx.reply(`Kirim atau balas gambar dengan *${ctx.prefix}topdf*. Untuk banyak gambar pakai *${ctx.prefix}pdfadd* lalu *${ctx.prefix}pdfdone*.`);
      return ctx.sendDoc(await media.imagesToPdf([m.buffer]), 'dokumen.pdf', 'application/pdf');
    } },
  { name: 'pdfadd', category: 'Stiker & Gambar', desc: 'Tambah gambar ke antrean PDF (maks 15)', usage: 'pdfadd', heavy: true,
    run: async (ctx) => {
      const m = await need(ctx, ['image'])();
      if (!m) return ctx.reply('Kirim atau balas gambar yang ingin ditambahkan.');
      const q = pdfQueue.get(ctx.sender) || { items: [], at: 0 };
      if (q.items.length >= PDF_MAX) return ctx.reply(`Antrean penuh (${PDF_MAX}). Ketik *${ctx.prefix}pdfdone*.`);
      q.items.push(m.buffer); q.at = Date.now(); pdfQueue.set(ctx.sender, q);
      return ctx.reply(`Ditambahkan. Antrean: ${q.items.length} gambar. Ketik *${ctx.prefix}pdfdone* bila sudah selesai.`);
    } },
  { name: 'pdfdone', category: 'Stiker & Gambar', desc: 'Buat PDF dari antrean gambar', usage: 'pdfdone', heavy: true,
    run: async (ctx) => {
      const q = pdfQueue.get(ctx.sender);
      if (!q || !q.items.length) return ctx.reply(`Antrean kosong. Tambahkan gambar dengan *${ctx.prefix}pdfadd*.`);
      pdfQueue.delete(ctx.sender);
      return ctx.sendDoc(await media.imagesToPdf(q.items), 'dokumen.pdf', 'application/pdf');
    } },
  { name: 'pdfbatal', category: 'Stiker & Gambar', desc: 'Kosongkan antrean PDF', usage: 'pdfbatal',
    run: async (ctx) => { pdfQueue.delete(ctx.sender); return ctx.reply('Antrean PDF dikosongkan.'); } },

  // ---------- Alat ----------
  { name: 'qr', category: 'QR & Link', desc: 'Buat kode QR dari teks/tautan', usage: 'qr <teks>',
    run: async (ctx) => {
      if (!ctx.text) return ctx.reply(`Contoh: *${ctx.prefix}qr https://contoh.com*`);
      return ctx.sendImage(await media.makeQr(ctx.text), 'Kode QR');
    } },
  { name: 'hitung', aliases: ['calc', 'kalkulator'], category: 'Utilitas', desc: 'Kalkulator ilmiah: + − × ÷ ^ % ! √ sin cos tan log ln π. Tambah "rad" untuk radian', usage: 'hitung <ekspresi>',
    run: T((ctx) => {
      let e = bodyOf(ctx); if (!e) throw new Error('Contoh: hitung (12+8)*3/4\nhitung sin(30) + 2^10\nhitung 5! + √81');
      const rad = /^rad\b/i.test(e); if (rad) e = e.slice(3).trim();
      return `${e} = *${tools.fmtCalc(tools.calc(e, !rad))}*${rad ? ' _(radian)_' : ''}`;
    }) },
  { name: 'pilih', category: 'Utilitas', desc: 'Pilih acak dari beberapa opsi (pisah |)', usage: 'pilih a | b | c',
    run: async (ctx) => {
      const o = ctx.text.split('|').map((s) => s.trim()).filter(Boolean);
      if (o.length < 2) return ctx.reply(`Contoh: *${ctx.prefix}pilih makan | tidur | main*`);
      return ctx.reply('Pilihanku: *' + o[Math.floor(Math.random() * o.length)] + '*');
    } },
  { name: 'dadu', category: 'Utilitas', desc: 'Lempar dadu (opsional jumlah sisi)', usage: 'dadu [sisi]',
    run: async (ctx) => { const n = Math.min(1000, Math.max(2, parseInt(ctx.args[0], 10) || 6)); return ctx.reply(`🎲 d${n}: *${1 + Math.floor(Math.random() * n)}*`); } },

  // ---------- Utilitas (padanan alat web) ----------
  { name: 'persen', category: 'Utilitas', desc: 'Persen: 15% dari 200 · 25 dari 200 · 80 ke 100 (naik/turun)', usage: 'persen 15% dari 200', run: T((ctx) => tools.persen(ctx.args)) },
  { name: 'diskon', aliases: ['promo'], category: 'Utilitas', desc: 'Diskon bertingkat + PPN: harga, diskon %, diskon 2 %, PPN %', usage: 'diskon 250000 30 10 11', run: T((ctx) => tools.diskon(ctx.args)) },
  { name: 'margin', aliases: ['untung'], category: 'Utilitas', desc: 'Laba, margin, dan markup dari modal dan harga jual', usage: 'margin 70rb 100rb', run: T((ctx) => tools.margin(ctx.args)) },
  { name: 'satuan', aliases: ['konversi', 'unit'], category: 'Utilitas', desc: 'Konversi satuan: panjang, massa, volume, suhu, data, waktu, dll.', usage: 'satuan 5 km m', run: T((ctx) => parseSatuan(ctx.args)) },
  { name: 'kurs', aliases: ['currency'], category: 'Utilitas', desc: 'Konversi mata uang (kurs terbaru, cadangan offline)', usage: 'kurs 100 usd idr', run: T((ctx) => tools.kurs(ctx.args)) },
  { name: 'cicilan', aliases: ['kpr'], category: 'Utilitas', desc: 'Cicilan KPR/kredit: pinjaman, bunga %/thn, bulan [flat]', usage: 'cicilan 300jt 9 120', run: T((ctx) => tools.cicilan(ctx.args)) },
  { name: 'tabungan', category: 'Utilitas', desc: 'Hasil tabungan berbunga: awal, bulanan, bunga %/thn, tahun', usage: 'tabungan 10jt 1jt 6 10', run: T((ctx) => tools.tabungan(ctx.args)) },
  { name: 'bagi', aliases: ['patungan', 'split'], category: 'Utilitas', desc: 'Bagi tagihan: subtotal, orang, service %, pajak %, tip %', usage: 'bagi 450rb 4 5 10', run: T((ctx) => tools.bagi(ctx.args)) },
  { name: 'bmi', category: 'Utilitas', desc: 'BMI, berat sehat, BMR, kalori: tinggi cm, berat kg, umur, p/w', usage: 'bmi 165 60 25 p', run: T((ctx) => tools.bmi(ctx.args)) },
  { name: 'sandi', aliases: ['password', 'pass'], category: 'Utilitas', desc: 'Buat kata sandi / PIN / frasa acak yang aman', usage: 'sandi [panjang] [pin|frasa]', run: T((ctx) => tools.sandi(ctx.args)) },
  { name: 'umur', aliases: ['usia'], category: 'Utilitas', desc: 'Hitung umur, hari ke ulang tahun, dan weton', usage: 'umur 2000-01-31', run: T((ctx) => tools.umur(ctx.args)) },
  { name: 'selisih', category: 'Utilitas', desc: 'Selisih dua tanggal (hari, minggu, tahun-bulan-hari)', usage: 'selisih 2024-01-01 2024-12-31', run: T((ctx) => tools.selisih(ctx.args)) },
  { name: 'tambahhari', aliases: ['tanggal'], category: 'Utilitas', desc: 'Tambah/kurangi hari dari sebuah tanggal', usage: 'tambahhari 2024-01-01 30', run: T((ctx) => tools.tanggalTambah(ctx.args)) },
  { name: 'weton', category: 'Utilitas', desc: 'Hari dan pasaran Jawa (weton) suatu tanggal', usage: 'weton 2000-01-31', run: T((ctx) => tools.wetonCmd(ctx.args)) },
  { name: 'acak', aliases: ['shuffle'], category: 'Utilitas', desc: 'Acak urutan daftar (pisah koma atau baris baru)', usage: 'acak a, b, c, d', run: T((ctx) => tools.acak(bodyOf(ctx))) },
  { name: 'tim', category: 'Utilitas', desc: 'Bagi nama menjadi beberapa tim acak', usage: 'tim 2 Ani, Budi, Cici, Dedi', run: T((ctx) => tools.tim(ctx.args, ctx.text || ctx.quotedText || '')) },

  // ---------- Teks ----------
  { name: 'huruf', aliases: ['case'], category: 'Teks', desc: 'Ubah huruf: besar, kecil, judul, kalimat, camel, pascal, snake, kebab, slug, balik, tukar', usage: 'huruf besar halo dunia', run: T((ctx) => { const [a, t] = withQuoted(ctx); return tools.huruf(a, t); }) },
  { name: 'hitungkata', aliases: ['kata', 'wc'], category: 'Teks', desc: 'Hitung kata, karakter, kalimat, dan waktu baca (bisa balas pesan)', usage: 'hitungkata <teks>', run: T((ctx) => tools.hitungKata(bodyOf(ctx))) },
  { name: 'gaya', aliases: ['font', 'fancy'], category: 'Teks', desc: 'Ubah teks ke 12 gaya unik: tebal, miring, bulat, kotak, dll.', usage: 'gaya Halo Dunia', run: T((ctx) => tools.gaya(bodyOf(ctx))) },
  { name: 'terbilang', category: 'Teks', desc: 'Angka jadi kata (Indonesia, rupiah, Inggris) + Romawi', usage: 'terbilang 1234567', run: T((ctx) => tools.terbilang(ctx.args)) },
  { name: 'romawi', aliases: ['roman'], category: 'Teks', desc: 'Angka ⇄ angka Romawi (1–3999)', usage: 'romawi 1994', run: T((ctx) => tools.romawi(ctx.args)) },
  { name: 'rapikan', aliases: ['list'], category: 'Teks', desc: 'Rapikan daftar: urut, urutbalik, unik, nomor, acak, balik (daftar di baris bawah)', usage: 'rapikan urut', run: T((ctx) => { const [a, t] = withQuoted(ctx); return tools.rapikan(a, t); }) },

  // ---------- Developer ----------
  { name: 'json', category: 'Developer', desc: 'Rapikan / perkecil / cek / urutkan kunci JSON dengan lokasi galat', usage: 'json {"a":1}', run: T((ctx) => { const [a, t] = withQuoted(ctx); return tools.json(a, t); }) },
  { name: 'base64', aliases: ['b64'], category: 'Developer', desc: 'Encode / decode Base64 (aman untuk Unicode)', usage: 'base64 enc Halo', run: T((ctx) => { const [a, t] = withQuoted(ctx); return tools.base64(a, t); }) },
  { name: 'hash', aliases: ['md5', 'sha256'], category: 'Developer', desc: 'Hash MD5 / SHA-1 / SHA-256 / SHA-512 dari teks', usage: 'hash Halo', run: T((ctx) => { const [a, t] = withQuoted(ctx); return /^(md5|sha256)$/.test(ctx.cmdName) ? tools.hash([ctx.cmdName, ...a], ctx.cmdName + ' ' + t) : tools.hash(a, t); }) },
  { name: 'uuid', aliases: ['ulid'], category: 'Developer', desc: 'ID unik acak: UUID v4, UUID v7, ULID', usage: 'uuid [v4|v7|ulid] [jumlah]', run: T((ctx) => tools.uuid(/ulid/i.test(ctx.cmdName || '') ? [...ctx.args, 'ulid'] : ctx.args)) },
  { name: 'jwt', category: 'Developer', desc: 'Baca isi token JWT; beri kunci untuk cek tanda tangan HS256', usage: 'jwt <token> [kunci]', run: T((ctx) => tools.jwt(ctx.args.length ? ctx.args : bodyOf(ctx).split(/\s+/))) },
  { name: 'waktu', aliases: ['epoch', 'timestamp'], category: 'Developer', desc: 'Unix timestamp ⇄ tanggal (WIB/WITA/WIT/UTC)', usage: 'waktu 1735689600', run: T((ctx) => tools.waktu(ctx.args)) },
  { name: 'url', category: 'Developer', desc: 'Encode / decode URL, atau bedah bagian-bagiannya', usage: 'url parse https://x.com/a?b=1', run: T((ctx) => { const [a, t] = withQuoted(ctx); return tools.url(a, t); }) },
  { name: 'warna', aliases: ['color'], category: 'Developer', desc: 'Warna HEX/RGB/HSL → semua format + cek kontras WCAG', usage: 'warna #14b8a6', run: T((ctx) => tools.warna(ctx.args)) },
  { name: 'encode', category: 'Developer', desc: 'Encode: morse, biner, hex, rot13, caesar', usage: 'encode morse Halo', run: T((ctx) => { const [a, t] = withQuoted(ctx); return tools.encode('enc', a, t); }) },
  { name: 'decode', category: 'Developer', desc: 'Decode: morse, biner, hex, rot13, caesar', usage: 'decode morse .... .- .-.. ---', run: T((ctx) => { const [a, t] = withQuoted(ctx); return tools.encode('dec', a, t); }) },
  { name: 'regex', category: 'Developer', desc: 'Uji pola regex pada teks: /pola/flag | teks', usage: 'regex /\\d+/g | tahun 2024', run: T((ctx) => tools.regex(ctx.text)) },
  { name: 'cron', category: 'Developer', desc: 'Jadwal berikutnya dari ekspresi cron 5 bagian', usage: 'cron */15 9-17 * * 1-5', run: T((ctx) => tools.cron(ctx.args)) },

  // ---------- QR & Link ----------
  { name: 'qrwifi', aliases: ['wifi'], category: 'QR & Link', desc: 'QR untuk masuk Wi-Fi: nama, sandi, [WPA|WEP|nopass]', usage: 'qrwifi NamaWifi sandi123',
    run: T(async (ctx) => { const str = tools.wifiString(ctx.args); await ctx.sendImage(await media.makeQr(str), `📶 Wi-Fi: ${ctx.args[0]}\nPindai untuk tersambung.`); }) },
  { name: 'walink', aliases: ['wa'], category: 'QR & Link', desc: 'Buat tautan wa.me (+ QR) dengan pesan awal', usage: 'walink 08123456789 Halo!',
    run: T(async (ctx) => { const link = tools.waLink(ctx.args); await ctx.sendImage(await media.makeQr(link), link); }) },

  // ---------- Stiker & Gambar: filter ----------
  { name: 'filter', aliases: ['efek'], category: 'Stiker & Gambar', desc: 'Filter gambar: ' + Object.keys(media.IMG_FX).join(', '), usage: 'filter sepia', heavy: true,
    run: T(async (ctx) => {
      const k = (ctx.args[0] || '').toLowerCase();
      if (!media.IMG_FX[k]) throw new Error('Balas gambar dengan: filter <efek>\nEfek: ' + Object.keys(media.IMG_FX).join(', '));
      const m = await sub(ctx, ['image'], 'Kirim atau balas sebuah gambar dengan perintah ini.')();
      await ctx.sendImage(await media.imageFilter(m.buffer, k), `Filter: ${k}`);
    }) },

  // ---------- Video & Audio: efek ----------
  { name: 'audio', aliases: ['efekaudio'], category: 'Video & Audio', desc: 'Efek audio: ' + Object.keys(media.AUDIO_FX).join(', ') + ', volume <n>, cepat <n>', usage: 'audio nightcore', heavy: true,
    run: T(async (ctx) => {
      const k = (ctx.args[0] || '').toLowerCase();
      if (!k) throw new Error('Balas audio/video dengan: audio <efek>\nEfek: ' + Object.keys(media.AUDIO_FX).join(', ') + ', volume 2, cepat 1.5');
      const m = await sub(ctx, ['audio', 'video'], 'Kirim atau balas audio/video dengan perintah ini.')();
      await ctx.reply('Memproses audio, mohon tunggu…');
      await ctx.sendAudio(await media.audioFx(m.buffer, k, ctx.args[1]));
    }) },
  { name: 'kecepatan', aliases: ['speed'], category: 'Video & Audio', desc: 'Ubah kecepatan video 0,25×–4× (suara ikut)', usage: 'kecepatan 2', heavy: true,
    run: T(async (ctx) => {
      const x = parseFloat(String(ctx.args[0] || '').replace(',', '.'));
      if (!x || x < 0.25 || x > 4) throw new Error('Contoh: balas video dengan kecepatan 2 (0,25 sampai 4)');
      const m = await sub(ctx, ['video'], 'Kirim atau balas sebuah video.')();
      await ctx.reply('Memproses video, mohon tunggu…');
      await ctx.sendVideo(await media.videoSpeed(m.buffer, x), `Kecepatan ${x}×`);
    }) },
  { name: 'bisu', aliases: ['mute'], category: 'Video & Audio', desc: 'Hapus suara dari video', usage: 'bisu', heavy: true,
    run: T(async (ctx) => { const m = await sub(ctx, ['video'], 'Kirim atau balas sebuah video.')(); await ctx.sendVideo(await media.muteVideo(m.buffer), 'Tanpa suara'); }) },
  { name: 'mundur', aliases: ['reverse'], category: 'Video & Audio', desc: 'Putar video terbalik (maks 20 detik pertama)', usage: 'mundur', heavy: true,
    run: T(async (ctx) => { const m = await sub(ctx, ['video'], 'Kirim atau balas sebuah video.')(); await ctx.reply('Memproses video, mohon tunggu…'); await ctx.sendVideo(await media.reverseVideo(m.buffer), 'Video terbalik'); }) },
  { name: 'putar', aliases: ['rotate'], category: 'Video & Audio', desc: 'Putar/cermin video: ' + Object.keys(media.ROT).join(', '), usage: 'putar kanan', heavy: true,
    run: T(async (ctx) => {
      const k = (ctx.args[0] || '').toLowerCase(); if (!media.ROT[k]) throw new Error('Contoh: balas video dengan putar kanan\nPilihan: ' + Object.keys(media.ROT).join(', '));
      const m = await sub(ctx, ['video'], 'Kirim atau balas sebuah video.')(); await ctx.sendVideo(await media.rotateVideo(m.buffer, k), `Putar: ${k}`);
    }) },
  { name: 'togif', aliases: ['gif'], category: 'Video & Audio', desc: 'Video jadi GIF (maks 8 detik, lebar 480)', usage: 'togif', heavy: true,
    run: T(async (ctx) => { const m = await sub(ctx, ['video'], 'Kirim atau balas sebuah video.')(); await ctx.reply('Membuat GIF, mohon tunggu…'); await ctx.sendDoc(await media.videoToGif(m.buffer), 'video.gif', 'image/gif'); }) },
  { name: 'frame', aliases: ['cuplik'], category: 'Video & Audio', desc: 'Ambil satu gambar dari video pada detik tertentu', usage: 'frame 5', heavy: true,
    run: T(async (ctx) => {
      const t = ctx.args[0] ? parseFloat(String(ctx.args[0]).replace(',', '.')) : 0; if (!Number.isFinite(t) || t < 0) throw new Error('Contoh: balas video dengan frame 5 (detik ke-5)');
      const m = await sub(ctx, ['video'], 'Kirim atau balas sebuah video.')(); await ctx.sendImage(await media.frameAt(m.buffer, t), `Detik ke-${t}`);
    }) },

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
  { name: 'ingatkan', aliases: ['remind', 'pengingat'], category: 'Pengingat', desc: 'Pengingat: ingatkan 10m minum obat | 1j30m | 14:30 rapat', usage: 'ingatkan 10m <pesan>',
    run: async (ctx) => {
      const [when, ...rest] = ctx.args, text = rest.join(' ').trim(), at = reminders.parseWhen(when);
      if (!at || !text) return ctx.reply(`Format: *${ctx.prefix}ingatkan 10m minum obat*\nWaktu: d=detik, m=menit, j=jam, h=hari (mis. 1j30m, 2h) atau jam 14:30 (waktu server). Maks 30 hari.`);
      const r = reminders.add({ chat: ctx.chat || ctx.sender + '@s.whatsapp.net', sender: ctx.sender, at, text });
      return ctx.reply(`⏰ Siap. Pengingat #${r.id} pada ${fmtWhen(at)}:\n${text}`);
    } },
  { name: 'pengingatku', aliases: ['ingatan'], category: 'Pengingat', desc: 'Daftar pengingat aktif; batalkan dengan batalingat <no>', usage: 'pengingatku',
    run: async (ctx) => {
      const l = reminders.list(ctx.sender);
      return ctx.reply(l.length ? l.map((r) => `#${r.id} · ${fmtWhen(r.at)} · ${r.text}`).join('\n') + `\n\nBatalkan: ${ctx.prefix}batalingat <no>` : 'Belum ada pengingat aktif.');
    } },
  { name: 'batalingat', aliases: ['hapusingat'], category: 'Pengingat', desc: 'Batalkan pengingat berdasarkan nomor', usage: 'batalingat <no>',
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

module.exports = { registry, find, publicList, safeCalc, fmtUp, pdfQueue, addPrefix };
