'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const http = require('http');
const path = require('path');

process.env.OWNER_NUMBER = '6281111111111';
process.env.OWNER_TOKEN = 'token-uji-yang-cukup-panjang-123';
process.env.PREFIX = '.';
process.env.DATA_DIR = require('os').tmpdir() + '/wabot-test-data-' + process.pid;
const cfg = require('../src/config');
const db = require('../src/db');
const media = require('../src/media');
const commands = require('../src/commands');
const { dispatch, _lastUse } = require('../src/handler');
const { create, _sessions } = require('../src/server');

const IMG = process.env.TEST_IMG, VID = process.env.TEST_VID;
function mkctx(over = {}) {
  const out = { texts: [], images: [], stickers: [], docs: [], videos: [], audios: [] };
  return Object.assign({ out, sender: '6282222222222', isOwner: false, name: 'Tester', mentioned: [],
    reply: async (t) => { out.texts.push(t); }, sendImage: async (b) => out.images.push(b), sendSticker: async (b) => out.stickers.push(b),
    sendVideo: async (b, c) => out.videos.push({ b, c }), sendAudio: async (b) => out.audios.push(b), chat: '6282222222222@s.whatsapp.net',
    sendDoc: async (b, f, m) => out.docs.push({ b, f, m }), sendTo: async () => {}, getMedia: async () => null }, over);
}
test.beforeEach(() => { db._reset(); _lastUse.clear(); });

