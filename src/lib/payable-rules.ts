// Money going OUT: the bills a company owes its suppliers (Accounts -> Supplier Bills). Pure: nothing here reads or writes the
// database, so the screens, the tests and the server actions share one set of rules. How late a bill is uses the same buckets as the
// invoices customers owe (receivable-rules.ts), so the two pages read alike.

import { addDays, daysBetween } from "@/lib/payment-due";
import { ageBucket, AGE_BUCKETS, dayWords, type AgeBucket } from "@/lib/receivable-rules";
import { round2 } from "@/lib/sales-rules";

export type BillStatus = "PENDING" | "APPROVED" | "PARTIALLY_PAID" | "PAID" | "VOID";

export const BILL_LABEL: Record<BillStatus, string> = {
  PENDING: "Waiting for approval",
  APPROVED: "Approved, ready to pay",
  PARTIALLY_PAID: "Partly paid",
  PAID: "Paid",
  VOID: "Set aside",
};

export const isOpen = (s: string) => s === "PENDING" || s === "APPROVED" || s === "PARTIALLY_PAID";

/** What is still owed on a bill (never below zero). */
export const billBalance = (b: { total: number; amountPaid: number }) => Math.max(0, round2(b.total - b.amountPaid));

export const billNumberOf = (seq: number) => `BILL-${String(seq).padStart(4, "0")}`;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
export const isDay = (v: unknown): v is string => typeof v === "string" && DAY.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

// ---- due date from the purchase order's terms ------------------------------------------------------------------

/** "Net 30" / "NET30" / "net 45 days" -> 30 / 30 / 45. Anything else (including "Due on receipt") -> null. */
export function netDays(terms: string | null | undefined): number | null {
  const t = (terms ?? "").toLowerCase();
  const m = /\bnet\s*-?\s*(\d{1,3})\b/.exec(t);
  if (m) return Number(m[1]);
  if (/due\s+(on|upon)\s+receipt|cash\s+on\s+delivery|\bcod\b|prepaid|pay\s+(on|upon)\s+receipt/.test(t)) return 0;
  return null;
}

/** The day a bill is due: the invoice day plus the terms' days. Null when the terms don't say. */
export function dueFromTerms(terms: string | null | undefined, invoiceDay: string): string | null {
  const n = netDays(terms);
  if (n === null || !isDay(invoiceDay)) return null;
  return addDays(invoiceDay, n);
}

// ---- checking what was typed -----------------------------------------------------------------------------------

export type BillInput = { supplierInvoiceNumber: string; invoiceDate: string; dueDate: string; total: number; note: string };

/** What is wrong with the bill's details as typed (null = fine). `paid` is what has been paid so far: the amount can't go below it. */
export function billProblem(i: BillInput, paid = 0): string | null {
  const total = round2(i.total);
  if (!Number.isFinite(total) || total <= 0) return "Enter the amount on the supplier's invoice.";
  if (total > 10_000_000) return "That amount looks too large. Check it.";
  if (paid > 0 && total < round2(paid) - 0.004) return `Payments of $${round2(paid).toFixed(2)} are already recorded, so the amount can't be less than that.`;
  if (i.invoiceDate && !isDay(i.invoiceDate)) return "Enter the invoice date as a day.";
  if (i.dueDate && !isDay(i.dueDate)) return "Enter the due date as a day.";
  if (i.invoiceDate && i.dueDate && i.dueDate < i.invoiceDate) return "The due date can't be before the invoice date.";
  if (i.supplierInvoiceNumber.trim().length > 60) return "The supplier's invoice number is too long.";
  return null;
}

/** Whether a payment can be recorded and what's wrong with it as typed (null = fine). */
export function payProblem(b: { status: string; total: number; amountPaid: number }, p: { amount: number; paidOn: string }): string | null {
  if (b.status === "PENDING") return "Approve the bill first, then record the payment.";
  if (b.status === "VOID") return "This bill was set aside.";
  if (b.status === "PAID") return "This bill is already paid in full.";
  const amount = round2(p.amount);
  if (!Number.isFinite(amount) || amount <= 0) return "Enter the amount that was paid.";
  if (!isDay(p.paidOn)) return "Enter the day it was paid.";
  const owed = billBalance(b);
  if (amount > owed + 0.004) return `That is more than the $${owed.toFixed(2)} still owed.`;
  return null;
}

/** The status a bill has after money was paid (only meaningful for a bill that was approved). */
export function statusAfterPayment(total: number, amountPaid: number): BillStatus {
  return billBalance({ total, amountPaid }) <= 0 ? "PAID" : amountPaid > 0 ? "PARTIALLY_PAID" : "APPROVED";
}

export function approveProblem(status: string): string | null {
  if (status === "PENDING") return null;
  if (status === "VOID") return "This bill was set aside.";
  return "This bill is already approved.";
}

export function voidProblem(b: { status: string; amountPaid: number }): string | null {
  if (b.status === "VOID") return "This bill was already set aside.";
  if (b.amountPaid > 0) return "Payments are recorded on this bill, so it can't be set aside.";
  return null;
}

// ---- totals for the page ---------------------------------------------------------------------------------------

export type OweRow = { id: string; supplier: string; dueDate: string | null; total: number; amountPaid: number; status: string };

