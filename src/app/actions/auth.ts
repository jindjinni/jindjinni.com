"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/db/client";
import { organizations, users, memberships, conditions, purchasingCategories, purchasingConditions, purchasingExpirationRanges, purchasingBonusTiers } from "@/db/schema";
import { signIn, signOut } from "@/lib/auth";
import {
  newId,
  defaultConditionRows,
  defaultPurchasingCategoryRows,
  defaultPurchasingConditionRows,
  defaultPurchasingExpirationRangeRows,
  defaultPurchasingBonusTierRows,
} from "@/lib/ids";

export type ActionState = { error?: string } | undefined;

/** Existing user signing in. */
export async function login(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  const password = String(formData.get("password") ?? "");

  try {
    await signIn("credentials", { email, password, redirect: false });
  } catch {
    return { error: "That email and password don't match an account." };
  }

  redirect("/dashboard");
}

export async function logout() {
  await signOut({ redirect: false });
  redirect("/login");
}

/**
 * Brand-new company signing up: creates the User, a fresh Organization for
 * them (Owner role), and a starter set of Conditions they can rename or
 * add to later from Settings. This is the multi-tenant on-ramp -- every
 * other table in the app hangs off the organizationId created here.
 */
export async function signUpOrganization(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const companyName = String(formData.get("companyName") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  const password = String(formData.get("password") ?? "");

  if (!companyName || !email || !password || password.length < 8) {
    return {
      error:
        "Fill in your company name, email, and a password of at least 8 characters.",
    };
  }

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing) {
    return { error: "An account with that email already exists. Try logging in instead." };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const userId = newId("user");
  const orgId = newId("org");
  const slug =
    companyName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || newId("org");

  await db.insert(users).values({ id: userId, email, name, passwordHash });
  await db.insert(organizations).values({ id: orgId, name: companyName, slug });
  await db.insert(memberships).values({
    id: newId("mem"),
    userId,
    organizationId: orgId,
    role: "owner",
  });
  await db.insert(conditions).values(defaultConditionRows(orgId));
  await db.insert(purchasingCategories).values(defaultPurchasingCategoryRows(orgId));
  await db.insert(purchasingConditions).values(defaultPurchasingConditionRows(orgId));
  await db.insert(purchasingExpirationRanges).values(defaultPurchasingExpirationRangeRows(orgId));
  await db.insert(purchasingBonusTiers).values(defaultPurchasingBonusTierRows(orgId));

  try {
    await signIn("credentials", { email, password, redirect: false });
  } catch {
    return { error: "Account created, but signing you in failed -- try logging in." };
  }

  redirect("/dashboard");
}
