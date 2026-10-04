// Adjustment quotations: reading, drafting, saving, finalizing (PDF + attach to the shipment) and discarding.
// Nothing here checks the signed-in user's role -- the actions and pages do that and pass the company in.
// Everything is scoped by organizationId.

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  purchasingQuotations,
  purchasingQuotedItems,
  purchasingCustomers,
  receivingAdjustmentLines,
  receivingAdjustments,
  receivingItems,
  receivingPackagePhotos,
  receivingPackages,
  RECEIVING_ADJUSTMENT_REASONS,
} from "@/db/schema";
import { newId } from "@/lib/ids";
import { getBusinessProfile, resolveBusinessDocumentIdentity } from "@/lib/queries";
import { storage } from "@/lib/receiving-storage";
import { buildAdjustmentPdf } from "@/lib/receiving-adjustment-pdf";
import {
  adjustmentDifference,
  adjustmentTotals,
  describeChanges,
  lineTotalOf,
  prefillAdjustmentLines,
  roundMoney,
  validateAdjustmentLines,
  type AdjLine,
} from "@/lib/receiving-adjustment";
import { auditReceiving, refreshIntakeLogPrice, type OrgRef } from "@/lib/receiving-service";

export type AdjustmentLineView = Required<Pick<AdjLine, "productName">> & {
  id: string;
  quotedItemId: string | null;
  productId: string | null;
  productCode: string;
  condition: string;
  expiryLabel: string;
  originalQuantity: number | null;
  originalUnitPrice: number | null;
  originalLineTotal: number | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  note: string;
};

export type AdjustmentView = {
  id: string;
  packageId: string;
  number: string;
  status: "DRAFT" | "FINAL";
  reasonCategory: string;
  reasonNotes: string;
  originalTotal: number;
  bonusAmount: number;
  deductionAmount: number;
  itemsTotal: number;
  adjustedTotal: number;
  finalizedAt: string | null;
  documentPhotoId: string | null;
  lines: AdjustmentLineView[];
  // the shipment it belongs to
  customerName: string;
  quotationNumber: string;
  trackingNumber: string | null;
  packageStatus: string;
};

async function load(organizationId: string, where: { id?: string; packageId?: string }): Promise<AdjustmentView | null> {
  const cond = where.id ? eq(receivingAdjustments.id, where.id) : eq(receivingAdjustments.packageId, where.packageId ?? "");
  const [row] = await db
    .select({
      adj: receivingAdjustments,
      quotationNumber: purchasingQuotations.quotationNumber,
      nameSnap: purchasingQuotations.customerNameSnapshot,
      first: purchasingCustomers.firstName,
      last: purchasingCustomers.lastName,
      quotTracking: purchasingQuotations.trackingNumber,
      pkgTracking: receivingPackages.trackingNumber,
      packageStatus: receivingPackages.status,
    })
    .from(receivingAdjustments)
    .innerJoin(receivingPackages, eq(receivingPackages.id, receivingAdjustments.packageId))
    .innerJoin(purchasingQuotations, eq(purchasingQuotations.id, receivingPackages.quotationId))
    .leftJoin(purchasingCustomers, eq(purchasingCustomers.id, purchasingQuotations.customerId))
    .where(and(cond, eq(receivingAdjustments.organizationId, organizationId)))
    .limit(1);
  if (!row) return null;
  const lines = await db
    .select()
    .from(receivingAdjustmentLines)
    .where(and(eq(receivingAdjustmentLines.adjustmentId, row.adj.id), eq(receivingAdjustmentLines.organizationId, organizationId)))
    .orderBy(receivingAdjustmentLines.sortOrder, receivingAdjustmentLines.createdAt);
  const a = row.adj;
  return {
    id: a.id,
    packageId: a.packageId,
    number: a.number,
    status: a.status,
    reasonCategory: a.reasonCategory ?? "",
    reasonNotes: a.reasonNotes ?? "",
    originalTotal: a.originalTotal,
    bonusAmount: a.bonusAmount,
    deductionAmount: a.deductionAmount,
    itemsTotal: a.itemsTotal,
    adjustedTotal: a.adjustedTotal,
    finalizedAt: a.finalizedAt,
    documentPhotoId: a.documentPhotoId,
    lines: lines.map((l) => ({
      id: l.id,
      quotedItemId: l.quotedItemId,
      productId: l.productId,
      productName: l.productName,
      productCode: l.productCode ?? "",
      condition: l.condition ?? "",
      expiryLabel: l.expiryLabel ?? "",
      originalQuantity: l.originalQuantity,
      originalUnitPrice: l.originalUnitPrice,
      originalLineTotal: l.originalLineTotal,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      lineTotal: l.lineTotal,
      note: l.note ?? "",
    })),
    customerName: (row.nameSnap || [row.first, row.last].filter(Boolean).join(" ") || "Customer").trim(),
    quotationNumber: row.quotationNumber,
    trackingNumber: row.pkgTracking ?? row.quotTracking,
    packageStatus: row.packageStatus,
  };
}

