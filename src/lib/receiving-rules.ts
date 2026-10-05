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
  /** The quotation line this row belongs to. Several rows can share one (e.g. one product received in two lots). */
  quotedItemId?: string | null;
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

/**
 * Which product lines are flagged (differ from the quotation or can't be accepted).
 * Rows that share a quotation line (one product received in several lots) are compared as a group:
 * 6 + 4 received against 10 quoted is fine.
 */
export function discrepancyFlags(items: ItemFacts[]): boolean[] {
  const received = new Map<string, number>();
  const quoted = new Map<string, number>();
  for (const i of items) {
    if (!i.quotedItemId) continue;
    received.set(i.quotedItemId, (received.get(i.quotedItemId) ?? 0) + (i.quantityReceived ?? 0));
    if (i.quotedQuantity != null) quoted.set(i.quotedItemId, i.quotedQuantity);
  }
  return items.map((i) => {
    if (i.codeMatches === "NO" || i.expirationQualifies === "NO") return true;
    if (i.itemSource === "EXTRA") return true;
    const grouped = !!i.quotedItemId && quoted.has(i.quotedItemId);
    const splitLine = !!i.quotedItemId && i.quotedQuantity == null;
    if (i.wasReceived === "NO" && !splitLine) return true;
    if (grouped) {
      // Only judge the count once every row in the group has one.
      const rows = items.filter((x) => x.quotedItemId === i.quotedItemId);
      if (rows.every((x) => x.quantityReceived != null) && received.get(i.quotedItemId!) !== quoted.get(i.quotedItemId!)) return true;
      return false;
    }
    if (i.wasReceived === "PARTIALLY") return true;
    if (i.quotedQuantity != null && i.quantityReceived != null && i.quantityReceived !== i.quotedQuantity) return true;
    return false;
  });
}

/** A single line on its own (used where there is no list to compare against). */
export function itemDiscrepancy(i: ItemFacts): boolean {
  return discrepancyFlags([i])[0];
}

/** Quantity received vs. the lots listed for it (blank when either side is unknown). */
export function lotsMismatch(quantityReceived: number | null | undefined, lotQuantities: (number | null | undefined)[]): boolean {
  const total = lotQuantities.reduce<number>((a, q) => a + (q ?? 0), 0);
  if (!quantityReceived || total === 0) return false;
  return total !== quantityReceived;
}

/**
 * Quotation lines that no received row is tied to yet (the agent hasn't entered anything for them).
 * Each one is a shortage: the product was quoted and has not been entered as received.
 */
export function quotedNotEntered<L extends { id: string; name: string }>(quotedLines: L[], items: ItemFacts[]): L[] {
  const entered = new Set(items.map((i) => i.quotedItemId).filter((x): x is string => !!x));
  return quotedLines.filter((l) => !entered.has(l.id));
}

export function summarizeItems(items: ItemFacts[], notEntered = 0) {
  const returned = items.reduce((a, i) => a + (i.quantityToReturn ?? 0), 0);
  const statuses = Array.from(new Set(items.map((i) => i.returnStatus).filter((s): s is string => !!s && s !== "NOT_APPLICABLE")));
  return {
    lines: items.length,
    quantityReceived: items.reduce((a, i) => a + (i.quantityReceived ?? 0), 0),
    anyDiscrepancy: notEntered > 0 || discrepancyFlags(items).some(Boolean),
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
    if (!i.productName?.trim()) {
      out.push("A received line has no product chosen (pick one or remove the line)");
      continue;
    }
    const name = i.productName.trim();
    if (!i.wasReceived) out.push(`${name}: Quantity Received`);
    else if (i.wasReceived !== "NO" && (i.quantityReceived == null || i.quantityReceived < 0)) out.push(`${name}: Quantity Received`);
  }
  if (!s.adjustmentNeeded) out.push("Adjustment Needed?");
  if (s.adjustmentNeeded === "YES" && blank(s.adjustmentDetails)) out.push("Adjustment Details");
  if (blank(s.receivingNotes)) out.push("Receiving Notes");
  return out;
}

