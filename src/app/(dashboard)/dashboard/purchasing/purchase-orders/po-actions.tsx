"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteDraftAction, duplicatePurchaseOrderAction, sendPurchaseOrderAction, setStatusAction, type PoResult } from "@/app/actions/purchase-orders";
import { PO_STATUS_LABEL, canMoveTo, type PoStatus } from "@/lib/purchase-order-rules";
import { card, field, ghostBtn, primaryBtn } from "@/components/sales-ui";

const dangerBtn = "rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40";

export function PoActions({ id, number, status, supplierEmail, emailedTo, canWrite }: { id: string; number: string; status: PoStatus; supplierEmail: string; emailedTo: string | null; canWrite: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [email, setEmail] = useState(supplierEmail);
  const [message, setMessage] = useState("");
  const isDraft = status === "DRAFT";

  const run = (fn: () => Promise<PoResult>, then?: (r: Extract<PoResult, { ok: true }>) => void) => {
    setMsg(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) return setMsg({ ok: false, text: r.error });
      setMsg({ ok: true, text: r.message ?? "Done." });
      if (then) then(r);
      else router.refresh();
    });
  };
  const step = (to: PoStatus, text: string, testid: string, danger = false) =>
    canWrite && canMoveTo(status, to) ? (
      <button type="button" disabled={pending} onClick={() => { if (!danger || confirm(`Cancel purchase order ${number}?`)) run(() => setStatusAction(id, to)); }} className={danger ? dangerBtn : ghostBtn} data-testid={testid}>{text}</button>
    ) : null;

  return (
    <div className="space-y-4" data-testid="po-actions">
      <div className="flex flex-wrap items-center gap-2">
        <a href={`/api/purchasing/purchase-orders/${id}/pdf`} target="_blank" rel="noreferrer" className={ghostBtn} data-testid="po-act-pdf">View PDF</a>
        <a href={`/api/purchasing/purchase-orders/${id}/pdf?download=1`} className={ghostBtn} data-testid="po-act-pdf-download">Download PDF</a>
        {canWrite && <button type="button" disabled={pending} onClick={() => run(() => duplicatePurchaseOrderAction(id), (r) => router.push(`/dashboard/purchasing/purchase-orders/${r.id}`))} className={ghostBtn} data-testid="po-act-duplicate">Make a copy</button>}
        {step("CONFIRMED", "Supplier confirmed it", "po-act-confirmed")}
        {canWrite && (status === "SENT" || status === "CONFIRMED") && (
          <Link href={`/dashboard/purchasing/purchase-orders/${id}?revise=1`} className={ghostBtn} data-testid="po-act-revise">Send a revision</Link>
        )}
        {step("RECEIVED", "We received it", "po-act-received")}
        {step("DRAFT", "Back to a draft to edit", "po-act-draft")}
        {step("CANCELLED", "Cancel the order", "po-act-cancel", true)}
        {canWrite && isDraft && (
          <button type="button" disabled={pending} onClick={() => { if (confirm("Delete this draft?")) run(() => deleteDraftAction(id), () => router.push("/dashboard/purchasing/purchase-orders")); }} className={dangerBtn} data-testid="po-act-delete">Delete draft</button>
        )}
      </div>

      {canWrite && (isDraft || status === "SENT") && (
        <div className={`${card} space-y-3`} data-testid="po-send-box">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">{isDraft ? "Send this purchase order" : "Send it again"}</h2>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            The supplier gets an email with the order written out (ship-to, bill-to, every item with its NDC, the total and the terms) and the PDF attached. It sends what you last saved.
            {!isDraft && emailedTo ? ` Last sent to ${emailedTo}.` : ""}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="po-act-email" className="text-xs font-medium text-slate-700 dark:text-slate-300">Send to</label>
              <input id="po-act-email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="orders@supplier.com" className={`${field} mt-1`} data-testid="po-act-email" />
            </div>
            <div>
              <label htmlFor="po-act-message" className="text-xs font-medium text-slate-700 dark:text-slate-300">Note above the order (optional)</label>
              <input id="po-act-message" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Leave blank to send the order on its own" className={`${field} mt-1`} data-testid="po-act-message" />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={pending} onClick={() => run(() => sendPurchaseOrderAction(id, { email: true, to: email, message }))} className={primaryBtn} data-testid="po-act-send">{pending ? "Sending…" : "Email it to the supplier"}</button>
            {isDraft && <button type="button" disabled={pending} onClick={() => run(() => sendPurchaseOrderAction(id, { email: false }))} className={ghostBtn} data-testid="po-act-mark-sent">Mark as sent (I sent it myself)</button>}
          </div>
        </div>
      )}
      {msg && <p className={`text-sm ${msg.ok ? "text-emerald-800 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`} data-testid={msg.ok ? "po-act-message-ok" : "po-act-error"} role={msg.ok ? "status" : "alert"}>{msg.text}</p>}
      <p className="text-xs text-slate-500">Status now: <strong>{PO_STATUS_LABEL[status]}</strong></p>
    </div>
  );
}
