import 'server-only';
import {randomUUID} from 'node:crypto';
import {createResearchRun,finishResearchRun,getResearch,insertVisualization} from '../db.ts';
import {createResearchLogger,type ResearchLogger} from '../research/logging.ts';
import {requestStructuredCompletion} from '../research/openrouter.ts';
import {ValidationError,validateStructuredValue,type CompanyResearch} from '../research/schema.ts';
import {object,list,textSchema,numSchema,enumeration,inputKeys,chartTypes,proposalSchema,validateChart,type Proposal,type Inputs,type InputKey,type VisualizationReport,type BusinessCase} from './schema.ts';
import {definitions,resolveInputs,createScenarios} from './calculations.ts';
import {buildCharts,purposes,type ChartChoice} from './charts.ts';
const planSchema=object({cases:list(object({proposalId:textSchema,charts:list(object({purpose:enumeration(purposes),chartType:enumeration(chartTypes),headline:textSchema,insight:textSchema,sellingPoint:textSchema})),extractedInputs:list(object({key:enumeration(inputKeys),value:numSchema,unit:textSchema,sourceId:textSchema,quote:textSchema})),proposedSteps:list(textSchema)}))});
type Plan={cases:{proposalId:string;charts:ChartChoice[];extractedInputs:{key:InputKey;value:number;unit:string;sourceId:string;quote:string}[];proposedSteps:string[]}[]};
const PROMPT=`You are Velho's visualization and business-case analyst. You receive research and upstream automation proposals. Do not research the web, invent new company problems, or invent company metrics/prices. Select 3–6 relevant business views PER proposal and write short business-friendly headlines/selling points without numerical claims. TypeScript will generate all datasets, arithmetic and quantified insights. No unsupported ROI, revenue lift, payroll cuts or achieved benefits.
Choose time/capacity/workflow/scenario for ordinary automation, support for enquiries, cost/roi/outlook/sensitivity only where supplied hourly cost, implementation and recurring costs make them meaningful. Financial values must not be inferred from revenue/headcount. Default illustrative operational scenarios are allowed by the application; they are not company facts. Prefer meaningful comparisons over decorative charts. Supported purposes: time, capacity, hours_saved, workflow_current, workflow_proposed, scenario, scaling, support, cost, roi, outlook, sensitivity.
Reuse exact proposal IDs and known source IDs. Extract operational numeric inputs ONLY when explicit in a verified source excerpt with matching units. Do not convert units, estimate monthly volume from annual volume, infer pricing, or extract labor cost from company revenue. Extract only monthlyVolume (tasks/month), currentMinutes (minutes/task), reviewMinutes (minutes/task), or hourlyCost (EUR/hour). No implementation pricing or future performance extraction. Return the exact supporting quote. Do not infer that a listed duty is inefficient. Proposed steps may clarify the supplied solution but must not introduce an unrelated solution. Do not invent a current workflow; the application preserves its upstream status.
Output a single JSON object, no narrative or markdown. Headlines and insights must be qualitative: the application adds numbers with the correct scenario labels. ROI is optional, not mandatory when cost inputs are missing.`;
const normalized=(value:string)=>value.toLocaleLowerCase('en').replace(/\s+/g,' ').trim();
function assertProposals(proposals:Proposal[],research:CompanyResearch){
 if(!Array.isArray(proposals)||proposals.length>5)throw new ValidationError('Supply up to five proposals.');
 const ids=new Set<string>();const evidence=new Set(research.evidence.map(f=>f.id));
 for(const p of proposals){const {inputs:ignored,...base}=p;void ignored;validateStructuredValue(base,proposalSchema);if(ids.has(p.id)||!p.evidence.length||p.evidence.some(id=>!evidence.has(id)))throw new ValidationError('Each proposal needs a unique ID and supporting research evidence.');ids.add(p.id);if(p.currentWorkflowStatus==='observed'&&!p.currentWorkflow.length)throw new ValidationError('An observed workflow requires actual steps.');}
}
export function validateInputOverrides(values:unknown,research:CompanyResearch):Partial<Inputs>{
 if(values===undefined)return{};
 if(!values||typeof values!=='object'||Array.isArray(values))throw new ValidationError('Quantitative inputs must be an object.');
 const result:Partial<Inputs>={};const byId=new Map(research.evidence.map(f=>[f.id,f]));
 for(const [key,value]of Object.entries(values)){
 if(!inputKeys.includes(key as InputKey))throw new ValidationError(`Unknown quantitative input ${key}.`);
 validateStructuredValue(value,object({value:{type:['number','null'],minimum:0,maximum:1e9},unit:textSchema,classification:enumeration(['verified','assumption','unknown']),origin:enumeration(['research','company','scenario']),sourceReferences:list(textSchema),explanation:textSchema}));
 const input=structuredClone(value) as Inputs[InputKey];
 if(input.sourceReferences.some(id=>!byId.has(id)))throw new ValidationError('Input references must point to retained evidence IDs.');
 if(input.classification==='verified'&&(input.origin==='scenario'||(input.origin==='research'&&(!input.sourceReferences.length||input.sourceReferences.some(id=>byId.get(id)!.verification!=='verified')))))throw new ValidationError('Verified inputs require verified research support or explicitly company-provided data.');
 if(input.value===null)input.classification='unknown';
 if(input.classification==='unknown'&&input.value!==null)throw new ValidationError('Unknown inputs must have null values.');
 result[key as InputKey]=input;
 }
 resolveInputs(result); // Validate ranges and units without treating model arithmetic as authoritative.
 return result;
}
/** Independent reasoning/calculation pipeline; accepts upstream structured research and proposals. */
export async function createVisualizationReport(research:CompanyResearch,proposals:Proposal[],researchId:number,overrides:Partial<Inputs>={},origin:VisualizationReport['proposalOrigin']='provided',log:ResearchLogger=()=>{},planner=requestStructuredCompletion):Promise<VisualizationReport>{
 assertProposals(proposals,research);
 const base:VisualizationReport={schemaVersion:1,researchId,companyName:research.companyName,createdAt:new Date().toISOString(),status:proposals.length?'ready':'needs_proposal',proposalOrigin:origin,sources:research.evidence.map(f=>({id:f.id,title:f.title,url:f.sourceUrl,excerpt:f.sourceExcerpt,verification:f.verification})),businessCases:[],limitations:[],model:null};
 if(!proposals.length){base.limitations.push('No upstream automation proposal is available. Add a proposal linked to the research before generating a business case. The visualization agent does not invent a new company problem.');return base;}
 log('visualization.planning','Selecting company-specific business views and extracting supported numeric inputs.',{proposals:proposals.map(p=>({id:p.id,title:p.title}))});
 const evidenceIds=new Set(proposals.flatMap(p=>p.evidence));
 const result=await planner('velho_visualization_plan',planSchema,[{role:'system',content:PROMPT},{role:'user',content:JSON.stringify({companyName:research.companyName,industry:research.overview.industry,proposals,evidence:research.evidence.filter(f=>evidenceIds.has(f.id)).map(f=>({id:f.id,description:f.description,sourceExcerpt:f.sourceExcerpt,verification:f.verification,sourceUrl:f.sourceUrl})),suppliedInputs:overrides,units:Object.fromEntries(inputKeys.map(key=>[key,definitions[key].unit]))})}],undefined,log);
 validateStructuredValue(result.value,planSchema);const plan=result.value as Plan;base.model=result.model;
 const plannedIds=plan.cases.map(c=>c.proposalId);if(new Set(plannedIds).size!==plannedIds.length||plannedIds.some(id=>!proposals.some(p=>p.id===id)))throw new ValidationError('Visualization plan references an unknown or duplicate proposal.');
 for(const original of proposals){
 const selected=plan.cases.find(c=>c.proposalId===original.id);const notes:string[]=[];const proposal=structuredClone(original);
 if(!proposal.proposedWorkflow.length&&selected?.proposedSteps.length)proposal.proposedWorkflow=selected.proposedSteps.slice(0,10);
 const supplied={...validateInputOverrides(proposal.inputs,research),...validateInputOverrides(overrides,research)};
 for(const fact of selected?.extractedInputs??[]){
 if(supplied[fact.key]?.value!=null)continue;
 const evidence=research.evidence.find(f=>f.id===fact.sourceId);const permitted=['monthlyVolume','currentMinutes','reviewMinutes','hourlyCost'].includes(fact.key);
 const numbers=(fact.quote.match(/\d+(?:[.,]\d+)?/g)??[]).map(token=>Number(token.replace(',','.')));
 const unitCue=fact.key==='monthlyVolume'?/month|monthly|kuukau|\/mo/i.test(fact.quote)&&/task|order|invoice|request|lead|ticket|document|shipment|transaction|tilaus|lasku|lähetys/i.test(fact.quote):fact.key==='hourlyCost'?/EUR|€/.test(fact.quote)&&/hour|tunti|\/h\b/i.test(fact.quote):/minute|min\b|minuut/i.test(fact.quote);
 if(!permitted||!evidence||!proposal.evidence.includes(fact.sourceId)||evidence.verification!=='verified'||fact.unit!==definitions[fact.key].unit||!normalized(evidence.sourceExcerpt).includes(normalized(fact.quote))||!numbers.includes(fact.value)||!unitCue){notes.push(`Unverified numeric extraction for ${fact.key} was excluded; use company data or an explicit scenario.`);continue;}
 supplied[fact.key]={value:fact.value,unit:fact.unit,classification:'verified',origin:'research',sourceReferences:[fact.sourceId],explanation:fact.quote};
 }
 const inputs=resolveInputs(supplied);const scenarios=createScenarios(inputs);
 const businessCase:BusinessCase={proposal,inputs,scenarios,charts:[],missingInputs:inputKeys.filter(key=>inputs[key].classification!=='verified').map(key=>({key,question:`Confirm ${definitions[key].label.toLowerCase()} (${definitions[key].unit}) with the company or proposal owner.`})),notes:[...notes,'Labor capacity released is not cash savings. Cash realization defaults to 0%; change it only for a defensible scenario.','No implementation investment, hourly labor cost or recurring price is invented. Missing financial inputs suppress financial ROI views.']};
 log('visualization.calculating','Computing operating scenarios, capacity, cash benefits, and payback in TypeScript.',{proposalId:proposal.id,inputs});
 const choices=selected?.charts??[];
 // Numeric copy belongs to the deterministic builder, not the language model.
 const safeChoices=choices.map(c=>({...c,headline:/\d|[%€$]/.test(c.headline)?`${proposal.title}: ${c.purpose.replaceAll('_',' ')}`:c.headline,sellingPoint:/\d|[%€$]/.test(c.sellingPoint)?'Validate the displayed assumptions and start with a focused Velho implementation.':c.sellingPoint}));
 businessCase.charts=buildCharts(businessCase,safeChoices);
 for(const chart of businessCase.charts){validateChart(chart);if(chart.sourceReferences.some(id=>!research.evidence.some(f=>f.id===id)))throw new ValidationError('Chart cites unknown research evidence.');}
 base.businessCases.push(businessCase);
 }
 base.limitations.push('Business cases are independent. Do not add their benefits together without checking overlapping workflows.');
 base.limitations.push('Scenario outputs are not achieved results or verified forecasts. Validate workloads, adoption, review requirements and commercial costs before making a financial commitment.');
 return base;
}
export async function visualizeCompany(researchId:number,provided:Proposal[]|undefined,overrides:unknown,runId=randomUUID()){
 const saved=(await getResearch(researchId));if(!saved)throw new ValidationError('Saved company research was not found.');
 (await createResearchRun(runId,`${saved.report.companyName} · Visualization`));const log=createResearchLogger(runId);
 try{
 const proposals=provided??saved.report.automationOpportunities.filter(o=>o.implementationApproach!=='discovery'&&!/^No implementation proposal/i.test(o.proposedSolution)).slice(0,5).map((o,i):Proposal=>({id:`research-opportunity-${i+1}`,title:o.title,process:o.title,problem:o.hypothesis,proposedSolution:o.proposedSolution,evidence:o.evidence,currentWorkflow:[],proposedWorkflow:[],currentWorkflowStatus:'unknown'}));
 const inputs=validateInputOverrides(overrides,saved.report);
 const report=await createVisualizationReport(saved.report,proposals,researchId,inputs,provided?'provided':proposals.length?'research_opportunities':'none',log);
 const artifact=(await insertVisualization(researchId,report,runId));log('visualization.completed','Business case and chart datasets saved.',{visualizationId:artifact.id,status:report.status,charts:report.businessCases.reduce((total,c)=>total+c.charts.length,0)});await log.flush();(await finishResearchRun(runId,null));return artifact;
 }catch(error){log('visualization.failed',error instanceof Error?error.message:'Visualization failed.',null,'error');await log.flush();(await finishResearchRun(runId,null,error instanceof Error?error.message:'Visualization failed.'));throw error;}
}
