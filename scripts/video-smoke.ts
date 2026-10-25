// Run: node --env-file=.env --experimental-strip-types scripts/video-smoke.ts
// Makes a paid 8-second-ish TTS test. Resume without another charge: VIDEO_SMOKE_JOB_ID=<id>.
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {videoConfig,presenterImage,videoRequest,durationGuard,routerRequest} from '../src/lib/video/provider.ts';
const c=videoConfig(),directory=resolve('./data/video-smoke');await mkdir(directory,{recursive:true});
const script="Hi, I'm an AI presenter from Velho Applied Intelligence. This is a short presenter test.";
let id=process.env.VIDEO_SMOKE_JOB_ID;
if(!id){
 const image=await presenterImage(c.image);console.log({estimate:durationGuard(script,c)});
 for(const mapping of process.env.VIDEO_IMAGE_MAPPING==='frame_images'?['frame_images','input_references']:['input_references']){
 const body=videoRequest(script,image,{...c,callback:undefined},mapping);
 // Exact payload is stored locally, including photo data, with no API key.
 await writeFile(resolve(directory,`request-${mapping}.json`),JSON.stringify(body,null,2));
 console.log('REQUEST',JSON.stringify(body,(_k,v)=>typeof v==='string'&&v.startsWith('data:')?'[photo data URL: exact payload saved locally]':v));
 try{const response=await routerRequest('videos',c.key,{method:'POST',body:JSON.stringify(body)});const data=await response.json();console.log('RESPONSE',JSON.stringify(data));await writeFile(resolve(directory,'accepted.json'),JSON.stringify({mapping,response:data},null,2));id=data.id;
 if(!id)throw Error('Missing job ID. Inspect accepted.json before retrying.');
 console.log('ACCEPTED mapping:',mapping,'; duration omitted, inferred from TTS. Set VIDEO_IMAGE_MAPPING to this value.');break;}
 catch(e){console.error(String(e));if(!/OpenRouter 4\d\d:/.test(String(e))||mapping==='input_references')throw e;}
 }
}
if(!id)throw Error('No job accepted.');
console.log('Job:',id,'Resume with VIDEO_SMOKE_JOB_ID to avoid another submission.');
for(let attempt=0;attempt<120;attempt++){
 const response=await routerRequest(`videos/${encodeURIComponent(id)}`,c.key);const data=await response.json();console.log('STATUS',JSON.stringify(data));await writeFile(resolve(directory,'status.json'),JSON.stringify(data,null,2));
 if(['failed','cancelled','expired'].includes(data.status))throw Error(JSON.stringify(data.error??data.status));
 if(data.status==='completed'){
 const content=await routerRequest(`videos/${encodeURIComponent(id)}/content?index=0`,c.key);const file=resolve(directory,`${id.replace(/[^a-zA-Z0-9_-]/g,'_')}.mp4`);await writeFile(file,Buffer.from(await content.arrayBuffer()));
 console.log('SAVED',file,'Confirmed cost:',data.usage?.cost??'not reported');process.exit(0);
 }
 await new Promise(r=>setTimeout(r,10000));
}
throw Error(`Still processing. Resume with VIDEO_SMOKE_JOB_ID=${id}; do not submit another job.`);
