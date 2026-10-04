// Stored receipt PDFs for the Quotation Summary (table purchasing_quotation_documents).
//   GENERATED -- the app's own receipt, rebuilt whenever the order changes
//   UPLOADED  -- a PDF attached by hand (e.g. an imported order); wins over GENERATED
// Everything is scoped to one company: callers pass the signed-in user's org.

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { purchasingQuotationDocuments } from "@/db/schema";
import { newId } from "@/lib/ids";
import {
  getPurchasingQuotationWithItems,
  getPurchasingExpirationRanges,
  getBusinessProfile,
  resolveBusinessDocumentIdentity,
  getPurchasingReceiptSettings,
  resolvePurchasingReceiptSettings,
  renderReceiptCopy,
} from "@/lib/queries";
import { buildReceiptPdf } from "@/lib/purchasing-receipt-pdf";

// Vercel rejects request bodies over 4.5 MB, so 4 MB is the honest ceiling for one attached file.
export const MAX_RECEIPT_UPLOAD_BYTES = 4 * 1024 * 1024;

export type ReceiptFileType = { mime: string; ext: string; isImage: boolean };

/**
 * What a file really is, judged by its first bytes (never by its name or the
 * type the browser claims). Receipts can be a PDF or a photo/screenshot:
 * PDF, PNG, JPEG, WebP or GIF. Anything else (including SVG/HTML) is refused.
 */
export function sniffReceiptType(b: Uint8Array): ReceiptFileType | null {
  const at = (i: number, ...v: number[]) => v.every((x, k) => b[i + k] === x);
  if (b.length > 12) {
    if (at(0, 0x25, 0x50, 0x44, 0x46, 0x2d)) return { mime: "application/pdf", ext: "pdf", isImage: false };
    if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { mime: "image/png", ext: "png", isImage: true };
    if (at(0, 0xff, 0xd8, 0xff)) return { mime: "image/jpeg", ext: "jpg", isImage: true };
    if (at(0, 0x47, 0x49, 0x46, 0x38)) return { mime: "image/gif", ext: "gif", isImage: true };
    if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return { mime: "image/webp", ext: "webp", isImage: true };
  }
  return null;
}

export function receiptFilename(quotationNumber: string, ext = "pdf") {
  const safe = quotationNumber.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "receipt";
  return `Quotation-Receipt-${safe}.${ext}`;
}

