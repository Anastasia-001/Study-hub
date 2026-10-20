const {chromium}=require('playwright');
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict'),{execFileSync}=require('child_process');
const root=path.resolve(__dirname,'..'),out=process.env.STUDYHUB_TEST_OUTPUT||path.join(root,'test-results');
fs.mkdirSync(out,{recursive:true});
const oldCommit='dac8ac104a200ea7cf8a6f60111f37668c5a08c1';
const oldFiles=new Map(['index.html','app.js','styles.css','sw.js','manifest.webmanifest','catalog.json','gbm3000-cardio-1a.json','icon-192.png','icon-512.png','apple-touch-icon.png'].map(name=>[name,execFileSync('git',['show',`${oldCommit}:${name}`],{cwd:root})]));
let legacy=true,failData=false;
const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json','.png':'image/png','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');let file=url.pathname.replace(/^\/Study-hub\//,'')||'index.html';
 if(failData&&file.endsWith('.json')){res.writeHead(503);return res.end('Offline data server');}
 res.setHeader('Content-Type',types[path.extname(file)]||'text/plain');res.setHeader('Cache-Control','no-store');
 try{res.end(legacy?oldFiles.get(file)||'':fs.readFileSync(path.join(root,file)));}catch{res.writeHead(404);res.end();}
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/Study-hub/`;
 const profile=fs.mkdtempSync(path.join(out,'restart-profile-'));
 let ctx;
 try{
  ctx=await chromium.launchPersistentContext(profile,{channel:process.env.STUDYHUB_BROWSER||'chrome',headless:true});
  let page=await ctx.newPage();page.on('console',m=>{if(m.type()==='warning'||m.type()==='error')console.log('Browser:',m.text());});page.on('pageerror',e=>console.log('Browser error:',e.message));await page.goto(url);await page.locator('[data-mode=exam]').waitFor();
  await page.waitForFunction(()=>navigator.serviceWorker.controller&&localStorage.getItem('studyhub.catalog.v1'));
  await page.locator('[data-mode=exam]').click();await page.locator('#nextBtn').click();await page.locator('#nextBtn').click();await page.locator('#homeBtn').click();
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('studyhub.progress.v1'))['gbm3000-cardio-1a:exam']),2);
  legacy=false;
  await page.evaluate(async()=>{const reg=await navigator.serviceWorker.getRegistration();await reg.update();});
  await page.waitForFunction(async()=>{const c=await caches.open('studyhub-shell-v6');return !!await c.match(new URL('./app.js',location.href));});
  await page.waitForFunction(async()=>{const reg=await navigator.serviceWorker.getRegistration();return reg.active?.state==='activated'&&!reg.installing&&!reg.waiting;});
  failData=true;await page.reload();
  try{await page.waitForFunction(()=>document.body.textContent.includes('Prêt pour le hors ligne')||document.body.textContent.includes('Mode hors ligne'));await page.locator('[data-course=gbm3000-cardio-1a]').click();}catch(e){console.log('Upgrade page:',await page.locator('body').innerText());console.log('Caches:',await page.evaluate(async()=>{const a={};for(const k of await caches.keys())a[k]=(await(await caches.open(k)).keys()).map(r=>r.url);return a;}));throw e;}
  assert.equal(await page.evaluate(()=>StudyStorage.get('courses','gbm3000-cardio-1a').then(r=>r.course.cards.length)),59);
  await page.locator('[data-mode=exam]').click();assert.match(await page.locator('.session-info').innerText(),/QUESTION 3 /);
  console.log('PASS Real v1 service worker upgrade: cached course and saved position migrated despite HTTP 503');
  await page.locator('[data-action=reveal]').click();await page.locator('[data-rate=hard]').click();
  await page.waitForFunction(()=>document.querySelector('.session-info')?.textContent.includes('QUESTION 4 '));
  await ctx.close();ctx=null;
  ctx=await chromium.launchPersistentContext(profile,{channel:process.env.STUDYHUB_BROWSER||'chrome',headless:true});
  await ctx.setOffline(true);page=await ctx.newPage();await page.goto(url);await page.waitForFunction(()=>document.body.textContent.includes('Prêt pour le hors ligne')||document.body.textContent.includes('Mode hors ligne'));await page.locator('[data-course=gbm3000-cardio-1a]').click();
  await page.locator('[data-mode=exam]').click();assert.match(await page.locator('.session-info').innerText(),/QUESTION 4 /);
  await page.locator('[data-action=reveal]').click();assert(await page.locator('#answer').isVisible());
  assert.equal(await page.evaluate(()=>StudyStorage.get('progress','reviews').then(r=>r['gbm3000-cardio-1a:card-003'].hard)),true);
  console.log('PASS Full browser process exit and restart offline: shell, course, review state and session position retained');
 }finally{await ctx?.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
