import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {database, usesD1} from '../src/lib/database.ts';
import {insertNote, listNotes, deleteNote, createResearchRun, appendResearchLog, getResearchRun, finishResearchRun} from '../src/lib/db.ts';
import {createVideo, getVideo, updateVideo, reserveSubmission, scriptDigest} from '../src/lib/video/store.ts';
import {decideVideo} from '../src/lib/video/review.ts';
import {refreshVideo} from '../src/lib/video/worker.ts';

// Exercise the actual HTTP adapter against an in-memory SQLite stand-in for D1.
process.env.CLOUDFLARE_ACCOUNT_ID='test-account';
process.env.CLOUDFLARE_D1_DATABASE_ID='test-database';
process.env.CLOUDFLARE_API_TOKEN='test-token';
process.env.OPENROUTER_API_KEY='test-router-key';
process.env.VIDEO_VOICE_ID='test-voice';
process.env.PRESENTER_IMAGE_URL='https://example.com/presenter.png';
const sqlite=new DatabaseSync(':memory:');
const originalFetch=globalThis.fetch;
let requests=0, failNext=false, contentDownloads=0;
globalThis.fetch=async (input,init)=>{
 const url=String(input);
 if(url.startsWith('https://openrouter.ai/')){
 if(url.includes('/content'))contentDownloads++;
 return Response.json({status:'completed',usage:{cost:0.75}});
 }
 requests++;
 assert.equal(url,'https://api.cloudflare.com/client/v4/accounts/test-account/d1/database/test-database/query');
 assert.equal((init?.headers as Record<string,string>).Authorization,'Bearer test-token');
 assert.equal(init?.cache,'no-store');
 if(failNext){failNext=false;return Response.json({success:false,errors:[{message:'test outage'}]},{status:503});}
 const body=JSON.parse(String(init?.body));
 assert.ok(Array.isArray(body.batch));
 sqlite.exec('BEGIN');
 try{
 const result=body.batch.map(({sql,params=[]}:{sql:string;params?: (string|number|null)[]})=>{
 const stmt=sqlite.prepare(sql);
 const results=stmt.all(...params);
 const meta=sqlite.prepare('SELECT changes() AS changes, last_insert_rowid() AS last_row_id').get();
 return {success:true,results,meta};
 });
 sqlite.exec('COMMIT');
 return Response.json({success:true,result});
 }catch(error){sqlite.exec('ROLLBACK');throw error;}
};

test('D1 initialization retries after failure and notes persist through HTTP',async()=>{
 failNext=true;
 await assert.rejects(listNotes(),/D1 query failed \(503\): test outage/);
 await insertNote('Saved in Cloudflare');
 const notes=await listNotes();
 assert.equal(notes[0].body,'Saved in Cloudflare');
 assert.ok(requests>=4);
 await deleteNote(notes[0].id);
 assert.deepEqual(await listNotes(),[]);
});
test('D1 stores research run logs and completion',async()=>{
 await createResearchRun('run','Example Oy');
 await appendResearchLog('run','input','info','Started',{safe:true});
 await finishResearchRun('run',null);
 const run=await getResearchRun('run');
 assert.equal(run?.status,'completed');
 assert.deepEqual(run?.logs[0].details,{safe:true});
});
test('D1 atomically deduplicates video requests and decisions and reserves capacity',async()=>{
 const db=database();
 for(const id of [1,2]){
 await db.prepare('INSERT INTO company_research(id,requested_name,company_name,report,model,created_at) VALUES (?,?,?,?,?,?)').run(id,'Example','Example','{}','test','now');
 await db.prepare('INSERT INTO company_visualizations(id,research_id,run_id,report,created_at) VALUES (?,?,?,?,?)').run(id,id,'run','{}','now');
 }
 const [first,duplicate]=await Promise.all([createVideo(1,1,[],1),createVideo(1,1,[],1)]);
 assert.equal(first.id,duplicate.id);
 await updateVideo(first.id,{status:'awaiting_confirmation'});
 const digest=scriptDigest((await getVideo(first.id))!);
 const decisions=await Promise.allSettled([decideVideo(first.id,'decline',digest),decideVideo(first.id,'decline',digest)]);
 assert.equal(decisions.filter(r=>r.status==='fulfilled').length,1);
 await updateVideo(first.id,{status:'script_ready',approved_at:'now'});
 const second=await createVideo(2,2,[],1);
 await updateVideo(second.id,{status:'script_ready',approved_at:'now'});
 const reservations=await Promise.all([reserveSubmission(first.id,1,1),reserveSubmission(second.id,1,1)]);
 assert.equal(reservations.filter(Boolean).length,1);
});
test('D1 completed video keeps provider reference without writing local video files',async()=>{
 const job=await createVideo(1,1,[],1);
 await updateVideo(job.id,{status:'processing',lease_until:0,openrouter_job_id:'remote-video',polling_url:'https://openrouter.ai/api/v1/videos/remote-video'});
 await refreshVideo(job.id);
 const done=await getVideo(job.id);
 assert.equal(done?.status,'completed');
 assert.equal(done?.video_file_path,'openrouter:remote-video');
 assert.equal(done?.confirmed_cost,0.75);
 assert.equal(contentDownloads,0);
});
test('incomplete credentials and missing production credentials fail clearly',()=>{
 delete process.env.CLOUDFLARE_API_TOKEN;
 assert.throws(()=>usesD1(),/all three/);
 delete process.env.CLOUDFLARE_ACCOUNT_ID;
 delete process.env.CLOUDFLARE_D1_DATABASE_ID;
 process.env.VERCEL='1';
 assert.throws(()=>usesD1(),/Vercel requires/);
 delete process.env.VERCEL;
 globalThis.fetch=originalFetch;
 sqlite.close();
});
