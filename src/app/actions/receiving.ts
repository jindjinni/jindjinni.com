"use server";

// Receiving actions. One package per quotation (the quotation stays the single
// order record in Purchasing's Quotation Summary). Owner / Admin / Receiver can
// fill in the receiving steps; the accounting parts (Steps 7-9) can also be
// filled in by an Accountant. Everyone else is view-only. Everything is scoped
// by the signed-in user's company.

import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull, like, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  memberships,
  purchasingProducts,
  purchasingQuotations,
  purchasingQuotedItems,
  receivingAdjustments,
  receivingExpirationLots,
  receivingItems,
  receivingPackagePhotos,
  receivingPackages,
  receivingSettings,
  RECEIVING_ACCOUNTS_DECISIONS,
  RECEIVING_ADJUSTMENT_REASONS,
  RECEIVING_CONDITIONS,
  RECEIVING_DISCREPANCY_CATEGORIES,
  RECEIVING_PHOTO_KINDS,
} from "@/db/schema";
import { requireOrg, type CurrentOrg } from "@/lib/tenant";
import { canViewReceiving, canWriteAccounts, canWritePayment, canWriteReceiving, isAdmin } from "@/lib/permissions";
import { getReceivingPackage, searchQuotationsForReceiving } from "@/lib/receiving-queries";
import { newId } from "@/lib/ids";
import { sniffReceiptType } from "@/lib/purchasing-receipt-docs";
import { detectCarrier, normalizeTracking } from "@/lib/purchasing-quotation-import";
import {
  BOARD_COLUMNS,
  BOARD_COLUMN_LABELS,
  boardColumnFor,
  type BoardColumn,
  DAMAGE_TYPES,
  DOCUMENT_PHOTO_KINDS,
  ITEM_PHOTO_KINDS,
  MAX_PHOTOS_PER_KIND,
  finalStatusFor,
  quotedNotEntered,
  type PhotoKind,
} from "@/lib/receiving-rules";
import { storage, STORAGE_NOT_CONNECTED } from "@/lib/receiving-storage";
import { auditReceiving, deleteIntakeLog, deliverCustomerEmail, refreshIntakeLogPrice, writeIntakeLog } from "@/lib/receiving-service";
import { finalPayout } from "@/lib/receiving-rules";
import { isShipmentLocked } from "@/lib/receiving-test-lock";

export type ReceivingActionState = {
  error?: string;
  ok?: boolean;
  id?: string;
  missing?: string[];
  notice?: string;
  /** After a row is added / its product is set / a row is removed: how every row now relates to the quotation. */
  quoted?: Record<string, { quotedItemId: string | null; itemSource: "QUOTED" | "EXTRA"; quotedQuantity: number | null; quotedAmount: number | null }>;
  item?: { productId: string | null; productName: string; ndc: string };
};

const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
const YES_NO = ["YES", "NO"] as const;
/** Photo kinds the accounting side may add at any time, even after the shipment is submitted. */
const ACCOUNTS_PHOTO_KINDS: readonly PhotoKind[] = ["REVISED_INVOICE", "CUSTOMER_NOTE", "PAYMENT_CONFIRMATION"];

