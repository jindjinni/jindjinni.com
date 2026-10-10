// Money coming IN: which invoices are still owed, how late each is, and the thank-you email Customer Service sends when a payment
// arrives. Pure: nothing here reads or writes the database, so the screens, the tests and the server actions share one set of rules.

import { daysBetween } from "@/lib/payment-due";
import { balanceOf, round2 } from "@/lib/sales-rules";

// ---- how late --------------------------------------------------------------------------------------------------

export type AgeBucket = "D60_PLUS" | "D31_60" | "D1_30" | "CURRENT";

/** Worst first, the order the page lists them in. */
export const AGE_BUCKETS: AgeBucket[] = ["D60_PLUS", "D31_60", "D1_30", "CURRENT"];

export const AGE_LABEL: Record<AgeBucket, string> = {
  D60_PLUS: "More than 60 days late",
  D31_60: "31 to 60 days late",
  D1_30: "1 to 30 days late",
  CURRENT: "Not due yet",
};

/** Whole days past the due date (0 = due today or not yet due; an invoice with no usable due date is never late). */
export function daysLate(dueDate: string | null | undefined, today: string): number {
  if (!dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return 0;
  return Math.max(0, daysBetween(dueDate, today));
}

export function ageBucket(dueDate: string | null | undefined, today: string): AgeBucket {
  const n = daysLate(dueDate, today);
  return n > 60 ? "D60_PLUS" : n > 30 ? "D31_60" : n > 0 ? "D1_30" : "CURRENT";
}

/** "Due in 3 days", "Due today", "12 days late". */
export function dueText(dueDate: string | null | undefined, today: string): string {
  if (!dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return "No due date";
  const d = daysBetween(today, dueDate); // positive = still ahead
  if (d > 1) return `Due in ${d} days`;
  if (d === 1) return "Due tomorrow";
  if (d === 0) return "Due today";
  return d === -1 ? "1 day late" : `${-d} days late`;
}

export type Owed = { id: string; dueDate: string | null; total: number; amountPaid: number };

/** Totals for the tiles and the group headings. */
export function owedSummary(rows: Owed[], today: string): { owed: number; pastDue: number; dueSoon: number; count: number; byBucket: Record<AgeBucket, { count: number; owed: number }> } {
  const byBucket = Object.fromEntries(AGE_BUCKETS.map((b) => [b, { count: 0, owed: 0 }])) as Record<AgeBucket, { count: number; owed: number }>;
  let owed = 0;
  let pastDue = 0;
  let dueSoon = 0;
  for (const r of rows) {
    const bal = balanceOf(r);
    if (bal <= 0) continue;
    const b = ageBucket(r.dueDate, today);
    byBucket[b].count += 1;
    byBucket[b].owed = round2(byBucket[b].owed + bal);
    owed = round2(owed + bal);
    if (b !== "CURRENT") pastDue = round2(pastDue + bal);
    else if (r.dueDate && daysBetween(today, r.dueDate) <= 7) dueSoon = round2(dueSoon + bal);
  }
  return { owed, pastDue, dueSoon, count: AGE_BUCKETS.reduce((n, b) => n + byBucket[b].count, 0), byBucket };
}

// ---- recording a payment ---------------------------------------------------------------------------------------

/** What is wrong with a payment as typed (null = fine). The amount can't be more than is still owed. */
export function paymentProblem(inv: { total: number; amountPaid: number }, p: { amount: number; paidOn: string }): string | null {
  const amount = round2(p.amount);
  if (!Number.isFinite(amount) || amount <= 0) return "Enter the amount that was paid.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.paidOn)) return "Enter the day it was paid.";
  const owed = balanceOf(inv);
  if (owed <= 0) return "This invoice is already paid in full.";
  if (amount > owed + 0.004) return `That is more than the $${owed.toFixed(2)} still owed.`;
  return null;
}

// ---- the "payment received" email ------------------------------------------------------------------------------

/** A payment can be emailed about for this long after it was recorded; older ones are history, not a to-do. */
export const NOTICE_WINDOW_DAYS = 30;

export type NoticeInput = {
  company: string;
  contact: string | null;
  invoiceNumber: string;
  amount: number;
  paidOn: string;
  /** What is still owed on the invoice after this payment. */
  balance: number;
  /** An optional line from the agent. */
  note: string | null;
  /** Who the email is from (the company's name). */
  from: string;
};

const usd = (n: number) => `$${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;

/** The day as "Oct 9, 2026" (no time zone surprises: the day is written, not converted). */
export function dayWords(day: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return day;
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
}

/** The exact email a customer gets: fixed wording, with the agent's note in the middle. */
export function paymentNoticeEmail(i: NoticeInput): { subject: string; text: string } {
  const hello = `Hello${i.contact ? ` ${i.contact}` : ""},`;
  const paid = `We received your payment of ${usd(i.amount)} on ${dayWords(i.paidOn)} for invoice ${i.invoiceNumber}. Thank you!`;
  const rest = i.balance > 0 ? `The balance still open on this invoice is ${usd(i.balance)}.` : "This invoice is now paid in full.";
  const note = i.note?.trim() ? `${i.note.trim()}\n\n` : "";
  return {
    subject: `Payment received - invoice ${i.invoiceNumber} - ${i.from}`,
    text: `${hello}\n\n${paid}\n${rest}\n\n${note}Thank you,\n${i.from}`,
  };
}

export type NoticeReadiness = { ready: boolean; blockers: string[] };

/** Whether the email can be sent now: a valid address, the payment still counts, and it was not already handled. */
export function noticeReadiness(i: { to: string; handled: boolean; invoiceVoid: boolean }): NoticeReadiness {
  const blockers: string[] = [];
  if (i.handled) blockers.push("This payment was already handled.");
  if (i.invoiceVoid) blockers.push("The invoice was voided.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(i.to.trim())) blockers.push("Add the customer's email address.");
  return { ready: blockers.length === 0, blockers };
}

/** Is a payment recorded on `recordedDay` still inside the window where Customer Service is asked to email about it? */
export function inNoticeWindow(recordedDay: string, today: string): boolean {
  return daysBetween(recordedDay, today) <= NOTICE_WINDOW_DAYS;
}
