// Receiving rules -- pure functions, no database. What a shipment still needs
// before it can be submitted ("Missing Info" in the old Airtable), what the
// final status should be, how a product line is judged, and which customer
// email applies.

import type {
  RECEIVING_PHOTO_KINDS,
  RECEIVING_ACCOUNTS_DECISIONS,
  RECEIVING_CONDITIONS,
  RECEIVING_DISCREPANCY_CATEGORIES,
  RECEIVING_ADJUSTMENT_REASONS,
} from "@/db/schema";

export type PhotoKind = (typeof RECEIVING_PHOTO_KINDS)[number];
export type AccountsDecision = (typeof RECEIVING_ACCOUNTS_DECISIONS)[number];

export const PHOTO_KIND_LABELS: Record<PhotoKind, string> = {
  UNOPENED_PACKAGE: "Photo - Unopened Package",
  SHIPPING_LABEL: "Photo - Shipping Label",
  DAMAGE: "Damage Photos",
  PACKAGE_AS_OPENED: "Photo - Package As Opened",
  PACKAGING_ISSUE: "Packaging Issue Photos",
  COMPLETE_CONTENTS: "Photo - Complete Contents",
  PACKING_SHEET: "Invoice / Packing Sheet Photo",
  ITEM_PRODUCT: "Product Photos",
  ITEM_DAMAGE: "Damage Photos",
  ITEM_DISCREPANCY: "Discrepancy Photos",
  ITEM_EXPIRATION: "Expiration Photos",
  REVISED_INVOICE: "Revised Invoice / Adjustment Documentation",
  CUSTOMER_NOTE: "Notes for Customer Email - Photos",
  PAYMENT_CONFIRMATION: "Payment Confirmation Photo",
};

/** Kinds that may also be a PDF (the rest are photos only). */
export const DOCUMENT_PHOTO_KINDS: readonly PhotoKind[] = ["PACKING_SHEET", "REVISED_INVOICE", "PAYMENT_CONFIRMATION"];
/** Kinds that belong to one product line (carry an itemId). */
export const ITEM_PHOTO_KINDS: readonly PhotoKind[] = ["ITEM_PRODUCT", "ITEM_DAMAGE", "ITEM_DISCREPANCY", "ITEM_EXPIRATION"];

export const MAX_PHOTOS_PER_KIND = 10;

export const DAMAGE_TYPES = ["Crushed", "Torn", "Wet", "Open", "Punctured", "Tape Damage", "Box Damage", "Other"] as const;

export const STATUS_LABELS = {
  IN_PROGRESS: "In Progress",
  RECEIVING_COMPLETE: "Receiving Complete",
  RECEIVING_COMPLETE_WITH_DISCREPANCY: "Complete With Discrepancy",
} as const;

export const ACCOUNTS_DECISION_LABELS: Record<AccountsDecision, string> = {
  NEED_TO_BE_REVIEWED: "Need to Be Reviewed",
  NEED_ADJUSTED_QUOTATION: "Need Adjusted Quotation",
  NEED_TO_BE_RETURNED: "Need to Be Returned",
  NEED_TO_BE_PAID: "Need to Be Paid",
  PAID: "Paid",
};
export const ACCOUNTS_STATUS_LABELS = { IN_REVIEW: "In Review", PAID: "Paid" } as const;

export const RETURN_STATUS_LABELS = {
  NOT_APPLICABLE: "Not Applicable",
  RETURN_REQUESTED: "Return Requested",
  RETURN_SHIPPED: "Return Shipped",
  RETURNED: "Returned / Received Back",
} as const;

export const CONDITION_OPTIONS: readonly (typeof RECEIVING_CONDITIONS)[number][] = [
  "Mint", "Dinged", "Minor Damage", "Damaged", "Stained", "Torn", "Crushed", "Opened", "Unsealed", "Expired", "Other",
];
export const DISCREPANCY_OPTIONS: readonly (typeof RECEIVING_DISCREPANCY_CATEGORIES)[number][] = [
  "Product Mismatch", "Quantity Mismatch", "Product Code Mismatch", "Variant Mismatch", "Expiration Issue",
  "Mixed Expiration Dates", "Expiration Quantity Mismatch", "Product Damage", "Packaging Damage",
  "Packaging Non-Compliance", "Missing Product", "Extra Product", "Open Product", "Other",
];
export const ADJUSTMENT_REASON_OPTIONS: readonly (typeof RECEIVING_ADJUSTMENT_REASONS)[number][] = [
  "Incorrect Product", "Wrong Quantity", "Wrong Code", "Wrong Variant", "Expiration Issue", "Short-Dated Product",
  "Product Damage", "Packaging Damage", "Packaging Non-Compliance", "Product Not Eligible", "Missing Item", "Extra Item", "Other",
];

