'use strict';
/**
 * Padanan alat web (utilitas, teks, dev) untuk bot WhatsApp.
 * Semua fungsi murni (tanpa I/O) supaya mudah diuji. Galat dilempar sebagai Error berpesan Indonesia.
 */
const crypto = require('crypto');

const nf = (n, d = 2) => (Number.isFinite(n) ? new Intl.NumberFormat('id-ID', { maximumFractionDigits: d }).format(n) : '—');
const rp = (n) => 'Rp ' + nf(Math.round(n), 0);
const fail = (m) => { throw new Error(m); };

/** "300jt", "2,5 juta", "150rb", "1.5m" -> angka. Titik/koma dianggap desimal bila ada sufiks. */
function parseAmount(s) {
  const t = String(s ?? '').trim().toLowerCase().replace(/^rp\.?\s*/, '').replace(/\s+/g, '');
  const m = /^([\d.,]+)(rb|ribu|k|jt|juta|m|miliar|b|t|triliun)?$/.exec(t);
  if (!m) fail(`"${s}" bukan angka. Contoh: 250000, 250rb, 3jt, 1,5m`);
  const mult = { rb: 1e3, ribu: 1e3, k: 1e3, jt: 1e6, juta: 1e6, m: 1e9, miliar: 1e9, b: 1e9, t: 1e12, triliun: 1e12 }[m[2]] || 1;
  let num = m[1];
  if (mult === 1) {
    // tanpa sufiks: "250.000" = ribuan, "2,5" = desimal
    num = /^\d{1,3}(\.\d{3})+(,\d+)?$/.test(num) ? num.replace(/\./g, '').replace(',', '.') : num.replace(/,/g, '.');
  } else num = num.replace(',', '.');
  const v = parseFloat(num);
  if (!Number.isFinite(v)) fail(`"${s}" bukan angka.`);
  return v * mult;
}
const parseNum = (s) => { const v = parseFloat(String(s ?? '').replace('%', '').replace(',', '.')); if (!Number.isFinite(v)) fail(`"${s}" bukan angka.`); return v; };

/* ======================= Kalkulator ilmiah ======================= */
function calc(expr, deg = true) {
  let src = String(expr).toLowerCase().replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/π/g, 'pi').replace(/√/g, 'sqrt').replace(/\s+/g, ' ').trim();
  if (!src || src.length > 120) fail('Ekspresi kosong atau terlalu panjang');
  src = src.replace(/(\d),(\d)/g, '$1.$2').replace(/(\d) mod (\d)/g, '$1 mod $2');
  const toks = [];
  const re = /\s*(\d+\.?\d*(?:e[+-]?\d+)?|\.\d+|[a-z]+|\*\*|[-+*/^%!()])/gy;
  let m, last = 0;
  while ((m = re.exec(src))) { toks.push(m[1]); last = re.lastIndex; }
  if (src.slice(last).trim()) fail('Karakter tidak dikenal: ' + src.slice(last).trim()[0]);
  let p = 0;
  const pk = () => toks[p], nx = () => toks[p++];
  const rad = (x) => (deg ? x * Math.PI / 180 : x), back = (x) => (deg ? x * 180 / Math.PI : x);
  const fact = (n) => { if (n < 0 || n !== Math.floor(n) || n > 170) fail('Faktorial hanya untuk bilangan bulat 0–170'); let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; };
  const F = { sin: (x) => Math.sin(rad(x)), cos: (x) => Math.cos(rad(x)), tan: (x) => Math.tan(rad(x)), asin: (x) => back(Math.asin(x)), acos: (x) => back(Math.acos(x)), atan: (x) => back(Math.atan(x)),
    sqrt: Math.sqrt, ln: Math.log, log: Math.log10, abs: Math.abs, exp: Math.exp, floor: Math.floor, ceil: Math.ceil, round: Math.round, fact };
  const C = { pi: Math.PI, e: Math.E };
  const isVal = (t) => t !== undefined && (/^[\d.]/.test(t) || /^[a-z]/.test(t) && t !== 'mod' || t === '(');
  function ex() { let v = tm(); while (pk() === '+' || pk() === '-') { const o = nx(), r = tm(); v = o === '+' ? v + r : v - r; } return v; }
  function tm() {
    let v = un();
    while (pk() === '*' || pk() === '/' || pk() === 'mod' || isVal(pk())) {
      if (pk() === '*' || pk() === '/') { const o = nx(), r = un(); v = o === '*' ? v * r : v / r; }
      else if (pk() === 'mod') { nx(); v = v % un(); } else v *= un();
    }
    return v;
  }
  function un() { if (pk() === '-') { nx(); return -un(); } if (pk() === '+') { nx(); return un(); } return pw(); }
  function pw() { const b = po(); if (pk() === '^' || pk() === '**') { nx(); return Math.pow(b, un()); } return b; }
  function po() { let v = pr(); while (pk() === '!' || pk() === '%') { v = nx() === '!' ? fact(v) : v / 100; } return v; }
  function pr() {
    const t = nx();
    if (t === undefined) fail('Ekspresi belum lengkap');
    if (t === '(') { const v = ex(); if (nx() !== ')') fail('Kurung tidak seimbang'); return v; }
    if (/^[\d.]/.test(t)) { const v = parseFloat(t); if (!Number.isFinite(v)) fail('Angka tidak valid'); return v; }
    if (t in C) return C[t];
    if (t in F) { const a = pr(); return F[t](a); }
    return fail('Tidak dikenal: ' + t);
  }
  const v = ex();
  if (p < toks.length) fail('Ekspresi tidak lengkap di dekat "' + toks[p] + '"');
  if (!Number.isFinite(v)) fail('Hasil tidak terdefinisi');
  return Math.abs(v) < 1e-12 ? 0 : v;
}
const fmtCalc = (v) => { const r = Number(v.toPrecision(12)); return Math.abs(r) >= 1e15 || (Math.abs(r) < 1e-6 && r !== 0) ? r.toExponential(6) : nf(r, 10); };

/* ======================= Satuan ======================= */
const U = { panjang: [['mm', .001], ['cm', .01], ['m', 1], ['km', 1000], ['inch', .0254], ['ft', .3048], ['yard', .9144], ['mile', 1609.344]],
  massa: [['mg', 1e-6], ['g', .001], ['kg', 1], ['ton', 1000], ['oz', .028349523], ['lb', .45359237]],
  volume: [['ml', .001], ['l', 1], ['m³', 1000], ['tsp', .00492892], ['tbsp', .0147868], ['cup', .2365882], ['gal', 3.785411784]],
  luas: [['cm²', 1e-4], ['m²', 1], ['ha', 1e4], ['km²', 1e6], ['ft²', .09290304], ['acre', 4046.8564]],
  kecepatan: [['m/s', 1], ['km/h', 1 / 3.6], ['mph', .44704], ['knot', .514444]],
  data: [['bit', .125], ['b', 1], ['kb', 1024], ['mb', 1048576], ['gb', 1073741824], ['tb', 1099511627776]],
  waktu: [['ms', .001], ['s', 1], ['min', 60], ['jam', 3600], ['hari', 86400], ['minggu', 604800], ['tahun', 31557600]],
  tekanan: [['pa', 1], ['kpa', 1000], ['bar', 1e5], ['psi', 6894.757], ['atm', 101325]],
  suhu: [['°c', 0], ['°f', 0], ['k', 0]] };
