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
    console.error('[NetramNova DB] Critical Error loading database. Halting to prevent data wipe:', error);
    throw new Error(`Failed to load database from ${DB_FILE_PATH}: ${error}`);
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


function extractBase64AndSave(base64Data: string, prefix: string): string {
  if (!base64Data) return base64Data;
  if (base64Data.startsWith('/api/images/')) return base64Data;
  if (base64Data.startsWith('http')) return base64Data;
  
  let data = base64Data;
  let ext = 'jpg';
  
  if (base64Data.startsWith('data:image')) {
    const matches = base64Data.match(/^data:(image\/\w+);base64,(.+)$/);
    if (matches && matches.length === 3) {
      ext = matches[1].split('/')[1] === 'png' ? 'png' : 'jpg';
      data = matches[2];
    }
  }
  
  try {
    const buffer = Buffer.from(data, 'base64');
    const filename = `${prefix}_${Date.now()}.${ext}`;
    const imagesDir = path.join(process.cwd(), 'data', 'images');
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
    }
    fs.writeFileSync(path.join(imagesDir, filename), buffer);
    return `/api/images/${filename}`;
  } catch (err) {
    console.error('[NetramNova DB] Failed to save image to disk', err);
    return base64Data; // fallback
  }
}

export async function saveCase(c: ScreeningCase): Promise<void> {
  // P1: Extract base64 images to filesystem before saving to db.json
  if (c.imageUrl && c.imageUrl.length > 500) {
    c.imageUrl = extractBase64AndSave(c.imageUrl, `${c.id}_original`);
  }
  if (c.result) {
    if (c.result.preprocessedImage && c.result.preprocessedImage.length > 500) {
      c.result.preprocessedImage = extractBase64AndSave(c.result.preprocessedImage, `${c.id}_preprocessed`);
    }
    if (c.result.gradcamOverlay && c.result.gradcamOverlay.length > 500) {
      c.result.gradcamOverlay = extractBase64AndSave(c.result.gradcamOverlay, `${c.id}_gradcam`);
    }
  }

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
