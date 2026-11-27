'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

process.env.OWNER_NUMBER = '6281111111111';
process.env.OWNER_TOKEN = 'token-uji-yang-cukup-panjang-123';
process.env.PREFIX = '.';
process.env.DATA_DIR = os.tmpdir() + '/wabot-tools-data-' + process.pid;
const db = require('../src/db');
const tools = require('../src/tools');
const media = require('../src/media');
const commands = require('../src/commands');
const menu = require('../src/menu');
const { dispatch, _lastUse } = require('../src/handler');

const HAS_FF = spawnSync('ffmpeg', ['-version']).status === 0;
function mkctx(over = {}) {
  const out = { texts: [], images: [], docs: [], videos: [], audios: [] };
  return Object.assign({ out, sender: '628' + Math.random().toString().slice(2, 10), isOwner: false, name: 'Tester', mentioned: [], quotedText: '',
    reply: async (t) => { out.texts.push(t); }, sendImage: async (b, c) => out.images.push({ b, c }), sendSticker: async () => {},
    sendVideo: async (b, c) => out.videos.push({ b, c }), sendAudio: async (b) => out.audios.push(b), chat: 'x@s.whatsapp.net',
    sendDoc: async (b, f, m) => out.docs.push({ b, f, m }), sendTo: async () => {}, getMedia: async () => null }, over);
}
const run = async (cmd, over) => { _lastUse.clear(); const c = mkctx(over); const r = await dispatch(c, cmd); return { r, c, t: c.out.texts.join('\n') }; };
test.beforeEach(() => { db._reset(); _lastUse.clear(); });

