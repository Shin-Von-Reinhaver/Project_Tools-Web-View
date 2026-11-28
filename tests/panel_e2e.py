#!/usr/bin/env python3
"""Tes e2e panel bot di index.html terhadap bot tanpa WhatsApp (tests/bot_server.js).
Tidak ada koneksi/pesan WhatsApp nyata: pairing memakai stub. Jalankan: python3 tests/panel_e2e.py [--browser chromium|firefox|webkit]"""
import functools, http.server, json, os, shutil, socket, ssl, subprocess, sys, tempfile, threading, time, urllib.request
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KEY = 'tes-kunci-sangat-panjang-1234567890'
fails = []
def check(name, ok, info=''):
    print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else '  -> ' + str(info)[:240]))
    if not ok: fails.append(name)

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try: s.connect(('10.255.255.255', 1)); ip = s.getsockname()[0]
    except Exception: ip = '127.0.0.1'
    finally: s.close()
    return ip

def free_port():
    s = socket.socket(); s.bind(('0.0.0.0', 0)); p = s.getsockname()[1]; s.close(); return p

def serve(root, https=False, tmp=None):
    port = free_port(); h = functools.partial(Quiet, directory=root)
    srv = http.server.ThreadingHTTPServer(('0.0.0.0', port), h)
    if https:
        crt, key = os.path.join(tmp, 'c.pem'), os.path.join(tmp, 'k.pem')
        subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', crt, '-subj', '/CN=localhost', '-days', '1',
                        '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], check=True, capture_output=True)
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER); ctx.load_cert_chain(crt, key); srv.socket = ctx.wrap_socket(srv.socket, server_side=True)
    threading.Thread(target=srv.serve_forever, daemon=True).start(); return port, srv

