import { NextRequest, NextResponse } from 'next/server';
import { listCases, saveCase } from '@/lib/db';

// GET /api/cases — return all cases sorted by timestamp desc
export async function GET() {
  try {
    const cases = listCases();
    return NextResponse.json(cases);
  } catch (error: unknown) {
    console.error('[GET /api/cases]', error);
    return NextResponse.json({ error: 'Failed to load cases' }, { status: 500 });
  }
}

// POST /api/cases — persist a new screening case
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body || !body.id) {
      return NextResponse.json({ error: 'Invalid case payload — missing id' }, { status: 400 });
    }
    await saveCase(body);
    return NextResponse.json({ success: true, id: body.id }, { status: 201 });
  } catch (error: unknown) {
    console.error('[POST /api/cases]', error);
    return NextResponse.json({ error: 'Failed to save case' }, { status: 500 });
  }
}
