import {NextResponse,after} from 'next/server';
import {getVideo,publicVideo} from '@/lib/video/store';
import {wakeVideoWorker} from '@/lib/video/worker';
export const maxDuration=300;
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(_r:Request,ctx:{params:Promise<{id:string}>}){const job=(await getVideo((await ctx.params).id));if(!job)return NextResponse.json({error:'Video not found.'},{status:404});after(()=>wakeVideoWorker());return NextResponse.json(publicVideo(job),{headers:{'Cache-Control':'no-store'}});}