const UALIAS = { milimeter: 'mm', centimeter: 'cm', meter: 'm', kilometer: 'km', inci: 'inch', in: 'inch', feet: 'ft', kaki: 'ft', yd: 'yard', mil: 'mile', miles: 'mile', miligram: 'mg', gram: 'g', gr: 'g', kilogram: 'kg', ons: 'ton', pound: 'lb', lbs: 'lb',
  liter: 'l', mililiter: 'ml', m3: 'm³', galon: 'gal', cm2: 'cm²', m2: 'm²', km2: 'km²', hektar: 'ha', ft2: 'ft²', kmh: 'km/h', 'km/jam': 'km/h', kph: 'km/h', ms: 'ms', mps: 'm/s', knots: 'knot', byte: 'b', kib: 'kb', mib: 'mb', gib: 'gb', tib: 'tb',
  detik: 's', sec: 's', menit: 'min', hour: 'jam', hr: 'jam', day: 'hari', week: 'minggu', year: 'tahun', thn: 'tahun', c: '°c', celsius: '°c', celcius: '°c', '°': '°c', f: '°f', fahrenheit: '°f', kelvin: 'k', kpa: 'kpa', mbar: 'bar' };
const TC = { '°c': [(x) => x, (x) => x], '°f': [(x) => (x - 32) * 5 / 9, (x) => x * 9 / 5 + 32], k: [(x) => x - 273.15, (x) => x + 273.15] };
const normU = (u) => { const k = String(u).toLowerCase().replace(/^°?/, (m) => m); return UALIAS[k] || k; };
function convert(value, from, to) {
  const f = normU(from), t = normU(to);
  for (const [cat, list] of Object.entries(U)) {
    const a = list.find((x) => x[0] === f), b = list.find((x) => x[0] === t);
    if (a && b) {
      const r = cat === 'suhu' ? TC[t][1](TC[f][0](value)) : value * a[1] / b[1];
      return { cat, result: r, from: f, to: t };
    }
  }
  const known = Object.values(U).flat().map((x) => x[0]).join(', ');
  return fail(`Satuan "${from}" ke "${to}" tidak cocok. Satuan tersedia: ${known}`);
}

/* ======================= Persen, diskon, margin ======================= */
function persen(args) {
  const t = args.join(' ').toLowerCase();
  let m;
  if ((m = /^([\d.,]+)\s*%\s*(?:dari|of)\s*([\d.,]+[a-z]*)$/.exec(t))) { const x = parseNum(m[1]), y = parseAmount(m[2]); return `${nf(x)}% dari ${nf(y)} = *${nf(x / 100 * y, 4)}*`; }
  if ((m = /^([\d.,]+)\s*(?:dari|of)\s*([\d.,]+[a-z]*)$/.exec(t))) { const x = parseNum(m[1]), y = parseAmount(m[2]); if (!y) fail('Pembagi tidak boleh nol'); return `${nf(x)} adalah *${nf(x / y * 100, 4)}%* dari ${nf(y)}`; }
  if ((m = /^([\d.,]+[a-z]*)\s*(?:ke|->|→|jadi|menjadi)\s*([\d.,]+[a-z]*)$/.exec(t))) {
    const a = parseAmount(m[1]), b = parseAmount(m[2]); if (!a) fail('Nilai awal tidak boleh nol');
    const c = (b - a) / a * 100; return `${nf(a)} → ${nf(b)}: ${c >= 0 ? 'naik' : 'turun'} *${nf(Math.abs(c), 4)}%* (selisih ${nf(b - a, 4)})`;
  }
  return fail('Contoh:\n• persen 15% dari 200\n• persen 25 dari 200\n• persen 80 ke 100');
}
function diskon(args) {
  if (args.length < 2) fail('Contoh: diskon 250000 30 10 11\n(harga, diskon %, diskon tambahan % [opsional], PPN % [opsional])');
  const p = parseAmount(args[0]), d1 = parseNum(args[1]), d2 = args[2] ? parseNum(args[2]) : 0, tax = args[3] ? parseNum(args[3]) : 0;
  const after = p * (1 - d1 / 100) * (1 - d2 / 100), fin = after * (1 + tax / 100);
  return [`💰 Harga awal: ${rp(p)}`, `🏷️ Setelah diskon: ${rp(after)}`, tax ? `🧾 PPN ${nf(tax)}%: ${rp(fin - after)}` : null, `✅ *Harga akhir: ${rp(fin)}*`,
    `💸 Hemat: ${rp(p - after)} (diskon efektif ${nf(p ? (1 - after / p) * 100 : 0)}%)`].filter(Boolean).join('\n');
}
function margin(args) {
  if (args.length < 2) fail('Contoh: margin 70000 100000 (modal, harga jual)');
  const c = parseAmount(args[0]), s = parseAmount(args[1]);
  return `Laba: *${rp(s - c)}*\nMargin: ${s ? nf((s - c) / s * 100) : '—'}%\nMarkup: ${c ? nf((s - c) / c * 100) : '—'}%`;
}

