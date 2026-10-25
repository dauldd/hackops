import {NextResponse} from 'next/server';
import {visualizeCompany} from '@/lib/visualization/agent';
import {getResearch,listVisualizations} from '@/lib/db';
import {isSameOriginRequest} from '@/lib/research/http';
import {ValidationError} from '@/lib/research/schema';
import {ResearchApiError} from '@/lib/research/openrouter';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=180;
let busy=false;
function parseId(value:string){const id=Number(value);if(!/^\d+$/.test(value)||!Number.isSafeInteger(id)||id<1)throw new ValidationError('Invalid research ID.');return id;}
export async function GET(_request:Request,context:{params:Promise<{id:string}>}){try{const id=parseId((await context.params).id);if(!(await getResearch(id)))return NextResponse.json({error:'Research not found.'},{status:404});return NextResponse.json({results:(await listVisualizations(id))},{headers:{'Cache-Control':'no-store'}});}catch{return NextResponse.json({error:'Invalid research ID.'},{status:400});}}
export async function POST(request:Request,context:{params:Promise<{id:string}>}){
 if(!isSameOriginRequest(request))return NextResponse.json({error:'Cross-origin requests are not allowed.'},{status:403});
 if(busy)return NextResponse.json({error:'A visualization is already being generated. Please wait.'},{status:429});
 let body;let id:number;
 try{id=parseId((await context.params).id);const raw=await request.text();if(raw.length>100000)throw Error();body=raw?JSON.parse(raw):{};if(!body||typeof body!=='object'||Array.isArray(body))throw Error();if(body.runId!==undefined&&(typeof body.runId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(body.runId)))throw Error();}catch{return NextResponse.json({error:'Invalid visualization request.'},{status:400});}
 if(!(await getResearch(id)))return NextResponse.json({error:'Research not found.'},{status:404});
 busy=true;try{return NextResponse.json(await visualizeCompany(id,body.proposals,body.inputs,body.runId),{status:201});}catch(error){if(error instanceof ValidationError)return NextResponse.json({error:error.message},{status:400});if(error instanceof ResearchApiError)return NextResponse.json({error:error.message},{status:error.status});console.error('Visualization generation failed',error instanceof Error?error.name:'Unknown');return NextResponse.json({error:'The business case could not be generated. Review its activity logs and retry.'},{status:500});}finally{busy=false;}
}