export const getAdjustmentById = (organizationId: string, id: string) => load(organizationId, { id });
export const getAdjustmentForPackage = (organizationId: string, packageId: string) => load(organizationId, { packageId });

export type AdjustmentListRow = {
  id: string;
  packageId: string;
  number: string;
  status: "DRAFT" | "FINAL";
  customerName: string;
  quotationNumber: string;
  reason: string;
  originalTotal: number;
  adjustedTotal: number;
  updatedAt: string;
};

/** All adjustment quotations for the company, newest first. */
export async function listAdjustments(organizationId: string): Promise<AdjustmentListRow[]> {
  const rows = await db
    .select({
      a: receivingAdjustments,
      quotationNumber: purchasingQuotations.quotationNumber,
      nameSnap: purchasingQuotations.customerNameSnapshot,
    })
    .from(receivingAdjustments)
    .innerJoin(receivingPackages, eq(receivingPackages.id, receivingAdjustments.packageId))
    .innerJoin(purchasingQuotations, eq(purchasingQuotations.id, receivingPackages.quotationId))
    .where(eq(receivingAdjustments.organizationId, organizationId))
    .orderBy(desc(receivingAdjustments.updatedAt));
  return rows.map((r) => ({
    id: r.a.id,
    packageId: r.a.packageId,
    number: r.a.number,
    status: r.a.status,
    customerName: r.nameSnap,
    quotationNumber: r.quotationNumber,
    reason: r.a.reasonCategory ?? "",
    originalTotal: r.a.originalTotal,
    adjustedTotal: r.a.adjustedTotal,
    updatedAt: r.a.updatedAt,
  }));
}

export type NeedsAdjustmentRow = { packageId: string; customerName: string; quotationNumber: string; trackingNumber: string | null; details: string };

/** Shipments marked "Adjustment Needed" that don't have an adjustment quotation yet. */
export async function listNeedingAdjustment(organizationId: string): Promise<NeedsAdjustmentRow[]> {
  const have = await db.select({ p: receivingAdjustments.packageId }).from(receivingAdjustments).where(eq(receivingAdjustments.organizationId, organizationId));
  const haveIds = have.map((h) => h.p);
  const rows = await db
    .select({
      packageId: receivingPackages.id,
      nameSnap: purchasingQuotations.customerNameSnapshot,
      quotationNumber: purchasingQuotations.quotationNumber,
      pkgTracking: receivingPackages.trackingNumber,
      quotTracking: purchasingQuotations.trackingNumber,
      details: receivingPackages.adjustmentDetails,
    })
    .from(receivingPackages)
    .innerJoin(purchasingQuotations, eq(purchasingQuotations.id, receivingPackages.quotationId))
    .where(and(eq(receivingPackages.organizationId, organizationId), eq(receivingPackages.adjustmentNeeded, "YES"), haveIds.length ? sql`${receivingPackages.id} not in (${sql.join(haveIds.map((i) => sql`${i}`), sql`, `)})` : sql`1=1`))
    .orderBy(desc(receivingPackages.updatedAt));
  return rows.map((r) => ({ packageId: r.packageId, customerName: r.nameSnap, quotationNumber: r.quotationNumber, trackingNumber: r.pkgTracking ?? r.quotTracking, details: r.details ?? "" }));
}

