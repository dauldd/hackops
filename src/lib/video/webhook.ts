import {createHmac,timingSafeEqual} from 'node:crypto';
export function verifyWebhook(raw:string,signature:string|null,secret:string,now=Date.now()){
 const timestamp=signature?.match(/(?:^|,)t=(\d+)(?:,|$)/)?.[1];const hash=signature?.match(/(?:^|,)v1=([a-fA-F0-9]{64})(?:,|$)/)?.[1];
 if(!timestamp||!hash||Math.abs(now/1000-Number(timestamp))>300)return false;
 const expected=createHmac('sha256',secret).update(`${timestamp},${raw}`).digest();const actual=Buffer.from(hash,'hex');return actual.length===expected.length&&timingSafeEqual(expected,actual);
}