/** "YYYY-MM-DD HH:MM:SS" in UTC, the same shape as the database's own time stamps. */
function nowUtc() {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}
/** The agent's own clock as the browser sent it ("YYYY-MM-DDTHH:MM[:SS]"), kept only if it is a real time within a day of now. */
function localStamp(v: string | null | undefined): string | null {
  const m = v ? /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(v.trim()) : null;
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
  if (!Number.isFinite(t) || Math.abs(t - Date.now()) > 36 * 3600 * 1000) return null;
  return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6] ?? "00"}`;
}

async function requireWriter(): Promise<CurrentOrg> {
  const org = await requireOrg();
  if (!canWriteReceiving(org.role)) throw new Error("Your role can view Receiving but can't make changes.");
  return org;
}
async function requireAccounts(): Promise<CurrentOrg> {
  const org = await requireOrg();
  if (!canWriteAccounts(org.role)) throw new Error("Your role can view Receiving but can't make changes.");
  return org;
}

async function ownPackage(organizationId: string, packageId: string) {
  const [p] = await db
    .select()
    .from(receivingPackages)
    .where(and(eq(receivingPackages.id, packageId), eq(receivingPackages.organizationId, organizationId)))
    .limit(1);
  return p ?? null;
}

/** A submitted shipment that is edited keeps its inventory record in step (the same rewrite Submit does). */
async function resyncInventory(org: CurrentOrg, p: { status: string }, packageId: string) {
  if (p.status !== "IN_PROGRESS") await writeIntakeLog(org, packageId);
}

function refresh(packageId?: string) {
  revalidatePath("/dashboard/receiving", "layout");
  revalidatePath("/dashboard/purchasing/quotations");
  if (packageId) revalidatePath(`/dashboard/receiving/intake/${packageId}`);
}

// ---- small parsers ----------------------------------------------------------

function pick<T extends string>(raw: unknown, allowed: readonly T[]): T | null {
  const v = typeof raw === "string" ? raw : "";
  return (allowed as readonly string[]).includes(v) ? (v as T) : null;
}
function text(raw: unknown, max = 2000): string | null {
  const v = typeof raw === "string" ? raw.trim().slice(0, max) : "";
  return v || null;
}
function intOrNull(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  return Number.isInteger(n) && n >= 0 && n < 1_000_000 ? n : null;
}
function moneyOrNull(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).replace(/[$,\s]/g, "");
  if (s === "" || !/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) && Math.abs(n) < 100_000_000 ? Math.round((n + Number.EPSILON) * 100) / 100 : null;
}
function dateOrNull(raw: unknown): string | null {
  const v = typeof raw === "string" ? raw.trim() : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}
/** "2026-10-04T13:05" (datetime-local) -> "2026-10-04 13:05:00", kept exactly as typed. */
function stamp(raw: unknown): string | null {
  const v = typeof raw === "string" ? raw.trim() : "";
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::(\d{2}))?$/.exec(v);
  return m ? `${m[1]} ${m[2]}:${m[3] ?? "00"}` : null;
}
function listOf<T extends string>(raw: unknown, allowed: readonly T[]): T[] {
  if (!Array.isArray(raw)) return [];
  return Array.from(new Set(raw.filter((v): v is T => typeof v === "string" && (allowed as readonly string[]).includes(v))));
}

// ---- start ------------------------------------------------------------------

/** Start receiving an order from the Quotation Summary. If it's already started, just returns the existing package. */
export async function startReceiving(quotationId: string, localNow?: string | null): Promise<ReceivingActionState> {
  const org = await requireWriter();
  const [q] = await db
    .select({
      id: purchasingQuotations.id,
      number: purchasingQuotations.quotationNumber,
      trackingNumber: purchasingQuotations.trackingNumber,
      carrier: purchasingQuotations.carrier,
      status: purchasingQuotations.status,
    })
    .from(purchasingQuotations)
    .where(and(eq(purchasingQuotations.id, quotationId), eq(purchasingQuotations.organizationId, org.organizationId)))
    .limit(1);
  if (!q) return { error: "That order wasn't found." };
  if (q.status === "CANCELLED") return { error: "That order is cancelled, so it can't be received." };

  const [existing] = await db.select({ id: receivingPackages.id }).from(receivingPackages).where(eq(receivingPackages.quotationId, quotationId)).limit(1);
  if (existing) return { ok: true, id: existing.id };

  // Auto-fill: tracking # and carrier come from the order; the carrier is worked out from the tracking # when the order has none.
  const tracking = q.trackingNumber ? normalizeTracking(q.trackingNumber) : null;
  const carrier = (q.carrier as "UPS" | "USPS" | "FedEx" | "Other" | null) ?? (tracking ? detectCarrier(tracking) : null);

  const id = newId("rpkg");
  try {
    await db.insert(receivingPackages).values({
      id,
      organizationId: org.organizationId,
      quotationId,
      status: "IN_PROGRESS",
      trackingNumber: q.trackingNumber,
      carrier,
      // The moment the agent opens the package: server time + who they are. Locked -- nothing in the form edits these.
      startedAt: nowUtc(),
      startedByUserId: org.userId,
      receivedByUserId: org.userId,
      receivedAt: localStamp(localNow),
    });
  } catch {
    // Two people started it at the same moment: the unique index kept one.
    const [again] = await db.select({ id: receivingPackages.id }).from(receivingPackages).where(eq(receivingPackages.quotationId, quotationId)).limit(1);
    if (again) return { ok: true, id: again.id };
    return { error: "Couldn't start receiving. Try again." };
  }
  // Step 6 starts empty, like the Airtable form: the agent adds what actually arrived.
  await auditReceiving(org, quotationId, "receiving", `Receiving started (${q.number})`);
  refresh(id);
  return { ok: true, id };
}

// ---- delete a shipment pulled over by mistake -------------------------------

/**
 * Removes a shipment from Receiving (for an order pulled over by mistake). The order itself stays in Purchasing and can
 * be received again; if it had been marked Received, it goes back to Quoted. Photos, product lines, lots, recall checks,
 * draft adjustment quotations and the inventory-log entry go with it.
 *
 * Receiving staff can delete a shipment that is still In Progress. A shipment that was already submitted needs an Admin or
 * Owner, and one that is Paid or has a final adjustment quotation can't be deleted from here.
 */
export async function deleteReceivingShipment(packageId: string): Promise<ReceivingActionState> {
  const org = await requireWriter();
  const p = await ownPackage(org.organizationId, packageId);
  if (!p) return { error: "That shipment was already removed." };
  if (p.accountsDecision === "PAID" || p.accountsStatus === "PAID") {
    return { error: "This shipment is marked Paid, so it can't be deleted. Accounts must take it out of Paid first." };
  }
  if (p.status !== "IN_PROGRESS" && !isAdmin(org.role)) {
    return { error: "This shipment was already submitted. Only an Admin or Owner can delete it." };
  }
  const [finalAdj] = await db
    .select({ number: receivingAdjustments.number })
    .from(receivingAdjustments)
    .where(and(eq(receivingAdjustments.packageId, packageId), eq(receivingAdjustments.status, "FINAL")))
    .limit(1);
  if (finalAdj) return { error: `Adjustment quotation ${finalAdj.number} was already finalized for this shipment, so it can't be deleted.` };

  // Stored files first (so we know what to clean up), then the rows; everything under the shipment cascades.
  const files = await db.select({ path: receivingPackagePhotos.storagePath }).from(receivingPackagePhotos).where(eq(receivingPackagePhotos.packageId, packageId));
  await db.delete(receivingPackages).where(and(eq(receivingPackages.id, packageId), eq(receivingPackages.organizationId, org.organizationId)));
  await db
    .update(purchasingQuotations)
    .set({ status: "QUOTED", updatedAt: sql`(current_timestamp)` })
    .where(and(eq(purchasingQuotations.id, p.quotationId), eq(purchasingQuotations.organizationId, org.organizationId), eq(purchasingQuotations.status, "RECEIVED")));
  if (storage.configured()) {
    for (const path of new Set(files.map((f) => f.path))) {
      const [stillUsed] = await db.select({ id: receivingPackagePhotos.id }).from(receivingPackagePhotos).where(eq(receivingPackagePhotos.storagePath, path)).limit(1);
      if (stillUsed) continue;
      try {
        await storage.remove(path);
      } catch {
        // The record is gone either way; a leftover private file is harmless.
      }
    }
  }
  await auditReceiving(org, p.quotationId, "receiving", `Shipment deleted from Receiving${p.status === "IN_PROGRESS" ? "" : " (it had been submitted)"}; the order is back to ready-to-receive`);
  refresh();
  return { ok: true, id: packageId };
}

// ---- save / submit -----------------------------------------------------------

/** One product line as the form sends it. */
type ItemInput = {
  id?: unknown;
  wasReceived?: unknown;
  quantityReceived?: unknown;
  condition?: unknown;
  needsReturn?: unknown;
  notes?: unknown;
  ndc?: unknown;
  lotNumber?: unknown;
  codeMatches?: unknown;
  expirationQualifies?: unknown;
  expirationEntryType?: unknown;
  expirationDate?: unknown;
  discrepancyCategories?: unknown;
  discrepancyNotes?: unknown;
  adjustmentRequired?: unknown;
  managementReview?: unknown;
  returnRequired?: unknown;
  quotationAdjusted?: unknown;
  proposedRevisedAmount?: unknown;
  adjustmentReason?: unknown;
  adjustmentNotes?: unknown;
  quantityToReturn?: unknown;
  returnStatus?: unknown;
  returnTracking?: unknown;
  returnNotes?: unknown;
  lots?: unknown;
};

