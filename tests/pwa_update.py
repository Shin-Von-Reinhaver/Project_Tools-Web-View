#!/usr/bin/env python3
"""Tes PWA: pasang service worker, rilis versi baru, pastikan konten + cache ikut diperbarui.
Server uji meniru GitHub Pages (Cache-Control: max-age=600) supaya cache HTTP browser ikut diuji.
Jalankan: python3 tests/pwa_update.py [--browser chromium|firefox|webkit]"""
import functools, http.server, os, re, shutil, sys, tempfile, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
fails = []
def check(name, ok, info=''):
    print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else '  -> ' + str(info)[:240]))
    if not ok: fails.append(name)

class Pages(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def end_headers(self):
        if not self.path.endswith('sw.js'): self.send_header('Cache-Control', 'public, max-age=600')
        else: self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

def main():
    bname = sys.argv[sys.argv.index('--browser') + 1] if '--browser' in sys.argv else 'chromium'
    tmp = tempfile.mkdtemp(prefix='pwa-'); site = os.path.join(tmp, 'site')
    shutil.copytree(ROOT, site, ignore=shutil.ignore_patterns('.git', 'node_modules', 'bot', 'tests', '__pycache__', 'build', '.github'))
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Pages, directory=site)); threading.Thread(target=srv.serve_forever, daemon=True).start()
    B = f'http://127.0.0.1:{srv.server_address[1]}/'
    sw = lambda: open(os.path.join(site, 'sw.js'), encoding='utf-8').read()
    ver = lambda: re.search(r"const VERSION='([^']+)'", sw()).group(1)
    v1 = ver()
    with sync_playwright() as p:
        b = getattr(p, bname).launch(); ctx = b.new_context(); pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(B + 'index.html'); pg.evaluate("navigator.serviceWorker.ready.then(()=>1)"); pg.reload(); pg.wait_for_timeout(1500)
        keys = pg.evaluate("caches.keys()"); check(f'[{bname}] service worker aktif dan cache {v1} terisi', keys == [v1], keys)
        n = pg.evaluate("caches.open(%r).then(c=>c.keys()).then(k=>k.length)" % v1); check(f'[{bname}] semua berkas inti ter-cache (>=15)', n >= 15, n)
        img1 = pg.evaluate("fetch('/media/images/images.jpeg').then(r=>r.arrayBuffer()).then(b=>b.byteLength)")
        pg.goto(B + 'tools/utility-tools.html'); pg.wait_for_selector('.tc'); t1 = pg.title()
        # --- rilis versi baru: ubah halaman, gambar, dan VERSION
        up = os.path.join(site, 'tools', 'utility-tools.html'); h = open(up, encoding='utf-8').read(); open(up, 'w', encoding='utf-8').write(h.replace('</head>', '<meta name="rilis" content="2"></head>', 1))
        with open(os.path.join(site, 'media', 'images', 'images.jpeg'), 'ab') as f: f.write(b'\0' * 17)
        v2 = v1 + '-r2'; new_sw = sw().replace(v1, v2); open(os.path.join(site, 'sw.js'), 'w', encoding='utf-8').write(new_sw)
        def wait_keys(sec):
            for _ in range(int(sec * 4)):
                if pg.evaluate("caches.keys()") == [v2]: return True
                pg.wait_for_timeout(250)
            return False
        pg.goto(B + 'index.html'); natural = wait_keys(10)  # navigasi memicu pemeriksaan pembaruan sw.js
        if not natural: pg.evaluate("navigator.serviceWorker.getRegistration().then(r=>r.update())"); wait_keys(10)
        print(f'INFO  [{bname}] pembaruan otomatis lewat navigasi: ' + ('ya' if natural else 'tidak dalam 10 dtk (butuh update() manual)'))
        pg.goto(B + 'index.html', wait_until='domcontentloaded'); pg.wait_for_timeout(1500)
        keys = pg.evaluate("caches.keys()"); check(f'[{bname}] cache lama dihapus, hanya {v2}', keys == [v2], keys)
        pg.goto(B + 'tools/utility-tools.html'); pg.wait_for_selector('.tc')
        rel = lambda: pg.evaluate("document.querySelector('meta[name=rilis]')&&document.querySelector('meta[name=rilis]').content")
        check(f'[{bname}] halaman HTML memuat versi baru walau Cache-Control max-age=600', rel() == '2', rel())
        img2 = pg.evaluate("fetch('/media/images/images.jpeg').then(r=>r.arrayBuffer()).then(b=>b.byteLength)")
        check(f'[{bname}] aset non-HTML (cache-first) ikut baru setelah versi naik', img2 == img1 + 17, (img1, img2))
        ctx.set_offline(True)
        try: r = pg.goto(B + 'tools/utility-tools.html', wait_until='domcontentloaded', timeout=8000); ok = r.status == 200 and rel() == '2'
        except Exception as e: ok = False
        check(f'[{bname}] offline menyajikan versi baru dari cache', ok)
        check(f'[{bname}] tanpa galat JS', not errs, errs[:2]); b.close()
    shutil.rmtree(tmp, ignore_errors=True)
    print(f'\n{len(fails)} gagal' if fails else '\nSemua tes lulus'); sys.exit(1 if fails else 0)

if __name__ == '__main__': main()
