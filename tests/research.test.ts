import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseResearch, parseCompanyName } from '../src/lib/research/schema.ts';
import { researchRequest, requestResearch } from '../src/lib/research/openrouter.ts';
import { researchCompany } from '../src/lib/research/agent.ts';
import { getResearch, listResearch } from '../src/lib/db.ts';
process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), 'velho-research-')), 'test.sqlite');
function fixture() {
 return {
 companyName: 'Example Oy', website: 'https://example.com/',
 identity: { status: 'confirmed', explanation: 'Exact legal name in official contact page.', sourceUrls: ['https://example.com/contact'] },
 overview: { description: 'A logistics provider.', industry: 'Logistics', headquarters: null, employeeCount: null, businessModel: null, productsAndServices: [], customerSegments: [], geographicOperations: [], businessStructure: null, sourceUrls: ['https://example.com/'] },
 hiringSignals: [{id:'h1',title:'Operations coordinator',description:'Job lists weekly Excel reporting.',sourceUrl:'https://example.com/careers/operations',sourceDate:'2025-01-01',confidence:'high',sourceExcerpt:'Prepare weekly Excel reports.'}], growthSignals: [], technologySignals: [], operationalSignals: [],
 financials: { revenue:null,currency:null,financialYear:null,employeeCount:null,summary:null,sourceUrls:[] },
 automationOpportunities: [{ title:'Report preparation',description:'Explore automated report preparation.',evidence:['h1'],relevantVelhoService:'Operations automation',proposedSolution:'Integrate source data with scheduled reports.',businessValue:'Could reduce preparation time.',confidence:'medium',score:99,scoreBreakdown:{relevance:80,evidenceStrength:60,businessImpact:50,growth:0,automationFit:80},scoreExplanation:'Direct job evidence of reporting, no established inefficiency or growth.',hypothesis:'Report assembly may involve repeatable work; validate first.',discoveryQuestions:['How are reports prepared?'] }],
 overallScore:99,executiveSummary:'Reporting duties suggest a discovery conversation.',limitations:['No evidence of inefficiency.'], researchCoverage:['identity','overview','hiring','growth','technology','financials','operations'].map(category=>({category,queries:[`${category} Example Oy`],outcome:'Reviewed available public evidence.'})),
 };
}
test('valid report gets server timestamp, deterministic scores, and evidence links',()=>{const r=parseResearch(fixture(),new Date('2026-10-25'));assert.equal(r.overallScore,35);assert.equal(r.researchedAt,'2026-10-25T00:00:00.000Z');assert.equal(r.automationOpportunities[0].evidence[0],'h1');});
test('rejects malformed, incomplete and unsupported outputs',()=>{
 const cases: ((r:ReturnType<typeof fixture>)=>void)[] = [r=>{r.hiringSignals[0].sourceUrl='javascript:alert(1)';},r=>{r.overview.sourceUrls=[];},r=>{r.identity.status='ambiguous';},r=>{r.automationOpportunities[0].scoreBreakdown.growth=101;}];
 for(const mutate of cases){const r=fixture();mutate(r);assert.throws(()=>parseResearch(r));}
 assert.throws(()=>parseResearch({companyName:'Only a name'}));
 const financial=fixture() as unknown as Record<string,unknown>;financial.financials={revenue:1000,currency:null,financialYear:null,employeeCount:null,summary:null,sourceUrls:[]};assert.throws(()=>parseResearch(financial));
});
test('unresolved companies can return a safe incomplete report',()=>{const r=fixture();r.identity.status='ambiguous';r.website=null as unknown as string;r.hiringSignals=[];r.automationOpportunities=[];r.overview={description:null,industry:null,headquarters:null,employeeCount:null,businessModel:null,productsAndServices:[],customerSegments:[],geographicOperations:[],businessStructure:null,sourceUrls:[]} as unknown as typeof r.overview;const report=parseResearch(r);assert.equal(report.overallScore,0);});
test('company input validation',()=>{assert.equal(parseCompanyName(' Example Oy '),'Example Oy');for(const v of ['',null,{},'x'.repeat(201),'bad\nname'])assert.throws(()=>parseCompanyName(v));});
test('request uses both server tools, configurable model, structured output and budgets',()=>{const r=researchRequest('Example Oy','configured/model');assert.equal(r.model,'configured/model');assert.deepEqual(r.tools.map(t=>t.type),['openrouter:web_search','openrouter:web_fetch']);assert.equal(r.max_tool_calls,24);assert.equal(r.response_format.json_schema.strict,true);assert.equal(r.tools[0].parameters.max_uses,12);});
test('OpenRouter client handles success, errors and truncation without exposing provider content',async()=>{
 const old=process.env.OPENROUTER_API_KEY;process.env.OPENROUTER_API_KEY='test-key';
 const mock=(body:unknown,status=200)=>(async (_url,init)=>{assert.equal((init?.headers as Record<string,string>).Authorization,'Bearer test-key');return new Response(JSON.stringify(body),{status});}) as typeof fetch;
 try {
 const result=await requestResearch('Example Oy',mock({choices:[{finish_reason:'stop',message:{content:JSON.stringify(fixture())}}]}));assert.equal((result.report as {companyName:string}).companyName,'Example Oy');
 for(const status of [400,401,402,403,429,500])await assert.rejects(requestResearch('Example Oy',mock({error:'provider secret'},status)),error=>error instanceof Error&&!error.message.includes('provider secret'));
 for(const body of [{choices:[]},{choices:[{finish_reason:'length',message:{content:'{}'}}]},{choices:[{finish_reason:'stop',message:{content:'not json'}}]}])await assert.rejects(requestResearch('Example Oy',mock(body)));
 await assert.rejects(requestResearch('Example Oy',async()=>{throw new DOMException('timeout','TimeoutError');}),/timed out/);
 delete process.env.OPENROUTER_API_KEY;await assert.rejects(requestResearch('Example Oy',mock({})),/OPENROUTER_API_KEY/);
 }finally{if(old===undefined)delete process.env.OPENROUTER_API_KEY;else process.env.OPENROUTER_API_KEY=old;}
});
test('pipeline persists validated report, retrieves history, and never saves invalid research',async()=>{
 const request=async()=>({report:fixture(),model:'test/model',usage:null,annotations:[]});
 const saved=await researchCompany(' Example Oy ',request);assert.equal(getResearch(saved.id)?.report.companyName,'Example Oy');assert.equal(listResearch().length,1);assert.equal(getResearch(999999),null);
 await assert.rejects(researchCompany('Example Oy',async()=>({...await request(),report:{...fixture(),hiringSignals:[{...fixture().hiringSignals[0],sourceUrl:'javascript:unsafe'}]}})));
 await assert.rejects(researchCompany('Bad',async()=>{throw Error('provider failed');}));assert.equal(listResearch().length,1);
});
test('reported tool usage must support genuine multi-step research',async()=>{
 const report=fixture();
 const request=async()=>({report,model:'test/model',usage:{server_tool_use:{web_search_requests:1,web_fetch_requests:0}},annotations:[]});
 const count=listResearch().length;const partial=await researchCompany('Example Oy',request);assert.equal(partial.report.researchStatus,'partial');assert.equal(partial.report.overallScore,0);assert.equal(partial.report.automationOpportunities.length,0);assert.equal(listResearch().length,count+1);
 const saved=await researchCompany('Example Oy',async()=>({...await request(),usage:{server_tool_use:{web_search_requests:6,web_fetch_requests:3}}}));assert.ok(!saved.report.limitations.some(s=>s.includes('model-reported')));
});
test('same-origin browser submissions work with Next.js internal hostnames',async()=>{
 const { isSameOriginRequest }=await import('../src/lib/research/http.ts');
 assert.equal(isSameOriginRequest(new Request('http://localhost:3100/api/research',{headers:{host:'127.0.0.1:3100',origin:'http://127.0.0.1:3100'}})),true);
 assert.equal(isSameOriginRequest(new Request('http://localhost:3100/api/research',{headers:{host:'localhost:3100',origin:'http://localhost:3100'}})),true);
 assert.equal(isSameOriginRequest(new Request('http://localhost:3100/api/research',{headers:{host:'localhost:3100',origin:'https://attacker.example'}})),false);
 assert.equal(isSameOriginRequest(new Request('http://localhost:3100/api/research',{headers:{host:'localhost:3100',origin:'null'}})),false);
 assert.equal(isSameOriginRequest(new Request('http://localhost:3100/api/research')),true);
 assert.equal(isSameOriginRequest(new Request('http://localhost:3100/api/research',{headers:{host:'app.example',origin:'https://app.example','x-forwarded-proto':'https'}})),true);
});
test('provider JSON fences are accepted while malformed or partial reports remain rejected',async()=>{
 const { parseModelReport }=await import('../src/lib/research/openrouter.ts');
 assert.deepEqual(parseModelReport('```json\n{"companyName":"Example Oy"}\n```'),{companyName:'Example Oy'});
 assert.deepEqual(parseModelReport(' \n{"a":1}\n '),{a:1});
 assert.throws(()=>parseModelReport('Here is the report: {}'));
 assert.throws(()=>parseModelReport('```json\n{"companyName":\n```'));
});
test('persistent activity logs include successful and failed runs and cursor-based retrieval',async()=>{
 const { getResearchRun, listResearchRuns }=await import('../src/lib/db.ts');
 const result=await researchCompany('Example Oy',async (_name,_fetcher,log)=>{log?.('provider.request','Testing research request',{model:'test/model'});return {report:fixture(),model:'test/model',usage:null,annotations:[]};});
 const run=getResearchRun(result.runId)!;
 assert.equal(run.status,'completed');assert.equal(run.reportId,result.id);
 for(const stage of ['input','planning','provider.request','validation','identity','evidence','scoring','persistence','completed'])assert.ok(run.logs.some(e=>e.stage===stage),stage);
 assert.equal(getResearch(result.id)?.runId,result.runId);
 assert.ok(getResearchRun(result.runId,run.logs[0].id)!.logs.every(e=>e.id>run.logs[0].id));
 await assert.rejects(researchCompany('Failed example',async()=>{throw Error('Test provider failure');}));
 const failed=listResearchRuns().find(r=>r.companyName==='Failed example')!;assert.equal(failed.status,'failed');assert.equal(failed.reportId,null);assert.equal(getResearchRun(failed.id)!.logs.at(-1)?.stage,'failed');
});
test('logs redact credentials in nested values while preserving research details',async()=>{
 const { redactLogDetails }=await import('../src/lib/research/logging.ts');
 const value=redactLogDetails({Authorization:'Bearer secret',api_key:'secret',nested:[{content:'sk-or-v1-example-secret and Bearer secret',max_tokens:24000,query:'Example Oy careers'}]});
 assert.deepEqual(value,{Authorization:'[REDACTED]',api_key:'[REDACTED]',nested:[{content:'[REDACTED] and Bearer [REDACTED]',max_tokens:24000,query:'Example Oy careers'}]});
});
test('a tool transcript before the final fenced report does not break report extraction',async()=>{
 const { parseModelReport }=await import('../src/lib/research/openrouter.ts');
 const report=fixture();
 assert.deepEqual(parseModelReport('{"openrouter_web_search_response": {"results": []}}\n```json\n'+JSON.stringify(report)+'\n```'),report);
 assert.throws(()=>parseModelReport('```json\n{}\n```\nunfinished report'));
});
test('ambiguous identity with one search and no fetches saves a safe incomplete report',async()=>{
 const { getResearchRun }=await import('../src/lib/db.ts');
 const ambiguous={...fixture(),companyName:'hello oy',website:null,identity:{status:'ambiguous',explanation:'No exact legal entity established from available identity sources.',sourceUrls:['https://example.com/registry']},overview:{description:null,industry:null,headquarters:null,employeeCount:null,businessModel:null,productsAndServices:[],customerSegments:[],geographicOperations:[],businessStructure:null,sourceUrls:[]},hiringSignals:[],growthSignals:[],technologySignals:[],operationalSignals:[],automationOpportunities:[]};
 for(const usage of [{server_tool_use_details:{web_search_requests:1,web_fetch_requests:0}},{server_tool_use:{web_search_requests:1,web_fetch_requests:0}}]){
 const result=await researchCompany('hello oy',async()=>({report:ambiguous,model:'test/model',usage,annotations:[]}));
 assert.equal(result.report.identity.status,'ambiguous');assert.equal(result.report.overallScore,0);assert.equal(result.report.automationOpportunities.length,0);assert.ok(result.report.limitations.some(s=>s.includes('incomplete identification report')));assert.equal(getResearchRun(result.runId)?.status,'completed');assert.equal(getResearch(result.id)?.report.website,null);
 }
 const unsafe={...ambiguous,hiringSignals:fixture().hiringSignals};
 await assert.rejects(researchCompany('hello oy',async()=>({report:unsafe,model:'test/model',usage:{server_tool_use_details:{web_search_requests:1}},annotations:[]})),/Unresolved identity cannot contain attributed research/);
});
test('SQLite summaries passed to Client Components are plain objects',async()=>{
 const {listResearchRuns}=await import('../src/lib/db.ts');
 for(const row of [...listResearch(),...listResearchRuns()])assert.equal(Object.getPrototypeOf(row),Object.prototype);
});
test('invalid and future publication dates become unknown with explicit limitations',()=>{
 for(const date of ['2025-02-30','2099-01-01','2025-02','yesterday']){
 const input=fixture();input.hiringSignals[0].sourceDate=date;
 const r=parseResearch(input,new Date('2026-10-25'));
 assert.equal(r.evidence[0].sourceDate,null);assert.equal(r.evidence[0].sourceUrl,input.hiringSignals[0].sourceUrl);assert.ok(r.limitations.some(s=>s.includes(date)&&s.includes('set to unknown')));
 }
});
test('narrative and inline fences before the final JSON report are tolerated',async()=>{
 const {parseModelReport}=await import('../src/lib/research/openrouter.ts');
 assert.deepEqual(parseModelReport('Research narrative.```json\n'+JSON.stringify(fixture())+'\n```'),fixture());
});
test('similarly named companies cannot be substituted for the requested entity',async()=>{
 const r=await researchCompany('hello oy',async()=>({report:{...fixture(),companyName:'Hello Brands Oy'},model:'test/model',usage:{server_tool_use_details:{web_search_requests:1}},annotations:[]}));
 assert.equal(r.report.identity.status,'ambiguous');assert.equal(r.report.companyName,'hello oy');assert.equal(r.report.website,null);assert.equal(r.report.hiringSignals.length,0);assert.equal(r.report.automationOpportunities.length,0);assert.equal(r.report.overallScore,0);
});
test('limited initial research triggers a bounded follow-up and preserves a partial report if it fails',async()=>{
 let calls=0;
 const r=await researchCompany('Example Oy',async(_name,_fetcher,_log,options)=>{
 calls++;
 if(options?.followUp){assert.ok(options.timeoutMs!<=240000);throw Error('Follow-up unavailable');}
 return {report:fixture(),model:'test/model',usage:{server_tool_use_details:{web_search_requests:1,web_fetch_requests:1}},annotations:[]};
 });
 assert.equal(calls,2);assert.equal(r.report.researchStatus,'partial');assert.equal(r.report.hiringSignals.length,1);assert.equal(r.report.automationOpportunities.length,0);assert.equal(r.report.overallScore,0);
});
test('successful follow-up consolidates report and search/fetch telemetry across research passes',async()=>{
 let calls=0;
 const r=await researchCompany('Example Oy',async(_name,_fetcher,_log,options)=>{
 calls++;if(calls===2)assert.ok(options?.followUp?.report);
 return {report:fixture(),model:'test/model',usage:{server_tool_use_details:{web_search_requests:1,tool_calls_executed:2}},annotations:[]};
 });
 assert.equal(calls,2);assert.equal(r.report.researchStatus,'complete');assert.equal(r.report.automationOpportunities.length,1);assert.equal(r.report.overallScore,35);
});
