import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {draftSchema,sendSchema,mimeMessage} from '../src/lib/email/message.ts';
const dir=await mkdtemp(join(tmpdir(),'velho-email-'));
process.env.DATABASE_PATH=join(dir,'test.sqlite');
delete process.env.CLOUDFLARE_ACCOUNT_ID;delete process.env.CLOUDFLARE_D1_DATABASE_ID;delete process.env.CLOUDFLARE_API_TOKEN;
process.env.GMAIL_CLIENT_ID='test';process.env.GMAIL_CLIENT_SECRET='test';process.env.GMAIL_REFRESH_TOKEN='test';process.env.EMAIL_ADMIN_KEY='x'.repeat(32);
const {database}=await import('../src/lib/database.ts');
const {send,history,authorized}=await import('../src/lib/email/service.ts');
assert(!draftSchema.safeParse({subject:'Hi\r\nBcc: evil@example.com',body:'Hello'}).success);
assert(!draftSchema.safeParse({subject:'Hi',body:Array(66).fill('word').join(' ')}).success);
assert(!sendSchema.safeParse({subject:'Hi',body:'Hello',videoId:crypto.randomUUID(),to:'a@example.com\r\nBcc: evil@example.com'}).success);
assert(!authorized(new Request('http://localhost')));
assert(authorized(new Request('http://localhost',{headers:{Authorization:`Bearer ${'x'.repeat(32)}`}})));
const raw=Buffer.from(mimeMessage('a@example.com','Héllo','A short introduction.',Buffer.from('video'),'test-id'),'base64url').toString();
assert(raw.includes('Content-Disposition: attachment; filename="velho-pitch.mp4"'));
assert(raw.includes(Buffer.from('video').toString('base64')));
const file=join(dir,'video.mp4');await writeFile(file,'test mp4');
const videoId=crypto.randomUUID();
await database().prepare("INSERT INTO company_research (id,requested_name,company_name,report,model,created_at) VALUES (1,'Test','Test','{}','test','now')").run();
await database().prepare("INSERT INTO research_runs (id,company_name,created_at,updated_at) VALUES ('test','Test','now','now')").run();
await database().prepare("INSERT INTO company_visualizations (id,research_id,run_id,report,created_at) VALUES (1,1,'test','{}','now')").run();
await database().prepare("INSERT INTO video_pitches (id,company_id,visualization_id,status,sources,video_file_path,created_at,updated_at) VALUES (?,1,1,'completed','[]',?,?,?)").run(videoId,file,'now','now');
const original=globalThis.fetch;let sends=0;
globalThis.fetch=async(input)=>{
 if(String(input).includes('oauth2'))return Response.json({access_token:'mock'});
 sends++;return Response.json({id:'gmail-123'});
};
try{
 const input={videoId,to:'a@example.com',subject:'Quick thought',body:'I made a short video. Would this be useful?'};
 await Promise.allSettled([send(input),send(input)]);assert.equal(sends,1);assert.equal((await history(videoId))[0].status,'sent');
 const second={...input,to:'b@example.com'};
 globalThis.fetch=async(input)=>{if(String(input).includes('oauth2'))return Response.json({access_token:'mock'});sends++;throw Error('Connection lost after submission');};
 await assert.rejects(send(second));assert.equal((await history(videoId)).find(r=>r.recipient===second.to)?.status,'unknown');
 await assert.rejects(send(second),/already has a send attempt/);assert.equal(sends,2);
 console.log('Email tests passed: validation, MIME, authorization, concurrent deduplication and ambiguous sends.');
}finally{globalThis.fetch=original;await rm(dir,{recursive:true,force:true});}
