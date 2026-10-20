const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),catalog=JSON.parse(fs.readFileSync(path.join(root,'catalog.json')));
assert.equal(catalog.courses.length,6);
let total=0,prof=0,multi=0,images=0;
for(const m of catalog.courses){
 const c=JSON.parse(fs.readFileSync(path.join(root,m.url))),docs=new Map(c.documents.map(d=>[d.id,d]));
 for(const card of c.cards){
  assert(card.choices?.length>=2,card.id);assert(card.correct.length>=1&&card.correct.length<card.choices.length,card.id);
  assert.equal(new Set(card.choices).size,card.choices.length,card.id);
  assert(card.choices.every(x=>x.length<=160),'Keep options short: '+card.id);
  assert(card.correct.every(i=>Number.isInteger(i)&&i>=0&&i<card.choices.length),card.id);
  assert.equal(card.short_answer,card.correct.map(i=>card.choices[i]).join(' ; '));
  assert(card.references.length,card.id);
  for(const r of card.references){assert(docs.has(r.document),r.document);assert(r.pages.every(p=>p>=1&&p<=docs.get(r.document).page_count),card.id);}
  if(card.priority_basis==='Étoile rouge')assert(card.exam);
  if(card.prof_question)prof++;
  if(card.type==='multiple'){multi++;assert(card.correct.length>1);}
  if(/<img\b/.test(card.question_html))images++;
  if(c.number===6&&card.section==='Complément hors examen')assert.equal(card.exam,false);
 }
 total+=c.cards.length;
}
assert(total>=350);assert(prof>=20);assert(multi>=2);assert(images>=5);
console.log(`PASS Content: ${total} questions, ${prof} professor questions, ${multi} multiple-answer questions, ${images} diagram questions; references and short choices checked`);
