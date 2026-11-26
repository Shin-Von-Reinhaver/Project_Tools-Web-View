'use strict';
const { spawn } = require('child_process');

/** Terowongan HTTPS gratis lewat Cloudflare (cloudflared). Memanggil onUrl(url) saat alamat publik siap. */
function start(port, onUrl) {
  let p;
  try { p = spawn('cloudflared', ['tunnel', '--no-autoupdate', '--url', 'http://localhost:' + port], { stdio: ['ignore', 'ignore', 'pipe'] }); }
  catch (e) { return console.warn('[tunnel] gagal memulai:', e.message); }
  p.on('error', (e) => console.warn(e.code === 'ENOENT' ? '[tunnel] cloudflared belum terpasang (https://github.com/cloudflare/cloudflared/releases)' : '[tunnel] ' + e.message));
  let found = false;
  p.stderr.on('data', (d) => {
    const m = !found && /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(String(d));
    if (m) { found = true; onUrl(m[0]); }
  });
  process.on('exit', () => p.kill());
}
module.exports = { start };
