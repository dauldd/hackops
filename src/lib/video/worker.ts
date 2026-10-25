import 'server-only';
import {z} from 'zod';
import {mkdir,rename} from 'node:fs/promises';
import {resolve} from 'node:path';
import {usesD1} from '../database.ts';
import {database,getResearch,getVisualization,listVisualizations} from '../db.ts';
import {scriptSchema,SCRIPT_INSTRUCTIONS,sourcesFor,validateScript,prepareScript,scriptEvidence,selectScriptSources,visualizationNumberHint,scriptIntro,type VideoSource} from './script.ts';
import {videoConfig,presenterImage,videoRequest,durationGuard,routerRequest} from './provider.ts';
import {getVideo,createVideo,updateVideo,claimVideo,activeVideos,scriptDigest,reserveSubmission,type VideoJob} from './store.ts';
export async function startVideo(company:number){
 const r=(await getResearch(company));if(!r)throw Error('Research not found.');
 const v=(await Promise.all((await listVisualizations(company)).map(x=>getVisualization(x.id)))).find(x=>x?.report.status==='ready');if(!v)throw Error('A saved, ready visualization report is required.');
 const config=videoConfig();await presenterImage(config.image);
 const job=(await createVideo(company,v.id,sourcesFor(r.report,v.report),config.concurrency,r.report.evidence.length));return job;
}
async function generateScript(job:VideoJob){
 const row=(await database().prepare('SELECT company_name FROM company_research WHERE id=?').get(job.company_id)) as {company_name:string};
 const company=row.company_name,sources=JSON.parse(job.sources) as VideoSource[];
 const focusedSources=selectScriptSources(sources);
 const allowedIds=focusedSources.map(s=>s.id);
 if(!allowedIds.length)throw Error('No eligible script sources.');
 // Keep the provider grammar small; enforce all length/array bounds locally with scriptSchema.
 const wireSchema=z.object({sentences:z.array(z.object({text:z.string(),kind:scriptSchema.shape.sentences.element.shape.kind,sourceIds:z.array(z.enum(allowedIds as [string,...string[]]))}).strict()),thinEvidence:z.boolean(),warning:z.string().nullable()}).strict();
 const messages:{role:string;content:string}[]=[{role:'system',content:SCRIPT_INSTRUCTIONS},{role:'user',content:JSON.stringify({company,sources:focusedSources.map(s=>({id:s.id,title:s.title,text:s.text,classification:s.classification,hiring:s.hiring})),allowedSourceIds:allowedIds,preferredVisualizationNumber:visualizationNumberHint(focusedSources.find(s=>s.type==='chart')),sentencePlan:'Use intro; a named case study with its actual before/after numbers; a second related finding; an optional careful inference; one narrow proposed action; a personalized closing question tied to the case. Prefer the highest-evidence concrete examples. Target 70–85 words, but retain useful specifics when slightly outside that target. Do not force in an illustrative chart when reported outcomes are stronger. Use EXACT allowedSourceIds including finding: prefixes. Attach relevant finding IDs to the personalized close.',intro:scriptIntro(company)})}];
 for(let attempt=0;attempt<2;attempt++){
 let errors:string[]=[];
 try{
 const response=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENROUTER_API_KEY}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(90000),body:JSON.stringify({model:process.env.VIDEO_SCRIPT_MODEL||'google/gemini-2.5-flash',messages,max_tokens:2500,response_format:{type:'json_schema',json_schema:{name:'video_script',strict:true,schema:z.toJSONSchema(wireSchema)}}})});
 if(!response.ok){(await updateVideo(job.id,{status:'failed',error:`Script provider ${response.status}: ${(await response.text()).slice(0,1000)}`}));return;}
 const data=await response.json();const raw=data.choices?.[0]?.message?.content;
 const script=prepareScript(scriptSchema.parse(JSON.parse(raw)),company,sources);const validation=validateScript(script,sources,company);
 const evidence=scriptEvidence(script,sources,job.coverage?JSON.parse(job.coverage).availableFindings:sources.filter(s=>s.type==='finding').length);
 (await updateVideo(job.id,{script_text:script.sentences.map(s=>s.text).join(' '),script_references:JSON.stringify(script),validation_result:JSON.stringify(validation),sentence_citations:JSON.stringify(evidence.sentences),coverage:JSON.stringify(evidence.coverage)}));
 (await updateVideo(job.id,{status:'awaiting_confirmation',error:null}));return;
 }catch(e){errors=[e instanceof Error?e.message:'Invalid structured script'];}
 (await updateVideo(job.id,{validation_result:JSON.stringify({valid:false,errors,attempt:attempt+1})}));
 messages.push({role:'user',content:JSON.stringify({validationErrors:errors,task:'Correct the grounding or structural errors once. Keep named cases and measured outcomes. Do not regenerate just because of word count. Use only the exact allowedSourceIds, including finding: prefixes. End with a personalized source-grounded question or next step.'})});
 }
 (await updateVideo(job.id,{status:'failed_validation',error:'The model did not return a usable script after two attempts.'}));
}
export async function refreshVideo(id:string){
 if(!(await claimVideo(id)))return;
 try{
 let job=(await getVideo(id))!;
 if(job.status==='awaiting_confirmation'||job.status==='declined')return;
 if(job.status==='script_ready'&&(!job.approved_at||job.approved_script_digest!==scriptDigest(job))){(await updateVideo(id,{status:'awaiting_confirmation',approved_at:null,approved_script_digest:null}));return;}
 const c=videoConfig();
 if(job.status==='queued'){await generateScript(job);job=(await getVideo(id))!;}
 if(job.status==='script_ready'){
 const company=(await database().prepare('SELECT company_name FROM company_research WHERE id=?').get(job.company_id)) as {company_name:string};
 const savedScript=scriptSchema.parse(JSON.parse(job.script_references||'null'));
 const validation=validateScript(savedScript,JSON.parse(job.sources),company.company_name);
 if(savedScript.sentences.map(s=>s.text).join(' ')!==job.script_text){(await updateVideo(id,{status:'awaiting_confirmation',approved_at:null,approved_script_digest:null,error:null}));return;}
 (await updateVideo(id,{validation_result:JSON.stringify(validation)}));

 const estimate=durationGuard(job.script_text!,c),image=await presenterImage(c.image);
 // Mark submission BEFORE network call: an ambiguous timeout/crash must never silently resubmit a paid job.
 if(!(await reserveSubmission(id,c.concurrency,estimate.cost)))return;
 const response=await routerRequest('videos',c.key,{method:'POST',body:JSON.stringify(videoRequest(job.script_text!,image,c,process.env.VIDEO_IMAGE_MAPPING||'input_references'))});
 const data=await response.json();if(typeof data.id!=='string')throw Error('OpenRouter accepted response has no job ID; review provider before retrying.');
 (await updateVideo(id,{openrouter_job_id:data.id,polling_url:data.polling_url||`https://openrouter.ai/api/v1/videos/${encodeURIComponent(data.id)}`,status:'processing',error:null}));job=(await getVideo(id))!;
 }
 if(job.status==='submitted'&&!job.openrouter_job_id){(await updateVideo(id,{status:'failed',error:'Submission outcome unknown. Check OpenRouter history before retrying to avoid a duplicate charge.'}));return;}
 if(job.status!=='processing')return;
 const response=await routerRequest(job.polling_url!,c.key);const data=await response.json();
 if(['failed','cancelled','expired'].includes(data.status)){(await updateVideo(id,{status:'failed',error:JSON.stringify(data.error??data.status)}));return;}
 if(data.status==='completed'){
 const cost=typeof data.usage?.cost==='number'&&Number.isFinite(data.usage.cost)?data.usage.cost:null;
 (await updateVideo(id,{confirmed_cost:cost}));
 if(process.env.VERCEL || usesD1()){
 await updateVideo(id,{status:'completed',video_file_path:`openrouter:${job.openrouter_job_id}`,error:null,confirmed_cost:cost});
 return;
 }
 const content=await routerRequest(`videos/${encodeURIComponent(job.openrouter_job_id!)}/content?index=0`,c.key);
 const directory=resolve(process.env.VIDEO_STORAGE_PATH||'./data/videos');await mkdir(directory,{recursive:true});const file=resolve(directory,`${id}.mp4`);
 const {Readable}=await import('node:stream');const {pipeline}=await import('node:stream/promises');const {createWriteStream}=await import('node:fs');
 if(!content.body)throw Error('OpenRouter returned empty video content.');
 await pipeline(Readable.fromWeb(content.body as import('node:stream/web').ReadableStream),createWriteStream(`${file}.part`));await rename(`${file}.part`,file);
 (await updateVideo(id,{status:'completed',video_file_path:file,error:null,confirmed_cost:cost}));
 }
 }catch(e){const job=(await getVideo(id));const message=e instanceof Error?e.message:'Video generation failed.';
 // A known remote job remains recoverable for network errors and download failures.
 if(job?.openrouter_job_id&&job.status==='processing')(await updateVideo(id,{error:message}));else (await updateVideo(id,{status:'failed',error:message}));
 }finally{(await updateVideo(id,{lease_until:0}));}
}
const state=globalThis as typeof globalThis & {videoTimer?:ReturnType<typeof setInterval>;videoTick?:Promise<void>};
/** Each serverless invocation completes one pass; browser polls or webhooks schedule the next. */
export function wakeVideoWorker(){
 if(!process.env.VERCEL && !state.videoTimer){state.videoTimer=setInterval(()=>{void wakeVideoWorker().catch(console.error);},10000);state.videoTimer.unref();}
 if(!state.videoTick)state.videoTick=tick().finally(()=>{state.videoTick=undefined;});
 return state.videoTick;
}
async function tick(){for(const job of await activeVideos())await refreshVideo(job.id);}
