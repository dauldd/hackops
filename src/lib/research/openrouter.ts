import 'server-only';
import { COMPANY_RESEARCH_SYSTEM_PROMPT } from './prompt.ts';
import { researchSchema, type CompanyResearch } from './schema.ts';
import { followUpMemory, type ResearchLead } from './planning.ts';
import type { ResearchLogger } from './logging.ts';
export class ResearchApiError extends Error {
 status: number;
 constructor(message: string, status = 502) { super(message); this.status = status; }
}
export function researchRequest(companyName: string, model: string) {
 return { model, provider: { require_parameters: true }, messages: [
 { role: 'system', content: `${COMPANY_RESEARCH_SYSTEM_PROMPT}\n\nRequired final report schema (use these exact field names at the root; no wrapper):\n${JSON.stringify(researchSchema)}\nDo not echo tool payloads, raw search results, or fetched pages into your answer. Only return the final report object.` },
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
 throw new SyntaxError('No complete final JSON report found');
}
export type ResearchRequestOptions = { timeoutMs?: number; followUp?: { report: CompanyResearch; reason: string; leads?: ResearchLead[] } };
export async function requestResearch(companyName: string, fetcher: typeof fetch = fetch, log: ResearchLogger = () => {}, options: ResearchRequestOptions = {}) {
 const apiKey = process.env.OPENROUTER_API_KEY;
 if (!apiKey) { log('configuration', 'Server credential is unavailable.', null, 'error'); throw new ResearchApiError('Company research requires OPENROUTER_API_KEY on the server.', 503); }
 const model = process.env.OPENROUTER_RESEARCH_MODEL || 'google/gemini-2.5-flash';
 const body = researchRequest(companyName, model);
 if (options.followUp) {
 body.messages.push({ role: 'user', content: JSON.stringify({ task: 'Complete the previous research using additional targeted web searches and webpage retrieval. Consolidate prior supported findings and newly discovered evidence into one complete report using the exact required schema. Do not merely reformat the previous report. Do not echo tool outputs. Keep unknown information null.', reason: options.followUp.reason, researchMemory: followUpMemory(options.followUp.report), leads: options.followUp.leads ?? [], efficiency: 'Reuse prior evidence IDs. Do not repeat prior queries or re-fetch reviewed pages unless a specific current-status check requires it. Investigate these leads, then return one consolidated complete JSON report.' }) });
 body.max_tool_calls = 12;
 body.tools.forEach(tool => { tool.parameters.max_uses = 6; });
 }
 log('provider.request', 'Sending company research to OpenRouter with built-in web search and fetch.', { url: 'https://openrouter.ai/api/v1/chat/completions', body });
 log('research', 'OpenRouter is executing the research. Search/fetch traces become available when its response arrives; internal model reasoning is not exposed.');
 const started = Date.now();
 const heartbeat = setInterval(() => log('research.waiting', 'Waiting for OpenRouter research response.', { elapsedSeconds: Math.round((Date.now() - started) / 1000) }), 15000);
 let response: Response;
 try {
 response = await fetcher('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-Title': 'Velho Company Research' }, body: JSON.stringify(body), signal: AbortSignal.timeout(options.timeoutMs ?? 240000) });
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
 try { report = parseModelReport(choice.message.content); } catch { log('extraction', 'No valid final JSON report found in the response.', null, 'error'); throw new ResearchApiError('Research was not valid JSON. No report was saved.'); }
 log('extraction', 'Final JSON report extracted successfully.');
 return { report, model, usage: data.usage ?? null, annotations: choice.message.annotations ?? [] };
}
