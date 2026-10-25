import { NextResponse } from 'next/server';
import { getResearchRun } from '@/lib/db';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
 const { id } = await context.params;
 const after = Number(new URL(request.url).searchParams.get('after') ?? 0);
 if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || !Number.isSafeInteger(after) || after < 0) return NextResponse.json({ error: 'Invalid research run or log cursor.' }, { status: 400 });
 const run = (await getResearchRun(id, after));
 return run ? NextResponse.json(run, { headers: { 'Cache-Control': 'no-store' } }) : NextResponse.json({ error: 'Research run not found.' }, { status: 404 });
}
