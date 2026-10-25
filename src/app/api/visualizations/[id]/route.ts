import {NextResponse} from 'next/server';
import {getVisualization} from '@/lib/db';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(_request:Request,context:{params:Promise<{id:string}>}){const raw=(await context.params).id;const id=Number(raw);if(!/^\d+$/.test(raw)||!Number.isSafeInteger(id)||id<1)return NextResponse.json({error:'Invalid visualization ID.'},{status:400});const artifact=getVisualization(id);return artifact?NextResponse.json(artifact,{headers:{'Cache-Control':'no-store'}}):NextResponse.json({error:'Visualization not found.'},{status:404});}
