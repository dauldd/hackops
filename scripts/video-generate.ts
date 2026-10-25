// Headless company pipeline: npm run video:generate -- <saved research ID>
import {startVideo} from '../src/lib/video/worker.ts';
import {getVideo,publicVideo} from '../src/lib/video/store.ts';
const company=Number(process.argv[2]);if(!Number.isSafeInteger(company)||company<1)throw Error('Supply a saved research ID: npm run video:generate -- 11');
const created=await startVideo(company);console.log('JOB',created.id);
let previous='';
for(let attempt=0;attempt<240;attempt++){
 const job=(await getVideo(created.id))!;const summary=JSON.stringify({id:job.id,status:job.status,error:job.error,confirmedCost:job.confirmed_cost});
 if(summary!==previous){console.log(summary);previous=summary;}
 if(['completed','failed','failed_validation','awaiting_confirmation','declined'].includes(job.status)){
 const result=publicVideo(job);console.log(JSON.stringify({id:result.id,status:result.status,script:result.script,validation:result.validation,coverage:result.coverage,videoUrl:result.videoUrl,confirmedCost:result.confirmedCost},null,2));process.exitCode=['completed','awaiting_confirmation'].includes(job.status)?0:1;break;
 }
 await new Promise(r=>setTimeout(r,5000));
 if(attempt===239)console.log('Still processing. Job remains persisted and resumes with the app worker.');
}