/** The existing "Generate Adjustment Quotation" tool. The link carries the customer, order and reason so the tool opens pre-filled. */
export const ADJUSTMENT_TOOL_URL = "https://claude.ai/code/artifact/3b4f58b7-6dd4-4d4e-a00b-0edae60b8741";
export function adjustmentToolLink(customer: string, orderRef: string, tracking: string | null, reason: string | null): string {
  const order = [orderRef, tracking].filter(Boolean).join(" — ");
  const q = new URLSearchParams({ customer, order, reason: reason ?? "" });
  return `${ADJUSTMENT_TOOL_URL}?${q.toString()}`;
}

export type ShipmentFacts = {
  trackingNumber?: string | null;
  receivedAt?: string | null;
  receivedByUserId?: string | null;
  externalDamage?: string | null;
  damageTypes?: string[];
  damageNotes?: string | null;
  doubleBoxed?: string | null;
  protectiveMaterial?: string | null;
  sturdyOuterBox?: string | null;
  productsSecured?: string | null;
  packageSealed?: string | null;
  packagingRequirementsMet?: string | null;
  overallPackaging?: string | null;
  packagingIssueNotes?: string | null;
  packingSheetIncluded?: string | null;
  quantityMatches?: string | null;
  adjustmentNeeded?: string | null;
  adjustmentDetails?: string | null;
  receivingNotes?: string | null;
};

export type ItemFacts = {
  productName?: string | null;
  itemSource?: string | null;
  quotedQuantity?: number | null;
  wasReceived?: string | null;
  quantityReceived?: number | null;
  codeMatches?: string | null;
  expirationQualifies?: string | null;
  needsReturn?: string | null;
  quantityToReturn?: number | null;
  returnStatus?: string | null;
};

const blank = (v: string | null | undefined) => !v || !v.trim();

/** A product line is flagged when something about it differs from the quotation or can't be accepted. */
export function itemDiscrepancy(i: ItemFacts): boolean {
  if (i.codeMatches === "NO" || i.expirationQualifies === "NO") return true;
  if (i.itemSource === "EXTRA") return true;
  if (i.wasReceived === "NO" || i.wasReceived === "PARTIALLY") return true;
  if (i.itemSource !== "EXTRA" && i.quotedQuantity != null && i.quantityReceived != null && i.quantityReceived !== i.quotedQuantity) return true;
  return false;
}

/** Quantity received vs. the lots listed for it (blank when either side is unknown). */
export function lotsMismatch(quantityReceived: number | null | undefined, lotQuantities: (number | null | undefined)[]): boolean {
  const total = lotQuantities.reduce<number>((a, q) => a + (q ?? 0), 0);
  if (!quantityReceived || total === 0) return false;
  return total !== quantityReceived;
}

export function summarizeItems(items: ItemFacts[]) {
  const returned = items.reduce((a, i) => a + (i.quantityToReturn ?? 0), 0);
  const statuses = Array.from(new Set(items.map((i) => i.returnStatus).filter((s): s is string => !!s && s !== "NOT_APPLICABLE")));
  return {
    lines: items.length,
    quantityReceived: items.reduce((a, i) => a + (i.quantityReceived ?? 0), 0),
    anyDiscrepancy: items.some(itemDiscrepancy),
    quantityToReturn: returned,
    returnStatuses: statuses,
  };
}