const MAX_LOTS = 25;

/** Validates and saves one product line (and replaces its lots). Returns an error message, or null. */
async function applyItem(organizationId: string, packageId: string, raw: ItemInput): Promise<string | null> {
  const id = typeof raw.id === "string" ? raw.id : "";
  const [cur] = await db
    .select({ id: receivingItems.id, name: receivingItems.productName })
    .from(receivingItems)
    .where(and(eq(receivingItems.id, id), eq(receivingItems.packageId, packageId), eq(receivingItems.organizationId, organizationId)))
    .limit(1);
  if (!cur) return "One of the product lines wasn't found. Refresh the page and try again.";

  const quantityReceived = intOrNull(raw.quantityReceived);
  const quantityToReturn = intOrNull(raw.quantityToReturn);
  if (quantityToReturn != null && quantityReceived != null && quantityToReturn > quantityReceived) {
    return `${cur.name}: Quantity To Return can't be more than the quantity received.`;
  }
  const wasReceived = pick(raw.wasReceived, ["YES", "NO", "PARTIALLY"] as const);
  const entryType = pick(raw.expirationEntryType, ["SINGLE", "RANGE", "MULTIPLE", "NA"] as const);

  const lotsIn = Array.isArray(raw.lots) ? (raw.lots as Record<string, unknown>[]).slice(0, MAX_LOTS) : [];
  const lots = lotsIn
    .map((l, i) => ({
      label: text(l?.label, 80),
      lotNumber: text(l?.lotNumber, 60),
      expirationDate: dateOrNull(l?.expirationDate),
      expirationEndDate: dateOrNull(l?.expirationEndDate),
      quantity: intOrNull(l?.quantity),
      sortOrder: i,
    }))
    // A row the agent never touched isn't saved.
    .filter((l) => l.label || l.lotNumber || l.expirationDate || l.expirationEndDate || l.quantity != null);
  for (const l of lots) {
    if (l.expirationDate && l.expirationEndDate && l.expirationEndDate < l.expirationDate) {
      return `${cur.name}: an expiration range ends before it starts.`;
    }
  }

  await db
    .update(receivingItems)
    .set({
      wasReceived,
      quantityReceived: wasReceived === "NO" ? 0 : quantityReceived,
      condition: pick(raw.condition, RECEIVING_CONDITIONS),
      needsReturn: pick(raw.needsReturn, ["YES", "NO", "PENDING_REVIEW"] as const),
      notes: text(raw.notes),
      ndc: text(raw.ndc, 40),
      lotNumber: text(raw.lotNumber, 60),
      codeMatches: pick(raw.codeMatches, ["YES", "NO", "NA"] as const),
      expirationQualifies: pick(raw.expirationQualifies, ["YES", "NO", "REVIEW_REQUIRED", "NA"] as const),
      expirationEntryType: entryType,
      expirationDate: dateOrNull(raw.expirationDate),
      discrepancyCategories: (() => {
        const l = listOf(raw.discrepancyCategories, RECEIVING_DISCREPANCY_CATEGORIES);
        return l.length ? JSON.stringify(l) : null;
      })(),
      discrepancyNotes: text(raw.discrepancyNotes),
      adjustmentRequired: pick(raw.adjustmentRequired, YES_NO),
      managementReview: pick(raw.managementReview, YES_NO),
      returnRequired: pick(raw.returnRequired, YES_NO),
      quotationAdjusted: pick(raw.quotationAdjusted, ["YES", "NO", "PENDING"] as const),
      proposedRevisedAmount: moneyOrNull(raw.proposedRevisedAmount),
      adjustmentReason: pick(raw.adjustmentReason, RECEIVING_ADJUSTMENT_REASONS),
      adjustmentNotes: text(raw.adjustmentNotes),
      quantityToReturn,
      returnStatus: pick(raw.returnStatus, ["NOT_APPLICABLE", "RETURN_REQUESTED", "RETURN_SHIPPED", "RETURNED"] as const),
      returnTracking: text(raw.returnTracking, 80),
      returnNotes: text(raw.returnNotes),
      updatedAt: sql`(current_timestamp)`,
    })
    .where(eq(receivingItems.id, id));

  await db.delete(receivingExpirationLots).where(eq(receivingExpirationLots.itemId, id));
  for (const l of lots) {
    await db.insert(receivingExpirationLots).values({ id: newId("rlot"), organizationId, itemId: id, ...l });
  }
  return null;
}

