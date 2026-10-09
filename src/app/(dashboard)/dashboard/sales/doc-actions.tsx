"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { convertToInvoiceAction, deleteDraftAction, duplicateDocumentAction, quotationStatusAction, recordPaymentAction, removePaymentAction, sendDocumentAction, voidDocumentAction, type SalesResult } from "@/app/actions/sales";
import { card, field, fmtDay, fmtMoney, ghostBtn, primaryBtn } from "@/components/sales-ui";

export type ActionDoc = { id: string; kind: "QUOTATION" | "INVOICE" | "PURCHASE_ORDER"; status: string; number: string; buyerEmail: string; total: number; amountPaid: number; convertedToId: string | null; inventoryPosted: boolean; emailedTo: string | null; sentAt: string | null };
export type ActionPayment = { id: string; amount: number; paidOn: string; method: string; note: string };

export function DocActions({ doc, payments, today, canWrite, canRevise = false, base }: { doc: ActionDoc; payments: ActionPayment[]; today: string; canWrite: boolean; canRevise?: boolean; base: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [email, setEmail] = useState(doc.buyerEmail);
  const [message, setMessage] = useState("");
  const [pay, setPay] = useState({ amount: String(Math.max(0, Math.round((doc.total - doc.amountPaid) * 100) / 100)), paidOn: today, method: "", note: "" });
  const isInvoice = doc.kind === "INVOICE";
  const isPo = doc.kind === "PURCHASE_ORDER";
  const word = isInvoice ? "invoice" : isPo ? "purchase order" : "quotation";
  const isDraft = doc.status === "DRAFT";
  const owed = Math.max(0, Math.round((doc.total - doc.amountPaid) * 100) / 100);

  const run = (fn: () => Promise<SalesResult>, then?: (r: Extract<SalesResult, { ok: true }>) => void) => {
    setMsg(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) return setMsg({ ok: false, text: r.error });
      setMsg({ ok: true, text: r.message ?? "Done." });
      if (then) then(r);
      else router.refresh();
    });
  };

  return (
    <div className="space-y-4" data-testid="doc-actions">
      <div className="flex flex-wrap items-center gap-2">
        <a href={`/api/sales/documents/${doc.id}/pdf`} target="_blank" rel="noreferrer" className={ghostBtn} data-testid="act-pdf">View PDF</a>
        <a href={`/api/sales/documents/${doc.id}/pdf?download=1`} className={ghostBtn} data-testid="act-pdf-download">Download PDF</a>
        {canWrite && !isDraft && doc.status !== "VOID" && (
          <button type="button" disabled={pending} onClick={() => run(() => duplicateDocumentAction(doc.id), (r) => router.push(`${base}/${r.id}`))} className={ghostBtn} data-testid="act-duplicate">Make a copy</button>
        )}
        {canWrite && isDraft && (
          <button type="button" disabled={pending} onClick={() => { if (confirm("Delete this draft?")) run(() => deleteDraftAction(doc.id), () => router.push(base === "/dashboard/sales/quotations" ? "/dashboard/sales" : base)); }} className="rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40" data-testid="act-delete">Delete draft</button>
        )}
        {canWrite && !isDraft && doc.status !== "VOID" && !(!isInvoice && doc.status === "CONVERTED") && (
          <button type="button" disabled={pending} onClick={() => { if (confirm(isInvoice && doc.inventoryPosted ? "Void this invoice? Its units go back into Inventory." : "Void this document?")) run(() => voidDocumentAction(doc.id)); }} className="rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40" data-testid="act-void">Void</button>
        )}
      </div>

      {/* Quotation or purchase order: turn it into an invoice, record the answer, or send a revision */}
      {canWrite && !isInvoice && (doc.status === "SENT" || doc.status === "ACCEPTED" || doc.status === "DECLINED") && (
        <div className={`${card} flex flex-wrap items-center gap-2`} data-testid="act-quotation-box">
          <button type="button" disabled={pending} onClick={() => run(() => convertToInvoiceAction(doc.id), (r) => router.push(`/dashboard/sales/invoices/${r.id}`))} className={primaryBtn} data-testid="act-convert">Make this an invoice</button>
          {doc.status !== "ACCEPTED" && <button type="button" disabled={pending} onClick={() => run(() => quotationStatusAction(doc.id, "ACCEPTED"))} className={ghostBtn} data-testid="act-accepted">{isPo ? "We confirmed it" : "Buyer accepted"}</button>}
          {doc.status !== "DECLINED" && <button type="button" disabled={pending} onClick={() => run(() => quotationStatusAction(doc.id, "DECLINED"))} className={ghostBtn} data-testid="act-declined">{isPo ? "We can't fill it" : "Buyer declined"}</button>}
          {canRevise && doc.status !== "DECLINED" && <Link href={`${base}/${doc.id}?revise=1`} className={ghostBtn} data-testid="act-revise">Send a revision</Link>}
          <p className="basis-full text-xs text-slate-500">Making it an invoice starts a draft with the same items. The draft holds the units; sending it takes them out of Inventory. A revision goes out with a Rev number and your note on what changed.</p>
        </div>
      )}
      {!isInvoice && doc.status === "CONVERTED" && doc.convertedToId && (
        <p className={`${card} text-sm`} data-testid="act-converted">This {word} became an invoice. <Link href={`/dashboard/sales/invoices/${doc.convertedToId}`} className="font-medium text-emerald-800 underline dark:text-emerald-300">Open the invoice</Link></p>
      )}

      {/* Send: a draft invoice or quotation, or a sent quotation again */}
      {canWrite && (isDraft || (!isInvoice && doc.status === "SENT")) && (
        <div className={`${card} space-y-3`} data-testid="act-send-box">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">{isDraft ? `Send this ${word}` : "Send it again"}</h2>
          {isDraft && isInvoice && <p className="text-xs text-slate-600 dark:text-slate-400">Sending takes the units out of Inventory, earliest expiration first. It sends what you last saved.</p>}
          {isDraft && !isInvoice && <p className="text-xs text-slate-600 dark:text-slate-400">A {word} doesn&apos;t touch Inventory. It sends what you last saved.</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="act-email" className="text-xs font-medium text-slate-700 dark:text-slate-300">Send to</label>
              <input id="act-email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="buyer@company.com" className={`${field} mt-1`} data-testid="act-email" />
            </div>
            <div>
              <label htmlFor="act-message" className="text-xs font-medium text-slate-700 dark:text-slate-300">Message (optional)</label>
              <input id="act-message" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Leave blank for the usual short note" className={`${field} mt-1`} data-testid="act-message" />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={pending} onClick={() => run(() => sendDocumentAction(doc.id, { email: true, to: email, message }))} className={primaryBtn} data-testid="act-send-email">{pending ? "Sending…" : "Email the PDF to the buyer"}</button>
            {isDraft && <button type="button" disabled={pending} onClick={() => run(() => sendDocumentAction(doc.id, { email: false }))} className={ghostBtn} data-testid="act-mark-sent">Mark as sent (I sent it myself)</button>}
          </div>
        </div>
      )}

      {/* Payments */}
      {isInvoice && !isDraft && doc.status !== "VOID" && (
        <div className={`${card} space-y-3`} data-testid="act-payments">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Payments</h2>
            <p className="text-sm tabular-nums text-slate-600 dark:text-slate-300">Paid {fmtMoney(doc.amountPaid)} of {fmtMoney(doc.total)}{owed > 0 ? <strong className="ml-2 text-slate-900 dark:text-slate-50" data-testid="act-owed">{fmtMoney(owed)} owed</strong> : <strong className="ml-2 text-green-700 dark:text-green-300" data-testid="act-paid-full">Paid in full</strong>}</p>
          </div>
          {payments.length > 0 && (
            <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800" data-testid="act-payment-list">
              {payments.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-3 py-1.5" data-testid="act-payment">
                  <span className="tabular-nums font-medium">{fmtMoney(p.amount)}</span>
                  <span className="text-slate-500">{fmtDay(p.paidOn)}{p.method ? ` · ${p.method}` : ""}{p.note ? ` · ${p.note}` : ""}</span>
                  {canWrite && <button type="button" disabled={pending} onClick={() => { if (confirm("Remove this payment?")) run(() => removePaymentAction(p.id)); }} className="ml-auto text-xs text-red-700 underline dark:text-red-300" data-testid="act-payment-remove">Remove</button>}
                </li>
              ))}
            </ul>
          )}
          {canWrite && owed > 0 && (
            <div className="grid gap-3 sm:grid-cols-5">
              <div>
                <label htmlFor="pay-amount" className="text-xs font-medium text-slate-700 dark:text-slate-300">Amount ($)</label>
                <input id="pay-amount" inputMode="decimal" value={pay.amount} onChange={(e) => setPay((p) => ({ ...p, amount: e.target.value.replace(/[^\d.]/g, "") }))} className={`${field} mt-1`} data-testid="pay-amount" />
              </div>
              <div>
                <label htmlFor="pay-date" className="text-xs font-medium text-slate-700 dark:text-slate-300">Paid on</label>
                <input id="pay-date" type="date" value={pay.paidOn} onChange={(e) => setPay((p) => ({ ...p, paidOn: e.target.value }))} className={`${field} mt-1`} data-testid="pay-date" />
              </div>
              <div>
                <label htmlFor="pay-method" className="text-xs font-medium text-slate-700 dark:text-slate-300">How</label>
                <input id="pay-method" value={pay.method} onChange={(e) => setPay((p) => ({ ...p, method: e.target.value }))} placeholder="Wire, check…" className={`${field} mt-1`} data-testid="pay-method" />
              </div>
              <div>
                <label htmlFor="pay-note" className="text-xs font-medium text-slate-700 dark:text-slate-300">Note</label>
                <input id="pay-note" value={pay.note} onChange={(e) => setPay((p) => ({ ...p, note: e.target.value }))} className={`${field} mt-1`} data-testid="pay-note" />
              </div>
              <div className="self-end">
                <button type="button" disabled={pending} onClick={() => run(() => recordPaymentAction(doc.id, { amount: Number(pay.amount), paidOn: pay.paidOn, method: pay.method, note: pay.note }), () => { setPay((p) => ({ ...p, amount: "", method: "", note: "" })); router.refresh(); })} className={primaryBtn} data-testid="pay-save">Record payment</button>
              </div>
            </div>
          )}
        </div>
      )}

      {msg && <p className={`text-sm ${msg.ok ? "text-emerald-800 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`} data-testid={msg.ok ? "act-message-ok" : "act-error"}>{msg.text}</p>}
    </div>
  );
}
