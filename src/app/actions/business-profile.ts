"use server";

// Settings -> Business Profile. "Who the company is" -- reused everywhere
// a document needs company identity (quotation receipts today; future
// Purchase Documents, reports, customer communications later). Editing is
// gated the same way Purchasing settings are (role !== "staff") until the
// real Users & Access / permissions system (section 13+ of the spec) is
// built -- at that point this should move to a dedicated
// settings.business_profile.edit permission instead of a role check.

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { requireOrg, type CurrentOrg } from "@/lib/tenant";
import { db } from "@/db/client";
import { organizations, businessProfiles, purchasingAuditLog } from "@/db/schema";
import { newId } from "@/lib/ids";
import { getBusinessProfile } from "@/lib/queries";

export type ActionState = { error?: string; message?: string } | undefined;

const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2MB -- plenty for a logo, small enough to embed in every page/receipt that shows it
const ALLOWED_LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/jpg"]);

function requireProfileEditor(org: CurrentOrg): ActionState {
  if (org.role === "staff") {
    return { error: "Only an Administrator or Master Admin can edit the Business Profile." };
  }
  return undefined;
}

async function logAudit(
  org: CurrentOrg,
  fieldName: string,
  previousValue: string | null,
  newValue: string | null,
) {
  if (previousValue === newValue) return;
  await db.insert(purchasingAuditLog).values({
    id: newId("paudit"),
    organizationId: org.organizationId,
    userId: org.userId,
    recordType: "BusinessProfile",
    recordId: org.organizationId,
    fieldName,
    previousValue,
    newValue,
  });
}

const trimmed = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim() || null;
const checked = (formData: FormData, key: string) => formData.get(key) === "on";

/** Every Business Profile row always exists by the time this is called the first time. */
async function ensureBusinessProfile(organizationId: string) {
  const existing = await getBusinessProfile(organizationId);
  if (existing) return existing;
  const id = newId("bizprofile");
  await db.insert(businessProfiles).values({ id, organizationId });
  return (await getBusinessProfile(organizationId))!;
}

export async function updateBusinessProfile(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const org = await requireOrg();
  const blocked = requireProfileEditor(org);
  if (blocked) return blocked;

  const legalName = trimmed(formData, "legalName");
  if (!legalName) return { error: "Legal Business Name is required." };

  const existing = await ensureBusinessProfile(org.organizationId);

  const nameDisplayPreference = (formData.get("nameDisplayPreference") as string) || "legal";
  if (!["legal", "dba", "both"].includes(nameDisplayPreference)) {
    return { error: "Invalid name display preference." };
  }

  const shippingSameAsBusiness = checked(formData, "shippingSameAsBusiness");

  const patch = {
    dbaName: trimmed(formData, "dbaName"),
    nameDisplayPreference: nameDisplayPreference as "legal" | "dba" | "both",

    businessAddressStreet1: trimmed(formData, "businessAddressStreet1"),
    businessAddressStreet2: trimmed(formData, "businessAddressStreet2"),
    businessAddressCity: trimmed(formData, "businessAddressCity"),
    businessAddressState: trimmed(formData, "businessAddressState"),
    businessAddressZip: trimmed(formData, "businessAddressZip"),
    businessAddressCountry: trimmed(formData, "businessAddressCountry") ?? "US",

    shippingSameAsBusiness,
    shippingAddressStreet1: shippingSameAsBusiness ? null : trimmed(formData, "shippingAddressStreet1"),
    shippingAddressStreet2: shippingSameAsBusiness ? null : trimmed(formData, "shippingAddressStreet2"),
    shippingAddressCity: shippingSameAsBusiness ? null : trimmed(formData, "shippingAddressCity"),
    shippingAddressState: shippingSameAsBusiness ? null : trimmed(formData, "shippingAddressState"),
    shippingAddressZip: shippingSameAsBusiness ? null : trimmed(formData, "shippingAddressZip"),
    shippingAddressCountry: shippingSameAsBusiness ? "US" : trimmed(formData, "shippingAddressCountry") ?? "US",

    businessPhone: trimmed(formData, "businessPhone"),
    businessEmail: trimmed(formData, "businessEmail"),
    website: trimmed(formData, "website"),

    primaryContactFirstName: trimmed(formData, "primaryContactFirstName"),
    primaryContactLastName: trimmed(formData, "primaryContactLastName"),
    primaryContactTitle: trimmed(formData, "primaryContactTitle"),
    primaryContactEmail: trimmed(formData, "primaryContactEmail"),
    primaryContactPhone: trimmed(formData, "primaryContactPhone"),

    taxId: trimmed(formData, "taxId"),
    businessRegistrationNumber: trimmed(formData, "businessRegistrationNumber"),

    docShowLogo: checked(formData, "docShowLogo"),
    docShowLegalName: checked(formData, "docShowLegalName"),
    docShowDba: checked(formData, "docShowDba"),
    docShowAddress: checked(formData, "docShowAddress"),
    docShowPhone: checked(formData, "docShowPhone"),
    docShowEmail: checked(formData, "docShowEmail"),
    docShowWebsite: checked(formData, "docShowWebsite"),

    updatedAt: new Date().toISOString(),
  };

  await db.update(organizations).set({ name: legalName }).where(eq(organizations.id, org.organizationId));
  await db.update(businessProfiles).set(patch).where(eq(businessProfiles.organizationId, org.organizationId));

  // Only the fields that actually matter for "what changed" get logged --
  // field-by-field so an edit to one address line doesn't bury the others.
  await logAudit(org, "Legal Business Name", org.organizationName, legalName);
  await logAudit(org, "DBA / Trade Name", existing.dbaName, patch.dbaName);
  await logAudit(org, "Name display preference", existing.nameDisplayPreference, patch.nameDisplayPreference);
  await logAudit(org, "Business address", formatAddress(existing, "business"), formatAddress(patch, "business"));
  await logAudit(
    org,
    "Shipping address",
    shippingSameAsBusiness ? "Same as business" : formatAddress(existing, "shipping"),
    shippingSameAsBusiness ? "Same as business" : formatAddress(patch, "shipping"),
  );
  await logAudit(org, "Business phone", existing.businessPhone, patch.businessPhone);
  await logAudit(org, "Business email", existing.businessEmail, patch.businessEmail);
  await logAudit(org, "Website", existing.website, patch.website);
  await logAudit(
    org,
    "Primary contact",
    [existing.primaryContactFirstName, existing.primaryContactLastName].filter(Boolean).join(" ") || null,
    [patch.primaryContactFirstName, patch.primaryContactLastName].filter(Boolean).join(" ") || null,
  );
  await logAudit(org, "Tax ID / EIN", existing.taxId, patch.taxId);
  await logAudit(org, "Business registration number", existing.businessRegistrationNumber, patch.businessRegistrationNumber);

  revalidatePath("/dashboard/profile");
  revalidatePath("/dashboard/database");
  return { message: "Business Profile saved." };
}

