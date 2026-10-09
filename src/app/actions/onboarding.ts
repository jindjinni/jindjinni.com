"use server";

import { after } from "next/server";
import { runRegistryCheck } from "@/lib/state-registry";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import {
  organizations,
  memberships,
  conditions,
  purchasingBonusTiers,
  businessProfiles,
} from "@/db/schema";
import {
  newId,
  defaultConditionRows,
  defaultPurchasingBonusTierRows,
} from "@/lib/ids";
import { setupNewOrgCatalog } from "@/lib/catalog-template";
import { extractBusinessProfileIdentityFields } from "@/lib/business-profile-form";
import { encodeLogoFile } from "@/lib/logo-validation";
import { readRequiredOperationType } from "@/lib/operation-type";
import { columnsForChoice } from "@/lib/operations-rules";
import { readVerification, einInUse, saveVerification, EIN_IN_USE_MESSAGE } from "@/lib/business-verification";

export type ActionState = { error?: string } | undefined;

/**
 * Safety-net path: a signed-in user with no organization yet (for example,
 * accepted an invite flow that isn't wired up in Phase 1). Creates the org
 * and makes them its Owner, same as sign-up does for a brand-new account
 * -- including the same mandatory Business Profile (see signUpOrganization
 * in src/app/actions/auth.ts for why most of it is required here too).
 */
export async function createOrganization(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/login");

  const companyName = String(formData.get("companyName") ?? "").trim();
  if (!companyName) return { error: "Official Legal Business Name is required." };

  const operation = readRequiredOperationType(formData.get("operationType"));
  if (!operation.ok) return { error: operation.error };

  const logoFile = formData.get("logo");
  if (!(logoFile instanceof File) || logoFile.size === 0) {
    return { error: "A company logo is required." };
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

  const orgId = newId("org");
  const slug =
    companyName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || newId("org");

  await db.insert(organizations).values({ id: orgId, name: companyName, slug, approvalStatus: "pending", ...columnsForChoice(operation.type, new Date(), userId!) });
  await db.insert(memberships).values({
    id: newId("mem"),
    userId: userId!,
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

  redirect("/under-review");
}
