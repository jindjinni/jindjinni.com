"use server";

import { after } from "next/server";
import { parseBillingPlan } from "@/lib/billing-config";
import { runRegistryCheck } from "@/lib/state-registry";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/db/client";
import {
  organizations,
  users,
  memberships,
  conditions,
  purchasingBonusTiers,
  businessProfiles,
} from "@/db/schema";
import { signIn, signOut } from "@/lib/auth";
import {
  newId,
  defaultConditionRows,
  defaultPurchasingBonusTierRows,
} from "@/lib/ids";
import { setupNewOrgCatalog } from "@/lib/catalog-template";
import { extractBusinessProfileIdentityFields } from "@/lib/business-profile-form";
import { encodeLogoFile } from "@/lib/logo-validation";
import { consumeSignupVerificationCode } from "@/lib/signup-verification";
import { signupNeedsEmailVerification } from "@/lib/signup-settings";
import { TERMS_VERSION } from "@/lib/legal";
import { readVerification, einInUse, saveVerification, EIN_IN_USE_MESSAGE } from "@/lib/business-verification";
import { lockMinutesLeft, lockedMessage } from "@/lib/login-throttle";
import { guardLogin, guardPublicForm, noteFailedLogin } from "@/lib/human-check";
import { looksLikeUsername } from "@/lib/staff-login";
import { hasTwoStep } from "@/lib/two-step";
import { ensureCompanyCode } from "@/lib/company-code";
import { readRequiredOperationType } from "@/lib/operation-type";
import { columnsForChoice } from "@/lib/operations-rules";

export type ActionState = { error?: string; needCode?: boolean } | undefined;

/** Existing user signing in. */
export async function login(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  // Bots first: the trap field, the human check and a limit on wrong passwords from one network address.
  const guard = await guardLogin(formData);
  if (guard.error) return { error: guard.error };
  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  const password = String(formData.get("password") ?? "");
  // Checked by default on the login form -- stays signed in for 90 days
  // instead of just 1, so signing in once doesn't mean doing it again on
  // every visit. See src/lib/auth.ts for how this shortens the session.
  const rememberMe = formData.get("rememberMe") === "on" ? "true" : "false";

  // Tell the person when sign-in is paused (too many wrong passwords) instead of a confusing "doesn't match".
  const [found] = email
    ? await db
        .select({ lockedUntil: users.lockedUntil, passwordHash: users.passwordHash, totpSecret: users.totpSecret, totpEnabledAt: users.totpEnabledAt })
        .from(users)
        .where(looksLikeUsername(email) ? eq(users.username, email) : eq(users.email, email))
        .limit(1)
    : [];
  const minutes = lockMinutesLeft(found?.lockedUntil, Date.now());
  if (minutes > 0) return { error: lockedMessage(minutes) };

  // Two-step sign-in: when the password is right but there is no code yet, ask for the code (the real check is inside sign-in itself).
  const code = String(formData.get("code") ?? "").trim();
  if (!code && found && hasTwoStep(found) && found.passwordHash && (await bcrypt.compare(password, found.passwordHash))) {
    return { needCode: true };
  }

  try {
    await signIn("credentials", { email, password, rememberMe, code, redirect: false });
  } catch {
    await noteFailedLogin(guard.ip);
    if (code && found && hasTwoStep(found)) return { needCode: true, error: "That code isn't right, or it was already used. Try the next one your app shows, or use a backup code." };
    return { error: "That email or username and password don't match an account." };
  }

  // Optional "come back to" page (e.g. an invitation link). Only same-site
  // paths are honoured, never an outside address.
  const next = String(formData.get("next") ?? "");
  if (next.startsWith("/") && !next.startsWith("//") && !next.includes("\\")) redirect(next);
  redirect("/dashboard");
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
 * registration number) left optional. Also requires a verification code
 * that was just emailed to this address (see actions/email-verification.ts
 * and lib/signup-verification.ts) -- proves the account is a real, reachable
 * email before anything gets created, not just a plausible-looking string.
 * This is the multi-tenant on-ramp -- every other table in the app hangs
 * off the organizationId created here.
 */
