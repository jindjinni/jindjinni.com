// Money going out: the bills a company owes its suppliers (Accounts -> Supplier Bills). Every query starts from the signed-in company's
// id. A bill starts from a received supplier purchase order, is approved by Accounts, and is paid in recorded payments. Nothing here
// moves money: a payment is a record that someone paid, and the supplier is told only when a person presses Send.

import { and, asc, desc, eq, gte, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  purchasingPurchaseOrderLines,
  purchasingPurchaseOrders,
  purchasingSuppliers,
  supplierBillFiles,
  supplierBillNotices,
  supplierBillPayments,
  supplierBills,
  users,
} from "@/db/schema";
import { featureOn } from "@/lib/features";
import { newId } from "@/lib/ids";
import { addDays, dayInZone } from "@/lib/payment-due";
import { getPaymentTerms } from "@/lib/accounts-queries";
import { sendDeptEmail } from "@/lib/mail-system";
import { safeFilename } from "@/lib/chat-rules";
import { sniffReceiptType } from "@/lib/purchasing-receipt-docs";
import { storage, STORAGE_NOT_CONNECTED } from "@/lib/receiving-storage";
import { resolveFrom, type Org } from "@/lib/sales-service";
import { todayFor } from "@/lib/receivable-service";
import { round2 } from "@/lib/sales-rules";
import {
  approveProblem, attentionCount, billBalance, billNumberOf, billProblem, dueFromTerms, inSupplierNoticeWindow, isOpen, oweSummary, payProblem, supplierNoticeEmail,
  supplierNoticeReadiness, supplierTotals, voidProblem, type BillInput,
} from "@/lib/payable-rules";

export type Bill = typeof supplierBills.$inferSelect;
export type BillPayment = typeof supplierBillPayments.$inferSelect;
export type BillFile = typeof supplierBillFiles.$inferSelect;
export type BillNotice = typeof supplierBillNotices.$inferSelect;
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export const MAX_BILL_FILE_BYTES = 4 * 1024 * 1024;
export const MAX_BILL_FILES = 10;

/** The rollout switch for supplier bills (Settings -> Feature rollout). */
export const payablesOn = (organizationId: string) => featureOn("payables", organizationId);

async function nameOf(userId: string): Promise<string | null> {
  const [u] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  return u?.name || u?.email || null;
}

const clean = (v: unknown, max: number) => String(v ?? "").replace(/\r/g, "").trim().slice(0, max);

// ---- making a bill ---------------------------------------------------------------------------------------------

/**
 * Makes the bill for a received supplier purchase order (amount = the order's total, due date from its terms). One open bill per order:
 * if there already is one (not set aside) nothing new is made. Called when Accounts presses "Create bill" and, automatically, when
 * Purchasing marks the order received while the rollout switch is on.
 */
