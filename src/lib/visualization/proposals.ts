import type {CompanyResearch} from '../research/schema.ts';
import {topOpportunityCards} from '../research/opportunities.ts';
import type {Proposal} from './schema.ts';

/** Reuse the report's explicit discovery cards when no implementation was established. */
export function defaultVisualizationProposals(research:CompanyResearch):Proposal[]{
 const implementation=research.automationOpportunities.filter(o=>o.implementationApproach!=='discovery'&&!/^No implementation proposal/i.test(o.proposedSolution));
 const discovery=implementation.length===0;
 const opportunities=discovery?topOpportunityCards({...research,automationOpportunities:[]}):implementation;
 return opportunities.slice(0,5).map((o,i)=>({
 id:`${discovery?'discovery':'research'}-opportunity-${i+1}`,
 title:discovery?`Discovery: ${o.title}`:o.title,
 process:o.title,problem:o.hypothesis,proposedSolution:o.proposedSolution,
 evidence:o.evidence,currentWorkflow:[],proposedWorkflow:[],currentWorkflowStatus:'unknown',
 }));
}
