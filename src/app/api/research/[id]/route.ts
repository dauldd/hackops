import { NextResponse } from 'next/server';
import { getResearch } from '@/lib/db';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
 const { id } = await context.params;
 if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) < 1) return NextResponse.json({ error: 'Invalid research ID.' }, { status: 400 });
 const result = (await getResearch(Number(id)));
 return result ? NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } }) : NextResponse.json({ error: 'Research not found.' }, { status: 404 });
}