// ---- drafting -------------------------------------------------------------------

/** Starts (or returns) the shipment's adjustment, pre-filled from the original quotation and what was received. */
export async function createDraftFromPackage(org: OrgRef, packageId: string): Promise<{ id: string; created: boolean } | { error: string }> {
  const [pkg] = await db
    .select()
    .from(receivingPackages)
    .where(and(eq(receivingPackages.id, packageId), eq(receivingPackages.organizationId, org.organizationId)))
    .limit(1);
  if (!pkg) return { error: "That shipment wasn't found." };
  const [existing] = await db.select({ id: receivingAdjustments.id }).from(receivingAdjustments).where(eq(receivingAdjustments.packageId, packageId)).limit(1);
  if (existing) return { id: existing.id, created: false };

  const [q] = await db
    .select({
      number: purchasingQuotations.quotationNumber,
      grandTotal: purchasingQuotations.grandTotal,
      bonus: purchasingQuotations.bonusAmount,
      deduction: purchasingQuotations.deductionAmount,
      deductionOn: purchasingQuotations.deductionEnabled,
    })
    .from(purchasingQuotations)
    .where(and(eq(purchasingQuotations.id, pkg.quotationId), eq(purchasingQuotations.organizationId, org.organizationId)))
    .limit(1);
  if (!q) return { error: "The order for this shipment wasn't found." };

  const quoted = await db
    .select({
      id: purchasingQuotedItems.id,
      productId: purchasingQuotedItems.productId,
      name: purchasingQuotedItems.productNameSnapshot,
      code: purchasingQuotedItems.productCodeSnapshot,
      condition: purchasingQuotedItems.conditionNameSnapshot,
      expiration: purchasingQuotedItems.expirationRangeLabelSnapshot,
      quantity: purchasingQuotedItems.quantity,
      unitPrice: purchasingQuotedItems.finalUnitPrice,
      lineTotal: purchasingQuotedItems.lineTotal,
    })
    .from(purchasingQuotedItems)
    .where(eq(purchasingQuotedItems.quotationId, pkg.quotationId))
    .orderBy(purchasingQuotedItems.createdAt);
  const received = await db.select().from(receivingItems).where(and(eq(receivingItems.packageId, packageId), eq(receivingItems.organizationId, org.organizationId)));
  const lines = prefillAdjustmentLines(quoted, received.map((r) => ({
    quotedItemId: r.quotedItemId,
    productId: r.productId,
    productName: r.productName,
    itemSource: r.itemSource,
    wasReceived: r.wasReceived ?? "",
    quantityReceived: r.quantityReceived,
    condition: r.condition ?? "",
  })));

  const bonus = q.bonus ?? 0;
  const deduction = q.deductionOn ? (q.deduction ?? 0) : 0;
  const totals = adjustmentTotals(lines, bonus, deduction);
  const reason = received.map((r) => r.adjustmentReason).find(Boolean) ?? null;
  const id = newId("radj");
  try {
    await db.insert(receivingAdjustments).values({
      id,
      organizationId: org.organizationId,
      packageId,
      number: `ADJ-${q.number}`.slice(0, 60),
      status: "DRAFT",
      reasonCategory: reason,
      reasonNotes: pkg.adjustmentDetails || describeChanges(lines) || null,
      originalTotal: q.grandTotal,
      bonusAmount: bonus,
      deductionAmount: deduction,
      itemsTotal: totals.itemsTotal,
      adjustedTotal: totals.adjustedTotal,
      createdByUserId: org.userId,
    });
  } catch {
    const [again] = await db.select({ id: receivingAdjustments.id }).from(receivingAdjustments).where(eq(receivingAdjustments.packageId, packageId)).limit(1);
    if (again) return { id: again.id, created: false };
    return { error: "Couldn't start the adjustment. Try again." };
  }
  let order = 0;
  for (const l of lines) {
    await db.insert(receivingAdjustmentLines).values({
      id: newId("radjl"),
      organizationId: org.organizationId,
      adjustmentId: id,
      quotedItemId: l.quotedItemId ?? null,
      productId: l.productId ?? null,
      productName: l.productName,
      productCode: l.productCode ?? null,
      condition: l.condition ?? null,
      expiryLabel: l.expiryLabel ?? null,
      originalQuantity: l.originalQuantity ?? null,
      originalUnitPrice: l.originalUnitPrice ?? null,
      originalLineTotal: l.originalLineTotal ?? null,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      lineTotal: lineTotalOf(l.quantity, l.unitPrice),
      note: l.note ?? null,
      sortOrder: order++,
    });
  }
  await auditReceiving(org, pkg.quotationId, "adjustment", `Adjustment quotation started (${`ADJ-${q.number}`})`);
  return { id, created: true };
}

