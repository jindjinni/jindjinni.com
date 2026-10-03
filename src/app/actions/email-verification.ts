"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { sendSignupVerificationEmail } from "@/lib/signup-verification";

export type SendCodeState = { error?: string; sent?: boolean; sentTo?: string } | undefined;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Sends a signup verification code to the email on the signup form. Kept
 * separate from signUpOrganization (actions/auth.ts) -- this one only ever
 * sends a code, it never creates anything, so a person can request (and
 * re-request) a code before the rest of the form is even filled in.
 */
export async function sendSignupVerificationCode(
  _prevState: SendCodeState,
  formData: FormData,
): Promise<SendCodeState> {
  const email = String(formData.get("email") ?? "").toLowerCase().trim();

  if (!email || !EMAIL_PATTERN.test(email)) {
    return { error: "Enter a valid email address first." };
  }

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) {
    return { error: "An account with that email already exists. Try logging in instead." };
  }

  const result = await sendSignupVerificationEmail(email);
  if (!result.ok) {
    // A cooldown rejection still leaves an earlier, still-valid code
    // waiting in the inbox -- keep the code-entry field showing for it
    // rather than making it look like nothing was ever sent.
    return result.cooldown ? { error: result.error, sent: true, sentTo: email } : { error: result.error };
  }

  return { sent: true, sentTo: email };
}