/** Fields of Steps 7-9 that Accounts (or the receiving agent) can set. Only fields present in the form are touched. */
async function applyAccountsFields(org: CurrentOrg, p: typeof receivingPackages.$inferSelect, formData: FormData): Promise<ReceivingActionState> {
  const set: Partial<typeof receivingPackages.$inferInsert> = {};
  if (formData.has("adjustedOrderTotal")) {
    const raw = String(formData.get("adjustedOrderTotal") ?? "").trim();
    const v = moneyOrNull(raw);
    if (raw !== "" && v == null) return { error: "Adjusted Order Total must be a dollar amount." };
    if (v != null && v < 0) return { error: "Adjusted Order Total can't be negative." };
    set.adjustedOrderTotal = v;
  }
  if (formData.has("adjustmentAmountEmail")) {
    const raw = String(formData.get("adjustmentAmountEmail") ?? "").trim();
    const v = moneyOrNull(raw);
    if (raw !== "" && v == null) return { error: "Adjustment Amount must be a dollar amount." };
    set.adjustmentAmountEmail = v;
  }
  if (formData.has("customerEmailNote")) set.customerEmailNote = text(formData.get("customerEmailNote"), 4000);
  if (formData.has("customerTexted")) set.customerTexted = formData.get("customerTexted") === "on" || formData.get("customerTexted") === "true";
  // Accounts Decision and Accounts Status describe the same thing from two angles (the board column and the paid flag), so they are kept in step.
  if (formData.has("accountsDecision") || formData.has("accountsStatus")) {
    let decision = formData.has("accountsDecision") ? pick(formData.get("accountsDecision"), RECEIVING_ACCOUNTS_DECISIONS) : p.accountsDecision;
    let status = formData.has("accountsStatus") ? pick(formData.get("accountsStatus"), ["IN_REVIEW", "PAID"] as const) : p.accountsStatus;
    const decChanged = decision !== p.accountsDecision;
    const stChanged = status !== p.accountsStatus;
    // Step 10 is for Accounts only: Receiving staff can't change the payment status or move an order into / out of Paid.
    if (!canWritePayment(org.role) && (stChanged || (decChanged && (decision === "PAID" || p.accountsDecision === "PAID")))) {
      return { error: "Only Accounts can change the payment status or mark an order Paid." };
    }
    if (stChanged && status === "PAID") decision = "PAID";
    else if (decChanged && decision === "PAID") status = "PAID";
    else if (stChanged && p.accountsStatus === "PAID" && decision === "PAID") decision = "NEED_TO_BE_REVIEWED";
    else if (decChanged && p.accountsDecision === "PAID" && status === "PAID") status = "IN_REVIEW";
    set.accountsDecision = decision;
    set.accountsStatus = status;
    // The "paid" timestamp is stamped by the app the moment the status becomes Paid.
    if (status === "PAID" && p.accountsStatus !== "PAID") set.paidAt = sql`(current_timestamp)` as unknown as string;
    if (status !== "PAID" && p.accountsStatus === "PAID") set.paidAt = null;
  }
  if (Object.keys(set).length === 0) return { ok: true };
  await db
    .update(receivingPackages)
    .set({ ...set, updatedAt: sql`(current_timestamp)` })
    .where(and(eq(receivingPackages.id, p.id), eq(receivingPackages.organizationId, org.organizationId)));
  return { ok: true };
}

/**
 * The old "Send customer email when Paid" automation: once a submitted shipment is Paid and
 * emails are on, the customer is told (once). Never throws; the reason comes back as a notice.
 */
async function maybeAutoNotify(org: CurrentOrg, packageId: string): Promise<string | undefined> {
  const data = await getReceivingPackage(org.organizationId, packageId);
  if (!data) return undefined;
  const { pkg, settings } = data;
  if (pkg.status === "IN_PROGRESS" || pkg.accountsStatus !== "PAID" || pkg.customerNotifiedAt || !settings.emailsEnabled) return undefined;
  const r = await deliverCustomerEmail(org, packageId, "STATUS");
  return r.ok ? "The customer was emailed that their order was processed." : `The customer email wasn't sent: ${r.error}`;
}

/** Saves Steps 2-9 as a draft (nothing is required yet). Only while the shipment is In Progress. */
export async function saveReceiving(packageId: string, formData: FormData): Promise<ReceivingActionState> {
  const org = await requireWriter();
  const p = await ownPackage(org.organizationId, packageId);
  if (!p) return { error: "That shipment wasn't found." };
  if (p.status !== "IN_PROGRESS") await auditReceiving(org, p.quotationId, "receiving", "Receiving details edited after the shipment was submitted");

  // Items first, so a bad quantity stops the whole save.
  const itemsRaw = formData.get("itemsJson");
  if (typeof itemsRaw === "string" && itemsRaw.trim()) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(itemsRaw);
    } catch {
      return { error: "The product lines couldn't be read. Refresh the page and try again." };
    }
    if (!Array.isArray(parsed)) return { error: "The product lines couldn't be read. Refresh the page and try again." };
    for (const it of parsed as ItemInput[]) {
      const err = await applyItem(org.organizationId, packageId, it);
      if (err) return { error: err };
    }
  }

  let receivedBy: string | null = p.receivedByUserId;
  if (formData.has("receivedByUserId")) {
    const raw = String(formData.get("receivedByUserId") ?? "");
    if (!raw) receivedBy = null;
    else {
      const [m] = await db
        .select({ userId: memberships.userId })
        .from(memberships)
        .where(and(eq(memberships.organizationId, org.organizationId), eq(memberships.userId, raw), isNull(memberships.deactivatedAt)))
        .limit(1);
      if (!m) return { error: "Received By must be someone on your team." };
      receivedBy = raw;
    }
  }

  const externalDamage = pick(formData.get("externalDamage"), YES_NO);
  const damageTypes = formData
    .getAll("damageTypes")
    .filter((v): v is string => typeof v === "string" && (DAMAGE_TYPES as readonly string[]).includes(v));
  const trackingRaw = text(formData.get("trackingNumber"), 80);
  await db
    .update(receivingPackages)
    .set({
      trackingNumber: trackingRaw,
      carrier: pick(formData.get("carrier"), ["UPS", "USPS", "FedEx", "Other"] as const),
      receivedAt: stamp(formData.get("receivedAt")),
      receivedByUserId: receivedBy,
      externalDamage,
      damageTypes: externalDamage === "YES" && damageTypes.length ? JSON.stringify(damageTypes) : null,
      damageNotes: text(formData.get("damageNotes")),
      doubleBoxed: pick(formData.get("doubleBoxed"), YES_NO),
      protectiveMaterial: pick(formData.get("protectiveMaterial"), YES_NO),
      sturdyOuterBox: pick(formData.get("sturdyOuterBox"), YES_NO),
      productsSecured: pick(formData.get("productsSecured"), YES_NO),
      packageSealed: pick(formData.get("packageSealed"), YES_NO),
      packagingRequirementsMet: pick(formData.get("packagingRequirementsMet"), ["YES", "NO", "PARTIALLY"] as const),
      overallPackaging: pick(formData.get("overallPackaging"), ["ACCEPTABLE", "NOT_ACCEPTABLE"] as const),
      packagingIssueNotes: text(formData.get("packagingIssueNotes")),
      packingSheetIncluded: pick(formData.get("packingSheetIncluded"), YES_NO),
      quantityMatches: pick(formData.get("quantityMatches"), YES_NO),
      adjustmentNeeded: pick(formData.get("adjustmentNeeded"), YES_NO),
      adjustmentDetails: text(formData.get("adjustmentDetails")),
      receivingNotes: text(formData.get("receivingNotes"), 4000),
      updatedAt: sql`(current_timestamp)`,
    })
    .where(eq(receivingPackages.id, packageId));

  const acc = await applyAccountsFields(org, p, formData);
  if (acc.error) return acc;
  await resyncInventory(org, p, packageId);
  refresh(packageId);
  return { ok: true, id: packageId };
}

