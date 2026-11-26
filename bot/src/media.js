'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const cfg = require('./config');

const MAX_STICKER_BYTES = 480 * 1024; // batas WhatsApp 500 KB, sisakan ruang untuk EXIF
const MAX_STICKER_SECONDS = 10; // batas resmi stiker animasi WhatsApp: 512x512, WebP, maks 500 KB, maks 10 detik

let _sharp = null;
let _noSharp = process.env.NO_SHARP === '1';
function sharp() {
  if (_noSharp) throw new Error('sharp tidak tersedia');
  if (!_sharp) _sharp = require('sharp');
  return _sharp;
}

/** true bila sharp bisa dipakai. Di Termux/Android sharp tidak ada, maka gambar diolah dengan ffmpeg. */
function hasSharp() {
  if (_noSharp) return false;
  try { sharp(); return true; } catch (_) { _noSharp = true; return false; }
}

function run(cmd, args, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    const t = setTimeout(() => { p.kill('SIGKILL'); reject(new Error('Proses terlalu lama (timeout)')); }, timeoutMs);
    p.stderr.on('data', (d) => { err = (err + d).slice(-2000); });
    p.on('error', (e) => { clearTimeout(t); reject(e.code === 'ENOENT' ? new Error('ffmpeg belum terpasang di server') : e); });
    p.on('close', (c) => { clearTimeout(t); c === 0 ? resolve() : reject(new Error('ffmpeg gagal: ' + err.split('\n').slice(-3).join(' ').trim())); });
  });
}

