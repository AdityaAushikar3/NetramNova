import fs from 'fs';
import path from 'path';
import defaultDb from '../../db.json';

export interface SurveyBlueprint {
  id: string;
  title: string;
  topic: string;
  description: string;
  goals: string[];
  persona: string;
  createdAt: string;
}

export interface RespondentSession {
  id: string;
  surveyId: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  extractedPoints: Record<string, string>; // Maps goal -> summary of response
  completed: boolean;
  createdAt: string;
}

interface DatabaseSchema {
  surveys: Record<string, SurveyBlueprint>;
  sessions: Record<string, RespondentSession>;
}

// Check if running on Vercel
const IS_VERCEL = !!process.env.VERCEL;

// Resolve the read-only and writeable paths
const READONLY_DB_PATH = path.join(process.cwd(), 'db.json');
const WRITEABLE_DB_PATH = path.join('/tmp', 'db.json');

const DB_FILE_PATH = IS_VERCEL ? WRITEABLE_DB_PATH : READONLY_DB_PATH;

// Helper to initialize or load the database safely
function loadDb(): DatabaseSchema {
  try {
    if (IS_VERCEL) {
      // If the writeable db.json doesn't exist in /tmp, copy it from defaultDb
      if (!fs.existsSync(WRITEABLE_DB_PATH)) {
        fs.writeFileSync(WRITEABLE_DB_PATH, JSON.stringify(defaultDb, null, 2), 'utf8');
      }
    } else {
      // Local development flow
      if (!fs.existsSync(READONLY_DB_PATH)) {
        fs.writeFileSync(READONLY_DB_PATH, JSON.stringify(defaultDb, null, 2), 'utf8');
      }
    }

    const data = fs.readFileSync(DB_FILE_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error("Error loading JSON database:", error);
    return defaultDb as DatabaseSchema;
  }
}

// Helper to write changes to disk safely
function saveDb(db: DatabaseSchema): void {
  try {
    fs.writeFileSync(DB_FILE_PATH, JSON.stringify(db, null, 2), 'utf8');
  } catch (error) {
    console.error("Error saving JSON database:", error);
  }
}

// === Survey CRUD Methods ===

export function saveSurvey(survey: SurveyBlueprint): void {
  const db = loadDb();
  db.surveys[survey.id] = survey;
  saveDb(db);
}

export function getSurvey(id: string): SurveyBlueprint | null {
  const db = loadDb();
  return db.surveys[id] || null;
}

export function listSurveys(): SurveyBlueprint[] {
  const db = loadDb();
  return Object.values(db.surveys).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

// === Session CRUD Methods ===

export function saveSession(session: RespondentSession): void {
  const db = loadDb();
  db.sessions[session.id] = session;
  saveDb(db);
}

export function getSession(id: string): RespondentSession | null {
  const db = loadDb();
  return db.sessions[id] || null;
}

export function listSessionsForSurvey(surveyId: string): RespondentSession[] {
  const db = loadDb();
  return Object.values(db.sessions)
    .filter((s) => s.surveyId === surveyId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