/** Saves, then checks nothing is missing. If complete, locks in the final status, marks the order Received and writes the inventory log. */
export async function submitReceiving(packageId: string, formData: FormData): Promise<ReceivingActionState> {
  const org = await requireWriter();
  const saved = await saveReceiving(packageId, formData);
  if (saved.error) return saved;
  const data = await getReceivingPackage(org.organizationId, packageId);
  if (!data) return { error: "That shipment wasn't found." };
  if (data.missing.length > 0) return { error: "Some required information is still missing.", missing: data.missing };

  const { pkg } = data;
  const status = finalStatusFor({ ...pkg, damageTypes: data.damageTypes }, data.items, quotedNotEntered(data.quotedLines, data.items).length);
  await db
    .update(receivingPackages)
    .set({
      status,
      receivedByUserId: pkg.receivedByUserId ?? org.userId,
      submittedByUserId: org.userId,
      submittedAt: sql`(current_timestamp)`,
      updatedAt: sql`(current_timestamp)`,
    })
    .where(eq(receivingPackages.id, packageId));
  // The order itself lives in the Quotation Summary: mark it Received there.
  await db
    .update(purchasingQuotations)
    .set({ status: "RECEIVED", updatedAt: sql`(current_timestamp)` })
    .where(
      and(
        eq(purchasingQuotations.id, pkg.quotationId),
        eq(purchasingQuotations.organizationId, org.organizationId),
        sql`${purchasingQuotations.status} in ('QUOTED','CONFIRMED')`,
      ),
    );
  await writeIntakeLog(org, packageId);
  await auditReceiving(org, pkg.quotationId, "receiving", `Receiving submitted: ${status === "RECEIVING_COMPLETE" ? "complete" : "complete with discrepancy"}`);
  const notice = await maybeAutoNotify(org, packageId);
  refresh(packageId);
  return { ok: true, id: packageId, notice };
}

/** Puts a submitted shipment back to In Progress so it can be corrected. */
export async function reopenReceiving(packageId: string): Promise<ReceivingActionState> {
  const org = await requireWriter();
  const p = await ownPackage(org.organizationId, packageId);
  if (!p) return { error: "That shipment wasn't found." };
  await db
    .update(receivingPackages)
    .set({ status: "IN_PROGRESS", submittedAt: null, submittedByUserId: null, updatedAt: sql`(current_timestamp)` })
    .where(eq(receivingPackages.id, packageId));
  await deleteIntakeLog(packageId);
  await auditReceiving(org, p.quotationId, "receiving", "Receiving reopened for changes");
  refresh(packageId);
  return { ok: true, id: packageId };
}

/** Accounts / follow-up: Steps 7-9 accounting fields, any time (before or after submit). */
export async function saveFollowUp(packageId: string, formData: FormData): Promise<ReceivingActionState> {
  const org = await requireAccounts();
  const p = await ownPackage(org.organizationId, packageId);
  if (!p) return { error: "That shipment wasn't found." };
  const r = await applyAccountsFields(org, p, formData);
  if (r.error) return r;
  if (formData.has("accountsStatus") || formData.has("accountsDecision")) {
    await auditReceiving(org, p.quotationId, "receiving", `Accounts updated: ${String(formData.get("accountsStatus") ?? p.accountsStatus ?? "")}`);
  }
  // Keep the inventory ledger's "price paid" in step with a changed payout.
  if (p.status !== "IN_PROGRESS" && formData.has("adjustedOrderTotal")) {
    const data = await getReceivingPackage(org.organizationId, packageId);
    if (data) await refreshIntakeLogPrice(packageId, finalPayout(data.brief.grandTotal, data.pkg.adjustedOrderTotal));
  }
  const notice = await maybeAutoNotify(org, packageId);
  refresh(packageId);
  return { ok: true, id: packageId, notice };
}

/** Board drag-and-drop: moves a shipment to another column (its Accounts Decision). Dropping on Paid marks it paid. */
export async function moveReceivingCard(packageId: string, target: string): Promise<ReceivingActionState> {
  const org = await requireAccounts();
  if (!(BOARD_COLUMNS as readonly string[]).includes(target)) return { error: "Unknown column." };
  const p = await ownPackage(org.organizationId, packageId);
  if (!p) return { error: "That shipment wasn't found." };
  if (target === "PAID" && p.status === "IN_PROGRESS") return { error: "Submit receiving first, then move it to Paid." };
  const col = target as BoardColumn;
  if (boardColumnFor(p) === col) return { ok: true, id: packageId };

  const f = new FormData();
  f.set("accountsDecision", col === "UNCATEGORIZED" ? "" : col);
  if (col === "PAID") f.set("accountsStatus", "PAID");
  else if (p.accountsStatus === "PAID") f.set("accountsStatus", "IN_REVIEW");
  const r = await applyAccountsFields(org, p, f);
  if (r.error) return r;
  await auditReceiving(org, p.quotationId, "receiving", `Moved to ${BOARD_COLUMN_LABELS[col]}`);
  const notice = col === "PAID" ? await maybeAutoNotify(org, packageId) : undefined;
  refresh(packageId);
  return { ok: true, id: packageId, notice };
}

// ---- product lines ------------------------------------------------------------

/**
 * Adds a product line. A product that was on the quotation gets another row for the same quoted line
 * (e.g. the same product received in a second lot); anything else is an extra product that wasn't quoted.
 */
/** How a received row relates to the quotation (the client keeps these in step after the server changes them). */
export type QuotedLink = { quotedItemId: string | null; itemSource: "QUOTED" | "EXTRA"; quotedQuantity: number | null; quotedAmount: number | null };

/**
 * Ties every received row to the quotation line for the same product (or leaves it as "not on the order").
 * When several rows are the same product (two lots), the first carries the quoted quantity and the rest are split lines.
 * Returns every row's link so the form can follow along.
 */