/** Clean vs. discrepancy: anything that differs from what was quoted or arrived badly makes it a discrepancy. */
export function finalStatusFor(s: ShipmentFacts, items: ItemFacts[] = [], notEntered = 0): "RECEIVING_COMPLETE" | "RECEIVING_COMPLETE_WITH_DISCREPANCY" {
  const discrepancy =
    notEntered > 0 ||
    s.externalDamage === "YES" ||
    s.overallPackaging === "NOT_ACCEPTABLE" ||
    s.quantityMatches === "NO" ||
    s.adjustmentNeeded === "YES" ||
    discrepancyFlags(items).some(Boolean);
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


// ---- the All Shipments board ----------------------------------------------

export const BOARD_COLUMNS = ["UNCATEGORIZED", "NEED_TO_BE_REVIEWED", "NEED_ADJUSTED_QUOTATION", "NEED_TO_BE_RETURNED", "NEED_TO_BE_PAID", "PAID"] as const;
export type BoardColumn = (typeof BOARD_COLUMNS)[number];
export const BOARD_COLUMN_LABELS: Record<BoardColumn, string> = {
  UNCATEGORIZED: "Uncategorized",
  NEED_TO_BE_REVIEWED: "Need to Be Reviewed",
  NEED_ADJUSTED_QUOTATION: "Need Adjusted Quotation",
  NEED_TO_BE_RETURNED: "Need to Be Returned",
  NEED_TO_BE_PAID: "Need to Be Paid",
  PAID: "Paid",
};

/** Where a shipment sits on the workflow board (the Accounts Decision). Paid wins; no decision yet = Uncategorized. */
export function boardColumnFor(s: { accountsDecision?: string | null; accountsStatus?: string | null }): BoardColumn {
  if (s.accountsStatus === "PAID" || s.accountsDecision === "PAID") return "PAID";
  const d = s.accountsDecision;
  if (d && (BOARD_COLUMNS as readonly string[]).includes(d) && d !== "UNCATEGORIZED") return d as BoardColumn;
  return "UNCATEGORIZED";
}

/** "2028-01-20" -> "January 2028" (the old Expiration (Month) column). */
export function expirationMonth(date: string | null | undefined): string {
  const m = date ? /^(\d{4})-(\d{2})-\d{2}$/.exec(date) : null;
  if (!m) return "";
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${months[Number(m[2]) - 1] ?? ""} ${m[1]}`.trim();
}

/**
 * Suggested "needs return" answer from a product's condition (only used to pre-fill a blank answer; the agent can change it).
 * Clean-looking product is accepted; anything damaged, opened or expired waits for review.
 */
export function suggestDisposition(condition: string | null | undefined): "NO" | "PENDING_REVIEW" | null {
  if (!condition) return null;
  if (condition === "Mint" || condition === "Dinged") return "NO";
  return "PENDING_REVIEW";
}

// ---- received items database ---------------------------------------------------

export type DbLineInput = {
  quantityReceived: number;
  needsReturn?: string | null;
  quantityToReturn?: number | null;
  lotNumber?: string | null;
  expirationDate?: string | null;
  lots?: { lotNumber?: string | null; expirationDate?: string | null; expirationEndDate?: string | null; quantity?: number | null }[];
};
export type DbLine = {
  lotNumber: string | null;
  expirationDate: string | null;
  expirationEarliest: string | null;
  expirationLatest: string | null;
  quantity: number;
  quantityToReturn: number | null;
  /** What goes into stock: received minus returned. Null while the return decision is still "Pending Review". */
  quantityAccepted: number | null;
};

/** How many of `quantity` count as accepted (null when still undecided). */
export function acceptedQuantity(quantity: number, needsReturn?: string | null, quantityToReturn?: number | null): number | null {
  if (needsReturn === "PENDING_REVIEW") return null;
  if (needsReturn === "YES") return Math.max(0, quantity - Math.min(quantity, quantityToReturn ?? quantity));
  return quantity;
}

/**
 * The rows the Received Items database gets for one received product line. Normally one row; a product received in
 * several lots (each with its own count) becomes one row per lot, so inventory can track each lot and expiration on its own.
 * Returned units are taken off the first lots first.
 */
export function buildDbLines(i: DbLineInput): DbLine[] {
  const total = i.quantityReceived;
  const dates = (xs: (string | null | undefined)[]) => xs.filter((x): x is string => !!x).sort();
  const lots = i.lots ?? [];
  const counted = lots.filter((l) => (l.quantity ?? 0) > 0);
  const lotSum = counted.reduce((a, l) => a + (l.quantity ?? 0), 0);

  type Seg = { lotNumber: string | null; expirationDate: string | null; earliest: string | null; latest: string | null; quantity: number };
  let segs: Seg[];
  if (counted.length > 0 && lotSum <= total) {
    segs = counted.map((l) => {
      const d = dates([l.expirationDate, l.expirationEndDate]);
      return { lotNumber: l.lotNumber?.trim() || null, expirationDate: l.expirationDate || null, earliest: d[0] ?? null, latest: d[d.length - 1] ?? null, quantity: l.quantity ?? 0 };
    });
    if (lotSum < total) {
      const d = dates([i.expirationDate]);
      segs.push({ lotNumber: i.lotNumber?.trim() || null, expirationDate: i.expirationDate || null, earliest: d[0] ?? null, latest: d[d.length - 1] ?? null, quantity: total - lotSum });
    }
  } else {
    const d = dates([i.expirationDate, ...lots.flatMap((l) => [l.expirationDate, l.expirationEndDate])]);
    segs = [
      {
        lotNumber: i.lotNumber?.trim() || lots.map((l) => l.lotNumber?.trim()).find(Boolean) || null,
        expirationDate: i.expirationDate || lots.map((l) => l.expirationDate).find(Boolean) || null,
        earliest: d[0] ?? null,
        latest: d[d.length - 1] ?? null,
        quantity: total,
      },
    ];
  }

  let toReturn = i.needsReturn === "YES" ? Math.min(total, i.quantityToReturn ?? total) : 0;
  return segs.map((g) => {
    const r = Math.min(g.quantity, toReturn);
    toReturn -= r;
    return {
      lotNumber: g.lotNumber,
      expirationDate: g.expirationDate,
      expirationEarliest: g.earliest,
      expirationLatest: g.latest,
      quantity: g.quantity,
      quantityToReturn: i.needsReturn === "YES" ? r : null,
      quantityAccepted: acceptedQuantity(g.quantity, i.needsReturn, i.needsReturn === "YES" ? r : null),
    };
  });
}

// ---- typing dates like the Airtable form ----------------------------------------

/** "2027-08-20" -> "8/20/2027" (blank for anything that isn't a full date). */
export function formatDateUS(iso: string | null | undefined): string {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  return m ? `${Number(m[2])}/${Number(m[3])}/${m[1]}` : "";
}

/**
 * What an agent types into a date cell -> "YYYY-MM-DD", or null when it isn't a real date.
 * Accepts 8/20/2027, 8-20-2027, 8/20/27 and 2027-08-20.
 */
export function parseDateInput(text: string): string | null {
  const t = text.trim();
  let y: number, mo: number, d: number;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (m) [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  else if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(t))) {
    mo = Number(m[1]);
    d = Number(m[2]);
    y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  } else return null;
  if (y < 1900 || y > 2200 || mo < 1 || mo > 12 || d < 1) return null;
  const dim = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  if (d > dim) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
