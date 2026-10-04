"use server";

// Settings -> My account: any signed-in person can change their OWN name and
// password. Nothing here touches anyone else's record.

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
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
  await db.update(users).set({ passwordHash: await bcrypt.hash(next, 10) }).where(eq(users.id, org.userId));
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
