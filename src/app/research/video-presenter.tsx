'use client';
import {useEffect,useRef,useState} from 'react';
import EmailPanel from './email-panel';
import type {publicVideo} from '@/lib/video/store';
type Job=ReturnType<typeof publicVideo>;
function externalUrl(value:string|null){try{const url=new URL(value??'');return ['https:','http:'].includes(url.protocol)&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname)?url:null;}catch{return null;}}
export default function VideoPresenter({companyId}:{companyId:number}){
 const mutationVersion=useRef(0),actionPending=useRef(false);
 const [job,setJob]=useState<Job|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{let stopped=false;let timer:ReturnType<typeof setTimeout>;const controller=new AbortController();async function poll(){const version=mutationVersion.current;try{const r=await fetch(`/api/research/${companyId}/videos`,{cache:'no-store',signal:controller.signal});if(!r.ok)throw Error('Could not load video status.');const d=await r.json();if(!stopped&&!actionPending.current&&version===mutationVersion.current)setJob(d.results[0]??null);}catch(e){if(!stopped)setError(e instanceof Error?e.message:'Could not load video status.');}finally{if(!stopped)timer=setTimeout(()=>void poll(),5000);}}void poll();return()=>{stopped=true;clearTimeout(timer);controller.abort();};},[companyId]);
 async function generate(){if(actionPending.current)return;actionPending.current=true;mutationVersion.current++;setBusy(true);setError('');try{const r=await fetch(`/api/research/${companyId}/videos`,{method:'POST'});const d=await r.json();if(!r.ok)throw Error(d.error);setJob(d);}catch(e){setError(e instanceof Error?e.message:'Video failed.');}finally{mutationVersion.current++;actionPending.current=false;setBusy(false);}}
 async function decide(decision:'confirm'|'decline'){
 if(!job||actionPending.current)return;actionPending.current=true;mutationVersion.current++;setBusy(true);setError('');
 try{const r=await fetch(`/api/videos/${job.id}/decision`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({decision,scriptDigest:job.scriptDigest})});const d=await r.json();if(!r.ok)throw Error(d.error);setJob(d);}catch(e){setError(e instanceof Error?e.message:'Could not save decision.');}finally{mutationVersion.current++;actionPending.current=false;setBusy(false);}
 }
 const reviewing=job?.status==='awaiting_confirmation';
 const active=job&&['queued','script_ready','submitted','processing'].includes(job.status);
 return <aside className="video-presenter" aria-label="Video pitch studio"><div className="presenter-heading"><span className="presenter-icon" aria-hidden="true">▷</span><p className="eyebrow">YOUR RESEARCH, BROUGHT TO LIFE</p><h3>AI presenter · Velho</h3><p>A focused video pitch, built from your company research.</p></div><div className="presenter-action">
 <button onClick={generate} disabled={busy||!!active||reviewing}>{busy?'Starting…':'Generate video pitch'}</button><span>Review the script before creating your video.</span></div>
 {!job&&<div className="presenter-empty"><span aria-hidden="true">▷</span><strong>Your next conversation starts here.</strong><p>Create a presenter pitch from the opportunities in this report.</p></div>}{error&&<p className="error" role="alert">{error}</p>}
 {job&&<><p className="presenter-status" role="status" aria-live="polite">{job.status==='completed'?'Video ready':reviewing?'Script ready':job.status==='script_ready'?'Queued':job.status.replaceAll('_',' ')}</p>
 {active&&<p>The video will appear here automatically when it is ready.</p>}
 {job.error&&<p role="alert">{job.error}</p>}
 {job.videoUrl&&<div className="presenter-player" key={`player-${job.id}`}><video controls playsInline preload="metadata" src={job.videoUrl} aria-label="Velho AI presenter observation"/></div>}
 {job.status==='completed'&&<EmailPanel key={job.id} videoId={job.id}/>}
 {job.confirmedCost!==null&&<details className="video-costs" key={`costs-${job.id}`}><summary>Costs</summary><p>Confirmed cost: ${job.confirmedCost.toFixed(4)}</p></details>}
 {reviewing&&job.script&&<div className="video-script-preview">
 {job.script.sentences.map((sentence,index)=><p key={index}>{sentence.text}</p>)}
 <small>{job.validation?.wordCount} words</small>
 <div className="video-script-decisions"><button disabled={busy} onClick={()=>decide('confirm')}>Confirm</button><button className="quiet-button" disabled={busy} onClick={()=>decide('decline')}>Decline</button></div>
 </div>}
 {(job.validation?.errors?.length>0||job.validation?.warnings?.length>0)&&<details><summary>Script notes</summary>{[...(job.validation.errors??[]),...(job.validation.warnings??[])].map((note:string,index:number)=><p key={index}>{note}</p>)}</details>}
 {job.script&&<details className="video-script-sources"><summary>Script and supporting sources</summary>
 {job.coverage&&<p className="video-coverage">Used {job.coverage.usedFindings??0} of {job.coverage.availableFindings} available findings across {job.coverage.categoryCount??0} categories</p>}
 {job.script.sentences.map((sentence,index)=><section className="video-sentence" key={index}>
 <p>{sentence.text}</p>
 {job.sentenceCitations.find(s=>s.sentenceIndex===index)?.citations.map((citation,i)=>{
 const url=externalUrl(citation.sourceUrl);
 return <div className="video-citation" key={`${citation.sourceId}-${i}`}>
 <div><strong>{citation.sourceTitle}</strong> <span className={`citation-badge citation-${citation.label.toLowerCase()}`}>{citation.label}</span></div>
 <small>{url?.hostname??'Saved visualization'} · {citation.sourceDate??'Date not reported'}</small>
 {url&&<a href={url.href} target="_blank" rel="noopener noreferrer">{url.href} ↗</a>}
 <blockquote>{citation.verificationQuote}</blockquote>
 {citation.findingId&&<small>Finding ID: {citation.findingId}</small>}
 {!url&&<small>Derived or scenario output from the saved visualization; underlying external evidence is listed separately.</small>}
 </div>;
 })}
 </section>)}
 {job.script.thinEvidence&&<p>{job.script.warning}</p>}
 </details>}
 </>}
 </aside>;
}
