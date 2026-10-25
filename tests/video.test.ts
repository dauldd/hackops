import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHmac} from 'node:crypto';
import {videoConfig,videoRequest,durationGuard,routerRequest} from '../src/lib/video/provider.ts';
import {verifyWebhook} from '../src/lib/video/webhook.ts';
import {prepareScript,validateScript,scriptEvidence,selectScriptSources,type VideoScript,type VideoSource} from '../src/lib/video/script.ts';
import {database} from '../src/lib/db.ts';
import {createVideo,getVideo,updateVideo,publicVideo,scriptDigest,reserveSubmission} from '../src/lib/video/store.ts';
import {decideVideo} from '../src/lib/video/review.ts';
import {refreshVideo} from '../src/lib/video/worker.ts';
const dir=await mkdtemp(join(tmpdir(),'velho-video-'));process.env.DATABASE_PATH=join(dir,'test.sqlite');process.env.VIDEO_STORAGE_PATH=join(dir,'videos');
process.env.OPENROUTER_API_KEY='test-secret';process.env.VIDEO_VOICE_ID='test-voice';process.env.PRESENTER_IMAGE_URL='https://example.com/photo.png';
const sources:VideoSource[]=[{id:'finding:a',title:'Work',text:'Your operations team reviews five hundred invoices each month using a single shared spreadsheet. Your finance team then manually reconciles every approved invoice against the main accounting ledger.',url:'https://example.com',classification:'verified',hiring:false,type:'finding'},{id:'proposal:0',title:'Intake',text:'connect invoice intake to accounting with human review.',url:null,classification:'proposed',hiring:false,type:'proposal'},{id:'chart:0:a',title:'Hours',text:'{"keyInsight":"twenty hours of monthly capacity","data":{"value":20}}',url:null,classification:'illustrative',hiring:false,type:'chart'}];
sources.push({...sources[0],id:'finding:b',title:'Finance',categories:['financials'],quote:'Reconcile approved invoices.',sourceDate:'2026-10-01'});
sources[0].categories=['operations'];
const script:VideoScript={thinEvidence:false,warning:null,sentences:[{kind:'intro',text:"Hi, I'm from Velho. This is about Example Oy.",sourceIds:[]},{kind:'fact',text:'Your operations team reviews five hundred invoices each month using a single shared spreadsheet.',sourceIds:['finding:a']},{kind:'fact',text:'Your finance team then manually reconciles every approved invoice against the main accounting ledger.',sourceIds:['finding:b']},{kind:'proposal',text:"We'd integrate invoice intake with accounting and keep a human review step.",sourceIds:['proposal:0']},{kind:'change',text:'In the illustrative scenario, twenty hours of monthly capacity could be possible.',sourceIds:['chart:0:a']},{kind:'close',text:'Which invoice reporting checks would you want to examine first?',sourceIds:['finding:a']}]};
test('grounded script validates; invented figures, source IDs, intro and hype fail',()=>{
 assert.deepEqual(validateScript(script,sources,'Example Oy').errors,[]);
 for(const mutate of [(s:VideoScript)=>{s.sentences[1].text=s.sentences[1].text.replace('five hundred','nine thousand');},(s:VideoScript)=>{s.sentences[1].sourceIds=['missing'];},(s:VideoScript)=>{s.sentences[0].text='Hello there.';},(s:VideoScript)=>{s.sentences[2].text+=' Revolutionary.';},(s:VideoScript)=>{s.sentences[4].text='You save twenty hours.';}]){const copy=structuredClone(script);mutate(copy);assert.equal(validateScript(copy,sources,'Example Oy').valid,false);}
 const copy=structuredClone(script);copy.sentences[1].text='You are inefficient.';assert.equal(validateScript(copy,sources,'Example Oy').valid,false);
});
test('webhook authenticates raw body, timestamp and HMAC',()=>{const raw='{"data":{"id":"a"}}',ts=String(Math.floor(Date.now()/1000));const signature=`t=${ts},v1=${createHmac('sha256','secret').update(`${ts},${raw}`).digest('hex')}`;assert.ok(verifyWebhook(raw,signature,'secret'));assert.ok(!verifyWebhook(raw+' ',signature,'secret'));assert.ok(!verifyWebhook(raw,signature,'wrong'));assert.ok(!verifyWebhook(raw,signature,'secret',Date.now()+301000));assert.ok(!verifyWebhook(raw,null,'secret'));});
test('text TTS mapping and advisory estimates; polling cannot exfiltrate key',async()=>{const config=videoConfig(),body=videoRequest('Spoken script','https://example.com/photo.png',config);assert.equal(body.prompt,'Spoken script');assert.equal(body.provider.options.heygen.voice_id,'test-voice');assert.ok(!('duration' in body));assert.ok('input_references' in body);assert.ok('input_references' in videoRequest('hello','image',config,'input_references'));assert.equal(durationGuard('word '.repeat(140),config).costTargetExceeded,true);assert.equal(durationGuard('word '.repeat(80),{...config,maxCost:0.1}).costTargetExceeded,true);await assert.rejects(routerRequest('https://attacker.example/api/v1/videos','key'),/Invalid/);});
test('headless submission, authenticated polling, MP4 storage and confirmed provider cost',async()=>{
 const db=database();for(const i of [1,2,3]){db.prepare('INSERT INTO company_research(id,requested_name,company_name,report,model,created_at) VALUES (?,?,?,?,?,?)').run(i,'Example Oy','Example Oy','{}','test','now');db.prepare('INSERT INTO research_runs(id,company_name,created_at,updated_at) VALUES (?,?,?,?)').run(String(i),'Example Oy','now','now');db.prepare('INSERT INTO company_visualizations(id,research_id,run_id,report,created_at) VALUES (?,?,?,?,?)').run(i,i,String(i),'{}','now');}
 const original=globalThis.fetch;const job=createVideo(1,1,sources,1);assert.equal(createVideo(1,1,sources,1).id,job.id);const parallel=createVideo(2,2,sources,1);assert.equal(parallel.status,'queued');updateVideo(parallel.id,{status:'declined'});

 const calls:string[]=[];
 globalThis.fetch=async(input,init)=>{const url=String(input);calls.push(url);assert.equal((init?.headers as Record<string,string>).Authorization,'Bearer test-secret');if(url.includes('/chat/completions'))return Response.json({choices:[{message:{content:JSON.stringify(script)}}]});if(init?.method==='POST'){const body=JSON.parse(String(init.body));assert.equal(body.prompt,script.sentences.map(s=>s.text).join(' '));return Response.json({id:'remote-id',polling_url:'https://openrouter.ai/api/v1/videos/remote-id',status:'queued'});}if(url.includes('/content?'))return new Response(new Uint8Array([0,0,0,24,102,116,121,112]),{headers:{'content-type':'video/mp4'}});return Response.json({id:'remote-id',status:'completed',usage:{cost:0.75}});};
 try{await refreshVideo(job.id);assert.equal(getVideo(job.id)?.status,'awaiting_confirmation');assert.equal(calls.length,1);await refreshVideo(job.id);assert.equal(calls.length,1);assert.throws(()=>decideVideo(job.id,'confirm','outdated-digest'),/changed/);decideVideo(job.id,'confirm',scriptDigest(getVideo(job.id)!));assert.throws(()=>decideVideo(job.id,'confirm',scriptDigest(getVideo(job.id)!)),/already/);await refreshVideo(job.id);const done=getVideo(job.id)!;assert.equal(done.status,'completed');assert.equal(done.confirmed_cost,0.75);assert.equal((await readFile(done.video_file_path!)).length,8);assert.equal(calls.length,4);assert.ok(publicVideo(done).videoUrl);}
 finally{globalThis.fetch=original;}
});
test('ambiguous paid submission is never resubmitted automatically',async()=>{const job=createVideo(3,3,[],1);updateVideo(job.id,{status:'submitted'});await refreshVideo(job.id);assert.equal(getVideo(job.id)?.status,'failed');assert.match(getVideo(job.id)?.error??'',/unknown/);});

