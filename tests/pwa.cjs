// Real Chromium + service worker + IndexedDB, with a controllable HTTP server.
const {chromium} = require('playwright');
const fs=require('fs'), path=require('path'), http=require('http'), crypto=require('crypto'), assert=require('assert/strict');
const root=path.resolve(__dirname,'..'), out=process.env.STUDYHUB_TEST_OUTPUT||path.join(root,'test-results');
fs.mkdirSync(out,{recursive:true});
const original=JSON.parse(fs.readFileSync(path.join(root,'catalog.json')));
const pack=JSON.parse(fs.readFileSync(path.join(root,'gbm3000-cardio-1a.json')));
let scenario='normal', remote=structuredClone(original), packs=new Map(), failImages=false;
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost'), rel=decodeURIComponent(url.pathname).replace(/^\/Study-hub\//,'');
 res.setHeader('Cache-Control','no-store');
 if(scenario==='server-error'&&rel.endsWith('.json')){res.writeHead(503);return res.end('temporarily unavailable');}
 if(rel==='catalog.json'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(remote));}
 if(packs.has(rel)){res.setHeader('Content-Type','application/json');return res.end(packs.get(rel));}
 if(failImages&&rel==='fixture-image.png'){res.writeHead(503);return res.end('broken image');}
 const file=path.resolve(root,rel==='fixture-image.png'?'icon-192.png':rel||'index.html');
 if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 try{res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end('missing');}
});
const report=[];
const pass=s=>{report.push(s);console.log('PASS',s);};
function publish(course,version,filename='gbm3000-cardio-1a.json'){
 const bytes=JSON.stringify(course);packs.set(filename,bytes);
 const m={...original.courses[0],id:course.id,title:course.title,version:course.version,url:'./'+filename,card_count:course.cards.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
 remote={...original,catalog_version:version,courses:[m]};return m;
}
async function ready(page){await page.locator('.tile-footer').filter({hasText:'Disponible sans Internet'}).first().waitFor();await page.locator('.sync-button:not([disabled])').waitFor();}
async function sync(page){await page.locator('[data-action=sync]').click();await page.locator('.sync-button:not([disabled])').waitFor();}
async function stored(page,id=pack.id){return page.evaluate(id=>StudyStorage.get('courses',id),id);}
async function noOverflow(page){assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight||document.documentElement.scrollWidth>innerWidth),false);}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const url=`http://127.0.0.1:${server.address().port}/Study-hub/`;
 const browser=await chromium.launch({channel:process.env.STUDYHUB_BROWSER||'chrome',headless:true});
 const errors=[];
 try{
  const context=await browser.newContext({viewport:{width:1365,height:1100},deviceScaleFactor:1});
  let page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);await ready(page);
  assert.equal((await stored(page)).course.cards.length,59);await noOverflow(page);
  await page.screenshot({path:path.join(out,'desktop.png')});
  pass('First install: 59 cards persisted, complete app shell cached and controlled');
  await page.locator('[data-mode=exam]').click();assert.match(await page.locator('.session-info').innerText(),/36/);
  assert.equal(await page.locator('#answer').isVisible(),false);
  await page.locator('[data-action=reveal]').click();assert.equal(await page.locator('#answer').isVisible(),true);
  await page.locator('[data-action=reveal]').click();assert.equal(await page.locator('#answer').isVisible(),false);
  await page.locator('[data-action=mark]').click();await page.locator('[aria-pressed=true]').waitFor();
  await page.locator('[data-action=next]').click();assert.match(await page.locator('.session-info').innerText(),/02/);
  await page.locator('[data-action=prev]').click();assert.match(await page.locator('.session-info').innerText(),/01/);
  await page.locator('[data-action=reveal]').click();await page.locator('[data-rate=good]').click();
  await page.waitForFunction(()=>document.querySelector('.session-info')?.textContent.includes('02'));
  await page.locator('[data-action=home]').click();await page.locator('[data-mode=qcm]').click();assert.match(await page.locator('.session-info').innerText(),/6/);
  await page.locator('[data-action=home]').click();await page.locator('[data-mode=all]').click();assert.match(await page.locator('.session-info').innerText(),/59/);
  await page.locator('[data-action=mark]').click();await page.locator('[aria-pressed=true]').waitFor();
  await page.locator('[data-action=home]').click();await page.locator('[data-mode=hard]').click();assert.match(await page.locator('.session-info').innerText(),/1/);
  await page.locator('[data-action=home]').click();
  pass('Exam / all / professor QCM / difficult modes, reveal/hide, navigation, ratings and home');
  await page.locator('#search').fill('introuvable');assert.equal(await page.locator('.course-tile').count(),0);await page.locator('#search').fill('cardio');assert.equal(await page.locator('.course-tile').count(),1);await page.locator('#search').fill('');
  const download=page.waitForEvent('download');await page.locator('[data-action=export]').click();assert.equal((await download).suggestedFilename(),'studyhub-progression.json');
  pass('Search and progression backup export');
  await context.setOffline(true);await page.reload();await ready(page);
  await page.locator('[data-mode=exam]').click();assert.match(await page.locator('.session-info').innerText(),/02/);
  await page.locator('[data-action=reveal]').click();assert.equal(await page.locator('#answer').isVisible(),true);
  await page.close();page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(url);await ready(page);
  assert.equal((await stored(page)).course.cards.length,59);
  pass('Network disabled: reload, close/reopen, all data, answers and saved position survive');
  await context.setOffline(false);await ready(page);scenario='server-error';await sync(page);
  assert.equal((await stored(page)).course.version,1);await page.locator('[data-mode=all]').click();await page.locator('[data-action=reveal]').click();assert.equal(await page.locator('#answer').isVisible(),true);await page.locator('[data-action=home]').click();
  pass('HTTP 503 preserves usable local courses');
  scenario='normal';let modified=structuredClone(pack);modified.version=2;modified.cards[0].answer_html+=' <b>TEST UPDATE</b>';publish(modified,2);
  packs.set('gbm3000-cardio-1a.json','{"partial":');await sync(page);assert.equal((await stored(page)).course.version,1);
  pass('Truncated download rejected; previous course snapshot retained');
  publish(modified,2);await sync(page);assert.equal((await stored(page)).course.version,2);
  assert.equal(await page.evaluate(()=>StudyStorage.get('progress','reviews').then(r=>r['gbm3000-cardio-1a:card-001'].interval)),3);
  pass('Valid course update commits and preserves card-level progress');
  modified=structuredClone(modified);modified.version=3;modified.cards[0].question_html+='<img src="./fixture-image.png" alt="Test diagram">';publish(modified,3);failImages=true;
  await sync(page);assert.equal((await stored(page)).course.version,2);
  failImages=false;await sync(page);assert.equal((await stored(page)).course.version,3);
  await context.setOffline(true);await page.reload();await ready(page);await page.locator('[data-mode=all]').click();
  await page.waitForFunction(()=>{const i=document.querySelector('.question img');return i?.complete&&i.naturalWidth>0});
  pass('Failed image aborts whole update; complete image pack renders after offline reload');
  await page.locator('[data-action=home]').click();await context.setOffline(false);await ready(page);
  const second={...structuredClone(pack),id:'test-new-course',title:'TEST · Nouveau cours'};
  const firstMeta=remote.courses[0];const secondMeta=publish(second,4,'new-course.json');remote.courses=[firstMeta,secondMeta];
  await context.setOffline(true);await context.setOffline(false);await page.locator('.course-tile').nth(1).waitFor();await ready(page);assert.equal((await stored(page,'test-new-course')).course.id,'test-new-course');
  pass('Connection return automatically discovers and downloads a newly published course');
  remote={...original,catalog_version:5,courses:[]};await sync(page);assert.equal(await page.locator('.course-tile').count(),2);
  pass('Catalogue removal does not delete downloaded courses');
  remote=structuredClone(original);packs.clear();
  const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
  const phone=await mobile.newPage();phone.on('pageerror',e=>errors.push(e.message));await phone.goto(url);await ready(phone);await noOverflow(phone);await phone.screenshot({path:path.join(out,'iphone-library.png')});
  await phone.locator('[data-mode=exam]').click();await noOverflow(phone);await phone.screenshot({path:path.join(out,'iphone-question.png')});
  await phone.locator('[data-action=reveal]').click();await noOverflow(phone);await phone.screenshot({path:path.join(out,'iphone-answer.png')});
  for(const viewport of [{width:320,height:568},{width:844,height:390}]){await phone.setViewportSize(viewport);await noOverflow(phone);const box=await phone.locator('[data-action=next]').boundingBox();assert(box.y+box.height<=viewport.height);}
  await phone.setViewportSize({width:390,height:844});await phone.locator('[data-action=home]').click();await phone.locator('[data-mode=qcm]').click();await noOverflow(phone);await phone.screenshot({path:path.join(out,'iphone-qcm.png')});
  pass('Mobile 390×844, small 320×568 and landscape 844×390: no page overflow, navigation remains visible');
  assert.deepEqual(errors,[]);pass('No uncaught JavaScript errors');
  await mobile.close();await context.close();
 }finally{await browser.close();server.close();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
