#!/usr/bin/env python3
"""Membuat build/catalog.json (katalog pencarian global) dengan membaca kartu alat dari tiap halaman.
Butuh: pip install playwright && playwright install chromium"""
import json,os
from playwright.sync_api import sync_playwright
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APPS=['pdf-tools','image-tools','video-tools','audio-tools','utility-tools','dev-tools','qr-tools','text-tools']
JS="()=>[...document.querySelectorAll('.tc')].map(c=>({n:(c.querySelector('b')||c).textContent.trim().replace(/\\s+/g,' '),d:(c.querySelector('small')||{textContent:''}).textContent.trim().replace(/\\s+/g,' ')}))"
def grab(p,app,lang):
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':390,'height':900},locale='id-ID')
    ctx.add_init_script(f"try{{localStorage.setItem('sv-lang','{lang}')}}catch(e){{}}")
    pg=ctx.new_page(); pg.goto(f'file://{ROOT}/tools/{app}.html'); pg.wait_for_timeout(1500)
    r=pg.evaluate(JS); b.close(); return r
EXTRA=json.load(open(os.path.join(ROOT,'build','catalog-desc.json'),encoding='utf-8'))  # deskripsi untuk kartu yang tidak punya keterangan di halamannya
out=[]
with sync_playwright() as p:
    for a in APPS:
        i=grab(p,a,'id'); e=grab(p,a,'en')
        assert len(i)==len(e),(a,len(i),len(e))
        for x,y in zip(i,e):
            d=[x['d'],y['d']] if (x['d'] or y['d']) else EXTRA.get(x['n'],[])
            out.append({'a':a,'n':[x['n'],y['n']],'d':d})
        print(a,len(i))
json.dump(out,open(os.path.join(ROOT,'build','catalog.json'),'w',encoding='utf-8'),ensure_ascii=False,indent=0)
print('total',len(out))
