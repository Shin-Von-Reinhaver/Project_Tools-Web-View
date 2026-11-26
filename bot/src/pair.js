'use strict';
const readline = require('readline');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Tanya satu baris di terminal. */
function askTty(q) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(q, (a) => { rl.close(); resolve(String(a).trim()); });
  });
}

/**
 * Tautkan WhatsApp lewat KODE (tanpa QR): cara termudah di HP/Termux karena QR tidak bisa dipindai di layar yang sama.
 * Berjalan hanya bila belum tertaut (status "qr"). number kosong + ask tersedia = tanya nomor di terminal.
 */
async function pairFlow({ state, request, number = '', ask = null, log = console.log, wait = 500, tries = 120 }) {
  for (let i = 0; i < tries && state.status !== 'qr'; i++) {
    if (state.status === 'open') return false;
    await sleep(wait);
  }
  if (state.status !== 'qr') return false;
  let n = number;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (!n) {
      if (!ask) return false;
      n = await ask('\nNomor WhatsApp untuk bot (contoh 6281234567890), atau Enter untuk pakai QR/panel: ');
      if (!n) return false;
    }
    try {
      const code = await request(n);
      log(`\n  KODE TAUTAN:  ${String(code).replace(/^(.{4})/, '$1-')}\n  Buka WhatsApp > Perangkat tertaut > Tautkan perangkat > Tautkan dengan nomor telepon, lalu masukkan kode itu.\n`);
      return true;
    } catch (e) {
      log('  ' + e.message);
      if (/sudah tertaut/.test(e.message)) return false;
      n = '';
      if (!ask) return false;
    }
  }
  return false;
}

module.exports = { pairFlow, askTty };
