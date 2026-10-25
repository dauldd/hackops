import 'server-only';
import {z} from 'zod';
import {mkdir,rename} from 'node:fs/promises';
import {resolve} from 'node:path';
import {database,getResearch,getVisualization,listVisualizations} from '../db.ts';
import {scriptSchema,SCRIPT_INSTRUCTIONS,sourcesFor,validateScript,type VideoSource} from './script.ts';
import {videoConfig,presenterImage,videoRequest,durationGuard,routerRequest} from './provider.ts';
import {getVideo,createVideo,updateVideo,claimVideo,activeVideos,type VideoJob} from './store.ts';
export async function startVideo(company:number){
 const r=getResearch(company);if(!r)throw Error('Research not found.');
 const q=r.report.qualification;
 if(q.recommendation==='deprioritize'||q.recommendation==='insufficient_evidence'||q.customerFit.score===null||q.commercialAttractiveness.score===null||q.customerFit.score<40||q.commercialAttractiveness.score<40||r.report.qualificationContext.deliverySuitability==='unsuitable')throw Error(`Video declined: ${q.recommendation}; customer fit ${q.customerFit.score??'unknown'}, commercial attractiveness ${q.commercialAttractiveness.score??'unknown'}. ${q.commercialAttractiveness.reasons.join(' ')}`);
 const v=listVisualizations(company).map(x=>getVisualization(x.id)).find(x=>x?.report.status==='ready');if(!v)throw Error('A saved, ready visualization report is required.');
 const config=videoConfig();await presenterImage(config.image);
 const job=createVideo(company,v.id,sourcesFor(r.report,v.report),config.concurrency);wakeVideoWorker();return job;
}
async function generateScript(job:VideoJob){
 const row=database().prepare('SELECT company_name FROM company_research WHERE id=?').get(job.company_id) as {company_name:string};
 const company=row.company_name,sources=JSON.parse(job.sources) as VideoSource[];
 const messages:{role:string;content:string}[]=[{role:'system',content:SCRIPT_INSTRUCTIONS},{role:'user',content:JSON.stringify({company,sources,intro:`Hi, I'm an AI presenter from Velho. This observation is for ${company}.`,close:'If useful, we can share the full analysis.'})}];
 for(let attempt=0;attempt<2;attempt++){
 let errors:string[]=[];
 try{
 const response=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENROUTER_API_KEY}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(90000),body:JSON.stringify({model:process.env.VIDEO_SCRIPT_MODEL||'google/gemini-2.5-flash',messages,max_tokens:2500,response_format:{type:'json_schema',json_schema:{name:'video_script',strict:true,schema:z.toJSONSchema(scriptSchema)}}})});
 if(!response.ok)throw Error(`Script provider ${response.status}: ${(await response.text()).slice(0,1000)}`);
 const data=await response.json();const raw=data.choices?.[0]?.message?.content;
 const script=scriptSchema.parse(JSON.parse(raw));const validation=validateScript(script,sources,company);
 updateVideo(job.id,{script_text:script.sentences.map(s=>s.text).join(' '),script_references:JSON.stringify(script),validation_result:JSON.stringify(validation)});
 if(validation.valid){updateVideo(job.id,{status:'script_ready'});return;}
 errors=validation.errors;messages.push({role:'assistant',content:JSON.stringify(script)});
 }catch(e){errors=[e instanceof Error?e.message:'Invalid structured script'];}
 updateVideo(job.id,{validation_result:JSON.stringify({valid:false,errors,attempt:attempt+1})});
 messages.push({role:'user',content:JSON.stringify({validationErrors:errors,task:'Regenerate once, correcting all errors without inventing evidence.'})});
 }
 updateVideo(job.id,{status:'failed_validation',error:'Script failed deterministic validation after two attempts. See validation errors.'});
}
export async function refreshVideo(id:string){
 if(!claimVideo(id))return;
 try{
 let job=getVideo(id)!;const c=videoConfig();
 if(job.status==='queued'){await generateScript(job);job=getVideo(id)!;}
 if(job.status==='script_ready'){
 const company=database().prepare('SELECT company_name FROM company_research WHERE id=?').get(job.company_id) as {company_name:string};
 const savedScript=scriptSchema.parse(JSON.parse(job.script_references||'null'));
 const validation=validateScript(savedScript,JSON.parse(job.sources),company.company_name);
 if(!validation.valid||savedScript.sentences.map(s=>s.text).join(' ')!==job.script_text){updateVideo(id,{status:'failed_validation',validation_result:JSON.stringify(validation),error:'Persisted script failed pre-submission validation.'});return;}

 const estimate=durationGuard(job.script_text!,c),image=await presenterImage(c.image);
 // Mark submission BEFORE network call: an ambiguous timeout/crash must never silently resubmit a paid job.
 updateVideo(id,{status:'submitted',estimated_cost:estimate.cost,error:'Submitting to OpenRouter.',lease_until:Date.now()+300000});
 const response=await routerRequest('videos',c.key,{method:'POST',body:JSON.stringify(videoRequest(job.script_text!,image,c,process.env.VIDEO_IMAGE_MAPPING||'frame_images'))});
 const data=await response.json();if(typeof data.id!=='string')throw Error('OpenRouter accepted response has no job ID; review provider before retrying.');
 updateVideo(id,{openrouter_job_id:data.id,polling_url:data.polling_url||`https://openrouter.ai/api/v1/videos/${encodeURIComponent(data.id)}`,status:'processing',error:null});job=getVideo(id)!;
 }
 if(job.status==='submitted'&&!job.openrouter_job_id){updateVideo(id,{status:'failed',error:'Submission outcome unknown. Check OpenRouter history before retrying to avoid a duplicate charge.'});return;}
 if(job.status!=='processing')return;
 const response=await routerRequest(job.polling_url!,c.key);const data=await response.json();
 if(['failed','cancelled','expired'].includes(data.status)){updateVideo(id,{status:'failed',error:JSON.stringify(data.error??data.status)});return;}
 if(data.status==='completed'){
 const cost=typeof data.usage?.cost==='number'&&Number.isFinite(data.usage.cost)?data.usage.cost:null;
 updateVideo(id,{confirmed_cost:cost});
 const content=await routerRequest(`videos/${encodeURIComponent(job.openrouter_job_id!)}/content?index=0`,c.key);
 const directory=resolve(process.env.VIDEO_STORAGE_PATH||'./data/videos');await mkdir(directory,{recursive:true});const file=resolve(directory,`${id}.mp4`);
 const {Readable}=await import('node:stream');const {pipeline}=await import('node:stream/promises');const {createWriteStream}=await import('node:fs');
 if(!content.body)throw Error('OpenRouter returned empty video content.');
 await pipeline(Readable.fromWeb(content.body as import('node:stream/web').ReadableStream),createWriteStream(`${file}.part`));await rename(`${file}.part`,file);
 updateVideo(id,{status:'completed',video_file_path:file,error:null,confirmed_cost:cost});
 }
 }catch(e){const job=getVideo(id);const message=e instanceof Error?e.message:'Video generation failed.';
 // A known remote job remains recoverable for network errors and download failures.
 if(job?.openrouter_job_id&&job.status==='processing')updateVideo(id,{error:message});else updateVideo(id,{status:'failed',error:message});
 }finally{updateVideo(id,{lease_until:0});}
}
const state=globalThis as typeof globalThis & {videoTimer?:ReturnType<typeof setInterval>;videoTick?:boolean};
export function wakeVideoWorker(){
 if(!state.videoTimer){state.videoTimer=setInterval(()=>void tick(),10000);state.videoTimer.unref();}void tick();
}
async function tick(){if(state.videoTick)return;state.videoTick=true;try{for(const job of activeVideos())await refreshVideo(job.id);}finally{state.videoTick=false;}}