/* ======================= Cicilan, tabungan, tagihan, BMI ======================= */
function cicilan(args) {
  if (args.length < 3) fail('Contoh: cicilan 300jt 9 120 (pinjaman, bunga %/tahun, bulan). Tambah "flat" untuk bunga flat.');
  const p = parseAmount(args[0]), rt = parseNum(args[1]) / 100, m = Math.round(parseNum(args[2]));
  if (m < 1 || m > 600) fail('Tenor 1–600 bulan');
  const flat = /flat/i.test(args.slice(3).join(' '));
  let pay, tot;
  if (flat) { const intr = p * rt * m / 12; pay = (p + intr) / m; tot = p + intr; }
  else { const i = rt / 12; pay = i ? p * i / (1 - Math.pow(1 + i, -m)) : p / m; tot = pay * m; }
  return `🏦 *Cicilan ${flat ? 'flat' : 'anuitas'}*\nPinjaman: ${rp(p)} · ${nf(rt * 100)}%/thn · ${m} bulan\n\n📅 Per bulan: *${rp(pay)}*\n💵 Total bayar: ${rp(tot)}\n📈 Total bunga: ${rp(tot - p)}`;
}
function tabungan(args) {
  if (args.length < 4) fail('Contoh: tabungan 10jt 1jt 6 10 (setoran awal, setoran bulanan, bunga %/tahun, tahun)');
  const P = parseAmount(args[0]), M = parseAmount(args[1]), i = parseNum(args[2]) / 100 / 12, y = Math.round(parseNum(args[3]));
  if (y < 1 || y > 80) fail('Jangka waktu 1–80 tahun');
  let bal = P, dep = P;
  for (let k = 1; k <= y * 12; k++) { bal = bal * (1 + i) + M; dep += M; }
  return `🐖 *Tabungan ${y} tahun*\nNilai akhir: *${rp(bal)}*\nTotal setoran: ${rp(dep)}\nHasil bunga: ${rp(bal - dep)}`;
}
function bagi(args) {
  if (args.length < 2) fail('Contoh: bagi 450rb 4 5 10 (subtotal, jumlah orang, service %, pajak %, tip % opsional)');
  const s = parseAmount(args[0]), n = Math.max(1, Math.round(parseNum(args[1]))), svc = args[2] ? parseNum(args[2]) : 0, tax = args[3] ? parseNum(args[3]) : 0, tip = args[4] ? parseNum(args[4]) : 0;
  const tot = s * (1 + svc / 100) * (1 + tax / 100) + s * tip / 100, per = Math.ceil(tot / n / 500) * 500;
  return `🍽️ *Patungan ${n} orang*\nTotal tagihan: ${rp(tot)}\n👤 *Per orang: ${rp(per)}* (dibulatkan 500)\nDibayar semua: ${rp(per * n)} (lebih ${rp(per * n - tot)})`;
}
function bmi(args) {
  if (args.length < 2) fail('Contoh: bmi 165 60 25 p (tinggi cm, berat kg, umur, p=pria / w=wanita)');
  const H = parseNum(args[0]), W = parseNum(args[1]), A = args[2] ? parseNum(args[2]) : 25, male = !/^(w|wanita|f|perempuan|cewek)/i.test(args[3] || 'p');
  if (H < 50 || H > 260 || W < 10 || W > 500) fail('Tinggi 50–260 cm dan berat 10–500 kg');
  const m = H / 100, v = W / (m * m), cat = v < 18.5 ? 'Kurus' : v < 23 ? 'Normal' : v < 25 ? 'Berat badan lebih' : 'Obesitas';
  const bmr = 10 * W + 6.25 * H - 5 * A + (male ? 5 : -161);
  return `❤️ *BMI ${nf(v, 1)}* · ${cat}\nBerat sehat: ${nf(18.5 * m * m, 1)}–${nf(22.9 * m * m, 1)} kg\nBMR: ${nf(bmr, 0)} kkal\nKalori/hari: ${nf(bmr * 1.2, 0)} (jarang olahraga) · ${nf(bmr * 1.375, 0)} (ringan) · ${nf(bmr * 1.55, 0)} (sedang)\nAir minum: ${nf(W * .035, 1)} L/hari\n_Standar Asia-Pasifik, bukan diagnosis medis._`;
}