export async function createBillFromPo(org: Org, purchaseOrderId: string): Promise<Result<{ id: string; billNumber: string; created: boolean }>> {
  const [po] = await db
    .select()
    .from(purchasingPurchaseOrders)
    .where(and(eq(purchasingPurchaseOrders.id, purchaseOrderId), eq(purchasingPurchaseOrders.organizationId, org.organizationId)))
    .limit(1);
  if (!po) return { ok: false, error: "That purchase order wasn't found." };
  if (po.status !== "RECEIVED") return { ok: false, error: "A bill can be made once the supplier's order has been received." };
  const [have] = await db
    .select({ id: supplierBills.id, billNumber: supplierBills.billNumber })
    .from(supplierBills)
    .where(and(eq(supplierBills.organizationId, org.organizationId), eq(supplierBills.purchaseOrderId, po.id), ne(supplierBills.status, "VOID")))
    .limit(1);
  if (have) return { ok: true, id: have.id, billNumber: have.billNumber, created: false };
  let contact: string | null = null;
  if (po.supplierId) {
    const [s] = await db
      .select({ contactName: purchasingSuppliers.contactName })
      .from(purchasingSuppliers)
      .where(and(eq(purchasingSuppliers.id, po.supplierId), eq(purchasingSuppliers.organizationId, org.organizationId)))
      .limit(1);
    contact = s?.contactName?.trim() || null;
  }
  const today = await todayFor(org.organizationId);
  const total = round2(po.total);
  for (let attempt = 0; attempt < 6; attempt++) {
    const [{ m }] = await db.select({ m: sql<number>`coalesce(max(${supplierBills.seq}), 0)` }).from(supplierBills).where(eq(supplierBills.organizationId, org.organizationId));
    const seq = Number(m) + 1;
    const id = newId("bill");
    try {
      await db.insert(supplierBills).values({
        id, organizationId: org.organizationId, seq, billNumber: billNumberOf(seq), purchaseOrderId: po.id, poNumber: po.poNumber, supplierId: po.supplierId,
        supplierName: po.supplierName || "Unnamed supplier", supplierContact: contact, supplierEmail: po.supplierEmail, terms: po.terms, dueDate: dueFromTerms(po.terms, today),
        total, amountPaid: 0, status: "PENDING", createdByUserId: org.userId,
      });
      return { ok: true, id, billNumber: billNumberOf(seq), created: true };
    } catch {
      // another bill took this number a moment ago: try the next one
    }
  }
  return { ok: false, error: "The bill couldn't be made. Try again." };
}

/** Best effort, for the moment Purchasing marks an order received: makes the bill when supplier bills are on, never blocks the order. */
export async function autoBillOnReceived(org: Org, purchaseOrderId: string): Promise<void> {
  try {
    if (!(await payablesOn(org.organizationId))) return;
    await createBillFromPo(org, purchaseOrderId);
  } catch {
    // The order is received either way; Accounts can press "Create bill" from its list.
  }
}

export type Unbilled = { id: string; poNumber: string; supplier: string; total: number; issueDate: string | null };

/** Received orders that have no open bill yet (received before supplier bills were switched on, or whose bill was set aside). */
export async function listUnbilled(organizationId: string): Promise<Unbilled[]> {
  const [pos, billed] = await Promise.all([
    db.select().from(purchasingPurchaseOrders).where(and(eq(purchasingPurchaseOrders.organizationId, organizationId), eq(purchasingPurchaseOrders.status, "RECEIVED"))).orderBy(desc(purchasingPurchaseOrders.seq)),
    db.select({ po: supplierBills.purchaseOrderId }).from(supplierBills).where(and(eq(supplierBills.organizationId, organizationId), ne(supplierBills.status, "VOID"))),
  ]);
  const have = new Set(billed.map((b) => b.po).filter(Boolean));
  return pos.filter((p) => !have.has(p.id)).map((p) => ({ id: p.id, poNumber: p.poNumber, supplier: p.supplierName || "Unnamed supplier", total: round2(p.total), issueDate: p.issueDate ?? null }));
}

// ---- reading ---------------------------------------------------------------------------------------------------

export async function listBills(organizationId: string): Promise<Bill[]> {
  return db.select().from(supplierBills).where(eq(supplierBills.organizationId, organizationId)).orderBy(asc(supplierBills.dueDate), asc(supplierBills.seq));
}

export type BillDetail = {
  bill: Bill;
  payments: BillPayment[];
  files: BillFile[];
  notices: BillNotice[];
  lines: { position: number; ndc: string | null; name: string; partNumber: string | null; quantity: number; unit: string | null; unitCost: number; total: number }[];
  poStatus: string | null;
};