async function regroupQuoted(organizationId: string, packageId: string, quotationId: string): Promise<Record<string, QuotedLink>> {
  const rows = await db
    .select()
    .from(receivingItems)
    .where(and(eq(receivingItems.packageId, packageId), eq(receivingItems.organizationId, organizationId)))
    .orderBy(receivingItems.sortOrder, receivingItems.createdAt);
  const lines = await db
    .select({ id: purchasingQuotedItems.id, productId: purchasingQuotedItems.productId, name: purchasingQuotedItems.productNameSnapshot, quantity: purchasingQuotedItems.quantity, lineTotal: purchasingQuotedItems.lineTotal })
    .from(purchasingQuotedItems)
    .where(eq(purchasingQuotedItems.quotationId, quotationId))
    .orderBy(purchasingQuotedItems.createdAt);
  const claimed = new Set<string>();
  const out: Record<string, QuotedLink> = {};
  for (const r of rows) {
    const name = r.productName.trim().toLowerCase();
    const line = name
      ? lines.find((l) => (r.productId ? l.productId === r.productId : l.productId == null ? l.name.trim().toLowerCase() === name : false))
      : undefined;
    let link: QuotedLink;
    if (!line) link = { quotedItemId: null, itemSource: "EXTRA", quotedQuantity: null, quotedAmount: null };
    else if (!claimed.has(line.id)) {
      claimed.add(line.id);
      link = { quotedItemId: line.id, itemSource: "QUOTED", quotedQuantity: line.quantity, quotedAmount: line.lineTotal };
    } else link = { quotedItemId: line.id, itemSource: "QUOTED", quotedQuantity: null, quotedAmount: null };
    out[r.id] = link;
    if (r.quotedItemId !== link.quotedItemId || r.itemSource !== link.itemSource || r.quotedQuantity !== link.quotedQuantity || r.quotedAmount !== link.quotedAmount) {
      await db.update(receivingItems).set({ ...link, updatedAt: sql`(current_timestamp)` }).where(eq(receivingItems.id, r.id));
    }
  }
  return out;
}

/** The product a row can be set to: from the company's catalog, or just a typed name. */
async function resolveProduct(organizationId: string, input: { productId?: string | null; name?: string | null }) {
  if (input.productId) {
    const [prod] = await db
      .select({ id: purchasingProducts.id, name: purchasingProducts.name, ndc: purchasingProducts.ndc })
      .from(purchasingProducts)
      .where(and(eq(purchasingProducts.id, input.productId), eq(purchasingProducts.organizationId, organizationId)))
      .limit(1);
    if (!prod) return { error: "That product wasn't found." as const };
    return { productId: prod.id, name: prod.name, ndc: prod.ndc || null };
  }
  const name = (input.name ?? "").trim().slice(0, 160);
  if (!name) return { error: "Choose a product or type its name." as const };
  return { productId: null, name, ndc: null };
}

/**
 * Adds a received-items row. With nothing given it is a blank row (the agent then picks the product in the row, like the
 * Airtable grid). With a product or a name it is that product; with a quoted line it is another row for that quoted product.
 */
export async function addReceivingItem(
  packageId: string,
  input: { productId?: string | null; name?: string | null; quotedItemId?: string | null; blank?: boolean },
): Promise<ReceivingActionState> {
  const org = await requireWriter();
  const p = await ownPackage(org.organizationId, packageId);
  if (!p) return { error: "That shipment wasn't found." };
  if (await isShipmentLocked(p)) return { error: "This shipment was already submitted. Reopen it to change the products." };

  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(receivingItems).where(eq(receivingItems.packageId, packageId));
  const id = newId("ritem");
  let productId: string | null = null;
  let name = "";
  let ndc: string | null = null;
  let label = "Blank line";

  if (input.quotedItemId) {
    const [line] = await db
      .select({ productId: purchasingQuotedItems.productId, name: purchasingQuotedItems.productNameSnapshot })
      .from(purchasingQuotedItems)
      .where(and(eq(purchasingQuotedItems.id, input.quotedItemId), eq(purchasingQuotedItems.quotationId, p.quotationId)))
      .limit(1);
    if (!line) return { error: "That quoted product wasn't found on this order." };
    productId = line.productId;
    name = line.name;
    if (productId) {
      const [prod] = await db.select({ ndc: purchasingProducts.ndc }).from(purchasingProducts).where(and(eq(purchasingProducts.id, productId), eq(purchasingProducts.organizationId, org.organizationId))).limit(1);
      ndc = prod?.ndc || null;
    }
    label = `Another line added for ${name}`;
  } else if (!input.blank) {
    const r = await resolveProduct(org.organizationId, input);
    if ("error" in r) return { error: r.error };
    productId = r.productId;
    name = r.name;
    ndc = r.ndc;
    label = `Product added: ${name}`;
  }

  await db.insert(receivingItems).values({
    id,
    organizationId: org.organizationId,
    packageId,
    productId,
    productName: name,
    itemSource: "EXTRA",
    ndc,
    sortOrder: Number(n),
  });
  const quoted = await regroupQuoted(org.organizationId, packageId, p.quotationId);
  await auditReceiving(org, p.quotationId, "receiving", label);
  await resyncInventory(org, p, packageId);
  refresh(packageId);
  return { ok: true, id, quoted, item: { productId, productName: name, ndc: ndc ?? "" } };
}

/** Sets (or changes) the product on a received-items row; the product's NDC fills in on the row. */
export async function setReceivingItemProduct(
  packageId: string,
  itemId: string,
  input: { productId?: string | null; name?: string | null },
): Promise<ReceivingActionState> {
  const org = await requireWriter();
  const p = await ownPackage(org.organizationId, packageId);
  if (!p) return { error: "That shipment wasn't found." };
  if (await isShipmentLocked(p)) return { error: "This shipment was already submitted. Reopen it to change the products." };
  const [it] = await db
    .select({ id: receivingItems.id })
    .from(receivingItems)
    .where(and(eq(receivingItems.id, itemId), eq(receivingItems.packageId, packageId), eq(receivingItems.organizationId, org.organizationId)))
    .limit(1);
  if (!it) return { error: "That product line wasn't found." };
  const r = await resolveProduct(org.organizationId, input);
  if ("error" in r) return { error: r.error };

  await db
    .update(receivingItems)
    .set({ productId: r.productId, productName: r.name, ndc: r.ndc, updatedAt: sql`(current_timestamp)` })
    .where(eq(receivingItems.id, itemId));
  const quoted = await regroupQuoted(org.organizationId, packageId, p.quotationId);
  await auditReceiving(org, p.quotationId, "receiving", `Product chosen: ${r.name}`);
  await resyncInventory(org, p, packageId);
  refresh(packageId);
  return { ok: true, id: itemId, quoted, item: { productId: r.productId, productName: r.name, ndc: r.ndc ?? "" } };
}

