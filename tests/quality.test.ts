import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseResearch, readStoredResearch, researchSchema, type ResearchInput } from '../src/lib/research/schema.ts';
import { planFollowUp, followUpMemory } from '../src/lib/research/planning.ts';
import { researchRequest, requestResearch } from '../src/lib/research/openrouter.ts';
const now = new Date('2026-10-25T12:00:00.000Z');
const posti = JSON.parse(readFileSync(new URL('./fixtures/posti-legacy.json', import.meta.url),'utf8'));
function input(): ResearchInput {
 return {
 companyName:'Test Logistics Oy',website:'https://example.com',identity:{status:'confirmed',explanation:'Exact legal entity.',sourceUrls:['https://example.com/legal']},
 overview:{description:'Logistics service.',industry:'Logistics',headquarters:'Helsinki',employeeCount:25,businessModel:'B2B service',productsAndServices:[],customerSegments:[],geographicOperations:[],businessStructure:null,sourceUrls:['https://example.com']},
 evidence:[{id:'job',title:'Operations coordinator and integration duties',description:'Company reports a manual order reconciliation bottleneck.',sourceUrl:'https://example.com/jobs/operations',sourceDate:'2026-10-01',eventDate:'2026-10-01',retrievedAt:null,sourceExcerpt:'Our current manual order reconciliation takes four hours each day and needs an integration to eliminate errors.',verification:'verified',sourceType:'job_posting',categories:['hiring','operations'],status:'current',statusEvidence:['job'],signalType:'operational_problem',unmetNeedEvidence:'manual order reconciliation takes four hours each day',confidence:'high'}],
 hiringSignals:['job'],growthSignals:[],technologySignals:[],operationalSignals:['job'],
 financials:{revenue:null,currency:null,financialYear:null,employeeCount:null,summary:null,sourceUrls:[]},
 automationOpportunities:[{title:'Order reconciliation integration',description:'Explore reconciliation automation.',evidence:['job'],relevantVelhoService:'Operations integration',proposedSolution:'Connect order records and add deterministic reconciliation rules.',businessValue:'Could reduce repetitive reconciliation after confirming exceptions and scope.',confidence:'high',score:99,scoreBreakdown:{relevance:90,evidenceStrength:100,businessImpact:75,growth:90,automationFit:90},scoreExplanation:'Model suggestion; application recalculates.',hypothesis:'Manual reconciliation may cause avoidable work; validate the exception handling.',discoveryQuestions:['Which exceptions still need human judgment?'],implementationApproach:'integration',simplicityRationale:'Deterministic data matching addresses the documented need without AI.',existingSolutionAssessment:{status:'unmet',evidence:['job'],rationale:'The recent primary quotation explicitly says a reconciliation integration is needed.'}}],
 existingAutomation:[],researchGaps:[],qualificationContext:{businessModelRelevance:'high',relevanceExplanation:'Documented internal workflow aligns with Velho integrations.',deliverySuitability:'suitable',deliveryExplanation:'Narrow system integration is feasible subject to discovery.',evidence:['job']},
 overallScore:99,executiveSummary:'Will be rendered from structured data.',limitations:[],researchCoverage:['identity','overview','hiring','growth','technology','financials','operations','competition'].map(category=>({category,queries:[`Test Logistics ${category}`],outcome:'Checked relevant sources.'})),researchedAt:'',
 };
}
function raw(value = input()) { const { researchedAt: _timestamp, ...report }=value; void _timestamp; return report; }
test('Posti regression: warehouse role is hiring, historical projects are not current needs, and enterprise fit is separate',()=>{
 const r=readStoredResearch(posti);
 assert.equal(r.schemaVersion,2);
 const job=r.evidence.find(f=>f.sourceUrl.includes('Key-User'))!;assert.ok(job);assert.ok(r.hiringSignals.includes(job.id));assert.ok(r.technologySignals.includes(job.id));assert.ok(r.operationalSignals.includes(job.id));
 assert.equal(r.evidence.filter(f=>f.sourceUrl===job.sourceUrl&&f.sourceExcerpt===job.sourceExcerpt).length,1);
 const sap=r.evidence.find(f=>f.title.includes('SAP'))!;assert.equal(sap.freshness,'historical');assert.notEqual(sap.status,'ongoing');
 for(const name of ['SAP','Workday','Infor','Infosys'])assert.ok(r.existingAutomation.some(v=>v.name===name),name);
 assert.equal(r.qualification.customerFit.segment,'enterprise');assert.ok(r.qualification.customerFit.score!<=45);assert.ok(r.qualification.commercialAttractiveness.score!<=35);assert.notEqual(r.overallScore,90);
 assert.ok(r.automationOpportunities.every(o=>o.confidence!=='high'));assert.ok(r.researchGaps.some(g=>g.category==='competition'));
 assert.equal(r.researchedAt,posti.researchedAt);assert.equal(posti.overallScore,90);
});
test('current verified need can support confidence, but enterprise potential is not customer fit',()=>{
 const sme=parseResearch(raw(),now);assert.equal(sme.automationOpportunities[0].confidence,'high');assert.equal(sme.automationOpportunities[0].evidenceStrength,'direct_need');assert.equal(sme.qualification.customerFit.segment,'small');assert.equal(sme.qualification.customerFit.score,100);
 const enterprise=input();enterprise.overview.employeeCount=13700;const large=parseResearch(raw(enterprise),now);
 assert.equal(large.qualification.automationOpportunity.score,sme.qualification.automationOpportunity.score);assert.ok(large.qualification.customerFit.score!<sme.qualification.customerFit.score!);assert.ok(large.qualification.commercialAttractiveness.score!<=45);assert.equal(large.qualification.recommendation,'deprioritize');
});
test('unknown headcount is not silently qualified as an SME',()=>{const f=input();f.overview.employeeCount=null;const r=parseResearch(raw(f),now);assert.equal(r.qualification.customerFit.segment,'unknown');assert.equal(r.qualification.customerFit.score,null);assert.equal(r.qualification.commercialAttractiveness.score,null);});
test('old recruitment cannot become current merely because it was retrieved today',()=>{
 const f=input();f.evidence[0].sourceDate='2022-01-01';f.evidence[0].eventDate='2022-01-01';f.evidence[0].retrievedAt=now.toISOString();
 const r=parseResearch(raw(f),now);assert.equal(r.evidence[0].freshness,'historical');assert.equal(r.evidence[0].status,'historical');assert.equal(r.automationOpportunities[0].confidence,'low');assert.ok(r.researchGaps.some(g=>g.category==='freshness'));assert.ok(r.qualification.commercialAttractiveness.score!<=35);
});
test('inferred and generic context do not justify high confidence or a complex AI proposal',()=>{
 const f=input();f.evidence[0].verification='inferred';f.evidence[0].signalType='company_context';f.evidence[0].unmetNeedEvidence=null;f.automationOpportunities[0].implementationApproach='ai';
 const r=parseResearch(raw(f),now);assert.equal(r.automationOpportunities[0].confidence,'low');assert.equal(r.automationOpportunities[0].implementationApproach,'integration');assert.equal(r.automationOpportunities[0].evidenceStrength,'context_only');assert.equal(r.qualification.customerFit.score,65);
});
test('same fact across categories is one canonical record with all references remapped',()=>{
 const f=input();f.evidence.push({...f.evidence[0],id:'duplicate',categories:['technology']});f.technologySignals=['duplicate'];f.automationOpportunities[0].evidence=['duplicate'];
 const r=parseResearch(raw(f),now);assert.equal(r.evidence.length,1);assert.deepEqual(r.technologySignals,['job']);assert.deepEqual(r.automationOpportunities[0].evidence,['job']);
});
test('missing references are rejected throughout the evidence graph',()=>{
 for(const mutate of [(r:ResearchInput)=>{r.automationOpportunities[0].evidence=['missing'];},(r:ResearchInput)=>{r.evidence[0].statusEvidence=['missing'];},(r:ResearchInput)=>{r.qualificationContext.evidence=['missing'];},(r:ResearchInput)=>{r.researchGaps=[{id:'g',category:'competition',priority:'high',question:'Question?',reason:'Missing evidence.',evidence:['missing']}];}]){const f=input();mutate(f);assert.throws(()=>parseResearch(raw(f),now),/valid finding IDs/);}
});
test('unmatched need quotes and stale project status lower confidence instead of inventing evidence',()=>{
 const f=input();f.evidence[0].unmetNeedEvidence='Invented spreadsheet bottleneck';
 const r=parseResearch(raw(f),now);assert.equal(r.evidence[0].unmetNeedEvidence,null);assert.notEqual(r.automationOpportunities[0].confidence,'high');assert.ok(r.researchGaps.some(g=>g.id==='need-job'));
});
test('existing automation affects only documented scope and current status requires support',()=>{
 const f=input();f.existingAutomation=[{id:'vendor',name:'Existing Integrator',kind:'vendor',scope:'Order reconciliation',evidence:['job'],status:'ongoing',statusEvidence:[],implication:'already_addressed',rationale:'Prior implementation reference.'}];f.automationOpportunities[0].existingSolutionAssessment={status:'already_addressed',evidence:['job'],rationale:'This workflow is already covered.'};
 const r=parseResearch(raw(f),now);assert.equal(r.existingAutomation[0].status,'unknown');assert.ok(r.researchGaps.some(g=>g.category==='competition'));assert.equal(r.automationOpportunities[0].confidence,'low');assert.equal(r.qualification.commercialAttractiveness.score,0);
});
test('follow-up prioritizes concrete job/system leads, checks vendor status and avoids repeated queries',()=>{
 const r=readStoredResearch(posti);const leads=planFollowUp(r,now);assert.ok(leads.length>0);assert.ok(leads.length<=3);assert.ok(leads.some(l=>l.evidence.some(id=>r.hiringSignals.includes(id))));assert.ok(leads.some(l=>/cover|completed|status|scope|unaddressed/i.test(l.reason)));assert.ok(leads.some(l=>l.queries.some(q=>/työtehtävät|käyttöönotto/.test(q))));
 const queries=leads.flatMap(l=>l.queries);assert.equal(new Set(queries).size,queries.length);r.researchCoverage.push({category:'followup-test',queries,outcome:'Already searched.'});const next=planFollowUp(r,now);assert.ok(next.flatMap(l=>l.queries).every(q=>!queries.includes(q)));
 const memory=followUpMemory(r);assert.ok(!('executiveSummary' in memory));assert.ok(!('automationOpportunities' in memory));assert.equal(memory.evidence.length,r.evidence.length);
});
test('source budgets shrink irrelevant context while retaining server tools and full research depth',()=>{
 const request=researchRequest('Posti Group Oyj','configured/model');assert.equal(request.max_tool_calls,24);assert.equal(request.tools[0].parameters.max_uses,12);assert.equal(request.tools[0].parameters.max_characters,1200);assert.equal(request.tools[1].parameters.max_content_tokens,4000);assert.equal(request.response_format.json_schema.schema,researchSchema);
});
test('follow-up request sends compact memory and specific leads rather than duplicate narrative',async()=>{
 const original=process.env.OPENROUTER_API_KEY;process.env.OPENROUTER_API_KEY='test-key';
 try{const r=parseResearch(raw(),now);await requestResearch(r.companyName,(async(_url,init)=>{const body=JSON.parse(String(init?.body));const last=JSON.parse(body.messages.at(-1).content);assert.ok(last.researchMemory.evidence);assert.equal(last.previousReport,undefined);assert.ok(last.leads);assert.equal(body.max_tool_calls,12);return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(raw())}}]}));}) as typeof fetch,()=>{}, {followUp:{report:r,reason:'Check specific master data requirements.',leads:[{evidence:['job'],reason:'Check scope.',priority:95,queries:['Test Logistics ERP master data'],checks:['Read the actual job.']}]}});}finally{if(original===undefined)delete process.env.OPENROUTER_API_KEY;else process.env.OPENROUTER_API_KEY=original;}
});
test('employee profiles and generic career guides cannot masquerade as hiring signals',()=>{
 for(const type of ['professional_profile','aggregator'] as const){const f=input();f.evidence[0].sourceType=type;f.evidence[0].sourceUrl=type==='professional_profile'?'https://linkedin.com/in/example':'https://example.com/career-guide';const r=parseResearch(raw(f),now);assert.equal(r.hiringSignals.length,0);assert.ok(r.researchGaps.some(g=>g.id==='vacancy-job'));assert.notEqual(r.automationOpportunities[0].confidence,'high');}
});
test('Ahola provider regression accepts partial coverage and does not invent ERP bottlenecks or target revenue',()=>{
 const rawAhola=JSON.parse(readFileSync(new URL('./fixtures/ahola-provider.json',import.meta.url),'utf8'));
 const r=parseResearch(rawAhola,now);assert.equal(r.companyName,'Ahola Transport');assert.ok(r.existingAutomation.some(v=>v.name==='Ahola Digital'));assert.ok(r.existingAutomation.some(v=>v.name.includes('Cargoson')));
 assert.equal(r.financials.revenue,null);assert.match(r.financials.summary!,/Ahola Group/);assert.ok(r.researchGaps.some(g=>g.id==='financial-entity-scope'));
 for(const o of r.automationOpportunities){assert.equal(o.confidence,'low');assert.equal(o.evidenceStrength,'context_only');assert.match(o.proposedSolution,/No implementation proposal/);assert.ok(o.score<=35);}
 assert.ok(r.qualification.commercialAttractiveness.score!<=35);assert.equal(r.evidence.find(f=>f.id==='evidence-006')?.status,'unknown');
 assert.equal(r.evidence.find(f=>f.id==='evidence-009')?.verification,'inferred');assert.ok(r.researchGaps.some(g=>g.id==='deployment-evidence-009'));
});
test('unlinked vendor candidates become research gaps and cannot poison otherwise valid evidence',()=>{
 const f=input();f.existingAutomation=[{id:'unlinked',name:'Unverified partner',kind:'vendor',scope:'Candidate ERP integration',evidence:['https://example.com/not-retained'],status:'ongoing',statusEvidence:['https://example.com/not-retained'],implication:'potential_gap',rationale:'Unlinked claim.'}];
 const r=parseResearch(raw(f),now);assert.equal(r.existingAutomation.length,0);assert.ok(r.researchGaps.some(g=>g.id==='unsupported-vendor-unlinked'));assert.ok(r.limitations.some(l=>l.includes('withheld')));
});
test('URLs can only resolve evidence references to already-retained source records',()=>{
 const f=input();f.existingAutomation=[{id:'linked',name:'Known solution',kind:'platform',scope:'Order operations',evidence:[f.evidence[0].sourceUrl],status:'current',statusEvidence:[f.evidence[0].sourceUrl],implication:'partially_addressed',rationale:'Known source.'}];
 const r=parseResearch(raw(f),now);assert.deepEqual(r.existingAutomation[0].evidence,['job']);assert.deepEqual(r.existingAutomation[0].statusEvidence,['job']);
});
test('category indexes are safely regenerated when model uses IDs absent from its canonical evidence',()=>{
 const f=input();f.hiringSignals=['hs-missing'];f.growthSignals=['gs-missing'];
 const r=parseResearch(raw(f),now);assert.deepEqual(r.hiringSignals,['job']);assert.deepEqual(r.growthSignals,[]);assert.ok(r.limitations.some(l=>l.includes('hiringSignals')));assert.ok(r.limitations.some(l=>l.includes('growthSignals')));
});
