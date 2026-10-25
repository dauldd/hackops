import { normalizeResearch, refreshQualification } from './quality.ts';

export type Schema = { type: string | string[]; properties?: Record<string, Schema>; items?: Schema; enum?: string[]; minimum?: number; maximum?: number; minLength?: number; maxLength?: number; maxItems?: number; required?: string[]; additionalProperties?: boolean };
const str: Schema = { type: 'string', minLength: 1, maxLength: 16000 };
const nullable: Schema = { type: ['string', 'null'], minLength: 1, maxLength: 16000 };
const num: Schema = { type: ['number', 'null'], minimum: 0 };
const strings: Schema = { type: 'array', items: str, maxItems: 60 };
const confidence: Schema = { type: 'string', enum: ['high', 'medium', 'low'] };
const score: Schema = { type: 'integer', minimum: 0, maximum: 100 };
const object = (properties: Record<string, Schema>): Schema => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const array = (items: Schema): Schema => ({ type: 'array', items, maxItems: 60 });
const finding = object({ id: str, title: str, description: str, sourceUrl: str, sourceDate: nullable, confidence, sourceExcerpt: str });
export const legacyResearchSchema = object({
  companyName: str, website: nullable,
  identity: object({ status: { type: 'string', enum: ['confirmed', 'ambiguous', 'unresolved'] }, explanation: str, sourceUrls: strings }),
  overview: object({ description: nullable, industry: nullable, headquarters: nullable, employeeCount: num, businessModel: nullable, productsAndServices: strings, customerSegments: strings, geographicOperations: strings, businessStructure: nullable, sourceUrls: strings }),
  hiringSignals: array(finding), growthSignals: array(finding), technologySignals: array(finding), operationalSignals: array(finding),
  financials: object({ revenue: num, currency: nullable, financialYear: { type: ['integer', 'null'], minimum: 1900, maximum: 2100 }, employeeCount: num, summary: nullable, sourceUrls: strings }),
  automationOpportunities: array(object({ title: str, description: str, evidence: strings, relevantVelhoService: str, proposedSolution: str, businessValue: str, confidence, score, scoreBreakdown: object({ relevance: score, evidenceStrength: score, businessImpact: score, growth: score, automationFit: score }), scoreExplanation: str, hypothesis: str, discoveryQuestions: strings })),
  overallScore: score, executiveSummary: str, limitations: strings,
  researchCoverage: array(object({ category: { type: 'string', enum: ['identity', 'overview', 'hiring', 'growth', 'technology', 'financials', 'operations'] }, queries: strings, outcome: str })),
});
export interface LegacyResearchFinding { id: string; title: string; description: string; sourceUrl: string; sourceDate: string | null; confidence: 'high' | 'medium' | 'low'; sourceExcerpt: string }
export interface LegacyAutomationOpportunity { title: string; description: string; evidence: string[]; relevantVelhoService: string; proposedSolution: string; businessValue: string; confidence: LegacyResearchFinding['confidence']; score: number; scoreBreakdown: Record<'relevance' | 'evidenceStrength' | 'businessImpact' | 'growth' | 'automationFit', number>; scoreExplanation: string; hypothesis: string; discoveryQuestions: string[] }
export interface LegacyCompanyResearch {
 companyName: string; website: string | null;
 identity: { status: 'confirmed' | 'ambiguous' | 'unresolved'; explanation: string; sourceUrls: string[] };
 overview: { description: string | null; industry: string | null; headquarters: string | null; employeeCount: number | null; businessModel: string | null; productsAndServices: string[]; customerSegments: string[]; geographicOperations: string[]; businessStructure: string | null; sourceUrls: string[] };
 hiringSignals: LegacyResearchFinding[]; growthSignals: LegacyResearchFinding[]; technologySignals: LegacyResearchFinding[]; operationalSignals: LegacyResearchFinding[];
 financials: { revenue: number | null; currency: string | null; financialYear: number | null; employeeCount: number | null; summary: string | null; sourceUrls: string[] };
 automationOpportunities: LegacyAutomationOpportunity[]; researchStatus?: 'complete' | 'partial' | 'identity_unresolved';
 overallScore: number; executiveSummary: string; limitations: string[]; researchCoverage: { category: string; queries: string[]; outcome: string }[]; researchedAt: string;
}
export const evidenceCategories = ['identity', 'overview', 'hiring', 'growth', 'technology', 'operations', 'financials', 'competition'] as const;
export type EvidenceCategory = typeof evidenceCategories[number];
export type Verification = 'verified' | 'inferred' | 'unknown';
export type EvidenceStatus = 'current' | 'ongoing' | 'completed' | 'closed' | 'historical' | 'unknown';
const choice = (values: readonly string[]): Schema => ({ type: 'string', enum: [...values] });
const evidenceMetadata = {
 categories: array(choice(evidenceCategories)), verification: choice(['verified','inferred','unknown']),
 sourceType: choice(['official','job_posting','annual_report','registry','vendor_case_study','news','professional_profile','aggregator','other']),
 eventDate: nullable, retrievedAt: nullable, status: choice(['current','ongoing','completed','closed','historical','unknown']), statusEvidence: strings,
 signalType: choice(['manual_work','integration_requirement','operational_problem','workload_growth','existing_solution','job_responsibility','company_context']), unmetNeedEvidence: nullable,
};
const opportunityMetadata = {
 implementationApproach: choice(['workflow','integration','ai','custom_software','discovery']), simplicityRationale: str,
 existingSolutionAssessment: object({ status: choice(['unmet','partially_addressed','already_addressed','unknown']), evidence: strings, rationale: str }),
};
const gapSchema = object({ id: str, category: str, question: str, reason: str, priority: choice(['high','medium','low']), evidence: strings });
const automationSchema = object({ id: str, name: str, kind: choice(['vendor','internal_team','platform','initiative','unknown']), scope: str, evidence: strings, status: choice(['current','ongoing','completed','unknown']), statusEvidence: strings, implication: choice(['potential_gap','partially_addressed','already_addressed','possible_partner','unknown']), rationale: str });
export const researchSchema = object({
 ...legacyResearchSchema.properties!,
 researchCoverage: array(object({ category: choice(['identity','overview','hiring','growth','technology','financials','operations','competition']), queries: strings, outcome: str })),
 evidence: array(object({ ...finding.properties!, ...evidenceMetadata })),
 hiringSignals: strings, growthSignals: strings, technologySignals: strings, operationalSignals: strings,
 automationOpportunities: array(object({ ...legacyResearchSchema.properties!.automationOpportunities.items!.properties!, ...opportunityMetadata })),
 existingAutomation: array(automationSchema), researchGaps: array(gapSchema),
 qualificationContext: object({ businessModelRelevance: choice(['high','medium','low','unknown']), relevanceExplanation: str, deliverySuitability: choice(['suitable','narrow_pilot_only','unsuitable','unknown']), deliveryExplanation: str, evidence: strings }),
});
export interface ResearchFinding extends LegacyResearchFinding {
 categories: EvidenceCategory[]; verification: Verification;
 sourceType: 'official' | 'job_posting' | 'annual_report' | 'registry' | 'vendor_case_study' | 'news' | 'professional_profile' | 'aggregator' | 'other';
 eventDate: string | null; retrievedAt: string | null; status: EvidenceStatus; statusEvidence: string[];
 signalType: 'manual_work' | 'integration_requirement' | 'operational_problem' | 'workload_growth' | 'existing_solution' | 'job_responsibility' | 'company_context';
 unmetNeedEvidence: string | null;
 freshness?: 'recent' | 'historical' | 'undated' | 'future'; observedAt?: string;
}
export interface AutomationOpportunity extends LegacyAutomationOpportunity {
 implementationApproach: 'workflow' | 'integration' | 'ai' | 'custom_software' | 'discovery'; simplicityRationale: string;
 existingSolutionAssessment: { status: 'unmet' | 'partially_addressed' | 'already_addressed' | 'unknown'; evidence: string[]; rationale: string };
 evidenceStrength?: 'direct_need' | 'documented_work' | 'context_only' | 'insufficient'; validationNotes?: string[];
}
export interface ExistingAutomation { id: string; name: string; kind: 'vendor' | 'internal_team' | 'platform' | 'initiative' | 'unknown'; scope: string; evidence: string[]; status: 'current' | 'ongoing' | 'completed' | 'unknown'; statusEvidence: string[]; implication: 'potential_gap' | 'partially_addressed' | 'already_addressed' | 'possible_partner' | 'unknown'; rationale: string }
export interface ResearchGap { id: string; category: string; question: string; reason: string; priority: 'high' | 'medium' | 'low'; evidence: string[]; sourceUrls?: string[] }
export interface QualificationContext { businessModelRelevance: 'high' | 'medium' | 'low' | 'unknown'; relevanceExplanation: string; deliverySuitability: 'suitable' | 'narrow_pilot_only' | 'unsuitable' | 'unknown'; deliveryExplanation: string; evidence: string[] }
export interface Assessment { score: number | null; reasons: string[]; evidence: string[] }
export interface Qualification {
 customerFit: Assessment & { segment: 'micro' | 'small' | 'medium' | 'enterprise' | 'unknown'; sizeBasis: string };
 automationOpportunity: Assessment;
 commercialAttractiveness: Assessment;
 recommendation: 'prioritize' | 'discovery_only' | 'deprioritize' | 'insufficient_evidence'; scoringMethod: string;
}
export interface ResearchInput extends Omit<LegacyCompanyResearch, 'hiringSignals' | 'growthSignals' | 'technologySignals' | 'operationalSignals' | 'automationOpportunities'> {
 evidence: ResearchFinding[]; hiringSignals: string[]; growthSignals: string[]; technologySignals: string[]; operationalSignals: string[];
 automationOpportunities: AutomationOpportunity[]; existingAutomation: ExistingAutomation[]; researchGaps: ResearchGap[]; qualificationContext: QualificationContext;
}
export interface CompanyResearch extends ResearchInput {
 schemaVersion: 2; qualification: Qualification;
 entityScope?: { employeeCount: 'reported_target' | 'unresolved' | 'unknown'; reportedEmployeeCounts: number[]; evidence: string[] };
 researchMetrics?: { passes: number; inputTokens: number | null; cachedInputTokens: number | null; uncachedInputTokens: number | null; usageComplete: boolean; outputTokens: number | null; searchRequests: number | null; fetchRequests: number | null; uniqueSources: number };
}

