import {authorized,compose,history,send} from '@/lib/email/service';
import {z} from 'zod';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:Request){
 if(!authorized(request))return Response.json({error:'Enter the configured email admin key (at least 32 characters).'},{status:401});
 const id=new URL(request.url).searchParams.get('videoId');if(!id||!z.uuid().safeParse(id).success)return Response.json({error:'Invalid video ID.'},{status:400});
 return Response.json({results:await history(id)},{headers:{'Cache-Control':'no-store'}});
}
export async function POST(request:Request){
 if(!authorized(request))return Response.json({error:'Enter the configured email admin key (at least 32 characters).'},{status:401});
 try{const input=await request.json();if(input.action==='compose'){const id=z.uuid().parse(input.videoId);return Response.json(await compose(id));}if(input.action==='send')return Response.json(await send(input));return Response.json({error:'Invalid action.'},{status:400});}
 catch(error){return Response.json({error:error instanceof z.ZodError?'Check recipient, subject and body (maximum 65 words).':error instanceof Error?error.message:'Email request failed.'},{status:400});}
}
