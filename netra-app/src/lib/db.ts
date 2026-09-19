import fs from 'fs';
import path from 'path';

import type { ScreeningCase, Patient } from '../components/netra/types';

// Re-export types so API routes can import from one place
export type { ScreeningCase, Patient };

// ── Schema ──────────────────────────────────────────────────────────────────

interface DatabaseSchema {
  cases: Record<string, ScreeningCase>;
  patients: Record<string, Patient>;
}

const EMPTY_DB: DatabaseSchema = { cases: {}, patients: {} };

// ── DB-1 FIX: Write mutex ────────────────────────────────────────────────────
// Next.js API routes run in the same Node process. Without a lock, two
// simultaneous POSTs (e.g. /api/cases + /api/patients during hydration) both
// call loadDb(), get the same snapshot, then one write overwrites the other.
// A simple Promise-based mutex serialises all write operations.
let _writeLock: Promise<void> = Promise.resolve();



// Upgrade to async queue for true protection:
async function acquireWriteLock(): Promise<() => void> {
  let release!: () => void;
  const prev = _writeLock;
  _writeLock = new Promise<void>((res) => { release = res; });
  await prev;
  return release;
}

// ── Path resolution ──────────────────────────────────────────────────────────

const IS_VERCEL = !!process.env.VERCEL;

const READONLY_DB_PATH = path.join(process.cwd(), 'db.json');
const WRITEABLE_DB_PATH = path.join('/tmp', 'db.json');
const DB_FILE_PATH = IS_VERCEL ? WRITEABLE_DB_PATH : READONLY_DB_PATH;

// ── Core helpers ─────────────────────────────────────────────────────────────

function loadDb(): DatabaseSchema {
  try {
    if (IS_VERCEL && !fs.existsSync(WRITEABLE_DB_PATH)) {
      fs.writeFileSync(WRITEABLE_DB_PATH, JSON.stringify(EMPTY_DB, null, 2), 'utf8');
    } else if (!IS_VERCEL && !fs.existsSync(READONLY_DB_PATH)) {
      fs.writeFileSync(READONLY_DB_PATH, JSON.stringify(EMPTY_DB, null, 2), 'utf8');
    }
    const data = fs.readFileSync(DB_FILE_PATH, 'utf8');
    const parsed = JSON.parse(data);
    // Ensure both top-level keys always exist (handles old db.json formats)
    return {
      cases: parsed.cases ?? {},
      patients: parsed.patients ?? {},
    };
  } catch (error) {
    console.error('[NetramNova DB] Error loading database:', error);
    return { ...EMPTY_DB };
  }
}

function saveDb(db: DatabaseSchema): void {
  try {
    fs.writeFileSync(DB_FILE_PATH, JSON.stringify(db, null, 2), 'utf8');
  } catch (error) {
    console.error('[NetramNova DB] Error saving database:', error);
  }
}

// ── Screening Cases CRUD ─────────────────────────────────────────────────────

export async function saveCase(c: ScreeningCase): Promise<void> {
  const release = await acquireWriteLock();
  try {
    const db = loadDb();
    db.cases[c.id] = c;
    saveDb(db);
  } finally {
    release();
  }
}

export function getCase(id: string): ScreeningCase | null {
  const db = loadDb();
  return db.cases[id] ?? null;
}

export function listCases(): ScreeningCase[] {
  const db = loadDb();
  return Object.values(db.cases).sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}

export async function updateCase(
  id: string,
  patch: Partial<Pick<ScreeningCase, 'doctorReviewStatus' | 'doctorNotes' | 'synced'>>
): Promise<ScreeningCase | null> {
  const release = await acquireWriteLock();
  try {
    const db = loadDb();
    if (!db.cases[id]) return null;
    db.cases[id] = { ...db.cases[id], ...patch };
    saveDb(db);
    return db.cases[id];
  } finally {
    release();
  }
}

// ── Patients CRUD ─────────────────────────────────────────────────────────────

export async function savePatient(p: Patient): Promise<void> {
  const release = await acquireWriteLock();
  try {
    const db = loadDb();
    db.patients[p.id] = p;
    saveDb(db);
  } finally {
    release();
  }
}

export function getPatient(id: string): Patient | null {
  const db = loadDb();
  return db.patients[id] ?? null;
}

export function listPatients(): Patient[] {
  const db = loadDb();
  return Object.values(db.patients);
}
