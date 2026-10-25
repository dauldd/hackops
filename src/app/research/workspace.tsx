'use client';
import { useEffect, useState } from 'react';
import type { ResearchLog, ResearchRunSummary, SavedResearch } from '@/lib/db';
import BusinessVisualizations from './business-visualizations';
import type { Assessment, ResearchFinding } from '@/lib/research/schema';
type Summary = { id: number; companyName: string; requestedName: string; createdAt: string; overallScore: number; identityStatus: string; commercialScore?: number | null };
function ResearchLogs({ runId }: { runId: string }) {
 const [logs, setLogs] = useState<ResearchLog[]>([]);
 const [status, setStatus] = useState('running');
 const [error, setError] = useState('');
 useEffect(() => {
 let stopped = false;
 let cursor = 0;
 let timer: ReturnType<typeof setTimeout>;
 async function poll() {
 let finished = false;
 try {
 const response = await fetch(`/api/research/runs/${runId}?after=${cursor}`, { cache: 'no-store' });
 if (response.ok) {
 const run = await response.json();
 if (stopped) return;
 setStatus(run.status); setError('');
 if (run.logs.length) {
 for (const entry of run.logs as ResearchLog[]) {
 const write = entry.level === 'error' ? console.error : entry.level === 'warning' ? console.warn : console.info;
 write(`[research:${runId}] ${entry.createdAt} ${entry.stage}: ${entry.message}`, entry.details ?? '');
 }
 cursor = run.logs.at(-1).id; setLogs(previous => [...previous, ...run.logs]);
 }
 finished = run.status !== 'running' && run.logs.length < 500;
 } else if (response.status !== 404) throw Error('Logs could not be loaded. Retrying…');
 } catch (e) { if (!stopped) setError(e instanceof Error ? e.message : 'Logs unavailable. Retrying…'); }
 if (!stopped && !finished) timer = setTimeout(poll, 1000);
 }
 void poll();
 return () => { stopped = true; clearTimeout(timer); };
 }, [runId]);
 return <section className="research-logs" aria-labelledby="logs-heading"><details><summary><strong id="logs-heading">Agent activity logs</strong> · {status} · {logs.length} events · show / hide</summary>
 <p className="muted">OpenRouter executes searches and page retrieval internally. Available tool transcripts appear when its response arrives. Credentials and authorization headers are excluded.</p>
 <p className="muted">Run {runId} · <a href={`/api/research/runs/${runId}`} target="_blank" rel="noopener noreferrer">Open full logs as JSON ↗</a></p>
 {error && <p role="status">{error}</p>}
 <ol className="log-list">{logs.map(entry => <li key={entry.id} className={`log-${entry.level}`}><div><time dateTime={entry.createdAt}>{new Date(entry.createdAt).toISOString().slice(11,23)} UTC</time> <strong>{entry.stage}</strong> · {entry.level}</div><p>{entry.message}</p>{entry.details !== null && <details><summary>View details</summary><pre>{JSON.stringify(entry.details, null, 2)}</pre></details>}</li>)}</ol>
 {!logs.length && <p role="status">Waiting for the server to start this research run…</p>}</details></section>;
}
function Sources({ urls }: { urls: string[] }) { return <ul className="sources">{urls.map((url,i) => <li key={url}><a href={url} target="_blank" rel="noopener noreferrer">Source {i+1}: {url}</a></li>)}</ul>; }
function Findings({ title, findings }: { title: string; findings: ResearchFinding[] }) {
 return <section className="report-section"><h2>{title}</h2>{!findings.length ? <p className="muted">No supported findings established.</p> : <ul>{findings.map(f => <li key={f.id}><a href={`#evidence-${f.id}`}>{f.title}</a> · {f.verification} · {f.status} · {f.freshness}</li>)}</ul>}</section>;
}
function AssessmentCard({ title, assessment }: { title: string; assessment: Assessment }) {
 return <article><h3>{title}</h3><strong className="assessment-score">{assessment.score === null ? 'Unknown' : `${assessment.score}/100`}</strong><p className="muted">{assessment.reasons[0]}</p><details><summary>Why this score?</summary><ul>{assessment.reasons.slice(1).map((reason,i) => <li key={i}>{reason}</li>)}</ul></details></article>;
}
function Report({ saved }: { saved: SavedResearch }) {
 const r = saved.report;
 const byId = new Map(r.evidence.map(f => [f.id, f]));
 const findings = (ids: string[]) => ids.map(id => byId.get(id)!).filter(Boolean);
 const reference = (id: string) => <a href={`#evidence-${id}`}>{byId.get(id)?.title ?? id}</a>;
 return <section aria-labelledby="report-heading" className="report"><div className="section-heading"><h2 id="report-heading">{r.companyName}</h2><span>Research {r.researchStatus ?? 'complete'}</span></div>
 <p className="muted">{new Date(r.researchedAt).toLocaleString('en-GB', { timeZone: 'UTC' })} UTC · {saved.model} · Identity {r.identity.status} · Schema v{r.schemaVersion}</p><p>{r.identity.explanation}</p><Sources urls={r.identity.sourceUrls} />
 {r.website && <a href={r.website} target="_blank" rel="noopener noreferrer">Official website ↗</a>}<p className="summary">{r.executiveSummary}</p>
 <section className="report-section"><h2>Prospect qualification</h2><p className="muted">Size segment: {r.qualification.customerFit.segment}. Recommendation: {r.qualification.recommendation.replaceAll('_',' ')}. Automation potential measures work that could benefit from automation; it does not establish customer fit or buying intent.</p><div className="qualification-grid"><AssessmentCard title="Customer fit" assessment={r.qualification.customerFit} /><AssessmentCard title="Automation potential" assessment={r.qualification.automationOpportunity} /><AssessmentCard title="Commercial attractiveness" assessment={r.qualification.commercialAttractiveness} /></div><details><summary>How qualification is calculated</summary><p>{r.qualification.scoringMethod}</p></details></section>
 <details className="report-details"><summary>Evidence and detailed research</summary>{!!r.limitations.length && <aside><h3>Research limitations</h3><ul>{r.limitations.map((v,i) => <li key={i}>{v}</li>)}</ul></aside>}
 <section className="report-section"><h2>Company overview</h2>{r.entityScope?.employeeCount === 'unresolved' && <p className="muted">Reported headcounts ({r.entityScope.reportedEmployeeCounts.join(', ')}) have conflicting scopes or reporting bases. The target company’s standalone headcount remains unknown.</p>}<p>{r.overview.description ?? 'Description not established.'}</p><dl>{Object.entries({ Industry: r.overview.industry, Headquarters: r.overview.headquarters, Employees: r.overview.employeeCount, 'Business model': r.overview.businessModel, 'Business structure': r.overview.businessStructure }).map(([k,v]) => <div key={k}><dt>{k}</dt><dd>{v ?? 'Unknown'}</dd></div>)}</dl>
 {Object.entries({ 'Products and services': r.overview.productsAndServices, 'Customer segments': r.overview.customerSegments, 'Geographic operations': r.overview.geographicOperations }).map(([label,items]) => <p key={label}><strong>{label}:</strong> {items.join(' · ') || 'Unknown'}</p>)}<Sources urls={r.overview.sourceUrls} /></section>
 <section className="report-section"><h2>Existing automation and partners</h2><p className="muted">Existing initiatives may cover a need, leave a complementary gap, or create a partnership route. Historical involvement does not establish current scope.</p>{!r.existingAutomation.length && <p>No supported vendor or internal initiative references established. This does not prove that none exist.</p>}{r.existingAutomation.map(v => <article key={v.id}><h3>{v.name} · {v.kind}</h3><p>{v.scope}</p><p><strong>Status:</strong> {v.status} · <strong>Implication:</strong> {v.implication.replaceAll('_',' ')}</p><p>{v.rationale}</p><ul>{v.evidence.map(id => <li key={id}>{reference(id)}</li>)}</ul></article>)}</section>
 <section className="report-section"><h2>Automation opportunities</h2><p className="muted">Each proposal is a hypothesis, with evidence, remaining scope, and unanswered questions. Historical context or ordinary duties alone do not establish an unmet need.</p>{!r.automationOpportunities.length && <p>No sufficiently supported opportunities identified.</p>}
 {r.automationOpportunities.map((o,i) => <article key={i}><div className="section-heading"><h3>{o.title}</h3><strong>{o.score}/100 potential</strong></div><h4>Observed evidence</h4><ul>{o.evidence.map(id => { const f=byId.get(id)!; return <li key={id}>{reference(id)} · {f.verification}<p>{f.description}</p></li>; })}</ul><p><strong>Potential problem:</strong> {o.hypothesis}</p><p><strong>Suggested solution:</strong> {o.proposedSolution}</p><p><strong>Simplest approach:</strong> {o.implementationApproach} · {o.simplicityRationale}</p><p><strong>Velho service:</strong> {o.relevantVelhoService}</p><p><strong>Conditional business value:</strong> {o.businessValue}</p><p><strong>Existing solution coverage:</strong> {o.existingSolutionAssessment.status.replaceAll('_',' ')} · {o.existingSolutionAssessment.rationale}</p><ul>{o.existingSolutionAssessment.evidence.map(id => <li key={id}>{reference(id)}</li>)}</ul><p><strong>Evidence strength:</strong> {o.evidenceStrength?.replaceAll('_',' ')} · {o.confidence} confidence</p>{!!o.validationNotes?.length && <ul>{o.validationNotes.map((note,j) => <li key={j}>{note}</li>)}</ul>}<details><summary>Explain potential score</summary><p>{o.scoreExplanation}</p><dl>{Object.entries(o.scoreBreakdown).map(([key,value]) => <div key={key}><dt>{key}</dt><dd>{value}/100</dd></div>)}</dl></details><h4>Unanswered questions before a proposal</h4><ul>{o.discoveryQuestions.map((q,j)=><li key={j}>{q}</li>)}</ul></article>)}</section>
 <Findings title="Hiring intelligence" findings={findings(r.hiringSignals)} /><Findings title="Growth signals" findings={findings(r.growthSignals)} /><Findings title="Technology intelligence" findings={findings(r.technologySignals)} /><Findings title="Operational intelligence" findings={findings(r.operationalSignals)} />
 <section className="report-section"><h2>Financial intelligence</h2><dl>{Object.entries({ Revenue: r.financials.revenue === null ? null : `${r.financials.revenue.toLocaleString('en-GB')} ${r.financials.currency}`, 'Financial year': r.financials.financialYear, Employees: r.financials.employeeCount }).map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v ?? 'Unknown'}</dd></div>)}</dl><p>{r.financials.summary ?? 'Financial information unavailable.'}</p><Sources urls={r.financials.sourceUrls} /></section>
 <section className="report-section"><h2>Source evidence catalogue</h2><p className="muted">Each distinct source excerpt is stored once. Category and opportunity links point here. Verification labels reflect source support, not independent audits of the underlying business.</p>{r.evidence.map(f => <article id={`evidence-${f.id}`} key={f.id}><h3>{f.title}</h3><p>{f.description}</p><blockquote>{f.sourceExcerpt}</blockquote><p>{f.verification} · {f.confidence} confidence · {f.sourceType} · {f.categories.join(', ')}</p><dl>{Object.entries({ 'Publication date': f.sourceDate, 'Event date': f.eventDate, 'Tool retrieval time': f.retrievedAt, 'Evidence freshness': f.freshness, 'Current status': f.status }).map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v ?? 'Unknown'}</dd></div>)}</dl>{f.unmetNeedEvidence && <p><strong>Explicit need excerpt:</strong> {f.unmetNeedEvidence}</p>}<Sources urls={[f.sourceUrl]} /></article>)}</section>
 <section className="report-section"><h2>Research gaps</h2>{!r.researchGaps.length && <p>No additional gaps recorded; confirm the proposal assumptions during discovery.</p>}{r.researchGaps.map(g => <article key={g.id}><h3>{g.question}</h3><p>{g.priority} priority · {g.category}</p><p>{g.reason}</p><ul>{g.evidence.map(id => <li key={id}>{reference(id)}</li>)}</ul></article>)}</section>
 {r.researchMetrics && <details className="report-section"><summary>Research efficiency and coverage</summary><dl>{Object.entries(r.researchMetrics).map(([key,value]) => <div key={key}><dt>{key}</dt><dd>{value == null ? 'Not reported' : String(value)}</dd></div>)}</dl></details>}
 <details className="report-section"><summary>Research coverage and queries</summary>{r.researchCoverage.map(c=><div key={c.category}><h3>{c.category}</h3><p>{c.outcome}</p><ul>{c.queries.map((q,i)=><li key={i}>{q}</li>)}</ul></div>)}</details>
 <details><summary>Structured report for downstream agents</summary><pre>{JSON.stringify(r,null,2)}</pre></details></details></section>;
}
export default function ResearchWorkspace({ initialResults, initialRuns }: { initialResults: Summary[]; initialRuns: ResearchRunSummary[] }) {
 const [results,setResults]=useState(initialResults);
 const [runs,setRuns]=useState(initialRuns);
 const [saved,setSaved]=useState<SavedResearch|null>(null);
 const [running,setRunning]=useState(false);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState('');
 const [runId,setRunId]=useState<string|null>(null);
 const [reportOpen,setReportOpen]=useState(true);
 async function run(event: React.FormEvent<HTMLFormElement>) {
 event.preventDefault(); const form = event.currentTarget; const companyName = String(new FormData(form).get('companyName') ?? '').trim();
 const nextRunId = crypto.randomUUID(); setRunId(nextRunId);
 setRunning(true); setError('');
 try { const response=await fetch('/api/research',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({companyName, runId: nextRunId})}); const data=await response.json(); if (!response.ok) throw Error(data.error || 'Research failed.'); setSaved(data); setReportOpen(true); setResults(prev=>[{id:data.id,companyName:data.report.companyName,requestedName:data.requestedName,createdAt:data.createdAt,overallScore:data.report.overallScore,identityStatus:data.report.identity.status,commercialScore:data.report.qualification.commercialAttractiveness.score},...prev].slice(0,100)); }
 catch(e){ setError(e instanceof Error ? e.message : 'Research failed.'); } finally { setRunning(false); try { const response = await fetch("/api/research/runs"); if (response.ok) setRuns((await response.json()).results); } catch { /* The activity panel keeps retrying its own log request. */ } }
 }
 async function open(id:number) { setLoading(true);setError('');try {const response=await fetch(`/api/research/${id}`);const data=await response.json();if(!response.ok)throw Error(data.error);setSaved(data);setReportOpen(true);setRunId(data.runId ?? null);}catch(e){setError(e instanceof Error?e.message:'Could not load report.');}finally{setLoading(false);} }
 return <><form onSubmit={run} className="composer"><label htmlFor="companyName">Company legal name</label><input id="companyName" name="companyName" placeholder="Example Logistics Oy" required maxLength={200} disabled={running} /><div className="composer-footer"><span>Web research usually takes a few minutes.</span><button disabled={running || loading} type="submit">{running?'Researching…':'Research company ↗'}</button></div></form>
 {running && <p role="status" aria-live="polite">Research in progress: OpenRouter is identifying the company, searching and reading sources, and building the report. Keep this page open.</p>}
 {error && <p role="alert" className="error">{error}</p>}{loading && <p role="status">Loading saved report…</p>}
 {runId && <ResearchLogs key={runId} runId={runId} />}
 {saved && <><div className="report-controls"><strong>{saved.report.companyName}</strong><button className="quiet-button" aria-expanded={reportOpen} aria-controls="company-report" onClick={()=>setReportOpen(open=>!open)}>{reportOpen?"Hide report":"Show report"}</button></div><div id="company-report" hidden={!reportOpen}><Report saved={saved} /></div><BusinessVisualizations key={saved.id} researchId={saved.id} research={saved.report} onRunStarted={setRunId}/></>}
 <section className="notes-section"><div className="section-heading"><h2>Saved research</h2><span>Latest {results.length} reports</span></div>{!results.length?<div className="empty"><h3>Your research starts here.</h3><p>Enter a company name to build the first intelligence report.</p></div>:<div className="notes">{results.map(r=><article key={r.id} data-research-id={r.id}><h3>{r.companyName}</h3><p className="muted">{new Date(r.createdAt).toLocaleString("en-GB", { timeZone: "UTC" }) + " UTC"} · {r.identityStatus}</p><p>Commercial attractiveness: {r.commercialScore == null ? "Not yet qualified" : `${r.commercialScore}/100`}</p><button disabled={loading || running} onClick={()=>open(r.id)}>View report ↗</button></article>)}</div>}</section>
 <details className="notes-section"><summary>Agent run history · show / hide</summary><section><div className="section-heading"><h2>Research run history</h2><span>Includes failed runs and diagnostic logs</span></div><div className="notes">{runs.map(run => <article key={run.id}><h3>{run.companyName}</h3><p className="muted">{run.status} · {new Date(run.createdAt).toISOString()}</p>{run.error && <p>{run.error}</p>}<button disabled={running} onClick={() => setRunId(run.id)}>View activity logs</button></article>)}</div></section></details></>;
}
