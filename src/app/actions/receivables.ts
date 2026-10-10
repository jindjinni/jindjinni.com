"use server";

import { revalidatePath } from "next/cache";
import { requireOrg, type CurrentOrg } from "@/lib/tenant";
import { canSendCustomerEmails, canWritePayment } from "@/lib/permissions";
import { recordPayment } from "@/lib/sales-service";
import { receivablesOn, sendPaymentNotice, skipPaymentNotice } from "@/lib/receivable-service";
import { paymentProblem } from "@/lib/receivable-rules";
import { getDocument } from "@/lib/sales-service";
import { logActivity } from "@/lib/hr-service";

export type RecvResult = { ok: true; message?: string } | { ok: false; error: string };

const OFF = "Money coming in isn't turned on for your company yet.";
const LOOK_ONLY = "You are looking at this company's account, so nothing can be changed.";

const refresh = () => {
  revalidatePath("/dashboard/accounts", "layout");
  revalidatePath("/dashboard/customer-service", "layout");
  revalidatePath("/dashboard/sales", "layout");
};

/** Accounts records money that came in on a sent invoice. The same arithmetic as in Sales (`recordPayment`), plus the rollout and role checks. */
export async function recordCollectionAction(invoiceId: string, p: { amount: number; paidOn: string; method?: string; note?: string }): Promise<RecvResult> {
  const org = await requireOrg();
  if (org.viewAs) return { ok: false, error: LOOK_ONLY };
  if (!(await receivablesOn(org.organizationId))) return { ok: false, error: OFF };
  if (!canWritePayment(org.role, org.access)) return { ok: false, error: "Only the accountant, an Admin or the Owner can record a payment." };
  const have = await getDocument(org.organizationId, String(invoiceId ?? ""));
  if (!have || have.doc.kind !== "INVOICE") return { ok: false, error: "That invoice wasn't found." };
  const problem = paymentProblem(have.doc, { amount: Number(p?.amount), paidOn: String(p?.paidOn ?? "") });
  if (problem) return { ok: false, error: problem };
  const res = await recordPayment(org, have.doc.id, { amount: Number(p.amount), paidOn: String(p.paidOn), method: p.method, note: p.note });
  if (!res.ok) return res;
  await logActivity(org, "PAYMENT_RECORDED", `Recorded a $${Number(p.amount).toFixed(2)} payment on invoice ${have.doc.number}`, { type: "sales_document", id: have.doc.id });
  refresh();
  return { ok: true, message: res.status === "PAID" ? "Paid in full. Customer Service will see it under Payments Received." : "Payment recorded. Customer Service will see it under Payments Received." };
}

async function csWriter(): Promise<{ org: CurrentOrg } | { error: string }> {
  const org = await requireOrg();
  if (org.viewAs) return { error: LOOK_ONLY };
  if (!(await receivablesOn(org.organizationId))) return { error: OFF };
  if (!canSendCustomerEmails(org.role, org.access)) return { error: "Only Customer Service, an Admin or the Owner can email customers." };
  return { org };
}

/** Customer Service emails the customer that their payment arrived. Nothing is sent by itself: this runs only when a person presses Send. */
export async function sendPaymentNoticeAction(paymentId: string, to: string, note: string): Promise<RecvResult> {
  const w = await csWriter();
  if ("error" in w) return { ok: false, error: w.error };
  const res = await sendPaymentNotice(w.org, String(paymentId ?? ""), { to: String(to ?? ""), note: String(note ?? "") });
  if (!res.ok) return res;
  refresh();
  return { ok: true, message: `Sent to ${res.to}.` };
}

/** "No email needed": takes the payment off the to-do list and keeps who decided. */
export async function skipPaymentNoticeAction(paymentId: string, reason: string): Promise<RecvResult> {
  const w = await csWriter();
  if ("error" in w) return { ok: false, error: w.error };
  const res = await skipPaymentNotice(w.org, String(paymentId ?? ""), String(reason ?? ""));
  if (!res.ok) return res;
  refresh();
  return { ok: true, message: "Set aside. No email was sent." };
}