export type AdjustmentInput = {
  reasonCategory?: string | null;
  reasonNotes?: string | null;
  bonusAmount?: number | null;
  deductionAmount?: number | null;
  lines: {
    id?: string | null;
    productName: string;
    productCode?: string | null;
    condition?: string | null;
    expiryLabel?: string | null;
    quantity: number;
    unitPrice: number;
    note?: string | null;
  }[];
};

const clean = (v: string | null | undefined, max: number) => {
  const t = (v ?? "").trim().slice(0, max);
  return t || null;
};

export async function saveAdjustment(org: OrgRef, adjustmentId: string, input: AdjustmentInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const [adj] = await db
    .select()
    .from(receivingAdjustments)
    .where(and(eq(receivingAdjustments.id, adjustmentId), eq(receivingAdjustments.organizationId, org.organizationId)))
    .limit(1);
  if (!adj) return { ok: false, error: "That adjustment wasn't found." };

  const v = validateAdjustmentLines(input.lines);
  if (!v.ok) return { ok: false, error: v.error };
  const bonus = input.bonusAmount ?? 0;
  const deduction = input.deductionAmount ?? 0;
  if (!Number.isFinite(bonus) || bonus < 0 || !Number.isFinite(deduction) || deduction < 0) return { ok: false, error: "Bonus and deduction must be dollar amounts, 0 or more." };
  const reason = input.reasonCategory ? ((RECEIVING_ADJUSTMENT_REASONS as readonly string[]).includes(input.reasonCategory) ? (input.reasonCategory as (typeof RECEIVING_ADJUSTMENT_REASONS)[number]) : null) : null;
  if (input.reasonCategory && !reason) return { ok: false, error: "Choose a reason from the list." };

  const current = await db.select({ id: receivingAdjustmentLines.id }).from(receivingAdjustmentLines).where(eq(receivingAdjustmentLines.adjustmentId, adjustmentId));
  const currentIds = new Set(current.map((c) => c.id));
  const keep = new Set<string>();
  let order = 0;
  for (const l of input.lines) {
    const values = {
      productName: l.productName.trim().slice(0, 160),
      productCode: clean(l.productCode, 60),
      condition: clean(l.condition, 80),
      expiryLabel: clean(l.expiryLabel, 80),
      quantity: l.quantity,
      unitPrice: roundMoney(l.unitPrice),
      lineTotal: lineTotalOf(l.quantity, l.unitPrice),
      note: clean(l.note, 300),
      sortOrder: order++,
    };
    if (l.id && currentIds.has(l.id)) {
      keep.add(l.id);
      await db.update(receivingAdjustmentLines).set({ ...values, updatedAt: sql`(current_timestamp)` }).where(eq(receivingAdjustmentLines.id, l.id));
    } else {
      await db.insert(receivingAdjustmentLines).values({ id: newId("radjl"), organizationId: org.organizationId, adjustmentId, ...values });
    }
  }
  const drop = current.map((c) => c.id).filter((id) => !keep.has(id));
  if (drop.length) await db.delete(receivingAdjustmentLines).where(inArray(receivingAdjustmentLines.id, drop));

  const totals = adjustmentTotals(input.lines, bonus, deduction);
  await db
    .update(receivingAdjustments)
    .set({
      reasonCategory: reason,
      reasonNotes: clean(input.reasonNotes, 2000),
      bonusAmount: roundMoney(bonus),
      deductionAmount: roundMoney(deduction),
      itemsTotal: totals.itemsTotal,
      adjustedTotal: totals.adjustedTotal,
      // Editing a finalized adjustment reopens it: the PDF has to be finalized again.
      status: "DRAFT",
      updatedAt: sql`(current_timestamp)`,
    })
    .where(eq(receivingAdjustments.id, adjustmentId));
  return { ok: true };
}

