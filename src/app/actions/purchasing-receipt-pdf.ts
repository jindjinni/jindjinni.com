"use server";

// Receipt actions on a quotation: attach your own file -- a PDF, photo or
// screenshot (used for imported orders) -- remove it, or rebuild the app's own
// PDF receipt.

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { purchasingQuotations, purchasingAuditLog } from "@/db/schema";
import { requireOrg, type CurrentOrg } from "@/lib/tenant";
import { canWritePurchasing } from "@/lib/permissions";
import { newId } from "@/lib/ids";
import {
  MAX_RECEIPT_UPLOAD_BYTES,
  sniffReceiptType,
  receiptFilename,
  refreshGeneratedReceipt,
  removeUploadedReceipt,
  saveUploadedReceipt,
} from "@/lib/purchasing-receipt-docs";

export type ReceiptPdfActionState = { error?: string; ok?: boolean };

async function requireWriter(): Promise<CurrentOrg> {
  const org = await requireOrg();
  if (!canWritePurchasing(org.role, org.access)) throw new Error("Your role can't make changes in Purchasing.");
  return org;
}

async function ownQuotation(organizationId: string, quotationId: string) {
  const [q] = await db
    .select({ id: purchasingQuotations.id, number: purchasingQuotations.quotationNumber })
    .from(purchasingQuotations)
    .where(and(eq(purchasingQuotations.id, quotationId), eq(purchasingQuotations.organizationId, organizationId)))
    .limit(1);
  return q ?? null;
}

async function audit(org: CurrentOrg, quotationId: string, note: string) {
  await db.insert(purchasingAuditLog).values({
    id: newId("paudit"),
    organizationId: org.organizationId,
    userId: org.userId,
    recordType: "quotation",
    recordId: quotationId,
    fieldName: "receipt_pdf",
    previousValue: null,
    newValue: null,
    note,
  });
}

function refresh(quotationId: string) {
  revalidatePath("/dashboard/purchasing/quotations");
  revalidatePath(`/dashboard/purchasing/quotations/${quotationId}`);
}

export async function uploadReceiptPdf(quotationId: string, formData: FormData): Promise<ReceiptPdfActionState> {
  const org = await requireWriter();
  const q = await ownQuotation(org.organizationId, quotationId);
  if (!q) return { error: "Quotation not found." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a PDF, photo or screenshot to attach." };
  if (file.size > MAX_RECEIPT_UPLOAD_BYTES) return { error: "That file is over 4 MB. Choose a smaller file or a lower-resolution photo." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffReceiptType(bytes);
  if (!type) return { error: "That file isn't a PDF or an image. Attach a PDF, or a JPG, PNG, WebP or GIF photo/screenshot." };

  const cleanName = file.name.replace(/[^A-Za-z0-9._ -]/g, "_").slice(0, 120);
  const nameOk = cleanName.toLowerCase().endsWith(`.${type.ext}`) || (type.ext === "jpg" && /\.jpe?g$/i.test(cleanName));
  await saveUploadedReceipt({
    organizationId: org.organizationId,
    quotationId,
    filename: nameOk ? cleanName : receiptFilename(q.number, type.ext),
    bytes,
    userId: org.userId,
  });
  await audit(org, quotationId, `Receipt file attached (${file.name}, ${Math.round(file.size / 1024)} KB)`);
  refresh(quotationId);
  return { ok: true };
}

export async function removeReceiptPdf(quotationId: string): Promise<ReceiptPdfActionState> {
  const org = await requireWriter();
  if (!(await ownQuotation(org.organizationId, quotationId))) return { error: "Quotation not found." };
  await removeUploadedReceipt(org.organizationId, quotationId);
  await audit(org, quotationId, "Attached receipt file removed");
  refresh(quotationId);
  return { ok: true };
}

/** Rebuild the app's own receipt PDF from the order as it is now (e.g. after changing the receipt wording or business profile). */
export async function regenerateReceiptPdf(quotationId: string): Promise<ReceiptPdfActionState> {
  const org = await requireWriter();
  if (!(await ownQuotation(org.organizationId, quotationId))) return { error: "Quotation not found." };
  const ok = await refreshGeneratedReceipt(org, quotationId);
  if (!ok) return { error: "This order has no quoted lines yet, so there's no receipt to build." };
  refresh(quotationId);
  return { ok: true };
}
