import { NextRequest, NextResponse } from 'next/server';
import { updateCase } from '@/lib/db';

// PATCH /api/cases/[id] — update doctor review status / notes / synced flag
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    // API-3 FIX: Whitelist allowed fields before passing to DB.
    // Without this, a malformed or malicious request body could overwrite
    // arbitrary case fields (e.g., patient data, result) via spread in updateCase.
    const allowedPatch: Record<string, unknown> = {};
    if ('doctorReviewStatus' in body) allowedPatch.doctorReviewStatus = body.doctorReviewStatus;
    if ('doctorNotes' in body) allowedPatch.doctorNotes = body.doctorNotes;
    if ('synced' in body) allowedPatch.synced = body.synced;

    if (Object.keys(allowedPatch).length === 0) {
      return NextResponse.json(
        { error: 'No valid fields to update. Allowed: doctorReviewStatus, doctorNotes, synced' },
        { status: 400 }
      );
    }

    const updated = updateCase(id, allowedPatch as Parameters<typeof updateCase>[1]);
    if (!updated) {
      return NextResponse.json({ error: `Case ${id} not found` }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (error: unknown) {
    console.error('[PATCH /api/cases/:id]', error);
    return NextResponse.json({ error: 'Failed to update case' }, { status: 500 });
  }
}