export async function getBill(organizationId: string, id: string): Promise<BillDetail | null> {
  const [bill] = await db.select().from(supplierBills).where(and(eq(supplierBills.id, id), eq(supplierBills.organizationId, organizationId))).limit(1);
  if (!bill) return null;
  const [payments, files, notices, po] = await Promise.all([
    db.select().from(supplierBillPayments).where(and(eq(supplierBillPayments.organizationId, organizationId), eq(supplierBillPayments.billId, id))).orderBy(asc(supplierBillPayments.paidOn), asc(supplierBillPayments.createdAt)),
    db.select().from(supplierBillFiles).where(and(eq(supplierBillFiles.organizationId, organizationId), eq(supplierBillFiles.billId, id))).orderBy(asc(supplierBillFiles.createdAt)),
    db.select().from(supplierBillNotices).where(and(eq(supplierBillNotices.organizationId, organizationId), eq(supplierBillNotices.billId, id))),
    bill.purchaseOrderId
      ? db.select({ status: purchasingPurchaseOrders.status }).from(purchasingPurchaseOrders).where(and(eq(purchasingPurchaseOrders.id, bill.purchaseOrderId), eq(purchasingPurchaseOrders.organizationId, organizationId))).limit(1)
      : Promise.resolve([]),
  ]);
  const lines = bill.purchaseOrderId
    ? (
        await db
          .select()
          .from(purchasingPurchaseOrderLines)
          .where(and(eq(purchasingPurchaseOrderLines.purchaseOrderId, bill.purchaseOrderId), eq(purchasingPurchaseOrderLines.organizationId, organizationId)))
          .orderBy(asc(purchasingPurchaseOrderLines.position))
      ).map((l) => ({ position: l.position, ndc: l.ndc ?? null, name: l.name, partNumber: l.partNumber ?? null, quantity: l.quantity, unit: l.unit ?? null, unitCost: l.unitCost, total: l.total }))
    : [];
  return { bill, payments, files, notices, lines, poStatus: po[0]?.status ?? null };
}

/** The numbers for the page's tiles, the group headings and the sidebar badge. */
export async function payablesSummary(organizationId: string) {
  const [bills, today, paid] = await Promise.all([listBills(organizationId), todayFor(organizationId), recentBillPayments(organizationId, 30)]);
  const rows = bills.map((b) => ({ id: b.id, supplier: b.supplierName, dueDate: b.dueDate, total: b.total, amountPaid: b.amountPaid, status: b.status }));
  return { ...oweSummary(rows, today), today, paid30: round2(paid.reduce((n, p) => n + p.amount, 0)), suppliers: supplierTotals(rows, today), attention: attentionCount(rows, today) };
}

export async function attentionBadge(organizationId: string): Promise<number> {
  const [bills, today] = await Promise.all([listBills(organizationId), todayFor(organizationId)]);
  return attentionCount(bills.map((b) => ({ id: b.id, supplier: b.supplierName, dueDate: b.dueDate, total: b.total, amountPaid: b.amountPaid, status: b.status })), today);
}

export type PaidRow = { paymentId: string; billId: string; billNumber: string; supplier: string; amount: number; paidOn: string; method: string };

/** Payments recorded in the last `days` days (by the day paid), newest first. */
export async function recentBillPayments(organizationId: string, days = 30): Promise<PaidRow[]> {
  const today = await todayFor(organizationId);
  const since = addDays(today, -days);
  const rows = await db
    .select({ p: supplierBillPayments, number: supplierBills.billNumber, supplier: supplierBills.supplierName })
    .from(supplierBillPayments)
    .innerJoin(supplierBills, eq(supplierBills.id, supplierBillPayments.billId))
    .where(and(eq(supplierBillPayments.organizationId, organizationId), eq(supplierBills.organizationId, organizationId), gte(supplierBillPayments.paidOn, since)))
    .orderBy(desc(supplierBillPayments.paidOn), desc(supplierBillPayments.createdAt));
  return rows.map((r) => ({ paymentId: r.p.id, billId: r.p.billId, billNumber: r.number, supplier: r.supplier, amount: r.p.amount, paidOn: r.p.paidOn, method: r.p.method ?? "" }));
}

// ---- editing, approving, setting aside -------------------------------------------------------------------------