export class ValidationError extends Error {}
export function validateStructuredValue(value: unknown, schema: Schema, path = 'report'): void {
 const types = Array.isArray(schema.type) ? schema.type : [schema.type];
 const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
 if (!types.includes(type) && !(type === 'number' && Number.isInteger(value) && types.includes('integer'))) throw new ValidationError(`${path}: invalid type`);
 if (value === null) return;
 if (typeof value === 'string' && (value.trim().length < (schema.minLength ?? 0) || value.length > (schema.maxLength ?? Infinity) || (schema.enum && !schema.enum.includes(value)))) throw new ValidationError(`${path}: invalid text`);
 if (typeof value === 'number' && (!Number.isFinite(value) || value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity))) throw new ValidationError(`${path}: invalid number`);
 if (Array.isArray(value)) { if (value.length > (schema.maxItems ?? Infinity)) throw new ValidationError(`${path}: too many items`); value.forEach((v, i) => validateStructuredValue(v, schema.items!, `${path}[${i}]`)); }
 else if (typeof value === 'object') {
 const record = value as Record<string, unknown>;
 for (const key of schema.required ?? []) if (!(key in record)) throw new ValidationError(`${path}.${key}: required`);
 for (const key of Object.keys(record)) { if (!schema.properties?.[key]) throw new ValidationError(`${path}.${key}: unexpected field`); validateStructuredValue(record[key], schema.properties[key], `${path}.${key}`); }
 }
}
export function safeUrl(value: string): string {
 try { const u = new URL(value); if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) throw Error(); return u.href; } catch { throw new ValidationError('Source must be an HTTP(S) URL'); }
}
export function parseResearch(value: unknown, now = new Date()): CompanyResearch {
 const modern = Boolean(value && typeof value === 'object' && 'evidence' in value);
 const cloned = structuredClone(value) as ResearchInput | LegacyCompanyResearch;
 if (modern) {
 const input = cloned as ResearchInput;
 const record = input as unknown as Record<string, unknown>;
 const defaulted: string[] = [];
 const fill = (target: Record<string, unknown>, defaults: Record<string, unknown>, path: string) => {
 for (const [key, fallback] of Object.entries(defaults)) if (target[key] === undefined || (target[key] === null && fallback !== null)) { target[key] = structuredClone(fallback); defaulted.push(`${path}.${key}`); }
 };
 fill(record, { hiringSignals: [], growthSignals: [], technologySignals: [], operationalSignals: [], existingAutomation: [], researchGaps: [], limitations: [], overallScore: 0, executiveSummary: 'Report rendered from structured evidence.', qualificationContext: { businessModelRelevance: 'unknown', relevanceExplanation: 'Business relevance has not been established.', deliverySuitability: 'unknown', deliveryExplanation: 'Delivery scope has not been established.', evidence: [] } }, 'report');
 if (input.qualificationContext && typeof input.qualificationContext === 'object') fill(input.qualificationContext as unknown as Record<string, unknown>, { businessModelRelevance: 'unknown', relevanceExplanation: 'Business relevance has not been established.', deliverySuitability: 'unknown', deliveryExplanation: 'Delivery scope has not been established.', evidence: [] }, 'qualificationContext');
 if (Array.isArray(input.evidence)) for (const item of input.evidence) if (item && typeof item === 'object') {
 const f = item as unknown as Record<string, unknown>;
 for (const key of ['freshness','observedAt']) delete f[key];
 fill(f, { sourceDate: null, confidence: 'low', categories: ['overview'], verification: 'unknown', sourceType: 'other', eventDate: null, retrievedAt: null, status: 'unknown', statusEvidence: [], signalType: 'company_context', unmetNeedEvidence: null }, `evidence.${String(f.id)}`);
 }
 if (Array.isArray(input.automationOpportunities)) for (const item of input.automationOpportunities) if (item && typeof item === 'object') {
 const o = item as unknown as Record<string, unknown>;
 delete o.evidenceStrength; delete o.validationNotes;
 fill(o, { confidence: 'low', score: 0, scoreExplanation: 'Application-computed score.', discoveryQuestions: [], scoreBreakdown: { relevance: 0, evidenceStrength: 0, businessImpact: 0, growth: 0, automationFit: 0 }, implementationApproach: 'discovery', simplicityRationale: 'No implementation approach is established; verify the workflow and existing scope before proposing work.', existingSolutionAssessment: { status: 'unknown', evidence: [], rationale: 'Existing coverage has not been established.' } }, 'opportunity');
 if (o.scoreBreakdown && typeof o.scoreBreakdown === 'object') fill(o.scoreBreakdown as Record<string, unknown>, { relevance: 0, evidenceStrength: 0, businessImpact: 0, growth: 0, automationFit: 0 }, 'opportunity.scoreBreakdown');
 if (o.existingSolutionAssessment && typeof o.existingSolutionAssessment === 'object') fill(o.existingSolutionAssessment as Record<string, unknown>, { status: 'unknown', evidence: [], rationale: 'Existing coverage has not been established.' }, 'opportunity.coverage');
 }
 if (Array.isArray(input.existingAutomation)) for (const item of input.existingAutomation) if (item && typeof item === 'object') fill(item as unknown as Record<string, unknown>, { evidence: [], scope: 'Scope has not been established.', kind: 'unknown', status: 'unknown', statusEvidence: [], implication: 'unknown', rationale: 'Current status and remaining scope are unverified.' }, 'existingAutomation');
 if (Array.isArray(input.researchGaps)) {
 const usedIds = new Set(input.researchGaps.map(g => g && typeof g === 'object' && 'id' in g ? String(g.id) : ''));
 for (const [index, item] of input.researchGaps.entries()) if (item && typeof item === 'object') {
 const gap = item as unknown as Record<string, unknown>;
 let generatedId = `normalized-gap-${index + 1}`;
 while (usedIds.has(generatedId)) generatedId += '-x';
 fill(gap, { id: generatedId, category: 'operations', question: 'What workflow requirement remains to be clarified?', reason: 'Clarify the open point during discovery.', priority: 'medium', evidence: [] }, `researchGaps[${index}]`);
 usedIds.add(String(gap.id));
 }
 }
 if (defaulted.length && Array.isArray(input.limitations)) input.limitations.push(`Missing research metadata was defaulted conservatively to unknown/null/empty support: ${defaulted.slice(0,30).join(', ')}. No stronger factual status was inferred.`);
 // Category arrays are derived indexes. Normalize a provider's legacy-shaped entries
 // only by linking an already-retained canonical source; never invent a new record.
 for (const field of ['hiringSignals','growthSignals','technologySignals','operationalSignals'] as const) {
 const supplied = input[field] as unknown[];
 if (!Array.isArray(supplied) || !Array.isArray(input.evidence)) continue;
 input[field] = supplied.flatMap(entry => {
 if (typeof entry === 'string') return [entry];
 if (!entry || typeof entry !== 'object') return [];
 const candidate = entry as { id?: string; sourceUrl?: string };
 const matches = input.evidence.filter(f => f.id === candidate.id || (candidate.sourceUrl && f.sourceUrl === candidate.sourceUrl));
 if (Array.isArray(input.limitations)) input.limitations.push(`A legacy-shaped ${field} entry was resolved only against retained evidence. Unsupported category content was withheld.`);
 return matches.map(f => f.id);
 });
 }
 }
 if (modern) {
 const input = cloned as ResearchInput;
 const reconcileEnums = (value: unknown, schema: Schema, path: string): unknown => {
 if (typeof value === 'string' && schema.enum && !schema.enum.includes(value)) {
 const aliases: Record<string,string> = { finance: 'financials', financial: 'financials', operational: 'operations', recruitment: 'hiring', competitors: 'competition', vendors: 'competition', verified_fact: 'verified', hiringsignals: 'hiring', growthsignals: 'growth', technologysignals: 'technology', operationalsignals: 'operations', existingautomation: 'competition', companyoverview: 'overview', automationopportunities: 'operations' };
 const alias = aliases[value.toLocaleLowerCase('en')];
 // Aliases only reconcile category names. Verification/confidence must never be upgraded.
 const replacement = path.includes('.categories[') || path.endsWith('.category') ? (alias && schema.enum.includes(alias) ? alias : undefined) : undefined;
 const fallback = replacement ?? (path.includes('.categories[') ? 'overview' : undefined) ?? ['unknown','other','company_context','low','discovery'].find(candidate => schema.enum!.includes(candidate));
 if (fallback !== undefined) {
 if (Array.isArray(input.limitations)) input.limitations.push(`Unrecognized ${path} value (${value.slice(0,120)}) was normalized to ${fallback}; no stronger factual status or confidence was assumed.`);
 return fallback;
 }
 }
 if (Array.isArray(value) && schema.items) return value.map((item,i) => reconcileEnums(item,schema.items!,`${path}[${i}]`));
 if (value && typeof value === 'object' && schema.properties) {
 const record = value as Record<string, unknown>;
 for (const [key, child] of Object.entries(schema.properties)) if (key in record) record[key] = reconcileEnums(record[key],child,`${path}.${key}`);
 }
 return value;
 };
 reconcileEnums(input, researchSchema, 'report');
 }
 validateStructuredValue(cloned, modern ? researchSchema : legacyResearchSchema);
 return normalizeResearch(cloned, now, !modern);
}
/** Upgrade saved v1 reports conservatively without changing their research timestamp or database row. */
export function readStoredResearch(value: unknown): CompanyResearch {
 const saved = value as CompanyResearch;
 if (saved.schemaVersion === 2) return refreshQualification(saved, new Date(saved.researchedAt));
 const raw = { ...saved } as unknown as Record<string, unknown>;
 const timestamp = typeof raw.researchedAt === 'string' ? raw.researchedAt : new Date().toISOString();
 const status = raw.researchStatus;
 delete raw.researchedAt; delete raw.researchStatus;
 const result = parseResearch(raw, new Date(timestamp));
 if (status === 'partial' || status === 'identity_unresolved' || status === 'complete') result.researchStatus = status;
 return result;
}
export function parseCompanyName(value: unknown): string {
 if (typeof value !== 'string' || !value.trim() || value.trim().length > 200 || /[\x00-\x1f]/.test(value)) throw new ValidationError('Enter a company name between 1 and 200 characters.');
 return value.trim();
}
/** Compatibility adapter for downstream consumers that still expect v1 category records. */
export function toLegacyResearch(report: CompanyResearch): LegacyCompanyResearch {
 const record: Record<string, unknown> = Object.fromEntries(Object.keys(legacyResearchSchema.properties!).map(key => [key, report[key as keyof CompanyResearch]]));
 const catalogue = new Map(report.evidence.map(f => [f.id, f]));
 const project = (value: object, keys: string[]) => Object.fromEntries(keys.map(key => [key, (value as Record<string, unknown>)[key]]));
 for (const field of ['hiringSignals','growthSignals','technologySignals','operationalSignals'] as const) record[field] = report[field].map(id => project(catalogue.get(id)!, Object.keys(finding.properties!)));
 record.automationOpportunities = report.automationOpportunities.map(o => project(o, Object.keys(legacyResearchSchema.properties!.automationOpportunities.items!.properties!)));
 record.researchCoverage = report.researchCoverage.filter(c => c.category !== 'competition');
 return { ...record, researchedAt: report.researchedAt, researchStatus: report.researchStatus } as unknown as LegacyCompanyResearch;
}
