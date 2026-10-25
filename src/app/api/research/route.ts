import { NextResponse } from 'next/server';
import { researchCompany } from '@/lib/research/agent';
import { ResearchApiError } from '@/lib/research/openrouter';
import { parseCompanyName, ValidationError } from '@/lib/research/schema';
import { listResearch } from '@/lib/db';
import { isSameOriginRequest } from '@/lib/research/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
// Bound concurrent billable requests in this single-process SQLite application.
let busy = false;
export async function POST(request: Request) {
 if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Cross-origin research requests are not allowed.' }, { status: 403 });
 let companyName: string;
 let runId: string | undefined;
 try {
 if (Number(request.headers.get('content-length')) > 2048) throw new ValidationError('Request is too large.');
 const body = await request.text();
 if (body.length > 2048) throw new ValidationError('Request is too large.');
 const parsed = JSON.parse(body);
 companyName = parseCompanyName(parsed?.companyName);
 if (parsed.runId !== undefined) {
 if (typeof parsed.runId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(parsed.runId)) throw new ValidationError('Invalid run ID.');
 runId = parsed.runId;
 }
 } catch { return NextResponse.json({ error: 'Provide a companyName between 1 and 200 characters.' }, { status: 400 }); }
 if (busy) return NextResponse.json({ error: 'Research is already running. Please retry when it finishes.' }, { status: 429, headers: { 'Retry-After': '30' } });
 busy = true;
 try { return NextResponse.json(await researchCompany(companyName, undefined, { runId }), { status: 201 }); }
 catch (error) {
 if (error instanceof ResearchApiError) return NextResponse.json({ error: error.message }, { status: error.status });
 if (error instanceof ValidationError) return NextResponse.json({ error: `Research did not pass evidence validation. No report was saved. ${error.message}` }, { status: 502 });
 console.error('Company research failed', error instanceof Error ? error.name : 'Unknown error');
 return NextResponse.json({ error: 'Research could not be saved. Please retry.' }, { status: 500 });
 } finally { busy = false; }
}
export async function GET() { return NextResponse.json({ results: listResearch() }, { headers: { 'Cache-Control': 'no-store' } }); }
