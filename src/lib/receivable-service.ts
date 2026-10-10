// Money coming in: the invoices still owed (Accounts -> To Be Collected) and the "payment received" emails Customer Service sends.
// Every query starts from the signed-in company's id. Nothing here changes an invoice's own record: payments are recorded with
// `recordPayment` in sales-service (the one place that does the arithmetic), and this file only reads them and keeps the log of
// what Customer Service did about each payment.

import { and, asc, desc, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { paymentNotices, salesDocuments, salesPayments, users } from "@/db/schema";
import { featureOn } from "@/lib/features";
import { newId } from "@/lib/ids";
import { dayInZone, todayIn, addDays } from "@/lib/payment-due";
import { getPaymentTerms } from "@/lib/accounts-queries";
import { sendDeptEmail } from "@/lib/mail-system";
import { ageBucket, inNoticeWindow, NOTICE_WINDOW_DAYS, noticeReadiness, owedSummary, paymentNoticeEmail } from "@/lib/receivable-rules";
import { balanceOf, round2 } from "@/lib/sales-rules";
import { resolveFrom, type Org } from "@/lib/sales-service";

/** The rollout switch for money coming in (Settings -> Feature rollout). */
export const receivablesOn = (organizationId: string) => featureOn("receivables", organizationId);

/** The company's own "today" (the Accounts payment-terms time zone). */
export async function todayFor(organizationId: string): Promise<string> {
  return todayIn((await getPaymentTerms(organizationId)).timeZone);
}

// ---- To Be Collected -------------------------------------------------------------------------------------------

export type Collectible = {
  id: string;
  number: string;
  buyer: string;
  docDate: string;
  dueDate: string | null;
  sentAt: string | null;
  total: number;
  amountPaid: number;
  balance: number;
  status: string;
};

/** Sent invoices that still owe money, oldest due date first. Drafts, void and fully paid invoices never appear. */
export async function listCollectible(organizationId: string): Promise<Collectible[]> {
  const rows = await db
    .select()
    .from(salesDocuments)
    .where(and(eq(salesDocuments.organizationId, organizationId), eq(salesDocuments.kind, "INVOICE"), inArray(salesDocuments.status, ["SENT", "PARTIALLY_PAID"])))
    .orderBy(asc(salesDocuments.dueDate), asc(salesDocuments.seq));
  return rows
    .map((d) => ({ id: d.id, number: d.number, buyer: d.buyerCompany ?? "", docDate: d.docDate, dueDate: d.dueDate, sentAt: d.sentAt, total: d.total, amountPaid: d.amountPaid, balance: balanceOf(d), status: d.status }))
    .filter((d) => d.balance > 0);
}

/** How many sent invoices are past their due date (the number on the sidebar tab). */
export async function pastDueCount(organizationId: string): Promise<number> {
  const [rows, today] = await Promise.all([listCollectible(organizationId), todayFor(organizationId)]);
  return rows.filter((r) => ageBucket(r.dueDate, today) !== "CURRENT").length;
}

export type CollectedPayment = { paymentId: string; documentId: string; number: string; buyer: string; amount: number; paidOn: string; method: string; note: string };

/** Payments recorded in the last `days` days (by the day they were paid), newest first. */
export async function recentPayments(organizationId: string, days = 30): Promise<CollectedPayment[]> {
  const today = await todayFor(organizationId);
  const since = addDays(today, -days);
  const rows = await db
    .select({ p: salesPayments, number: salesDocuments.number, buyer: salesDocuments.buyerCompany })
    .from(salesPayments)
    .innerJoin(salesDocuments, eq(salesDocuments.id, salesPayments.documentId))
    .where(and(eq(salesPayments.organizationId, organizationId), eq(salesDocuments.organizationId, organizationId), gte(salesPayments.paidOn, since)))
    .orderBy(desc(salesPayments.paidOn), desc(salesPayments.createdAt));
  return rows.map((r) => ({ paymentId: r.p.id, documentId: r.p.documentId, number: r.number, buyer: r.buyer ?? "", amount: r.p.amount, paidOn: r.p.paidOn, method: r.p.method ?? "", note: r.p.note ?? "" }));
}

/** The numbers for the page's tiles. */
export async function collectionSummary(organizationId: string) {
  const [rows, today, recent] = await Promise.all([listCollectible(organizationId), todayFor(organizationId), recentPayments(organizationId, 30)]);
  const s = owedSummary(rows, today);
  return { ...s, today, collected30: round2(recent.reduce((n, p) => n + p.amount, 0)) };
}

// ---- Customer Service: payments to email about -----------------------------------------------------------------

export type NoticeItem = {
  paymentId: string;
  documentId: string;
  invoiceNumber: string;
  buyer: string;
  contact: string | null;
  email: string;
  amount: number;
  paidOn: string;
  method: string;
  /** What is still owed on the invoice right after this payment. */
  balanceAfter: number;
  recordedDay: string;
  invoiceVoid: boolean;
};

async function noticeItems(organizationId: string, paymentIds?: string[]): Promise<NoticeItem[]> {
  const terms = await getPaymentTerms(organizationId);
  const rows = await db
    .select({ p: salesPayments, d: salesDocuments })
    .from(salesPayments)
    .innerJoin(salesDocuments, eq(salesDocuments.id, salesPayments.documentId))
    .where(and(eq(salesPayments.organizationId, organizationId), eq(salesDocuments.organizationId, organizationId), eq(salesDocuments.kind, "INVOICE"), ...(paymentIds ? [inArray(salesPayments.id, paymentIds)] : [])))
    .orderBy(desc(salesPayments.paidOn), desc(salesPayments.createdAt));
  if (rows.length === 0) return [];
  // The balance after each payment: the invoice total minus the payments made up to and including it.
  const docIds = [...new Set(rows.map((r) => r.d.id))];
  const all = await db
    .select({ id: salesPayments.id, documentId: salesPayments.documentId, amount: salesPayments.amount, paidOn: salesPayments.paidOn, createdAt: salesPayments.createdAt })
    .from(salesPayments)
    .where(and(eq(salesPayments.organizationId, organizationId), inArray(salesPayments.documentId, docIds)))
    .orderBy(asc(salesPayments.paidOn), asc(salesPayments.createdAt), asc(salesPayments.id));
  const after = new Map<string, number>();
  const running = new Map<string, number>();
  const totals = new Map(rows.map((r) => [r.d.id, r.d.total]));
  for (const pay of all) {
    const r = round2((running.get(pay.documentId) ?? 0) + pay.amount);
    running.set(pay.documentId, r);
    after.set(pay.id, Math.max(0, round2((totals.get(pay.documentId) ?? 0) - r)));
  }
  return rows.map((r) => ({
    paymentId: r.p.id,
    documentId: r.d.id,
    invoiceNumber: r.d.number,
    buyer: r.d.buyerCompany ?? "",
    contact: r.d.buyerContact,
    email: r.d.buyerEmail ?? "",
    amount: r.p.amount,
    paidOn: r.p.paidOn,
    method: r.p.method ?? "",
    balanceAfter: after.get(r.p.id) ?? 0,
    recordedDay: dayInZone(r.p.createdAt, terms.timeZone) || r.p.paidOn,
    invoiceVoid: r.d.status === "VOID",
  }));
}

/** Payments nobody has emailed about or set aside yet, recorded in the last 30 days, newest first. */
export async function listNoticeCandidates(organizationId: string): Promise<NoticeItem[]> {
  const [items, handled, today] = await Promise.all([
    noticeItems(organizationId),
    db.select({ paymentId: paymentNotices.paymentId }).from(paymentNotices).where(eq(paymentNotices.organizationId, organizationId)),
    todayFor(organizationId),
  ]);
  const done = new Set(handled.map((h) => h.paymentId));
  return items.filter((i) => !done.has(i.paymentId) && !i.invoiceVoid && inNoticeWindow(i.recordedDay, today));
}

export async function countNoticeCandidates(organizationId: string): Promise<number> {
  return (await listNoticeCandidates(organizationId)).length;
}

export type HandledNotice = typeof paymentNotices.$inferSelect;

export async function listHandled(organizationId: string, limit = 60): Promise<HandledNotice[]> {
  return db.select().from(paymentNotices).where(eq(paymentNotices.organizationId, organizationId)).orderBy(desc(paymentNotices.handledAt)).limit(limit);
}

export async function getHandled(organizationId: string, paymentId: string): Promise<HandledNotice | null> {
  const [row] = await db.select().from(paymentNotices).where(and(eq(paymentNotices.organizationId, organizationId), eq(paymentNotices.paymentId, paymentId))).limit(1);
  return row ?? null;
}

export type NoticeDetail = { item: NoticeItem; handled: HandledNotice | null; from: string };

export async function getNoticeDetail(organizationId: string, paymentId: string): Promise<NoticeDetail | null> {
  const [items, handled, from] = await Promise.all([noticeItems(organizationId, [paymentId]), getHandled(organizationId, paymentId), resolveFrom(organizationId)]);
  const item = items[0];
  if (item) return { item, handled, from: from.name };
  // The payment itself was corrected away in Sales: the record of what Customer Service did stays readable from its own copy.
  if (handled) {
    const snap: NoticeItem = { paymentId, documentId: handled.documentId, invoiceNumber: handled.invoiceNumber, buyer: handled.buyerCompany ?? "", contact: null, email: handled.toEmail ?? "", amount: handled.amount, paidOn: handled.paidOn, method: "", balanceAfter: 0, recordedDay: handled.paidOn, invoiceVoid: false };
    return { item: snap, handled, from: from.name };
  }
  return null;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const textToHtml = (t: string) => `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1a1d21">${esc(t).replace(/\n/g, "<br>")}</div>`;

type Send = (args: { to: string; subject: string; text: string; html: string; fromName: string }) => Promise<{ ok: true } | { ok: false; error: string }>;

const defaultSend = (org: Org, paymentId: string): Send => async (a) => {
  const r = await sendDeptEmail(org.organizationId, { dept: "customer-service", relatedKind: "payment_notice", relatedId: paymentId, by: { userId: org.userId, name: null } }, a);
  return r.ok ? { ok: true } : { ok: false, error: r.error };
};

async function nameOf(userId: string): Promise<string | null> {
  const [u] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  return u?.name || u?.email || null;
}

/** The exact email as it will go (the same words the preview shows). */
export function composeNotice(item: NoticeItem, from: string, note: string | null) {
  return paymentNoticeEmail({ company: item.buyer, contact: item.contact, invoiceNumber: item.invoiceNumber, amount: item.amount, paidOn: item.paidOn, balance: item.balanceAfter, note, from });
}

/**
 * Emails the customer that their payment arrived. The payment is claimed first (one row per payment, unique), so two people pressing
 * Send at once cannot email twice; if the email is refused the claim is removed and nothing is recorded as sent.
 */
export async function sendPaymentNotice(org: Org, paymentId: string, opts: { to: string; note?: string | null }, send?: Send): Promise<{ ok: true; to: string } | { ok: false; error: string }> {
  const detail = await getNoticeDetail(org.organizationId, paymentId);
  if (!detail) return { ok: false, error: "That payment wasn't found." };
  const to = (opts.to ?? "").trim();
  const ready = noticeReadiness({ to, handled: !!detail.handled, invoiceVoid: detail.item.invoiceVoid });
  if (!ready.ready) return { ok: false, error: ready.blockers[0] };
  const note = (opts.note ?? "").trim().slice(0, 1000) || null;
  const mail = composeNotice(detail.item, detail.from, note);
  const now = new Date().toISOString();
  const rowId = newId("pnot");
  const byName = await nameOf(org.userId);
  try {
    await db.insert(paymentNotices).values({
      id: rowId, organizationId: org.organizationId, paymentId, documentId: detail.item.documentId, status: "SENT", invoiceNumber: detail.item.invoiceNumber, buyerCompany: detail.item.buyer || null,
      amount: detail.item.amount, paidOn: detail.item.paidOn, toEmail: to, subject: mail.subject, body: mail.text, note, handledByUserId: org.userId, handledByName: byName, handledAt: now,
    });
  } catch {
    return { ok: false, error: "This payment was already handled." };
  }
  let result: { ok: true } | { ok: false; error: string };
  try {
    result = await (send ?? defaultSend(org, paymentId))({ to, subject: mail.subject, text: mail.text, html: textToHtml(mail.text), fromName: detail.from });
  } catch (e) {
    result = { ok: false, error: e instanceof Error ? e.message : "The email couldn't be sent." };
  }
  if (!result.ok) {
    await db.delete(paymentNotices).where(and(eq(paymentNotices.id, rowId), eq(paymentNotices.organizationId, org.organizationId)));
    return { ok: false, error: `The email wasn't sent, so nothing was recorded. ${result.error}`.trim() };
  }
  return { ok: true, to };
}

/** "No email needed": keeps the payment out of the to-do list, with who decided and when. */
export async function skipPaymentNotice(org: Org, paymentId: string, reason?: string | null): Promise<{ ok: true } | { ok: false; error: string }> {
  const detail = await getNoticeDetail(org.organizationId, paymentId);
  if (!detail) return { ok: false, error: "That payment wasn't found." };
  if (detail.handled) return { ok: false, error: "This payment was already handled." };
  try {
    await db.insert(paymentNotices).values({
      id: newId("pnot"), organizationId: org.organizationId, paymentId, documentId: detail.item.documentId, status: "SKIPPED", invoiceNumber: detail.item.invoiceNumber, buyerCompany: detail.item.buyer || null,
      amount: detail.item.amount, paidOn: detail.item.paidOn, note: (reason ?? "").trim().slice(0, 300) || null, handledByUserId: org.userId, handledByName: await nameOf(org.userId), handledAt: new Date().toISOString(),
    });
  } catch {
    return { ok: false, error: "This payment was already handled." };
  }
  return { ok: true };
}

export { NOTICE_WINDOW_DAYS };
