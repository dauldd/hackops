import type {AutomationOpportunity,CompanyResearch} from './schema';

type OpportunityCard = AutomationOpportunity & {discoveryProposal?:boolean};
/** Supplement short saved reports with explicitly conditional discovery proposals. */
export function topOpportunityCards(report:CompanyResearch):OpportunityCard[] {
 const cards:OpportunityCard[]=[...report.automationOpportunities].sort((a,b)=>b.score-a.score).slice(0,3);
 if(report.identity.status!=='confirmed')return cards;
 const themes=[
  {title:'Connect systems and automate data handoffs',pattern:/integrat|handoff|master data|data sync/i,categories:['technology','operations'],solution:'Map one handoff between existing systems, confirm what current integrations already cover, and pilot a rules-based sync with exception handling if a manual gap remains.',value:'Could reduce duplicate entry and reconciliation work if discovery confirms a manual handoff.',question:'Which records are still transferred manually between systems, and who owns the existing integrations?'},
  {title:'Automate operational reporting and exception alerts',pattern:/report|dashboard|analytics|business intelligence/i,categories:['financials','operations','growth'],solution:'Review one recurring operational report, identify its sources and owners, and evaluate scheduled updates with alerts for exceptions that need human review.',value:'Could free reporting capacity and improve visibility if recurring preparation work is confirmed.',question:'Which recurring report still takes manual preparation, and what reporting is already automated?'},
  {title:'Streamline document intake and approval workflows',pattern:/document|invoice|approval|intake/i,categories:['operations','financials','hiring'],solution:'Trace one document or request from intake to approval. If repetitive handling remains, pilot structured capture, routing rules and a human review queue alongside existing tools.',value:'Could shorten handling time and reduce repetitive routing if document volumes and remaining manual steps justify a pilot.',question:'Which documents or requests require repeated manual handling, and which steps do existing tools already cover?'}
 ];
 for(const theme of themes){
  if(cards.length>=3)break;
  if(cards.some(o=>theme.pattern.test(o.title)))continue;
  const evidence=report.evidence.filter(f=>f.verification!=='unknown'&&f.categories.some(c=>theme.categories.includes(c))).slice(0,2);
  const context=evidence.length?evidence:report.evidence.filter(f=>f.verification!=='unknown').slice(0,1);
  if(!context.length)continue;
  cards.push({title:theme.title,description:'Discovery proposal based on company context; an unmet need has not been established.',hypothesis:`Explore whether this workflow could benefit ${report.companyName}. The retained research provides context, not proof of a manual bottleneck or buying intent.`,proposedSolution:theme.solution,businessValue:theme.value,evidence:context.map(f=>f.id),confidence:'low',score:0,scoreBreakdown:{relevance:0,evidenceStrength:0,businessImpact:0,growth:0,automationFit:0},scoreExplanation:'Not scored until workflow suitability is validated.',relevantVelhoService:'Workflow automation and integrations',discoveryQuestions:[theme.question,'What would a useful pilot achieve, and how would its value be measured?'],implementationApproach:'discovery',simplicityRationale:'Validate remaining work before choosing an implementation.',existingSolutionAssessment:{status:'unknown',evidence:[],rationale:'Existing coverage must be confirmed.'},evidenceStrength:'context_only',discoveryProposal:true});
 }
 return cards;
}
