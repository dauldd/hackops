import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';

// Canonical presenter asset location, shared by production and the smoke test.
export const DEFAULT_PRESENTER_IMAGE_PATH = './docs/images/presenter.png';
export function videoConfig() {
 const positive=(key:string,fallback:number)=>{const n=Number(process.env[key]??fallback);if(!Number.isFinite(n)||n<=0)throw Error(`${key} must be positive.`);return n;};
 const key=process.env.OPENROUTER_API_KEY,voice=process.env.VIDEO_VOICE_ID,image=process.env.PRESENTER_IMAGE_URL||process.env.PRESENTER_IMAGE_PATH||DEFAULT_PRESENTER_IMAGE_PATH;
 if(!key||!voice)throw Error('Video requires OPENROUTER_API_KEY and VIDEO_VOICE_ID.');
 const callback=process.env.PUBLIC_BASE_URL;
 if(callback&&(!callback.startsWith('https://')||!process.env.OPENROUTER_WEBHOOK_SECRET))throw Error('PUBLIC_BASE_URL must be HTTPS and requires OPENROUTER_WEBHOOK_SECRET.');
 return {key,voice,image,model:process.env.VIDEO_MODEL||'heygen/avatar-iv',resolution:process.env.VIDEO_RESOLUTION||'720p',aspect:process.env.VIDEO_ASPECT_RATIO||'16:9',maxSeconds:positive('VIDEO_MAX_SECONDS',45),maxCost:positive('VIDEO_MAX_COST_USD',3),concurrency:Math.max(1,Math.floor(positive('VIDEO_CONCURRENCY',1))),callback:callback?`${callback.replace(/\/$/,'')}/api/videos/webhook`:undefined};
}
export async function presenterImage(image:string){
 if(/^https:\/\//.test(image))return image;
 if(/^\w+:/.test(image))throw Error('Presenter image URL must use HTTPS.');
 const mime=({'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'} as Record<string,string>)[extname(image).toLowerCase()];
 if(!mime)throw Error('Presenter image must be PNG, JPEG or WebP.');
 let photo:Buffer;
 try{photo=await readFile(image);}catch{throw Error(`Presenter image could not be read at ${image}. Add the presenter photo there before generating a video.`);}
 return `data:${mime};base64,${photo.toString('base64')}`;
}
/** LIVE CONFIRMED 2026-10-25: gen-vid-1792916112-UeYudNmJ7GSHWNd6bx7y completed; MP4 downloaded.
 * Confirmed usage.cost: 0.3252245. Single field mapping to edit.
 * Live API rejected frame_images and explicitly requires provider.options.heygen.voice_id.
 * input_references + flat voice_id are used; Avatar IV duration is omitted (TTS inferred).
 * Speech is supplied as prompt, photo as input_references, and voice_id directly under heygen.
 */
export function videoRequest(script:string,image:string,c:ReturnType<typeof videoConfig>,mapping='input_references'){
 if(!['frame_images','input_references'].includes(mapping))throw Error('VIDEO_IMAGE_MAPPING must be frame_images or input_references.');
 const reference={type:'image_url',image_url:{url:image}};
 return {model:c.model,prompt:script,resolution:c.resolution,aspect_ratio:c.aspect,generate_audio:true,
 ...(mapping==='input_references'?{input_references:[reference]}:{frame_images:[{...reference,frame_type:'first_frame'}]}),
 ...(c.callback?{callback_url:c.callback}:{}),provider:{options:{heygen:{voice_id:c.voice,motion_prompt:'Speak calmly, looking directly into the camera, with restrained natural movement.'}}}};
}
export function durationGuard(script:string,c:ReturnType<typeof videoConfig>){
 // Advisory estimate only. The user's Confirm decision authorizes submission.
 const seconds=Math.ceil(script.trim().split(/\s+/).length/2);
 const cost=c.model==='heygen/avatar-iv'?seconds*0.05:null;
 return {seconds,cost,durationTargetExceeded:seconds>c.maxSeconds,costTargetExceeded:cost!==null&&cost>c.maxCost};
}
export async function routerRequest(path:string,key:string,init:RequestInit={}){
 const url=new URL(path,'https://openrouter.ai/api/v1/');
 if(url.origin!=='https://openrouter.ai'||!url.pathname.startsWith('/api/v1/videos'))throw Error('Invalid OpenRouter polling URL.');
 const r=await fetch(url,{...init,headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json',...init.headers},signal:AbortSignal.timeout(60000)});
 if(!r.ok)throw Error(`OpenRouter ${r.status}: ${(await r.text()).slice(0,3000)}`);
 return r;
}
