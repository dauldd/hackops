import {stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {Readable} from 'node:stream';
import {getVideo} from '@/lib/video/store';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:Request,ctx:{params:Promise<{id:string}>}){
 const job=getVideo((await ctx.params).id);if(job?.status!=='completed'||!job.video_file_path)return new Response('Video not found',{status:404});
 let size:number;try{size=(await stat(job.video_file_path)).size;}catch{return new Response('Stored video is unavailable',{status:404});}
 const headers:Record<string,string>={'Content-Type':'video/mp4','Accept-Ranges':'bytes','Cache-Control':'private, no-store'};
 let start=0,end=size-1,status=200;const range=request.headers.get('range');
 if(range){const m=range.match(/^bytes=(\d*)-(\d*)$/);if(!m||(!m[1]&&!m[2]))return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});
 if(m[1]){start=Number(m[1]);end=m[2]?Math.min(Number(m[2]),size-1):size-1;}else start=Math.max(0,size-Number(m[2]));
 if(start>end||start>=size)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});status=206;headers['Content-Range']=`bytes ${start}-${end}/${size}`;}
 headers['Content-Length']=String(end-start+1);return new Response(Readable.toWeb(createReadStream(job.video_file_path,{start,end})) as ReadableStream,{status,headers});
}