export type OweSummary = {
  owed: number;
  pastDue: number;
  dueSoon: number;
  waiting: number;
  waitingAmount: number;
  count: number;
  byBucket: Record<AgeBucket, { count: number; owed: number }>;
};

/** Open bills only (waiting, approved, partly paid): the tiles and the group headings. */
export function oweSummary(rows: OweRow[], today: string): OweSummary {
  const byBucket = Object.fromEntries(AGE_BUCKETS.map((b) => [b, { count: 0, owed: 0 }])) as OweSummary["byBucket"];
  let owed = 0;
  let pastDue = 0;
  let dueSoon = 0;
  let waiting = 0;
  let waitingAmount = 0;
  let count = 0;
  for (const r of rows) {
    if (!isOpen(r.status)) continue;
    const bal = billBalance(r);
    if (bal <= 0) continue;
    const b = ageBucket(r.dueDate, today);
    count += 1;
    byBucket[b].count += 1;
    byBucket[b].owed = round2(byBucket[b].owed + bal);
    owed = round2(owed + bal);
    if (b !== "CURRENT") pastDue = round2(pastDue + bal);
    else if (r.dueDate && daysBetween(today, r.dueDate) <= 7) dueSoon = round2(dueSoon + bal);
    if (r.status === "PENDING") {
      waiting += 1;
      waitingAmount = round2(waitingAmount + bal);
    }
  }
  return { owed, pastDue, dueSoon, waiting, waitingAmount, count, byBucket };
}

export type SupplierTotal = { supplier: string; count: number; owed: number; pastDue: number };

/** What is owed to each supplier, biggest first. */
export function supplierTotals(rows: OweRow[], today: string): SupplierTotal[] {
  const map = new Map<string, SupplierTotal>();
  for (const r of rows) {
    if (!isOpen(r.status)) continue;
    const bal = billBalance(r);
    if (bal <= 0) continue;
    const key = r.supplier.trim() || "Unnamed supplier";
    const cur = map.get(key) ?? { supplier: key, count: 0, owed: 0, pastDue: 0 };
    cur.count += 1;
    cur.owed = round2(cur.owed + bal);
    if (ageBucket(r.dueDate, today) !== "CURRENT") cur.pastDue = round2(cur.pastDue + bal);
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => b.owed - a.owed || a.supplier.localeCompare(b.supplier));
}

/** Bills that need a person: waiting for approval or past due (the number on the sidebar tab). */
export function attentionCount(rows: OweRow[], today: string): number {
  return rows.filter((r) => isOpen(r.status) && billBalance(r) > 0 && (r.status === "PENDING" || ageBucket(r.dueDate, today) !== "CURRENT")).length;
}

// ---- the "we paid you" email to the supplier -------------------------------------------------------------------

/** A payment can be emailed about for this long after it was recorded. */
export const SUPPLIER_NOTICE_WINDOW_DAYS = 60;

export type SupplierNoticeInput = {
  contact: string | null;
  /** The supplier's own invoice number when we have it, otherwise our purchase order number. */
  reference: string;
  poNumber: string | null;
  amount: number;
  paidOn: string;
  method: string | null;
  paymentReference: string | null;
  /** What is still owed on the bill after this payment. */
  balance: number;
  note: string | null;
  /** Who the email is from (the company's name). */
  from: string;
};

const usd = (n: number) => `$${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;

/** The exact email a supplier gets: fixed wording with the accountant's note in the middle. It states what we paid, never what we owe them beyond this bill. */
export function supplierNoticeEmail(i: SupplierNoticeInput): { subject: string; text: string } {
  const hello = `Hello${i.contact ? ` ${i.contact}` : ""},`;
  const forWhat = i.poNumber && i.poNumber !== i.reference ? `invoice ${i.reference} (our purchase order ${i.poNumber})` : `invoice ${i.reference}`;
  const how = [i.method?.trim() ? `by ${i.method.trim()}` : "", i.paymentReference?.trim() ? `(reference ${i.paymentReference.trim()})` : ""].filter(Boolean).join(" ");
  const paid = `We paid ${usd(i.amount)} on ${dayWords(i.paidOn)}${how ? ` ${how}` : ""} for ${forWhat}.`;
  const rest = i.balance > 0 ? `The balance still open on this invoice is ${usd(i.balance)}.` : "This invoice is now paid in full.";
  const note = i.note?.trim() ? `${i.note.trim()}\n\n` : "";
  return {
    subject: `Payment sent - ${i.reference} - ${i.from}`,
    text: `${hello}\n\n${paid}\n${rest}\n\n${note}Thank you,\n${i.from}`,
  };
}

export type SupplierNoticeReadiness = { ready: boolean; blockers: string[] };

export function supplierNoticeReadiness(i: { to: string; handled: boolean; billVoid: boolean }): SupplierNoticeReadiness {
  const blockers: string[] = [];
  if (i.handled) blockers.push("This payment was already handled.");
  if (i.billVoid) blockers.push("The bill was set aside.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(i.to.trim())) blockers.push("Add the supplier's email address.");
  return { ready: blockers.length === 0, blockers };
}

export function inSupplierNoticeWindow(recordedDay: string, today: string): boolean {
  return daysBetween(recordedDay, today) <= SUPPLIER_NOTICE_WINDOW_DAYS;
}

export const BILL_FILE_KIND_LABEL: Record<string, string> = { INVOICE: "Supplier's invoice", PROOF: "Proof of payment", OTHER: "Other" };
