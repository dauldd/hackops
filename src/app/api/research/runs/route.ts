import { NextResponse } from 'next/server';
import { listResearchRuns } from '@/lib/db';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() { return NextResponse.json({ results: listResearchRuns() }, { headers: { 'Cache-Control': 'no-store' } }); }
