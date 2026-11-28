# Palet tema: satu sumber untuk CSS tools dan beranda.
# name: (id_label, en_label, dark, bg,bg2,pn,ink,mut,ln,ac,ac2,on, c1..c5)
SKINS={
 'amoled':('AMOLED','AMOLED',1,'#000000','#000000','#0e0e10','#f4f4f5','#9a9aa3','#26262b','#38bdf8','#082433','#001018',['#38bdf8','#a78bfa','#34d399','#fbbf24','#f472b6']),
 'ocean':('Samudra','Ocean',1,'#07131f','#050e17','#0e2234','#e6f4ff','#8fb0c9','#1c3a54','#38bdf8','#0c3550','#04202f',['#38bdf8','#818cf8','#2dd4bf','#fbbf24','#f472b6']),
 'forest':('Hutan','Forest',1,'#0a1510','#07100c','#12251b','#e8f5ec','#8fb09b','#21402f','#4ade80','#123a26','#05220f',['#4ade80','#2dd4bf','#a3e635','#fbbf24','#38bdf8']),
 'sunset':('Senja','Sunset',1,'#1a0f10','#140a0b','#2a1718','#fff1e8','#c9a597','#4a2a26','#fb923c','#4a2410','#2a1000',['#fb923c','#f472b6','#fbbf24','#f87171','#a78bfa']),
 'grape':('Anggur','Grape',1,'#120b1f','#0d0716','#1e1433','#f3ecff','#b3a2d6','#35265a','#c084fc','#32184f','#1d0b33',['#c084fc','#f472b6','#60a5fa','#fbbf24','#34d399']),
 'mono':('Mono','Mono',1,'#121212','#0b0b0b','#1c1c1c','#ededed','#9b9b9b','#333333','#e5e5e5','#2a2a2a','#111111',['#e5e5e5','#bdbdbd','#9e9e9e','#d6d6d6','#8a8a8a']),
 'rose':('Mawar','Rose',0,'#fff5f7','#ffe8ee','#ffffff','#3b1220','#8b5a6a','#f3cbd6','#cd1a42','#ffe1e8','#ffffff',['#cd1a42','#c026d3','#ea580c','#0891b2','#7c3aed']),
 'sand':('Pasir','Sand',0,'#faf6ee','#f0e8d8','#fffdf8','#2b2417','#71644c','#e5d9bf','#b45309','#fdebc8','#ffffff',['#b45309','#be123c','#4d7c0f','#0f766e','#7c3aed']),
 'mint':('Mint','Mint',0,'#f0faf6','#dff3ea','#ffffff','#0f2a21','#4b6f61','#c4e3d5','#047854','#d3f4e6','#ffffff',['#047854','#0891b2','#65a30d','#d97706','#7c3aed']),
 'sky':('Langit','Sky',0,'#f0f7ff','#e0eeff','#ffffff','#0f1f35','#4e6783','#cfe0f5','#2563eb','#dbe8ff','#ffffff',['#2563eb','#7c3aed','#0891b2','#ea580c','#db2777']),
}
def rgba(h,a):
    h=h.lstrip('#');r,g,b=int(h[0:2],16),int(h[2:4],16),int(h[4:6],16);return f'rgba({r},{g},{b},{a})'
def tools_css():
    o=[]
    for k,(li,le,dark,bg,bg2,pn,ink,mut,ln,ac,ac2,on,cs) in SKINS.items():
        tn,th,tb,to=('19%','32%','52%','15%') if dark else ('10%','20%','38%','7%')
        v=f'--bg:{bg}!important;--bg2:{bg2}!important;--pn:{pn}!important;--ink:{ink}!important;--mut:{mut}!important;--ln:{ln}!important;--ac:{ac}!important;--ac2:{ac2}!important;--on:{on}!important;--bad:{"#ff8a80" if dark else "#c62828"}!important;'
        v+=''.join(f'--c{i+1}:{c}!important;' for i,c in enumerate(cs))+f'--tn:{tn}!important;--th:{th}!important;--tb:{tb}!important;--to:{to}!important;color-scheme:{"dark" if dark else "light"}'
        o.append(f'html:root[data-skin="{k}"]{{{v}}}')
    return '\n'.join(o)
def index_css():
    o=[]
    for k,(li,le,dark,bg,bg2,pn,ink,mut,ln,ac,ac2,on,cs) in SKINS.items():
        v=f'--bg:{bg}!important;--bg2:{bg2}!important;--card:{rgba(pn,.72 if dark else .82)}!important;--card2:{rgba(pn,.9)}!important;--line:{rgba(mut,.22)}!important;--ink:{ink}!important;--mut:{mut}!important;--ac:{ac}!important;--on:{on}!important;--ok:{cs[2]}!important;--bad:{"#f87171" if dark else "#dc2626"}!important;--code:{bg2}!important;--codeink:{ink}!important;--shadow:0 30px 60px -24px rgba(0,0,0,{.7 if dark else .25})!important;color-scheme:{"dark" if dark else "light"}'
        o.append(f'html:root[data-skin="{k}"]{{{v}}}')
    return '\n'.join(o)
def skin_js():
    import json
    d={'default':{'id':'Bawaan','en':'Default','sw':['#0A6C86','#6B5BD2','#B7791F']}}
    for k,(li,le,dark,bg,bg2,pn,ink,mut,ln,ac,ac2,on,cs) in SKINS.items():
        d[k]={'id':li,'en':le,'sw':[bg,pn,ac]}
    return json.dumps(d,ensure_ascii=False)
