import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHmac} from 'node:crypto';
import {videoConfig,videoRequest,durationGuard,routerRequest} from '../src/lib/video/provider.ts';
import {verifyWebhook} from '../src/lib/video/webhook.ts';
import {validateScript,type VideoScript,type VideoSource} from '../src/lib/video/script.ts';
import {database} from '../src/lib/db.ts';
import {createVideo,getVideo,updateVideo,publicVideo} from '../src/lib/video/store.ts';
import {refreshVideo} from '../src/lib/video/worker.ts';
const dir=await mkdtemp(join(tmpdir(),'velho-video-'));process.env.DATABASE_PATH=join(dir,'test.sqlite');process.env.VIDEO_STORAGE_PATH=join(dir,'videos');
process.env.OPENROUTER_API_KEY='test-secret';process.env.VIDEO_VOICE_ID='test-voice';process.env.PRESENTER_IMAGE_URL='https://example.com/photo.png';
const sources:VideoSource[]=[{id:'finding:a',title:'Work',text:'Your operations team reviews five hundred invoices each month using a single shared spreadsheet. Your finance team then manually reconciles every approved invoice against the main accounting ledger.',url:'https://example.com',classification:'verified',hiring:false,type:'finding'},{id:'proposal:0',title:'Intake',text:'connect invoice intake to accounting with human review.',url:null,classification:'proposed',hiring:false,type:'proposal'},{id:'chart:0:a',title:'Hours',text:'{"keyInsight":"twenty hours of monthly capacity","data":{"value":20}}',url:null,classification:'illustrative',hiring:false,type:'chart'}];
const script:VideoScript={thinEvidence:false,warning:null,sentences:[{kind:'intro',text:"Hi, I'm an AI presenter from Velho. This observation is for Example Oy.",sourceIds:[]},{kind:'fact',text:'Your operations team reviews five hundred invoices each month using a single shared spreadsheet.',sourceIds:['finding:a']},{kind:'fact',text:'Your finance team then manually reconciles every approved invoice against the main accounting ledger.',sourceIds:['finding:a']},{kind:'proposal',text:'Velho would connect invoice intake to accounting with human review.',sourceIds:['proposal:0']},{kind:'change',text:'In that scenario, twenty hours of monthly capacity could be possible.',sourceIds:['chart:0:a']},{kind:'close',text:'If useful, we can share the full analysis.',sourceIds:[]}]};
test('grounded script validates; invented figures, source IDs, disclosure and hype fail',()=>{
 assert.deepEqual(validateScript(script,sources,'Example Oy').errors,[]);
 for(const mutate of [(s:VideoScript)=>{s.sentences[1].text=s.sentences[1].text.replace('five hundred','nine thousand');},(s:VideoScript)=>{s.sentences[1].sourceIds=['missing'];},(s:VideoScript)=>{s.sentences[0].text='Hello there.';},(s:VideoScript)=>{s.sentences[2].text+=' Revolutionary.';},(s:VideoScript)=>{s.sentences[4].text='You save twenty hours.';}]){const copy=structuredClone(script);mutate(copy);assert.equal(validateScript(copy,sources,'Example Oy').valid,false);}
 const copy=structuredClone(script);copy.sentences[1].text='You are inefficient.';assert.equal(validateScript(copy,sources,'Example Oy').valid,false);
});
test('webhook authenticates raw body, timestamp and HMAC',()=>{const raw='{"data":{"id":"a"}}',ts=String(Math.floor(Date.now()/1000));const signature=`t=${ts},v1=${createHmac('sha256','secret').update(`${ts},${raw}`).digest('hex')}`;assert.ok(verifyWebhook(raw,signature,'secret'));assert.ok(!verifyWebhook(raw+' ',signature,'secret'));assert.ok(!verifyWebhook(raw,signature,'wrong'));assert.ok(!verifyWebhook(raw,signature,'secret',Date.now()+301000));assert.ok(!verifyWebhook(raw,null,'secret'));});
test('text TTS mapping and hard estimate cap; polling cannot exfiltrate key',async()=>{const config=videoConfig(),body=videoRequest('Spoken script','https://example.com/photo.png',config);assert.equal(body.prompt,'Spoken script');assert.equal(body.provider.options.heygen.parameters.voice_id,'test-voice');assert.ok(!('duration' in body));assert.ok('frame_images' in body);assert.ok('input_references' in videoRequest('hello','image',config,'input_references'));assert.throws(()=>durationGuard('word '.repeat(100),config),/exceeds/);assert.throws(()=>durationGuard('word '.repeat(80),{...config,maxCost:0.1}),/exceeds/);await assert.rejects(routerRequest('https://attacker.example/api/v1/videos','key'),/Invalid/);});
test('headless submission, authenticated polling, MP4 storage and confirmed provider cost',async()=>{
 const db=database();for(const i of [1,2,3]){db.prepare('INSERT INTO company_research(id,requested_name,company_name,report,model,created_at) VALUES (?,?,?,?,?,?)').run(i,'Example Oy','Example Oy','{}','test','now');db.prepare('INSERT INTO research_runs(id,company_name,created_at,updated_at) VALUES (?,?,?,?)').run(String(i),'Example Oy','now','now');db.prepare('INSERT INTO company_visualizations(id,research_id,run_id,report,created_at) VALUES (?,?,?,?,?)').run(i,i,String(i),'{}','now');}
 const original=globalThis.fetch;const job=createVideo(1,1,sources,1);assert.equal(createVideo(1,1,sources,1).id,job.id);assert.throws(()=>createVideo(2,2,sources,1),/concurrency/);

 const calls:string[]=[];
 globalThis.fetch=async(input,init)=>{const url=String(input);calls.push(url);assert.equal((init?.headers as Record<string,string>).Authorization,'Bearer test-secret');if(url.includes('/chat/completions'))return Response.json({choices:[{message:{content:JSON.stringify(script)}}]});if(init?.method==='POST'){const body=JSON.parse(String(init.body));assert.equal(body.prompt,script.sentences.map(s=>s.text).join(' '));return Response.json({id:'remote-id',polling_url:'https://openrouter.ai/api/v1/videos/remote-id',status:'queued'});}if(url.includes('/content?'))return new Response(new Uint8Array([0,0,0,24,102,116,121,112]),{headers:{'content-type':'video/mp4'}});return Response.json({id:'remote-id',status:'completed',usage:{cost:0.75}});};
 try{await refreshVideo(job.id);const done=getVideo(job.id)!;assert.equal(done.status,'completed');assert.equal(done.confirmed_cost,0.75);assert.equal((await readFile(done.video_file_path!)).length,8);assert.equal(calls.length,4);assert.ok(publicVideo(done).videoUrl);}
 finally{globalThis.fetch=original;}
});
test('ambiguous paid submission is never resubmitted automatically',async()=>{const job=createVideo(3,3,[],1);updateVideo(job.id,{status:'submitted'});await refreshVideo(job.id);assert.equal(getVideo(job.id)?.status,'failed');assert.match(getVideo(job.id)?.error??'',/unknown/);});

test('invalid generated script is retried once and never submitted to video',async()=>{
 const original=globalThis.fetch;const job=createVideo(2,2,sources,1);let calls=0;
 globalThis.fetch=async(input,init)=>{assert.ok(String(input).includes('/chat/completions'));calls++;const messages=JSON.parse(String(init?.body)).messages;if(calls===2)assert.match(messages.at(-1).content,/validationErrors/);return Response.json({choices:[{message:{content:JSON.stringify({...script,sentences:[{kind:'intro',text:'Bad draft.',sourceIds:[]}]})}}]});};
 try{await refreshVideo(job.id);assert.equal(calls,2);assert.equal(getVideo(job.id)?.status,'failed_validation');assert.equal(getVideo(job.id)?.openrouter_job_id,null);}finally{globalThis.fetch=original;}
});