test('editorial validation notes do not prevent script review or call the video provider',async()=>{
 const original=globalThis.fetch;const job=createVideo(2,2,sources,1);let calls=0;
 globalThis.fetch=async(input,init)=>{assert.ok(String(input).includes('/chat/completions'));calls++;const messages=JSON.parse(String(init?.body)).messages;assert.ok(messages.length>0);return Response.json({choices:[{message:{content:JSON.stringify({...script,sentences:[{kind:'intro',text:'Bad draft.',sourceIds:[]}]})}}]});};
 try{await refreshVideo(job.id);assert.equal(calls,1);assert.equal(getVideo(job.id)?.status,'awaiting_confirmation');assert.equal(getVideo(job.id)?.openrouter_job_id,null);assert.equal(JSON.parse(getVideo(job.id)!.validation_result!).valid,false);decideVideo(job.id,'decline',scriptDigest(getVideo(job.id)!));}finally{globalThis.fetch=original;}
});

test('legal-name parentheticals can be omitted without rejecting a grounded factual sentence',()=>{
 const copy=structuredClone(script),refs=structuredClone(sources);
 refs[0].text=refs[0].text.replace('Your operations team','Your operations team (internally called the processing team)');
 assert.equal(validateScript(copy,refs,'Example Oy').valid,true);
 copy.sentences[1].text=copy.sentences[1].text.replace('five hundred','nine thousand');
 assert.equal(validateScript(copy,refs,'Example Oy').valid,false);
});