export async function signUpOrganization(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  // Bots first: the trap field, the human check and a limit on sign-up tries from one network address.
  const blocked = await guardPublicForm(formData, { scope: "signup", max: 15, windowSec: 3600 });
  if (blocked) return { error: blocked };
  const companyName = String(formData.get("companyName") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  const password = String(formData.get("password") ?? "");

  if (!companyName) return { error: "Official Legal Business Name is required." };
  if (formData.get("acceptTerms") !== "on") {
    return { error: "Please agree to the Terms of Service, Privacy Policy and Acceptable Use Policy to create an account." };
  }
  if (!email || !password || password.length < 8) {
    return { error: "Fill in your email and a password of at least 8 characters." };
  }

  const operation = readRequiredOperationType(formData.get("operationType"));
  if (!operation.ok) return { error: operation.error };

  const logoFile = formData.get("logo");
  if (!(logoFile instanceof File) || logoFile.size === 0) {
    return { error: "A company logo is required to sign up." };
  }
  const encodedLogo = await encodeLogoFile(logoFile);
  if ("error" in encodedLogo) {
    return { error: encodedLogo.error };
  }

  const verification = await readVerification(formData);
  if ("error" in verification) return { error: verification.error };
  if (await einInUse(verification.data.ein)) return { error: EIN_IN_USE_MESSAGE };

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

  // (Checked last, after every other field, so a typo elsewhere on the form never uses up the emailed code.)
  // Proves the account email is real and reachable -- this is the actual security boundary, independent of whatever the signup
  // page's UI showed. It is ON HOLD while our sending email is not active (see lib/signup-settings.ts); the server decides, so a
  // form that skips the code field is only accepted while the hold is on.
  const needsVerification = signupNeedsEmailVerification();
  if (needsVerification) {
    const verificationCode = String(formData.get("verificationCode") ?? "").trim();
    if (!verificationCode) {
      return { error: "Enter the verification code we emailed you." };
    }
    const codeCheck = await consumeSignupVerificationCode(email, verificationCode);
    if (!codeCheck.ok) return { error: codeCheck.error };
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

  await db.insert(users).values({
    id: userId,
    email,
    name,
    passwordHash,
    // Only stamped when the address was really proven by a code; while the check is on hold it stays empty (not verified yet).
    emailVerified: needsVerification ? new Date().toISOString() : null,
    termsAcceptedAt: new Date().toISOString(),
    termsVersion: TERMS_VERSION,
  });
  await db.insert(organizations).values({ id: orgId, name: companyName, slug, approvalStatus: "pending", billingPlan: parseBillingPlan(formData.get("billingPlan")), ...columnsForChoice(operation.type, new Date(), userId) });
  // Every company gets its permanent reference ("JJ-1042") right away, so support always knows who is calling.
  await ensureCompanyCode(orgId).catch(() => {});
  await db.insert(memberships).values({
    id: newId("mem"),
    userId,
    organizationId: orgId,
    role: "owner",
  });
  await db.insert(conditions).values(defaultConditionRows(orgId));
  // A copy of the platform's default catalog (brands, products at $0, conditions, month ranges, starter recalls,
  // receipt wording) -- or the built-in starter lists when none is published. See lib/catalog-template.ts.
  await setupNewOrgCatalog(orgId);
  await db.insert(purchasingBonusTiers).values(defaultPurchasingBonusTierRows(orgId));
  await db.insert(businessProfiles).values({
    id: newId("bizprofile"),
    organizationId: orgId,
    ...profile,
    taxId: verification.data.ein,
    businessRegistrationNumber: verification.data.stateFileNumber,
    logoData: encodedLogo.data,
    logoContentType: encodedLogo.contentType,
    logoUpdatedAt: new Date().toISOString(),
  });
  await saveVerification(orgId, verification.data);
  // Compare the file number with the state's public records once the response is sent; the owner sees the result in Settings -> Companies.
  after(() => runRegistryCheck(orgId));

  try {
    await signIn("credentials", { email, password, redirect: false });
  } catch {
    return { error: "Account created, but signing you in failed -- try logging in." };
  }

  // A new company waits for the platform owner to approve it; /dashboard would only send them to the same place.
  redirect("/under-review");
}