export async function deleteReceivingItem(packageId: string, itemId: string): Promise<ReceivingActionState> {
  const org = await requireWriter();
  const p = await ownPackage(org.organizationId, packageId);
  if (!p) return { error: "That shipment wasn't found." };
  if (await isShipmentLocked(p)) return { error: "This shipment was already submitted. Reopen it to change the products." };
  const [it] = await db
    .select({ id: receivingItems.id, name: receivingItems.productName })
    .from(receivingItems)
    .where(and(eq(receivingItems.id, itemId), eq(receivingItems.packageId, packageId), eq(receivingItems.organizationId, org.organizationId)))
    .limit(1);
  if (!it) return { error: "That product line wasn't found." };

  const photos = await db
    .select()
    .from(receivingPackagePhotos)
    .where(and(eq(receivingPackagePhotos.itemId, itemId), eq(receivingPackagePhotos.organizationId, org.organizationId)));
  if (photos.length) {
    await db.delete(receivingPackagePhotos).where(inArray(receivingPackagePhotos.id, photos.map((x) => x.id)));
    for (const ph of photos) {
      try {
        await storage.remove(ph.storagePath);
      } catch {
        // The record is gone either way.
      }
    }
  }
  await db.delete(receivingItems).where(eq(receivingItems.id, itemId));
  const quoted = await regroupQuoted(org.organizationId, packageId, p.quotationId);
  await auditReceiving(org, p.quotationId, "receiving", `Product line removed: ${it.name || "blank line"}`);
  await resyncInventory(org, p, packageId);
  refresh(packageId);
  return { ok: true, id: packageId, quoted };
}

/** Catalog lookup for "add a product that wasn't on the order". */
export async function searchProductsForReceiving(term: string) {
  const org = await requireOrg();
  if (!canViewReceiving(org.role)) return [];
  const t = term.trim().replace(/[%_\\]/g, "");
  if (t.length < 2) return [];
  const pat = `%${t.toLowerCase()}%`;
  return db
    .select({ id: purchasingProducts.id, name: purchasingProducts.name, ndc: purchasingProducts.ndc, productCode: purchasingProducts.productCode })
    .from(purchasingProducts)
    .where(
      and(
        eq(purchasingProducts.organizationId, org.organizationId),
        eq(purchasingProducts.active, true),
        isNull(purchasingProducts.archivedAt),
        or(
          like(sql`lower(${purchasingProducts.name})`, pat),
          like(sql`lower(coalesce(${purchasingProducts.productCode}, ''))`, pat),
          like(sql`lower(coalesce(${purchasingProducts.ndc}, ''))`, pat),
        ),
      ),
    )
    .orderBy(purchasingProducts.name)
    .limit(8);
}

// ---- photos -------------------------------------------------------------------

