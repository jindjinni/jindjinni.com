// "Forgot password" -- the pure rules (no database, no email), so they can be tested on their own. The service that uses them is
// password-reset.ts; the buttons are in actions/password-reset.ts.
//
// How it works, in plain words: a person types their email; if an account exists we email a one-time link that works for an hour.
// The link carries a long random token; only a one-way hash of it is kept, so a copy of the database can't take over an account.
// The page always answers the same ("if there is an account, we sent a link") so it can't be used to find out who has an account.
import { createHash, randomBytes } from "crypto";
import { isStaffEmail } from "@/lib/staff-login";

export const RESET_VALID_MINUTES = 60;
/** The same email can't be sent a new link more often than this. */
export const RESET_COOLDOWN_SEC = 60;
export const PASSWORD_MIN = 8;
/** bcrypt only reads the first 72 bytes, so a longer password would silently be cut short. */
export const PASSWORD_MAX_BYTES = 72;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeResetEmail(input: unknown): string {
  return String(input ?? "").toLowerCase().trim();
}

/** Only real email addresses can be sent a link. Staff logins an admin created (name@staff.invalid) have no mailbox: their admin resets them. */
export function emailCheck(email: string): { ok: true } | { ok: false; error: string; staff?: boolean } {
  if (!email || !EMAIL_PATTERN.test(email) || email.length > 254) return { ok: false, error: "Enter the email address you sign in with." };
  if (isStaffEmail(email)) return { ok: false, staff: true, error: "That is a staff login without an email. Ask your company's admin to reset your password." };
  return { ok: true };
}

/** What someone typed on the sign-in form could be a username (no "@"): tell them who resets those. */
export function looksLikeStaffUsername(input: string): boolean {
  const v = input.trim();
  return v.length > 0 && !v.includes("@");
}

export function passwordProblem(password: string, confirm: string): string | null {
  if (password.length < PASSWORD_MIN) return `Choose a password with at least ${PASSWORD_MIN} characters.`;
  if (Buffer.byteLength(password, "utf8") > PASSWORD_MAX_BYTES) return "That password is too long. Use 72 characters or fewer.";
  if (password !== confirm) return "The two passwords don't match.";
  return null;
}

export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newResetToken(nowMs: number): { token: string; tokenHash: string; expiresAt: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashResetToken(token), expiresAt: new Date(nowMs + RESET_VALID_MINUTES * 60000).toISOString() };
}

/** A token is 43 characters of letters, digits, "-" and "_". Anything else is refused before it touches the database. */
export function looksLikeResetToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

export type ResetStatus = "valid" | "used" | "expired" | "invalid";

export function resetStatus(row: { expiresAt: string; usedAt: string | null } | null | undefined, nowMs: number): ResetStatus {
  if (!row) return "invalid";
  if (row.usedAt) return "used";
  const exp = Date.parse(row.expiresAt);
  if (!Number.isFinite(exp) || exp <= nowMs) return "expired";
  return "valid";
}

/** True when a new link may be sent: the last one for this person was sent long enough ago. */
export function cooldownOver(lastCreatedAt: string | null | undefined, nowMs: number, cooldownSec: number = RESET_COOLDOWN_SEC): boolean {
  if (!lastCreatedAt) return true;
  const t = Date.parse(lastCreatedAt);
  return !Number.isFinite(t) || nowMs - t >= cooldownSec * 1000;
}

export function resetUrl(base: string, token: string): string {
  return `${base.replace(/\/$/, "")}/reset-password/${token}`;
}

export function resetEmailContent(url: string): { subject: string; text: string; html: string } {
  const text = `Someone asked to reset the password for your jindjinni account. To choose a new password, open this link within ${RESET_VALID_MINUTES} minutes:\n\n${url}\n\nIf you didn't ask for this, you can ignore this email and your password stays the same.`;
  const html = `
    <div style="font-family: sans-serif; font-size: 15px; color: #1e293b;">
      <p>Someone asked to reset the password for your jindjinni account.</p>
      <p><a href="${url}" style="display:inline-block;background:#1fd16b;color:#0c1f34;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:999px;">Choose a new password</a></p>
      <p>The link works once and expires in ${RESET_VALID_MINUTES} minutes. If the button doesn't work, copy this address into your browser:<br>${url}</p>
      <p>If you didn't ask for this, you can ignore this email and your password stays the same.</p>
    </div>`;
  return { subject: "Reset your jindjinni password", text, html };
}

/** Same wording whether or not an account exists. */
export const RESET_SENT_MESSAGE = "If there is an account with that email, we've sent a link to choose a new password. It works for an hour. Check your spam folder if you don't see it.";