def start_bot(tmp, origins):
    port = free_port(); env = dict(os.environ, OWNER_TOKEN=KEY, ALLOWED_ORIGIN=origins, OWNER_NUMBER='6281111111111')
    p = subprocess.Popen(['node', os.path.join(ROOT, 'tests', 'bot_server.js'), str(port), os.path.join(tmp, 'botdata-' + str(port))], env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    t0 = time.time()
    while time.time() - t0 < 15:
        if 'READY' in (p.stdout.readline() or ''): return p, port
    p.kill(); raise RuntimeError('bot test server tidak mulai')

def http_json(url, method='GET', body=None, headers=None):
    req = urllib.request.Request(url, method=method, data=json.dumps(body).encode() if body is not None else None, headers=dict({'Content-Type': 'application/json'}, **(headers or {})))
    try:
        with urllib.request.urlopen(req, timeout=8) as r: return r.status, json.loads(r.read() or b'{}')
    except urllib.error.HTTPError as e:
        try: return e.code, json.loads(e.read() or b'{}')
        except Exception: return e.code, {}

def main():
    bname = sys.argv[sys.argv.index('--browser') + 1] if '--browser' in sys.argv else 'chromium'
    tmp = tempfile.mkdtemp(prefix='panel-e2e-'); procs = []
    try:
        ip = lan_ip()
        site_port, _ = serve(ROOT); https_port, _ = serve(ROOT, https=True, tmp=tmp)
        origins = f'http://localhost:{site_port},http://127.0.0.1:{site_port},https://localhost:{https_port},https://127.0.0.1:{https_port}'
        bot, bport = start_bot(tmp, origins); procs.append(bot)
        base = f'http://localhost:{bport}'
        # --- API tanpa panel
        st, j = http_json(base + '/api/status'); check('API /api/status publik tanpa rahasia', st == 200 and 'ownerToken' not in json.dumps(j) and KEY not in json.dumps(j), j)
        check('/api/owner/state tanpa login ditolak (401)', http_json(base + '/api/owner/state')[0] == 401)
        check('/api/owner/pair tanpa login ditolak (401)', http_json(base + '/api/owner/pair', 'POST', {'number': '628123456789'})[0] == 401)
        check('/api/send dengan kunci salah ditolak (401)', http_json(base + '/api/send?key=salah&to=6281&message=x')[0] == 401)
        st, j = http_json(base + '/api/login', 'POST', {'token': KEY}); sess = j.get('session', '')
        check('login benar menghasilkan sesi 64-hex', st == 200 and len(sess) == 64, j)
        check('sesi valid membuka /api/owner/state', http_json(base + '/api/owner/state', headers={'Authorization': 'Bearer ' + sess})[0] == 200)
        check('sesi palsu ditolak', http_json(base + '/api/owner/state', headers={'Authorization': 'Bearer ' + 'a' * 64})[0] == 401)
        check('/api/commands tidak membocorkan perintah pemilik', not any(c.get('name') in ('ban', 'bc', 'broadcast') for c in http_json(base + '/api/commands')[1].get('list', [])))

        with sync_playwright() as p:
            b = getattr(p, bname).launch(); 
            def page(ctxargs=None):
                ctx = b.new_context(ignore_https_errors=True, **(ctxargs or {})); pg = ctx.new_page(); pg.errs = []; pg.reqs = []
                pg.on('pageerror', lambda e: pg.errs.append(str(e)))
                pg.on('request', lambda r: pg.reqs.append((r.method, r.url)) if '/api/' in r.url else None)
                return ctx, pg
            # --- A: link panel benar -> terhubung sebagai Creator
            ctx, pg = page(); site = f'http://localhost:{site_port}/index.html'
            pg.goto(f'{site}#bot={base}&key={KEY}'); pg.wait_for_timeout(2500)
            body = pg.inner_text('#botSec')
            check('panel terhubung via link (tanpa galat JS)', not pg.errs and pg.locator('#creatorBadge').count() >= 1, (pg.errs, body[:200]))
            check('kunci dihapus dari URL setelah dipakai', KEY not in pg.url, pg.url)
            check('daftar perintah dimuat dari bot', pg.locator('#botCmdList').count() == 1 and len(pg.evaluate("document.querySelector('#botCmdList').textContent")) > 200)
            # --- pairing (stub): input tidak valid vs valid
            import re
            def pair_btn(): return pg.locator('#botOwnerBox button.btn').filter(has_text=re.compile('Get code|Minta kode|Dapatkan kode', re.I)).first
            def pair_in(): return pg.locator('#botOwnerBox input').first
            if pair_in().count() and pair_btn().count():
                pair_in().fill('12'); pair_btn().click(); pg.wait_for_timeout(900)
                check('pairing: nomor tidak valid ditolak (tanpa kode)', 'TEST-0000' not in pg.inner_text('#botOwnerBox'), pg.inner_text('#botOwnerBox')[-160:])
                pair_in().fill('628123456789'); pair_btn().click(); pg.wait_for_timeout(1200)
                check('pairing: nomor valid menampilkan kode dari stub (tanpa WhatsApp nyata)', 'TEST-0000' in pg.inner_text('#botOwnerBox'), pg.inner_text('#botOwnerBox')[-200:])
            else: check('pairing: kolom dan tombol ditemukan', False, pg.inner_text('#botOwnerBox')[:300])
            ctx.close()
            # --- B: sesi kedaluwarsa dibuang
            ctx, pg = page(); pg.goto(site); pg.wait_for_timeout(500)
            pg.evaluate("(b)=>{localStorage.setItem('botBase',b);localStorage.setItem('botSession',JSON.stringify({s:'a'.repeat(64),exp:Date.now()-1000,base:b}))}", base); pg.reload(); pg.wait_for_timeout(2000)
            check('sesi kedaluwarsa tidak dipakai (tanpa lencana Creator)', pg.locator('#creatorBadge').count() == 0 and not pg.errs, pg.errs); ctx.close()
            # --- C: kunci salah, lalu penguncian setelah 5 kali (perilaku terkonfirmasi, lihat SECURITY.md)
            ctx, pg = page(); pg.goto(f'{site}#bot={base}&key=kunci-salah-kunci-salah'); pg.wait_for_timeout(2000)
            check('kunci salah: tidak masuk sebagai Creator dan tanpa galat JS', pg.locator('#creatorBadge').count() == 0 and not pg.errs, pg.errs); ctx.close()
            for _ in range(5): http_json(base + '/api/login', 'POST', {'token': 'salah-lagi'})
            st, j = http_json(base + '/api/login', 'POST', {'token': KEY})
            check('TERKONFIRMASI: setelah 5 gagal, login benar dari alamat yang sama tetap 429 (global di belakang proxy)', st == 429, (st, j))
            # --- D: mixed content (situs HTTPS -> bot HTTP)
            lan = f'http://{ip}:{bport}'
            if not ip.startswith('127.'):
                ctx, pg = page(); pg.goto(f'https://localhost:{https_port}/index.html#bot={lan}&key={KEY}'); pg.wait_for_timeout(3000)
                t = pg.inner_text('#botSec').lower()
                check('mixed-content: HTTPS -> bot HTTP (IP LAN) tidak crash dan tidak masuk', not pg.errs and pg.locator('#creatorBadge').count() == 0, pg.errs)
                check('mixed-content: pengguna diberi petunjuk (https/tunnel)', ('https' in t and ('tunnel' in t or 'diblokir' in t or 'blocks' in t)), t[:260])
                ctx.close()
            else: print('SKIP mixed-content: tidak ada IP LAN non-loopback di mesin ini')
            ctx, pg = page(); pg.goto(f'https://localhost:{https_port}/index.html#bot=http://localhost:{bport}&key={KEY}'); pg.wait_for_timeout(3000)
            reached = '66' in pg.inner_text('#botSec') or pg.locator('#creatorBadge').count() > 0
            print('INFO  HTTPS -> http://localhost pada', bname, ':', 'tersambung (localhost dianggap tepercaya)' if reached else 'diblokir browser'); 
            if bname == 'chromium': check('HTTPS -> http://localhost tersambung di Chromium', reached and not pg.errs, pg.errs)
            ctx.close()
            b.close()
    finally:
        for pr in procs: pr.terminate()
        shutil.rmtree(tmp, ignore_errors=True)
    print(f'\n{len(fails)} gagal' if fails else '\nSemua tes lulus'); sys.exit(1 if fails else 0)

if __name__ == '__main__': main()