test('word count is advisory for both short and long grounded drafts',()=>{
 const short=structuredClone(script);
 short.sentences[1].text='Your operations team reviews invoices.';
 short.sentences[2].text='Your finance team reconciles invoices.';
 const shortResult=validateScript(short,sources,'Example Oy');assert.equal(shortResult.valid,true);assert.equal(shortResult.wordCountInRange,false);assert.ok(shortResult.warnings.length);
 const long=structuredClone(script);long.sentences[1].text+=' '+script.sentences[1].text+' '+script.sentences[1].text;
 const result=validateScript(long,sources,'Example Oy');assert.equal(result.valid,true);assert.ok(result.wordCount>85);assert.equal(result.wordCountInRange,false);
});

test('combined observations are labelled inferred; unsupported claims, descriptions and copied proposals fail',()=>{
 const copy=structuredClone(script);
 copy.sentences[1]={kind:'inference',text:'Your spreadsheet invoice reviews and manual finance reconciliation suggest fragmented reporting workflows.',sourceIds:['finding:a','finding:b']};
 copy.sentences[2]={kind:'fact',text:'Your finance team then manually reconciles every approved invoice against the main accounting ledger.',sourceIds:['finding:b']};
 // Evaluate inference checks independently of the full script's word budget.
 assert.ok(!validateScript(copy,sources,'Example Oy').errors.some(e=>/grounded|inference/.test(e)));
 copy.sentences[1].text='Your spreadsheet invoice reviews and manual finance reconciliation prove fragmented reporting workflows.';
 assert.ok(validateScript(copy,sources,'Example Oy').errors.some(e=>e.includes('explicitly frame')));
 copy.sentences[1]={kind:'fact',text:'Example Oy is a Finnish technology company specializing in finance.',sourceIds:['finding:a']};
 assert.ok(validateScript(copy,sources,'Example Oy').errors.some(e=>e.includes('company descriptions')));
 copy.sentences[3].text="We'd connect invoice intake to accounting with human review.";
 assert.ok(validateScript(copy,sources,'Example Oy').errors.some(e=>e.includes('copying the full proposal')));
});
test('citations preserve actual URLs, dates, quotes and inference labels with source coverage',()=>{
 const copy=structuredClone(script);copy.sentences[1].kind='inference';
 const result=scriptEvidence(copy,sources,10);
 assert.equal(result.coverage.usedFindings,2);assert.equal(result.coverage.availableFindings,10);assert.equal(result.coverage.categoryCount,2);
 const citation=result.sentences[1].citations[0];assert.equal(citation.sourceUrl,'https://example.com');assert.equal(citation.label,'Inferred');assert.equal(citation.findingId,'a');
 assert.equal(result.sentences[2].citations[0].sourceDate,'2026-10-01');assert.equal(result.sentences[2].citations[0].verificationQuote,'Reconcile approved invoices.');
});

