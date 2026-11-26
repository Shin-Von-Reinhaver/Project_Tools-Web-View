'use strict';
const cfg = require('./config');
const db = require('./db');
const wa = require('./whatsapp');
const { create } = require('./server');
const { spawn } = require('child_process');
const { pairFlow, askTty } = require('./pair');

db.load();
const reminders = require('./reminders');

/** Mencetak ringkasan + link koneksi: buka link itu, panel langsung tersambung dan masuk sebagai Creator. */
function banner(base) {
  const panel = cfg.panelUrl || (cfg.serveStatic ? base : '');
  const link = panel ? `${panel}/#bot=${encodeURIComponent(base)}&key=${encodeURIComponent(cfg.ownerToken)}` : '';
  console.log([
    '', `  ${cfg.botName} siap`, '  ' + '─'.repeat(52),
    `  Alamat bot : ${base}`,
    `  Kunci API  : ${cfg.ownerToken}   (rahasia, jangan dibagikan)`,
    link ? `  Link panel : ${link}` : '  Link panel : isi PANEL_URL di .env (alamat situs index.html kamu)',
    `  Kirim pesan: ${base}/api/send?key=KUNCI&to=6281234567890&message=Halo`,
    '  ' + '─'.repeat(52), '',
  ].join('\n'));
  return link;
}

const server = create();
server.listen(cfg.port, () => {
  const base = cfg.publicUrl || `http://localhost:${cfg.port}`;
  const link = banner(base);
  // Termux: buka panel di browser HP otomatis (alamat localhost, jadi aman)
  if (cfg.isTermux && cfg.openBrowser && link && !cfg.publicUrl) spawn('termux-open-url', [link], { stdio: 'ignore' }).on('error', () => {});
  if (cfg.tunnel) require('./tunnel').start(cfg.port, (url) => { console.log('[tunnel] alamat publik HTTPS:'); banner(url); });
});
wa.start();
setInterval(() => reminders.tick((to, t) => { if (wa.state.status !== 'open') throw new Error('offline'); return wa.sendText(to, t); }).catch(() => {}), 5000).unref();
if (cfg.pairNumber || process.stdin.isTTY) pairFlow({ state: wa.state, request: wa.requestPair, number: cfg.pairNumber, ask: process.stdin.isTTY ? askTty : null }).catch(() => {});

const bye = () => { wa.stop(); db.save(); setTimeout(() => process.exit(0), 600); server.close(); };
process.on('SIGINT', bye); process.on('SIGTERM', bye);
process.on('unhandledRejection', (e) => console.error('[unhandled]', e && e.message));
