"use server";

// Settings -> My account: any signed-in person can change their OWN name and
// password. Nothing here touches anyone else's record.

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { rateHit } from "@/lib/rate-limit";
import { sendEmail } from "@/lib/email";
import { consumeSignupVerificationCode, sendSignupVerificationEmail } from "@/lib/signup-verification";
import { TERMS_VERSION } from "@/lib/legal";
import { requireOrg } from "@/lib/tenant";

export type AccountActionState = { error?: string; message?: string } | undefined;

export async function updateMyName(_prev: AccountActionState, formData: FormData): Promise<AccountActionState> {
  const org = await requireOrg();
  const name = String(formData.get("name") ?? "").trim().replace(/\s+/g, " ");
  if (!name) return { error: "Enter your name." };
  if (name.length > 100) return { error: "That name is too long." };
  await db.update(users).set({ name }).where(eq(users.id, org.userId));
  return { message: "Name updated." };
}

export async function changeMyPassword(_prev: AccountActionState, formData: FormData): Promise<AccountActionState> {
  const org = await requireOrg();
  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (!current || !next) return { error: "Fill in your current and new password." };
  if (next.length < 8) return { error: "Your new password must be at least 8 characters." };
  if (next !== confirm) return { error: "The new password and its confirmation don't match." };
  if (next === current) return { error: "Choose a password different from your current one." };

  const [user] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, org.userId)).limit(1);
  if (!user?.passwordHash || !(await bcrypt.compare(current, user.passwordHash))) {
    return { error: "Your current password isn't right." };
  }
  await db.update(users).set({ passwordHash: await bcrypt.hash(next, 10), mustChangePassword: false }).where(eq(users.id, org.userId));
  return { message: "Password changed. Use the new one next time you sign in." };
}

/** People who signed up before the legal pages existed (or when the Terms change) agree once here. */
export async function acceptCurrentTerms(_prev: AccountActionState, formData: FormData): Promise<AccountActionState> {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/login");
  if (formData.get("acceptTerms") !== "on") return { error: "Tick the box to continue." };
  await db.update(users).set({ termsAcceptedAt: new Date().toISOString(), termsVersion: TERMS_VERSION }).where(eq(users.id, userId));
  redirect("/dashboard");
}

// ---- Change my sign-in email ----------------------------------------------------------------------------------------
// Two steps, both needing the current password: (1) ask for a 6-digit code to be sent to the NEW address, (2) type the code.
// Only someone who can read the new mailbox can finish, and the old address is told afterwards. The password is checked again
// in step 2 because the new address in step 2 comes from the browser; the code alone must never be enough.

export type EmailChangeState = { error?: string; sent?: boolean; sentTo?: string; message?: string } | undefined;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function checkEmailChangeInputs(userId: string, formData: FormData): Promise<{ error: string } | { newEmail: string; oldEmail: string }> {
  const newEmail = String(formData.get("newEmail") ?? "").toLowerCase().trim();
  const password = String(formData.get("currentPassword") ?? "");
  if (!newEmail || !EMAIL_PATTERN.test(newEmail) || newEmail.length > 200) return { error: "Enter a valid email address." };
  if (!password) return { error: "Enter your current password." };
  const [me] = await db.select({ email: users.email, username: users.username, passwordHash: users.passwordHash }).from(users).where(eq(users.id, userId)).limit(1);
  if (!me) return { error: "Account not found." };
  if (me.username) return { error: "Your sign-in is a username set by your admin, so it can't be changed here. Ask an admin." };
  if (!me.passwordHash || !(await bcrypt.compare(password, me.passwordHash))) return { error: "Your current password isn't right." };
  if (newEmail === me.email.toLowerCase()) return { error: "That is already your sign-in email." };
  const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, newEmail)).limit(1);
  if (taken) return { error: "Another account already uses that email." };
  return { newEmail, oldEmail: me.email };
}

export async function requestEmailChange(_prev: EmailChangeState, formData: FormData): Promise<EmailChangeState> {
  const org = await requireOrg();
  const lim = await rateHit("email-change", org.userId, 6, 3600);
  if (!lim.allowed) return { error: "Too many tries. Please wait a while and try again." };
  const checked = await checkEmailChangeInputs(org.userId, formData);
  if ("error" in checked) return { error: checked.error };
  const sent = await sendSignupVerificationEmail(checked.newEmail);
  if (!sent.ok) return sent.cooldown ? { error: sent.error, sent: true, sentTo: checked.newEmail } : { error: sent.error };
  return { sent: true, sentTo: checked.newEmail };
}

export async function confirmEmailChange(_prev: EmailChangeState, formData: FormData): Promise<EmailChangeState> {
  const org = await requireOrg();
  const lim = await rateHit("email-change-confirm", org.userId, 10, 3600);
  if (!lim.allowed) return { error: "Too many tries. Please wait a while and try again." };
  const checked = await checkEmailChangeInputs(org.userId, formData);
  if ("error" in checked) return { error: checked.error };
  const code = String(formData.get("code") ?? "").trim();
  if (!/^\d{6}$/.test(code)) return { error: "Enter the 6-digit code we emailed to the new address.", sent: true, sentTo: checked.newEmail };
  const consumed = await consumeSignupVerificationCode(checked.newEmail, code);
  if (!consumed.ok) return { error: consumed.error, sent: true, sentTo: checked.newEmail };
  const now = new Date().toISOString();
  try {
    await db.update(users).set({ email: checked.newEmail, emailVerified: now, failedLogins: 0, lockedUntil: null }).where(eq(users.id, org.userId));
  } catch {
    return { error: "Another account already uses that email." };
  }
  // Tell the old address (best effort): if this wasn't them, they know right away.
  await sendEmail({
    to: checked.oldEmail,
    subject: "Your Jindjinni sign-in email was changed",
    text: `The sign-in email for your Jindjinni account was changed to ${checked.newEmail}. If this was not you, contact support right away.`,
    html: `<div style="font-family: sans-serif; font-size: 15px; color: #1e293b;"><p>The sign-in email for your Jindjinni account was changed to <strong>${checked.newEmail}</strong>.</p><p>If this was not you, contact support right away.</p></div>`,
  }).catch(() => undefined);
  // Sign out so the next sign-in uses the new address.
  await signOut({ redirectTo: "/login" });
  return { message: "Your sign-in email is changed. Please sign in again." };
}
