import { ValidationError, safeUrl } from './schema.ts';
import type { AutomationOpportunity, CompanyResearch, EvidenceCategory, ExistingAutomation, LegacyCompanyResearch, LegacyResearchFinding, Qualification, ResearchFinding, ResearchInput } from './schema.ts';
const categoryFields = { hiringSignals: 'hiring', growthSignals: 'growth', technologySignals: 'technology', operationalSignals: 'operations' } as const;
const credible = new Set(['official', 'job_posting', 'annual_report', 'registry', 'vendor_case_study']);
const confidenceRank = { low: 0, medium: 1, high: 2 };
const normalizedText = (text: string) => text.toLocaleLowerCase('en').replace(/\s+/g, ' ').trim();
function dateOnly(value: string | null, now: Date, allowFuture = false) {
 if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
 const date = Date.parse(value);
 return Number.isFinite(date) && new Date(date).toISOString().slice(0, 10) === value && (allowFuture || date <= now.getTime()) ? value : null;
}
function recent(value: string | null, now: Date) { return Boolean(value && Date.parse(value) <= now.getTime() && now.getTime() - Date.parse(value) <= 365 * 86400000); }
function sourceKey(value: string) {
 const url = new URL(safeUrl(value)); url.hash = '';
 for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid|gclid)/i.test(key)) url.searchParams.delete(key);
 return url.href.replace(/\/$/, '');
}
function legacySourceType(f: LegacyResearchFinding): ResearchFinding['sourceType'] {
 if (/myworkdayjobs|\/jobs?\//i.test(f.sourceUrl) || (/\/careers?\//i.test(f.sourceUrl) && /job|role|position|responsibil|vacanc|key user|tehtäv|työpa|haemme/i.test(`${f.title} ${f.description} ${f.sourceExcerpt}`))) return 'job_posting';
 if (/linkedin\.com\/in\//i.test(f.sourceUrl)) return 'professional_profile';
 if (/career-guide/i.test(f.sourceUrl)) return 'aggregator';
 if (/tietoevry|infosys|infor\./i.test(f.sourceUrl)) return 'vendor_case_study';
 return 'other'; // Legacy records have not had their credibility/verification labels checked.
}
function upgradeLegacy(old: LegacyCompanyResearch): ResearchInput {
 const evidence: ResearchFinding[] = [];
 for (const [field, category] of Object.entries(categoryFields)) for (const f of old[field as keyof typeof categoryFields]) evidence.push({ ...f, categories: [category], verification: 'inferred', sourceType: legacySourceType(f), eventDate: null, retrievedAt: null, status: 'unknown', statusEvidence: [], signalType: legacySourceType(f) === 'job_posting' ? 'job_responsibility' : category === 'technology' ? 'existing_solution' : 'company_context', unmetNeedEvidence: null });
 const opportunities: AutomationOpportunity[] = old.automationOpportunities.map(o => ({ ...o, description: `Potential workflow to investigate: ${o.title}. A current unmet need has not been established.`, implementationApproach: 'integration', simplicityRationale: 'Start by checking existing systems and considering a narrow integration or workflow before proposing AI.', existingSolutionAssessment: { status: 'unknown', evidence: [], rationale: 'The previous report did not assess whether existing partners already address this workflow.' } }));
 const existingAutomation: ExistingAutomation[] = [];
 for (const f of evidence.filter(f => f.categories.includes('technology'))) for (const name of ['SAP', 'Workday', 'Infor', 'Infosys', 'Tietoevry']) if (new RegExp(`\\b${name}\\b`, 'i').test(`${f.title} ${f.description} ${f.sourceExcerpt}`)) {
 const previous = existingAutomation.find(item => item.name === name);
 if (previous) previous.evidence.push(f.id);
 else existingAutomation.push({ id: `legacy-vendor-${name.toLowerCase()}`, name, kind: ['Infosys','Tietoevry'].includes(name) ? 'vendor' : 'platform', scope: f.title, evidence: [f.id], status: 'unknown', statusEvidence: [], implication: 'unknown', rationale: 'Legacy technology reference; current coverage, completion status and any remaining need require verification.' });
 }
 return { ...old, evidence, hiringSignals: [], growthSignals: [], technologySignals: [], operationalSignals: [], automationOpportunities: opportunities, existingAutomation, researchGaps: [{ id: 'legacy-verification', category: 'qualification', question: 'Which findings remain current, verified and commercially actionable?', reason: 'This report predates the evidence and commercial qualification schema. Its historical claims and confidence are not treated as newly verified.', priority: 'high', evidence: [] }], qualificationContext: { businessModelRelevance: 'unknown', relevanceExplanation: 'Customer relevance was not assessed separately in the legacy report.', deliverySuitability: 'unknown', deliveryExplanation: 'Delivery scope and existing partner coverage need discovery.', evidence: [] } };
}
export function isCurrentNeed(f: ResearchFinding, now = new Date()) {
 return f.verification === 'verified' && credible.has(f.sourceType) && ['operational_problem','integration_requirement'].includes(f.signalType) && Boolean(f.unmetNeedEvidence) && recent(f.eventDate ?? f.sourceDate, now) && ['current','ongoing'].includes(f.status);
}
function addGap(report: ResearchInput, id: string, category: string, question: string, reason: string, evidence: string[] = []) {
 if (!report.researchGaps.some(g => g.id === id)) report.researchGaps.push({ id, category, question, reason, priority: 'high', evidence });
}
export function assessQualification(report: ResearchInput, now = new Date()): Qualification {
 const count = report.overview.employeeCount ?? report.financials.employeeCount;
 const segment = count === null ? 'unknown' : count < 10 ? 'micro' : count < 50 ? 'small' : count < 250 ? 'medium' : 'enterprise';
 const context = report.qualificationContext;
 const fitReasons = [count === null ? 'Headcount is unknown; SME fit is not established.' : `${count} employees: ${segment} size segment. Velho prioritizes SMEs; this is a prospecting heuristic, not a legal SME classification.`, context.relevanceExplanation, context.deliveryExplanation];
 let fit: number | null = null;
 if (report.identity.status === 'confirmed' && segment !== 'unknown') {
 const size = segment === 'enterprise' ? 25 : 80;
 const relevance = { high: 15, medium: 0, low: -20, unknown: -10 }[context.businessModelRelevance];
 const delivery = { suitable: 5, narrow_pilot_only: -10, unsuitable: -25, unknown: -5 }[context.deliverySuitability];
 fit = Math.max(0, Math.min(100, size + relevance + delivery));
 fitReasons.push(`Fit rubric: size ${size}, relevance ${relevance >= 0 ? '+' : ''}${relevance}, delivery ${delivery >= 0 ? '+' : ''}${delivery}.`);
 }
 const strength = Math.max(0, ...report.automationOpportunities.map(o => o.score));
 const currentNeeds = report.evidence.filter(f => isCurrentNeed(f, now));
 const candidates = report.automationOpportunities.filter(o => o.existingSolutionAssessment.status !== 'already_addressed');
 const relevantStrength = Math.max(0, ...candidates.map(o => o.score));
 const trigger = currentNeeds.length ? 90 : report.evidence.some(f => f.signalType === 'workload_growth' && f.verification === 'verified' && f.freshness === 'recent') ? 50 : 0;
 const coverageUnknown = !report.researchCoverage.some(c => c.category === 'competition' && c.queries.length) || candidates.some(o => o.existingSolutionAssessment.status === 'unknown');
 const partnerPenalty = coverageUnknown ? 10 : 0;
 let commercial = fit === null ? null : !candidates.length ? 0 : Math.max(0, Math.min(fit, Math.round(relevantStrength * 0.6 + trigger * 0.4)) - partnerPenalty);
 if (commercial !== null && !currentNeeds.length) commercial = Math.min(commercial, 35);
 const reasons = [`Commercial rubric: eligible opportunity strength ${relevantStrength} × 0.6 + current trigger ${trigger} × 0.4, capped by customer fit; partner-coverage uncertainty penalty ${partnerPenalty}.`, currentNeeds.length ? 'Recent verified unmet-need evidence supports a discovery conversation.' : 'No recent verified unmet-need evidence: commercial attractiveness is capped at 35.', candidates.length ? 'Existing solutions are assessed per workflow; involvement alone neither proves a gap nor rules out a narrow project.' : 'No opportunity remains outside already-addressed workflows.'];
 if (segment === 'enterprise') reasons.push('Enterprise scale reduces fit for an SME-focused provider even where automation potential is substantial. Consider only a realistic, narrow delivery scope.');
 if (coverageUnknown) reasons.push('Current vendor coverage or remaining scope is unverified; establish this before proposing a project.');
 return { customerFit: { score: fit, segment, sizeBasis: count === null ? 'unknown' : 'sourced employee count', reasons: fitReasons, evidence: context.evidence }, automationOpportunity: { score: strength, reasons: ['Strongest evidence-constrained opportunity score; this measures automation potential, not customer fit or buying intent.'], evidence: [...new Set(report.automationOpportunities.flatMap(o => o.evidence))] }, commercialAttractiveness: { score: commercial, reasons, evidence: [...new Set([...currentNeeds.map(f => f.id), ...candidates.flatMap(o => o.evidence)])] }, recommendation: fit === null || report.identity.status !== 'confirmed' ? 'insufficient_evidence' : (commercial ?? 0) >= 65 ? 'prioritize' : segment === 'enterprise' || (commercial ?? 0) < 20 ? 'deprioritize' : 'discovery_only', scoringMethod: 'v2: explicit SME-fit rubric; opportunity dimension mean constrained by evidence strength/confidence; commercial score combines eligible strength and current need, capped by fit and adjusted for partner uncertainty. Unknown fit stays null.' };
}
export function refreshQualification(report: CompanyResearch, now = new Date()) {
 // Headcount can refer to a group, LinkedIn profiles, a subsidiary, or another year.
 // Preserve contradictory source figures as context instead of inventing exact scope.
 const staffFigures: { count: number; evidence: string }[] = [];
 for (const f of report.evidence) {
 if (f.freshness === 'historical') continue;
 const text = f.sourceExcerpt;
 for (const pattern of [/(?:employee(?:s| count)?|co.workers?|headcount|employs?|työllistää|henkilöstö)[^\d\n]{0,24}(\d[\d ,]*)/gi, /(\d[\d ,]*)\s+(?:employees|co.workers|professionals|henkilöä|työntekijää|ammattilaista|medarbetare)/gi]) {
 for (const match of text.matchAll(pattern)) { const count = Number(match[1].replace(/[^\d]/g,'')); if (count > 0 && count < 10000000) staffFigures.push({ count, evidence: f.id }); }
 }
 }
 const counts = [...new Set([report.overview.employeeCount, report.financials.employeeCount, ...(report.entityScope?.reportedEmployeeCounts ?? []), ...staffFigures.map(f => f.count)].filter((count): count is number => typeof count === 'number'))].sort((a,b) => a-b);
 const conflict = counts.length > 1 && ((counts[0] < 250 && counts.at(-1)! >= 250) || counts.at(-1)! >= counts[0] * 2);
 if (conflict) {
 report.overview.employeeCount = null; report.financials.employeeCount = null;
 const note = `Conflicting headcount figures (${counts.join(', ')}) may refer to different group/entity scopes or reporting bases. The target-company headcount and size-based fit are unknown pending verification.`;
 if (!report.limitations.includes(note)) report.limitations.push(note);
 addGap(report, 'employee-entity-scope', 'qualification', 'Which current headcount belongs to the exact target legal entity, rather than its group or LinkedIn profiles?', note, [...new Set(staffFigures.map(f => f.evidence))]);
 }
 report.entityScope = { employeeCount: conflict ? 'unresolved' : (report.overview.employeeCount ?? report.financials.employeeCount) === null ? 'unknown' : 'reported_target', reportedEmployeeCounts: counts, evidence: [...new Set(staffFigures.map(f => f.evidence))] };
 report.qualification = assessQualification(report, now);
 report.overallScore = report.qualification.automationOpportunity.score ?? 0; // Backward-compatible automation-only alias.
 report.executiveSummary = `${report.companyName}: ${report.evidence.length} source-backed findings, ${report.qualification.customerFit.segment} size profile, and ${report.automationOpportunities.length} automation hypotheses. Customer fit ${report.qualification.customerFit.score ?? 'unknown'}/100; automation potential ${report.overallScore}/100; commercial attractiveness ${report.qualification.commercialAttractiveness.score ?? 'unknown'}/100. Recommendation: ${report.qualification.recommendation}. ${report.researchGaps.length} research gaps remain.`;
 return report;
}
export function normalizeResearch(input: ResearchInput | LegacyCompanyResearch, now: Date, legacy = false): CompanyResearch {
 const report = (legacy ? upgradeLegacy(input as LegacyCompanyResearch) : input) as ResearchInput;
 const registry = new Map<string, ResearchFinding>();
 const aliases = new Map<string, string>();
 const duplicateKeys = new Map<string, string>();
 for (const f of report.evidence) {
 safeUrl(f.sourceUrl);
 if (!f.categories.length) { f.categories = ['overview']; report.limitations.push(`Evidence ${f.id} had no category and is retained as unclassified company context.`); }
 const key = `${sourceKey(f.sourceUrl)}|${normalizedText(f.sourceExcerpt)}`;
 const priorId = aliases.get(f.id);
 if (priorId && `${sourceKey(registry.get(priorId)!.sourceUrl)}|${normalizedText(registry.get(priorId)!.sourceExcerpt)}` !== key) throw new ValidationError(`Conflicting evidence ID ${f.id}`);
 const canonical = duplicateKeys.get(key);
 if (canonical) {
 const previous = registry.get(canonical)!;
 previous.categories = [...new Set([...previous.categories, ...f.categories])];
 if (normalizedText(previous.description) !== normalizedText(f.description)) previous.description += ` ${f.description}`;
 // Duplicates can never strengthen the verification/confidence of a shared record.
 if (f.verification !== 'verified') previous.verification = f.verification === 'unknown' || previous.verification === 'unknown' ? 'unknown' : 'inferred';
 aliases.set(f.id, canonical); continue;
 }
 aliases.set(f.id, f.id); duplicateKeys.set(key, f.id); registry.set(f.id, f);
 }
 report.evidence = [...registry.values()];
 const refs = (values: string[], context: string, required = false): string[] => {
 const mapped = [...new Set(values.flatMap(id => /^https?:\/\//i.test(id) ? report.evidence.filter(f => sourceKey(f.sourceUrl) === sourceKey(id)).map(f => f.id).concat(report.evidence.some(f => sourceKey(f.sourceUrl) === sourceKey(id)) ? [] : [id]) : [aliases.get(id) ?? id]))];
 const invalid = mapped.filter(id => !registry.has(id));
 if (required && (!mapped.length || invalid.length)) throw new ValidationError(`${context} needs valid finding IDs`);
 if (invalid.length) report.limitations.push(`${context}: unresolved evidence references were withheld (${invalid.join(', ')}); no unsupported status or qualification claim is treated as verified.`);
 return mapped.filter(id => registry.has(id));
 };
 if (!legacy) for (const [field, category] of Object.entries(categoryFields)) {
 const supplied = report[field as keyof typeof categoryFields];
 const known = supplied.filter(id => aliases.has(id) || registry.has(id));
 if (known.length !== supplied.length) report.limitations.push(`Unresolved ${field} references were withheld. The category index was regenerated from the canonical evidence categories; no source facts were invented.`);
 for (const id of refs(known, field)) registry.get(id)!.categories = [...new Set([...registry.get(id)!.categories, category as EvidenceCategory])];
 }
 for (const f of report.evidence) {
 f.categories = [...new Set(f.categories)];
 f.statusEvidence = refs(f.statusEvidence, `Status evidence for ${f.id}`);
 const original = f.sourceDate;
 f.sourceDate = dateOnly(f.sourceDate, now);
 if (original !== null && f.sourceDate === null) report.limitations.push(`Publication date for evidence ${f.id} was invalid or in the future (${original}); it has been set to unknown and must be checked at the source.`);
 const originalEvent = f.eventDate; f.eventDate = dateOnly(f.eventDate, now, true);
 if (originalEvent && !f.eventDate) report.limitations.push(`Event date for ${f.id} could not be resolved; no exact event date is asserted.`);
 if (f.retrievedAt && (!Number.isFinite(Date.parse(f.retrievedAt)) || Date.parse(f.retrievedAt) > now.getTime() || !f.retrievedAt.includes('T'))) f.retrievedAt = null;
 if (/linkedin\.com\/in\//i.test(f.sourceUrl)) f.sourceType = 'professional_profile';
 f.observedAt = now.toISOString();
 const date = f.eventDate ?? f.sourceDate;
 f.freshness = !date ? 'undated' : Date.parse(date) > now.getTime() ? 'future' : recent(date, now) ? 'recent' : 'historical';
 if (f.sourceType === 'job_posting' || (/myworkdayjobs|\/jobs?\/[^/?]+/i.test(f.sourceUrl) && !['professional_profile','aggregator'].includes(f.sourceType))) {
 f.sourceType = 'job_posting'; f.categories = [...new Set([...f.categories, 'hiring' as const])];
 if (/integrat|master data|ERP|WMS|spreadsheet|Excel|order|invoice|asiakas|lasku|tiedon/i.test(`${f.description} ${f.sourceExcerpt}`)) f.categories = [...new Set([...f.categories, 'operations' as const])];
 }
 if (['professional_profile','aggregator'].includes(f.sourceType) && f.categories.includes('hiring')) {
 f.categories = f.categories.filter(category => category !== 'hiring');
 if (!f.categories.length) f.categories = ['overview'];
 addGap(report, `vacancy-${f.id}`, 'hiring', 'Is there an actual vacancy or dated recruitment announcement?', 'A professional profile or generic career guide is not evidence of current company hiring.', [f.id]);
 }
 if (f.sourceType === 'vendor_case_study' && /you can integrate|how to integrate|seamless freight transport integration between/i.test(f.sourceExcerpt)) {
 f.verification = 'inferred'; f.signalType = 'company_context'; f.status = 'unknown';
 f.description = `Integration catalogue capability (target deployment unverified): ${f.description}`;
 addGap(report, `deployment-${f.id}`, 'technology', 'Does the target actually use this software/integration, or is it an available carrier connector?', 'A vendor integration catalogue is not proof that the target operates the listed customer ERP software.', [f.id]);
 }
 if (f.verification === 'verified' && f.sourceExcerpt.trim().length < 12) { f.verification = 'unknown'; addGap(report, `support-${f.id}`, 'evidence', 'Can this claim be supported with a relevant excerpt?', 'Source excerpt is insufficient to support a verified claim.', [f.id]); }
 if (f.unmetNeedEvidence && !normalizedText(f.sourceExcerpt).includes(normalizedText(f.unmetNeedEvidence))) {
 f.unmetNeedEvidence = null;
 addGap(report, `need-${f.id}`, 'operations', 'Is the suspected unmet need explicitly documented?', 'The proposed unmet-need quotation was not present in the retained source excerpt.', [f.id]);
 }
 if (f.verification !== 'verified' || !credible.has(f.sourceType)) f.confidence = f.verification === 'unknown' ? 'low' : confidenceRank[f.confidence] > 1 ? 'medium' : f.confidence;
 }
 for (const f of report.evidence) if (['current','ongoing'].includes(f.status)) {
 const statusSupport = f.statusEvidence.map(id => registry.get(id)!).some(s => s.verification === 'verified' && credible.has(s.sourceType) && recent(s.sourceDate, now));
 if (!statusSupport) {
 f.status = f.freshness === 'historical' && f.categories.includes('hiring') ? 'historical' : 'unknown';
 f.description = `Source statement (${f.sourceDate ?? 'publication date unknown'}): ${f.description} Current status has not been established.`;
 addGap(report, `status-${f.id}`, 'freshness', `What is the current status of ${f.title}?`, 'Current/ongoing status lacks recent verified dated support; an old announcement or retrieval timestamp does not establish it.', [f.id]);
 }
 }
 for (const f of report.evidence) if (f.categories.includes('hiring') && f.status === 'unknown') addGap(report, `hiring-${f.id}`, 'hiring', `Is the vacancy or responsibility in ${f.title} still current?`, 'A job description establishes documented work, not current hiring or inefficiency.', [f.id]);
 for (const [field, category] of Object.entries(categoryFields)) report[field as keyof typeof categoryFields] = report.evidence.filter(f => f.categories.includes(category as EvidenceCategory)).map(f => f.id);
 const supportedAutomation: ExistingAutomation[] = [];
 for (const vendor of report.existingAutomation) {
 const supported = vendor.evidence.filter(id => aliases.has(id) || registry.has(id) || (/^https?:\/\//i.test(id) && report.evidence.some(f => sourceKey(f.sourceUrl) === sourceKey(id))));
 if (!supported.length) {
 const urls = vendor.evidence.filter(id => /^https?:\/\//i.test(id)).map(safeUrl);
 const id = `unsupported-vendor-${vendor.id}`;
 addGap(report, id, 'competition', `Can the reported ${vendor.name} involvement be verified?`, 'The candidate was not linked to a retained evidence record and is excluded from verified partner/initiative findings.');
 report.researchGaps.find(g => g.id === id)!.sourceUrls = urls;
 report.limitations.push(`Existing automation candidate ${vendor.name} was withheld because no retained evidence record supports it.`);
 continue;
 }
 supportedAutomation.push(vendor);
 vendor.evidence = supported;
 vendor.statusEvidence = vendor.statusEvidence.filter(id => aliases.has(id) || registry.has(id) || (/^https?:\/\//i.test(id) && report.evidence.some(f => sourceKey(f.sourceUrl) === sourceKey(id))));

 vendor.evidence = refs(vendor.evidence, `Existing automation ${vendor.id}`, true);
 vendor.statusEvidence = refs(vendor.statusEvidence, `Automation status ${vendor.id}`);
 if (['current','ongoing'].includes(vendor.status) && !vendor.statusEvidence.some(id => { const f = registry.get(id)!; return f.verification === 'verified' && credible.has(f.sourceType) && recent(f.sourceDate, now); })) {
 vendor.status = 'unknown'; addGap(report, `vendor-${vendor.id}`, 'competition', `Has ${vendor.name}'s ${vendor.scope} work completed, and what remains outside its scope?`, 'Historical vendor involvement does not prove an ongoing implementation or an unaddressed need.', vendor.evidence);
 }
 if (['potential_gap','partially_addressed'].includes(vendor.implication) && !vendor.evidence.some(id => isCurrentNeed(registry.get(id)!, now))) {
 vendor.implication = 'unknown'; vendor.rationale += ' A remaining unmet gap is not established by the cited evidence.';
 }
 if (vendor.status === 'unknown') addGap(report, `vendor-${vendor.id}`, 'competition', `What does ${vendor.name} currently cover, and is any relevant gap still unaddressed?`, 'Partner involvement can either cover the need or leave a narrow complementary opportunity.', vendor.evidence);
 }
 report.existingAutomation = supportedAutomation;
 report.qualificationContext.evidence = refs(report.qualificationContext.evidence, 'Company qualification');
 if (!report.qualificationContext.evidence.some(id => registry.get(id)!.verification === 'verified')) {
 report.qualificationContext.businessModelRelevance = 'unknown'; report.qualificationContext.deliverySuitability = 'unknown';
 }
 for (const gap of report.researchGaps) gap.evidence = refs(gap.evidence, `Research gap ${gap.id}`);
 if (new Set(report.existingAutomation.map(v => v.id)).size !== report.existingAutomation.length) throw new ValidationError('Duplicate existing automation ID');
 const supportedOpportunities: AutomationOpportunity[] = [];
 for (const o of report.automationOpportunities) {
 try { o.evidence = refs(o.evidence, 'Opportunity', true); }
 catch {
 report.limitations.push(`Opportunity ${o.title} was withheld because its supporting evidence references could not be validated.`);
 addGap(report, `opportunity-support-${supportedOpportunities.length}-${report.researchGaps.length}`, 'operations', `Can the proposed ${o.title} workflow be supported by sourced evidence?`, 'The suggested proposal was not retained because its evidence graph was incomplete.');
 continue;
 }
 supportedOpportunities.push(o);
 o.existingSolutionAssessment.evidence = refs(o.existingSolutionAssessment.evidence, 'Existing solution assessment');
 if (o.existingSolutionAssessment.status !== 'unknown' && !o.existingSolutionAssessment.evidence.length) { o.existingSolutionAssessment.status = 'unknown'; o.existingSolutionAssessment.rationale = 'No evidence supports the claimed coverage status; verify existing scope before proposing work.'; }
 const support = o.evidence.map(id => registry.get(id)!);
 const direct = support.some(f => isCurrentNeed(f, now));
 const documented = support.some(f => ['manual_work','integration_requirement','operational_problem','job_responsibility'].includes(f.signalType) && f.verification !== 'unknown');
 const allStale = support.every(f => f.freshness !== 'recent');
 if (!documented && !direct) {
 o.hypothesis = `A specific unmet need for ${o.title} has not been established. Existing technology or operational scale alone does not demonstrate a problem.`;
 o.proposedSolution = 'No implementation proposal yet. Verify whether a specific manual task, operational bottleneck, or unmet integration requirement exists outside existing solution scope.';
 o.businessValue = 'Business value cannot be established until a specific unaddressed workflow and its workload are verified.';
 }
 o.evidenceStrength = direct ? 'direct_need' : documented ? 'documented_work' : support.some(f => f.verification !== 'unknown') ? 'context_only' : 'insufficient';
 const cap: ResearchFinding['confidence'] = direct && o.existingSolutionAssessment.status !== 'already_addressed' && o.existingSolutionAssessment.status !== 'unknown' ? 'high' : documented && !allStale && o.existingSolutionAssessment.status !== 'already_addressed' ? 'medium' : 'low';
 o.validationNotes = [];
 if (confidenceRank[o.confidence] > confidenceRank[cap]) { o.validationNotes.push(`Confidence reduced from ${o.confidence} to ${cap}: evidence does not establish a current unmet need with verified remaining scope.`); o.confidence = cap; }
 if (!direct) o.validationNotes.push('Documented duties or technology adoption do not establish an unmet need or inefficiency. Validate the problem before outreach.');
 if (allStale) o.validationNotes.push('All supporting event/publication dates are historical, undated, or future; no current buying trigger is established.');
 if (o.existingSolutionAssessment.status === 'already_addressed') o.validationNotes.push('Existing solutions address this workflow; excluded from eligible commercial opportunities.');
 const aiTaskSupported = support.some(f => f.verification === 'verified' && /unstructured|document|email|enquir|multilingual|language|image|OCR|vapaa.{0,12}teksti|asiakasviest|dokument|kuvantunnist/i.test(f.sourceExcerpt));
 if (o.implementationApproach === 'ai' && (!direct || !aiTaskSupported)) {
 o.implementationApproach = 'integration';
 o.proposedSolution = 'First map the documented workflow and existing vendor coverage. If a gap is confirmed, evaluate a small rules-based integration or workflow automation before any AI implementation.';
 o.simplicityRationale = 'Evidence does not yet justify a complex AI project; begin with discovery and the simplest viable integration.';
 o.validationNotes.push('Unjustified AI recommendation replaced with a discovery-first integration approach.');
 }
 o.scoreBreakdown.evidenceStrength = direct ? 85 : documented ? (allStale ? 25 : 55) : o.evidenceStrength === 'context_only' ? 15 : 0;
 o.scoreBreakdown.growth = Math.min(o.scoreBreakdown.growth, report.evidence.some(f => f.categories.includes('growth') && f.verification === 'verified' && f.freshness === 'recent') ? 100 : 0);
 o.score = Math.min({ high: 95, medium: 65, low: 35 }[o.confidence], Math.round(Object.values(o.scoreBreakdown).reduce((a,b) => a+b,0) / 5));
 o.scoreExplanation = `Equal-weight mean of the five displayed dimensions, capped at ${{ high: 95, medium: 65, low: 35 }[o.confidence]} for ${o.confidence} confidence. Evidence: ${o.evidenceStrength}; growth points require recent verified growth. ${o.validationNotes.join(' ')}`;
 if (!o.discoveryQuestions.length) o.discoveryQuestions.push('Is this workflow still relevant, what remains manual or problematic, and what do existing systems or partners already address?');
 }
 report.automationOpportunities = supportedOpportunities;
 if (report.financials.revenue !== null && /\b(group|konserni|subsidiary)\b/i.test(report.financials.summary ?? '') && !/\b(group|konserni)\b/i.test(report.companyName)) {
 report.financials.revenue = null;
 report.limitations.push('A financial summary refers to group/subsidiary figures. The target-company revenue field is withheld pending entity-level verification; the sourced summary is retained as context.');
 addGap(report, 'financial-entity-scope', 'financials', 'What revenue belongs to the exact target legal entity?', 'Group or subsidiary revenue must not be attributed to the target company without confirmation.');
 }
 for (const group of [report.identity, report.overview, report.financials]) group.sourceUrls.forEach(safeUrl);
 if (report.website) safeUrl(report.website);
 if (report.identity.status === 'confirmed' && (!report.website || !report.identity.sourceUrls.length)) throw new ValidationError('Confirmed identity needs an official website and sources');
 if (Object.entries(report.overview).some(([k,v]) => k !== 'sourceUrls' && v !== null && (!Array.isArray(v) || v.length)) && !report.overview.sourceUrls.length) throw new ValidationError('Overview claims need sources');
 if (Object.entries(report.financials).some(([k,v]) => k !== 'sourceUrls' && v !== null) && !report.financials.sourceUrls.length) throw new ValidationError('Financial claims need sources');
 if (report.financials.financialYear !== null && report.financials.financialYear > now.getUTCFullYear()) throw new ValidationError('Financial year cannot be in the future');
 for (const count of [report.overview.employeeCount, report.financials.employeeCount]) if (count !== null && !Number.isInteger(count)) throw new ValidationError('Employee counts must be whole numbers');
 if (report.financials.revenue !== null && (!report.financials.currency || !/^[A-Z]{3}$/.test(report.financials.currency) || !report.financials.financialYear)) throw new ValidationError('Revenue needs currency, year and source');
 if (report.identity.status !== 'confirmed' && (report.evidence.length || report.automationOpportunities.length || report.existingAutomation.length || report.website || report.overview.sourceUrls.length || report.financials.sourceUrls.length)) throw new ValidationError('Unresolved identity cannot contain attributed research');
 const coverage = new Map<string, ResearchInput['researchCoverage'][number]>();
 for (const item of report.researchCoverage) {
 const existing = coverage.get(item.category);
 if (existing) { existing.queries = [...new Set([...existing.queries,...item.queries])]; existing.outcome = [...new Set([existing.outcome,item.outcome])].join(' '); }
 else coverage.set(item.category,item);
 }
 for (const category of ['identity','overview','hiring','growth','technology','financials','operations']) if (!coverage.has(category)) {
 coverage.set(category,{ category, queries: [], outcome: 'No performed searches were recorded for this category; coverage remains unestablished.' });
 addGap(report, `coverage-${category}`, category, `What primary evidence is available for ${category}?`, 'The provider did not establish research coverage for this category.');
 }
 report.researchCoverage = [...coverage.values()];
 const categories = new Set(coverage.keys());
 if (!categories.has('competition')) { report.researchCoverage.push({ category: 'competition', queries: [], outcome: 'Existing solutions, internal teams and partner scope were not separately investigated.' }); addGap(report, 'competition-coverage', 'competition', 'Which existing solutions or partners already address the proposed workflows?', 'Commercial qualification needs current competing/complementary scope, not just technology names.'); }
 if (report.identity.status === 'confirmed' && !report.evidence.some(f => f.sourceType === 'job_posting' && f.categories.includes('hiring'))) addGap(report, 'hiring-detail', 'hiring', 'Do current job descriptions document ERP master data, integration monitoring, manual administration, finance or order duties?', 'No concrete job-description evidence was retained; investigate official roles rather than generic career guides.');
 if (report.identity.status === 'confirmed' && !report.existingAutomation.some(v => v.kind === 'vendor' || v.kind === 'internal_team')) addGap(report, 'partner-detail', 'competition', 'Which implementation partners or internal teams cover finance, ERP and operational automation?', 'Platform names alone do not establish implementation responsibility or remaining scope.');
 report.automationOpportunities.sort((a,b) => b.score-a.score);
 return refreshQualification({ ...report, schemaVersion: 2, researchedAt: now.toISOString(), qualification: undefined as unknown as Qualification }, now);
}
