#!/usr/bin/env python3
"""Merakit halaman: python3 build/build.py  (dijalankan dari folder proyek)
 - menyisipkan kit (tema/bahasa/PWA) ke semua alat dan beranda
 - membuat alat baru dari build/apps/*.js
"""
import re,json,os,sys
B=os.path.dirname(os.path.abspath(__file__)); ROOT=os.path.dirname(B)
sys.path.insert(0,B); import skins
rd=lambda p:open(os.path.join(B,p),encoding='utf-8').read()
KITCSS=rd('kit.css')+'\n'+skins.tools_css()
def kit_js(dic=None,opt='{}'):
    js=rd('kit.js').replace('/*@SKINS*/{}',skins.skin_js())
    js=js.replace('/*@DICT*/','reg('+json.dumps(dic,ensure_ascii=False,separators=(',',':'))+');' if dic else '')
    return 'window.KIT_OPT='+opt+';\n'+js
def sub_block(t,tag,ident,content,where):
    t=re.sub(r'<%s id="%s">.*?</%s>\n?'%(tag,ident,tag),'',t,flags=re.S)
    block='<%s id="%s">\n%s\n</%s>\n'%(tag,ident,content,tag)
    if where=='head':
        i=t.index('</head>'); return t[:i]+block+t[i:]
    i=t.rindex('</body>'); return t[:i]+block+t[i:]
HEADTAGS='''<link rel="manifest" href="%s">
<link rel="icon" href="%s" type="image/svg+xml">
<link rel="apple-touch-icon" href="%s">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
'''
def ensure_head(t,pref):
    if 'rel="manifest"' in t: return t
    i=t.index('</head>'); return t[:i]+HEADTAGS%(pref+'manifest.webmanifest',pref+'icons/icon.svg',pref+'icons/apple-touch-icon.png')+t[i:]
def inject_old(path,dic):
    t=open(path,encoding='utf-8').read()
    t=ensure_head(t,'../')
    t=sub_block(t,'style','kit-css',KITCSS,'head')
    t=sub_block(t,'script','kit-js',kit_js(dic,"{sw:'../sw.js'}"),'body')
    open(path,'w',encoding='utf-8').write(t)
APPS={
 'dev-tools':dict(title='Dev Tools',ac=('#0B7A8F','#38BDF8','#fff','#04202F'),theme='#0E1318',libs=['beautifier.min.js','terser.min.js']),
 'audio-tools':dict(title='Audio Tools',ac=('#C2410C','#FB923C','#fff','#2A1000'),theme='#0E1318',libs=['lame.min.js']),
 'utility-tools':dict(title='Utilitas Harian',ac=('#047857','#34D399','#fff','#03231A'),theme='#0E1318'),
 'qr-tools':dict(title='QR & Kode',ac=('#4338CA','#818CF8','#fff','#10113A'),theme='#0E1318',libs=['qrcode.min.js','jsqr.min.js','jsbarcode.min.js']),
 'text-tools':dict(title='Teks Tools',ac=('#BE185D','#F472B6','#fff','#330A1D'),theme='#0E1318'),
}
def make_app(name,meta):
    ac=meta['ac']
    root=f":root{{--ac:{ac[0]};--ac2:color-mix(in srgb,{ac[0]} 14%,#fff);--on:{ac[2]}}}\n@media(prefers-color-scheme:dark){{:root:not([data-theme=\"light\"]){{--ac:{ac[1]};--ac2:color-mix(in srgb,{ac[1]} 18%,#000);--on:{ac[3]}}}}}\n:root[data-theme=\"dark\"]{{--ac:{ac[1]};--ac2:color-mix(in srgb,{ac[1]} 18%,#000);--on:{ac[3]}}}\n"
    libs='\n'.join('<script>'+rd('vendor/'+l)+'</script>' for l in meta.get('libs',[]))
    html=f'''<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="{meta['theme']}">
<title>{meta['title']}</title>
{HEADTAGS%('../manifest.webmanifest','../icons/icon.svg','../icons/apple-touch-icon.png')}<style>
{root}{rd('hub.css')}
</style>
<style id="kit-css">
{KITCSS}
</style>
</head>
<body>
<script id="kit-js">
{kit_js(None,"{sw:'../sw.js'}")}
</script>
{libs}
<script>
{rd('hub.js')}
</script>
<script>
{rd('apps/'+name+'.js').replace('</script','<\\/script')}
</script>
</body>
</html>
'''
    open(os.path.join(ROOT,'tools',name+'.html'),'w',encoding='utf-8').write(html)
def inject_index():
    p=os.path.join(ROOT,'index.html'); t=open(p,encoding='utf-8').read()
    t=ensure_head(t,'')
    t=sub_block(t,'style','kit-css',rd('kit.css')+'\n'+skins.index_css(),'head')
    js=kit_js(None,"{index:true,noTranslate:true,sw:'sw.js'}")
    t=re.sub(r'<script id="kit-js">.*?</script>\n?','',t,flags=re.S)
    m=re.search(r'<body[^>]*>',t); blk='<script id="kit-js">\n'+js+'\n</script>\n'
    t=t[:m.end()]+'\n'+blk+t[m.end():]
    cp=os.path.join(B,'catalog.json')
    if os.path.exists(cp):
        cat=json.load(open(cp,encoding='utf-8'))
        t=re.sub(r'/\*CATALOG_START\*/.*?/\*CATALOG_END\*/','/*CATALOG_START*/const CATALOG='+json.dumps(cat,ensure_ascii=False,separators=(',',':')).replace('\\','\\\\')+';/*CATALOG_END*/',t,flags=re.S)
    open(p,'w',encoding='utf-8').write(t); print('index injected')
if __name__=='__main__':
    only=sys.argv[1:]
    for n,m in APPS.items():
        if only and n not in only: continue
        if os.path.exists(os.path.join(B,'apps',n+'.js')): make_app(n,m); print('built',n)
    if not only or 'index' in only: inject_index()
    if not only or 'old' in only:
        dp=os.path.join(B,'i18n-en.json')
        dic=json.load(open(dp,encoding='utf-8')) if os.path.exists(dp) else {}
        for n in ['pdf-tools','image-tools','video-tools']:
            inject_old(os.path.join(ROOT,'tools',n+'.html'),dic); print('injected',n,len(dic))
