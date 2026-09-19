import { NextRequest, NextResponse } from 'next/server';
import { listPatients, savePatient } from '@/lib/db';

// GET /api/patients — return all registered patients
export async function GET() {
  try {
    const patients = listPatients();
    return NextResponse.json(patients);
  } catch (error: unknown) {
    console.error('[GET /api/patients]', error);
    return NextResponse.json({ error: 'Failed to load patients' }, { status: 500 });
  }
}

// POST /api/patients — register a new patient
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body || !body.id || !body.name) {
      return NextResponse.json(
        { error: 'Invalid patient payload — missing id or name' },
        { status: 400 }
      );
    }
    await savePatient(body);
    return NextResponse.json({ success: true, id: body.id }, { status: 201 });
  } catch (error: unknown) {
    console.error('[POST /api/patients]', error);
    return NextResponse.json({ error: 'Failed to register patient' }, { status: 500 });
  }
}