/* ======================= Kata sandi ======================= */
const WORDS = 'angin awan batu bulan cahaya danau elang fajar gunung hujan ikan jalan kabut laut madu nasi ombak padi pelangi pohon pulau rumah sawah senja sungai tanah timur udara'.split(' ');
const rint = (n) => crypto.randomInt(n);
function sandi(args) {
  const mode = (args.find((a) => /^(pin|frasa|kata)$/i.test(a)) || 'sandi').toLowerCase();
  const len = parseInt(args.find((a) => /^\d+$/.test(a)), 10);
  const out = [];
  for (let k = 0; k < 3; k++) {
    if (mode === 'pin') { const n = Math.min(12, Math.max(4, len || 6)); out.push(Array.from({ length: n }, () => rint(10)).join('')); }
    else if (mode === 'frasa' || mode === 'kata') { const n = Math.min(12, Math.max(4, len || 5)); out.push(Array.from({ length: n }, () => WORDS[rint(WORDS.length)]).join('-')); }
    else {
      const n = Math.min(64, Math.max(8, len || 16)), pools = ['abcdefghjkmnpqrstuvwxyz', 'ABCDEFGHJKLMNPQRSTUVWXYZ', '23456789', '!@#$%^&*-_+='];
      const chars = pools.map((p) => p[rint(p.length)]), all = pools.join('');
      while (chars.length < n) chars.push(all[rint(all.length)]);
      for (let i = chars.length - 1; i > 0; i--) { const j = rint(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
      out.push(chars.join(''));
    }
  }
  return `🔐 *${mode === 'pin' ? 'PIN' : mode === 'sandi' ? 'Kata sandi' : 'Frasa sandi'}* (dibuat acak aman)\n` + out.map((x) => '`' + x + '`').join('\n') + '\n_Salin salah satu, lalu hapus pesan ini._';
}

/* ======================= Tanggal ======================= */
const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'], PASARAN = ['Legi', 'Pahing', 'Pon', 'Wage', 'Kliwon'];
const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const wibNow = () => new Date(Date.now() + 7 * 3600000);
function parseDate(s) {
  const t = String(s || '').trim().toLowerCase();
  if (t === 'hari' || t === 'sekarang' || t === 'today' || t === 'hariini') { const n = wibNow(); return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate())); }
  let y, mo, d, m;
  if ((m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(t))) [y, mo, d] = [+m[1], +m[2], +m[3]];
  else if ((m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(t))) [d, mo, y] = [+m[1], +m[2], +m[3]];
  else return fail(`Tanggal "${s}" tidak dikenali. Pakai 2000-01-31 atau 31-01-2000 (atau "hari").`);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) fail(`Tanggal ${s} tidak ada di kalender.`);
  return dt;
}
const fmtDate = (d) => `${DAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
const dayN = (d) => Math.round(d.getTime() / 86400000);
const weton = (d) => `${DAYS[d.getUTCDay()]} ${PASARAN[(((dayN(d) + 3) % 5) + 5) % 5]}`;
function ymd(a, b) { // selisih tahun, bulan, hari (a <= b)
  let y = b.getUTCFullYear() - a.getUTCFullYear(), m = b.getUTCMonth() - a.getUTCMonth(), d = b.getUTCDate() - a.getUTCDate();
  if (d < 0) { m--; d += new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), 0)).getUTCDate(); }
  if (m < 0) { y--; m += 12; }
  return { y, m, d };
}
function selisih(args) {
  if (args.length < 2) fail('Contoh: selisih 2024-01-01 2024-12-31');
  let a = parseDate(args[0]), b = parseDate(args[1]); if (a > b) [a, b] = [b, a];
  const r = ymd(a, b), days = dayN(b) - dayN(a);
  return `📆 ${fmtDate(a)} → ${fmtDate(b)}\n*${days} hari* (${nf(days / 7, 1)} minggu)\n= ${r.y} tahun ${r.m} bulan ${r.d} hari`;
}
function umur(args) {
  const b = parseDate(args[0] || fail('Contoh: umur 2000-01-31')), n = parseDate('hari');
  if (b > n) fail('Tanggal lahir di masa depan.');
  const r = ymd(b, n);
  let nxt = new Date(Date.UTC(n.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate())); if (nxt < n) nxt = new Date(Date.UTC(n.getUTCFullYear() + 1, b.getUTCMonth(), b.getUTCDate()));
  return `🎂 Lahir ${fmtDate(b)}\nUmur: *${r.y} tahun ${r.m} bulan ${r.d} hari*\nTotal ${dayN(n) - dayN(b)} hari · ulang tahun berikutnya ${dayN(nxt) - dayN(n)} hari lagi\nWeton: ${weton(b)}`;
}
function tanggalTambah(args) {
  if (args.length < 2) fail('Contoh: tambahhari 2024-01-01 30 (boleh negatif)');
  const d = parseDate(args[0]), n = Math.round(parseNum(args[1]));
  if (Math.abs(n) > 365000) fail('Terlalu jauh.');
  const r = new Date(d.getTime() + n * 86400000);
  return `${fmtDate(d)} ${n >= 0 ? '+' : '−'} ${Math.abs(n)} hari = *${fmtDate(r)}*`;
}
const wetonCmd = (args) => { const d = parseDate(args[0] || 'hari'); return `🌙 ${fmtDate(d)}\nWeton: *${weton(d)}*`; };

/* ======================= Acak & tim ======================= */
function shuffle(a) { const r = a.slice(); for (let i = r.length - 1; i > 0; i--) { const j = rint(i + 1); [r[i], r[j]] = [r[j], r[i]]; } return r; }
const splitList = (s) => String(s).split(/\n|,|;|\|/).map((x) => x.trim()).filter(Boolean);
function tim(args, text) {
  const n = parseInt(args[0], 10);
  const names = splitList(text.replace(/^\s*\d+\s*/, ''));
  if (!n || n < 2 || names.length < n) fail('Contoh: tim 2 Ani, Budi, Cici, Dedi (jumlah tim lalu daftar nama)');
  const teams = Array.from({ length: n }, () => []);
  shuffle(names).forEach((x, i) => teams[i % n].push(x));
  return teams.map((t, i) => `*Tim ${i + 1}* (${t.length})\n` + t.map((x) => '• ' + x).join('\n')).join('\n\n');
}
const acak = (text) => { const l = splitList(text); if (l.length < 2) fail('Contoh: acak a, b, c, d'); return '🔀 ' + shuffle(l).map((x, i) => `${i + 1}. ${x}`).join('\n'); };

/* ======================= Teks ======================= */
function terbilangID(n) {
  const sat = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'];
  const f = (x) => {
    if (x < 12) return sat[x];
    if (x < 20) return f(x - 10) + ' belas';
    if (x < 100) return f(Math.floor(x / 10)) + ' puluh' + (x % 10 ? ' ' + f(x % 10) : '');
    if (x < 200) return 'seratus' + (x > 100 ? ' ' + f(x - 100) : '');
    if (x < 1000) return f(Math.floor(x / 100)) + ' ratus' + (x % 100 ? ' ' + f(x % 100) : '');
    if (x < 2000) return 'seribu' + (x > 1000 ? ' ' + f(x - 1000) : '');
    if (x < 1e6) return f(Math.floor(x / 1000)) + ' ribu' + (x % 1000 ? ' ' + f(x % 1000) : '');
    if (x < 1e9) return f(Math.floor(x / 1e6)) + ' juta' + (x % 1e6 ? ' ' + f(x % 1e6) : '');
    if (x < 1e12) return f(Math.floor(x / 1e9)) + ' miliar' + (x % 1e9 ? ' ' + f(x % 1e9) : '');
    return f(Math.floor(x / 1e12)) + ' triliun' + (x % 1e12 ? ' ' + f(x % 1e12) : '');
  };
  return n === 0 ? 'nol' : f(n);
}
function numEN(n) {
  const a = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'], b = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  const f = (x) => (x < 20 ? a[x] : x < 100 ? b[Math.floor(x / 10)] + (x % 10 ? '-' + a[x % 10] : '') : x < 1000 ? a[Math.floor(x / 100)] + ' hundred' + (x % 100 ? ' ' + f(x % 100) : '')
    : x < 1e6 ? f(Math.floor(x / 1000)) + ' thousand' + (x % 1000 ? ' ' + f(x % 1000) : '') : x < 1e9 ? f(Math.floor(x / 1e6)) + ' million' + (x % 1e6 ? ' ' + f(x % 1e6) : '')
      : x < 1e12 ? f(Math.floor(x / 1e9)) + ' billion' + (x % 1e9 ? ' ' + f(x % 1e9) : '') : f(Math.floor(x / 1e12)) + ' trillion' + (x % 1e12 ? ' ' + f(x % 1e12) : ''));
  return n === 0 ? 'zero' : f(n);
}
const ROMAN = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
const toRoman = (n) => { let r = ''; for (const [v, s] of ROMAN) while (n >= v) { r += s; n -= v; } return r; };
function fromRoman(s) {
  const t = s.toUpperCase(); if (!/^[MDCLXVI]+$/.test(t)) return null;
  const v = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 }; let n = 0;
  for (let i = 0; i < t.length; i++) n += v[t[i]] < (v[t[i + 1]] || 0) ? -v[t[i]] : v[t[i]];
  return toRoman(n) === t ? n : null;
}
function terbilang(args) {
  const raw = args.join('').replace(/[.\s]/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(raw)) fail('Contoh: terbilang 1234567');
  const neg = raw.startsWith('-'), [ip, fp] = raw.replace('-', '').split('.'), n = Number(ip);
  if (n > 999999999999999) fail('Maksimal 999 triliun');
  let id = (neg ? 'minus ' : '') + terbilangID(n), en = (neg ? 'minus ' : '') + numEN(n);
  if (fp) { const dg = fp.split('').map((c) => terbilangID(+c)); id += ' koma ' + dg.join(' '); en += ' point ' + fp.split('').map((c) => numEN(+c)).join(' '); }
  const cap = (s) => s[0].toUpperCase() + s.slice(1);
  return `🔢 *${nf(Number(raw), 6)}*\n🇮🇩 ${cap(id)}\n💵 ${cap(id)} rupiah\n🇬🇧 ${cap(en)}\n🏛️ Romawi: ${n >= 1 && n <= 3999 && !fp ? toRoman(n) : '—'}`;
}
function romawi(args) {
  const t = args.join('').trim(); if (!t) fail('Contoh: romawi 1994 atau romawi MCMXCIV');
  if (/^\d+$/.test(t)) { const n = +t; if (n < 1 || n > 3999) fail('Rentang 1–3999'); return `🏛️ ${n} = *${toRoman(n)}*`; }
  const n = fromRoman(t); if (n === null) fail('Angka Romawi tidak valid'); return `🏛️ ${t.toUpperCase()} = *${n}*`;
}
const words = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_\-.]+/g, ' ').trim().split(/\s+/).filter(Boolean);
const cap1 = (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
const CASES = {
  besar: (s) => s.toUpperCase(), kecil: (s) => s.toLowerCase(), judul: (s) => s.toLowerCase().replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase()),
  kalimat: (s) => s.toLowerCase().replace(/(^\s*|[.!?]\s+)([a-z])/g, (m, a, b) => a + b.toUpperCase()),
  camel: (s) => words(s).map((w, i) => (i ? cap1(w) : w.toLowerCase())).join(''), pascal: (s) => words(s).map(cap1).join(''),
  snake: (s) => words(s).map((w) => w.toLowerCase()).join('_'), kebab: (s) => words(s).map((w) => w.toLowerCase()).join('-'),
  slug: (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
  balik: (s) => [...s].reverse().join(''), tukar: (s) => [...s].map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())).join(''),
};
function huruf(args, text) {
  const kind = (args[0] || '').toLowerCase(), body = text.slice(args[0] ? text.indexOf(args[0]) + args[0].length : 0).trim();
  if (!CASES[kind] || !body) fail('Contoh: huruf besar halo dunia\nGaya: ' + Object.keys(CASES).join(', '));
  return CASES[kind](body);
}
function hitungKata(text) {
  const t = text.trim(); if (!t) fail('Contoh: hitungkata <teks> (atau balas pesan dengan perintah ini)');
  const w = t.split(/\s+/).filter(Boolean).length, c = [...t].length, cs = [...t.replace(/\s/g, '')].length;
  const sent = (t.match(/[^.!?]+[.!?]*/g) || []).filter((x) => x.trim()).length, para = t.split(/\n\s*\n/).filter((x) => x.trim()).length, lines = t.split('\n').length;
  const mins = w / 200;
  return `📝 *Statistik teks*\nKata: *${nf(w, 0)}*\nKarakter: ${nf(c, 0)} (tanpa spasi ${nf(cs, 0)})\nKalimat: ${sent} · Paragraf: ${para} · Baris: ${lines}\n⏱️ Waktu baca ± ${mins < 1 ? Math.max(1, Math.round(mins * 60)) + ' detik' : nf(mins, 1) + ' menit'}`;
}
const mapRange = (s, ranges) => [...s].map((ch) => { const c = ch.codePointAt(0); for (const [lo, hi, base] of ranges) if (c >= lo && c <= hi) return String.fromCodePoint(base + c - lo); return ch; }).join('');
const STYLES = [
  ['Tebal', (s) => mapRange(s, [[65, 90, 0x1D400], [97, 122, 0x1D41A], [48, 57, 0x1D7CE]])],
  ['Miring', (s) => mapRange(s, [[65, 90, 0x1D434], [97, 122, 0x1D44E]]).replace(/h/g, 'ℎ')],
  ['Tebal miring', (s) => mapRange(s, [[65, 90, 0x1D468], [97, 122, 0x1D482]])],
  ['Sans tebal', (s) => mapRange(s, [[65, 90, 0x1D5D4], [97, 122, 0x1D5EE], [48, 57, 0x1D7EC]])],
  ['Tulisan tangan', (s) => mapRange(s, [[65, 90, 0x1D4D0], [97, 122, 0x1D4EA]])],
  ['Monospasi', (s) => mapRange(s, [[65, 90, 0x1D670], [97, 122, 0x1D68A], [48, 57, 0x1D7F6]])],
  ['Gothic', (s) => mapRange(s, [[65, 90, 0x1D56C], [97, 122, 0x1D586]])],
  ['Lebar penuh', (s) => mapRange(s, [[33, 126, 0xFF01]]).replace(/ /g, '　')],
  ['Lingkaran', (s) => mapRange(s, [[65, 90, 0x24B6], [97, 122, 0x24D0], [49, 57, 0x2460]]).replace(/0/g, '⓪')],
  ['Kotak', (s) => mapRange(s.toUpperCase(), [[65, 90, 0x1F130]])],
  ['Kapital kecil', (s) => [...s.toLowerCase()].map((c) => ({ a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ꜰ', g: 'ɢ', h: 'ʜ', i: 'ɪ', j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ', n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ', s: 'ꜱ', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ' }[c] || c)).join('')],
  ['Coret', (s) => [...s].map((c) => c + '\u0336').join('')],
  ['Garis bawah', (s) => [...s].map((c) => c + '\u0332').join('')],
];
function gaya(text) {
  const t = text.trim().slice(0, 200); if (!t) fail('Contoh: gaya Halo Dunia');
  return '✨ *Gaya teks*\n\n' + STYLES.map(([n, f]) => `*${n}*\n${f(t)}`).join('\n\n');
}
function rapikan(args, text) {
  const op = (args[0] || '').toLowerCase(), OPS = ['urut', 'unik', 'nomor', 'acak', 'balik', 'bersih', 'urutbalik'];
  if (!OPS.includes(op)) fail('Contoh: rapikan urut (lalu daftar, satu per baris)\nPilihan: ' + OPS.join(', '));
  const body = text.slice(text.indexOf(args[0]) + args[0].length).replace(/^\s*\n/, '').trim();
  let l = body.split('\n').map((x) => x.trim()).filter(Boolean);
  if (l.length < 2) fail('Tulis daftar minimal 2 baris di bawah perintah.');
  if (op === 'urut') l.sort((a, b) => a.localeCompare(b, 'id', { numeric: true, sensitivity: 'base' }));
  if (op === 'urutbalik') l.sort((a, b) => b.localeCompare(a, 'id', { numeric: true, sensitivity: 'base' }));
  if (op === 'unik') l = l.filter((x, i) => l.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i);
  if (op === 'acak') l = shuffle(l);
  if (op === 'balik') l.reverse();
  if (op === 'nomor') return l.map((x, i) => `${i + 1}. ${x}`).join('\n');
  return l.join('\n');
}

/* ======================= Developer ======================= */
function json(args, text) {
  const mode = /^(min|mini|minify|cek|valid|urut)$/i.test(args[0] || '') ? args[0].toLowerCase() : 'format';
  const body = mode === 'format' ? text : text.slice(text.indexOf(args[0]) + args[0].length).trim();
  if (!body) fail('Contoh: json {"a":1,"b":[1,2]}\nOpsi: json min …, json cek …, json urut …');
  let o; try { o = JSON.parse(body); } catch (e) { const pos = /position (\d+)/.exec(e.message); const before = pos ? body.slice(0, +pos[1]).split('\n') : null; fail('JSON tidak valid: ' + e.message.replace(/^JSON\.parse: /, '') + (before ? ` (baris ${before.length}, kolom ${before[before.length - 1].length + 1})` : '')); }
  const sortKeys = (v) => (Array.isArray(v) ? v.map(sortKeys) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v);
  if (/^(cek|valid)$/.test(mode)) return '✅ JSON valid · ' + (Array.isArray(o) ? `array (${o.length} item)` : typeof o === 'object' && o ? `objek (${Object.keys(o).length} kunci)` : typeof o);
  if (/^min/.test(mode)) return JSON.stringify(o);
  return JSON.stringify(mode === 'urut' ? sortKeys(o) : o, null, 2);
}
function base64(args, text) {
  const op = (args[0] || '').toLowerCase(), body = text.slice(text.indexOf(args[0] || '') + (args[0] || '').length).trim();
  if (!['enc', 'encode', 'dec', 'decode'].includes(op) || !body) fail('Contoh: base64 enc Halo\nbase64 dec SGFsbw==');
  if (op.startsWith('enc')) return Buffer.from(body, 'utf8').toString('base64');
  const clean = body.replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean) || clean.length % 4 === 1) fail('Bukan Base64 yang valid');
  return Buffer.from(clean, 'base64').toString('utf8');
}
function hash(args, text) {
  const algs = ['md5', 'sha1', 'sha256', 'sha512'], a = (args[0] || '').toLowerCase().replace('-', '');
  const useAlg = algs.includes(a), body = useAlg ? text.slice(text.indexOf(args[0]) + args[0].length).trim() : text;
  if (!body) fail('Contoh: hash Halo (semua) atau hash sha256 Halo');
  return '#️⃣ *Hash*\n' + (useAlg ? [a] : algs.slice(0, 3)).map((x) => `*${x.toUpperCase()}*\n\`${crypto.createHash(x).update(body).digest('hex')}\``).join('\n');
}
const CROCK = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function ulid() { let t = Date.now(), ts = ''; for (let i = 0; i < 10; i++) { ts = CROCK[t % 32] + ts; t = Math.floor(t / 32); } return ts + Array.from({ length: 16 }, () => CROCK[rint(32)]).join(''); }
function uuid7() { const b = crypto.randomBytes(16), t = BigInt(Date.now()); for (let i = 0; i < 6; i++) b[i] = Number((t >> BigInt(8 * (5 - i))) & 0xffn); b[6] = (b[6] & 0x0f) | 0x70; b[8] = (b[8] & 0x3f) | 0x80; const h = b.toString('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`; }
function uuid(args) {
  const n = Math.min(10, Math.max(1, parseInt(args.find((a) => /^\d+$/.test(a)), 10) || 3)), kind = (args.find((a) => /^(v4|v7|ulid)$/i.test(a)) || 'v4').toLowerCase();
  const gen = kind === 'ulid' ? ulid : kind === 'v7' ? uuid7 : () => crypto.randomUUID();
  return `🆔 *${kind === 'ulid' ? 'ULID' : 'UUID ' + kind}*\n` + Array.from({ length: n }, () => '`' + gen() + '`').join('\n');
}
const b64u = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
function jwt(args) {
  const t = (args[0] || '').trim(); const p = t.split('.');
  if (p.length !== 3) fail('Contoh: jwt eyJhbGciOi… (token berisi 3 bagian dipisah titik)');
  let h, b; try { h = JSON.parse(b64u(p[0])); b = JSON.parse(b64u(p[1])); } catch (e) { fail('Token tidak valid: bagian token bukan Base64/JSON yang benar.'); }
  let out = `🔑 *JWT*\nAlgoritma: ${h.alg || '?'}\n\n*Header*\n${JSON.stringify(h, null, 2)}\n\n*Payload*\n${JSON.stringify(b, null, 2)}`;
  const fmt = (s) => new Date(s * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  if (b.iat) out += `\n\nDiterbitkan: ${fmt(b.iat)}`;
  if (b.exp) out += `\nKedaluwarsa: ${fmt(b.exp)} ${b.exp * 1000 < Date.now() ? '⚠️ *sudah kedaluwarsa*' : '✅ masih berlaku'}`;
  if (args[1] && h.alg === 'HS256') { const sig = crypto.createHmac('sha256', args[1]).update(p[0] + '.' + p[1]).digest('base64url'); out += `\nTanda tangan: ${sig === p[2] ? '✅ valid' : '❌ TIDAK cocok'}`; }
  return out;
}
function waktu(args) {
  const t = args.join(' ').trim();
  const zone = (d) => `🕒 UTC: ${d.toISOString().replace('T', ' ').slice(0, 19)}\n🇮🇩 WIB: ${new Date(d.getTime() + 7 * 3600000).toISOString().replace('T', ' ').slice(0, 19)}\n🇮🇩 WITA: ${new Date(d.getTime() + 8 * 3600000).toISOString().replace('T', ' ').slice(0, 19)}\n🇮🇩 WIT: ${new Date(d.getTime() + 9 * 3600000).toISOString().replace('T', ' ').slice(0, 19)}`;
  if (!t || t === 'now') { const d = new Date(); return zone(d) + `\n⏱️ Unix: ${Math.floor(d / 1000)} (ms ${d.getTime()})`; }
  if (/^-?\d{9,13}$/.test(t)) { const n = Number(t), d = new Date(t.length >= 13 ? n : n * 1000); if (isNaN(d)) fail('Timestamp tidak valid'); return `Unix ${t}\n` + zone(d); }
  const d = new Date(/z|[+-]\d\d:?\d\d$/i.test(t) ? t : t.replace(' ', 'T') + 'Z'); if (isNaN(d)) fail('Contoh: waktu 1735689600 atau waktu 2025-01-01 07:00 (dianggap UTC)');
  return `${t}\n` + zone(d) + `\n⏱️ Unix: ${Math.floor(d / 1000)}`;
}
function url(args, text) {
  const op = (args[0] || '').toLowerCase(), body = text.slice(text.indexOf(args[0] || '') + (args[0] || '').length).trim();
  if (!body) fail('Contoh: url enc a b&c\nurl dec a%20b\nurl parse https://x.com/a?b=1');
  if (op.startsWith('enc')) return encodeURIComponent(body);
  if (op.startsWith('dec')) { try { return decodeURIComponent(body.replace(/\+/g, ' ')); } catch (e) { return fail('Bukan URL-encoding yang valid'); } }
  let u; try { u = new URL(op === 'parse' ? body : args.join(' ')); } catch (e) { return fail('Bukan URL lengkap (awali dengan https://)'); }
  const q = [...u.searchParams].map(([k, v]) => `  ${k} = ${v}`).join('\n');
  return `🔗 *URL*\nProtokol: ${u.protocol}\nHost: ${u.hostname}${u.port ? '\nPort: ' + u.port : ''}\nPath: ${u.pathname}${u.hash ? '\nHash: ' + u.hash : ''}${q ? '\nParameter:\n' + q : ''}`;
}
function parseColor(s) {
  const t = s.trim().toLowerCase(); let m;
  if ((m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/.exec(t))) { let x = m[1]; if (x.length === 3) x = x.replace(/./g, '$&$&'); return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16)); }
  if ((m = /^(?:rgb\()?\s*(\d{1,3})\s*[ ,]\s*(\d{1,3})\s*[ ,]\s*(\d{1,3})\s*\)?$/.exec(t))) { const c = [+m[1], +m[2], +m[3]]; if (c.every((x) => x <= 255)) return c; }
  if ((m = /^hsl\(\s*(\d+)[ ,]+(\d+)%?[ ,]+(\d+)%?\s*\)$/.exec(t))) {
    const h = +m[1] % 360, s2 = +m[2] / 100, l = +m[3] / 100, k = (n) => (n + h / 30) % 12, a = s2 * Math.min(l, 1 - l), f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
    return [f(0), f(8), f(4)].map((x) => Math.round(x * 255));
  }
  return fail('Warna tidak dikenali. Contoh: warna #14b8a6 | warna rgb(20,184,166) | warna hsl(173,80%,40%)');
}
function warna(args) {
  const [r, g, b] = parseColor(args.join(' ')), mx = Math.max(r, g, b) / 255, mn = Math.min(r, g, b) / 255, l = (mx + mn) / 2, d = mx - mn;
  let h = 0, s = 0;
  if (d) { s = d / (1 - Math.abs(2 * l - 1)); const R = r / 255, G = g / 255, B = b / 255; h = mx === R ? ((G - B) / d) % 6 : mx === G ? (B - R) / d + 2 : (R - G) / d + 4; h = (h * 60 + 360) % 360; }
  const k = 1 - mx, c = k < 1 ? (1 - r / 255 - k) / (1 - k) : 0, m = k < 1 ? (1 - g / 255 - k) / (1 - k) : 0, y = k < 1 ? (1 - b / 255 - k) / (1 - k) : 0;
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }, L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const ratio = (a) => (Math.max(L, a) + 0.05) / (Math.min(L, a) + 0.05), cw = ratio(1), cb = ratio(0);
  const hex = '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `🎨 *${hex}*\nRGB: rgb(${r}, ${g}, ${b})\nHSL: hsl(${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)\nCMYK: ${Math.round(c * 100)}, ${Math.round(m * 100)}, ${Math.round(y * 100)}, ${Math.round(k * 100)}\nKontras vs putih ${nf(cw, 2)}:1 ${cw >= 4.5 ? '✅' : '❌'} · vs hitam ${nf(cb, 2)}:1 ${cb >= 4.5 ? '✅' : '❌'}`;
}
const MORSE = { a: '.-', b: '-...', c: '-.-.', d: '-..', e: '.', f: '..-.', g: '--.', h: '....', i: '..', j: '.---', k: '-.-', l: '.-..', m: '--', n: '-.', o: '---', p: '.--.', q: '--.-', r: '.-.', s: '...', t: '-', u: '..-', v: '...-', w: '.--', x: '-..-', y: '-.--', z: '--..', 0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-', 5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.' };
const MORSE_R = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]));
const caesar = (s, n) => s.replace(/[a-z]/gi, (c) => { const b = c <= 'Z' ? 65 : 97; return String.fromCharCode(((c.charCodeAt(0) - b + n) % 26 + 26) % 26 + b); });
function encode(dir, args, text) {
  const kind = (args[0] || '').toLowerCase(), body = text.slice(text.indexOf(args[0] || '') + (args[0] || '').length).trim();
  const KINDS = ['morse', 'biner', 'hex', 'rot13', 'caesar'];
  if (!KINDS.includes(kind) || !body) fail(`Contoh: ${dir === 'enc' ? 'encode' : 'decode'} morse Halo\nJenis: ${KINDS.join(', ')} (caesar: tambah angka geser, mis. caesar 3 Halo)`);
  if (kind === 'rot13') return caesar(body, 13);
  if (kind === 'caesar') { const m = /^(-?\d+)\s+([\s\S]+)$/.exec(body); if (!m) fail('Contoh: encode caesar 3 Halo'); return caesar(m[2], dir === 'enc' ? +m[1] : -m[1]); }
  if (kind === 'hex') return dir === 'enc' ? Buffer.from(body).toString('hex').replace(/(..)/g, '$1 ').trim() : Buffer.from(body.replace(/\s|0x/g, ''), 'hex').toString('utf8');
  if (kind === 'biner') return dir === 'enc' ? [...Buffer.from(body)].map((x) => x.toString(2).padStart(8, '0')).join(' ') : Buffer.from(body.split(/\s+/).map((x) => parseInt(x, 2))).toString('utf8');
  if (dir === 'enc') return body.toLowerCase().split('').map((c) => (c === ' ' ? '/' : MORSE[c] || '')).filter(Boolean).join(' ');
  return body.split(/\s*\/\s*/).map((w) => w.trim().split(/\s+/).map((c) => MORSE_R[c] || '?').join('')).join(' ');
}
function regex(text) {
  const parts = text.split('\n'), first = parts[0] || '';
  const m = /^\/(.+)\/([gimsuy]*)\s*(?:\||$)\s*([\s\S]*)$/.exec(first + (parts.length > 1 ? '\n' + parts.slice(1).join('\n') : ''));
  const m2 = !m && text.includes('|') ? /^(.+?)\s*\|\s*([\s\S]+)$/.exec(text) : null;
  if (!m && !m2) fail('Contoh: regex /\\d+/g | tahun 2024 dan 2025\n(pola, lalu | dan teks uji)');
  const src = m ? m[1] : m2[1], flags = (m ? m[2] : 'g') || '', body = m ? m[3] : m2[2];
  let re; try { re = new RegExp(src, flags.includes('g') ? flags : flags + 'g'); } catch (e) { return fail('Pola tidak valid: ' + e.message); }
  const found = []; let r, guard = 0;
  while ((r = re.exec(body)) && guard++ < 50) { found.push(r); if (!r[0]) re.lastIndex++; }
  if (!found.length) return `🔍 /${src}/${flags}\nTidak ada kecocokan.`;
  return `🔍 /${src}/${flags}\n*${found.length} kecocokan*${found.length === 50 ? '+' : ''}\n` + found.slice(0, 15).map((x, i) => `${i + 1}. "${x[0]}" (posisi ${x.index})` + (x.length > 1 ? ' ' + x.slice(1).map((g, j) => `$${j + 1}="${g}"`).join(' ') : '')).join('\n');
}
function cron(args) {
  const f = args.slice(0, 5); if (f.length !== 5) fail('Contoh: cron */15 9-17 * * 1-5 (menit jam tanggal bulan hari-minggu)');
  const rng = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 6]];
  const parse = (s, [lo, hi], i) => {
    const set = new Set();
    for (const part of s.split(',')) {
      const m = /^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/.exec(part); if (!m) fail(`Bagian cron "${s}" tidak valid`);
      let a, b; if (m[1] === '*') [a, b] = [lo, hi]; else if (m[1].includes('-')) [a, b] = m[1].split('-').map(Number); else [a, b] = m[2] ? [+m[1], hi] : [+m[1], +m[1]];
      if (i === 4 && b === 7) b = 6; if (a < lo || b > hi || a > b) fail(`Nilai "${s}" di luar rentang ${lo}–${hi}`);
      for (let v = a; v <= b; v += m[2] ? +m[2] : 1) set.add(v);
    }
    return set;
  };
  const S = f.map((x, i) => parse(x, rng[i], i)), domStar = f[2] === '*', dowStar = f[4] === '*', out = [];
  let d = new Date(Date.now() + 7 * 3600000); d.setUTCSeconds(0, 0); d = new Date(d.getTime() + 60000);
  for (let guard = 0; guard < 600000 && out.length < 5; guard++, d = new Date(d.getTime() + 60000)) {
    const dom = S[2].has(d.getUTCDate()), dow = S[4].has(d.getUTCDay()), dayOk = domStar && dowStar ? true : domStar ? dow : dowStar ? dom : dom || dow;
    if (S[3].has(d.getUTCMonth() + 1) && dayOk && S[1].has(d.getUTCHours()) && S[0].has(d.getUTCMinutes())) out.push(new Date(d));
  }
  if (!out.length) fail('Tidak ada jadwal dalam setahun ke depan.');
  return `⏰ \`${f.join(' ')}\`\nJadwal berikutnya (WIB):\n` + out.map((x) => `• ${DAYS[x.getUTCDay()]} ${String(x.getUTCDate()).padStart(2, '0')} ${MONTHS[x.getUTCMonth()].slice(0, 3)} ${x.getUTCFullYear()} ${String(x.getUTCHours()).padStart(2, '0')}:${String(x.getUTCMinutes()).padStart(2, '0')}`).join('\n');
}

