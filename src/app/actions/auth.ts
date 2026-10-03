"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/db/client";
import {
  organizations,
  users,
  memberships,
  conditions,
  purchasingCategories,
  purchasingConditions,
  purchasingExpirationRanges,
  purchasingBonusTiers,
  businessProfiles,
} from "@/db/schema";
import { signIn, signOut } from "@/lib/auth";
import {
  newId,
  defaultConditionRows,
  defaultPurchasingCategoryRows,
  defaultPurchasingConditionRows,
  defaultPurchasingExpirationRangeRows,
  defaultPurchasingBonusTierRows,
} from "@/lib/ids";
import { extractBusinessProfileIdentityFields } from "@/lib/business-profile-form";
import { encodeLogoFile } from "@/lib/logo-validation";

export type ActionState = { error?: string } | undefined;

/** Existing user signing in. */
export async function login(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  const password = String(formData.get("password") ?? "");
  // Checked by default on the login form -- stays signed in for 90 days
  // instead of just 1, so signing in once doesn't mean doing it again on
  // every visit. See src/lib/auth.ts for how this shortens the session.
  const rememberMe = formData.get("rememberMe") === "on" ? "true" : "false";

  try {
    await signIn("credentials", { email, password, rememberMe, redirect: false });
  } catch {
    return { error: "That email and password don't match an account." };
  }

  redirect("/dashboard/purchasing");
}

export async function logout() {
  await signOut({ redirect: false });
  redirect("/login");
}

/**
 * Brand-new company signing up: creates the User, a fresh Organization for
 * them (Owner role), a starter set of Conditions they can rename or add to
 * later from Settings, AND their Business Profile -- per how this was
 * asked for, most of the profile (logo, both addresses, contact details,
 * Primary Contact) is required right at signup rather than filled in
 * later, with only a few fields (DBA, website, Tax ID/EIN, business
 * registration number) left optional. This is the multi-tenant on-ramp --
 * every other table in the app hangs off the organizationId created here.
 */
export async function signUpOrganization(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const companyName = String(formData.get("companyName") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  const password = String(formData.get("password") ?? "");

  if (!companyName) return { error: "Official Legal Business Name is required." };
  if (!email || !password || password.length < 8) {
    return { error: "Fill in your email and a password of at least 8 characters." };
  }

  const logoFile = formData.get("logo");
  if (!(logoFile instanceof File) || logoFile.size === 0) {
    return { error: "A company logo is required to sign up." };
  }
  const encodedLogo = await encodeLogoFile(logoFile);
  if ("error" in encodedLogo) {
    return { error: encodedLogo.error };
  }

  const profile = extractBusinessProfileIdentityFields(formData);
  if (!profile.businessAddressStreet1 || !profile.businessAddressCity || !profile.businessAddressState || !profile.businessAddressZip) {
    return { error: "Business Address (street, city, state, and ZIP) is required." };
  }
  if (
    !profile.shippingSameAsBusiness &&
    (!profile.shippingAddressStreet1 || !profile.shippingAddressCity || !profile.shippingAddressState || !profile.shippingAddressZip)
  ) {
    return { error: "Shipping / Operating Address is required, or check \"Same as Business Address\"." };
  }
  if (!profile.businessPhone) return { error: "Main Business Phone Number is required." };
  if (!profile.businessEmail) return { error: "Main Business Email is required." };
  if (!profile.primaryContactFirstName || !profile.primaryContactLastName) {
    return { error: "Primary Contact first and last name are required." };
  }
  if (!profile.primaryContactEmail) return { error: "Primary Contact email is required." };
  if (!profile.primaryContactPhone) return { error: "Primary Contact phone number is required." };

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
  await db.insert(businessProfiles).values({
    id: newId("bizprofile"),
    organizationId: orgId,
    ...profile,
    logoData: encodedLogo.data,
    logoContentType: encodedLogo.contentType,
    logoUpdatedAt: new Date().toISOString(),
  });

  try {
    await signIn("credentials", { email, password, redirect: false });
  } catch {
    return { error: "Account created, but signing you in failed -- try logging in." };
  }

  redirect("/dashboard/purchasing");
}
