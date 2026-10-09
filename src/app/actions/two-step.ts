"use server";

// Settings -> My account -> Two-step sign-in. Anyone can turn it on for their own login; it is required (by us) for the platform
// owner before "View as company" works. Every change needs the person's password, and turning it off or making new backup codes
// also needs a current code, so someone at an unlocked computer can't switch it off.

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { decryptToken, encryptToken } from "@/lib/email-connector-crypto";
import { rateHit, waitMessage } from "@/lib/rate-limit";
import { requireOrg } from "@/lib/tenant";
import { checkTotp, hashBackupCode, newBackupCodes, newTotpSecret } from "@/lib/totp";
import { hasTwoStep, passSecondStep } from "@/lib/two-step";

export type TwoStepState = { error?: string; message?: string; backupCodes?: string[] } | undefined;

async function me(userId: string) {
  const [u] = await db
    .select({ id: users.id, passwordHash: users.passwordHash, totpSecret: users.totpSecret, totpEnabledAt: users.totpEnabledAt, totpBackupCodes: users.totpBackupCodes, totpLastStep: users.totpLastStep })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return u;
}

async function guard(): Promise<{ userId: string } | { error: string }> {
  const org = await requireOrg();
  if (org.viewAs) return { error: "Not available while viewing a company's account." };
  const wait = await rateHit("two-step", org.userId, 15, 3600);
  if (!wait.allowed) return { error: waitMessage(wait.retryAfterSec) };
  return { userId: org.userId };
}

const passwordOk = async (hash: string | null | undefined, pw: string) => !!hash && (await bcrypt.compare(pw, hash));

/** Step 1: make a fresh secret and show it (as a picture and as typed letters) to add to the authenticator app. Not on yet. */
export async function beginTwoStepSetup(_prev: TwoStepState, formData: FormData): Promise<TwoStepState> {
  const g = await guard();
  if ("error" in g) return g;
  const u = await me(g.userId);
  if (!u) return { error: "Couldn't find your account." };
  if (hasTwoStep(u)) return { error: "Two-step sign-in is already on." };
  if (!(await passwordOk(u.passwordHash, String(formData.get("currentPassword") ?? "")))) return { error: "Your password isn't right." };
  await db.update(users).set({ totpSecret: encryptToken(newTotpSecret()), totpEnabledAt: null, totpBackupCodes: null, totpLastStep: null }).where(eq(users.id, g.userId));
  revalidatePath("/dashboard/settings/account");
  return { message: "Scan the picture with your authenticator app, then type the 6-digit code it shows." };
}

export async function cancelTwoStepSetup(): Promise<TwoStepState> {
  const g = await guard();
  if ("error" in g) return g;
  const u = await me(g.userId);
  if (u && !hasTwoStep(u)) await db.update(users).set({ totpSecret: null, totpEnabledAt: null }).where(eq(users.id, g.userId));
  revalidatePath("/dashboard/settings/account");
  return undefined;
}

/** Step 2: the person types a code from the app, proving it works. Then two-step is on and the backup codes are shown once. */
export async function finishTwoStepSetup(_prev: TwoStepState, formData: FormData): Promise<TwoStepState> {
  const g = await guard();
  if ("error" in g) return g;
  const u = await me(g.userId);
  if (!u?.totpSecret) return { error: "Start the setup first." };
  if (hasTwoStep(u)) return { error: "Two-step sign-in is already on." };
  const secret = decryptToken(u.totpSecret);
  if (!secret) return { error: "Something went wrong with the setup. Cancel it and start again." };
  // (The code used here is not remembered as "used", so the person can check their first sign-in right away.)
  const step = checkTotp(secret, String(formData.get("code") ?? ""), Date.now(), null);
  if (step === null) return { error: "That code isn't right. Check that your phone's clock is correct and try the next code." };
  const codes = newBackupCodes(10);
  await db
    .update(users)
    .set({ totpEnabledAt: new Date().toISOString(), totpLastStep: null, totpBackupCodes: JSON.stringify(codes.map(hashBackupCode)) })
    .where(eq(users.id, g.userId));
  // No page refresh here on purpose: the backup codes are shown once, in this form's own result. The "Done" button refreshes.
  return { message: "Two-step sign-in is on.", backupCodes: codes };
}

/** Needs the password and a current code (or a backup code). */
async function proveIt(userId: string, formData: FormData): Promise<{ error: string } | { ok: true }> {
  const u = await me(userId);
  if (!u || !hasTwoStep(u)) return { error: "Two-step sign-in isn't on." };
  if (!(await passwordOk(u.passwordHash, String(formData.get("currentPassword") ?? "")))) return { error: "Your password isn't right." };
  if (!(await passSecondStep(u, String(formData.get("code") ?? "")))) return { error: "That code isn't right, or it was already used. Use the next code your app shows, or a backup code." };
  return { ok: true };
}

export async function turnOffTwoStep(_prev: TwoStepState, formData: FormData): Promise<TwoStepState> {
  const g = await guard();
  if ("error" in g) return g;
  const p = await proveIt(g.userId, formData);
  if ("error" in p) return p;
  await db.update(users).set({ totpSecret: null, totpEnabledAt: null, totpBackupCodes: null, totpLastStep: null }).where(eq(users.id, g.userId));
  revalidatePath("/dashboard/settings/account");
  return { message: "Two-step sign-in is off." };
}

export async function makeNewBackupCodes(_prev: TwoStepState, formData: FormData): Promise<TwoStepState> {
  const g = await guard();
  if ("error" in g) return g;
  const p = await proveIt(g.userId, formData);
  if ("error" in p) return p;
  const codes = newBackupCodes(10);
  await db.update(users).set({ totpBackupCodes: JSON.stringify(codes.map(hashBackupCode)) }).where(eq(users.id, g.userId));
  revalidatePath("/dashboard/settings/account");
  return { message: "New backup codes made. The old ones no longer work.", backupCodes: codes };
}
