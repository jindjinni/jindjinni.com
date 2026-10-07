// Sign-in throttle: a wrong password too many times in a row pauses sign-in for
// that account for a while. Pure helpers here; the counters live on the user row
// (users.failed_logins / users.locked_until) and are updated in src/lib/auth.ts.
// Staff usernames are easy to guess ("maria_acme"), so this matters.

export const MAX_FAILED_LOGINS = 8;
export const LOCK_MINUTES = 15;

/** Minutes left on a lock (rounded up), or 0 when the account is not locked. */
export function lockMinutesLeft(lockedUntil: string | null | undefined, nowMs: number): number {
  if (!lockedUntil) return 0;
  const until = Date.parse(lockedUntil);
  if (!Number.isFinite(until) || until <= nowMs) return 0;
  return Math.ceil((until - nowMs) / 60000);
}

/** What to store after one more wrong password. */
export function afterFailedLogin(failedLogins: number | null | undefined, nowMs: number): { failedLogins: number; lockedUntil: string | null } {
  const count = (failedLogins ?? 0) + 1;
  if (count >= MAX_FAILED_LOGINS) {
    return { failedLogins: 0, lockedUntil: new Date(nowMs + LOCK_MINUTES * 60000).toISOString() };
  }
  return { failedLogins: count, lockedUntil: null };
}

export function lockedMessage(minutes: number): string {
  return `Too many wrong passwords. Sign-in is paused for ${minutes} more minute${minutes === 1 ? "" : "s"}. If you forgot it, ask your admin to reset it.`;
}
