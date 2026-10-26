// Run after adding a course entry or editing a pack. --check makes no changes.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),file=path.join(root,'catalog.json'),catalog=JSON.parse(fs.readFileSync(file)),check=process.argv.includes('--check');
const ids=new Set();
const sourceFile=require('./course-source.cjs');
assert.equal(catalog.schema,1);assert(Number.isInteger(catalog.catalog_version));
for(const m of catalog.courses){
 assert(!ids.has(m.id),'Duplicate course ID');ids.add(m.id);
 const p=sourceFile(m.id);
 const bytes=fs.readFileSync(p),c=JSON.parse(bytes);assert.equal(c.schema,1);assert.equal(c.id,m.id);assert(Number.isInteger(c.version)&&c.version>0);assert(c.cards.length);
 const cardIds=new Set();for(const card of c.cards){assert(card.id&&!cardIds.has(card.id),'Duplicate/missing card ID');cardIds.add(card.id);assert(card.question_html?.trim()&&card.answer_html?.trim()&&card.source,'Missing question, answer or source');
 for(const html of [card.question_html,card.answer_html]){assert(!/<(?:script|iframe|object|style)\b|\bon\w+\s*=/i.test(html),'Active HTML prohibited');for(const match of html.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["']/gi)){assert(!/^(?:[a-z]+:|\/\/)/i.test(match[1]),'Images must be local');const img=path.resolve(root,match[1]);assert(img.startsWith(root+path.sep)&&fs.existsSync(img),'Missing image');assert(/\.(png|jpe?g|webp|gif)$/i.test(img),'Unsupported image');}}
 }
 const computed={version:c.version,title:c.title,subtitle:c.subtitle,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),card_count:c.cards.length,exam_count:c.cards.filter(c=>c.exam).length,qcm_count:c.cards.filter(c=>c.prof_question||c.qcm).length};
 if(check)for(const [k,v]of Object.entries(computed))assert.equal(m[k],v,`${m.id}: incorrect ${k}`);else Object.assign(m,computed);
 console.log(`${m.id}: ${c.cards.length} cards validated`);
}
if(!check){catalog.catalog_version++;catalog.updated_at=new Date().toISOString();fs.writeFileSync(file,JSON.stringify(catalog,null,2)+'\n');console.log('Catalogue updated. Commit it together with the course packs and images.');}
