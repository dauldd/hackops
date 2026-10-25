import { z } from 'zod';
export const draftSchema = z.object({subject:z.string().trim().min(1).max(120).refine(s=>!/[\r\n]/.test(s)),body:z.string().trim().min(1).max(1000).refine(s=>s.split(/\s+/).length<=65,'Keep the email to 65 words or fewer.')});
export const sendSchema=draftSchema.extend({videoId:z.string().uuid(),to:z.email().max(254).refine(s=>!/[\r\n]/.test(s))});
export function mimeMessage(to:string,subject:string,body:string,video:Buffer,id:string){
 const boundary=`velho_${id}`;
 const base64=(b:Buffer)=>b.toString('base64').match(/.{1,76}/g)?.join('\r\n')??'';
 return Buffer.from([`To: ${to}`,`Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,`Message-ID: <${id}@velho.local>`,'MIME-Version: 1.0',`Content-Type: multipart/mixed; boundary="${boundary}"`,'',`--${boundary}`,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',base64(Buffer.from(body)),`--${boundary}`,'Content-Type: video/mp4; name="velho-pitch.mp4"','Content-Disposition: attachment; filename="velho-pitch.mp4"','Content-Transfer-Encoding: base64','',base64(video),`--${boundary}--`,''].join('\r\n')).toString('base64url');
}