test('menu, prefix, perintah tak dikenal', async () => {
  const c = mkctx();
  assert.equal(await dispatch(c, '.menu'), 'ok');
  assert.match(c.out.texts[0], /sticker/);
  assert.doesNotMatch(c.out.texts[0], /broadcast|\.ban /, 'menu publik tak boleh menampilkan perintah pemilik');
  assert.equal(await dispatch(mkctx(), 'halo biasa'), 'ignored');
  assert.equal(await dispatch(mkctx({ sender: '6283' }), '.tidakada'), 'unknown');
});
test('menu pemilik menampilkan perintah pemilik', async () => {
  const c = mkctx({ isOwner: true }); await dispatch(c, '.menu'); assert.match(c.out.texts[0], /ban/);
});
test('cooldown dan blokir', async () => {
  const a = mkctx(); assert.equal(await dispatch(a, '.ping'), 'ok');
  assert.equal(await dispatch(mkctx(), '.ping'), 'cooldown');
  db.get().banned.push('6282222222222'); _lastUse.clear();
  assert.equal(await dispatch(mkctx(), '.ping'), 'blocked');
});
test('perintah pemilik ditolak untuk pengguna biasa', async () => {
  const c = mkctx(); assert.equal(await dispatch(c, '.mode self'), 'blocked'); assert.match(c.out.texts[0], /hanya untuk pemilik/);
  assert.equal(db.get().mode, 'public');
  const o = mkctx({ isOwner: true }); await dispatch(o, '.mode self'); assert.equal(db.get().mode, 'self');
  assert.equal(await dispatch(mkctx({ sender: '6285' }), '.ping'), 'blocked', 'mode self memblokir non-pemilik');
});
test('ban tidak bisa menyasar pemilik', async () => {
  const o = mkctx({ isOwner: true }); await dispatch(o, '.ban 6281111111111'); assert.match(o.out.texts[0], /tidak bisa diblokir/);
  assert.equal(db.get().banned.length, 0);
});
test('kalkulator aman', () => {
  assert.equal(commands.safeCalc('(12+8)*3/4'), 15);
  assert.equal(commands.safeCalc('2^10'), 1024);
  for (const bad of ['process.exit()', 'a+1', '1;2', '2**999999', 'require("fs")']) assert.throws(() => commands.safeCalc(bad), bad);
});
test('hitung, pilih, dadu, qr', async () => {
  let c = mkctx(); await dispatch(c, '.hitung 7*6'); assert.match(c.out.texts[0], /42/);
  c = mkctx({ sender: '1' }); await dispatch(c, '.pilih a | b'); assert.match(c.out.texts[0], /a|b/);
  c = mkctx({ sender: '2' }); await dispatch(c, '.dadu 20'); assert.match(c.out.texts[0], /d20/);
  c = mkctx({ sender: '3' }); await dispatch(c, '.qr halo'); assert.ok(c.out.images[0].length > 500);
});
test('perintah media tanpa media memberi petunjuk, bukan error', async () => {
  for (const cmd of ['.sticker', '.toimg', '.resize 500', '.kompres 100', '.topdf']) {
    const c = mkctx({ sender: 'u' + cmd }); assert.equal(await dispatch(c, cmd), 'ok'); assert.ok(c.out.texts.length >= 1, cmd);
  }
});
test('stiker dari gambar: 512x512, WebP, di bawah 500 KB', { skip: !IMG }, async () => {
  const buf = fs.readFileSync(IMG);
  const c = mkctx({ getMedia: async () => ({ kind: 'image', buffer: buf }) });
  assert.equal(await dispatch(c, '.sticker'), 'ok');
  const st = c.out.stickers[0]; assert.ok(st && st.length < 500 * 1024);
  const m = await require('sharp')(st).metadata(); assert.equal(m.format, 'webp'); assert.equal(m.width, 512); assert.equal(m.height, 512);
  assert.ok(st.includes(Buffer.from('sticker-pack-name')), 'EXIF paket stiker harus ada');
});
test('stiker dari video: animasi, maks 10 detik, di bawah 500 KB', { skip: !VID }, async () => {
  const buf = fs.readFileSync(VID);
  const c = mkctx({ getMedia: async () => ({ kind: 'video', buffer: buf, seconds: 12 }) });
  assert.equal(await dispatch(c, '.sticker'), 'ok');
  const st = c.out.stickers[0]; assert.ok(st && st.length <= 500 * 1024, 'ukuran ' + (st && st.length));
  const m = await require('sharp')(st, { animated: true }).metadata();
  assert.ok(m.pages > 10, 'harus animasi, frame=' + m.pages);
  const total = (m.delay || []).reduce((a, b) => a + b, 0) / 1000; assert.ok(total <= 10.5, 'durasi ' + total);
  assert.match(c.out.texts[0], /10 detik/);
  assert.match(c.out.texts[1], /Stiker 512×512/);
});
test('toimg: stiker animasi jadi GIF, statis jadi PNG', { skip: !IMG }, async () => {
  const st = await media.imageToSticker(fs.readFileSync(IMG));
  let c = mkctx({ getMedia: async () => ({ kind: 'sticker', buffer: st }) }); await dispatch(c, '.toimg'); assert.equal(c.out.images.length, 1);
  if (VID) {
    const an = await media.videoToSticker(fs.readFileSync(VID));
    c = mkctx({ sender: 'x', getMedia: async () => ({ kind: 'sticker', buffer: an }) }); await dispatch(c, '.toimg');
    assert.equal(c.out.docs[0].m, 'image/gif');
  }
});
test('resize, kompres, topdf, antrean pdf', { skip: !IMG }, async () => {
  const buf = fs.readFileSync(IMG), gm = async () => ({ kind: 'image', buffer: buf });
  let c = mkctx({ getMedia: gm }); await dispatch(c, '.resize 300');
  const m = await require('sharp')(c.out.docs[0].b).metadata(); assert.equal(Math.max(m.width, m.height), 300);
  c = mkctx({ sender: 'k', getMedia: gm }); await dispatch(c, '.kompres 20'); assert.ok(c.out.docs[0].b.length <= 20 * 1024, 'ukuran ' + c.out.docs[0].b.length);
  c = mkctx({ sender: 'p', getMedia: gm }); await dispatch(c, '.topdf'); assert.equal(c.out.docs[0].b.slice(0, 4).toString(), '%PDF');
  const u = { sender: 'q', isOwner: true, getMedia: gm };
  await dispatch(mkctx(u), '.pdfadd'); await dispatch(mkctx(u), '.pdfadd');
  c = mkctx(u); await dispatch(c, '.pdfdone');
  const { PDFDocument } = require('pdf-lib'); assert.equal((await PDFDocument.load(c.out.docs[0].b)).getPageCount(), 2);
  c = mkctx(u); await dispatch(c, '.pdfdone'); assert.match(c.out.texts[0], /kosong/);
});
test('perintah yang error dilaporkan dengan sopan', async () => {
  const c = mkctx({ getMedia: async () => ({ kind: 'image', buffer: Buffer.from('bukan gambar') }) });
  assert.equal(await dispatch(c, '.sticker'), 'error'); assert.match(c.out.texts[0], /kesalahan/);
});

