import 'server-only';
import {database} from '../db.ts';
import {scriptSchema,validateScript} from './script.ts';
import {getVideo,scriptDigest,type VideoJob} from './store.ts';
import {durationGuard,videoConfig} from './provider.ts';
export class VideoDecisionError extends Error {
 status:number;
 constructor(message:string,status=409){super(message);this.status=status;}
}
/** Approval is bound to the exact saved draft, including citations and source snapshots. */
export async function decideVideo(id:string,decision:'confirm'|'decline',digest:string){
 const db=database();
 const job=(await getVideo(id));if(!job)throw new VideoDecisionError('Video not found.',404);
 if(job.status!=='awaiting_confirmation')throw new VideoDecisionError('This script has already been decided or is not ready.');
 if(digest!==scriptDigest(job))throw new VideoDecisionError('The script has changed. Reload it before confirming.');
 if(decision==='decline'){
 (await applyDecision(job,{status:'declined',declined_at:new Date().toISOString(),approved_at:null,approved_script_digest:null,error:null}));
 }else{
 const company=(await db.prepare('SELECT company_name FROM company_research WHERE id=?').get(job.company_id)) as {company_name:string};
 const script=scriptSchema.parse(JSON.parse(job.script_references??'null'));
 const validation=validateScript(script,JSON.parse(job.sources),company.company_name);
 if(script.sentences.map(s=>s.text).join(' ')!==job.script_text)throw new VideoDecisionError('The displayed script has changed. Reload before confirming.',400);
 const estimate=durationGuard(job.script_text!,videoConfig());
 (await applyDecision(job,{status:'script_ready',approved_at:new Date().toISOString(),approved_script_digest:digest,estimated_cost:estimate.cost,validation_result:JSON.stringify(validation),error:null}));
 }
 return (await getVideo(id))!;
}

async function applyDecision(job:VideoJob,patch:Partial<VideoJob>){
 const entries=Object.entries({...patch,updated_at:new Date().toISOString()});
 const result=await database().prepare(`UPDATE video_pitches SET ${entries.map(([k])=>`${k}=?`).join(',')} WHERE id=? AND status='awaiting_confirmation' AND script_text IS ? AND script_references IS ? AND sources=?`).run(...entries.map(([,v])=>v as string|number|null),job.id,job.script_text,job.script_references,job.sources);
 if(!Number(result.changes))throw new VideoDecisionError('This script has already been decided or has changed. Reload it before confirming.');
}
