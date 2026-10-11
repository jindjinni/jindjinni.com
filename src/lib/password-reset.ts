// "Forgot password" -- the database side. Rules and wording are in password-reset-rules.ts.
import { and, desc, eq, gt, isNull, ne } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/db/client";
import { passwordResets, users } from "@/db/schema";
import { newId } from "@/lib/ids";
import { sendEmail } from "@/lib/email";
import {
  cooldownOver, emailCheck, hashResetToken, looksLikeResetToken, newResetToken, resetEmailContent, resetStatus, resetUrl, type ResetStatus,
} from "@/lib/password-reset-rules";

/** The address the emailed link points to. Never taken from the visitor's request (that could be faked); from our own settings. */
export function appUrl(): string {
  const set = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (set) return set;
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;
  return "https://jindjinni.com";
}

/**
 * Sends the reset link when there is an account for this email. Says nothing about whether there was (the caller shows the same
 * answer either way). Only the newest link works: sending a new one retires the older ones.
 */
export async function requestPasswordReset(rawEmail: string): Promise<void> {
  const check = emailCheck(rawEmail);
  if (!check.ok) return;
  const [user] = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.email, rawEmail)).limit(1);
  if (!user) return;

  const now = Date.now();
  const [latest] = await db
    .select({ createdAt: passwordResets.createdAt })
    .from(passwordResets)
    .where(eq(passwordResets.userId, user.id))
    .orderBy(desc(passwordResets.createdAt))
    .limit(1);
  if (!cooldownOver(latest?.createdAt, now)) return;

  const { token, tokenHash, expiresAt } = newResetToken(now);
  const id = newId("pwr");
  const stamp = new Date(now).toISOString();
  await db.insert(passwordResets).values({ id, userId: user.id, tokenHash, expiresAt, createdAt: stamp, updatedAt: stamp });

  const mail = resetEmailContent(resetUrl(appUrl(), token));
  const sent = await sendEmail({ to: user.email, subject: mail.subject, text: mail.text, html: mail.html });
  if (!sent.ok) {
    // Nothing reached the inbox: retire the link so it can't be used, and say so in the log (the visitor still sees the same answer).
    console.error("[password-reset] email not sent:", sent.error);
    await db.update(passwordResets).set({ usedAt: stamp, updatedAt: stamp }).where(eq(passwordResets.id, id));
    return;
  }
  // The new link is the only live one.
  await db
    .update(passwordResets)
    .set({ usedAt: stamp, updatedAt: stamp })
    .where(and(eq(passwordResets.userId, user.id), isNull(passwordResets.usedAt), ne(passwordResets.id, id)));
}

export type ResetLookup = { status: Exclude<ResetStatus, "valid"> } | { status: "valid" };

/** Is this link still good? (Only checks; the password is changed by completePasswordReset.) */
export async function lookupResetToken(token: string): Promise<ResetLookup> {
  if (!looksLikeResetToken(token)) return { status: "invalid" };
  const [row] = await db
    .select({ expiresAt: passwordResets.expiresAt, usedAt: passwordResets.usedAt })
    .from(passwordResets)
    .where(eq(passwordResets.tokenHash, hashResetToken(token)))
    .limit(1);
  return { status: resetStatus(row, Date.now()) };
}

/**
 * Spends the link and sets the new password. The link is claimed with one conditional update first, so two clicks at the same
 * moment can't both use it. Also lifts a "too many wrong passwords" pause and the "choose your own password" flag. Two-step
 * sign-in stays on: the person still needs their authenticator code to sign in.
 */
export async function completePasswordReset(token: string, newPassword: string): Promise<{ ok: true } | { ok: false; status: Exclude<ResetStatus, "valid"> }> {
  if (!looksLikeResetToken(token)) return { ok: false, status: "invalid" };
  const tokenHash = hashResetToken(token);
  const passwordHash = await bcrypt.hash(newPassword, 10);
  const stamp = new Date().toISOString();

  const claimed = await db
    .update(passwordResets)
    .set({ usedAt: stamp, updatedAt: stamp })
    .where(and(eq(passwordResets.tokenHash, tokenHash), isNull(passwordResets.usedAt), gt(passwordResets.expiresAt, stamp)))
    .returning({ userId: passwordResets.userId });

  if (claimed.length === 0) {
    const [row] = await db
      .select({ expiresAt: passwordResets.expiresAt, usedAt: passwordResets.usedAt })
      .from(passwordResets)
      .where(eq(passwordResets.tokenHash, tokenHash))
      .limit(1);
    const status = resetStatus(row, Date.now());
    return { ok: false, status: status === "valid" ? "used" : status };
  }

  const userId = claimed[0].userId;
  await db
    .update(users)
    .set({ passwordHash, mustChangePassword: false, failedLogins: 0, lockedUntil: null, updatedAt: stamp })
    .where(eq(users.id, userId));
  // Any other link still waiting for this person is no longer needed.
  await db
    .update(passwordResets)
    .set({ usedAt: stamp, updatedAt: stamp })
    .where(and(eq(passwordResets.userId, userId), isNull(passwordResets.usedAt)));
  return { ok: true };
}
