"use server";

import { revalidatePath } from "next/cache";
import { requireOrg, type CurrentOrg } from "@/lib/tenant";
import { canWritePurchasing } from "@/lib/permissions";
import { logActivity } from "@/lib/hr-service";
import { sendOrgEmail } from "@/lib/email-connector";
import { getPaymentTerms } from "@/lib/accounts-queries";
import { todayIn } from "@/lib/payment-due";
import {
  deleteDraft,
  duplicatePurchaseOrder,
  getPurchaseOrder,
  purchaseOrdersEnabled,
  revisePurchaseOrder,
  savePurchaseOrder,
  saveSupplier,
  sendPurchaseOrder,
  setStatus,
  setSupplierArchived,
  type Mailer,
  type PoInput,
  type SupplierInput,
} from "@/lib/purchase-order-service";
import { PO_STATUS_LABEL, isPoStatus } from "@/lib/purchase-order-rules";

export type PoResult = { ok: true; id?: string; message?: string } | { ok: false; error: string };

// Every action: signed in, a role that can change Purchasing, the "purchase-orders" feature switched on for this company,
// and not merely "viewing as" the company. The company always comes from the session, never from the request.
async function writer(): Promise<{ org: CurrentOrg } | { error: string }> {
  const org = await requireOrg();
  if (org.viewAs) return { error: "You are only viewing this company, so nothing was changed." };
  if (!canWritePurchasing(org.role, org.access)) return { error: "Your role can look at Purchasing but can't change it." };
  if (!(await purchaseOrdersEnabled(org.organizationId))) return { error: "Purchase orders aren't turned on for your company yet." };
  return { org };
}

const refresh = () => revalidatePath("/dashboard/purchasing", "layout");

export async function savePurchaseOrderAction(input: PoInput): Promise<PoResult> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error };
  const res = await savePurchaseOrder(w.org, { ...input, lines: Array.isArray(input?.lines) ? input.lines : [] });
  if (!res.ok) return res;
  refresh();
  return { ok: true, id: res.id, message: `Saved ${res.number}.` };
}

export async function duplicatePurchaseOrderAction(id: string): Promise<PoResult> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error };
  const terms = await getPaymentTerms(w.org.organizationId).catch(() => null);
  const res = await duplicatePurchaseOrder(w.org, id, todayIn(terms?.timeZone ?? "America/New_York"));
  if (!res.ok) return res;
  refresh();
  return { ok: true, id: res.id, message: `Made a copy as ${res.number}.` };
}

export async function deleteDraftAction(id: string): Promise<PoResult> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error };
  const res = await deleteDraft(w.org, id);
  if (!res.ok) return res;
  refresh();
  return { ok: true, message: "Deleted." };
}

export async function setStatusAction(id: string, to: string): Promise<PoResult> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error };
  const res = await setStatus(w.org, id, to);
  if (!res.ok) return res;
  const have = await getPurchaseOrder(w.org.organizationId, id);
  if (have && isPoStatus(to)) await logActivity(w.org, "OTHER", `Purchase order ${have.po.poNumber} to ${have.po.supplierName}: ${PO_STATUS_LABEL[to]}`, { type: "purchase_order", id });
  refresh();
  return { ok: true, message: `Now: ${PO_STATUS_LABEL[res.status]}.` };
}

const mailer: (org: CurrentOrg) => Mailer = (org) => async (a) => {
  const r = await sendOrgEmail(org.organizationId, { to: a.to, subject: a.subject, text: a.text, html: a.html, fromName: a.fromName, replyTo: a.replyTo, attachments: [{ filename: a.fileName, content: Buffer.from(a.pdf) }] });
  return r.ok ? { ok: true } : { ok: false, error: r.error };
};

/** Emails the order (written out in the email, PDF attached) or just marks it sent. */
export async function sendPurchaseOrderAction(id: string, opts: { email: boolean; to?: string; message?: string }): Promise<PoResult> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error };
  const res = await sendPurchaseOrder(w.org, id, { mailer: opts?.email ? mailer(w.org) : null, to: opts?.to ? String(opts.to).slice(0, 160) : null, message: opts?.message ? String(opts.message).slice(0, 2000) : null });
  if (!res.ok) return res;
  const have = await getPurchaseOrder(w.org.organizationId, id);
  if (have) await logActivity(w.org, "OTHER", `Sent purchase order ${have.po.poNumber} to ${have.po.supplierName}`, { type: "purchase_order", id });
  refresh();
  return { ok: true, message: res.emailedTo ? `Sent to ${res.emailedTo}.` : "Marked as sent." };
}

/** Sends a revision of an order the supplier already has: a required note, optionally with the items changed, by email and PDF. */
export async function revisePurchaseOrderAction(id: string, opts: { note: string; edits?: PoInput | null; email: boolean; to?: string; message?: string }): Promise<PoResult> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error };
  const res = await revisePurchaseOrder(w.org, id, {
    note: opts?.note,
    edits: opts?.edits ?? null,
    mailer: opts?.email ? mailer(w.org) : null,
    to: opts?.to ? String(opts.to).slice(0, 160) : null,
    message: opts?.message ? String(opts.message).slice(0, 2000) : null,
  });
  if (!res.ok) return res;
  const have = await getPurchaseOrder(w.org.organizationId, id);
  if (have) await logActivity(w.org, "OTHER", `Sent revision ${res.revision} of purchase order ${have.po.poNumber} to ${have.po.supplierName}`, { type: "purchase_order", id });
  refresh();
  return { ok: true, id, message: res.emailedTo ? `Revision ${res.revision} sent to ${res.emailedTo}.` : `Revision ${res.revision} saved.` };
}

export async function saveSupplierAction(input: SupplierInput): Promise<PoResult> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error };
  const res = await saveSupplier(w.org, input);
  if (!res.ok) return res;
  refresh();
  return { ok: true, id: res.id, message: "Saved." };
}

export async function setSupplierArchivedAction(id: string, archived: boolean): Promise<PoResult> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error };
  const res = await setSupplierArchived(w.org, id, !!archived);
  if (!res.ok) return res;
  refresh();
  return { ok: true, message: archived ? "Archived." : "Restored." };
}