// ---------- API ----------
function req(port, method, p, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request({ port, method, path: p, headers: Object.assign({ 'Content-Type': 'application/json' }, headers) }, (res) => {
      let s = ''; res.on('data', (d) => (s += d)); res.on('end', () => { let j; try { j = JSON.parse(s); } catch (_) { j = s; } resolve({ code: res.statusCode, body: j, headers: res.headers }); });
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}
test('API: publik, login, sesi, batas percobaan, statis aman', async () => {
  const srv = create(); await new Promise((r) => srv.listen(0, r)); const port = srv.address().port;
  try {
    let r = await req(port, 'GET', '/api/status'); assert.equal(r.code, 200); assert.equal(r.body.name, cfg.botName); assert.ok(!('qr' in r.body));
    assert.equal(r.headers['access-control-allow-origin'], '*');
    r = await req(port, 'GET', '/api/commands'); assert.ok(r.body.list.length > 10); assert.ok(r.body.list.every((c) => !c.ownerOnly));
    assert.equal((await req(port, 'GET', '/api/owner/state')).code, 401, 'owner endpoint tanpa sesi');
    assert.equal((await req(port, 'GET', '/api/owner/state', null, { Authorization: 'Bearer ' + 'a'.repeat(64) })).code, 401);
    r = await req(port, 'POST', '/api/login', { token: 'salah' }); assert.equal(r.code, 401);
    r = await req(port, 'POST', '/api/login', { token: cfg.ownerToken }); assert.equal(r.code, 200); assert.match(r.body.session, /^[a-f0-9]{64}$/);
    const H = { Authorization: 'Bearer ' + r.body.session };
    r = await req(port, 'GET', '/api/owner/state', null, H); assert.equal(r.code, 200); assert.ok('status' in r.body);
    r = await req(port, 'POST', '/api/owner/mode', { mode: 'self' }, H); assert.equal(r.body.mode, 'self');
    r = await req(port, 'POST', '/api/owner/mode', { mode: 'x' }, H); assert.equal(r.code, 400);
    r = await req(port, 'POST', '/api/owner/pair', { number: '12' }, H); assert.equal(r.code, 400);
    // statis: index.html ada, traversal dan folder bot/.env ditolak
    assert.equal((await req(port, 'GET', '/')).code, 200);
    for (const bad of ['/bot/.env', '/bot/src/config.js', '/../bot/.env', '/%2e%2e/bot/package.json', '/.env', '/bot/data/db.json']) assert.equal((await req(port, 'GET', bad)).code, 404, bad);
    for (let i = 0; i < 6; i++) r = await req(port, 'POST', '/api/login', { token: 'salah' + i });
    assert.equal(r.code, 429, 'pembatasan percobaan login');
    r = await req(port, 'POST', '/api/login', { token: cfg.ownerToken }); assert.equal(r.code, 429, 'token benar pun ditahan saat terblokir');
  } finally { srv.close(); }
});

test('API /api/send: kunci, validasi, pengiriman (soket tiruan)', async () => {
  const wa = require('../src/whatsapp'), sent = [];
  const orig = wa.sendText; wa.sendText = async (to, text) => { sent.push([to, text]); return 'ID1'; };
  const srv = create(); await new Promise((r) => srv.listen(0, r)); const port = srv.address().port;
  try {
    const k = cfg.ownerToken;
    assert.equal((await req(port, 'GET', '/api/send?to=6281234567890&message=hai')).code, 401, 'tanpa kunci');
    assert.equal((await req(port, 'GET', '/api/send?key=salah&to=6281234567890&message=hai')).code, 401);
    assert.equal((await req(port, 'GET', `/api/send?key=${k}&to=12&message=hai`)).code, 400, 'nomor pendek');
    assert.equal((await req(port, 'GET', `/api/send?key=${k}&to=6281234567890`)).code, 400, 'pesan kosong');
    let r = await req(port, 'GET', `/api/send?key=${k}&to=6281234567890&message=Halo%20dunia`);
    assert.equal(r.code, 200); assert.equal(r.body.ok, true);
    r = await req(port, 'POST', '/api/send', { to: '+62 812-3456-7891', message: 'via post' }, { Authorization: 'Bearer ' + k });
    assert.equal(r.code, 200);
    assert.deepEqual(sent.map((x) => x[1]), ['Halo dunia', 'via post']);
    wa.sendText = async () => { throw new Error('WhatsApp belum tersambung'); };
    assert.equal((await req(port, 'GET', `/api/send?key=${k}&to=6281234567890&message=x`)).code, 503);
    require('../src/server')._hits.clear();
    wa.sendText = async () => 'x';
    let last; for (let i = 0; i < 31; i++) last = await req(port, 'GET', `/api/send?key=${k}&to=6281234567890&message=x`);
    assert.equal(last.code, 429, 'batas 30 per menit');
  } finally { wa.sendText = orig; srv.close(); }
});

test('config: kunci dibuat otomatis dan stabil di data/config.json', () => {
  const { execFileSync } = require('child_process'), dir = require('os').tmpdir() + '/wabot-cfg-' + process.pid;
  const run = () => execFileSync(process.execPath, ['-e', "const c=require('./src/config');console.log(c.ownerToken+' '+c.autoOwner)"],
    { cwd: path.join(__dirname, '..'), env: { PATH: process.env.PATH, DATA_DIR: dir } }).toString().trim();
  const a = run(), b = run();
  assert.equal(a, b); assert.match(a, /^[\w-]{24} true$/);
});

test('pairFlow: tanya nomor lalu tampilkan kode, hanya saat belum tertaut', async () => {
  const { pairFlow } = require('../src/pair'), logs = [];
  const log = (t) => logs.push(t);
  // belum tertaut, nomor diketik di terminal (percobaan pertama salah)
  const nums = ['123', '6281234567890'], st = { status: 'qr' };
  const ok = await pairFlow({ state: st, ask: async () => nums.shift(), log, wait: 5,
    request: async (n) => { if (n.length < 8) throw new Error('Nomor tidak valid'); return 'ABCD1234'; } });
  assert.equal(ok, true); assert.ok(logs.some((l) => l.includes('ABCD-1234')));
  // sudah tertaut: tidak bertanya apa pun
  let asked = false;
  assert.equal(await pairFlow({ state: { status: 'open' }, ask: async () => { asked = true; return '1'; }, request: async () => 'X', wait: 5 }), false);
  assert.equal(asked, false);
  // Enter kosong = pakai QR/panel
  assert.equal(await pairFlow({ state: { status: 'qr' }, ask: async () => '', request: async () => 'X', log, wait: 5 }), false);
  // PAIR_NUMBER dari .env tanpa terminal
  assert.equal(await pairFlow({ state: { status: 'qr' }, number: '6281234567890', request: async () => 'WXYZ9876', log, wait: 5 }), true);
});

const NOISY = process.env.TEST_VID_NOISY, AUD = process.env.TEST_VID_AUDIO || VID;
const probe = (b) => { const f = require('os').tmpdir() + '/probe-' + process.pid + '.bin'; fs.writeFileSync(f, b);
  return parseFloat(require('child_process').execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString()); };

test('stiker video: atur durasi dan resolusi sendiri', { skip: !VID }, async () => {
  const buf = fs.readFileSync(VID), sharp = require('sharp');
  let c = mkctx({ getMedia: async () => ({ kind: 'video', buffer: buf, seconds: 3 }) });
  assert.equal(await dispatch(c, '.sticker 2'), 'ok');
  let m = await sharp(c.out.stickers[0], { animated: true }).metadata();
  assert.ok((m.delay || []).reduce((a, b) => a + b, 0) / 1000 <= 2.3, 'durasi harus ~2 dtk');
  _lastUse.clear(); c = mkctx({ getMedia: async () => ({ kind: 'video', buffer: buf, seconds: 3 }) });
  assert.equal(await dispatch(c, '.sticker 50%'), 'ok');
  m = await sharp(c.out.stickers[0], { animated: true }).metadata();
  assert.equal(m.width, 256); assert.match(c.out.texts.at(-1), /256×256/);
});
test('stiker video berat (derau 10 dtk): tetap di bawah 500 KB, durasi penuh terjaga', { skip: !NOISY }, async () => {
  const buf = fs.readFileSync(NOISY);
  for (const opt of [{}, { seconds: 10, scale: 1 }, { seconds: 4, scale: 0.6 }]) {
    const r = await media.videoToStickerInfo(buf, opt);
    assert.ok(r.bytes <= 500 * 1024, JSON.stringify(opt) + ' ukuran ' + r.bytes);
    assert.ok(r.seconds <= (opt.seconds || 10) + 0.3, JSON.stringify(opt) + ' durasi ' + r.seconds);
  }
});
test('tomp3, kompresvideo, potong', { skip: !AUD }, async () => {
  const buf = fs.readFileSync(AUD), get = async () => ({ kind: 'video', buffer: buf, seconds: 4 });
  let c = mkctx({ getMedia: get }); assert.equal(await dispatch(c, '.tomp3'), 'ok');
  const mp3 = c.out.audios[0]; assert.ok(mp3 && mp3.length > 1000 && (mp3.slice(0, 3).toString() === 'ID3' || mp3[0] === 0xff), 'harus MP3');
  _lastUse.clear(); c = mkctx({ getMedia: get }); assert.equal(await dispatch(c, '.kompresvideo 1'), 'ok');
  const v = c.out.videos[0].b; assert.ok(v.length <= 1048576 && v.slice(4, 8).toString() === 'ftyp', 'mp4 <= 1 MB, ukuran ' + v.length);
  _lastUse.clear(); c = mkctx({ getMedia: get }); assert.equal(await dispatch(c, '.potong 1 3'), 'ok');
  const d = probe(c.out.videos[0].b); assert.ok(d > 1.5 && d < 2.6, 'durasi potongan ' + d);
  _lastUse.clear(); c = mkctx({ getMedia: get }); await dispatch(c, '.potong 3 1'); assert.match(c.out.texts[0], /lebih besar/);
});

test('pengingat: format waktu, simpan, daftar, batal, kirim saat jatuh tempo', async () => {
  const R = require('../src/reminders'), now = 1_700_000_000_000;
  assert.equal(R.parseWhen('10m', now), now + 600000); assert.equal(R.parseWhen('1j30m', now), now + 5400000);
  assert.equal(R.parseWhen('2h', now), now + 172800000); assert.equal(R.parseWhen('45d', now), now + 45000);
  assert.equal(R.parseWhen('0m', now), null); assert.equal(R.parseWhen('abc', now), null); assert.equal(R.parseWhen('99h', now), null);
  const t = R.parseWhen('14:30', now); assert.ok(t > now && t - now <= 86400000 && new Date(t).getHours() === 14);
  let c = mkctx(); assert.equal(await dispatch(c, '.ingatkan 10m minum obat'), 'ok'); assert.match(c.out.texts[0], /#1/);
  _lastUse.clear(); c = mkctx(); await dispatch(c, '.pengingatku'); assert.match(c.out.texts[0], /minum obat/);
  _lastUse.clear(); c = mkctx(); await dispatch(c, '.ingatkan besok'); assert.match(c.out.texts[0], /Format/);
  _lastUse.clear(); c = mkctx({ sender: '6283333333333' }); await dispatch(c, '.batalingat 1'); assert.match(c.out.texts[0], /tidak ditemukan/, 'orang lain tak boleh membatalkan');
  const sent = []; db.get().reminders[0].at = Date.now() - 1000;
  assert.equal(await R.tick(async (to, t) => { sent.push([to, t]); }), 1);
  assert.match(sent[0][1], /⏰ Pengingat: minum obat/); assert.equal(sent[0][0], '6282222222222@s.whatsapp.net'); assert.equal(db.get().reminders.length, 0);
  // gagal kirim dicoba lagi, lalu dibuang setelah 5x
  R.add({ chat: 'x@s.whatsapp.net', sender: '1', at: Date.now() - 1, text: 'gagal' });
  for (let i = 0; i < 4; i++) { await R.tick(async () => { throw new Error('offline'); }); assert.equal(db.get().reminders.length, 1); }
  await R.tick(async () => { throw new Error('offline'); }); assert.equal(db.get().reminders.length, 0);
  for (let i = 0; i < 10; i++) R.add({ chat: 'x', sender: '9', at: Date.now() + 1e6, text: 'a' });
  assert.throws(() => R.add({ chat: 'x', sender: '9', at: Date.now() + 1e6, text: 'a' }), /Maksimal 10/);
});
