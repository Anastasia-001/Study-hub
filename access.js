/* A code is redeemed server-side once; the resulting license stays in this browser's IndexedDB. */
window.StudyAccess=(()=>{
 const API='https://study-hub-activation.zoutommy12.chatgpt.site';
 let grant=null;
 function remote(path){const url=new URL(path,location.href);return url.origin===API&&/^\/api\/courses\/[a-z0-9-]+$/.test(url.pathname);}
 function deviceIdentity(){return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
 async function unlock(db){
  const saved=await db.get('settings','access');
  if(typeof saved?.token==='string'&&/^[a-f0-9-]+\.[a-f0-9]{64}\.[a-f0-9]{64}$/.test(saved.token)){grant=saved;return;}
  let device=await db.get('settings','accessDevice');
  if(!/^[A-Za-z0-9_-]{43}$/.test(device||'')){device=deviceIdentity();await db.put('settings',device,'accessDevice');}
  const target=document.querySelector('#app');
  target.innerHTML=`<main class="access-screen"><section class="access-card"><div class="brand"><span class="brand-mark">S</span>study<span class="brand-light">hub</span><span class="brand-dot">.</span></div><div class="access-heading"><span class="eyebrow">ACCÈS PERSONNEL</span><h1>Prêt à réviser ?</h1><p>Entre le code reçu pour activer cet appareil.</p></div><form id="activate"><label for="accessCode">Code d’accès</label><input id="accessCode" name="code" placeholder="SH-XXXX-XXXX-XXXX-XXXX" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="40" required><p id="accessError" class="access-error" role="alert"></p><button class="primary" type="submit">Activer mon accès</button></form><p class="access-note">Sur iPhone, ajoute d’abord l’app à l’écran d’accueil, puis entre ton code depuis son icône.</p><div class="access-links"><button class="text-button" data-action="help">Installer sur iPhone</button><a href="${API}/admin" target="_blank" rel="noopener">Gérer mes codes</a></div><p class="access-footnote">Internet est nécessaire pour l’activation. Tes révisions restent disponibles hors ligne ensuite.</p></section></main>`;
  await new Promise(resolve=>{
   const form=target.querySelector('#activate'),field=target.querySelector('#accessCode'),button=form.querySelector('button'),error=target.querySelector('#accessError');let busy=false;
   form.addEventListener('submit',async event=>{
    event.preventDefault();if(busy)return;error.textContent='';
    if(!navigator.onLine){error.textContent='Connecte-toi à Internet pour activer ton accès.';return;}
    busy=true;button.disabled=true;button.textContent='Activation…';
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    try{
     const response=await fetch(API+'/api/redeem',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:field.value,deviceSecret:device}),signal:controller.signal,cache:'no-store',redirect:'error'});
     let result;try{result=await response.json();}catch{throw Error('Le service d’activation est indisponible. Réessaie.');}
     if(!response.ok)throw Error(result.error||'Activation impossible.');
     if(typeof result.token!=='string'||!/^[a-f0-9-]+\.[a-f0-9]{64}\.[a-f0-9]{64}$/.test(result.token))throw Error('Réponse d’activation invalide.');
     const next={token:result.token,activatedAt:result.activatedAt};
     await db.put('settings',next,'access');grant=next;resolve();
    }catch(e){error.textContent=e.name==='AbortError'?'La connexion a pris trop de temps. Réessaie avec le même code.':e instanceof TypeError?'Connexion au service impossible. Réessaie.':e.message;}
    finally{clearTimeout(timer);busy=false;button.disabled=false;button.textContent='Activer mon accès';}
   });
  });
 }
 return {API,unlock,remote,get authorized(){return !!grant;},get token(){return grant?.token||'';}};
})();