/** The supplier's invoice details. Changing the amount of an approved bill sends it back for approval (nothing paid yet). */
export async function updateBill(org: Org, id: string, input: BillInput & { supplierEmail?: string }): Promise<Result<{ backToApproval: boolean }>> {
  const have = await getBill(org.organizationId, id);
  if (!have) return { ok: false, error: "That bill wasn't found." };
  const b = have.bill;
  if (b.status === "PAID" || b.status === "VOID") return { ok: false, error: b.status === "PAID" ? "This bill is paid in full, so it stays as it is." : "This bill was set aside." };
  const clear: BillInput = {
    supplierInvoiceNumber: clean(input.supplierInvoiceNumber, 80), invoiceDate: clean(input.invoiceDate, 10), dueDate: clean(input.dueDate, 10), total: round2(Number(input.total)), note: clean(input.note, 1000),
  };
  const problem = billProblem(clear, b.amountPaid);
  if (problem) return { ok: false, error: problem };
  const changedAmount = Math.abs(clear.total - b.total) > 0.004;
  if (changedAmount && b.amountPaid > 0) return { ok: false, error: "Payments are already recorded, so the amount can't change." };
  const back = changedAmount && b.status === "APPROVED";
  const email = clean(input.supplierEmail ?? b.supplierEmail ?? "", 200);
  const now = new Date().toISOString();
  await db
    .update(supplierBills)
    .set({
      supplierInvoiceNumber: clear.supplierInvoiceNumber || null, invoiceDate: clear.invoiceDate || null, dueDate: clear.dueDate || null, total: clear.total, note: clear.note || null,
      supplierEmail: email || null, ...(back ? { status: "PENDING" as const, approvedByUserId: null, approvedByName: null, approvedAt: null } : {}), updatedAt: now,
    })
    .where(and(eq(supplierBills.id, id), eq(supplierBills.organizationId, org.organizationId)));
  return { ok: true, backToApproval: back };
}

/** Approves a bill that is waiting. The conditional update means two people pressing Approve at once approve it once. */
export async function approveBill(org: Org, id: string): Promise<Result> {
  const have = await getBill(org.organizationId, id);
  if (!have) return { ok: false, error: "That bill wasn't found." };
  const problem = approveProblem(have.bill.status);
  if (problem) return { ok: false, error: problem };
  const now = new Date().toISOString();
  const rows = await db
    .update(supplierBills)
    .set({ status: "APPROVED", approvedByUserId: org.userId, approvedByName: await nameOf(org.userId), approvedAt: now, updatedAt: now })
    .where(and(eq(supplierBills.id, id), eq(supplierBills.organizationId, org.organizationId), eq(supplierBills.status, "PENDING")))
    .returning({ id: supplierBills.id });
  return rows.length ? { ok: true } : { ok: false, error: "This bill was already handled." };
}

/** Sets a bill aside (kept for the record, never deleted). Only before any payment is recorded. */
export async function voidBill(org: Org, id: string, reason: string): Promise<Result> {
  const have = await getBill(org.organizationId, id);
  if (!have) return { ok: false, error: "That bill wasn't found." };
  const problem = voidProblem(have.bill);
  if (problem) return { ok: false, error: problem };
  const now = new Date().toISOString();
  const rows = await db
    .update(supplierBills)
    .set({ status: "VOID", voidReason: clean(reason, 300) || null, voidedAt: now, updatedAt: now })
    .where(and(eq(supplierBills.id, id), eq(supplierBills.organizationId, org.organizationId), inArray(supplierBills.status, ["PENDING", "APPROVED"]), eq(supplierBills.amountPaid, 0)))
    .returning({ id: supplierBills.id });
  return rows.length ? { ok: true } : { ok: false, error: "This bill can't be set aside now." };
}

// ---- recording a payment ---------------------------------------------------------------------------------------

/**
 * Records that the bill was paid (all or part). The balance check and the new total are ONE conditional update, so two people recording
 * the same payment at once cannot pay more than is owed. The payment row is written after; if that fails the update is undone.
 */