test('TTS preparation uses direct address and labels illustrative numbers without changing quantities',()=>{
 const copy=structuredClone(script);
 copy.sentences[1].text='Example Oy reviews five hundred invoices each month using a single shared spreadsheet.';
 copy.sentences[2].text='Example Oy manually reconciles every approved invoice against the main accounting ledger.';
 copy.sentences[4].text='If the scenario is adopted, you could release twenty hours of monthly capacity.';
 const prepared=prepareScript(copy,'Example Oy',sources);
 assert.equal(prepared.sentences.map(s=>s.text).join(' ').split('Example Oy').length-1,1);
 assert.match(prepared.sentences[1].text,/^You review/);
 assert.match(prepared.sentences[4].text,/illustrative scenario/);
 assert.match(prepared.sentences[4].text,/twenty hours/);
});

test('source selection includes measured partner cases rather than only jobs linked to proposals',()=>{
 const google:VideoSource={id:'finding:google',title:'Example case study | Google Cloud',sourceType:'vendor_case_study',text:'Google Cloud case reports four hours each week and 15 hours per marketer per month saved.',quote:'15 hours per marketer per month saved.',url:'https://cloud.google.com/customers/example',classification:'verified',hiring:false,type:'finding',categories:['operations']};
 const selected=selectScriptSources([...sources,{...sources[0],id:'finding:hiring',hiring:true},google]);assert.ok(selected.some(s=>s.id===google.id));
});
test('decline prevents submission, including worker restarts',async()=>{
 const job=createVideo(2,2,sources,1);updateVideo(job.id,{status:'awaiting_confirmation',script_text:script.sentences.map(s=>s.text).join(' '),script_references:JSON.stringify(script)});
 const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('Must not call provider');};
 try{decideVideo(job.id,'decline',scriptDigest(getVideo(job.id)!));await refreshVideo(job.id);assert.equal(calls,0);assert.equal(getVideo(job.id)?.status,'declined');}finally{globalThis.fetch=original;}
});
test('legacy unapproved script_ready jobs cannot submit',async()=>{
 const job=createVideo(2,2,sources,1);updateVideo(job.id,{status:'script_ready',script_text:script.sentences.map(s=>s.text).join(' '),script_references:JSON.stringify(script)});
 const original=globalThis.fetch;globalThis.fetch=async()=>{throw Error('Must not call provider');};
 try{await refreshVideo(job.id);assert.equal(getVideo(job.id)?.status,'awaiting_confirmation');decideVideo(job.id,'decline',scriptDigest(getVideo(job.id)!));}finally{globalThis.fetch=original;}
});

test('confirmation accepts grounded scripts on either side of the word target',async()=>{
 const oldSeconds=process.env.VIDEO_MAX_SECONDS,oldCost=process.env.VIDEO_MAX_COST_USD;
 process.env.VIDEO_MAX_SECONDS='45';process.env.VIDEO_MAX_COST_USD='3';
 try{
 for(const variant of ['short','long']){
 const draft=structuredClone(script);
 if(variant==='short'){draft.sentences[1].text='Your operations team reviews invoices.';draft.sentences[2].text='Your finance team reconciles invoices.';}
 else draft.sentences[1].text+=' '+script.sentences[1].text+' '+script.sentences[1].text;
 const validation=validateScript(draft,sources,'Example Oy');assert.ok(validation.valid);assert.equal(validation.wordCountInRange,false);
 const job=createVideo(2,2,sources,1);updateVideo(job.id,{status:'awaiting_confirmation',script_text:draft.sentences.map(s=>s.text).join(' '),script_references:JSON.stringify(draft)});
 decideVideo(job.id,'confirm',scriptDigest(getVideo(job.id)!));assert.equal(getVideo(job.id)?.status,'script_ready');assert.ok(getVideo(job.id)?.approved_at);
 // Test-only cleanup: do not invoke the worker or submit a video.
 updateVideo(job.id,{status:'completed'});
 }
 }finally{if(oldSeconds===undefined)delete process.env.VIDEO_MAX_SECONDS;else process.env.VIDEO_MAX_SECONDS=oldSeconds;if(oldCost===undefined)delete process.env.VIDEO_MAX_COST_USD;else process.env.VIDEO_MAX_COST_USD=oldCost;}
});
test('changing an approved draft invalidates approval before a paid call',async()=>{
 const job=createVideo(2,2,sources,1);updateVideo(job.id,{status:'awaiting_confirmation',script_text:script.sentences.map(s=>s.text).join(' '),script_references:JSON.stringify(script)});
 decideVideo(job.id,'confirm',scriptDigest(getVideo(job.id)!));updateVideo(job.id,{script_text:'Changed draft.'});
 const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('Must not call provider');};
 try{await refreshVideo(job.id);assert.equal(calls,0);assert.equal(getVideo(job.id)?.status,'awaiting_confirmation');assert.equal(getVideo(job.id)?.approved_at,null);decideVideo(job.id,'decline',scriptDigest(getVideo(job.id)!));}finally{globalThis.fetch=original;}
});

