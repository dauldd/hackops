import 'server-only';
import { randomUUID } from 'node:crypto';
import { insertResearch, createResearchRun, finishResearchRun } from '../db.ts';
import { parseCompanyName, parseResearch, type CompanyResearch } from './schema.ts';
import { planFollowUp } from './planning.ts';
import { refreshQualification } from './quality.ts';
import { requestResearch } from './openrouter.ts';
import { createResearchLogger, type ResearchLogger } from './logging.ts';
type ToolUsage = { web_search_requests?: number; web_fetch_requests?: number; tool_calls_executed?: number };
function toolUsageOf(usage: unknown): ToolUsage {
 const value = usage as { server_tool_use?: ToolUsage; server_tool_use_details?: ToolUsage } | null;
 const tools = { ...(value?.server_tool_use_details ?? value?.server_tool_use ?? {}) };
 // These requests enable only search and fetch, with explicitly non-native engines.
 if (tools.web_fetch_requests === undefined && typeof tools.web_search_requests === 'number' && typeof tools.tool_calls_executed === 'number' && tools.tool_calls_executed >= tools.web_search_requests) tools.web_fetch_requests = tools.tool_calls_executed - tools.web_search_requests;
 return tools;
}
function insufficientDepth(usage: ToolUsage) {
 return (typeof usage.web_search_requests === 'number' && usage.web_search_requests < 2) || (typeof usage.web_fetch_requests === 'number' && usage.web_fetch_requests < 1);
}
function validateRequestedIdentity(report: CompanyResearch, name: string, log: ResearchLogger) {
 for (const limitation of report.limitations.filter(item => item.includes('has been set to unknown'))) log('validation.metadata', limitation, null, 'warning');
 const canonicalName = (value: string) => value.toLocaleLowerCase('en').replace(/\b(oyj|oy|abp|ab|ltd|limited|inc|corporation|corp|llc)\b/g, '').replace(/[^\p{L}\p{N}]/gu, '');
 if (report.identity.status === 'confirmed' && canonicalName(report.companyName) !== canonicalName(name)) {
 const candidate = report.companyName;
 log('identity', 'Provider selected a different company name; removing unattributable business conclusions.', { requested: name, candidate }, 'warning');
 report.companyName = name;
 report.identity = { status: 'ambiguous', explanation: `Research returned ${candidate} for the requested company ${name}. No exact legal-name or alias match has been established, so the candidate's business findings have not been attributed.`, sourceUrls: report.identity.sourceUrls };
 report.website = null;
 report.overview = { description: null, industry: null, headquarters: null, employeeCount: null, businessModel: null, productsAndServices: [], customerSegments: [], geographicOperations: [], businessStructure: null, sourceUrls: [] };
 report.financials = { revenue: null, currency: null, financialYear: null, employeeCount: null, summary: null, sourceUrls: [] };
 report.evidence = []; report.existingAutomation = []; report.researchGaps = []; report.qualificationContext = { businessModelRelevance: 'unknown', relevanceExplanation: 'Identity unresolved.', deliverySuitability: 'unknown', deliveryExplanation: 'Identity unresolved.', evidence: [] };
 report.hiringSignals = []; report.growthSignals = []; report.technologySignals = []; report.operationalSignals = []; report.automationOpportunities = []; report.overallScore = 0;
 report.executiveSummary = report.identity.explanation;
 report.researchCoverage = report.researchCoverage.map(item => ({ ...item, outcome: item.category === 'identity' ? report.identity.explanation : 'Business research concerned a differently named candidate and was withheld pending identity confirmation.' }));
 }
 return report;
}
/** Independently callable entry point for downstream prospecting agents. */
export async function researchCompany(companyName: string, request = requestResearch, options: { runId?: string } = {}) {
 const name = parseCompanyName(companyName);
 const runId = options.runId ?? randomUUID();
 createResearchRun(runId, name);
 const persistLog = createResearchLogger(runId);
 const providerUsages: unknown[] = [];
 let providerAttempts = 0;
 const log: ResearchLogger = (stage, message, details, level) => {
 if (stage === 'provider.request') providerAttempts++;
 if (stage === 'provider.result' && details && typeof details === 'object' && 'usage' in details) providerUsages.push((details as { usage: unknown }).usage);
 persistLog(stage, message, details, level);
 };
 const started = Date.now();
 log('input', 'Company research started.', { companyName: name, runId });
 try {
 log('planning', 'Research instructions prepared: identify the legal entity, plan targeted searches, follow leads, extract evidence, and assess Velho opportunities.', { categories: ['identity', 'overview', 'hiring', 'growth', 'technology', 'financials', 'operations'] });
 let result = await request(name, undefined, log);
 log('validation', 'Validating report structure, source URLs, identity, dates, financial attribution, and opportunity evidence links.');
 let report = validateRequestedIdentity(parseResearch(result.report), name, log);
 let toolUsage = toolUsageOf(result.usage);
 let followUpFailed = false;
 const leads = planFollowUp(report);
 if (report.identity.status === 'confirmed' && (insufficientDepth(toolUsage) || leads.length > 0)) {
 const remaining = 240000 - (Date.now() - started);
 log('research.followup', 'Investigating prioritized evidence and commercial gaps before qualification.', { toolUsage, leads, remainingMilliseconds: remaining }, 'warning');
 if (remaining >= 15000) {
 try {
 const followUp = await request(name, undefined, log, { timeoutMs: remaining, followUp: { report, reason: insufficientDepth(toolUsage) ? 'Research depth is incomplete. Perform targeted searches and fetch promising primary sources.' : 'Follow the specific operational responsibilities, current project status and existing partner gaps listed in leads. Do not add generic company background.', leads } });
 const nextReport = validateRequestedIdentity(parseResearch(followUp.report), name, log);
 const nextUsage = toolUsageOf(followUp.usage);
 const combined: ToolUsage = {};
 for (const key of ['web_search_requests', 'web_fetch_requests'] as const) if (typeof toolUsage[key] === 'number' || typeof nextUsage[key] === 'number') combined[key] = (toolUsage[key] ?? 0) + (nextUsage[key] ?? 0);
 result = { ...followUp, usage: { researchPasses: [result.usage, followUp.usage], server_tool_use_details: combined }, annotations: [...result.annotations, ...followUp.annotations] };
 report = nextReport; toolUsage = combined;
 } catch (error) {
 followUpFailed = true;
 report.limitations.push('Targeted follow-up research could not complete; unresolved commercial and operational questions remain open.');
 log('research.followup', 'Follow-up research could not complete; retaining the initial sourced findings as a partial report.', { error: error instanceof Error ? error.message : 'Unknown follow-up error' }, 'warning');
 }
 }
 }
 log('identity', `Company identification: ${report.identity.status}.`, report.identity);
 log('evidence', 'Research findings extracted and structurally validated.', { coverage: report.researchCoverage, evidence: report.evidence, categoryReferences: { hiring: report.hiringSignals, growth: report.growthSignals, technology: report.technologySignals, operations: report.operationalSignals }, existingAutomation: report.existingAutomation, gaps: report.researchGaps });
 if (report.identity.status !== 'confirmed') {
 report.researchStatus = 'identity_unresolved';
 report.limitations.push('Company identity could not be confirmed. This is an incomplete identification report; no business findings or automation opportunities are attributed to the company.');
 log('validation', 'Saving an incomplete identification report. Business-research depth checks do not apply to an unresolved company; no business conclusions are permitted.', { identityStatus: report.identity.status, toolUsage }, 'warning');
 } else if (insufficientDepth(toolUsage)) {
 report.researchStatus = 'partial';
 report.limitations.push('Research coverage is incomplete: provider telemetry reports fewer than two searches or no webpage retrieval, even after the follow-up attempt. Sourced findings are retained, but automation opportunities and qualification scores are withheld pending further research.');
 report.automationOpportunities = []; report.overallScore = 0;
 log('validation', 'Saving a partial report with sourced findings. Opportunities and scores withheld because research coverage is limited.', toolUsage, 'warning');
 } else {
 report.researchStatus = followUpFailed ? 'partial' : 'complete';
 }
 if (report.identity.status === 'confirmed' && (toolUsage.web_search_requests === undefined || toolUsage.web_fetch_requests === undefined)) {
 report.limitations.push('The provider did not report complete search/fetch usage. Research coverage is model-reported and could not be independently confirmed.');
 log('validation', 'Provider tool-use telemetry is incomplete; limitation added to the report.', toolUsage, 'warning');
 }
 refreshQualification(report);
 const passes = providerUsages.length ? providerUsages : (result.usage as { researchPasses?: unknown[] } | null)?.researchPasses ?? [result.usage];
 const tokens = (key: string) => { const values = passes.map(p => (p as Record<string, unknown> | null)?.[key]).filter((v): v is number => typeof v === 'number'); return values.length ? values.reduce((a,b) => a+b,0) : null; };
 const cached = passes.map(p => (p as { prompt_tokens_details?: { cached_tokens?: number } } | null)?.prompt_tokens_details?.cached_tokens).filter((value): value is number => typeof value === 'number');
 const inputTokens = tokens('prompt_tokens');
 const cachedInputTokens = cached.length ? cached.reduce((a,b) => a+b,0) : null;
 const totalToolUsage = passes.map(toolUsageOf);
 const sumTools = (key: 'web_search_requests' | 'web_fetch_requests') => { const values = totalToolUsage.map(p => p[key]).filter((value): value is number => typeof value === 'number'); return values.length ? values.reduce((a,b) => a+b,0) : null; };
 report.researchMetrics = { passes: Math.max(providerAttempts, passes.length), inputTokens, cachedInputTokens, uncachedInputTokens: inputTokens === null || cachedInputTokens === null ? null : Math.max(0, inputTokens-cachedInputTokens), usageComplete: providerAttempts > 0 ? providerUsages.length === providerAttempts : inputTokens !== null, outputTokens: tokens('completion_tokens'), searchRequests: sumTools('web_search_requests'), fetchRequests: sumTools('web_fetch_requests'), uniqueSources: new Set(report.evidence.map(f => f.sourceUrl)).size };
 log('qualification', 'Customer fit, evidence-constrained automation potential, and commercial attractiveness assessed independently.', report.qualification);
 log('efficiency', 'Research usage and unique source coverage.', report.researchMetrics);
 log('scoring', 'Opportunity scores constrained by evidence, freshness, confidence, and existing solution coverage.', { overallScore: report.overallScore, opportunities: report.automationOpportunities });
 log('persistence', 'Saving validated report in SQLite.');
 const saved = insertResearch(name, report, result.model, result.usage, result.annotations);
 log('completed', 'Research report saved and available to downstream agents.', { reportId: saved.id, researchStatus: report.researchStatus, researchedAt: report.researchedAt });
 finishResearchRun(runId, saved.id);
 return { ...saved, runId };
 } catch (error) {
 const message = error instanceof Error ? error.message : 'Unknown research error';
 log('failed', message, { errorType: error instanceof Error ? error.name : 'Unknown' }, 'error');
 finishResearchRun(runId, null, message);
 throw error;
 }
}