test('kalkulator ilmiah: prioritas operator, fungsi, dan galat', () => {
  const v = (e, d = true) => Number(tools.calc(e, d).toPrecision(10));
  assert.equal(v('12×(3+4)^2'), 588); assert.equal(v('-2^2'), -4); assert.equal(v('2^3^2'), 512); assert.equal(v('2^-1'), 0.5);
  assert.equal(v('5!'), 120); assert.equal(v('sin(30)'), 0.5); assert.equal(v('sin(180)'), 0); assert.equal(v('sin(pi/2)', false), 1);
  assert.equal(v('7 mod 3'), 1); assert.equal(v('2(3+4)'), 14); assert.equal(v('√(81)'), 9); assert.equal(v('log(1000)'), 3); assert.equal(v('10%'), 0.1);
  for (const bad of ['1/0', '2+', '(1', 'abc', 'process.exit()', '1;2', 'require("fs")', '2**9999999']) assert.throws(() => { const r = tools.calc(bad); if (!Number.isFinite(r)) throw new Error('x'); }, bad);
});
test('angka berformat Indonesia', () => {
  assert.equal(tools.parseAmount('250.000'), 250000); assert.equal(tools.parseAmount('2,5jt'), 2500000); assert.equal(tools.parseAmount('150rb'), 150000);
  assert.equal(tools.parseAmount('Rp 1.500.000'), 1500000); assert.equal(tools.parseAmount('1,5m'), 1.5e9); assert.throws(() => tools.parseAmount('abc'));
});
test('satuan, persen, diskon, cicilan, tagihan, BMI sesuai hitungan web', async () => {
  assert.equal(tools.convert(1, 'km', 'm').result, 1000); assert.equal(tools.convert(100, 'c', 'f').result, 212); assert.equal(tools.convert(1, 'gb', 'mb').result, 1024);
  assert.throws(() => tools.convert(1, 'kg', 'm'), /tidak cocok/);
  assert.match((await run('.satuan 5 km m')).t, /5\.000 m/); assert.match((await run('.satuan 100c f')).t, /212 °f/);
  assert.match(tools.persen(['15%', 'dari', '200']), /\*30\*/); assert.match(tools.persen(['25', 'dari', '200']), /12,5%/); assert.match(tools.persen(['80', 'ke', '100']), /naik \*25%\*/);
  assert.match(tools.diskon(['250000', '30', '10', '11']), /174\.825/);
  assert.match(tools.cicilan(['300jt', '9', '120']), /3\.800\.273/); assert.match(tools.cicilan(['120jt', '12', '12', 'flat']), /flat/);
  assert.match(tools.bagi(['450rb', '4', '5', '10']), /130\.000/); assert.match(tools.bmi(['165', '60', '25', 'p']), /BMI 22/);
  assert.match(tools.tabungan(['10jt', '1jt', '6', '10']), /Nilai akhir/); assert.match(tools.margin(['70rb', '100rb']), /30\.000/);
});
test('tanggal: umur, selisih, weton (acuan 17 Agustus 1945 = Jumat Legi)', () => {
  assert.equal(tools.weton(tools.parseDate('1945-08-17')), 'Jumat Legi'); assert.equal(tools.weton(tools.parseDate('1970-01-01')), 'Kamis Wage');
  assert.match(tools.selisih(['2024-01-01', '2024-12-31']), /365 hari/); assert.match(tools.tanggalTambah(['2024-01-31', '30']), /Jumat, 1 Maret 2024|Maret 2024/);
  assert.throws(() => tools.parseDate('2023-02-30'), /tidak ada/); assert.match(tools.umur(['2000-01-31']), /Weton/); assert.throws(() => tools.umur(['2999-01-01']), /masa depan/);
});
test('teks: terbilang, romawi, huruf, gaya, hitungkata, rapikan', () => {
  assert.match(tools.terbilang(['1234']), /Seribu dua ratus tiga puluh empat/); assert.match(tools.terbilang(['1.000.000']), /Satu juta/); assert.match(tools.terbilang(['0']), /Nol/); assert.match(tools.terbilang(['-5']), /Minus lima/);
  assert.match(tools.romawi(['1994']), /MCMXCIV/); assert.match(tools.romawi(['MCMXCIV']), /1994/); assert.throws(() => tools.romawi(['IIII']), /tidak valid/);
  const h = (k, s) => tools.huruf([k, ...s.split(' ')], `${k} ${s}`);
  assert.equal(h('besar', 'halo dunia'), 'HALO DUNIA'); assert.equal(h('camel', 'hello big_world'), 'helloBigWorld'); assert.equal(h('snake', 'Hello Big World'), 'hello_big_world'); assert.equal(h('slug', 'Halo Dünia!'), 'halo-dunia');
  assert.match(tools.gaya('Halo'), /𝐇𝐚𝐥𝐨/); assert.match(tools.hitungKata('Halo dunia. Ini tes.'), /Kata: \*4\*/);
  assert.equal(tools.rapikan(['unik'], 'unik\na\nB\nb\nA\nc'), 'a\nB\nc'); assert.equal(tools.rapikan(['nomor'], 'nomor\nx\ny'), '1. x\n2. y');
});
test('developer: json, base64, hash, jwt, uuid, warna, encode, regex, cron', () => {
  assert.match(tools.json([], '{"b":1}'), /"b": 1/); assert.equal(tools.json(['min'], 'min {"a": 1}'), '{"a":1}'); assert.match(tools.json(['cek'], 'cek [1,2]'), /array \(2 item\)/); assert.throws(() => tools.json([], '{a:1}'), /JSON tidak valid/);
  assert.equal(tools.base64(['enc'], 'enc Halo 🌍'), Buffer.from('Halo 🌍').toString('base64')); assert.equal(tools.base64(['dec'], 'dec SGFsbw=='), 'Halo'); assert.throws(() => tools.base64(['dec'], 'dec ###'), /Base64/);
  assert.match(tools.hash([], 'abc'), /900150983cd24fb0d6963f7d28e17f72/); assert.match(tools.hash(['sha256'], 'sha256 abc'), /ba7816bf8f01cfea/);
  const tok = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
  assert.match(tools.jwt([tok, 'your-256-bit-secret']), /✅ valid/); assert.match(tools.jwt([tok, 'salah']), /TIDAK cocok/); assert.throws(() => tools.jwt(['a.b.c']), /Base64\/JSON/);
  assert.match(tools.uuid(['v4']), /[0-9a-f]{8}-[0-9a-f]{4}-4/); assert.match(tools.uuid(['v7']), /[0-9a-f]{8}-[0-9a-f]{4}-7/); assert.equal(tools.ulid().length, 26);
  assert.match(tools.warna(['#ff0000']), /hsl\(0, 100%, 50%\)/); assert.deepEqual(tools.parseColor('hsl(120,100%,50%)'), [0, 255, 0]); assert.throws(() => tools.warna(['zzz']));
  assert.equal(tools.encode('enc', ['morse'], 'morse sos'), '... --- ...'); assert.equal(tools.encode('dec', ['morse'], 'morse ... --- ...'), 'sos');
  assert.equal(tools.encode('enc', ['rot13'], 'rot13 Halo'), 'Unyb'); assert.equal(tools.encode('dec', ['caesar'], 'caesar 3 Kdor'), 'Halo'); assert.equal(tools.encode('dec', ['biner'], 'biner ' + tools.encode('enc', ['biner'], 'biner Hi')), 'Hi');
  assert.match(tools.regex('/\\d+/g | tahun 2024 dan 2025'), /2 kecocokan/); assert.throws(() => tools.regex('/(/ | x'), /tidak valid/);
  assert.match(tools.cron(['*/15', '9-17', '*', '*', '1-5']), /Jadwal berikutnya/); assert.throws(() => tools.cron(['99', '*', '*', '*', '*']), /rentang/);
});
test('link & Wi-Fi', () => {
  assert.equal(tools.waLink(['08123456789', 'Halo', 'apa']), 'https://wa.me/628123456789?text=Halo%20apa'); assert.equal(tools.wifiString(['Rumah', 'rahasia']), 'WIFI:T:WPA;S:Rumah;P:rahasia;;');
  assert.match(tools.wifiString(['Cafe']), /T:nopass/);
});
test('perintah baru lewat handler: awalan ikut, galat ramah, balas pesan', async () => {
  assert.match((await run('.hitung 2+3*4')).t, /= \*14\*/);
  const bad = await run('.diskon'); assert.match(bad.t, /^⚠️/); assert.match(bad.t, /Contoh: \.diskon 250000/, 'contoh memakai awalan bot');
  assert.match((await run('.base64')).t, /\.base64 dec SGFsbw==/);
  assert.match((await run('.huruf besar', { quotedText: 'halo dunia' })).t, /HALO DUNIA/, 'memakai pesan yang dibalas');
  assert.match((await run('.hitungkata', { quotedText: 'satu dua tiga' })).t, /Kata: \*3\*/);
  assert.match((await run('.md5 abc')).t, /900150983cd24fb0d6963f7d28e17f72/); assert.match((await run('.ulid 2')).t, /ULID/);
  assert.match((await run('.rapikan urut\nc\na\nb')).t, /^a\nb\nc$/);
  assert.match((await run('.tim 2 Ani, Budi, Cici, Dedi')).t, /Tim 1[\s\S]*Tim 2/);
  assert.match((await run('.json {"a":[1,2]}')).t, /"a": \[/);
  const w = await run('.walink 0812345 Halo'); assert.equal(w.c.out.images.length, 1); assert.match(w.c.out.images[0].c, /wa\.me\/62812345/);
  const q = await run('.qrwifi Rumah sandi123'); assert.equal(q.c.out.images.length, 1);
});
test('menu: kartu info, kategori bernomor, halaman kategori, semua, pemilik', async () => {
  const m = (await run('.menu')).t;
  assert.match(m, /Selamat (pagi|siang|sore|malam), \*Tester\*/); assert.match(m, /❮ 🧮 \*UTILITAS\* ❯ 4/); assert.match(m, /`\.hitung`/); assert.doesNotMatch(m, /`\.ban`|`\.bc`|PEMILIK/);
  assert.match((await run('.menu 4')).t, /➤ \*\.diskon 250000 30 10 11\*/); assert.match((await run('.menu developer')).t, /\.jwt/); assert.match((await run('.menu util')).t, /UTILITAS/);
  assert.match((await run('.menu diskon')).t, /kategori: Utilitas/); assert.match((await run('.menu zzz')).t, /tidak ditemukan/);
  const all = await run('.menu semua'); assert.ok(all.c.out.texts.length >= 2 && all.c.out.texts.every((x) => x.length < 4000), 'dipecah agar muat batas WhatsApp');
  assert.match((await run('.menu', { isOwner: true })).t, /PEMILIK/); assert.match((await run('.menu pemilik')).t, /tidak ditemukan|UTILITAS|Kategori/);
  assert.match((await run('.menu pemilik', { isOwner: true })).t, /\.ban/);
  const g = menu.group(commands.registry, false); assert.ok(g.every(([, l]) => l.every((c) => !c.ownerOnly)));
});
test('setiap perintah punya kategori, deskripsi, usage; tidak ada nama ganda', () => {
  const seen = new Map();
  for (const c of commands.registry) {
    assert.ok(c.category && menu.META[c.category], `${c.name}: kategori ${c.category} belum ada di menu`); assert.ok(c.desc && c.usage, c.name);
    for (const n of [c.name, ...(c.aliases || [])]) { assert.ok(!seen.has(n), `nama ganda: ${n}`); seen.set(n, 1); }
  }
  assert.ok(commands.registry.length >= 65);
  const api = commands.publicList(); assert.ok(api.every((x) => x.name && x.category));
});
test('mode self dan cooldown tetap berlaku untuk perintah baru', async () => {
  const a = mkctx(); assert.equal(await dispatch(a, '.hitung 1+1'), 'ok'); assert.equal(await dispatch(mkctx({ sender: a.sender }), '.hitung 2+2'), 'cooldown');
});

/* ---- media ffmpeg (dilewati bila ffmpeg tidak ada) ---- */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wabot-fx-'));
const mk = (name, args) => { const f = path.join(tmp, name); execFileSync('ffmpeg', ['-y', '-v', 'error', ...args, f]); return fs.readFileSync(f); };
const OPT = { skip: !HAS_FF && 'ffmpeg tidak terpasang' };
test('efek audio, video, dan filter gambar menghasilkan berkas valid', OPT, async () => {
  const wav = mk('a.wav', ['-f', 'lavfi', '-i', 'sine=frequency=440:duration=2']);
  const vid = mk('v.mp4', ['-f', 'lavfi', '-i', 'testsrc=duration=2:size=320x240:rate=24', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest']);
  const img = mk('i.png', ['-f', 'lavfi', '-i', 'testsrc=size=200x100', '-frames:v', '1']);
  for (const k of Object.keys(media.AUDIO_FX)) { const o = await media.audioFx(wav, k); assert.ok(o.length > 1000, 'audio ' + k); }
  assert.ok((await media.audioFx(wav, 'volume', 3)).length > 1000); assert.ok((await media.audioFx(wav, 'cepat', 1.5)).length > 1000); await assert.rejects(() => media.audioFx(wav, 'xx'), /tidak dikenal/);
  const dur = (b) => { const f = path.join(tmp, 'p.mp4'); fs.writeFileSync(f, b); return parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString()); };
  assert.ok(Math.abs(dur(await media.videoSpeed(vid, 2)) - 1) < 0.4, 'kecepatan 2x memendekkan durasi');
  assert.ok(dur(await media.muteVideo(vid)) > 1.5); assert.ok(dur(await media.reverseVideo(vid)) > 1.5); assert.ok(dur(await media.rotateVideo(vid, 'kanan')) > 1.5);
  assert.equal((await media.videoToGif(vid)).slice(0, 3).toString(), 'GIF'); assert.equal((await media.frameAt(vid, 1))[0], 0xff);
  for (const k of Object.keys(media.IMG_FX)) { const o = await media.imageFilter(img, k); assert.equal(o[0], 0xff, 'filter ' + k); }
  // lewat perintah
  const a = await run('.audio nightcore', { getMedia: async () => ({ kind: 'audio', buffer: wav }) }); assert.equal(a.c.out.audios.length, 1);
  const s = await run('.kecepatan 2', { getMedia: async () => ({ kind: 'video', buffer: vid, seconds: 2 }) }); assert.equal(s.c.out.videos.length, 1);
  const f = await run('.filter sepia', { getMedia: async () => ({ kind: 'image', buffer: img }) }); assert.equal(f.c.out.images.length, 1);
  const g = await run('.togif', { getMedia: async () => ({ kind: 'video', buffer: vid }) }); assert.equal(g.c.out.docs[0].f, 'video.gif');
  const fr = await run('.frame 1', { getMedia: async () => ({ kind: 'video', buffer: vid }) }); assert.equal(fr.c.out.images.length, 1);
  assert.match((await run('.filter sepia')).t, /Kirim atau balas/); assert.match((await run('.kecepatan 9')).t, /0,25 sampai 4/); assert.match((await run('.putar')).t, /Pilihan/);
});
