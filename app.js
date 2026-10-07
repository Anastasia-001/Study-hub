(() => {
'use strict';
const app = document.getElementById('app');
const toastEl = document.getElementById('toast');
const LS_CATALOG='studyhub.catalog.v1', LS_LASTSYNC='studyhub.lastsync.v1', LS_PROGRESS='studyhub.progress.v1';
let catalog={schema:1,catalog_version:0,courses:[]}, courseMap=new Map(), state={view:'home',courseId:null,mode:null,index:0,answer:false};

const esc = s => String(s??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const trust = s => String(s??''); // course packs are authored by Study Hub itself
const online = () => navigator.onLine !== false;
function toast(msg){ toastEl.textContent=msg; toastEl.classList.add('show'); setTimeout(()=>toastEl.classList.remove('show'),2200); }
function readJSON(k,fallback){ try{return JSON.parse(localStorage.getItem(k))??fallback}catch{return fallback} }
function writeJSON(k,v){ try{localStorage.setItem(k,JSON.stringify(v))}catch{} }
function lastSyncText(){ const s=localStorage.getItem(LS_LASTSYNC); if(!s) return 'Jamais synchronisé'; const d=new Date(s); return 'Sync '+d.toLocaleString('fr-CA',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}); }
function setLastSync(){ try{localStorage.setItem(LS_LASTSYNC,new Date().toISOString())}catch{} }

async function registerSW(){
 if(!('serviceWorker' in navigator)) return;
 try{
   const reg=await navigator.serviceWorker.register('./sw.js',{scope:'./'});
   await navigator.serviceWorker.ready;
   if(online()) reg.update().catch(()=>{});
 }catch(e){ console.warn('SW',e); }
}

async function getJSON(url, fresh=false){
 const r=await fetch(url, fresh?{cache:'no-store'}:{});
 if(!r.ok) throw new Error(`${r.status} ${url}`);
 return r.json();
}

async function loadCourse(meta, fresh=false){
 const obj=await getJSON(meta.url,fresh);
 courseMap.set(meta.id,obj);
 return obj;
}

async function loadLocalCatalog(){
 const saved=readJSON(LS_CATALOG,null);
 if(saved?.courses?.length) catalog=saved;
 try{
   const cached=await getJSON('./catalog.json',false);
   if(cached?.courses?.length && cached.catalog_version>=catalog.catalog_version) catalog=cached;
 }catch{}
 for(const meta of catalog.courses){
   try{await loadCourse(meta,false)}catch(e){ console.warn('course unavailable',meta.id,e); }
 }
}

async function syncCatalog(manual=false){
 if(!online()){ if(manual) toast('Hors ligne — cours locaux disponibles'); render(); return false; }
 try{
   const remote=await getJSON('./catalog.json?sync='+Date.now(),true);
   let added=0, updated=0;
   const old=new Map((catalog.courses||[]).map(c=>[c.id,c]));
   for(const meta of remote.courses||[]){
     const prev=old.get(meta.id);
     if(!prev) added++; else if(Number(meta.version)>Number(prev.version) || meta.sha256!==prev.sha256) updated++;
     await loadCourse(meta,true); // SW stores the fresh response for offline use
   }
   catalog=remote; writeJSON(LS_CATALOG,catalog); setLastSync(); render();
   if(added||updated) toast(`${added?added+' nouveau(x) cours':''}${added&&updated?' · ':''}${updated?updated+' mis à jour':''}`);
   else if(manual) toast('Tout est à jour');
   return true;
 }catch(e){ console.warn('sync failed',e); if(manual) toast('Sync impossible — version hors ligne conservée'); render(); return false; }
}

function progress(){ return readJSON(LS_PROGRESS,{}); }
function saveProgress(){
 if(state.view!=='cards') return;
 const p=progress(); p[`${state.courseId}:${state.mode}`]=state.index; writeJSON(LS_PROGRESS,p);
}
function modeCards(course,mode){
 if(mode==='exam') return course.cards.filter(c=>c.exam&&!c.qcm);
 if(mode==='qcm') return course.cards.filter(c=>c.qcm);
 return course.cards;
}
function enterCourse(id,mode){
 const course=courseMap.get(id); if(!course) return toast('Cours non disponible hors ligne');
 const p=progress(); const seq=modeCards(course,mode); const idx=Math.min(Math.max(Number(p[`${id}:${mode}`]||0),0),Math.max(seq.length-1,0));
 state={view:'cards',courseId:id,mode,index:idx,answer:false}; render();
}
function goHome(){ saveProgress(); state={view:'home',courseId:null,mode:null,index:0,answer:false}; render(); }
function step(delta){
 const c=courseMap.get(state.courseId), seq=modeCards(c,state.mode); saveProgress();
 const ni=state.index+delta;
 if(ni<0){ goHome(); return; }
 if(ni>=seq.length){ state.index=0; saveProgress(); goHome(); toast('Session terminée'); return; }
 state.index=ni; state.answer=false; render();
}
function toggleAnswer(){ state.answer=!state.answer; renderCardOnly(); }

function statusHTML(){
 return `<div class="statusbar"><div class="status-left"><span class="dot ${online()?'online':''}"></span><span class="status-text">${online()?'En ligne':'Hors ligne'} · ${esc(lastSyncText())}</span></div><button id="syncBtn" class="syncbtn">Synchroniser</button></div>`;
}
function courseCard(meta){
 const course=courseMap.get(meta.id); const ready=!!course; const all=course?.cards?.length??meta.card_count??0, exam=course?.cards?.filter(c=>c.exam&&!c.qcm).length??meta.exam_count??0, qcm=course?.cards?.filter(c=>c.qcm).length??meta.qcm_count??0;
 return `<article class="course-card"><div class="course-label">${ready?'Disponible hors ligne':'À télécharger'}</div><h2>${esc(meta.title)}</h2><p>${esc(meta.subtitle||'')}</p><div class="stats"><div><strong>${all}</strong><span>cartes</span></div><div><strong>${exam}</strong><span>examen</span></div><div><strong>${qcm}</strong><span>QCM</span></div></div><div class="modes">${ready?`<button class="mode primary" data-open="${esc(meta.id)}" data-mode="exam"><b>Révision examen</b><small>Notions prioritaires</small></button><button class="mode" data-open="${esc(meta.id)}" data-mode="all"><b>Cours complet</b><small>Toutes les cartes</small></button><button class="mode" data-open="${esc(meta.id)}" data-mode="qcm"><b>QCM du prof</b><small>Questions d’examen</small></button>`:`<button class="mode" data-sync>Connecte-toi pour télécharger ce cours</button>`}</div></article>`;
}
function renderHome(){
 app.innerHTML=`<section class="screen panel home"><div class="eyebrow">Study Hub</div><h1>Bibliothèque de cours</h1><p>Les cours téléchargés restent disponibles sans Internet. Quand la connexion revient, Study Hub vérifie automatiquement les nouveautés.</p>${statusHTML()}<div class="course-list">${(catalog.courses||[]).map(courseCard).join('')||'<div class="empty">Aucun cours local. Reconnecte-toi une fois pour initialiser Study Hub.</div>'}</div></section>`;
 bindHome();
}
function modeName(m){ return m==='exam'?'Révision examen':m==='qcm'?'QCM du prof':'Cours complet'; }
function renderCardOnly(){
 const answer=document.getElementById('answer'); const btn=document.getElementById('answerBtn'); if(!answer||!btn) return renderCards();
 answer.classList.toggle('open',state.answer); btn.textContent=state.answer?'Cacher la réponse':'Afficher la réponse';
}
function renderCards(){
 const course=courseMap.get(state.courseId); if(!course) return goHome();
 const seq=modeCards(course,state.mode); if(!seq.length) return goHome();
 state.index=Math.min(state.index,seq.length-1); const card=seq[state.index];
 const pct=((state.index+1)/seq.length*100).toFixed(2);
 app.innerHTML=`<section class="screen panel card"><div class="head"><div class="grow"><div class="eyebrow">${esc(course.title)} · ${esc(modeName(state.mode))}</div><div class="progress"><span style="width:${pct}%"></span></div><div class="progress-text">Carte ${state.index+1}/${seq.length} · ${esc(card.section)}</div></div><button id="homeBtn" class="topbtn">Cours</button></div><div class="badges">${card.exam&&!card.qcm?'<span class="badge star">★ Priorité examen</span>':''}${card.qcm?'<span class="badge qcm">QCM du prof</span>':''}<span class="badge source">Diapo ${esc(card.source)}</span></div><div class="question"><h2>${trust(card.question_html)}</h2></div><button id="answerBtn" class="answer-toggle-btn">${state.answer?'Cacher la réponse':'Afficher la réponse'}</button><div id="answer" class="answer ${state.answer?'open':''}">${trust(card.answer_html)}</div><div class="nav"><button id="prevBtn" class="btn ghost">Précédente</button><button id="nextBtn" class="btn primary">${state.index===seq.length-1?'Terminer':'Suivante'}</button></div></section>`;
 document.getElementById('homeBtn').onclick=goHome; document.getElementById('answerBtn').onclick=toggleAnswer; document.getElementById('prevBtn').onclick=()=>step(-1); document.getElementById('nextBtn').onclick=()=>step(1);
 saveProgress();
}
function bindHome(){
 document.getElementById('syncBtn')?.addEventListener('click',()=>syncCatalog(true));
 app.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>enterCourse(b.dataset.open,b.dataset.mode));
 app.querySelectorAll('[data-sync]').forEach(b=>b.onclick=()=>syncCatalog(true));
}
function render(){ state.view==='cards'?renderCards():renderHome(); }

async function boot(){
 await registerSW();
 catalog=readJSON(LS_CATALOG,{schema:1,catalog_version:0,courses:[]});
 await loadLocalCatalog(); render();
 if(online()) syncCatalog(false);
 window.addEventListener('online',()=>{render();syncCatalog(false)});
 window.addEventListener('offline',render);
 document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible'&&online()) syncCatalog(false); });
 // prevent rubber-band/accidental document scrolling; only internal scroll containers move
 document.addEventListener('touchmove',e=>{ const t=e.target.closest('.home,.question,.answer'); if(!t) e.preventDefault(); },{passive:false});
}
boot();
})();