/* ======================= Mata uang ======================= */
const FX0 = { USD: 1, IDR: 16300, EUR: .92, GBP: .78, JPY: 150, SGD: 1.34, MYR: 4.5, AUD: 1.52, CNY: 7.2, SAR: 3.75, KRW: 1380, THB: 35, INR: 84, AED: 3.67, CAD: 1.38, CHF: .88, HKD: 7.8, PHP: 58, VND: 25000, NZD: 1.66 };
function kursHitung(amount, from, to, rates) {
  const f = from.toUpperCase(), t = to.toUpperCase();
  if (!(f in rates) || !(t in rates)) fail(`Mata uang tidak dikenal. Tersedia: ${Object.keys(FX0).join(', ')}`);
  return amount / rates[f] * rates[t];
}
async function kurs(args) {
  if (args.length < 3) fail('Contoh: kurs 100 usd idr');
  const amount = parseAmount(args[0]); let rates = FX0, note = '_Kurs perkiraan (offline)_';
  try {
    const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 6000);
    const j = await (await fetch('https://open.er-api.com/v6/latest/USD', { signal: ctl.signal })).json(); clearTimeout(tm);
    if (j && j.rates && j.rates.IDR) { rates = Object.fromEntries(Object.keys(FX0).map((c) => [c, j.rates[c] || FX0[c]])); note = '_Kurs terbaru_'; }
  } catch (e) { /* pakai perkiraan */ }
  const r = kursHitung(amount, args[1], args[2], rates), t = args[2].toUpperCase();
  return `💱 ${nf(amount, 2)} ${args[1].toUpperCase()} = *${nf(r, t === 'IDR' || t === 'VND' || t === 'KRW' ? 0 : r < 1 ? 6 : 2)} ${t}*\n${note}`;
}

