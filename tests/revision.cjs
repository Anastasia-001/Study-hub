const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=process.env.STUDYHUB_TEST_OUTPUT||path.join(root,'test-results');fs.mkdirSync(out,{recursive:true});
const catalog=JSON.parse(fs.readFileSync(path.join(root,'catalog.json'))),source=require('../scripts/course-source.cjs');
const courses=catalog.courses.map(m=>JSON.parse(fs.readFileSync(source(m.id)))),token='00000000-0000-4000-8000-000000000000.'+'a'.repeat(64)+'.'+'b'.repeat(64);
const server=http.createServer((req,res)=>{
 const rel=new URL(req.url,'http://localhost').pathname;
 if(rel==='/api/redeem')return res.end(JSON.stringify({token,activatedAt:Date.now()}));
 if(rel.startsWith('/api/courses/')){assert.equal(req.headers.authorization,'Bearer '+token);return res.end(fs.readFileSync(source(rel.split('/').pop())));}
 const file=rel.replace(/^\/Study-hub\//,'')||'index.html';
 if(file==='catalog.json')return res.end(JSON.stringify({...catalog,courses:catalog.courses.map(m=>({...m,url:`http://127.0.0.1:${server.address().port}/api/courses/${m.id}`}))}));
 if(file==='access.js'){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(path.join(root,file),'utf8').replace('https://study-hub-activation.zoutommy12.chatgpt.site',`http://127.0.0.1:${server.address().port}`));}
 const target=path.resolve(root,file);if(!target.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.webp':'image/webp','.webmanifest':'application/manifest+json'})[path.extname(file)]||'text/plain');
 try{res.end(fs.readFileSync(target));}catch{res.writeHead(404);res.end();}
});
const ready=async p=>{await p.waitForFunction(()=>document.querySelector('#accessCode')||document.body.textContent.includes('Prêt pour le hors ligne')||document.body.textContent.includes('Mode hors ligne'));if(await p.locator('#accessCode').count()){await p.locator('#accessCode').fill('ABCD');await p.locator('#activate button').click();}await p.waitForFunction(()=>document.querySelectorAll('.course-tile').length===6&&document.body.textContent.includes('Prêt pour le hors ligne'));await p.locator('.sync-button:not([disabled])').waitFor();};
const home=async p=>{if(await p.locator('[data-action=home]').count())await p.locator('[data-action=home]').click();if(await p.locator('[data-action=library]').count())await p.locator('[data-action=library]').first().click();};
const detail=async(p,id)=>{await home(p);await p.locator(`[data-course="${id}"]`).click();};
const position=async(p,id,card)=>{await p.evaluate(async({id,card})=>StudyStorage.put('progress',{...await StudyStorage.get('progress','positions'),[id+':all']:card},'positions'),{id,card});await p.reload();await ready(p);};
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(`http://127.0.0.1:${server.address().port}/Study-hub/`);await ready(p);
  for(const c of courses){await detail(p,c.id);assert.equal(await p.locator('.detail-modes button').count(),[2,4].includes(c.number)?4:3);assert.equal(await p.locator('[data-mode=exam]').count(),[2,4].includes(c.number)?1:0);assert.equal(await p.locator('[data-topic],.topics,.topic-heading').count(),0);assert.match(await p.locator('[data-mode=all]').innerText(),/Questions/);assert.equal(await p.locator('[data-mode=qcm] small').innerText(),String(c.cards.filter(q=>q.prof_question||q.qcm).length));}
  console.log('PASS Requested categories in every course; stars only in cardio; no themes');
  const c=courses[0],prof=c.cards.find(q=>q.prof_question);
  await position(p,c.id,prof.id);await detail(p,c.id);await p.locator('[data-mode=all]').click();await p.clock.install();await p.locator('[data-choice="0"]').click();await p.locator('[data-rate=again]').click();await detail(p,c.id);assert(await p.locator('[data-mode=due]').isDisabled());
  await p.clock.fastForward(599000);await detail(p,c.id);assert(await p.locator('[data-mode=due]').isDisabled());
  await p.clock.fastForward(16000);await detail(p,c.id);assert.equal(await p.locator('[data-mode=due] small').innerText(),'1');await p.locator('[data-mode=due]').click();assert.equal(await p.locator('.question-content').innerText(),prof.question_html);await p.locator('[data-choice="0"]').click();await p.locator('[data-rate=hard]').click();assert(await p.locator('[data-mode=due]').isDisabled());
  await p.clock.fastForward(86399000);await detail(p,c.id);assert(await p.locator('[data-mode=due]').isDisabled());await p.clock.fastForward(16000);await detail(p,c.id);assert.equal(await p.locator('[data-mode=due] small').innerText(),'1');
  console.log('PASS Professor question enters review after 10 minutes; rescheduling 1 day excludes it until its deadline');
  await p.evaluate(async id=>{const r=await StudyStorage.get('progress','reviews')||{};for(const k of Object.keys(r))delete r[k];r[id+':c1-001']={hard:true,due:Date.now()-1};r[id+':c1-002']={hard:true,due:Date.now()-1};await StudyStorage.put('progress',r,'reviews');},c.id);await p.reload();await ready(p);await detail(p,c.id);await p.locator('[data-mode=due]').click();await p.locator('[data-choice="0"]').click();await p.locator('[data-rate=hard]').click();await p.waitForFunction(()=>document.querySelector('.session-info')?.textContent.includes('QUESTION 1 / 1'));assert(await p.locator('[data-action=prev]').isDisabled());await p.locator('[data-choice="0"]').click();await p.locator('[data-rate=hard]').click();await p.waitForFunction(()=>document.querySelector('[data-mode=due]')?.disabled);console.log('PASS Reviewed cards leave the active due queue immediately, including back navigation');
  for(const c of courses){
   const combo=c.cards.find(q=>q.format==='combination');await position(p,c.id,combo.id);await detail(p,c.id);await p.locator('[data-mode=all]').click();assert.equal(await p.locator('.choice').count(),5);assert.deepEqual(await p.locator('.choice-letter').allTextContents(),['1','2','3','4','5']);await p.locator(`[data-choice="${combo.correct[0]}"]`).click();assert.equal(await p.locator('.result-label').innerText(),'Bonne réponse');
   for(const q of c.cards.filter(q=>q.format==='identification')){await position(p,c.id,q.id);await detail(p,c.id);await p.locator('[data-mode=all]').click();await p.waitForFunction(()=>document.querySelector('.question img')?.naturalWidth>0);await p.locator('.question img').click();assert(await p.locator('#figureViewer').isVisible());await p.locator('#figureViewer button').click();await p.locator(`[data-choice="${q.correct[0]}"]`).click();await p.waitForFunction(()=>document.querySelector('.answer img')?.naturalWidth>0);assert(await p.locator('.answer').isVisible());if(q.id===c.cards.at(-1).id){await p.screenshot({path:path.join(out,`c${c.number}-image-correction.png`)});}}
  }
  console.log('PASS All six courses: combination labels survive shuffle; all 12 PDF identifications and labelled corrections load and enlarge');assert.deepEqual(errors,[]);await ctx.close();
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
