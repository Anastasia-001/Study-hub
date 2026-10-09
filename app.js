/* JSON and images commit in one transaction; incomplete downloads never replace a course. */
window.StudyStorage = (() => {
  let db;
  const request = r => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  async function open() {
    const r = indexedDB.open('studyhub', 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore('courses', {keyPath: 'id'});
      r.result.createObjectStore('settings');
      r.result.createObjectStore('progress');
    };
    db = await request(r); db.onversionchange = () => db.close();
  }
  async function get(store, key) { return request(db.transaction(store).objectStore(store).get(key)); }
  async function all(store) { return request(db.transaction(store).objectStore(store).getAll()); }
  async function put(store, value, key) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      tx.oncomplete = resolve;
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('Enregistrement interrompu'));
      if (key === undefined) tx.objectStore(store).put(value); else tx.objectStore(store).put(value, key);
    });
  }
  return {open, get, all, put};
})();

if (!document.querySelector('#help')) { document.body.insertAdjacentHTML('beforeend', "<dialog id=\"help\"><div class=\"dialog-header\"><h2>Study Hub sur iPhone</h2><button id=\"closeHelp\" aria-label=\"Fermer\">×</button></div><ol><li>Ouvre ce site dans <b>Safari</b>.</li><li>Touche <b>Partager → Sur l’écran d’accueil</b>. Active « Ouvrir comme app web » si cette option apparaît, puis Ajouter.</li><li>Ouvre <b>Study Hub depuis sa nouvelle icône</b>, avec Internet, et attends « Prêt pour le hors ligne » ainsi que « Disponible sans Internet » sur chaque cours.</li><li>Active le mode avion, ferme l’app, puis rouvre-la depuis son icône. Vérifie les questions et les réponses.</li></ol><p>Les cours se synchronisent quand tu ouvres l’app, reviens dedans ou retrouves une connexion pendant son utilisation. iOS ne garantit pas la synchronisation lorsque l’app est fermée.</p><p>La progression reste sur cet appareil. iOS peut libérer du stockage : conserve une sauvegarde si tu changes d’appareil ou effaces les données du navigateur.</p><label class=\"import-label\">Restaurer une sauvegarde de progression<input id=\"importProgress\" type=\"file\" accept=\"application/json,.json\"></label></dialog>"); const css=document.createElement('link'); css.rel='stylesheet'; css.href='./styles.css?sh-shell=5'; document.head.append(css); document.querySelector('meta[name=theme-color]')?.setAttribute('content','#f6f6f4'); }
(() => {
'use strict';
const VERSION = '2.0.0';
const app = document.querySelector('#app'), db = window.StudyStorage;
const base = new URL('./', location.href);
const records = new Map(), imageURLs = new Map();
let catalogue = {schema: 1, catalog_version: 0, courses: []};
let review = {}, positions = {}, lastSync = '', syncing = false, shellReady = false, storageOK = false;
let syncMessage = '', updateReady = false, registration, search = '', filter = 'all';
let session = null, toastTimer;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon = (name, size = 20) => {
  const paths = {book:'M4 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-2H4z M20 4h-4a3 3 0 0 0-3 3v14a4 4 0 0 1 4-2h3z', sync:'M20 7v5h-5 M4 17v-5h5 M6 7a7 7 0 0 1 12-1l2 3 M4 15l2 3a7 7 0 0 0 12-1', arrow:'M5 12h14 M14 7l5 5-5 5', check:'m5 12 4 4L19 6', back:'m14 6-6 6 6 6', download:'M12 3v12 m-5-5 5 5 5-5 M4 16v5h16v-5', search:'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14 M15 15l6 6', grid:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z'};
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.book}"/></svg>`;
};
function toast(message) { const el = document.querySelector('#toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 4500); }
function localJSON(key, fallback) { try {return JSON.parse(localStorage.getItem(key)) ?? fallback;} catch {return fallback;} }
function localURL(path) {
  const u = new URL(path, base);
  if (u.origin !== base.origin || !u.pathname.startsWith(base.pathname)) throw new Error('Les ressources doivent être hébergées avec Study Hub');
  return u.href;
}
async function fetchFresh(path) {
  const u = new URL(localURL(path)); u.searchParams.set('sh-sync', Date.now());
  const abort = new AbortController(), timeout = setTimeout(() => abort.abort(), 15000);
  try {const r = await fetch(u, {cache: 'no-store', signal: abort.signal}); if (!r.ok) throw new Error(`Serveur indisponible (${r.status})`); return await r.arrayBuffer();}
  finally {clearTimeout(timeout);}
}
async function digest(bytes) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), x => x.toString(16).padStart(2, '0')).join(''); }
function validateCatalogue(c) {
  if (c?.schema !== 1 || !Number.isInteger(c.catalog_version) || !Array.isArray(c.courses)) throw new Error('Catalogue invalide');
  const ids = new Set();
  for (const m of c.courses) {
    if (!m.id || ids.has(m.id) || !m.title || !Number.isInteger(m.version) || !/^[a-f0-9]{64}$/i.test(m.sha256)) throw new Error('Référence de cours invalide');
    localURL(m.url); ids.add(m.id);
  }
}
function validateCourse(c, m) {
  if (c?.schema !== 1 || c.id !== m.id || c.version !== m.version || !Array.isArray(c.cards) || !c.cards.length || c.cards.length !== m.card_count) throw new Error('Cours incomplet');
  const ids = new Set();
  for (const card of c.cards) {
    if (!card.id || ids.has(card.id) || typeof card.question_html !== 'string' || !card.question_html.trim() || typeof card.answer_html !== 'string' || !card.answer_html.trim()) throw new Error('Carte invalide');
    ids.add(card.id);
  }
}
function cleanHTML(html, assets, urls) {
  const t = document.createElement('template'); t.innerHTML = html;
  const allowed = new Set(['B','STRONG','EM','I','U','BR','P','DIV','SPAN','UL','OL','LI','SUB','SUP','TABLE','THEAD','TBODY','TR','TH','TD','IMG','H3','H4']);
  for (const el of [...t.content.querySelectorAll('*')]) {
    if (!allowed.has(el.tagName)) {el.remove(); continue;}
    const src = el.getAttribute('src'), alt = el.getAttribute('alt');
    for (const a of [...el.attributes]) el.removeAttribute(a.name);
    if (el.tagName === 'IMG') {
      if (!src) {el.remove(); continue;}
      const url = localURL(src); assets?.add(url);
      el.setAttribute('src', urls?.get(url) || url); el.setAttribute('alt', alt || 'Schéma du cours');
    }
  }
  return t.innerHTML;
}
async function download(m) {
  const bytes = await fetchFresh(m.url);
  if (await digest(bytes) !== m.sha256.toLowerCase()) throw new Error('Téléchargement incomplet ou publication en cours');
  const course = JSON.parse(new TextDecoder().decode(bytes)); validateCourse(course, m);
  const assetPaths = new Set();
  for (const card of course.cards) {cleanHTML(card.question_html, assetPaths); cleanHTML(card.answer_html, assetPaths);}
  for (const asset of course.assets || []) assetPaths.add(localURL(typeof asset === 'string' ? asset : asset.url));
  const assets = [];
  for (const url of assetPaths) {
    const bytes = await fetchFresh(url), path = new URL(url).pathname.toLowerCase();
    const type = path.endsWith('.png') ? 'image/png' : /\.jpe?g$/.test(path) ? 'image/jpeg' : path.endsWith('.webp') ? 'image/webp' : path.endsWith('.gif') ? 'image/gif' : '';
    if (!type) throw new Error('Format image non pris en charge');
    const blob = new Blob([bytes], {type});
    const image = await createImageBitmap(blob); image.close(); assets.push({url, blob});
  }
  const record = {id: m.id, meta: m, course, assets, downloadedAt: new Date().toISOString()};
  await db.put('courses', record); records.set(m.id, record);
}
async function sync(manual = false) {
  if (syncing || !storageOK) return;
  if (!navigator.onLine) {if (manual) toast('Hors ligne. Tes cours téléchargés restent accessibles.'); return;}
  syncing = true; syncMessage = 'Vérification des cours…'; refreshHome();
  let added = 0, updated = 0;
  try {
    const remote = JSON.parse(new TextDecoder().decode(await fetchFresh('./catalog.json'))); validateCatalogue(remote);
    if (remote.catalog_version < catalogue.catalog_version) throw new Error('Le serveur présente une ancienne version');
    const errors = [];
    for (const m of remote.courses) {
      const prev = records.get(m.id);
      if (prev && prev.meta.version > m.version) {errors.push(m.title); continue;}
      if (prev?.meta.sha256 === m.sha256 && prev.meta.version === m.version) continue;
      syncMessage = `Téléchargement · ${m.title}`; refreshHome();
      try {await download(m); if (prev) updated++; else added++;} catch (e) {console.warn(m.id, e); errors.push(m.title);}
    }
    await db.put('settings', remote, 'catalogue'); catalogue = remote;
    if (errors.length) throw new Error(`${errors.length} cours non actualisé(s). Les copies téléchargées sont conservées`);
    lastSync = new Date().toISOString(); await db.put('settings', lastSync, 'lastSync');
    syncMessage = 'Tous les cours sont à jour';
    if (added || updated) toast(`${added} nouveau(x) cours · ${updated} mise(s) à jour`); else if (manual) toast('Tout est à jour.');
  } catch (e) {syncMessage = `${e.message}. Réessaie avec une connexion.`; if (manual) toast(syncMessage);}
  finally {syncing = false; refreshHome();}
}
function metas() {const map = new Map(catalogue.courses.map(m => [m.id, m])); for (const r of records.values()) if (!map.has(r.id)) map.set(r.id, r.meta); return [...map.values()];}
const reviewKey = (course, card) => `${course}:${card}`;
function counts(id) {
  const cards = records.get(id)?.course.cards || [];
  return {all: cards.length, exam: cards.filter(c => c.exam && !c.qcm).length, qcm: cards.filter(c => c.qcm).length,
    hard: cards.filter(c => review[reviewKey(id,c.id)]?.hard).length,
    due: cards.filter(c => {const p=review[reviewKey(id,c.id)]; return p && p.due <= Date.now();}).length,
    known: cards.filter(c => review[reviewKey(id,c.id)]?.interval >= 3).length};
}
function lastSyncText() {return lastSync ? new Date(lastSync).toLocaleString('fr-CA',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) : 'Pas encore effectuée';}
function shellStatus() {return !storageOK ? 'Stockage indisponible' : !shellReady ? 'Préparation du mode hors ligne…' : !records.size ? 'Application prête · cours à télécharger' : navigator.onLine ? 'Prêt pour le hors ligne' : 'Mode hors ligne';}
function courseTile(meta) {
  const r = records.get(meta.id), m = r?.meta || meta, n = counts(meta.id), title = m.title.split('·');
  return `<article class="course-tile"><div class="tile-top"><span class="course-code">${esc(title.length > 1 ? title[0] : 'COURS')}</span><span class="download-state">${r ? icon('check',14)+' Téléchargé' : 'À télécharger'}</span></div>
    <div class="course-symbol">${icon('book',28)}</div><h2>${esc(title.length > 1 ? title.slice(1).join('·').trim() : m.title)}</h2><p class="subtitle">${esc(m.subtitle)}</p>
    <div class="tile-numbers"><span><b>${r ? n.all : m.card_count}</b> cartes</span><span class="important">★ ${r ? n.exam : m.exam_count || 0} prioritaires</span><span>${r ? n.qcm : m.qcm_count || 0} QCM</span></div>
    ${r ? `<div class="mastery"><span>Acquisition</span><b>${n.known} / ${n.all}</b></div><div class="meter"><span style="width:${n.all ? n.known/n.all*100 : 0}%"></span></div>
    <div class="modes"><button class="exam-mode" data-open="${esc(m.id)}" data-mode="exam" ${n.exam?'':'disabled'}><span>★ Priorité examen</span>${icon('arrow',17)}</button><button data-open="${esc(m.id)}" data-mode="all"><span>Cours complet</span>${icon('arrow',17)}</button><button data-open="${esc(m.id)}" data-mode="qcm" ${n.qcm?'':'disabled'}><span>QCM du professeur</span><small>${n.qcm}</small></button><button data-open="${esc(m.id)}" data-mode="hard" ${n.hard?'':'disabled'}><span>À revoir</span><small>${n.hard}</small></button><button data-open="${esc(m.id)}" data-mode="due" ${n.due?'':'disabled'}><span>Révisions prévues</span><small>${n.due}</small></button></div>` : '<button class="primary" data-action="sync">Télécharger le cours</button>'}
    <div class="tile-footer">${r && shellReady ? 'Disponible sans Internet' : r ? 'Cours enregistré · application en préparation' : 'Une connexion est nécessaire'}${r && r.meta.version < meta.version ? ' · Mise à jour disponible' : ''}</div></article>`;
}
function home() {
  const all = metas(), total = [...records.keys()].reduce((n,id) => n+counts(id).all,0), due = [...records.keys()].reduce((n,id) => n+counts(id).due,0);
  app.innerHTML = `<div class="layout"><aside class="sidebar"><a class="brand" href="./" aria-label="Study Hub, accueil"><span class="brand-mark">${icon('book',23)}</span>study<span class="brand-light">hub</span><span class="brand-dot">.</span></a><div class="sidebar-caption">TON ESPACE D’ÉTUDE</div><button class="side-active" data-action="library">${icon('grid')} Bibliothèque <span>${all.length}</span></button><div class="sidebar-bottom"><div class="offline-icon">${icon('download')}</div><b>Prêt pour le métro.</b><p>Tes cours te suivent,<br>même sans réseau.</p><small>GÉNIE BIOMÉDICAL<br>POLYTECHNIQUE MONTRÉAL</small></div></aside>
  <main class="main"><header class="topbar"><span>MON ESPACE <span class="slash">/</span> Bibliothèque</span><button class="text-button" data-action="help">Installer sur iPhone ${icon('arrow',15)}</button></header>
  <div class="library-scroll"><section class="intro"><div class="eyebrow">UN PEU CHAQUE JOUR, UN PEU PLUS LOIN.</div><h1>Place à la <span>révision.</span></h1><p>Les bonnes questions. À ton rythme. Partout.</p></section>
  <section class="overview" aria-label="Résumé de la bibliothèque"><div><span class="metric-number">${String(records.size).padStart(2,'0')}</span><span>cours téléchargé${records.size>1?'s':''}</span></div><div><span class="metric-number">${total}</span><span>cartes à explorer</span></div><div><span class="metric-number ${due?'important':''}">${String(due).padStart(2,'0')}</span><span>révisions prévues</span></div><div class="overview-note">${icon('check',24)}<span>Ta progression est<br>enregistrée sur cet appareil.</span></div></section>
  <section class="library"><div class="section-heading"><h2>Ma bibliothèque <span>${all.length}</span></h2><label class="search">${icon('search',17)}<input id="search" type="search" value="${esc(search)}" placeholder="Rechercher un cours" aria-label="Rechercher un cours"></label></div><div class="filter-row"><button class="chip ${filter==='all'?'selected':''}" data-filter="all">Tous les cours</button><button class="chip ${filter==='downloaded'?'selected':''}" data-filter="downloaded">Téléchargés</button><span>Le rouge, c’est l’essentiel.</span></div><div id="courseList" class="course-list"></div></section>
  <section class="sync-panel" aria-live="polite"><span class="status-dot ${!navigator.onLine?'offline':''}"></span><div><b>${esc(shellStatus())}</b><p>${syncing ? esc(syncMessage) : 'Dernière synchronisation : '+esc(lastSyncText())}</p>${!syncing && syncMessage && syncMessage !== 'Tous les cours sont à jour' ? `<p class="sync-detail">${esc(syncMessage)}</p>` : ''}</div><button class="sync-button" data-action="sync" ${syncing || !storageOK ? 'disabled' : ''}>${icon('sync',17)} ${syncing?'En cours…':'Synchroniser'}</button></section>
  ${updateReady ? '<div class="update-banner">Une nouvelle version de l’application est prête. <button data-action="reload">Actualiser</button></div>' : ''}
  <footer class="footer"><span>Study Hub · Ton savoir, toujours avec toi.</span><button data-action="export">Sauvegarder ma progression</button><span>v${VERSION}</span></footer></div></main></div>`;
  renderList(); document.querySelector('#search').addEventListener('input', e => {search = e.target.value; renderList();});
}
function renderList() {
  const q = search.toLocaleLowerCase('fr');
  const list = metas().filter(m => `${m.title} ${m.subtitle}`.toLocaleLowerCase('fr').includes(q) && (filter!=='downloaded' || records.has(m.id)));
  document.querySelector('#courseList').innerHTML = list.map(courseTile).join('') || '<div class="empty">Aucun cours à afficher. Synchronise ta bibliothèque ou essaie une autre recherche.</div>';
}
function refreshHome() {if (!session) {const scroll = document.querySelector('.library-scroll')?.scrollTop || 0; const focus = document.activeElement?.id === 'search'; home(); document.querySelector('.library-scroll').scrollTop=scroll; if(focus) document.querySelector('#search').focus();}}
function modeName(mode) {return {exam:'Priorité examen',all:'Cours complet',qcm:'QCM du professeur',hard:'À revoir',due:'Révisions prévues'}[mode];}
function enter(id, mode) {
  const r = records.get(id); if (!r) return;
  const cards = r.course.cards.filter(c => mode==='exam' ? c.exam&&!c.qcm : mode==='qcm' ? c.qcm : mode==='hard' ? review[reviewKey(id,c.id)]?.hard : mode==='due' ? review[reviewKey(id,c.id)]?.due <= Date.now() : true);
  if (!cards.length) return toast('Aucune carte dans ce mode pour le moment.');
  for (const url of imageURLs.values()) URL.revokeObjectURL(url); imageURLs.clear();
  for (const asset of r.assets) imageURLs.set(asset.url, URL.createObjectURL(asset.blob));
  const saved = positions[`${id}:${mode}`], index = typeof saved==='string' ? cards.findIndex(c=>c.id===saved) : Number(saved) || 0;
  session = {id, mode, course:r.course, cards, index:Math.max(0,Math.min(index,cards.length-1)), answer:false}; renderCard();
}
async function savePosition() {
  if (!session) return;
  positions[`${session.id}:${session.mode}`] = session.cards[session.index].id;
  try {await db.put('progress',positions,'positions');} catch {toast('La position n’a pas pu être enregistrée.');}
}
function renderCard() {
  const s=session, card=s.cards[s.index], p=review[reviewKey(s.id,card.id)];
  app.innerHTML=`<main class="study"><header class="study-header"><button class="back-button" data-action="home">${icon('back')}<span>Bibliothèque</span></button><span class="study-title">${esc(s.course.title)}</span><button class="mark-button ${p?.hard?'marked':''}" data-action="mark" aria-pressed="${!!p?.hard}">${p?.hard?'★ À revoir':'☆ Marquer'}</button></header>
  <div class="session-info"><span class="eyebrow ${s.mode==='exam'?'important':''}">${esc(modeName(s.mode))}</span><span>CARTE <b>${String(s.index+1).padStart(2,'0')}</b> / ${s.cards.length}</span></div><div class="session-meter"><span style="width:${(s.index+1)/s.cards.length*100}%"></span></div>
  <article class="flashcard ${s.answer?'revealed':''}"><div class="card-meta"><span>${esc(card.section)}</span>${card.exam&&!card.qcm?'<span class="priority-badge">★ Priorité examen</span>':''}<span class="source">Diapo ${esc(card.source)}</span></div><div class="question"><span class="question-label">QUESTION</span><div class="question-content">${cleanHTML(card.question_html,null,imageURLs)}</div></div><div class="answer" id="answer" ${s.answer?'':'hidden'}><span class="question-label">RÉPONSE</span><div>${cleanHTML(card.answer_html,null,imageURLs)}</div></div><button class="reveal-button ${s.answer?'is-open':''}" data-action="reveal" aria-expanded="${s.answer}" aria-controls="answer">${s.answer?'Cacher la réponse':'Afficher la réponse'} <span>${s.answer?'−':'+'}</span></button></article>
  <div class="rating ${s.answer?'visible':''}" aria-label="Évaluer la mémorisation"><span>Comment ça s’est passé ?</span><div><button data-rate="again" ${s.answer?'':'disabled'}>À revoir <small>10 min</small></button><button data-rate="hard" ${s.answer?'':'disabled'}>Difficile <small>1 jour</small></button><button data-rate="good" ${s.answer?'':'disabled'}>Compris <small>${p?.interval>=1?Math.round(p.interval*2.5):3} jours</small></button></div></div>
  <nav class="card-nav" aria-label="Navigation des cartes"><button data-action="prev" ${s.index===0?'disabled':''}>${icon('back',17)} Précédente</button><span>Une question à la fois.</span><button data-action="next">${s.index===s.cards.length-1?'Terminer':'Suivante'} ${icon('arrow',17)}</button></nav></main>`;
  savePosition();
}
function step(delta) {
  if (!session) return;
  const next=session.index+delta;
  if(next>=session.cards.length) {positions[`${session.id}:${session.mode}`]=session.cards[0].id; db.put('progress',positions,'positions').catch(()=>toast('Position non enregistrée')); session=null; home(); toast('Session terminée. Bien joué !'); return;}
  session.index=Math.max(0,next); session.answer=false; renderCard();
}
async function mark() {
  const s=session, key=reviewKey(s.id,s.cards[s.index].id), prev=review[key]||{}, next={...review,[key]:{...prev,hard:!prev.hard}};
  try {await db.put('progress',next,'reviews'); review=next; if(session===s)renderCard();}catch{toast('Progression non enregistrée : stockage indisponible.');}
}
let ratingBusy=false;
async function rate(kind) {
  if (!session?.answer || ratingBusy) return; ratingBusy=true;
  const s=session, index=s.index, key=reviewKey(s.id,s.cards[index].id), prev=review[key]||{};
  const interval=kind==='again'?0:kind==='hard'?1:prev.interval>=1?Math.round(prev.interval*2.5):3;
  const next={...review,[key]:{hard:kind!=='good',interval,due:Date.now()+(interval?interval*86400000:600000),last:Date.now(),reviews:(prev.reviews||0)+1}};
  try {await db.put('progress',next,'reviews'); review=next; if(session===s&&s.index===index)step(1);}catch{toast('Progression non enregistrée : stockage indisponible.');}
  finally{ratingBusy=false;}
}
function showHelp() {document.querySelector('#help').showModal(); navigator.storage?.persist?.().catch(()=>{});}
function exportProgress() {
  const blob = new Blob([JSON.stringify({schema:1,exportedAt:new Date().toISOString(),reviews:review,positions},null,2)],{type:'application/json'});
  const a=document.createElement('a'), url=URL.createObjectURL(blob); a.href=url; a.download='studyhub-progression.json'; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function importProgress(file) {
  if(!file)return;
  try {
    const data=JSON.parse(await file.text()); if(data.schema!==1||!data.reviews||!data.positions)throw new Error('Format inconnu');
    const merged={...review};
    for(const [k,v] of Object.entries(data.reviews)) {
      if(!v||typeof v!=='object'||(v.due!==undefined&&!Number.isFinite(v.due))||(v.interval!==undefined&&!Number.isFinite(v.interval)))throw new Error('Progression invalide');
      if(!merged[k]||(v.last||0)>(merged[k].last||0))merged[k]=v;
    }
    const mergedPositions={...data.positions,...positions};
    await db.put('progress',merged,'reviews'); await db.put('progress',mergedPositions,'positions');
    review=merged; positions=mergedPositions; toast('Progression restaurée.'); refreshHome();
  }catch{toast('Impossible de restaurer ce fichier.');}
}
app.addEventListener('click',e=>{
  const b=e.target.closest('button'); if(!b||b.disabled)return;
  if(b.dataset.open)return enter(b.dataset.open,b.dataset.mode);
  if(b.dataset.filter){filter=b.dataset.filter;return home();}
  if(b.dataset.rate)return rate(b.dataset.rate);
  switch(b.dataset.action){
    case 'home':session=null;home();break;
    case 'library':filter='all';search='';home();break;
    case 'sync':navigator.storage?.persist?.().catch(()=>{});sync(true);break;
    case 'help':showHelp();break;
    case 'reveal':session.answer=!session.answer;renderCard();break;
    case 'prev':step(-1);break;
    case 'next':step(1);break;
    case 'mark':mark();break;
    case 'export':exportProgress();break;
    case 'reload':location.reload();break;
  }
});
document.querySelector('#closeHelp').onclick=()=>document.querySelector('#help').close();
document.querySelector('#importProgress').onchange=e=>importProgress(e.target.files[0]);
document.addEventListener('keydown',e=>{if(!session||e.target.closest('button,input,dialog'))return; if(e.code==='Space'){e.preventDefault();session.answer=!session.answer;renderCard();} if(e.key==='ArrowRight')step(1);if(e.key==='ArrowLeft')step(-1);});
async function setupSW() {
  if(!('serviceWorker' in navigator))return;
  try {
    let hadController=!!navigator.serviceWorker.controller;
    registration=await navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'});
    navigator.serviceWorker.addEventListener('controllerchange',()=>{if(hadController)updateReady=true;hadController=true;checkShell();});
    await navigator.serviceWorker.ready; await checkShell();
    if(navigator.onLine)registration.update().catch(()=>{});
  }catch(e){syncMessage='Installation hors ligne incomplète. Reconnecte-toi et actualise.';refreshHome();console.warn(e);}
}
async function checkShell() {
  const cache=await caches.open('studyhub-shell-v5');
  shellReady=!!(navigator.serviceWorker.controller && await cache.match(new URL('index.html',base).href)); refreshHome();
}
async function boot() {
  try {
    await db.open(); storageOK=true;
    for(const r of await db.all('courses'))records.set(r.id,r);
    catalogue=await db.get('settings','catalogue')||catalogue;
    review=await db.get('progress','reviews')||{};
    positions=await db.get('progress','positions')||localJSON('studyhub.progress.v1',{});
    lastSync=await db.get('settings','lastSync')||'';
    if(!records.size && 'caches' in window) {
      const old=localJSON('studyhub.catalog.v1',null);
      if(old?.courses)for(const m of old.courses)try {
        const response=await caches.match(localURL(m.url));if(!response)continue;
        const bytes=await response.arrayBuffer();if(await digest(bytes)!==m.sha256)continue;
        const course=JSON.parse(new TextDecoder().decode(bytes));validateCourse(course,m);
        if(course.cards.some(c=>/<img\b/i.test(c.question_html+c.answer_html)))continue;
        const r={id:m.id,meta:m,course,assets:[],downloadedAt:new Date().toISOString()};await db.put('courses',r);records.set(m.id,r);
      }catch(e){console.warn('Migration',e);}
    }
  }catch(e){storageOK=false;syncMessage='Le stockage local est indisponible. Ouvre Study Hub hors navigation privée, puis réessaie.';console.warn(e);}
  home(); setupSW(); sync();
  window.addEventListener('online',()=>{refreshHome();sync();});
  window.addEventListener('offline',refreshHome);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){sync();registration?.update().catch(()=>{});}});
}
boot();
})();
