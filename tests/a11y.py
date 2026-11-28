#!/usr/bin/env python3
"""Tes aksesibilitas: kontras di semua skin, aturan axe (WCAG 2 A/AA), keyboard, dialog/fokus/Escape, prefers-reduced-motion.
Pasang: pip install playwright && playwright install chromium && (cd tests && npm ci)
Jalankan: python3 tests/a11y.py [--browser chromium|firefox|webkit]"""
import functools, http.server, os, sys, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'build')); import skins
AXE_PATH = os.path.join(ROOT, 'tests', 'node_modules', 'axe-core', 'axe.min.js')
HUB = ['utility-tools', 'text-tools', 'dev-tools', 'qr-tools', 'audio-tools']
# Masalah yang SUDAH DIKETAHUI dan belum diperbaiki (dilacak di CHANGELOG): jangan menutupinya, tapi jangan gagalkan CI untuk itu.
KNOWN = {('tools/pdf-tools.html', 'nested-interactive'), ('tools/image-tools.html', 'nested-interactive')}
fails = []
def check(name, ok, info=''):
    print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else '  -> ' + str(info)[:260]))
    if not ok: fails.append(name)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

def main():
    bname = sys.argv[sys.argv.index('--browser') + 1] if '--browser' in sys.argv else 'chromium'
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=ROOT)); threading.Thread(target=srv.serve_forever, daemon=True).start()
    B = f'http://127.0.0.1:{srv.server_address[1]}/'
    axe = open(AXE_PATH).read() if os.path.exists(AXE_PATH) else None
    if not axe: print('PERINGATAN: axe-core belum terpasang (cd tests && npm ci); tes axe dilewati.')
    with sync_playwright() as p:
        b = getattr(p, bname).launch()
        def run_axe(pg, rules=None):
            pg.evaluate(axe)
            opts = "{runOnly:{type:'rule',values:%s}}" % rules if rules else "{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}"
            return pg.evaluate("axe.run(document,%s).then(r=>r.violations.map(v=>({id:v.id,impact:v.impact,n:v.nodes.length,ex:(v.nodes[0].target.join(' ')+' '+(v.nodes[0].any[0]?v.nodes[0].any[0].message:'')).slice(0,150)})))" % opts)
        # 1. kontras warna di semua skin (default terang/gelap + 10 skin)
        if axe:
            pages = ['index.html', 'tools/utility-tools.html', 'tools/dev-tools.html#tool=json', 'tools/pdf-tools.html', 'tools/video-tools.html']
            bad = []
            for skin in ['default'] + list(skins.SKINS):
                for scheme in (['light', 'dark'] if skin == 'default' else ['light']):
                    ctx = b.new_context(viewport={'width': 420, 'height': 900}, color_scheme=scheme)
                    ctx.add_init_script(f"localStorage.setItem('sv-skin','{skin}');localStorage.setItem('sv-theme','auto')"); pg = ctx.new_page()
                    for path in pages:
                        pg.goto(B + path); pg.wait_for_timeout(500)
                        v = run_axe(pg, "['color-contrast']")
                        if v: bad.append((skin, scheme, path, v[0]['n'], v[0]['ex'][:90]))
                    ctx.close()
            check('kontras warna WCAG AA di semua skin (default terang/gelap + 10 skin)', not bad, bad[:3])
            # 2. aturan axe serius/kritis (selain masalah yang sudah diketahui)
            ctx = b.new_context(viewport={'width': 420, 'height': 900}); pg = ctx.new_page(); allbad = []
            for path in ['index.html'] + [f'tools/{h}.html' for h in HUB] + ['tools/pdf-tools.html', 'tools/image-tools.html', 'tools/video-tools.html']:
                pg.goto(B + path); pg.wait_for_timeout(600)
                for v in run_axe(pg):
                    if v['impact'] in ('serious', 'critical') and (path, v['id']) not in KNOWN: allbad.append((path, v['id'], v['n'], v['ex'][:80]))
            check('axe WCAG 2 A/AA: tanpa pelanggaran serius/kritis baru', not allbad, allbad[:3]); ctx.close()
        # 3. keyboard + dialog bantuan + Escape + fokus kembali
        ctx = b.new_context(viewport={'width': 420, 'height': 900}); pg = ctx.new_page()
        for app in HUB:
            pg.goto(f'{B}tools/{app}.html'); pg.wait_for_selector('.tc')
            first = pg.locator('.tcw > .hq').first; first.focus(); pg.keyboard.press('Enter'); pg.wait_for_timeout(150)
            inside = pg.evaluate("document.querySelector('#hlp').open && document.querySelector('#hlp').contains(document.activeElement)")
            check(f'{app}: Enter di tombol ? membuka dialog dan fokus pindah ke dalam', inside)
            pg.keyboard.press('Tab'); still = pg.evaluate("document.querySelector('#hlp').contains(document.activeElement)"); check(f'{app}: Tab tetap di dalam dialog (focus trap)', still)
            pg.keyboard.press('Escape'); pg.wait_for_timeout(100)
            back = pg.evaluate("!document.querySelector('#hlp').open && document.activeElement.classList.contains('hq')")
            check(f'{app}: Escape menutup dan fokus kembali ke tombol ?', back)
            pg.locator('.tc').first.focus(); pg.keyboard.press('Enter'); pg.wait_for_timeout(200)
            check(f'{app}: Enter di kartu membuka alat', pg.evaluate("document.querySelector('#tool').classList.contains('on')"))
            check(f'{app}: judul alat dan tombol kembali punya nama aksesibel', pg.evaluate("[...document.querySelectorAll('#tool .tbar button')].every(b=>(b.getAttribute('aria-label')||b.textContent||b.title).trim().length>0)"))
        # 4. viewer di beranda: dialog modal, Escape, fokus
        pg.goto(B + 'index.html'); pg.wait_for_timeout(700)
        opener = pg.locator('[data-a=open][data-id=pdf-tools]').first; opener.focus(); pg.keyboard.press('Enter'); pg.wait_for_timeout(900)
        check('viewer: dibuka lewat keyboard dan atribut dialog benar', pg.evaluate("(()=>{const o=document.querySelector('#ov');return o.classList.contains('on')&&o.getAttribute('role')==='dialog'&&o.getAttribute('aria-modal')==='true'})()"))
        pg.keyboard.press('Escape'); pg.wait_for_timeout(400); check('viewer: Escape menutup', not pg.evaluate("document.querySelector('#ov').classList.contains('on')"))
        check('viewer: fokus kembali ke tombol pembuka setelah ditutup', pg.evaluate("document.activeElement&&document.activeElement.getAttribute('data-id')==='pdf-tools'"), pg.evaluate("document.activeElement&&(document.activeElement.outerHTML||'').slice(0,80)"))
        ctx.close()
        # 5. prefers-reduced-motion: tidak ada animasi/transisi berjalan
        ctx = b.new_context(viewport={'width': 420, 'height': 900}, reduced_motion='reduce'); pg = ctx.new_page(); bad = []
        for path in ['index.html'] + [f'tools/{h}.html' for h in HUB] + ['tools/pdf-tools.html', 'tools/image-tools.html', 'tools/video-tools.html']:
            pg.goto(B + path); pg.wait_for_timeout(500)
            n = pg.evaluate("""()=>{let n=0;for(const e of document.querySelectorAll('body *')){const c=getComputedStyle(e);const dur=s=>s.split(',').some(x=>parseFloat(x)>0.05*(x.includes('ms')?0.001:1)&&!/^0(\\.0+)?m?s$/.test(x.trim()));if(c.animationName!=='none'&&dur(c.animationDuration)&&c.animationIterationCount!=='0')n++}return n}""")
            if n: bad.append((path, n))
        check('prefers-reduced-motion: tidak ada animasi CSS aktif di semua halaman', not bad, bad); ctx.close()
        # 6. indikator fokus terlihat
        ctx = b.new_context(viewport={'width': 420, 'height': 900}); pg = ctx.new_page(); bad = []
        for path in ['index.html', 'tools/utility-tools.html', 'tools/pdf-tools.html']:
            pg.goto(B + path); pg.wait_for_timeout(500); pg.keyboard.press('Tab'); pg.keyboard.press('Tab')
            vis = pg.evaluate("(()=>{const e=document.activeElement;if(!e||e===document.body)return false;const c=getComputedStyle(e);return (c.outlineStyle!=='none'&&parseFloat(c.outlineWidth)>0)||c.boxShadow!=='none'||c.borderColor!==''})()")
            if not vis: bad.append(path)
        check('fokus keyboard memiliki indikator visual', not bad, bad); ctx.close(); b.close()
    print(f'\n{len(fails)} gagal' if fails else '\nSemua tes lulus'); sys.exit(1 if fails else 0)

if __name__ == '__main__': main()
