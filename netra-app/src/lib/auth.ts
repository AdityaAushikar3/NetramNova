/**
 * src/lib/auth.ts
 * NetramNova — Offline-safe authentication module.
 * Session is stored in localStorage so it survives page refresh without a server round-trip.
 * Credentials are env-configurable for PHC deployment.
 */

export type UserRole = 'health_worker' | 'doctor';

export interface NetraSession {
  name: string;
  role: UserRole;
  phcId: string;
  token: string;
}

// ── Hardcoded credentials (override via .env if needed) ─────────────────────
// NEXT_PUBLIC_ prefix makes them available client-side
const HEALTH_WORKER_PIN =
  process.env.NEXT_PUBLIC_HW_PIN ?? '1234';
const DOCTOR_PIN =
  process.env.NEXT_PUBLIC_DOCTOR_PIN ?? 'doctor2024';

const SESSION_KEY = 'netramnova_session';

export interface LoginCredentials {
  name: string;
  pin: string;
  role: UserRole;
}

// ── Auth helpers ─────────────────────────────────────────────────────────────

export function login(credentials: LoginCredentials): NetraSession | null {
  const { name, pin, role } = credentials;

  const expectedPin = role === 'doctor' ? DOCTOR_PIN : HEALTH_WORKER_PIN;
  if (pin !== expectedPin) return null;

  const session: NetraSession = {
    name: name.trim() || (role === 'doctor' ? 'Doctor' : 'Health Worker'),
    role,
    phcId: 'TG-EAST-04',
    token: btoa(`${role}:${Date.now()}`),
  };

  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // localStorage unavailable (e.g., SSR context) — ignore
  }

  return session;
}

export function getSession(): NetraSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as NetraSession;
  } catch {
    return null;
  }
}

export function logout(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {}
}

export function isDoctor(): boolean {
  return getSession()?.role === 'doctor';
}