function expiryOnwardsLabel(quotationDate: string, minMonths: number | null | undefined) {
  if (minMonths == null) return null;
  const d = new Date(quotationDate);
  if (Number.isNaN(d.getTime())) return null;
  d.setMonth(d.getMonth() + minMonths);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

/** Builds the receipt PDF for one quotation from live data. Returns null when the quotation doesn't exist in this company or has no quoted lines. */
export async function buildQuotationReceiptPdf(
  organizationId: string,
  organizationName: string,
  quotationId: string,
): Promise<{ bytes: Uint8Array; filename: string } | null> {
  const data = await getPurchasingQuotationWithItems(organizationId, quotationId);
  if (!data || data.items.length === 0) return null;
  const { quotation, items } = data;
  const [ranges, profile, settingsRow] = await Promise.all([
    getPurchasingExpirationRanges(organizationId, { includeInactive: true }),
    getBusinessProfile(organizationId),
    getPurchasingReceiptSettings(organizationId),
  ]);
  const rangesById = new Map(ranges.map((r) => [r.id, r]));
  const business = resolveBusinessDocumentIdentity(organizationName, profile);
  const copy = renderReceiptCopy(resolvePurchasingReceiptSettings(settingsRow), business.displayName);
  const bytes = await buildReceiptPdf({
    businessName: business.displayName,
    logoDataUrl: business.showLogo ? business.logoDataUrl : null,
    quotationDate: quotation.quotationDate,
    customerName: quotation.customerNameSnapshot,
    items: items.map((it) => {
      const range = it.expirationRangeId ? rangesById.get(it.expirationRangeId) : undefined;
      return {
        productName: it.productNameSnapshot,
        productCode: it.productCodeSnapshot,
        condition: it.conditionNameSnapshot,
        expiryLabel: it.expirationRangeLabelSnapshot,
        expiryOnwards: expiryOnwardsLabel(quotation.quotationDate, range?.minMonths),
        quantity: it.quantity,
        unitPrice: it.finalUnitPrice,
        lineTotal: it.lineTotal,
      };
    }),
    itemsTotal: quotation.itemsTotal,
    bonusAmount: quotation.bonusAmount,
    bonusTierLabel: quotation.bonusTierLabelSnapshot,
    deductionAmount: quotation.deductionEnabled ? quotation.deductionAmount : 0,
    grandTotal: quotation.grandTotal,
    copy: {
      bannerText: copy.bannerText,
      shippingSuffix: copy.shippingSuffix,
      disclaimerIntro: copy.disclaimerIntro,
      disclaimerReturnPolicy: copy.disclaimerReturnPolicy,
      disclaimerDamageSummary: copy.disclaimerDamageSummary,
      conditionHeading: copy.conditionHeading,
      conditionBullets: copy.conditionBullets,
      paymentTimingText: copy.paymentTimingText,
      paymentTimingSubtext: copy.paymentTimingSubtext,
      footerThankYou: copy.footerThankYou,
    },
  });
  return { bytes, filename: receiptFilename(quotation.quotationNumber) };
}

async function saveDocument(args: {
  organizationId: string;
  quotationId: string;
  kind: "GENERATED" | "UPLOADED";
  filename: string;
  bytes: Uint8Array;
  userId: string | null;
}) {
  const contentBase64 = Buffer.from(args.bytes).toString("base64");
  await db
    .insert(purchasingQuotationDocuments)
    .values({
      id: newId("pdoc"),
      organizationId: args.organizationId,
      quotationId: args.quotationId,
      kind: args.kind,
      filename: args.filename,
      sizeBytes: args.bytes.length,
      contentBase64,
      createdByUserId: args.userId,
    })
    .onConflictDoUpdate({
      target: [purchasingQuotationDocuments.quotationId, purchasingQuotationDocuments.kind],
      set: {
        filename: args.filename,
        sizeBytes: args.bytes.length,
        contentBase64,
        createdByUserId: args.userId,
        updatedAt: sql`(current_timestamp)`,
      },
    });
}

/**
 * Rebuilds and stores the app's own receipt PDF. Called whenever an order's
 * lines or totals change. Never throws -- a PDF problem must not block saving
 * an order; the receipt is simply rebuilt the next time someone opens it.
 */
export async function refreshGeneratedReceipt(
  org: { organizationId: string; organizationName: string; userId: string },
  quotationId: string,
): Promise<boolean> {
  try {
    const built = await buildQuotationReceiptPdf(org.organizationId, org.organizationName, quotationId);
    if (!built) {
      await db
        .delete(purchasingQuotationDocuments)
        .where(
          and(
            eq(purchasingQuotationDocuments.organizationId, org.organizationId),
            eq(purchasingQuotationDocuments.quotationId, quotationId),
            eq(purchasingQuotationDocuments.kind, "GENERATED"),
          ),
        );
      return false;
    }
    await saveDocument({ organizationId: org.organizationId, quotationId, kind: "GENERATED", filename: built.filename, bytes: built.bytes, userId: org.userId });
    return true;
  } catch (e) {
    console.error("refreshGeneratedReceipt failed", e);
    return false;
  }
}

export async function saveUploadedReceipt(args: { organizationId: string; quotationId: string; filename: string; bytes: Uint8Array; userId: string }) {
  await saveDocument({ ...args, kind: "UPLOADED" });
}

export async function removeUploadedReceipt(organizationId: string, quotationId: string) {
  await db
    .delete(purchasingQuotationDocuments)
    .where(
      and(
        eq(purchasingQuotationDocuments.organizationId, organizationId),
        eq(purchasingQuotationDocuments.quotationId, quotationId),
        eq(purchasingQuotationDocuments.kind, "UPLOADED"),
      ),
    );
}

/** The PDF to show for a quotation: an uploaded one if there is one, else the generated one (built on the spot, and kept, the first time it's needed). Null = nothing to show. */
export async function getReceiptForViewing(
  org: { organizationId: string; organizationName: string; userId: string },
  quotationId: string,
): Promise<{ bytes: Buffer; filename: string; kind: "UPLOADED" | "GENERATED" } | null> {
  const docs = await db
    .select()
    .from(purchasingQuotationDocuments)
    .where(and(eq(purchasingQuotationDocuments.organizationId, org.organizationId), eq(purchasingQuotationDocuments.quotationId, quotationId)));
  const uploaded = docs.find((d) => d.kind === "UPLOADED");
  const generated = docs.find((d) => d.kind === "GENERATED");
  const pick = uploaded ?? generated;
  if (pick) return { bytes: Buffer.from(pick.contentBase64, "base64"), filename: pick.filename, kind: pick.kind };
  const built = await buildQuotationReceiptPdf(org.organizationId, org.organizationName, quotationId);
  if (!built) return null;
  await saveDocument({ organizationId: org.organizationId, quotationId, kind: "GENERATED", filename: built.filename, bytes: built.bytes, userId: org.userId });
  return { bytes: Buffer.from(built.bytes), filename: built.filename, kind: "GENERATED" };
}

/** Receipt state for one quotation (same meaning as the Quotation Summary column). */
export async function getReceiptState(organizationId: string, quotationId: string, itemCount: number) {
  const docs = await db
    .select({ kind: purchasingQuotationDocuments.kind, filename: purchasingQuotationDocuments.filename, updatedAt: purchasingQuotationDocuments.updatedAt })
    .from(purchasingQuotationDocuments)
    .where(and(eq(purchasingQuotationDocuments.organizationId, organizationId), eq(purchasingQuotationDocuments.quotationId, quotationId)));
  const uploaded = docs.find((d) => d.kind === "UPLOADED");
  const generated = docs.find((d) => d.kind === "GENERATED");
  const receipt: "UPLOADED" | "GENERATED" | "AUTO" | null = uploaded ? "UPLOADED" : generated ? "GENERATED" : itemCount > 0 ? "AUTO" : null;
  return { receipt, stamp: (uploaded ?? generated)?.updatedAt ?? "", isImage: !!uploaded && !/\.pdf$/i.test(uploaded.filename) };
}
