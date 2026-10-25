import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readStoredResearch} from '../src/lib/research/schema.ts';
import {defaultVisualizationProposals} from '../src/lib/visualization/proposals.ts';
import {insertResearch, listVisualizations, getVisualization, createResearchRun, insertVisualization} from '../src/lib/db.ts';
import {startVideo} from '../src/lib/video/worker.ts';
import {getVideo} from '../src/lib/video/store.ts';
import type {VisualizationReport} from '../src/lib/visualization/schema.ts';

process.env.DATABASE_PATH=join(await mkdtemp(join(tmpdir(),'velho-prerequisites-')),'app.sqlite');
process.env.OPENROUTER_API_KEY='test';process.env.VIDEO_VOICE_ID='test';
process.env.PRESENTER_IMAGE_URL='https://example.com/presenter.png';
const report=readStoredResearch(JSON.parse(await readFile(new URL('./fixtures/posti-legacy.json',import.meta.url),'utf8')));
report.automationOpportunities=[];

test('zero implementation opportunities use the report’s conditional discovery proposals',()=>{
 const proposals=defaultVisualizationProposals(report);
 assert.equal(proposals.length,3);
 assert.ok(proposals.every(p=>p.id.startsWith('discovery-')&&p.currentWorkflowStatus==='unknown'&&p.evidence.length));
 assert.ok(proposals.every(p=>p.evidence.every(id=>report.evidence.some(f=>f.id===id))));
 assert.deepEqual(defaultVisualizationProposals({...report,identity:{...report.identity,status:'ambiguous'}}),[]);
 assert.deepEqual(defaultVisualizationProposals({...report,evidence:[]}),[]);
});
test('video preparation recovers a report with only a needs_proposal snapshot and never submits video',async()=>{
 const saved=await insertResearch('Test',report,'test',null,[]);
 const empty:VisualizationReport={schemaVersion:1,researchId:saved.id,companyName:report.companyName,createdAt:new Date().toISOString(),status:'needs_proposal',proposalOrigin:'none',sources:[],businessCases:[],limitations:[],model:null};
 await createResearchRun('old-empty','Test');await insertVisualization(saved.id,empty,'old-empty');
 const original=globalThis.fetch;let plannerCalls=0;
 globalThis.fetch=async(input)=>{
 assert.equal(String(input),'https://openrouter.ai/api/v1/chat/completions','Video submission must wait for script approval');
 plannerCalls++;
 return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({cases:[]})}}]});
 };
 try{
 const job=await startVideo(saved.id);
 assert.equal(job.status,'queued');assert.equal(plannerCalls,1);
 const artifact=await getVisualization(job.visualization_id);
 assert.equal(artifact?.report.status,'ready');
 assert.equal(artifact?.report.proposalOrigin,'discovery_proposals');
 assert.equal(artifact?.report.businessCases.length,3);
 assert.ok(artifact?.report.businessCases.every(b=>b.charts.length>=3&&b.charts.every(c=>c.scenarioLabel.includes('not verified'))));
 assert.ok(JSON.parse(job.sources).some((s:{type:string})=>s.type==='proposal'));
 assert.equal((await getVideo(job.id))?.approved_at,null);
 // An older ready snapshot remains usable even if a newer attempt has no proposal.
 await createResearchRun('new-empty','Test');await insertVisualization(saved.id,empty,'new-empty');
 const again=await startVideo(saved.id,async()=>{throw Error('Existing ready visualization should be reused');});
 assert.equal(again.id,job.id);assert.equal(again.visualization_id,artifact!.id);
 assert.equal(plannerCalls,1);assert.equal((await listVisualizations(saved.id)).length,3);
 }finally{globalThis.fetch=original;}
});
