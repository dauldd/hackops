import {NextResponse} from 'next/server';
import {after} from 'next/server';
import {isSameOriginRequest} from '@/lib/research/http';
import {getResearch} from '@/lib/db';
import {listVideos,publicVideo} from '@/lib/video/store';
import {startVideo,wakeVideoWorker} from '@/lib/video/worker';
export const runtime='nodejs';export const dynamic='force-dynamic';
function id(raw:string){const n=Number(raw);if(!/^\d+$/.test(raw)||!Number.isSafeInteger(n)||n<1)throw Error('Invalid company ID.');return n;}
export async function GET(_r:Request,ctx:{params:Promise<{id:string}>}){try{const company=id((await ctx.params).id);if(!getResearch(company))return NextResponse.json({error:'Research not found.'},{status:404});wakeVideoWorker();return NextResponse.json({results:listVideos(company).map(publicVideo)},{headers:{'Cache-Control':'no-store'}});}catch(e){return NextResponse.json({error:String(e)},{status:400});}}
export async function POST(r:Request,ctx:{params:Promise<{id:string}>}){if(!isSameOriginRequest(r))return NextResponse.json({error:'Cross-origin request refused.'},{status:403});try{const job=await startVideo(id((await ctx.params).id));after(()=>wakeVideoWorker());return NextResponse.json(publicVideo(job),{status:202});}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Could not start video.'},{status:400});}}
