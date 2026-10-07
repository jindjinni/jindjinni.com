"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { purchasingAuditLog, purchasingQuotationProfiles } from "@/db/schema";
import { requireOrg, type CurrentOrg } from "@/lib/tenant";
import { isPurchasingManager } from "@/lib/permissions";
import { newId } from "@/lib/ids";
import { getQuotationProfile } from "@/lib/queries";
import { encodeLogoFile } from "@/lib/logo-validation";

export type QuotationProfileState = { error?: string; message?: string } | undefined;

const MAX_NAME = 80;

async function editor(): Promise<{ org: CurrentOrg } | { error: string }> {
  const org = await requireOrg();
  if (!isPurchasingManager(org.role)) return { error: "Only a Purchasing Manager or Master Admin can change the Quotation Profile." };
  return { org };
}

async function ensureRow(organizationId: string) {
  const existing = await getQuotationProfile(organizationId);
  if (existing) return existing;
  await db.insert(purchasingQuotationProfiles).values({ id: newId("qprofile"), organizationId }).onConflictDoNothing();
  return (await getQuotationProfile(organizationId))!;
}

async function audit(org: CurrentOrg, field: string, before: string | null, after: string | null) {
  if (before === after) return;
  await db.insert(purchasingAuditLog).values({
    id: newId("paudit"),
    organizationId: org.organizationId,
    userId: org.userId,
    recordType: "QuotationProfile",
    recordId: org.organizationId,
    fieldName: field,
    previousValue: before,
    newValue: after,
  });
}

function refresh() {
  revalidatePath("/dashboard/purchasing", "layout");
}

/** The name printed on quotations and whether the logo shows. A blank name means "use the Business Profile's". */
export async function saveQuotationProfile(_prev: QuotationProfileState, formData: FormData): Promise<QuotationProfileState> {
  const e = await editor();
  if ("error" in e) return e;
  const name = String(formData.get("displayName") ?? "").replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim();
  if (name.length > MAX_NAME) return { error: `Keep the name to ${MAX_NAME} characters or fewer.` };
  const showLogo = formData.get("showLogo") === "on";
  const before = await ensureRow(e.org.organizationId);
  await db
    .update(purchasingQuotationProfiles)
    .set({ displayName: name || null, showLogo, updatedAt: new Date().toISOString() })
    .where(eq(purchasingQuotationProfiles.organizationId, e.org.organizationId));
  await audit(e.org, "Quotation company name", before.displayName, name || null);
  await audit(e.org, "Show logo on quotations", before.showLogo ? "yes" : "no", showLogo ? "yes" : "no");
  refresh();
  return { message: "Quotation Profile saved." };
}

export async function uploadQuotationLogo(_prev: QuotationProfileState, formData: FormData): Promise<QuotationProfileState> {
  const e = await editor();
  if ("error" in e) return e;
  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a PNG or JPG image to upload." };
  const encoded = await encodeLogoFile(file);
  if ("error" in encoded) return { error: encoded.error };
  await ensureRow(e.org.organizationId);
  await db
    .update(purchasingQuotationProfiles)
    .set({ logoData: encoded.data, logoContentType: encoded.contentType, logoUpdatedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    .where(eq(purchasingQuotationProfiles.organizationId, e.org.organizationId));
  await audit(e.org, "Quotation logo", null, `uploaded (${file.name})`);
  refresh();
  return { message: "Quotation logo saved." };
}

export async function removeQuotationLogo(): Promise<QuotationProfileState> {
  const e = await editor();
  if ("error" in e) return e;
  await ensureRow(e.org.organizationId);
  await db
    .update(purchasingQuotationProfiles)
    .set({ logoData: null, logoContentType: null, logoUpdatedAt: null, updatedAt: new Date().toISOString() })
    .where(eq(purchasingQuotationProfiles.organizationId, e.org.organizationId));
  await audit(e.org, "Quotation logo", "uploaded", "removed");
  refresh();
  return { message: "Quotation logo removed." };
}
