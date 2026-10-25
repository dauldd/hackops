import {NextResponse,after} from 'next/server';
import {isSameOriginRequest} from '@/lib/research/http';
import {decideVideo,VideoDecisionError} from '@/lib/video/review';
import {publicVideo} from '@/lib/video/store';
import {wakeVideoWorker} from '@/lib/video/worker';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function POST(request:Request,ctx:{params:Promise<{id:string}>}){
 if(!isSameOriginRequest(request))return NextResponse.json({error:'Cross-origin request refused.'},{status:403});
 let body;
 try{const raw=await request.text();if(raw.length>2000)throw Error();body=JSON.parse(raw);if(!['confirm','decline'].includes(body.decision)||typeof body.scriptDigest!=='string'||!/^[a-f0-9]{64}$/.test(body.scriptDigest))throw Error();}catch{return NextResponse.json({error:'Invalid script decision.'},{status:400});}
 try{const job=decideVideo((await ctx.params).id,body.decision,body.scriptDigest);if(body.decision==='confirm')after(()=>wakeVideoWorker());return NextResponse.json(publicVideo(job));}
 catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Could not save decision.'},{status:e instanceof VideoDecisionError?e.status:400});}
}
