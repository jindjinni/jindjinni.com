// Customer Service rules, pure and testable: what must be true before a customer email can go out, how the
// "To Be Emailed" / "Emailed" lists are grouped, and how a search matches. Nothing here reads the database.

import { localDayOfUtc, sumAmounts } from "@/lib/accounts-rules";

/** The facts about one paid order that decide whether its email can be sent. */
export type ReadinessInput = {
  emailsEnabled: boolean;
  /** Every email tells customers where to submit new orders, so the website link must be set. */
  hasWebsiteLink: boolean;
  /** The customer's email address on the order. */
  toEmail: string | null;
  status: "IN_PROGRESS" | string;
  accountsStatus: string | null;
  hasPaymentReceipt: boolean;
  adjustmentNeeded: "YES" | "NO" | null;
  /** The agent's note for the customer (Step 8). */
  customerNote: string | null;
  adjustmentDetails: string | null;
  adjustedOrderTotal: number | null;
  adjustmentAmountEmail: number | null;
  /** A revised invoice photo, or a finalized adjustment quotation. */
  hasRevisedInvoice: boolean;
};

export type Readiness = {
  /** Plain-language reasons the email cannot be sent yet. Empty = ready. */
  blockers: string[];
  ready: boolean;
};

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const isEmailAddress = (v: string | null | undefined) => !!v && EMAIL_RE.test(v.trim());

/** Everything that must be fixed before the payment email can be sent, in the order someone would fix it. */
export function emailReadiness(i: ReadinessInput): Readiness {
  const blockers: string[] = [];
  if (!i.emailsEnabled) blockers.push("Customer emails are turned off. An Admin can turn them on in Email Settings.");
  if (!i.hasWebsiteLink) blockers.push("The website link isn't set. An Admin adds it in Email Settings (every email tells customers where to submit new orders).");
  if (i.status === "IN_PROGRESS") blockers.push("Receiving hasn't submitted this order yet.");
  if (i.accountsStatus !== "PAID") blockers.push("This order isn't marked Paid yet.");
  if (!isEmailAddress(i.toEmail)) blockers.push("This customer has no valid email address on the order.");
  if (!i.hasPaymentReceipt) blockers.push("Accounts hasn't attached the payment receipt yet.");
  if (i.adjustmentNeeded === "YES") {
    if (!(i.customerNote ?? "").trim() && !(i.adjustmentDetails ?? "").trim()) {
      blockers.push("Write what the adjustment is for in the note to the customer.");
    }
    if (i.adjustedOrderTotal == null && i.adjustmentAmountEmail == null) {
      blockers.push("Receiving hasn't entered the adjusted payout (Step 7) yet.");
    }
    if (!i.hasRevisedInvoice) blockers.push("The revised invoice (adjusted quotation) isn't attached yet.");
  }
  return { blockers, ready: blockers.length === 0 };
}

// ---- the two lists ----------------------------------------------------------

/** One order in either list. */
export type CsOrder = {
  id: string;
  quotationNumber: string;
  customerName: string;
  email: string | null;
  /** When Accounts marked it paid (UTC timestamp text). */
  paidAt: string | null;
  /** When the customer was last emailed, if ever (UTC timestamp text). */
  emailedAt: string | null;
  /** How the order was handled: which of the four emails applies. */
  template: string;
  /** Final payout (the adjusted total when Receiving set one). */
  amount: number;
  adjusted: boolean;
  /** Ready to send, or what is still missing (only for To Be Emailed). */
  blockers: string[];
  emailCount: number;
};

export const TEMPLATE_LABEL: Record<string, string> = {
  STANDARD: "Standard",
  STANDARD_PACKAGING_NOTICE: "Packaging notice",
  ADJUSTMENT_ONLY: "Adjustment",
  ADJUSTMENT_PACKAGING: "Adjustment + packaging",
  PACKAGING_WARNING: "Packaging warning",
};

/** Search over name, quotation number and email. */
export function csMatches(o: Pick<CsOrder, "customerName" | "quotationNumber" | "email">, q: string): boolean {
  const t = q.trim().toLowerCase();
  if (!t) return true;
  return [o.customerName, o.quotationNumber, o.email ?? ""].some((v) => v.toLowerCase().includes(t));
}

export type DayGroup<T> = { day: string; orders: T[]; total: number };

/** Groups orders under a day; `dayFor` says which day an order belongs to. Orders with no day go last under "". */
export function groupOrdersByDay<T extends { amount: number }>(orders: T[], dayFor: (o: T) => string, newestFirst: boolean): DayGroup<T>[] {
  const by = new Map<string, T[]>();
  for (const o of orders) {
    const d = dayFor(o);
    by.set(d, [...(by.get(d) ?? []), o]);
  }
  const days = [...by.keys()].filter((d) => d !== "").sort();
  if (newestFirst) days.reverse();
  if (by.has("")) days.push("");
  return days.map((day) => {
    const list = by.get(day)!;
    return { day, orders: list, total: sumAmounts(list) };
  });
}

/** To Be Emailed: under the day each order was paid, the longest-waiting day first. Day = the viewer's own calendar day. */
export const groupWaiting = (orders: CsOrder[]) => groupOrdersByDay(orders, (o) => localDayOfUtc(o.paidAt), false);

/** Emailed: under the day the email went out, newest day first. */
export const groupEmailed = (orders: CsOrder[]) => groupOrdersByDay(orders, (o) => localDayOfUtc(o.emailedAt), true);