// ---- the PDF --------------------------------------------------------------------

export async function renderAdjustmentPdf(organizationId: string, organizationName: string, adjustmentId: string): Promise<{ bytes: Uint8Array; filename: string } | null> {
  const a = await getAdjustmentById(organizationId, adjustmentId);
  if (!a) return null;
  const profile = await getBusinessProfile(organizationId);
  const business = resolveBusinessDocumentIdentity(organizationName, profile);
  const date = (a.finalizedAt ?? new Date().toISOString()).slice(0, 10);
  const bytes = await buildAdjustmentPdf({
    businessName: business.displayName,
    logoDataUrl: business.showLogo ? business.logoDataUrl : null,
    draft: a.status !== "FINAL",
    adjustmentNumber: a.number,
    orderLabel: [a.quotationNumber, a.trackingNumber].filter(Boolean).join(" — "),
    date,
    customerName: a.customerName,
    reason: a.reasonCategory,
    reasonNotes: a.reasonNotes,
    lines: a.lines.map((l) => ({
      productName: l.productName,
      productCode: l.productCode || null,
      condition: l.condition || null,
      note: l.note || null,
      originalQuantity: l.originalQuantity,
      originalUnitPrice: l.originalUnitPrice,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      lineTotal: l.lineTotal,
    })),
    originalTotal: a.originalTotal,
    itemsTotal: a.itemsTotal,
    bonusAmount: a.bonusAmount,
    deductionAmount: a.deductionAmount,
    adjustedTotal: a.adjustedTotal,
  });
  const safe = a.number.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 60) || "adjustment";
  return { bytes, filename: `Adjusted-Quotation-${safe}.pdf` };
}

// ---- finalize / discard ----------------------------------------------------------

async function removeStoredDocument(organizationId: string, photoId: string | null) {
  if (!photoId) return;
  const [ph] = await db
    .select()
    .from(receivingPackagePhotos)
    .where(and(eq(receivingPackagePhotos.id, photoId), eq(receivingPackagePhotos.organizationId, organizationId)))
    .limit(1);
  if (!ph) return;
  await db.delete(receivingPackagePhotos).where(eq(receivingPackagePhotos.id, photoId));
  try {
    await storage.remove(ph.storagePath);
  } catch {
    // The record is gone either way.
  }
}

/**
 * Finalizes the adjustment: builds the PDF, attaches it to the shipment (as its Revised Invoice) when file
 * storage is connected, and sets the shipment's adjusted order total and the amount the customer is told.
 */
