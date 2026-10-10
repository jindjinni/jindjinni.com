"use server";

import { revalidatePath } from "next/cache";
import { requireOrg, type CurrentOrg } from "@/lib/tenant";
import { canWritePayment } from "@/lib/permissions";
import { logActivity } from "@/lib/hr-service";
import {
  addBillFile, approveBill, createBillFromPo, payablesOn, recordBillPayment, removeBillFile, sendSupplierNotice, skipSupplierNotice, updateBill, voidBill, MAX_BILL_FILE_BYTES,
} from "@/lib/payable-service";

export type BillResult = { ok: true; message?: string; id?: string } | { ok: false; error: string };

const OFF = "Supplier bills aren't turned on for your company yet.";
const LOOK_ONLY = "You are looking at this company's account, so nothing can be changed.";
const str = (v: unknown) => String(v ?? "");

const refresh = (id?: string) => {
  revalidatePath("/dashboard/accounts", "layout");
  if (id) revalidatePath(`/dashboard/accounts/bills/${id}`);
};

/** Every write: the person is looking at their own company (not "view as"), the rollout switch is on, and they may work in Accounts. */
async function writer(): Promise<{ org: CurrentOrg } | { error: string }> {
  const org = await requireOrg();
  if (org.viewAs) return { error: LOOK_ONLY };
  if (!(await payablesOn(org.organizationId))) return { error: OFF };
  if (!canWritePayment(org.role, org.access)) return { error: "Only the accountant, an Admin or the Owner can work on supplier bills." };
  return { org };
}

/** "Create bill" for a received purchase order. */
export async function createBillAction(purchaseOrderId: string): Promise<BillResult> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error };
  const res = await createBillFromPo(w.org, str(purchaseOrderId));
  if (!res.ok) return res;
  if (res.created) await logActivity(w.org, "PAYMENT_RECORDED", `Made supplier bill ${res.billNumber}`, { type: "supplier_bill", id: res.id });
  refresh();
  return { ok: true, id: res.id, message: res.created ? `Bill ${res.billNumber} made.` : `Bill ${res.billNumber} already exists.` };
}

export async function saveBillAction(billId: string, f: { supplierInvoiceNumber: string; invoiceDate: string; dueDate: string; total: number; note: string; supplierEmail: string }): Promise<BillResult> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error };
  const res = await updateBill(w.org, str(billId), {
    supplierInvoiceNumber: str(f?.supplierInvoiceNumber), invoiceDate: str(f?.invoiceDate), dueDate: str(f?.dueDate), total: Number(f?.total), note: str(f?.note), supplierEmail: str(f?.supplierEmail),
  });
  if (!res.ok) return res;
  refresh(billId);
  return { ok: true, message: res.backToApproval ? "Saved. The amount changed, so the bill is waiting for approval again." : "Saved." };
}

export async function approveBillAction(billId: string): Promise<BillResult> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error };
  const res = await approveBill(w.org, str(billId));
  if (!res.ok) return res;
  await logActivity(w.org, "PAYMENT_RECORDED", "Approved a supplier bill for payment", { type: "supplier_bill", id: str(billId) });
  refresh(billId);
  return { ok: true, message: "Approved. It is ready to be paid." };
}

export async function voidBillAction(billId: string, reason: string): Promise<BillResult> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error };
  const res = await voidBill(w.org, str(billId), str(reason));
  if (!res.ok) return res;
  refresh(billId);
  return { ok: true, message: "Set aside. The order can get a new bill from the list." };
}

/** Records that the bill was paid. This only writes the record: no money moves from the app. */
export async function recordBillPaymentAction(billId: string, p: { amount: number; paidOn: string; method: string; reference: string; note: string }): Promise<BillResult> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error };
  const res = await recordBillPayment(w.org, str(billId), { amount: Number(p?.amount), paidOn: str(p?.paidOn), method: str(p?.method), reference: str(p?.reference), note: str(p?.note) });
  if (!res.ok) return res;
  await logActivity(w.org, "PAYMENT_RECORDED", `Recorded a $${Number(p.amount).toFixed(2)} payment to a supplier`, { type: "supplier_bill", id: str(billId) });
  refresh(billId);
  return { ok: true, message: res.status === "PAID" ? "Paid in full." : "Payment recorded. The bill is partly paid." };
}

export async function uploadBillFileAction(billId: string, kind: string, formData: FormData): Promise<BillResult> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a photo or PDF to add." };
  if (file.size > MAX_BILL_FILE_BYTES) return { ok: false, error: "That file is over 4 MB. Choose a smaller one." };
  const res = await addBillFile(w.org, str(billId), { kind: str(kind), filename: file.name || "invoice", bytes: new Uint8Array(await file.arrayBuffer()) });
  if (!res.ok) return res;
  refresh(billId);
  return { ok: true, id: res.id, message: "File added." };
}

export async function removeBillFileAction(billId: string, fileId: string): Promise<BillResult> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error };
  const res = await removeBillFile(w.org, str(fileId));
  if (!res.ok) return res;
  refresh(billId);
  return { ok: true, message: "File removed." };
}

/** Emails the supplier that a payment was made. Nothing is sent by itself: this runs only when a person presses Send. */
export async function sendSupplierNoticeAction(billId: string, paymentId: string, to: string, note: string): Promise<BillResult> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error };
  const res = await sendSupplierNotice(w.org, str(billId), str(paymentId), { to: str(to), note: str(note) });
  if (!res.ok) return res;
  refresh(billId);
  return { ok: true, message: `Sent to ${res.to}.` };
}

export async function skipSupplierNoticeAction(billId: string, paymentId: string, reason: string): Promise<BillResult> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error };
  const res = await skipSupplierNotice(w.org, str(billId), str(paymentId), str(reason));
  if (!res.ok) return res;
  refresh(billId);
  return { ok: true, message: "Set aside. No email was sent." };
}
