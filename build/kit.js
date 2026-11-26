/* ===== KIT: tema, bahasa, penerjemah DOM, sinkron antar-frame, deep-link, PWA ===== */
(function(){'use strict';
if(window.KIT)return;
var SK=/*@SKINS*/{};
var OPT=window.KIT_OPT||{};
var ls={get:function(k,d){try{return localStorage.getItem(k)||d}catch(e){return d}},set:function(k,v){try{localStorage.setItem(k,v)}catch(e){}}};
var inFrame=false;try{inFrame=window.parent!==window}catch(e){inFrame=true}
var nav=((navigator.language||'id')+'').slice(0,2);
var P={theme:ls.get('sv-theme','auto'),skin:ls.get('sv-skin','default'),lang:ls.get('sv-lang',nav==='id'?'id':'en')};
if(!SK[P.skin])P.skin='default';
var LANGS=[['id','Bahasa Indonesia'],['en','English']];
var DICT={en:{}},RDICT={en:{}},PK={},dirty={};
function regLang(code,name,map){if(!DICT[code]){DICT[code]={};RDICT[code]={};if(name&&!LANGS.some(function(l){return l[0]===code}))LANGS.push([code,name])}reg(map,code)}
function reg(map,code){code=code||'en';var D=DICT[code]||(DICT[code]={}),R=RDICT[code]||(RDICT[code]={});for(var k in map){D[k]=map[k];if(!(map[k] in R))R[map[k]]=k}dirty[code]=1}
/* _(id,en): teks sesuai bahasa aktif dan sekaligus didaftarkan agar bisa diterjemahkan saat bahasa diganti */
function _(id,en){if(en===undefined)return id;var D=DICT.en;if(!(id in D)){D[id]=en;if(!(en in RDICT.en))RDICT.en[en]=id;dirty.en=1}return P.lang==='id'?id:(P.lang==='en'?en:(DICT[P.lang]&&DICT[P.lang][id])||en)}
function maps(){var L=P.lang;if(L==='id')return{M:RDICT.en,tid:1};return{M:(DICT[L]||{}),en:L==='en',M2:DICT.en}}
function prefixes(code,rev){var key=code+(rev?'r':'f');if(PK[key]&&!dirty[code])return PK[key];var M=rev?RDICT[code]:DICT[code],a=[];for(var k in M){if(k.length>=3&&/[\s:]$/.test(k))a.push(k)}a.sort(function(x,y){return y.length-x.length});PK[key]=a;dirty[code]=0;return a}
function look(t){var L=P.lang;if(L==='id'){var r=RDICT.en;return Object.prototype.hasOwnProperty.call(r,t)?r[t]:null}
 var D=DICT[L]||{};if(Object.prototype.hasOwnProperty.call(D,t))return D[t];if(L!=='en'){var e=DICT.en;if(Object.prototype.hasOwnProperty.call(e,t))return e[t]}return null}
function conv(t,d){d=d||0;if(d>4||!t)return null;var r=look(t);if(r!=null)return r;var m;
 if((m=t.match(/^([\d.,]+\s*(?:[x×%\/:]\s*[\d.,]+\s*)?)(\D.*)$/))){r=conv(m[2].trim(),d+1);if(r!=null)return m[1]+r}
 if((m=t.match(/^(.*\D)(\s*[\d.,]+\s*(?:%|px|mm|MB|KB|dpi|DPI|s|x|detik|menit)?)$/))){r=conv(m[1].trim(),d+1);if(r!=null)return r+' '+m[2].trim()}
 var seps=[' · ',' — ',' • ',', ',' / ',': ',' - '];
 for(var i=0;i<seps.length;i++){var s=seps[i];if(t.indexOf(s)>0){var parts=t.split(s),hit=0,out=parts.map(function(p){var q=conv(p.trim(),d+1);if(q!=null){hit=1;return q}return p});if(hit)return out.join(s)}}
 var code=P.lang==='id'?'en':P.lang,rev=P.lang==='id',pk=prefixes(code,rev),M=rev?RDICT[code]:DICT[code];
 for(var j=0;j<pk.length;j++){var k=pk[j];if(t.indexOf(k)===0&&t.length>k.length){var rest=conv(t.slice(k.length),d+1);return M[k]+(rest!=null?rest:t.slice(k.length))}}
 return null}
function trStr(s){var t=s.trim();if(!t||t.length>400)return s;var i=s.indexOf(t),r=conv(t);return r==null||r===t?s:s.slice(0,i)+r+s.slice(i+t.length)}
var ATTR=['title','placeholder','aria-label','alt'];
var SKIP={SCRIPT:1,STYLE:1,TEXTAREA:1,NOSCRIPT:1,CANVAS:1};
function ok(n){return!(n.closest&&n.closest('[data-notr],[contenteditable="true"],pre.kit-raw'))}
function walk(n){if(!n)return;if(n.nodeType===3){var p=n.parentNode;if(p&&(SKIP[p.nodeName]||!ok(p)))return;var v=n.nodeValue,r=trStr(v);if(r!==v)n.nodeValue=r;return}
 if(n.nodeType!==1||SKIP[n.nodeName]||!ok(n))return;
 for(var i=0;i<ATTR.length;i++){var a=n.getAttribute(ATTR[i]);if(a){var r2=trStr(a);if(r2!==a)n.setAttribute(ATTR[i],r2)}}
 if(n.nodeName==='INPUT'&&/^(button|submit)$/.test(n.type)){var vv=trStr(n.value);if(vv!==n.value)n.value=vv}
 for(var c=n.firstChild;c;c=c.nextSibling)walk(c)}
var obs=null,queued=[],raf=0;
function flush(){raf=0;var q=queued;queued=[];q.forEach(function(r){if(r.type==='childList'){r.addedNodes.forEach(walk)}else if(r.type==='characterData'){walk(r.target)}else if(r.type==='attributes'){var a=r.target.getAttribute(r.attributeName);if(a){var x=trStr(a);if(x!==a)r.target.setAttribute(r.attributeName,x)}}});if(obs)obs.takeRecords()}
function startObs(){if(obs||OPT.noTranslate||!window.MutationObserver)return;obs=new MutationObserver(function(recs){if(P.lang==='id'&&!OPT.reverse&&!hasEn())return;queued=queued.concat(recs);if(!raf)raf=requestAnimationFrame(flush)});obs.observe(document.documentElement,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:ATTR})}
function hasEn(){return OPT.reverse}
function translateAll(){if(OPT.noTranslate)return;walk(document.body);document.title=trStr(document.title);if(obs)obs.takeRecords()}
/* ---- tema ---- */
function metaColor(){try{var m=document.querySelector('meta[name=theme-color]');if(!m)return;var c=getComputedStyle(document.body).backgroundColor;if(c&&c!=='rgba(0, 0, 0, 0)')m.setAttribute('content',c)}catch(e){}}
var hooks=[];
function apply(){var r=document.documentElement;
 if(P.skin==='default')r.removeAttribute('data-skin');else r.setAttribute('data-skin',P.skin);
 if(OPT.index)r.setAttribute('data-theme',P.theme);else if(P.theme==='auto')r.removeAttribute('data-theme');else r.setAttribute('data-theme',P.theme);
 r.setAttribute('lang',P.lang);if(document.body){translateAll()}
 setTimeout(metaColor,30);hooks.forEach(function(f){try{f(P)}catch(e){}})}
function persist(){ls.set('sv-theme',P.theme);ls.set('sv-skin',P.skin);ls.set('sv-lang',P.lang)}
function broadcast(){var msg={kit:'prefs',p:P};try{if(inFrame)window.parent.postMessage(msg,'*')}catch(e){}
 try{[].forEach.call(document.querySelectorAll('iframe'),function(f){try{f.contentWindow.postMessage(msg,'*')}catch(e){}})}catch(e){}}
function set(o,from){var ch=0;['theme','skin','lang'].forEach(function(k){if(o[k]!==undefined&&o[k]!==P[k]){P[k]=o[k];ch=1}});if(!ch)return;persist();apply();if(from!=='msg')broadcast();if(sheet&&sheet.classList.contains('on'))buildSheet()}
addEventListener('message',function(e){var d=e.data;if(!d||typeof d!=='object')return;
 if(d.kit==='prefs'&&d.p)set(d.p,'msg');
 else if(d.kit==='hello'){try{e.source.postMessage({kit:'prefs',p:P},'*')}catch(x){}}
 else if(d.kit==='open')openCard(d.key)});
addEventListener('storage',function(e){if(e.key&&e.key.indexOf('sv-')===0){set({theme:ls.get('sv-theme',P.theme),skin:ls.get('sv-skin',P.skin),lang:ls.get('sv-lang',P.lang)},'msg')}});
/* ---- deep-link: buka kartu alat berdasarkan nama ---- */
function nrm(s){return String(s||'').toLowerCase().replace(/\s+/g,' ').trim()}
function openCard(key,tries){tries=tries||0;var names={};names[nrm(key)]=1;var en=DICT.en[key];if(en)names[nrm(en)]=1;var rv=RDICT.en[key];if(rv)names[nrm(rv)]=1;
 var cards=[].slice.call(document.querySelectorAll('.tc'));
 for(var i=0;i<cards.length;i++){var b=cards[i].querySelector('b')||cards[i];if(names[nrm(b.textContent)]){cards[i].scrollIntoView({block:'center'});cards[i].click();return true}}
 if(tries<30)setTimeout(function(){openCard(key,tries+1)},150);return false}
/* ---- panel tampilan & bahasa ---- */
var sheet=null;
var PAL='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 3v18a9 9 0 0 0 0-18z" fill="currentColor"/></svg>';
var deferred=null;
addEventListener('beforeinstallprompt',function(e){e.preventDefault();deferred=e;if(sheet&&sheet.classList.contains('on'))buildSheet()});
addEventListener('appinstalled',function(){deferred=null});
function standalone(){return matchMedia('(display-mode: standalone)').matches||navigator.standalone}
function buildSheet(){if(!sheet){sheet=document.createElement('div');sheet.className='kit-ov';sheet.setAttribute('data-notr','');document.body.appendChild(sheet);sheet.addEventListener('click',function(e){if(e.target===sheet)closeSheet()})}
 var h='<div class="kit-sheet" role="dialog" aria-modal="true"><div class="kit-h"><b>'+_('Tampilan & Bahasa','Appearance & Language')+'</b><button class="kit-x" data-k="x" aria-label="'+_('Tutup','Close')+'">×</button></div>';
 h+='<div class="kit-sec">'+_('Mode','Mode')+'</div><div class="kit-seg">'+[['auto',_('Otomatis','Auto')],['light',_('Terang','Light')],['dark',_('Gelap','Dark')]].map(function(m){return'<button data-k="theme" data-v="'+m[0]+'" class="'+(P.theme===m[0]?'on':'')+'">'+m[1]+'</button>'}).join('')+'</div>';
 h+='<div class="kit-sec">'+_('Tema','Theme')+'</div><div class="kit-sw">'+Object.keys(SK).map(function(k){var s=SK[k];return'<button data-k="skin" data-v="'+k+'" class="'+(P.skin===k?'on':'')+'"><span class="kit-dots">'+s.sw.map(function(c){return'<i style="background:'+c+'"></i>'}).join('')+'</span>'+(P.lang==='id'?s.id:s.en)+'</button>'}).join('')+'</div>';
 h+='<div class="kit-sec">'+_('Bahasa','Language')+'</div><div class="kit-seg">'+LANGS.map(function(l){return'<button data-k="lang" data-v="'+l[0]+'" class="'+(P.lang===l[0]?'on':'')+'">'+l[1]+'</button>'}).join('')+'</div>';
 h+='<div class="kit-sec">'+_('Lainnya','More')+'</div><button class="kit-b" data-k="search">'+_('Cari semua alat','Search all tools')+'</button>';
 if(!standalone()){if(deferred)h+='<button class="kit-b" data-k="install">'+_('Pasang sebagai aplikasi','Install as an app')+'</button>';else if(/iphone|ipad|ipod/i.test(navigator.userAgent))h+='<p class="kit-note">'+_('Untuk memasang: ketuk Bagikan lalu "Tambahkan ke Layar Utama".','To install: tap Share, then "Add to Home Screen".')+'</p>'}
 h+='</div>';sheet.innerHTML=h;
 sheet.onclick=function(e){if(e.target===sheet)return closeSheet();var b=e.target.closest('[data-k]');if(!b)return;var k=b.dataset.k;
  if(k==='x')closeSheet();else if(k==='theme')set({theme:b.dataset.v});else if(k==='skin')set({skin:b.dataset.v});else if(k==='lang')set({lang:b.dataset.v});
  else if(k==='search'){closeSheet();if(KIT.onsearch)KIT.onsearch();else try{window.parent.postMessage({kit:'search'},'*')}catch(x){}}
  else if(k==='install'&&deferred){deferred.prompt();deferred=null;closeSheet()}};
 translateAll()}
function openSheet(){buildSheet();sheet.classList.add('on')}
function closeSheet(){if(sheet)sheet.classList.remove('on')}
addEventListener('keydown',function(e){if(e.key==='Escape')closeSheet()});
function mountButton(host,before){var b=document.createElement('button');b.type='button';b.className='kit-btn';b.id='kitBtn';b.innerHTML=PAL;b.setAttribute('title',_('Tampilan & Bahasa','Appearance & Language'));b.setAttribute('aria-label',_('Tampilan & Bahasa','Appearance & Language'));b.onclick=openSheet;if(before)host.insertBefore(b,before);else host.appendChild(b);return b}
function autoMount(){if(document.getElementById('kitBtn')||OPT.index)return;var th=document.getElementById('themeBtn')||document.getElementById('th');
 if(th){th.classList.add('kit-hide');mountButton(th.parentNode,th.nextSibling)}else{var hd=document.querySelector('header');if(hd)mountButton(hd)}}
/* ---- PWA ---- */
function registerSW(url){if(inFrame||!('serviceWorker' in navigator)||!/^https?:$/.test(location.protocol))return;try{navigator.serviceWorker.register(url).catch(function(){})}catch(e){}}
var KIT=window.KIT={P:P,_:_,reg:reg,regLang:regLang,LANGS:LANGS,set:set,apply:apply,openSheet:openSheet,closeSheet:closeSheet,mountButton:mountButton,openCard:openCard,onchange:function(f){hooks.push(f)},translate:translateAll,registerSW:registerSW,onsearch:null,tr:function(s){return trStr(s)},inFrame:inFrame};
function boot(){/*@DICT*/apply();startObs();autoMount();if(inFrame){try{window.parent.postMessage({kit:'hello'},'*')}catch(e){}}
 var m=/[#&]t=([^&]+)/.exec(location.hash);if(m)openCard(decodeURIComponent(m[1]));if(OPT.sw)registerSW(OPT.sw)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