export async function recordBillPayment(
  org: Org,
  id: string,
  p: { amount: number; paidOn: string; method?: string; reference?: string; note?: string },
): Promise<Result<{ status: string; paymentId: string }>> {
  const have = await getBill(org.organizationId, id);
  if (!have) return { ok: false, error: "That bill wasn't found." };
  const amount = round2(Number(p.amount));
  const problem = payProblem(have.bill, { amount, paidOn: String(p.paidOn ?? "") });
  if (problem) return { ok: false, error: problem };
  const now = new Date().toISOString();
  const rows = await db
    .update(supplierBills)
    .set({
      amountPaid: sql`round(${supplierBills.amountPaid} + ${amount}, 2)`,
      status: sql`case when round(${supplierBills.total} - ${supplierBills.amountPaid} - ${amount}, 2) <= 0 then 'PAID' else 'PARTIALLY_PAID' end`,
      updatedAt: now,
    })
    .where(
      and(
        eq(supplierBills.id, id),
        eq(supplierBills.organizationId, org.organizationId),
        inArray(supplierBills.status, ["APPROVED", "PARTIALLY_PAID"]),
        sql`round(${supplierBills.total} - ${supplierBills.amountPaid}, 2) >= ${amount - 0.004}`,
      ),
    )
    .returning({ status: supplierBills.status });
  if (!rows.length) return { ok: false, error: "The balance changed while you were recording this. Reload the bill and check what is still owed." };
  const paymentId = newId("bpay");
  try {
    await db.insert(supplierBillPayments).values({
      id: paymentId, organizationId: org.organizationId, billId: id, amount, paidOn: String(p.paidOn), method: clean(p.method, 60) || null, reference: clean(p.reference, 80) || null,
      note: clean(p.note, 300) || null, recordedByUserId: org.userId, recordedByName: await nameOf(org.userId),
    });
  } catch {
    const back = await getBill(org.organizationId, id);
    const paid = round2((back?.payments ?? []).reduce((n, x) => n + x.amount, 0));
    await db.update(supplierBills).set({ amountPaid: paid, status: paid <= 0 ? "APPROVED" : paid >= have.bill.total ? "PAID" : "PARTIALLY_PAID" }).where(and(eq(supplierBills.id, id), eq(supplierBills.organizationId, org.organizationId)));
    return { ok: false, error: "The payment couldn't be saved. Nothing was recorded." };
  }
  return { ok: true, status: rows[0].status, paymentId };
}

// ---- the supplier's invoice (photo or PDF) ---------------------------------------------------------------------

export async function addBillFile(org: Org, billId: string, input: { kind: string; filename: string; bytes: Uint8Array }): Promise<Result<{ id: string }>> {
  const have = await getBill(org.organizationId, billId);
  if (!have) return { ok: false, error: "That bill wasn't found." };
  if (have.bill.status === "VOID") return { ok: false, error: "This bill was set aside, so files can't be added." };
  if (!storage.configured()) return { ok: false, error: STORAGE_NOT_CONNECTED };
  if (input.bytes.length === 0) return { ok: false, error: "Choose a photo or PDF to add." };
  if (input.bytes.length > MAX_BILL_FILE_BYTES) return { ok: false, error: "That file is over 4 MB. Choose a smaller one." };
  const type = sniffReceiptType(input.bytes);
  if (!type) return { ok: false, error: "Add a photo (JPG, PNG, WebP or GIF) or a PDF." };
  if (have.files.length >= MAX_BILL_FILES) return { ok: false, error: `A bill can have up to ${MAX_BILL_FILES} files.` };
  const kind = input.kind === "PROOF" || input.kind === "OTHER" ? input.kind : "INVOICE";
  const id = newId("bfile");
  let filename = safeFilename(input.filename || `file.${type.ext}`);
  if (!/\.[A-Za-z0-9]{2,4}$/.test(filename)) filename = `${filename}.${type.ext}`;
  const storagePath = `payables/${org.organizationId}/${billId}/${id}.${type.ext}`;
  try {
    await storage.save(storagePath, input.bytes, type.mime);
  } catch {
    return { ok: false, error: "The file couldn't be saved to storage. Try again." };
  }
  await db.insert(supplierBillFiles).values({ id, organizationId: org.organizationId, billId, kind, filename, contentType: type.mime, sizeBytes: input.bytes.length, storagePath, uploadedByUserId: org.userId });
  return { ok: true, id };
}