test('94-word draft estimates 47 seconds and remains confirmable within the spend limit',()=>{
 const config={...videoConfig(),maxSeconds:45,maxCost:3};
 const estimate=durationGuard('word '.repeat(94),config);
 assert.equal(estimate.seconds,47);assert.equal(estimate.cost,2.35);assert.equal(estimate.durationTargetExceeded,true);
 assert.doesNotThrow(()=>durationGuard('word '.repeat(94),{...config,maxSeconds:1}));
 assert.equal(durationGuard('word '.repeat(94),{...config,maxCost:2}).costTargetExceeded,true);
});

test('confirmed editorial and spend warnings never block the exact approved draft',async()=>{
 const draft=structuredClone(script);draft.sentences[1].text='Your operations team reviews nine thousand invoices each month.';
 const job=createVideo(2,2,sources,1);updateVideo(job.id,{status:'awaiting_confirmation',script_text:draft.sentences.map(s=>s.text).join(' '),script_references:JSON.stringify(draft)});
 const previous=process.env.VIDEO_MAX_COST_USD;process.env.VIDEO_MAX_COST_USD='0.01';
 try{decideVideo(job.id,'confirm',scriptDigest(getVideo(job.id)!));assert.equal(getVideo(job.id)?.status,'script_ready');assert.equal(JSON.parse(getVideo(job.id)!.validation_result!).valid,false);assert.ok(getVideo(job.id)!.estimated_cost!>0.01);
 const original=globalThis.fetch;let submitted=false;
 globalThis.fetch=async(input,init)=>{if(init?.method==='POST'){submitted=true;assert.equal(JSON.parse(String(init.body)).prompt,draft.sentences.map(s=>s.text).join(' '));return Response.json({id:'confirmed-warning-fixture',polling_url:'https://openrouter.ai/api/v1/videos/confirmed-warning-fixture'});}if(String(input).includes('/content?'))return new Response(new Uint8Array([0,0,0,24,102,116,121,112]));return Response.json({status:'completed'});};
 try{await refreshVideo(job.id);assert.ok(submitted);assert.equal(getVideo(job.id)?.status,'completed');}finally{globalThis.fetch=original;}}finally{if(previous===undefined)delete process.env.VIDEO_MAX_COST_USD;else process.env.VIDEO_MAX_COST_USD=previous;}
});
test('confirmed drafts queue for a render slot rather than rejecting Confirm',()=>{
 const first=createVideo(1,1,sources,1);updateVideo(first.id,{status:'processing',openrouter_job_id:'slot-fixture'});
 const second=createVideo(2,2,sources,1);updateVideo(second.id,{status:'awaiting_confirmation',script_text:script.sentences.map(s=>s.text).join(' '),script_references:JSON.stringify(script)});
 decideVideo(second.id,'confirm',scriptDigest(getVideo(second.id)!));assert.equal(getVideo(second.id)?.status,'script_ready');assert.equal(reserveSubmission(second.id,1,2),false);
 updateVideo(first.id,{status:'completed'});assert.equal(reserveSubmission(second.id,1,2),true);updateVideo(second.id,{status:'completed'});
});