export async function uploadReceivingPhoto(packageId: string, kind: string, formData: FormData, itemId?: string | null): Promise<ReceivingActionState> {
  const org = await requireOrg();
  if (!(RECEIVING_PHOTO_KINDS as readonly string[]).includes(kind)) return { error: "Unknown photo type." };
  const k = kind as PhotoKind;
  const accountsKind = ACCOUNTS_PHOTO_KINDS.includes(k);
  if (k === "PAYMENT_CONFIRMATION" ? !canWritePayment(org.role) : accountsKind ? !canWriteAccounts(org.role) : !canWriteReceiving(org.role)) {
    return { error: "Your role can view Receiving but can't make changes." };
  }
  const p = await ownPackage(org.organizationId, packageId);
  if (!p) return { error: "That shipment wasn't found." };
  // Photos can be added at any time, including after the shipment is submitted (more evidence is never a problem).
  // Removing one is still limited to shipments in progress.
  if (!storage.configured()) return { error: STORAGE_NOT_CONNECTED };

  const isItemKind = ITEM_PHOTO_KINDS.includes(k);
  if (isItemKind) {
    if (!itemId) return { error: "Choose which product this photo is for." };
    const [it] = await db
      .select({ id: receivingItems.id })
      .from(receivingItems)
      .where(and(eq(receivingItems.id, itemId), eq(receivingItems.packageId, packageId), eq(receivingItems.organizationId, org.organizationId)))
      .limit(1);
    if (!it) return { error: "That product line wasn't found." };
  } else if (itemId) {
    return { error: "That photo type isn't tied to a product." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a photo to add." };
  if (file.size > MAX_PHOTO_BYTES) return { error: "That file is over 4 MB. Choose a smaller one." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffReceiptType(bytes);
  const pdfOk = DOCUMENT_PHOTO_KINDS.includes(k);
  if (!type || (!type.isImage && !pdfOk)) {
    return { error: pdfOk ? "Add a photo (JPG, PNG, WebP, GIF) or a PDF." : "Only photos (JPG, PNG, WebP or GIF) can be added here." };
  }

  const [{ n }] = await db
    .select({ n: sql<number>`count(*)` })
    .from(receivingPackagePhotos)
    .where(
      and(
        eq(receivingPackagePhotos.packageId, packageId),
        eq(receivingPackagePhotos.kind, k),
        itemId ? eq(receivingPackagePhotos.itemId, itemId) : isNull(receivingPackagePhotos.itemId),
      ),
    );
  if (Number(n) >= MAX_PHOTOS_PER_KIND) return { error: `You can add up to ${MAX_PHOTOS_PER_KIND} files here.` };

  const id = newId("rphoto");
  const cleanName = (file.name || `photo.${type.ext}`).replace(/[^A-Za-z0-9._ -]/g, "_").slice(0, 120);
  const storagePath = `receiving/${org.organizationId}/${packageId}/${id}.${type.ext}`;
  try {
    await storage.save(storagePath, bytes, type.mime);
  } catch {
    return { error: "The file couldn't be saved to storage. Try again." };
  }
  await db.insert(receivingPackagePhotos).values({
    id,
    organizationId: org.organizationId,
    packageId,
    kind: k,
    itemId: itemId ?? null,
    filename: cleanName,
    contentType: type.mime,
    sizeBytes: bytes.length,
    storagePath,
    uploadedByUserId: org.userId,
  });
  if (p.status !== "IN_PROGRESS") await auditReceiving(org, p.quotationId, "Photo added", `${cleanName} added after the shipment was submitted.`);
  refresh(packageId);
  return { ok: true, id };
}

export async function deleteReceivingPhoto(photoId: string): Promise<ReceivingActionState> {
  const org = await requireOrg();
  const [ph] = await db
    .select()
    .from(receivingPackagePhotos)
    .where(and(eq(receivingPackagePhotos.id, photoId), eq(receivingPackagePhotos.organizationId, org.organizationId)))
    .limit(1);
  if (!ph) return { error: "That photo wasn't found." };
  const accountsKind = ACCOUNTS_PHOTO_KINDS.includes(ph.kind);
  if (ph.kind === "PAYMENT_CONFIRMATION" ? !canWritePayment(org.role) : accountsKind ? !canWriteAccounts(org.role) : !canWriteReceiving(org.role)) {
    return { error: "Your role can view Receiving but can't make changes." };
  }
  if (!accountsKind) {
    const p = await ownPackage(org.organizationId, ph.packageId);
    if (!p || (await isShipmentLocked(p))) return { error: "This shipment was already submitted. Reopen it to change photos." };
  }
  await db.delete(receivingPackagePhotos).where(eq(receivingPackagePhotos.id, photoId));
  {
    const pk = await ownPackage(org.organizationId, ph.packageId);
    if (pk && pk.status !== "IN_PROGRESS") await auditReceiving(org, pk.quotationId, "Photo removed", `${ph.filename || "A photo"} was removed after the shipment was submitted.`);
  }
  // Test orders share one placeholder image; only remove a stored file when no other photo still points at it.
  const [stillUsed] = await db
    .select({ id: receivingPackagePhotos.id })
    .from(receivingPackagePhotos)
    .where(eq(receivingPackagePhotos.storagePath, ph.storagePath))
    .limit(1);
  if (!stillUsed) {
    try {
      await storage.remove(ph.storagePath);
    } catch {
      // The record is gone either way; a leftover private file is harmless.
    }
  }
  refresh(ph.packageId);
  return { ok: true, id: ph.packageId };
}

// ---- customer emails ----------------------------------------------------------

/** Sends (or re-sends) the "package received & processed" email that matches the shipment. */
export async function sendCustomerNotification(packageId: string): Promise<ReceivingActionState> {
  const org = await requireAccounts();
  const p = await ownPackage(org.organizationId, packageId);
  if (!p) return { error: "That shipment wasn't found." };
  const r = await deliverCustomerEmail(org, packageId, "STATUS");
  if (!r.ok) return { error: r.error };
  refresh(packageId);
  return { ok: true, id: packageId, notice: r.skipped ? `Email sent. ${r.skipped} attachment(s) were too large or unavailable and were left off.` : "Email sent to the customer." };
}

/** Sends the stand-alone packaging requirements warning. */
export async function sendPackagingWarning(packageId: string): Promise<ReceivingActionState> {
  const org = await requireAccounts();
  const p = await ownPackage(org.organizationId, packageId);
  if (!p) return { error: "That shipment wasn't found." };
  const r = await deliverCustomerEmail(org, packageId, "WARNING");
  if (!r.ok) return { error: r.error };
  refresh(packageId);
  return { ok: true, id: packageId, notice: "Packaging warning sent to the customer." };
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Email Settings (admin only): on/off switch, sender name, reply-to, hidden copies, and the two links used in the emails. */
export async function saveReceivingSettings(formData: FormData): Promise<ReceivingActionState> {
  const org = await requireOrg();
  if (!isAdmin(org.role)) return { error: "Only an owner or admin can change Email Settings." };

  const replyTo = text(formData.get("replyTo"), 200);
  if (replyTo && !EMAIL_RE.test(replyTo)) return { error: "Reply-to must be a valid email address." };
  const bccRaw = text(formData.get("bccEmails"), 500);
  const bccList = (bccRaw ?? "").split(/[,;\s]+/).filter(Boolean);
  if (bccList.some((e) => !EMAIL_RE.test(e))) return { error: "One of the hidden-copy (BCC) addresses isn't valid." };
  if (bccList.length > 5) return { error: "Add up to 5 hidden-copy (BCC) addresses." };
  const url = (raw: FormDataEntryValue | null): string | null | "bad" => {
    const v = text(raw, 500);
    if (!v) return null;
    return /^https:\/\/[^\s]+$/i.test(v) ? v : "bad";
  };
  const quote = url(formData.get("quoteLinkUrl"));
  const guide = url(formData.get("packagingGuideUrl"));
  if (quote === "bad" || guide === "bad") return { error: "Links must start with https://" };

  const values = {
    emailsEnabled: formData.get("emailsEnabled") === "on" || formData.get("emailsEnabled") === "true",
    fromName: text(formData.get("fromName"), 80),
    replyTo,
    bccEmails: bccList.length ? bccList.join(", ") : null,
    quoteLinkUrl: quote,
    packagingGuideUrl: guide,
  };
  await db
    .insert(receivingSettings)
    .values({ organizationId: org.organizationId, ...values })
    .onConflictDoUpdate({ target: receivingSettings.organizationId, set: { ...values, updatedAt: sql`(current_timestamp)` } });
  revalidatePath("/dashboard/receiving", "layout");
  return { ok: true };
}

/** Look up orders in the Quotation Summary to start receiving (reference #, customer, email or tracking #). */
export async function searchOrdersToReceive(term: string) {
  const org = await requireOrg();
  if (!canViewReceiving(org.role)) return [];
  return searchQuotationsForReceiving(org.organizationId, term);
}
