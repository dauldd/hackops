import type { CompanyResearch } from './schema.ts';
export interface ResearchLead { evidence: string[]; reason: string; priority: number; queries: string[]; checks: string[] }
export function planFollowUp(report: CompanyResearch, now = new Date()): ResearchLead[] {
 if (report.identity.status !== 'confirmed') return [];
 const seen = new Set(report.researchCoverage.flatMap(c => c.queries).map(q => q.toLocaleLowerCase('en').replace(/\s+/g,' ').trim()));
 const finnish = /\b(oyj?|abp)\b/i.test(report.companyName) || /finland|suomi|helsinki|espoo|tampere|turku/i.test(report.overview.headquarters ?? '');
 const candidates: ResearchLead[] = [];
 for (const gap of report.researchGaps) {
 const findings = report.evidence.filter(f => gap.evidence.includes(f.id));
 if (gap.category === 'freshness' && findings.length && findings.every(f => f.signalType === 'company_context' && !f.categories.includes('hiring'))) continue;
 const job = findings.find(f => f.categories.includes('hiring'));
 const operational = findings.some(f => ['manual_work','integration_requirement','operational_problem','job_responsibility'].includes(f.signalType));
 const vendor = report.existingAutomation.find(v => v.evidence.some(id => gap.evidence.includes(id)));
 const fallbackTerms = gap.category === 'hiring' ? 'ERP master data integration monitoring job responsibilities' : gap.category === 'competition' ? 'ERP finance implementation partner internal automation team' : gap.category === 'financials' ? 'legal entity annual accounts revenue' : gap.question.slice(0,100);
 const terms = job ? (job.sourceExcerpt.match(/master data|integrat\w*|ERP|WMS|Excel|spreadsheet|lasku\w*|asiakas\w*/gi) ?? [job.title]).slice(0,3).join(' ') : vendor ? `${vendor.name} ${vendor.scope.slice(0,90)}` : findings[0]?.title ?? fallbackTerms;
 const focus = vendor || gap.category === 'freshness' || gap.category === 'competition' ? 'implementation completed partner remaining scope' : gap.category === 'hiring' || operational ? 'job description manual reporting integrations' : gap.category === 'financials' ? 'legal entity annual accounts' : 'documented workflow current operational requirements';
 const queries = [`"${report.companyName}" ${terms} ${focus} ${now.getUTCFullYear()}`, ...(finnish ? [`"${report.companyName}" ${terms} ${vendor ? 'käyttöönotto valmistunut kumppani nykytila' : 'työtehtävät käsin Excel integraatiot työkuorma'}`] : [])].filter(q => !seen.has(q.toLocaleLowerCase('en').replace(/\s+/g,' ').trim()));
 if (!queries.length || gap.priority === 'low') continue;
 queries.forEach(q => seen.add(q.toLocaleLowerCase('en').replace(/\s+/g,' ').trim()));
 candidates.push({ evidence: gap.evidence, reason: gap.question, priority: (operational ? 90 : gap.category === 'hiring' ? 85 : vendor ? 80 : gap.category === 'freshness' ? 75 : gap.category === 'competition' ? 65 : 35) + (gap.priority === 'high' ? 5 : 0), queries, checks: [gap.reason, 'Look for dated primary evidence and current status; do not infer inefficiency or an open project from a historical source.'] });
 }
 const unique = new Map<string, ResearchLead>();
 for (const lead of candidates.sort((a,b) => b.priority-a.priority)) {
 const key = [...lead.evidence].sort().join(',') || (lead.queries.some(q => q.includes('ERP master data integration monitoring job responsibilities')) ? 'unresearched-hiring' : lead.queries.some(q => q.includes('ERP finance implementation partner internal automation team')) ? 'unresearched-partners' : lead.reason);
 if (!unique.has(key)) unique.set(key, lead);
 }
 return [...unique.values()].slice(0,3);
}
/** Compact structured memory: do not resend the report narrative, scores, or duplicate source records. */
export function followUpMemory(report: CompanyResearch) {
 return {
 companyName: report.companyName, website: report.website, identity: report.identity, overview: report.overview, financials: report.financials,
 evidence: report.evidence.map(f => { const { freshness: _freshness, observedAt: _observedAt, ...model } = f; void _freshness; void _observedAt; return { ...model, sourceExcerpt: f.unmetNeedEvidence ? f.sourceExcerpt : f.sourceExcerpt.slice(0,1400) }; }),
 existingAutomation: report.existingAutomation, qualificationContext: report.qualificationContext,
 hypotheses: report.automationOpportunities.map(o => ({ title: o.title, evidence: o.evidence, hypothesis: o.hypothesis, discoveryQuestions: o.discoveryQuestions })),
 researchGaps: report.researchGaps, priorQueries: [...new Set(report.researchCoverage.flatMap(c => c.queries))],
 reviewedUrls: [...new Set(report.evidence.map(f => f.sourceUrl))],
 fetchedUrls: [...new Set(report.evidence.filter(f => f.retrievedAt).map(f => f.sourceUrl))],
 };
}