async function withTmp(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wabot-'));
  try { return await fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

/** Olah satu gambar dengan ffmpeg (cadangan tanpa sharp). */
function ffImage(buf, vf, outArgs, ext, timeoutMs = 60000) {
  return withTmp(async (dir) => {
    const inp = path.join(dir, 'in.bin'), out = path.join(dir, 'out.' + ext);
    fs.writeFileSync(inp, buf);
    await run('ffmpeg', ['-y', '-v', 'error', '-i', inp, ...(vf ? ['-vf', vf] : []), '-frames:v', '1', ...outArgs, out], timeoutMs);
    return fs.readFileSync(out);
  });
}
const ffScaleMax = (w, h) => `scale='min(${w},iw)':'min(${h},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2`;

/** Menempelkan metadata paket stiker (nama dan pembuat) pada WebP. */
async function addExif(webp, pack, author) {
  try {
    const { Image } = require('node-webpmux');
    const json = { 'sticker-pack-id': crypto.randomBytes(16).toString('hex'), 'sticker-pack-name': pack || cfg.stickerPack, 'sticker-pack-publisher': author || cfg.stickerAuthor };
    const head = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
    const body = Buffer.from(JSON.stringify(json), 'utf8');
    const exif = Buffer.concat([head, body]);
    exif.writeUIntLE(body.length, 14, 4);
    const img = new Image();
    await img.load(webp);
    img.exif = exif;
    return await img.save(null);
  } catch (e) {
    return webp; // tanpa metadata tetap valid sebagai stiker
  }
}

/** Gambar -> stiker statis 512x512 bening. mode: 'contain' (utuh) atau 'cover' (potong). */
async function imageToSticker(buf, opt = {}) {
  const fit = opt.mode === 'cover' ? 'cover' : 'contain';
  let q = 80, out;
  if (!hasSharp()) {
    const vf = fit === 'cover'
      ? 'scale=512:512:force_original_aspect_ratio=increase,crop=512:512,format=rgba'
      : 'scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000,format=rgba';
    for (; q >= 30; q -= 15) {
      out = await ffImage(buf, vf, ['-c:v', 'libwebp', '-lossless', '0', '-quality', String(q)], 'webp');
      if (out.length <= MAX_STICKER_BYTES) break;
    }
    return addExif(out, opt.pack, opt.author);
  }
  for (; q >= 30; q -= 15) {
    out = await sharp()(buf, { animated: false }).rotate()
      .resize(512, 512, { fit, background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: q }).toBuffer();
    if (out.length <= MAX_STICKER_BYTES) break;
  }
  return addExif(out, opt.pack, opt.author);
}

const even = (n) => Math.max(2, Math.round(n / 2) * 2);

/** Durasi (detik) dan ukuran sebuah WebP animasi, dibaca dari headernya. */
async function webpInfo(buf) {
  try {
    const { Image } = require('node-webpmux');
    const im = new Image(); await im.load(buf);
    const sec = im.hasAnim ? im.frames.reduce((a, f) => a + (f.delay || 0), 0) / 1000 : 0;
    return { width: im.width, height: im.height, seconds: sec };
  } catch (_) { return { width: 0, height: 0, seconds: 0 }; }
}

/**
 * Video/GIF -> stiker animasi WhatsApp (maks 10 detik, di bawah 500 KB). Butuh ffmpeg.
 * opt.seconds (1-10) dan opt.scale (0.3-1) diatur pengguna. Tanpa keduanya (auto), durasi/resolusi
 * dikurangi bertahap bila perlu. Dengan pengaturan sendiri, yang terlalu besar ditolak disertai saran angka.
 */
async function videoToStickerInfo(buf, opt = {}) {
  const auto = !opt.seconds && !opt.scale;
  const S = Math.min(MAX_STICKER_SECONDS, Math.max(1, opt.seconds || MAX_STICKER_SECONDS));
  const K = Math.min(1, Math.max(0.3, opt.scale || 1));
  const plans = auto ? [[S, 1], [S * 0.8, 1], [S * 0.65, 0.9], [S * 0.5, 0.8], [S * 0.4, 0.7]] : [[S, K]];
  const tries = [[12, 50], [10, 40], [8, 30], [8, 20], [6, 15]];
  return withTmp(async (dir) => {
    const inp = path.join(dir, 'in.bin'), outp = path.join(dir, 'out.webp');
    fs.writeFileSync(inp, buf);
    let last, lastPlan;
    for (const [sec, k] of plans) {
      const side = even(512 * k);
      const scale = opt.mode === 'cover'
        ? `scale=${side}:${side}:force_original_aspect_ratio=increase,crop=${side}:${side}`
        : `scale=${side}:${side}:force_original_aspect_ratio=decrease,pad=${side}:${side}:-1:-1:color=0x00000000`;
      lastPlan = [sec, k];
      for (const [fps, q] of tries) {
        await run('ffmpeg', ['-y', '-v', 'error', '-t', sec.toFixed(2), '-i', inp, '-an', '-vf', `fps=${fps},${scale},format=rgba`,
          '-c:v', 'libwebp', '-lossless', '0', '-q:v', String(q), '-compression_level', '6', '-loop', '0', '-preset', 'default', '-fps_mode', 'vfr', outp]);
        last = fs.readFileSync(outp);
        if (last.length <= MAX_STICKER_BYTES) break;
      }
      if (last.length <= MAX_STICKER_BYTES) break;
    }
    if (last.length > MAX_STICKER_BYTES) {
      const kb = Math.round(last.length / 1024), ratio = MAX_STICKER_BYTES / last.length;
      const sugSec = Math.max(1, Math.floor(lastPlan[0] * ratio * 0.9)), sugPct = Math.max(30, Math.floor(100 * lastPlan[1] * Math.sqrt(ratio) * 0.95));
      throw new Error(`Hasil ${kb} KB, melebihi batas 500 KB. Coba durasi ${sugSec} detik atau resolusi ${sugPct}%.`);
    }
    const out = await addExif(last, opt.pack, opt.author), info = await webpInfo(out);
    return { buffer: out, bytes: out.length, width: info.width, height: info.height, seconds: info.seconds,
      reduced: auto && (lastPlan[0] < S || lastPlan[1] < 1) };
  });
}
const videoToSticker = async (buf, opt) => (await videoToStickerInfo(buf, opt)).buffer;

/** Video/suara -> MP3. */
function toAudio(buf) {
  return withTmp(async (dir) => {
    const inp = path.join(dir, 'in.bin'), out = path.join(dir, 'out.mp3');
    fs.writeFileSync(inp, buf);
    await run('ffmpeg', ['-y', '-v', 'error', '-i', inp, '-vn', '-c:a', 'libmp3lame', '-b:a', '128k', out], 120000);
    return fs.readFileSync(out);
  });
}

function probeDuration(file) {
  return new Promise((resolve) => {
    require('child_process').execFile('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { timeout: 20000 },
      (e, out) => resolve(e ? 0 : parseFloat(out) || 0));
  });
}

/** Kecilkan video agar muat di targetMb (WhatsApp membatasi 16 MB). Mengembalikan MP4. */
function compressVideo(buf, targetMb = 15) {
  return withTmp(async (dir) => {
    const inp = path.join(dir, 'in.bin'), out = path.join(dir, 'out.mp4');
    fs.writeFileSync(inp, buf);
    const dur = await probeDuration(inp);
    if (!dur) throw new Error('Durasi video tidak terbaca');
    const limit = targetMb * 1024 * 1024;
    let vb = Math.floor((limit * 0.9 * 8) / dur - 64000);
    if (vb < 120000) throw new Error(`Video ${Math.round(dur)} detik terlalu panjang untuk ${targetMb} MB. Naikkan targetnya atau potong dulu.`);
    for (let i = 0; i < 3; i++) {
      const h = vb < 400000 ? 360 : vb < 900000 ? 480 : vb < 2000000 ? 720 : 1080;
      await run('ffmpeg', ['-y', '-v', 'error', '-i', inp, '-vf', `scale=-2:'min(${h},ih)'`, '-c:v', 'libx264', '-preset', 'veryfast', '-b:v', String(vb),
        '-maxrate', String(Math.floor(vb * 1.3)), '-bufsize', String(vb * 2), '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart', out], 600000);
      const r = fs.readFileSync(out);
      if (r.length <= limit) return r;
      vb = Math.floor(vb * 0.75);
    }
    throw new Error('Tidak bisa dikecilkan sampai ' + targetMb + ' MB. Coba target lebih besar.');
  });
}

/** Potong video dari detik `from` sampai `to`. */
function trimVideo(buf, from, to) {
  return withTmp(async (dir) => {
    const inp = path.join(dir, 'in.bin'), out = path.join(dir, 'out.mp4');
    fs.writeFileSync(inp, buf);
    await run('ffmpeg', ['-y', '-v', 'error', '-i', inp, '-ss', String(from), '-to', String(to), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26',
      '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', out], 300000);
    return fs.readFileSync(out);
  });
}

/** WebP animasi -> GIF tanpa sharp: frame diambil node-webpmux, dirakit ffmpeg. */
async function animToGif(buf) {
  const { Image } = require('node-webpmux');
  const im = new Image(); await im.load(buf);
  const frames = await im.demux({ buffers: true });
  const avg = im.frames.reduce((a, f) => a + (f.delay || 80), 0) / im.frames.length;
  const fps = Math.max(1, Math.min(50, 1000 / avg)).toFixed(2);
  return withTmp(async (dir) => {
    frames.forEach((b, i) => fs.writeFileSync(path.join(dir, 'f' + String(i).padStart(4, '0') + '.webp'), b));
    const out = path.join(dir, 'o.gif');
    await run('ffmpeg', ['-y', '-v', 'error', '-framerate', fps, '-i', path.join(dir, 'f%04d.webp'), '-vf', 'split[a][b];[a]palettegen=reserve_transparent=1[p];[b][p]paletteuse', '-loop', '0', out], 120000);
    return fs.readFileSync(out);
  });
}

/** Stiker -> PNG (statis) atau GIF (animasi). */
async function stickerToImage(buf) {
  if (!hasSharp()) {
    if (buf.includes('ANIM')) {
      try { return { type: 'gif', buffer: await animToGif(buf) }; }
      catch (e) { throw new Error('Stiker animasi ini tidak bisa diubah ke GIF (' + e.message + ')'); }
    }
    return { type: 'png', buffer: await ffImage(buf, null, [], 'png') };
  }
  const meta = await sharp()(buf, { animated: true }).metadata();
  if (meta.pages && meta.pages > 1) return { type: 'gif', buffer: await sharp()(buf, { animated: true }).gif().toBuffer() };
  return { type: 'png', buffer: await sharp()(buf).png().toBuffer() };
}

async function resizeImage(buf, maxSide) {
  if (!hasSharp()) {
    const m = Math.round(maxSide);
    return ffImage(buf, `scale=w='if(gte(iw,ih),${m},-2)':h='if(gte(iw,ih),-2,${m})'`, ['-q:v', '2'], 'jpg');
  }
  return sharp()(buf).rotate().resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: false }).jpeg({ quality: 90 }).toBuffer();
}

