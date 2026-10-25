import 'server-only';
import { COMPANY_RESEARCH_SYSTEM_PROMPT } from './prompt.ts';
import { researchSchema, type CompanyResearch, type Schema } from './schema.ts';
import { followUpMemory, type ResearchLead } from './planning.ts';
import type { ResearchLogger } from './logging.ts';
export class ResearchApiError extends Error {
 status: number;
 constructor(message: string, status = 502) { super(message); this.status = status; }
}
/** Compact model guide; the full schema below still enforces every field and constraint. */
export function compactSchemaGuide(schema: Schema): unknown {
 if (schema.properties) return Object.fromEntries(Object.entries(schema.properties).map(([key,value]) => [key, compactSchemaGuide(value)]));
 if (schema.items) return [compactSchemaGuide(schema.items)];
 return schema.enum?.join('|') ?? (Array.isArray(schema.type) ? schema.type.join('|') : schema.type);
}
export function researchRequest(companyName: string, model: string) {
 return { model, provider: { require_parameters: true }, messages: [
 { role: 'system', content: `${COMPANY_RESEARCH_SYSTEM_PROMPT}\n\nRequired final report schema field/type guide (use exact names at the root; no wrapper; choose one enum value, not the whole list):\n${JSON.stringify(compactSchemaGuide(researchSchema))}\nDo not echo tool payloads, raw search results, or fetched pages into your answer. Only return the final report object.` },
 { role: 'user', content: JSON.stringify({ companyName, currentDate: new Date().toISOString().slice(0,10), task: 'Research this company using web search and fetch. Return the structured report.' }) },
 ], tools: [
 { type: 'openrouter:web_search', parameters: { engine: 'parallel', max_results: 4, max_total_results: 40, max_uses: 12, max_characters: 1200 } },
 { type: 'openrouter:web_fetch', parameters: { engine: 'openrouter', max_content_tokens: 4000, max_uses: 12 } },
 ], max_tool_calls: 24, max_tokens: 24000,
 response_format: { type: 'json_schema', json_schema: { name: 'company_research', strict: true, schema: researchSchema } } };
}
export function parseModelReport(content: string): unknown {
 const trimmed = content.trim();
 try { return JSON.parse(trimmed); } catch { /* Server tool transcripts can precede the final JSON block. */ }
 const blocks = [...trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi)];
 const finalBlock = blocks.at(-1);
 if (finalBlock && !trimmed.slice(finalBlock.index! + finalBlock[0].length).trim()) return JSON.parse(finalBlock[1]);
 // OpenRouter can concatenate intermediate assistant prose with an unfenced final
 // object. Extract complete JSON objects without repairing or inventing their data.
 let depth = 0, start = -1, quoted = false, escaped = false;
 const reports: unknown[] = [];
 for (let index = 0; index < trimmed.length; index++) {
 const char = trimmed[index];
 if (depth === 0) { if (char === '{') { start = index; depth = 1; } continue; }
 if (quoted) { if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === '"') quoted = false; continue; }
 if (char === '"') quoted = true;
 else if (char === '{') depth++;
 else if (char === '}' && --depth === 0) {
 try {
 const candidate = JSON.parse(trimmed.slice(start, index + 1));
 if (candidate && typeof candidate.companyName === 'string' && candidate.overview && (Array.isArray(candidate.evidence) || Array.isArray(candidate.hiringSignals))) reports.push(candidate);
 } catch { /* Ignore tool fragments; only a complete JSON report is eligible. */ }
 }
 }
 if (reports.length) return reports.at(-1);
 throw new SyntaxError('No complete final JSON report found');
}
export type ResearchRequestOptions = { timeoutMs?: number; normalization?: { transcript: string; citations: unknown[]; allowedUrls: string[] }; followUp?: { report: CompanyResearch; reason: string; leads?: ResearchLead[] } };
export type ResearchProviderResult = { report: unknown; model: string; usage: unknown; annotations: unknown[] };
export async function requestResearch(companyName: string, fetcher: typeof fetch = fetch, log: ResearchLogger = () => {}, options: ResearchRequestOptions = {}): Promise<ResearchProviderResult> {
 const apiKey = process.env.OPENROUTER_API_KEY;
 if (!apiKey) { log('configuration', 'Server credential is unavailable.', null, 'error'); throw new ResearchApiError('Company research requires OPENROUTER_API_KEY on the server.', 503); }
 const model = process.env.OPENROUTER_RESEARCH_MODEL || 'google/gemini-2.5-flash';
 const body = researchRequest(companyName, model);
 if (options.followUp) {
 body.messages.push({ role: 'user', content: JSON.stringify({ task: 'Complete the previous research using additional targeted web searches and webpage retrieval. Consolidate prior supported findings and newly discovered evidence into one complete report using the exact required schema. Do not merely reformat the previous report. Do not echo tool outputs. Keep unknown information null.', reason: options.followUp.reason, researchMemory: followUpMemory(options.followUp.report), leads: options.followUp.leads ?? [], efficiency: 'Reuse prior evidence IDs. Do not repeat prior queries or re-fetch reviewed pages unless a specific current-status check requires it. Investigate these leads, then return one consolidated complete JSON report.' }) });
 body.max_tool_calls = 12;
 body.tools.forEach(tool => { tool.parameters.max_uses = 6; });
 }
 if (options.normalization) {
 body.messages = [
 { role: 'system', content: 'Convert the supplied research transcript and retained source excerpts to ONE JSON object matching the required schema. This is a formatting step, not new research. Do not invent facts, URLs, quotations, dates, missing responsibilities, software use, problems or opportunities. Reuse only source URLs and quotations provided in the input. Preserve unknowns as null/unknown and missing support as empty arrays. Use one canonical evidence record per sourced fact; all category/opportunity/status references must point to its IDs. Distinguish existing automation from unmet needs. Do not output narrative or tool calls.' },
 { role: 'user', content: JSON.stringify({ companyName, transcript: options.normalization.transcript, retainedCitations: options.normalization.citations, allowedSourceUrls: options.normalization.allowedUrls }) },
 ];
 }
 const { tools: omittedTools, max_tool_calls: omittedLimit, ...schemaOnlyBody } = body;
 void omittedTools; void omittedLimit;
 const wireBody = options.normalization ? schemaOnlyBody : body;
 log('provider.request', options.normalization ? 'Formatting retained research into the strict schema; no web tools or new facts.' : 'Sending company research to OpenRouter with built-in web search and fetch.', { url: 'https://openrouter.ai/api/v1/chat/completions', body: wireBody });
 log('research', options.normalization ? 'Formatting retained evidence into the schema; no web research is being executed.' : 'OpenRouter is executing the research. Search/fetch traces become available when its response arrives; internal model reasoning is not exposed.');
 const started = Date.now();
 const heartbeat = setInterval(() => log('research.waiting', 'Waiting for OpenRouter research response.', { elapsedSeconds: Math.round((Date.now() - started) / 1000) }), 15000);
 let response: Response;
 try {
 response = await fetcher('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-Title': 'Velho Company Research' }, body: JSON.stringify(wireBody), signal: AbortSignal.timeout(options.timeoutMs ?? 240000) });
 } catch (error) { log('provider.error', 'OpenRouter connection failed.', { errorType: error instanceof Error ? error.name : 'Unknown' }, 'error'); throw new ResearchApiError(error instanceof Error && ['TimeoutError','AbortError'].includes(error.name) ? 'Research timed out. Try again.' : 'Cannot connect to OpenRouter. Try again.', 504); } finally { clearInterval(heartbeat); }
 log('provider.response', 'Received OpenRouter HTTP response.', { status: response.status, elapsedSeconds: Math.round((Date.now() - started) / 1000), requestId: response.headers.get('x-request-id') });
 if (!response.ok) {
 const errorBody = await response.text();
 log('provider.error', 'OpenRouter returned an error response.', { status: response.status, response: errorBody }, 'error');
 const message = response.status === 429 ? 'OpenRouter is rate limited. Please retry later.' : response.status === 402 ? 'OpenRouter credits are exhausted.' : [400,403,404].includes(response.status) ? 'OpenRouter rejected the model or server-tool configuration. Check model support and account tool permissions.' : response.status === 401 ? 'OpenRouter rejected the server API key.' : 'OpenRouter research failed. Please retry.';
 throw new ResearchApiError(message, response.status === 429 ? 429 : 502);
 }
 let data;
 try { data = await response.json(); } catch { throw new ResearchApiError('OpenRouter returned an invalid response.'); }
 log('provider.result', 'OpenRouter response, including available tool transcript, citations, and usage.', data);
 const choice = data.choices?.[0];
 if (data.error || !choice || choice.finish_reason !== 'stop' || typeof choice.message?.content !== 'string') {
 log('provider.incomplete', 'OpenRouter did not return a complete final answer.', { finishReason: choice?.finish_reason, error: data.error }, 'error');
 throw new ResearchApiError('OpenRouter returned incomplete research. No report was saved.');
 }
 log('extraction', 'Extracting the final JSON report from the server-tool transcript.');
 let report: unknown;
 try { report = parseModelReport(choice.message.content); } catch {
 const remaining = (options.timeoutMs ?? 240000) - (Date.now() - started);
 if (!options.normalization && remaining >= 10000) {
 log('extraction.format', 'Provider returned unstructured research. Requesting one bounded schema-only formatting pass, reusing existing evidence.', { remainingMilliseconds: remaining }, 'warning');
 const annotations = Array.isArray(choice.message.annotations) ? choice.message.annotations : [];
 const citations: { url?: string; title?: string; content?: string }[] = annotations.flatMap((entry: { url_citation?: { url?: string; title?: string; content?: string } }) => entry.url_citation ? [{ url: entry.url_citation.url, title: entry.url_citation.title, content: entry.url_citation.content?.slice(0,2000) }] : []);
 const previous = options.followUp?.report;
 const transcriptUrls = (choice.message.content.match(/https?:\/\/[^\s\"'<>\\]+/g) ?? []).flatMap((url: string) => [url, url.replace(/[),.;]+$/, '')]);
 const allowedUrls = [...new Set([...transcriptUrls, ...citations.flatMap(c => c.url ? [c.url] : []), ...(previous ? [...previous.evidence.map(f => f.sourceUrl), ...previous.identity.sourceUrls, ...previous.overview.sourceUrls, ...previous.financials.sourceUrls, ...(previous.website ? [previous.website] : [])] : [])])];
 const formatted = await requestResearch(companyName, fetcher, log, { timeoutMs: remaining, normalization: { transcript: choice.message.content, citations, allowedUrls } });
 return { ...formatted, usage: { researchPasses: [data.usage, formatted.usage], server_tool_use_details: data.usage?.server_tool_use_details ?? data.usage?.server_tool_use }, annotations: [...annotations, ...formatted.annotations] };
 }
 log('extraction', 'No valid final JSON report found in the response.', null, 'error');
 throw new ResearchApiError('Research was not valid JSON. No report was saved.');
 }
 if (options.normalization && report && typeof report === 'object') {
 const normalizedUrl = (value: string) => { try { const url = new URL(value); url.hash = ''; return url.href.replace(/\/$/, ''); } catch { return ''; } };
 const allowed = new Set(options.normalization.allowedUrls.map(normalizedUrl));
 const sourceAllowed = (value: string) => allowed.has(normalizedUrl(value));
 const retained = report as Record<string, unknown>;
 const warnings: string[] = [];
 if (Array.isArray(retained.evidence)) retained.evidence = retained.evidence.filter(f => {
 if (!f || typeof f.sourceUrl !== 'string' || !sourceAllowed(f.sourceUrl)) { warnings.push('A formatter-introduced source was withheld because it was absent from retained research.'); return false; }
 const quotationCorpus = `${options.normalization!.transcript} ${options.normalization!.citations.map(c => (c as {content?: string}).content ?? '').join(' ')}`.toLocaleLowerCase('en').replace(/\s+/g,' ');
 if (typeof f.sourceExcerpt !== 'string' || !quotationCorpus.includes(f.sourceExcerpt.toLocaleLowerCase('en').replace(/\s+/g,' ').trim())) { f.verification = 'unknown'; f.confidence = 'low'; f.status = 'unknown'; f.unmetNeedEvidence = null; warnings.push(`The formatted excerpt for ${f.id} could not be matched to retained material; the finding remains unverified.`); }
 return true;
 });
 for (const key of ['identity','overview','financials']) {
 const section = retained[key] as { sourceUrls?: string[] } | undefined;
 if (Array.isArray(section?.sourceUrls)) section.sourceUrls = section.sourceUrls.filter(sourceAllowed);
 }
 if (typeof retained.website === 'string' && !sourceAllowed(retained.website)) retained.website = null;
 if (Array.isArray(retained.limitations)) retained.limitations.push(...warnings);
 log('extraction.format', 'Schema-only formatting completed; source URLs and quotations checked against retained material.', { warnings });
 }
 log('extraction', 'Final JSON report extracted successfully.');
 return { report, model, usage: data.usage ?? null, annotations: Array.isArray(choice.message.annotations) ? choice.message.annotations : [] };
}

/** Shared strict JSON completion for downstream agents; no research tools are executed. */
export async function requestStructuredCompletion(name:string,schema:Schema,messages:{role:string;content:string}[],model=process.env.OPENROUTER_VISUALIZATION_MODEL||process.env.OPENROUTER_RESEARCH_MODEL||'google/gemini-2.5-flash',log:ResearchLogger=()=>{}){
 const key=process.env.OPENROUTER_API_KEY;
 if(!key)throw new ResearchApiError('OpenRouter is not configured on the server.',503);
 let response:Response;
 const headers={Authorization:`Bearer ${key}`,'Content-Type':'application/json','X-Title':'Velho Business Case Agent'};
 // The visualization schema contains nested chart data and wide enums. Gemini rejects it
 // as an upstream constrained schema (“too many states”), so use JSON mode and enforce the
 // full contract locally after parsing.
 const guidedMessages=[...messages,{role:'system',content:`Return one JSON object matching this schema guide exactly: ${JSON.stringify(compactSchemaGuide(schema))}`}];
 const requestBody={model,provider:{require_parameters:true},messages:guidedMessages,max_tokens:7000,response_format:{type:'json_object'}};
 try{response=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers,body:JSON.stringify(requestBody),signal:AbortSignal.timeout(120000)});}catch{throw new ResearchApiError('The visualization agent could not reach OpenRouter.',504);}
 if(!response.ok){
 const providerBody=await response.text();
 let providerMessage='';try{const parsed=JSON.parse(providerBody);providerMessage=parsed.error?.message||parsed.message||'';}catch{providerMessage=providerBody;}
 providerMessage=String(providerMessage).replace(/\s+/g,' ').slice(0,700);
 log('visualization.provider_error','OpenRouter rejected the visualization request.',{status:response.status,requestId:response.headers.get('x-request-id'),model,providerMessage},'error');
 const explanation=providerMessage?` OpenRouter says: ${providerMessage}`:'';
 throw new ResearchApiError(response.status===429?'OpenRouter is busy. Please retry shortly.':`OpenRouter rejected the visualization request (HTTP ${response.status}).${explanation}`,response.status===429?429:502);
 }
 const payload=await response.json();const choice=payload.choices?.[0];
 if(payload.error||choice?.finish_reason!=='stop'||typeof choice.message?.content!=='string'){log('visualization.provider_incomplete','OpenRouter returned no complete visualization plan.',{model,finishReason:choice?.finish_reason,error:payload.error??null,requestId:response.headers.get('x-request-id')},'error');throw new ResearchApiError(payload.error?.message||`OpenRouter returned an incomplete visualization plan${choice?.finish_reason?` (${choice.finish_reason})`:''}. Please retry.`);}
 let value:unknown;try{const content=choice.message.content.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');value=JSON.parse(content);}catch{log('visualization.provider_invalid_json','OpenRouter response was not valid JSON.',{model,requestId:response.headers.get('x-request-id')},'error');throw new ResearchApiError('OpenRouter returned invalid JSON for the visualization plan. Please retry.');}
 return{value,model,usage:payload.usage??null};
}
