import 'server-only';
import {database} from '../db.ts';
import type {VideoScript,VideoSource} from './script.ts';
export type VideoStatus='queued'|'script_ready'|'failed_validation'|'submitted'|'processing'|'completed'|'failed';
export type VideoJob={id:string;company_id:number;visualization_id:number;status:VideoStatus;script_text:string|null;script_references:string|null;validation_result:string|null;sources:string;openrouter_job_id:string|null;polling_url:string|null;estimated_cost:number|null;confirmed_cost:number|null;video_file_path:string|null;error:string|null;lease_until:number;created_at:string;updated_at:string};
export function getVideo(id:string){return database().prepare('SELECT * FROM video_pitches WHERE id=?').get(id) as VideoJob|undefined;}
export function listVideos(company:number){return database().prepare('SELECT * FROM video_pitches WHERE company_id=? ORDER BY created_at DESC LIMIT 30').all(company) as VideoJob[];}
export function updateVideo(id:string,patch:Partial<VideoJob>){const entries=Object.entries({...patch,updated_at:new Date().toISOString()}).filter(([k])=>!['id','company_id','sources','created_at'].includes(k));const allowed=new Set(['status','script_text','script_references','validation_result','openrouter_job_id','polling_url','estimated_cost','confirmed_cost','video_file_path','error','lease_until','updated_at']);if(entries.some(([k])=>!allowed.has(k)))throw Error('Invalid video update');database().prepare(`UPDATE video_pitches SET ${entries.map(([k])=>`${k}=?`).join(',')} WHERE id=?`).run(...entries.map(([,v])=>v as string|number|null),id);}
export function createVideo(company:number,visualization:number,sources:VideoSource[],limit:number){
 const db=database();db.exec('BEGIN IMMEDIATE');try{
 const existing=db.prepare("SELECT * FROM video_pitches WHERE company_id=? AND status IN ('queued','script_ready','submitted','processing') LIMIT 1").get(company) as VideoJob|undefined;
 if(existing){db.exec('COMMIT');return existing;}
 const count=db.prepare("SELECT count(*) AS n FROM video_pitches WHERE status IN ('queued','script_ready','submitted','processing')").get() as {n:number};
 if(count.n>=limit)throw Error('Video concurrency limit reached. Wait for the active job to finish.');
 const id=crypto.randomUUID(),now=new Date().toISOString();db.prepare('INSERT INTO video_pitches (id,company_id,visualization_id,status,sources,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run(id,company,visualization,'queued',JSON.stringify(sources),now,now);db.exec('COMMIT');return getVideo(id)!;
 }catch(e){db.exec('ROLLBACK');throw e;}
}
export function publicVideo(job:VideoJob){return {id:job.id,companyId:job.company_id,visualizationId:job.visualization_id,status:job.status,script:job.script_references?JSON.parse(job.script_references) as VideoScript:null,scriptText:job.script_text,sources:JSON.parse(job.sources) as VideoSource[],validation:job.validation_result?JSON.parse(job.validation_result):null,openRouterJobId:job.openrouter_job_id,estimatedCost:job.estimated_cost,confirmedCost:job.confirmed_cost,videoUrl:job.status==='completed'?`/api/videos/${job.id}/content`:null,error:job.error,createdAt:job.created_at,updatedAt:job.updated_at};}
export function claimVideo(id:string){return Number(database().prepare('UPDATE video_pitches SET lease_until=? WHERE id=? AND lease_until<?').run(Date.now()+300000,id,Date.now()).changes)>0;}
export function activeVideos(){return database().prepare("SELECT * FROM video_pitches WHERE status IN ('queued','script_ready','submitted','processing') AND lease_until < ?").all(Date.now()) as VideoJob[];}