/** Kompres JPEG mendekati target KB (cari kualitas, lalu perkecil piksel bila perlu). */
async function compressImage(buf, targetKb) {
  const target = targetKb * 1024;
  if (!hasSharp()) {
    let w = 2560;
    for (let round = 0; round < 8; round++) {
      let lo = 2, hi = 31, best = null; // skala kualitas mjpeg: kecil = bagus
      for (let i = 0; i < 5; i++) {
        const q = Math.round((lo + hi) / 2);
        const b = await ffImage(buf, `scale='min(${Math.round(w)},iw)':-2`, ['-q:v', String(q)], 'jpg');
        if (b.length <= target) { best = b; hi = q - 1; } else lo = q + 1;
      }
      if (best) return best;
      w *= 0.8;
    }
    throw new Error('Target terlalu kecil untuk foto ini');
  }
  let w = (await sharp()(buf).metadata()).width || 2000;
  for (let round = 0; round < 8; round++) {
    const base = sharp()(buf).rotate().flatten({ background: '#ffffff' }).resize({ width: Math.round(w), withoutEnlargement: true });
    let lo = 20, hi = 95, best = null;
    for (let i = 0; i < 7; i++) {
      const q = Math.round((lo + hi) / 2);
      const b = await base.clone().jpeg({ quality: q, mozjpeg: true }).toBuffer();
      if (b.length <= target) { best = b; lo = q + 1; } else hi = q - 1;
    }
    if (best) return best;
    w *= 0.8;
  }
  throw new Error('Target terlalu kecil untuk foto ini');
}