export async function removeBillFile(org: Org, fileId: string): Promise<Result> {
  const [f] = await db.select().from(supplierBillFiles).where(and(eq(supplierBillFiles.id, fileId), eq(supplierBillFiles.organizationId, org.organizationId))).limit(1);
  if (!f) return { ok: false, error: "That file wasn't found." };
  await db.delete(supplierBillFiles).where(and(eq(supplierBillFiles.id, fileId), eq(supplierBillFiles.organizationId, org.organizationId)));
  try {
    await storage.remove(f.storagePath);
  } catch {
    // The row is gone; a leftover file is harmless and is cleaned when the company is removed.
  }
  return { ok: true };
}

/** For the download route: the file row, company-checked. */
export async function getBillFileForOrg(organizationId: string, fileId: string): Promise<BillFile | null> {
  const [f] = await db.select().from(supplierBillFiles).where(and(eq(supplierBillFiles.id, fileId), eq(supplierBillFiles.organizationId, organizationId))).limit(1);
  return f ?? null;
}

// ---- telling the supplier we paid ------------------------------------------------------------------------------

export type NoticeItem = {
  paymentId: string;
  billId: string;
  billNumber: string;
  supplier: string;
  contact: string | null;
  email: string;
  /** The supplier's invoice number when typed, otherwise our purchase order number, otherwise the bill number. */
  reference: string;
  poNumber: string | null;
  amount: number;
  paidOn: string;
  method: string | null;
  paymentReference: string | null;
  balanceAfter: number;
  recordedDay: string;
  billVoid: boolean;
};

/** The payments of one bill as notice items, with the balance left after each. */
export async function noticeItemsFor(organizationId: string, billId: string): Promise<NoticeItem[]> {
  const detail = await getBill(organizationId, billId);
  if (!detail) return [];
  const terms = await getPaymentTerms(organizationId);
  const b = detail.bill;
  let running = 0;
  return detail.payments.map((p) => {
    running = round2(running + p.amount);
    return {
      paymentId: p.id, billId: b.id, billNumber: b.billNumber, supplier: b.supplierName, contact: b.supplierContact, email: b.supplierEmail ?? "",
      reference: b.supplierInvoiceNumber?.trim() || b.poNumber || b.billNumber, poNumber: b.poNumber, amount: p.amount, paidOn: p.paidOn, method: p.method, paymentReference: p.reference,
      balanceAfter: Math.max(0, round2(b.total - running)), recordedDay: dayInZone(p.createdAt, terms.timeZone) || p.paidOn, billVoid: b.status === "VOID",
    };
  });
}

