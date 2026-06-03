const KEY = "marmita.login.attempts";
const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;

interface Entry {
  count: number;
  lockedUntil: number | null;
}

function read(): Record<string, Entry> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}

function write(data: Record<string, Entry>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(data));
}

function norm(u: string) {
  return u.trim().toLowerCase();
}

export function getLockRemainingMs(username: string): number {
  const e = read()[norm(username)];
  if (!e?.lockedUntil) return 0;
  return Math.max(0, e.lockedUntil - Date.now());
}

export function registerFailure(username: string): { locked: boolean; remainingMs: number; attemptsLeft: number } {
  const data = read();
  const k = norm(username);
  const e = data[k] ?? { count: 0, lockedUntil: null };
  e.count += 1;
  if (e.count >= MAX_ATTEMPTS) {
    e.lockedUntil = Date.now() + LOCK_MS;
    e.count = 0;
  }
  data[k] = e;
  write(data);
  return {
    locked: !!e.lockedUntil && e.lockedUntil > Date.now(),
    remainingMs: e.lockedUntil ? e.lockedUntil - Date.now() : 0,
    attemptsLeft: Math.max(0, MAX_ATTEMPTS - e.count),
  };
}

export function clearAttempts(username: string) {
  const data = read();
  delete data[norm(username)];
  write(data);
}

export function formatRemaining(ms: number): string {
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}min ${r}s` : `${r}s`;
}

export const LOCKOUT_MAX_ATTEMPTS = MAX_ATTEMPTS;
