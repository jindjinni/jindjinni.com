// The two operation sides of a company, and what each one means. Pure: no database, no clock, easy to test.
//
//   Wholesale side    -> buys from individuals (quotation, free shipping label), sells to distributors.
//   Distribution side -> buys from wholesalers (purchase orders to suppliers), sells to pharmacies and other retail outlets.
//
// A company runs one side, or both (both cost more than one; see lib/pricing-rules.ts). At least one
// side stays on. Documents (Quotations and Purchase Orders) are shared by both sides; a side adds its own tabs, words and defaults.

import { parseOperationType, type OperationType } from "@/lib/operation-type";
import { SIDE_FLOW } from "@/lib/operation-tabs-rules";

export const SIDES = ["wholesale", "distribution"] as const;
export type Side = (typeof SIDES)[number];
export type Sides = { wholesale: boolean; distribution: boolean };

export type OperationsRow = {
  /** Set once this workspace is one named operation: then it is exactly that side. */
  operationKind?: string | null;
  operationType?: string | null;
  wholesaleActiveAt?: string | null;
  distributionActiveAt?: string | null;
  operationsChosenAt?: string | null;
};

export const BOTH_SIDES: Sides = { wholesale: true, distribution: true };

/**
 * Which sides are on. Order of trust:
 *  1. The company has confirmed its sides -> exactly what it chose.
 *  2. It answered the old Wholesaler / Distributor / Both question -> that answer, mapped.
 *  3. No answer at all -> both on (nothing is hidden from a company that never chose).
 */
export function sidesFrom(row: OperationsRow | null | undefined): Sides {
  if (!row) return { ...BOTH_SIDES };
  if (row.operationKind === "wholesale") return { wholesale: true, distribution: false };
  if (row.operationKind === "distribution") return { wholesale: false, distribution: true };
  if (row.operationsChosenAt) {
    const s = { wholesale: !!row.wholesaleActiveAt, distribution: !!row.distributionActiveAt };
    return s.wholesale || s.distribution ? s : { ...BOTH_SIDES }; // a damaged record never leaves a company with nothing
  }
  return sidesFromType(parseOperationType(row.operationType));
}

export function sidesFromType(type: OperationType | null | undefined): Sides {
  if (type === "WHOLESALER") return { wholesale: true, distribution: false };
  if (type === "DISTRIBUTOR") return { wholesale: false, distribution: true };
  return { ...BOTH_SIDES };
}

/** The old three-way answer for a set of sides (kept in step so every older screen keeps working). */
export function typeFromSides(s: Sides): OperationType {
  if (s.wholesale && s.distribution) return "BOTH";
  return s.distribution ? "DISTRIBUTOR" : "WHOLESALER";
}

/** True when the company has never confirmed its sides: the owner is asked once. */
/**
 * The columns saved when a company is created (sign-up or onboarding): the sides it chose, today's date for each, and that it
 * has confirmed them, so a new company never sees the "is this right?" prompt that older companies see once.
 */
export function columnsForChoice(type: OperationType, now: Date, userId: string | null) {
  const s = sidesFromType(type);
  const day = now.toISOString();
  return {
    operationType: type,
    wholesaleActiveAt: s.wholesale ? day : null,
    distributionActiveAt: s.distribution ? day : null,
    operationsChosenAt: day,
    operationsChosenBy: userId,
  };
}

export const needsConfirmation = (row: OperationsRow | null | undefined) => !row?.operationsChosenAt;

export const sidesLabel = (s: Sides) => (s.wholesale && s.distribution ? "Wholesale and Distribution" : s.wholesale ? "Wholesale" : "Distribution");

export function validateSides(s: Sides): { ok: true } | { ok: false; error: string } {
  return s.wholesale || s.distribution ? { ok: true } : { ok: false, error: "Keep at least one side on. Switch the other one on first if you want to turn this one off." };
}

export type OpenWork = { openQuotations: number; openPurchaseOrders: number };

/** The plain reason a side can't be switched off right now, or null when it can. Records are never deleted either way. */
export function turnOffBlocker(side: Side, work: OpenWork): string | null {
  if (side === "wholesale" && work.openQuotations > 0) {
    const n = work.openQuotations;
    return `You still have ${n} open quotation${n === 1 ? "" : "s"} for individuals (quoted or confirmed). Finish or cancel ${n === 1 ? "it" : "them"} first, then switch this side off.`;
  }
  if (side === "distribution" && work.openPurchaseOrders > 0) {
    const n = work.openPurchaseOrders;
    return `You still have ${n} purchase order${n === 1 ? "" : "s"} waiting on a supplier (sent or confirmed). Receive or cancel ${n === 1 ? "it" : "them"} first, then switch this side off.`;
  }
  return null;
}

