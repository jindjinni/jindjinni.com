import { randomInt, createHash } from "crypto";
import { eq, and, desc, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { signupEmailVerifications } from "@/db/schema";
import { newId } from "@/lib/ids";
import { sendEmail } from "@/lib/email";

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const RESEND_COOLDOWN_MS = 45 * 1000; // 45 seconds between sends for the same email
const MAX_ATTEMPTS = 5;

function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function generateCode(): string {
  return String(randomInt(100000, 1000000)); // always 6 digits
}

/**
 * Sends a fresh 6-digit code to `email` and records it, enforcing a short
 * cooldown so the same email can't be re-sent every click. Does NOT check
 * whether the email already belongs to a registered user -- callers that
 * care (signup) check that themselves first, since "already registered" is
 * a different error message than anything to do with the code itself.
 */
export async function sendSignupVerificationEmail(
  email: string,
): Promise<{ ok: true } | { ok: false; error: string; cooldown?: boolean }> {
  const normalized = normalizeEmail(email);

  const [latest] = await db
    .select()
    .from(signupEmailVerifications)
    .where(eq(signupEmailVerifications.email, normalized))
    .orderBy(desc(signupEmailVerifications.createdAt))
    .limit(1);

  if (latest) {
    const sentAt = new Date(latest.createdAt).getTime();
    const elapsed = Date.now() - sentAt;
    if (elapsed < RESEND_COOLDOWN_MS) {
      const waitSeconds = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
      // The earlier code is still live -- this only blocks requesting a
      // NEW one too soon. Callers should keep showing the code-entry field
      // for it, not treat this as "nothing has been sent."
      return { ok: false, cooldown: true, error: `Please wait ${waitSeconds}s before requesting another code.` };
    }
  }

  const code = generateCode();
  const now = new Date();

  const emailResult = await sendEmail({
    to: normalized,
    subject: `Your Jindjinni verification code is ${code}`,
    text: `Your verification code is ${code}. It expires in 10 minutes. If you didn't request this, you can ignore this email.`,
    html: `
      <div style="font-family: sans-serif; font-size: 15px; color: #1e293b;">
        <p>Your verification code is:</p>
        <p style="font-size: 28px; font-weight: 700; letter-spacing: 4px;">${code}</p>
        <p>It expires in 10 minutes. If you didn't request this, you can ignore this email.</p>
      </div>
    `,
  });
  if (!emailResult.ok) return emailResult;

  await db.insert(signupEmailVerifications).values({
    id: newId("sev"),
    email: normalized,
    codeHash: hashCode(code),
    expiresAt: new Date(now.getTime() + CODE_TTL_MS).toISOString(),
    attempts: 0,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });

  return { ok: true };
}

/**
 * Checks `submittedCode` against the most recent unconsumed, unexpired code
 * sent to `email`, and consumes it (marks it used) on success so it can't be
 * replayed. This is the actual security boundary -- signUpOrganization calls
 * this itself before creating any account, independent of whatever the
 * signup page's UI already showed the person.
 */
export async function consumeSignupVerificationCode(
  email: string,
  submittedCode: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const normalized = normalizeEmail(email);
  const trimmedCode = submittedCode.trim();

  const [latest] = await db
    .select()
    .from(signupEmailVerifications)
    .where(and(eq(signupEmailVerifications.email, normalized), isNull(signupEmailVerifications.consumedAt)))
    .orderBy(desc(signupEmailVerifications.createdAt))
    .limit(1);

  if (!latest) {
    return { ok: false, error: "Send yourself a verification code first." };
  }
  if (new Date(latest.expiresAt).getTime() < Date.now()) {
    return { ok: false, error: "That code expired. Please request a new one." };
  }
  if (latest.attempts >= MAX_ATTEMPTS) {
    return { ok: false, error: "Too many incorrect attempts. Please request a new code." };
  }

  if (hashCode(trimmedCode) !== latest.codeHash) {
    await db
      .update(signupEmailVerifications)
      .set({ attempts: latest.attempts + 1, updatedAt: new Date().toISOString() })
      .where(eq(signupEmailVerifications.id, latest.id));
    return { ok: false, error: "That code is incorrect. Please check your email and try again." };
  }

  await db
    .update(signupEmailVerifications)
    .set({ consumedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    .where(eq(signupEmailVerifications.id, latest.id));

  return { ok: true };
}