/* ======================= Tautan WhatsApp & Wi-Fi ======================= */
function waLink(args) {
  let num = String(args[0] || '').replace(/[^\d]/g, ''); if (!num) fail('Contoh: walink 08123456789 Halo, apa kabar?');
  if (num.startsWith('0')) num = '62' + num.slice(1); else if (num.startsWith('8')) num = '62' + num;
  if (num.length < 8 || num.length > 15) fail('Nomor tidak valid');
  const msg = args.slice(1).join(' ');
  return `https://wa.me/${num}${msg ? '?text=' + encodeURIComponent(msg) : ''}`;
}
function wifiString(args) {
  if (args.length < 1) fail('Contoh: qrwifi NamaWifi sandi123 [WPA|WEP|nopass]');
  const esc = (s) => String(s).replace(/([\\;,:"])/g, '\\$1'), ssid = args[0], pass = args[1] || '', enc = (args[2] || (pass ? 'WPA' : 'nopass')).toUpperCase() === 'NOPASS' ? 'nopass' : (args[2] || 'WPA').toUpperCase();
  return `WIFI:T:${enc};S:${esc(ssid)};${enc === 'nopass' ? '' : 'P:' + esc(pass) + ';'};`;
}

module.exports = { nf, rp, parseAmount, calc, fmtCalc, convert, persen, diskon, margin, cicilan, tabungan, bagi, bmi, sandi, parseDate, selisih, umur, tanggalTambah, wetonCmd, weton, tim, acak, terbilang, terbilangID, romawi, toRoman, fromRoman,
  huruf, CASES, hitungKata, gaya, STYLES, rapikan, json, base64, hash, uuid, ulid, uuid7, jwt, waktu, url, warna, parseColor, encode, regex, cron, kurs, kursHitung, waLink, wifiString, splitList, FX0, U };