export async function finalizeAdjustment(org: OrgRef, adjustmentId: string): Promise<{ ok: true; stored: boolean; adjustedTotal: number } | { ok: false; error: string }> {
  const a = await getAdjustmentById(org.organizationId, adjustmentId);
  if (!a) return { ok: false, error: "That adjustment wasn't found." };
  if (a.lines.length === 0) return { ok: false, error: "Add at least one product line first." };
  if (!a.reasonCategory) return { ok: false, error: "Choose the reason for the adjustment first." };

  // Stamp it final before rendering so the PDF isn't marked as a draft.
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  await db
    .update(receivingAdjustments)
    .set({ status: "FINAL", finalizedAt: now, finalizedByUserId: org.userId, updatedAt: sql`(current_timestamp)` })
    .where(eq(receivingAdjustments.id, adjustmentId));
  const pdf = await renderAdjustmentPdf(org.organizationId, org.organizationName, adjustmentId);
  if (!pdf) return { ok: false, error: "Couldn't build the adjusted quotation PDF." };

  let stored = false;
  let documentPhotoId: string | null = null;
  await removeStoredDocument(org.organizationId, a.documentPhotoId);
  if (storage.configured()) {
    const photoId = newId("rphoto");
    const path = `receiving/${org.organizationId}/${a.packageId}/${photoId}.pdf`;
    try {
      await storage.save(path, pdf.bytes, "application/pdf");
      await db.insert(receivingPackagePhotos).values({
        id: photoId,
        organizationId: org.organizationId,
        packageId: a.packageId,
        kind: "REVISED_INVOICE",
        itemId: null,
        filename: pdf.filename,
        contentType: "application/pdf",
        sizeBytes: pdf.bytes.length,
        storagePath: path,
        uploadedByUserId: org.userId,
      });
      documentPhotoId = photoId;
      stored = true;
    } catch {
      documentPhotoId = null;
    }
  }
  await db.update(receivingAdjustments).set({ documentPhotoId }).where(eq(receivingAdjustments.id, adjustmentId));

  const diff = adjustmentDifference(a.originalTotal, a.adjustedTotal);
  const [pkg] = await db.select().from(receivingPackages).where(eq(receivingPackages.id, a.packageId)).limit(1);
  const set: Partial<typeof receivingPackages.$inferInsert> = { adjustedOrderTotal: a.adjustedTotal, adjustmentAmountEmail: diff };
  if (pkg && pkg.status === "IN_PROGRESS") {
    set.adjustmentNeeded = "YES";
    if (!pkg.adjustmentDetails?.trim()) set.adjustmentDetails = a.reasonNotes || describeChangesFromView(a) || a.reasonCategory;
  }
  await db
    .update(receivingPackages)
    .set({ ...set, updatedAt: sql`(current_timestamp)` })
    .where(and(eq(receivingPackages.id, a.packageId), eq(receivingPackages.organizationId, org.organizationId)));
  if (pkg && pkg.status !== "IN_PROGRESS") await refreshIntakeLogPrice(a.packageId, a.adjustedTotal);
  if (pkg) await auditReceiving(org, pkg.quotationId, "adjustment", `Adjustment quotation finalized (${a.number}): ${a.originalTotal.toFixed(2)} -> ${a.adjustedTotal.toFixed(2)}`);
  return { ok: true, stored, adjustedTotal: a.adjustedTotal };
}

function describeChangesFromView(a: AdjustmentView): string {
  return describeChanges(a.lines.map((l) => ({ productName: l.productName, originalQuantity: l.originalQuantity, originalUnitPrice: l.originalUnitPrice, quantity: l.quantity, unitPrice: l.unitPrice })));
}

/** Deletes the adjustment, its stored PDF, and (if it had set them) clears the shipment's adjusted total. */
export async function discardAdjustment(org: OrgRef, adjustmentId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const a = await getAdjustmentById(org.organizationId, adjustmentId);
  if (!a) return { ok: false, error: "That adjustment wasn't found." };
  await removeStoredDocument(org.organizationId, a.documentPhotoId);
  await db.delete(receivingAdjustments).where(and(eq(receivingAdjustments.id, adjustmentId), eq(receivingAdjustments.organizationId, org.organizationId)));
  const [pkg] = await db.select().from(receivingPackages).where(eq(receivingPackages.id, a.packageId)).limit(1);
  if (pkg && pkg.adjustedOrderTotal != null && roundMoney(pkg.adjustedOrderTotal) === roundMoney(a.adjustedTotal)) {
    await db
      .update(receivingPackages)
      .set({ adjustedOrderTotal: null, adjustmentAmountEmail: null, updatedAt: sql`(current_timestamp)` })
      .where(eq(receivingPackages.id, a.packageId));
    if (pkg.status !== "IN_PROGRESS") {
      const [q] = await db.select({ t: purchasingQuotations.grandTotal }).from(purchasingQuotations).where(eq(purchasingQuotations.id, pkg.quotationId)).limit(1);
      if (q) await refreshIntakeLogPrice(a.packageId, q.t);
    }
  }
  if (pkg) await auditReceiving(org, pkg.quotationId, "adjustment", `Adjustment quotation discarded (${a.number})`);
  return { ok: true };
}