function formatAddress(
  row: {
    businessAddressStreet1?: string | null;
    businessAddressStreet2?: string | null;
    businessAddressCity?: string | null;
    businessAddressState?: string | null;
    businessAddressZip?: string | null;
    shippingAddressStreet1?: string | null;
    shippingAddressStreet2?: string | null;
    shippingAddressCity?: string | null;
    shippingAddressState?: string | null;
    shippingAddressZip?: string | null;
  },
  which: "business" | "shipping",
) {
  const street1 = which === "business" ? row.businessAddressStreet1 : row.shippingAddressStreet1;
  const street2 = which === "business" ? row.businessAddressStreet2 : row.shippingAddressStreet2;
  const city = which === "business" ? row.businessAddressCity : row.shippingAddressCity;
  const state = which === "business" ? row.businessAddressState : row.shippingAddressState;
  const zip = which === "business" ? row.businessAddressZip : row.shippingAddressZip;
  const parts = [street1, street2, [city, state, zip].filter(Boolean).join(", ")].filter(Boolean);
  return parts.length ? parts.join(" / ") : null;
}

export async function uploadBusinessLogo(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const org = await requireOrg();
  const blocked = requireProfileEditor(org);
  if (blocked) return blocked;

  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a PNG or JPG image to upload." };
  }
  if (!ALLOWED_LOGO_TYPES.has(file.type)) {
    return { error: "Logo must be a PNG or JPG image." };
  }
  if (file.size > MAX_LOGO_BYTES) {
    return { error: "Logo must be 2MB or smaller." };
  }

  await ensureBusinessProfile(org.organizationId);
  const buffer = Buffer.from(await file.arrayBuffer());
  const logoData = buffer.toString("base64");

  await db
    .update(businessProfiles)
    .set({
      logoData,
      logoContentType: file.type,
      logoUpdatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(businessProfiles.organizationId, org.organizationId));

  await logAudit(org, "Logo", null, `uploaded (${file.name})`);

  revalidatePath("/dashboard/profile");
  revalidatePath("/dashboard/database");
  return { message: "Logo uploaded." };
}

export async function removeBusinessLogo(
  _prevState: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const org = await requireOrg();
  const blocked = requireProfileEditor(org);
  if (blocked) return blocked;

  await db
    .update(businessProfiles)
    .set({ logoData: null, logoContentType: null, logoUpdatedAt: null, updatedAt: new Date().toISOString() })
    .where(eq(businessProfiles.organizationId, org.organizationId));

  await logAudit(org, "Logo", "present", "removed");

  revalidatePath("/dashboard/profile");
  revalidatePath("/dashboard/database");
  return { message: "Logo removed." };
}