/** The exact email as it will go (the same words the preview shows). */
export function composeSupplierNotice(item: NoticeItem, from: string, note: string | null) {
  return supplierNoticeEmail({
    contact: item.contact, reference: item.reference, poNumber: item.poNumber, amount: item.amount, paidOn: item.paidOn, method: item.method, paymentReference: item.paymentReference, balance: item.balanceAfter, note, from,
  });
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const textToHtml = (t: string) => `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1a1d21">${esc(t).replace(/\n/g, "<br>")}</div>`;

export type SupplierSend = (args: { to: string; subject: string; text: string; html: string; fromName: string }) => Promise<{ ok: true } | { ok: false; error: string }>;

const defaultSend = (org: Org, paymentId: string): SupplierSend => async (a) => {
  const r = await sendDeptEmail(org.organizationId, { dept: "accounts", relatedKind: "supplier_bill_notice", relatedId: paymentId, by: { userId: org.userId, name: null } }, a);
  return r.ok ? { ok: true } : { ok: false, error: r.error };
};

async function itemFor(organizationId: string, billId: string, paymentId: string): Promise<{ item: NoticeItem; handled: BillNotice | null } | null> {
  const [items, [handled]] = await Promise.all([
    noticeItemsFor(organizationId, billId),
    db.select().from(supplierBillNotices).where(and(eq(supplierBillNotices.organizationId, organizationId), eq(supplierBillNotices.paymentId, paymentId))).limit(1),
  ]);
  const item = items.find((i) => i.paymentId === paymentId);
  return item ? { item, handled: handled ?? null } : null;
}

/** Whether a payment is still in the window where Accounts is asked to email the supplier about it. */
export async function noticeWindowOpen(organizationId: string, recordedDay: string): Promise<boolean> {
  return inSupplierNoticeWindow(recordedDay, await todayFor(organizationId));
}

/** Who the email is from (the company's name) for the preview. */
export async function fromNameFor(organizationId: string): Promise<string> {
  return (await resolveFrom(organizationId)).name;
}

/**
 * Emails the supplier that a payment was made. The payment is claimed first (one row per payment, unique), so two people pressing Send at
 * once cannot email twice; if the email is refused the claim is removed and nothing is recorded as sent.
 */
export async function sendSupplierNotice(org: Org, billId: string, paymentId: string, opts: { to: string; note?: string | null }, send?: SupplierSend): Promise<Result<{ to: string }>> {
  const found = await itemFor(org.organizationId, billId, paymentId);
  if (!found) return { ok: false, error: "That payment wasn't found." };
  const to = (opts.to ?? "").trim();
  const ready = supplierNoticeReadiness({ to, handled: !!found.handled, billVoid: found.item.billVoid });
  if (!ready.ready) return { ok: false, error: ready.blockers[0] };
  const from = await fromNameFor(org.organizationId);
  const note = (opts.note ?? "").trim().slice(0, 1000) || null;
  const mail = composeSupplierNotice(found.item, from, note);
  const rowId = newId("bnot");
  try {
    await db.insert(supplierBillNotices).values({
      id: rowId, organizationId: org.organizationId, paymentId, billId, status: "SENT", billNumber: found.item.billNumber, supplierName: found.item.supplier, amount: found.item.amount, paidOn: found.item.paidOn,
      toEmail: to, subject: mail.subject, body: mail.text, note, handledByUserId: org.userId, handledByName: await nameOf(org.userId), handledAt: new Date().toISOString(),
    });
  } catch {
    return { ok: false, error: "This payment was already handled." };
  }
  let result: { ok: true } | { ok: false; error: string };
  try {
    result = await (send ?? defaultSend(org, paymentId))({ to, subject: mail.subject, text: mail.text, html: textToHtml(mail.text), fromName: from });
  } catch (e) {
    result = { ok: false, error: e instanceof Error ? e.message : "The email couldn't be sent." };
  }
  if (!result.ok) {
    await db.delete(supplierBillNotices).where(and(eq(supplierBillNotices.id, rowId), eq(supplierBillNotices.organizationId, org.organizationId)));
    return { ok: false, error: `The email wasn't sent, so nothing was recorded. ${result.error}`.trim() };
  }
  return { ok: true, to };
}

/** "No email needed": keeps who decided and when. */
export async function skipSupplierNotice(org: Org, billId: string, paymentId: string, reason?: string | null): Promise<Result> {
  const found = await itemFor(org.organizationId, billId, paymentId);
  if (!found) return { ok: false, error: "That payment wasn't found." };
  if (found.handled) return { ok: false, error: "This payment was already handled." };
  try {
    await db.insert(supplierBillNotices).values({
      id: newId("bnot"), organizationId: org.organizationId, paymentId, billId, status: "SKIPPED", billNumber: found.item.billNumber, supplierName: found.item.supplier, amount: found.item.amount,
      paidOn: found.item.paidOn, note: clean(reason, 300) || null, handledByUserId: org.userId, handledByName: await nameOf(org.userId), handledAt: new Date().toISOString(),
    });
  } catch {
    return { ok: false, error: "This payment was already handled." };
  }
  return { ok: true };
}

export { isOpen, billBalance };
