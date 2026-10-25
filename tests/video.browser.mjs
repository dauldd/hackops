// Uses an existing saved report; mocks every generation/decision request. No video is generated.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.VIDEO_TEST_BASE_URL||'http://127.0.0.1:3100';
const company=Number(process.env.VIDEO_TEST_RESEARCH_ID||10);
const response=await fetch(`${base}/api/research/${company}/videos`);assert.ok(response.ok);
const original=(await response.json()).results.find(job=>job.script);assert.ok(original,'The saved report needs an existing script fixture.');
const completed=(await (await fetch(`${base}/api/research/11/videos`)).json()).results.find(job=>job.videoUrl);
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let phase='initial',draft=null,started=0,confirmed=0,declined=0;
 await page.route('https://openrouter.ai/**',()=>{throw Error('Browser must not call OpenRouter.');});
 function makeDraft(short){
 const result=structuredClone(original);result.id='mock-script-review';result.status='awaiting_confirmation';result.error=null;result.videoUrl=null;result.confirmedCost=null;
 if(short){result.script.sentences=result.script.sentences.slice(0,4);result.script.sentences[1].text='Your Google Cloud case reports four hours of weekly reporting.';result.script.sentences[2].text='It reports over fifteen hours saved per marketer each month.';result.script.sentences[3].text='Which reporting handoffs would you examine next?';}
 else while(result.script.sentences.map(s=>s.text).join(' ').split(/\s+/).length<=85)result.script.sentences[1].text+=' '+original.script.sentences[1].text;
 result.scriptText=result.script.sentences.map(s=>s.text).join(' ');const count=result.scriptText.split(/\s+/).length;result.validation={valid:false,errors:['Advisory source wording note.'],warnings:['Advisory duration and cost note.'],wordCount:count,wordCountInRange:count>=70&&count<=85};result.scriptDigest=createHash('sha256').update(result.scriptText).digest('hex');return result;
 }
 await page.route(`**/api/research/${company}/videos`,async route=>{
 if(route.request().method()==='POST'){started++;draft=makeDraft(started===2);phase='review';return route.fulfill({status:202,json:{...draft,status:'queued'}});}
 const current=phase==='initial'?null:phase==='declined'?{...draft,status:'declined'}:phase==='completed'?{...draft,status:'completed',confirmedCost:2.321,videoUrl:completed?.videoUrl??'/mock-video.mp4'}:draft;
 return route.fulfill({json:{results:current?[current]:[]}});
 });
 await page.route('**/api/videos/mock-script-review/decision',async route=>{
 const body=route.request().postDataJSON();assert.equal(body.scriptDigest,draft.scriptDigest);
 if(body.decision==='decline'){declined++;phase='declined';return route.fulfill({json:{...draft,status:'declined'}});}
 assert.equal(body.decision,'confirm');confirmed++;phase='completed';return route.fulfill({json:{...draft,status:'processing'}});
 });
 await page.goto(`${base}/research`);await page.locator(`article[data-research-id="${company}"] button`).click();
 const card=page.locator('.video-presenter');await card.getByRole('heading',{name:'AI presenter · Velho'}).waitFor();
 const generate=card.getByRole('button',{name:'Generate video pitch',exact:true});await generate.click();
 await card.getByRole('button',{name:'Confirm',exact:true}).waitFor({timeout:20000});
 assert.ok(draft.validation.wordCount>85);assert.ok(await card.getByRole('button',{name:'Confirm',exact:true}).isEnabled());
 await card.locator('summary').filter({hasText:'Script and supporting sources'}).click();
 const links=await card.locator('.video-citation a').evaluateAll(nodes=>nodes.map(n=>n.href));assert.ok(links.some(link=>link.includes('cloud.google.com')));assert.ok(links.every(link=>!link.includes('localhost')));
 await card.getByRole('button',{name:'Decline',exact:true}).click();await generate.waitFor();await page.waitForFunction(()=>!document.querySelector('.presenter-action>button')?.disabled);
 assert.equal(declined,1);assert.equal(confirmed,0);assert.equal(await card.locator('video').count(),0);
 await generate.click();await card.getByRole('button',{name:'Confirm',exact:true}).waitFor({timeout:20000});assert.ok(draft.validation.wordCount<70);
 await card.getByRole('button',{name:'Confirm',exact:true}).click();await card.locator('video').waitFor({timeout:20000});
 assert.equal(await page.locator('.video-presenter').count(),1);
 assert.equal(await card.locator('video').count(),1);
 await card.locator('.video-costs summary').waitFor();
 assert.equal(await card.locator('.video-costs').evaluate(node=>node.open),false);
 await page.waitForTimeout(11000);
 assert.equal(await card.locator('video').count(),1,'Polling must not duplicate the player when costs are present.');
 await card.locator('.video-costs summary').click();
 assert.match(await card.locator('.video-costs').innerText(),/2.3210/);
 const dashboard=await page.locator('.visualization-panel').boundingBox(),box=await card.boundingBox();assert.ok(box.y>=dashboard.y+dashboard.height);
 assert.equal(started,2);assert.equal(confirmed,1);assert.equal(declined,1);assert.deepEqual(errors,[]);
 console.log('PASS: overlong draft can be declined, short draft can be confirmed, per-draft digest sent, external Google citations visible, player below dashboard; all generation/decision requests mocked.');
}finally{await browser.close();}
