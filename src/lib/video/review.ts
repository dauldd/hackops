import 'server-only';
import {database} from '../db.ts';
import {scriptSchema,validateScript} from './script.ts';
import {getVideo,scriptDigest,updateVideo} from './store.ts';
import {durationGuard,videoConfig} from './provider.ts';
export class VideoDecisionError extends Error {
 status:number;
 constructor(message:string,status=409){super(message);this.status=status;}
}
/** Approval is bound to the exact saved draft, including citations and source snapshots. */
export function decideVideo(id:string,decision:'confirm'|'decline',digest:string){
 const db=database();db.exec('BEGIN IMMEDIATE');
 try{
 const job=getVideo(id);if(!job)throw new VideoDecisionError('Video not found.',404);
 if(job.status!=='awaiting_confirmation')throw new VideoDecisionError('This script has already been decided or is not ready.');
 if(digest!==scriptDigest(job))throw new VideoDecisionError('The script has changed. Reload it before confirming.');
 if(decision==='decline'){
 updateVideo(id,{status:'declined',declined_at:new Date().toISOString(),approved_at:null,approved_script_digest:null,error:null});
 }else{
 const company=db.prepare('SELECT company_name FROM company_research WHERE id=?').get(job.company_id) as {company_name:string};
 const script=scriptSchema.parse(JSON.parse(job.script_references??'null'));
 const validation=validateScript(script,JSON.parse(job.sources),company.company_name);
 if(script.sentences.map(s=>s.text).join(' ')!==job.script_text)throw new VideoDecisionError('The displayed script has changed. Reload before confirming.',400);
 const estimate=durationGuard(job.script_text!,videoConfig());
 updateVideo(id,{status:'script_ready',approved_at:new Date().toISOString(),approved_script_digest:digest,estimated_cost:estimate.cost,validation_result:JSON.stringify(validation),error:null});
 }
 db.exec('COMMIT');return getVideo(id)!;
 }catch(e){db.exec('ROLLBACK');throw e;}
}
