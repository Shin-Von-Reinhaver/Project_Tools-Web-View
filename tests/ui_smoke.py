#!/usr/bin/env python3
"""Tes UI cepat (Playwright untuk Python). Menjalankan server lokal sendiri.
Pasang:  pip install playwright && playwright install chromium
Jalankan: python3 tests/ui_smoke.py"""
import functools, http.server, os, re, subprocess, sys, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HUB = ['utility-tools', 'text-tools', 'dev-tools', 'qr-tools', 'audio-tools']
OLD = ['pdf-tools', 'image-tools', 'video-tools']
fails = []

def check(name, ok, info=''):
    print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else '  -> ' + str(info)[:200]))
    if not ok: fails.append(name)

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

def main():
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=ROOT))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    B = f'http://127.0.0.1:{srv.server_address[1]}/'
    r = subprocess.run([sys.executable, os.path.join(ROOT, 'build', 'build.py'), '--check'], capture_output=True, text=True)
    check('versi cache sw.js sesuai isi situs (build.py --check)', r.returncode == 0, r.stdout)
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 420, 'height': 900}); pg = ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        # 1. setiap alat hub terbuka tanpa galat, punya tombol ? yang membuka dialog, dan tidak ada kontrol bersarang
        for app in HUB:
            pg.goto(f'{B}tools/{app}.html'); pg.wait_for_selector('.tc')
            n = pg.locator('.tc').count()
            check(f'{app}: tiap kartu punya tombol bantuan', pg.locator('.tcw > .hq').count() == n, (n, pg.locator('.tcw > .hq').count()))
            check(f'{app}: tombol tidak bersarang', pg.locator('.tc button, .tc [role=button], .tc a').count() == 0)
            pg.locator('.tcw > .hq').first.click(); check(f'{app}: dialog bantuan terbuka', pg.evaluate("document.querySelector('#hlp').open"))
            pg.keyboard.press('Escape'); check(f'{app}: Escape menutup dialog', not pg.evaluate("document.querySelector('#hlp').open"))
            for i in range(n):
                pg.locator('.tc').nth(i).click(); pg.wait_for_timeout(60)
                if pg.locator('#stage .out.err').count() and 'stack' in pg.locator('#stage .out.err').first.inner_text().lower(): check(f'{app} alat {i} tanpa tumpukan galat', False)
                pg.go_back(); pg.wait_for_timeout(40)
            check(f'{app}: tanpa galat JS', not errs, errs[:2]); errs.clear()
        for app in OLD:
            pg.goto(f'{B}tools/{app}.html'); pg.wait_for_selector('.tc'); check(f'{app}: terbuka tanpa galat JS', not errs, errs[:2]); errs.clear()
        # 2. kotak bantuan Video Tools tidak boleh mengecil jadi lingkaran (bentrok kelas .hq)
        ctx.close(); ctx = b.new_context(viewport={'width': 720, 'height': 900}); pg = ctx.new_page()
        pg.goto(B + 'tools/video-tools.html'); pg.wait_for_selector('.tc')
        vid = os.path.join(ROOT, 'tests', 'sample.webm')
        if os.path.exists(vid):
            pg.set_input_files('#fi', vid); pg.wait_for_timeout(1500); pg.evaluate("document.querySelectorAll('.tc')[0].click()"); pg.wait_for_timeout(300); pg.click('#hq')
            w = pg.evaluate("document.querySelector('#pb .note').getBoundingClientRect().width"); check('Video Tools: kotak "Cara pakai" selebar panel', w > 300, w)
        ctx.close()
        # 3. preferensi rusak / pesan asing tidak merusak beranda
        ctx = b.new_context(); pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(B + 'index.html'); pg.wait_for_timeout(500)
        pg.evaluate("window.postMessage({kit:'prefs',p:{theme:'x',lang:'xx',skin:'zz'}},'*')"); pg.wait_for_timeout(200)
        check('pesan prefs dari sumber tak tepercaya diabaikan', pg.evaluate("[localStorage.getItem('sv-theme'),localStorage.getItem('sv-lang')]") == [None, None])
        pg.evaluate("localStorage.setItem('sv-lang','xx');localStorage.setItem('sv-theme','x');localStorage.setItem('sv-skin','zz')"); pg.reload(); pg.wait_for_timeout(900)
        check('nilai tersimpan yang rusak tidak mematikan beranda', not errs and pg.locator('[data-a=open]').count() >= 8, errs[:2])
        ctx.close()
        # 4. tidak ada overflow horizontal di 320/375/768/1280
        for w in (320, 375, 768, 1280):
            ctx = b.new_context(viewport={'width': w, 'height': 800}); pg = ctx.new_page(); bad = []
            for page in ['index.html'] + [f'tools/{a}.html' for a in HUB + OLD]:
                pg.goto(B + page); pg.wait_for_timeout(350)
                if pg.evaluate("document.documentElement.scrollWidth>innerWidth"): bad.append(page)
            check(f'tanpa overflow horizontal di {w}px', not bad, bad); ctx.close()
        # 5. offline setelah service worker aktif
        ctx = b.new_context(); pg = ctx.new_page(); pg.goto(B + 'index.html'); pg.wait_for_timeout(800)
        pg.evaluate("navigator.serviceWorker.ready.then(()=>1)"); pg.reload(); pg.wait_for_timeout(1500); ctx.set_offline(True)
        ok = True
        for page in ['index.html', 'tools/utility-tools.html']:
            try: ok &= pg.goto(B + page, wait_until='domcontentloaded', timeout=8000).status == 200
            except Exception: ok = False
        check('situs terbuka offline setelah service worker aktif', ok); ctx.close()
        b.close()
    print(f'\n{len(fails)} gagal' if fails else '\nSemua tes lulus'); sys.exit(1 if fails else 0)

if __name__ == '__main__': main()
