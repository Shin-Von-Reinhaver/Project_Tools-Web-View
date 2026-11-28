'use strict';
/**
 * Server bot untuk tes e2e. TIDAK menyambung ke WhatsApp: wa.start() tidak dipanggil dan
 * wa.requestPair diganti stub, jadi tidak ada koneksi atau pesan nyata.
 * Pakai: node tests/bot_server.js <port> <datadir>   (env: OWNER_TOKEN, ALLOWED_ORIGIN)
 */
const path = require('path');
const [port, dataDir] = [process.argv[2] || '0', process.argv[3] || require('os').tmpdir()];
process.env.PORT = port; process.env.DATA_DIR = dataDir; process.env.OWNER_NUMBER = process.env.OWNER_NUMBER || '6281111111111';
process.env.OWNER_TOKEN = process.env.OWNER_TOKEN || 'tes-kunci-sangat-panjang-1234567890';
const bot = path.join(__dirname, '..', 'bot', 'src');
const wa = require(path.join(bot, 'whatsapp'));
const stubCalls = [];
// Meniru perilaku asli: kode disimpan di wa.state.pairingCode agar polling /api/owner/state ikut membawanya.
wa.requestPair = async (n) => { stubCalls.push(n); if (!/^\d{8,15}$/.test(String(n || ''))) throw new Error('Nomor tidak valid'); wa.state.pairingCode = 'TEST-0000'; return 'TEST-0000'; };
const db = require(path.join(bot, 'db')); db.load();
const server = require(path.join(bot, 'server')).create();
server.listen(+port, '0.0.0.0', () => console.log('READY ' + server.address().port));
process.on('SIGTERM', () => { server.close(); process.exit(0); });
