import 'server-only';
import {createHash} from 'node:crypto';
import {database} from '../db.ts';
import {scriptEvidence,type VideoScript,type VideoSource} from './script.ts';
export type VideoStatus='queued'|'script_ready'|'awaiting_confirmation'|'declined'|'failed_validation'|'submitted'|'processing'|'completed'|'failed';
export type VideoJob={id:string;company_id:number;visualization_id:number;status:VideoStatus;script_text:string|null;script_references:string|null;validation_result:string|null;sentence_citations:string|null;coverage:string|null;approved_at:string|null;approved_script_digest:string|null;declined_at:string|null;sources:string;openrouter_job_id:string|null;polling_url:string|null;estimated_cost:number|null;confirmed_cost:number|null;video_file_path:string|null;error:string|null;lease_until:number;created_at:string;updated_at:string};
export function getVideo(id:string){return database().prepare('SELECT * FROM video_pitches WHERE id=?').get(id) as VideoJob|undefined;}
export function listVideos(company:number){return database().prepare('SELECT * FROM video_pitches WHERE company_id=? ORDER BY created_at DESC LIMIT 30').all(company) as VideoJob[];}
export function updateVideo(id:string,patch:Partial<VideoJob>){const entries=Object.entries({...patch,updated_at:new Date().toISOString()}).filter(([k])=>!['id','company_id','sources','created_at'].includes(k));const allowed=new Set(['status','script_text','script_references','validation_result','sentence_citations','coverage','approved_at','approved_script_digest','declined_at','openrouter_job_id','polling_url','estimated_cost','confirmed_cost','video_file_path','error','lease_until','updated_at']);if(entries.some(([k])=>!allowed.has(k)))throw Error('Invalid video update');database().prepare(`UPDATE video_pitches SET ${entries.map(([k])=>`${k}=?`).join(',')} WHERE id=?`).run(...entries.map(([,v])=>v as string|number|null),id);}
export function createVideo(company:number,visualization:number,sources:VideoSource[],_limit:number,availableFindings=sources.filter(s=>s.type==='finding').length){
 const db=database();db.exec('BEGIN IMMEDIATE');try{
 const existing=db.prepare("SELECT * FROM video_pitches WHERE company_id=? AND status IN ('queued','awaiting_confirmation','script_ready','submitted','processing') LIMIT 1").get(company) as VideoJob|undefined;
 if(existing){db.exec('COMMIT');return existing;}
 const id=crypto.randomUUID(),now=new Date().toISOString();db.prepare('INSERT INTO video_pitches (id,company_id,visualization_id,status,sources,coverage,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)').run(id,company,visualization,'queued',JSON.stringify(sources),JSON.stringify({availableFindings}),now,now);db.exec('COMMIT');return getVideo(id)!;
 }catch(e){db.exec('ROLLBACK');throw e;}
}
export function scriptDigest(job:VideoJob){return createHash('sha256').update(JSON.stringify([job.script_text,job.script_references,job.sources])).digest('hex');}
export function publicVideo(job:VideoJob){
 const script=job.script_references?JSON.parse(job.script_references) as VideoScript:null,sources=JSON.parse(job.sources) as VideoSource[];
 const storedCoverage=job.coverage?JSON.parse(job.coverage):null;
 const evidence=script?scriptEvidence(script,sources,storedCoverage?.availableFindings??sources.filter(s=>s.type==='finding').length):null;
 return {id:job.id,companyId:job.company_id,visualizationId:job.visualization_id,status:job.status,script,scriptDigest:scriptDigest(job),approvedAt:job.approved_at,scriptText:job.script_text,sources,sentenceCitations:job.sentence_citations?JSON.parse(job.sentence_citations) as NonNullable<typeof evidence>['sentences']:evidence?.sentences??[],coverage:evidence?.coverage??storedCoverage,validation:job.validation_result?JSON.parse(job.validation_result):null,openRouterJobId:job.openrouter_job_id,estimatedCost:job.estimated_cost,confirmedCost:job.confirmed_cost,videoUrl:job.status==='completed'?`/api/videos/${job.id}/content`:null,error:job.error,createdAt:job.created_at,updatedAt:job.updated_at};
}
export function claimVideo(id:string){return Number(database().prepare('UPDATE video_pitches SET lease_until=? WHERE id=? AND lease_until<?').run(Date.now()+300000,id,Date.now()).changes)>0;}
export function activeVideos(){return database().prepare("SELECT * FROM video_pitches WHERE (status IN ('queued','submitted','processing') OR (status='script_ready' AND approved_at IS NOT NULL)) AND lease_until < ?").all(Date.now()) as VideoJob[];}

/** Queue approved drafts when all provider slots are occupied; never reject the user's decision. */
export function reserveSubmission(id:string,limit:number,estimatedCost:number|null){
 const db=database();db.exec('BEGIN IMMEDIATE');
 try{
 const active=db.prepare("SELECT count(*) AS n FROM video_pitches WHERE id!=? AND status IN ('submitted','processing')").get(id) as {n:number};
 if(active.n>=limit){db.exec('COMMIT');return false;}
 const result=db.prepare("UPDATE video_pitches SET status='submitted', estimated_cost=?, error='Submitting to OpenRouter.', lease_until=?, updated_at=? WHERE id=? AND status='script_ready' AND approved_at IS NOT NULL").run(estimatedCost,Date.now()+300000,new Date().toISOString(),id);
 db.exec('COMMIT');return Number(result.changes)>0;
 }catch(e){db.exec('ROLLBACK');throw e;}
}
