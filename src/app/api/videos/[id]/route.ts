import {NextResponse} from 'next/server';
import {getVideo,publicVideo} from '@/lib/video/store';
import {wakeVideoWorker} from '@/lib/video/worker';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(_r:Request,ctx:{params:Promise<{id:string}>}){const job=getVideo((await ctx.params).id);if(!job)return NextResponse.json({error:'Video not found.'},{status:404});wakeVideoWorker();return NextResponse.json(publicVideo(job),{headers:{'Cache-Control':'no-store'}});}
