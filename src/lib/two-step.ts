// Server side of two-step sign-in: checking the second step during sign-in, and the encrypted storage of the secret.
// The check lives here (and runs inside NextAuth's authorize) so that nothing -- not the login form, not a hand-made request --
// can sign in to an account that has two-step on without a valid code.

import { and, eq, isNull, lt, or } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { decryptToken } from "@/lib/email-connector-crypto";
import { checkTotp, looksLikeBackupCode, parseHashes, stepOf, consumeBackupCode } from "@/lib/totp";

export type SecondStepUser = {
  id: string;
  totpSecret: string | null;
  totpEnabledAt: string | null;
  totpBackupCodes: string | null;
  totpLastStep: number | null;
};

export const hasTwoStep = (u: { totpSecret: string | null; totpEnabledAt: string | null }) => !!u.totpEnabledAt && !!u.totpSecret;

/**
 * Checks the code typed at sign-in (an authenticator code, or one of the backup codes) and, when it is good, uses it up so it can't
 * be replayed. Atomic: two sign-ins racing with the same code, only one wins. Returns false for anything wrong; never throws.
 */
export async function passSecondStep(user: SecondStepUser, rawCode: string | null | undefined, nowMs = Date.now()): Promise<boolean> {
  try {
    const code = String(rawCode ?? "").trim();
    if (!code) return false;
    if (looksLikeBackupCode(code) && !/^\d{6}$/.test(code.replace(/\s/g, ""))) {
      const hashes = parseHashes(user.totpBackupCodes);
      const left = consumeBackupCode(hashes, code);
      if (!left) return false;
      // Compare-and-swap on the stored list: if someone else used a code first, the list no longer matches and this fails.
      const before = user.totpBackupCodes ?? "[]";
      const res = await db
        .update(users)
        .set({ totpBackupCodes: JSON.stringify(left) })
        .where(and(eq(users.id, user.id), eq(users.totpBackupCodes, before)));
      return (res as unknown as { rowsAffected?: number }).rowsAffected === 1;
    }
    const secret = user.totpSecret ? decryptToken(user.totpSecret) : null;
    if (!secret) return false;
    const step = checkTotp(secret, code, nowMs, user.totpLastStep);
    if (step === null) return false;
    const res = await db
      .update(users)
      .set({ totpLastStep: step })
      .where(and(eq(users.id, user.id), or(isNull(users.totpLastStep), lt(users.totpLastStep, step))));
    return (res as unknown as { rowsAffected?: number }).rowsAffected === 1;
  } catch {
    return false;
  }
}

/** Is two-step turned on for this person right now? (Used by "View as company" and the admin banner.) */
export async function twoStepOn(userId: string): Promise<boolean> {
  const [u] = await db.select({ s: users.totpSecret, e: users.totpEnabledAt }).from(users).where(eq(users.id, userId)).limit(1);
  return !!u && hasTwoStep({ totpSecret: u.s, totpEnabledAt: u.e });
}

export { stepOf };