/** Beberapa gambar -> satu PDF (A4, gambar dimuat utuh di tengah). */
async function imagesToPdf(buffers) {
  const { PDFDocument } = require('pdf-lib');
  const pdf = await PDFDocument.create();
  for (const b of buffers) {
    const jpg = !hasSharp() ? await ffImage(b, ffScaleMax(1800, 1800), ['-q:v', '3'], 'jpg') : await sharp()(b).rotate().flatten({ background: '#ffffff' }).resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
    const im = await pdf.embedJpg(jpg);
    const W = 595.28, H = 841.89, m = 24;
    const s = Math.min((W - 2 * m) / im.width, (H - 2 * m) / im.height);
    const w = im.width * s, h = im.height * s;
    pdf.addPage([W, H]).drawImage(im, { x: (W - w) / 2, y: (H - h) / 2, width: w, height: h });
  }
  return Buffer.from(await pdf.save());
}

async function makeQr(text) {
  return require('qrcode').toBuffer(String(text).slice(0, 1000), { margin: 2, width: 512 });
}

module.exports = { imageToSticker, videoToSticker, videoToStickerInfo, toAudio, compressVideo, trimVideo, stickerToImage, resizeImage, compressImage, imagesToPdf, makeQr, addExif, MAX_STICKER_SECONDS };