export type SideInfo = {
  side: Side;
  title: string;
  tagline: string;
  buysFrom: string;
  sellsTo: string;
  turnsOn: string[];
  firstSteps: { id: string; text: string; href: string }[];
};

export const SIDE_INFO: Record<Side, SideInfo> = {
  wholesale: {
    side: "wholesale",
    title: "Wholesale",
    tagline: "Buy supplies from individuals and sell them on to distributors.",
    buysFrom: "Individuals, one package at a time",
    sellsTo: "Distributors",
    turnsOn: [
      "Quotations to individuals, with an optional free shipping label",
      "Customers (the individuals), conditions, expiry ranges and price rules",
      "Package intake, checking and price adjustments in Receiving",
      "Paying individuals in Accounts, and payment emails in Customer Service",
    ],
    firstSteps: [
      { id: "shippo", text: "Connect your own Shippo account so you can send free labels", href: "/dashboard/purchasing/connectors" },
      { id: "address", text: "Set the return address printed on your labels", href: "/dashboard/settings/business" },
      { id: "products", text: "Add your products and prices", href: "/dashboard/purchasing/products" },
      { id: "quotation", text: "Make your first quotation", href: "/dashboard/purchasing/quotations" },
    ],
  },
  distribution: {
    side: "distribution",
    title: "Distribution",
    tagline: "Buy from wholesalers with purchase orders and sell to pharmacies and other retail outlets.",
    buysFrom: "Wholesalers and other suppliers",
    sellsTo: "Pharmacies and other retail outlets",
    turnsOn: [
      "Purchase orders to suppliers (no quotations needed), with NDCs, and revisions when something is wrong",
      "Suppliers, saved once with their license and expiry",
      "Received purchase orders, invoices and a price list for each buyer",
      "Returns to suppliers with a return label",
    ],
    firstSteps: [
      { id: "supplier", text: "Add your first supplier", href: "/dashboard/purchasing/suppliers" },
      { id: "po-look", text: "Choose how your purchase orders look", href: "/dashboard/purchasing/templates?type=PURCHASE_ORDER" },
      { id: "buyers", text: "Add the pharmacies and outlets you sell to", href: "/dashboard/sales/buyers" },
      { id: "po", text: "Make your first purchase order", href: "/dashboard/purchasing/purchase-orders" },
    ],
  },
};

/** Which first steps are done, by step id. A step that cannot be told from the data is left out (shown without a tick). */
export type StepProgress = Record<string, boolean>;

/** "2 of 4 done" across the sides that are on (steps with no tick do not count). */
export function progressSummary(sides: Sides, done: StepProgress): { done: number; total: number } {
  let d = 0;
  let t = 0;
  for (const side of SIDES) {
    if (!sides[side]) continue;
    for (const st of SIDE_INFO[side].firstSteps) {
      if (!(st.id in done)) continue;
      t++;
      if (done[st.id]) d++;
    }
  }
  return { done: d, total: t };
}

/**
 * The words a side uses for the people a company sells to (the Sales "Buyers" tab). A company with both sides, or none chosen,
 * keeps the plain word. A name the company typed itself always wins over these defaults.
 */
export function wordsFor(sides: Sides): { buyers: string } {
  if (sides.wholesale && !sides.distribution) return { buyers: "Distributors" };
  if (sides.distribution && !sides.wholesale) return { buyers: "Pharmacies & outlets" };
  return { buyers: "Buyers" };
}

/**
 * A short plain note for Jin about which sides this company runs, so it explains the right flow from start to finish.
 * Links are inside the app only; the Operations settings page is for owners and admins.
 */
export function sidesNote(sides: Sides): string {
  const on = SIDES.filter((x) => sides[x]);
  const lines = on.map((x) => `- ${SIDE_INFO[x].title}: buys from ${SIDE_INFO[x].buysFrom.toLowerCase()}; sells to ${SIDE_INFO[x].sellsTo.toLowerCase()}. How a day goes: ${SIDE_FLOW[x].map((t, i) => `${i + 1}) ${t}`).join(" ")} First steps: ${SIDE_INFO[x].firstSteps.map((st, i) => `${i + 1}) [${st.text}](${st.href})`).join(" ")}`);
  return `HOW THIS COMPANY OPERATES (running both operations costs more than one; an owner or admin can see them and add the second in [Operations](/dashboard/settings/operations)):\n${lines.join("\n")}\nWhen asked how things work "from A to Z", walk through the flow for the side(s) above.`;
}
