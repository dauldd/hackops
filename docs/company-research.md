# Company research v2

The existing Next.js routes, SQLite persistence, OpenRouter client and server-side search/fetch execution remain in place. `researchCompany(companyName)` remains the server entry point. The UI is available at `/` and `/research`.

## Structured output and compatibility

New reports have `schemaVersion: 2`. `evidence` is a canonical catalogue of sourced facts. `hiringSignals`, `growthSignals`, `technologySignals` and `operationalSignals` are arrays of evidence IDs. Opportunities, existing automation records, qualification context, current-status support and research gaps refer to that same catalogue. One fact can belong to several categories without repeated source records. Distinct facts from the same page may remain separate. Identical URL/excerpt pairs are merged, and aliases in references are remapped.

Example downstream lookup:

```ts
const saved = await researchCompany('Example Logistics Oy');
const report = saved.report;
const byId = new Map(report.evidence.map(finding => [finding.id, finding]));
const hiringEvidence = report.hiringSignals.map(id => byId.get(id));
const { customerFit, automationOpportunity, commercialAttractiveness } = report.qualification;
```

`getResearch(id)` upgrades saved v1 reports on read without rewriting their database rows or research timestamps. Legacy evidence defaults to inferred, rather than newly verified; missing partner/current-status checks become gaps. `toLegacyResearch(report)` is available for consumers still expecting the original category arrays of full records. `overallScore` remains a compatibility alias for **automation potential**, never customer fit or buying intent. New consumers should use the separate qualification assessments.

## Evidence rules

Each record retains the source URL, relevant excerpt and publication date (`sourceDate`). It also records `eventDate`, `retrievedAt`, verification (`verified`, `inferred`, `unknown`), source type, signal type and status. The application generates `observedAt` and evidence freshness. A recent retrieval timestamp does not make an older event current. Partial/invalid publication dates become null with limitations; event dates may legitimately be in the future and are labelled accordingly.

Verified means directly supported by the retained source excerpt, not an independent audit of the underlying business. The application verifies the evidence graph and quotation consistency; it does not scrape sources itself or mechanically prove every semantic claim. An explicit unmet-need quotation must be present in the source excerpt. Unsupported quotation claims are removed and flagged.

Current/ongoing status needs recent, dated, credible, verified supporting evidence. Historical project announcements cannot prove a current implementation; old job descriptions cannot prove current hiring. Role descriptions belong to hiring even when they also describe technology or operations. Employee profiles and generic career guides do not become job advertisements. Integration catalogue pages establish connector availability, not that a carrier internally runs every listed customer ERP.

Unsafe URLs, conflicting evidence IDs, missing mandatory report structure and dangling substantive opportunity/status references are rejected. Category arrays are derived indexes: malformed or missing index references are withheld and regenerated only from retained evidence, with explicit limitations. A vendor candidate without any retained support is excluded and becomes a research gap; its existence is not invented from a URL. Unknown references cannot silently become verified evidence. Group/subsidiary revenue is withheld from the target-company revenue field when entity scope is unresolved, while the sourced summary remains visible as context.

## Opportunities and qualification

The interface separates observed evidence, potential problem, simplest suggested solution, conditional business value, evidence strength, existing solution coverage and unanswered questions. Generic company scale or a software installation alone is not an unmet need. Context-only pitches are replaced with discovery questions rather than an implementation proposal. Unsupported complex AI recommendations are replaced with a discovery-first integration approach.

Opportunity evidence strength is classified as `direct_need`, `documented_work`, `context_only` or `insufficient`. High confidence requires a recent, credible, verified explicit operational/integration need with current status and defensible remaining scope. Duties alone are capped at medium; historical/undated-only or context-only proposals are low. Scores are recalculated from the five displayed dimensions, with evidence-strength and growth checks and confidence caps of 95/65/35. Existing-addressed workflows do not contribute to eligible commercial opportunities.

Qualification is independent:

- **Customer fit:** sourced headcount gives a micro/small/medium/enterprise/unknown prospecting segment (10/50/250 employee boundaries). This is an explicit targeting heuristic, not a legal SME classification. SME-sized base is 80; enterprise base is 25. Business-model relevance adds 15/0/-20/-10 for high/medium/low/unknown. Delivery suitability adds 5/-10/-25/-5 for suitable/narrow pilot/unsuitable/unknown. Clamp to 0–100. Unknown headcount or identity leaves fit null.
- **Automation potential:** strongest evidence-constrained opportunity score. This can be substantial at a company with poor customer fit.
- **Commercial attractiveness:** eligible opportunity strength × 0.6 plus current unmet-need trigger × 0.4, capped by customer fit, with a 10-point penalty for unverified remaining partner scope. Without current verified unmet-need evidence, cap at 35. Fully addressed/no eligible opportunities score zero; unknown fit stays null. Reasons and the scoring method are returned with every assessment.

Existing vendors, internal teams, platforms and initiatives retain scoped evidence and status. Involvement can cover the proposed need, leave a complementary gap or suggest a partner route; it never automatically proves either a sales opportunity or a reason to reject every workflow.

## Research depth and efficiency

The model prioritizes operational job descriptions, manual responsibilities, ERP/CRM interfaces, financial/document flows, customer workloads and existing automation partners, with Finnish queries for Finnish companies. It follows specific responsibilities or historical transformation announcements rather than producing more generic company descriptions. Enterprise fit is assessed after operational research, not used as an early-exit shortcut.

`planFollowUp` ranks specific job/workflow, project-status and partner-scope gaps. It selects up to three distinct leads, produces targeted local-language queries, excludes already-used queries and skips irrelevant profile-status loops. One follow-up request is permitted within the shared four-minute deadline. It receives compact structured evidence memory, prior queries and reviewed URLs instead of another full narrative report. Unknown findings remain unknown when no answer is found. If follow-up fails, valid initial evidence is retained in a partial report with visible limitations; inadequate depth withholds qualification opportunities rather than fabricating them.

OpenRouter still executes both tools server-side; there is no application scraper or client-side tool loop. The initial budget remains 24 calls, up to 12 searches and 12 fetches; follow-up has 12 calls. Search returns up to four results per call and 40 overall, with a 1,200-character result excerpt cap. Fetch content is capped at 4,000 tokens, with guidance to select focused pages/report sections and avoid duplicate PDFs/homepages. Useful discoveries, not a token target, determine which leads to pursue.

`researchMetrics` reports provider attempts, input/output tokens, cached/uncached input tokens, searches, inferred/reported fetches and unique retained sources. Failed follow-up responses are included when usage is available; `usageComplete` indicates whether every attempt supplied usage. Token savings are workload-dependent and should be measured on actual runs, not inferred from configuration alone. Full provider usage and traces remain in persisted activity logs, server terminal and browser console. Credentials are redacted; internal model reasoning is omitted.

## Verification

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

The suite includes the original saved Posti report and the actual Ahola provider response that exposed partial-coverage validation. Regression checks cover warehouse-job classification, SAP historical status, existing partners, enterprise vs SME scoring, missing references, canonical deduplication, indirect/context confidence, current status, group revenue, integration catalogues, compact follow-up memory and provider schema variants.

The optional browser test is `npm run test:browser`. Supply a Playwright installation via `PLAYWRIGHT_MODULE`, and use `RESEARCH_TEST_URL` to select a running app. Without `RESEARCH_TEST_COMPANY` it tests button/loading/error/log/navigation behavior with a mocked error. Set `RESEARCH_TEST_COMPANY='Ahola Transport'` (or Posti Oyj) for real research, persistence, report rendering, reload/reopening and log retrieval. The running application loads its existing server environment; tests do not inspect credential files.