/** Everything still missing, in the order the form asks for it. Empty = ready to submit. */
export function computeMissingInfo(
  s: ShipmentFacts,
  photoCounts: Partial<Record<PhotoKind, number>>,
  items: ItemFacts[] = [],
): string[] {
  const n = (k: PhotoKind) => photoCounts[k] ?? 0;
  const out: string[] = [];
  if (blank(s.trackingNumber)) out.push("Order Tracking Number");
  if (blank(s.receivedAt)) out.push("Date/Time Received");
  if (!s.receivedByUserId) out.push("Received By");
  if (n("UNOPENED_PACKAGE") < 1) out.push(PHOTO_KIND_LABELS.UNOPENED_PACKAGE);
  if (n("SHIPPING_LABEL") < 1) out.push(PHOTO_KIND_LABELS.SHIPPING_LABEL);
  if (!s.externalDamage) out.push("External Damage?");
  if (s.externalDamage === "YES") {
    if (blank(s.damageNotes)) out.push("Damage Notes");
    if (n("DAMAGE") < 1) out.push(PHOTO_KIND_LABELS.DAMAGE);
  }
  if (n("PACKAGE_AS_OPENED") < 1) out.push(PHOTO_KIND_LABELS.PACKAGE_AS_OPENED);
  if (!s.overallPackaging) out.push("Overall Packaging Condition");
  if (s.overallPackaging === "NOT_ACCEPTABLE") {
    if (blank(s.packagingIssueNotes)) out.push("Packaging Issue Notes");
    if (n("PACKAGING_ISSUE") < 1) out.push(PHOTO_KIND_LABELS.PACKAGING_ISSUE);
  }
  if (n("COMPLETE_CONTENTS") < 1) out.push(PHOTO_KIND_LABELS.COMPLETE_CONTENTS);
  if (!s.quantityMatches) out.push("Does Quantity Match What Was Quoted?");
  if (items.length === 0) out.push("At least one product line in Verify What Arrived");
  for (const i of items) {
    const name = i.productName?.trim() || "A product line";
    if (!i.wasReceived) out.push(`${name}: Was Product Received?`);
    else if (i.wasReceived !== "NO" && (i.quantityReceived == null || i.quantityReceived < 0)) out.push(`${name}: Quantity Received`);
  }
  if (!s.adjustmentNeeded) out.push("Adjustment Needed?");
  if (s.adjustmentNeeded === "YES" && blank(s.adjustmentDetails)) out.push("Adjustment Details");
  if (blank(s.receivingNotes)) out.push("Receiving Notes");
  return out;
}

/** Clean vs. discrepancy: anything that differs from what was quoted or arrived badly makes it a discrepancy. */
export function finalStatusFor(s: ShipmentFacts, items: ItemFacts[] = []): "RECEIVING_COMPLETE" | "RECEIVING_COMPLETE_WITH_DISCREPANCY" {
  const discrepancy =
    s.externalDamage === "YES" ||
    s.overallPackaging === "NOT_ACCEPTABLE" ||
    s.quantityMatches === "NO" ||
    s.adjustmentNeeded === "YES" ||
    items.some(itemDiscrepancy);
  return discrepancy ? "RECEIVING_COMPLETE_WITH_DISCREPANCY" : "RECEIVING_COMPLETE";
}

export function parseDamageTypes(raw: string | null | undefined): string[] {
  return parseStringList(raw);
}
export function parseStringList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

// ---- payout + emails -------------------------------------------------------

/** What is actually paid out: the staff-entered adjusted total when there is one, else the original order total. */
export function finalPayout(orderTotal: number, adjusted: number | null | undefined): number {
  return adjusted != null ? adjusted : orderTotal;
}
export function formatMoney(n: number): string {
  const abs = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n < 0 ? "-" : ""}$${abs}`;
}

export type EmailTemplateKey = "STANDARD" | "STANDARD_PACKAGING_NOTICE" | "ADJUSTMENT_PACKAGING" | "ADJUSTMENT_ONLY";
/** Which customer email applies to a shipment. */
export function pickEmailTemplate(s: { adjustmentNeeded?: string | null; overallPackaging?: string | null }): EmailTemplateKey {
  const notAcceptable = s.overallPackaging === "NOT_ACCEPTABLE";
  if (s.adjustmentNeeded === "YES") return notAcceptable ? "ADJUSTMENT_PACKAGING" : "ADJUSTMENT_ONLY";
  return notAcceptable ? "STANDARD_PACKAGING_NOTICE" : "STANDARD";
}

/** The Monday on or before a date, as YYYY-MM-DD (used to group received lines by week). */
export function weekOf(dateLike: string | null | undefined): string | null {
  const m = dateLike ? /^(\d{4})-(\d{2})-(\d{2})/.exec(dateLike) : null;
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const back = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}
