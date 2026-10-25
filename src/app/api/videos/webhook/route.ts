import {NextResponse,after} from 'next/server';
import {database} from '@/lib/db';
import {verifyWebhook} from '@/lib/video/webhook';
import {wakeVideoWorker} from '@/lib/video/worker';
export const runtime='nodejs';
export async function POST(request:Request){
 const secret=process.env.OPENROUTER_WEBHOOK_SECRET;if(!secret)return NextResponse.json({error:'Webhook not configured.'},{status:503});
 const raw=await request.text();if(raw.length>1000000)return new Response(null,{status:413});
 if(!verifyWebhook(raw,request.headers.get('X-OpenRouter-Signature'),secret))return NextResponse.json({error:'Invalid signature or timestamp.'},{status:401});
 const key=request.headers.get('X-OpenRouter-Idempotency-Key');if(!key||key.length>300)return NextResponse.json({error:'Idempotency key required.'},{status:400});
 let event;try{event=JSON.parse(raw);if(typeof event.data?.id!=='string'||!['completed','failed','cancelled','expired'].includes(event.data?.status)||event.type!==`video.generation.${event.data.status}`)throw Error();}catch{return NextResponse.json({error:'Invalid callback event.'},{status:400});}
 const db=database();const job=db.prepare('SELECT id FROM video_pitches WHERE openrouter_job_id=?').get(event.data.id);
 if(!job)return NextResponse.json({error:'Unknown job; retry after submission is persisted.'},{status:409});
 const result=db.prepare('INSERT OR IGNORE INTO video_webhook_events(id,created_at) VALUES (?,?)').run(key,new Date().toISOString());
 // Fetch authoritative job status with server credentials; never trust callback download URLs.
 if(result.changes)after(()=>wakeVideoWorker());return NextResponse.json({received:true,duplicate:!result.changes});
}
