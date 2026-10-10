"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  approveBillAction, recordBillPaymentAction, removeBillFileAction, saveBillAction, sendSupplierNoticeAction, skipSupplierNoticeAction, uploadBillFileAction, voidBillAction,
  type BillResult,
} from "@/app/actions/payables";
import { supplierNoticeEmail } from "@/lib/payable-rules";
import { field, fmtMoney, ghostBtn, primaryBtn } from "@/components/sales-ui";

const lbl = "text-xs font-medium text-slate-700 dark:text-slate-300";

function Msg({ m, id }: { m: { ok: boolean; text: string } | null; id: string }) {
  if (!m) return null;
  return <p role={m.ok ? "status" : "alert"} className={`text-sm ${m.ok ? "text-emerald-800 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`} data-testid={`${id}-${m.ok ? "ok" : "error"}`}>{m.text}</p>;
}

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (fn: () => Promise<BillResult>, after?: () => void) => {
    setMsg(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) return setMsg({ ok: false, text: r.error });
      setMsg({ ok: true, text: r.message ?? "Done." });
      after?.();
      router.refresh();
    });
  };
  return { pending, msg, run };
}

/** The supplier's invoice details. The server checks everything again. */
export function BillDetailsForm({ billId, initial, canEdit, locked }: { billId: string; initial: { supplierInvoiceNumber: string; invoiceDate: string; dueDate: string; total: string; note: string; supplierEmail: string }; canEdit: boolean; locked: boolean }) {
  const { pending, msg, run } = useRun();
  const [f, setF] = useState(initial);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  const off = !canEdit;
  return (
    <form
      className="space-y-3"
      data-testid="bill-details"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => saveBillAction(billId, { ...f, total: Number(f.total) }));
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="bd-inv" className={lbl}>Supplier&apos;s invoice number</label>
          <input id="bd-inv" value={f.supplierInvoiceNumber} disabled={off} onChange={(e) => set("supplierInvoiceNumber", e.target.value)} className={`${field} mt-1`} data-testid="bd-invoice" />
        </div>
        <div>
          <label htmlFor="bd-date" className={lbl}>Invoice date</label>
          <input id="bd-date" type="date" value={f.invoiceDate} disabled={off} onChange={(e) => set("invoiceDate", e.target.value)} className={`${field} mt-1`} data-testid="bd-date" />
        </div>
        <div>
          <label htmlFor="bd-due" className={lbl}>Due date</label>
          <input id="bd-due" type="date" value={f.dueDate} disabled={off} onChange={(e) => set("dueDate", e.target.value)} className={`${field} mt-1`} data-testid="bd-due" />
        </div>
        <div>
          <label htmlFor="bd-total" className={lbl}>Amount on the invoice ($)</label>
          <input id="bd-total" inputMode="decimal" value={f.total} disabled={off || locked} onChange={(e) => set("total", e.target.value.replace(/[^\d.]/g, ""))} className={`${field} mt-1`} data-testid="bd-total" />
          {locked && <p className="mt-1 text-xs text-slate-500">Payments are recorded, so the amount can&apos;t change.</p>}
        </div>
        <div>
          <label htmlFor="bd-email" className={lbl}>Supplier&apos;s email</label>
          <input id="bd-email" value={f.supplierEmail} disabled={off} onChange={(e) => set("supplierEmail", e.target.value)} className={`${field} mt-1`} data-testid="bd-email" />
        </div>
        <div>
          <label htmlFor="bd-note" className={lbl}>Note (for us only)</label>
          <input id="bd-note" value={f.note} disabled={off} maxLength={1000} onChange={(e) => set("note", e.target.value)} className={`${field} mt-1`} data-testid="bd-note" />
        </div>
      </div>
      {canEdit && <button className={ghostBtn} disabled={pending} data-testid="bd-save">{pending ? "Saving…" : "Save details"}</button>}
      <Msg m={msg} id="bd" />
    </form>
  );
}

export function ApproveBar({ billId, canApprove, canVoid }: { billId: string; canApprove: boolean; canVoid: boolean }) {
  const { pending, msg, run } = useRun();
  const [reason, setReason] = useState("");
  return (
    <div className="space-y-3" data-testid="bill-approve-bar">
      {canApprove && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={pending} className={primaryBtn} onClick={() => run(() => approveBillAction(billId))} data-testid="bill-approve">{pending ? "Working…" : "Approve for payment"}</button>
          <span className="text-xs text-slate-500">Check the amount against the supplier&apos;s invoice first. A payment can be recorded only after approval.</span>
        </div>
      )}
      {canVoid && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-60 flex-1">
            <label htmlFor="bv-reason" className={lbl}>Not a real bill? Set it aside (reason, optional)</label>
            <input id="bv-reason" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} className={`${field} mt-1`} data-testid="bv-reason" />
          </div>
          <button type="button" disabled={pending} className={ghostBtn} onClick={() => run(() => voidBillAction(billId, reason))} data-testid="bill-void">Set aside</button>
        </div>
      )}
      <Msg m={msg} id="bar" />
    </div>
  );
}

/** Record that the bill was paid. This only writes the record; no money moves from the app. */
export function BillPayForm({ billId, owed, today }: { billId: string; owed: number; today: string }) {
  const { pending, msg, run } = useRun();
  const [f, setF] = useState({ amount: owed.toFixed(2), paidOn: today, method: "", reference: "", note: "" });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  return (
    <form
      className="space-y-3"
      data-testid="bill-pay-form"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => recordBillPaymentAction(billId, { amount: Number(f.amount), paidOn: f.paidOn, method: f.method, reference: f.reference, note: f.note }));
      }}
    >
      <p className="text-sm text-slate-600 dark:text-slate-400">{fmtMoney(owed)} is still owed. Enter what you paid; a smaller amount leaves the bill partly paid. This records the payment only. It does not send money.</p>
      <div className="grid gap-3 sm:grid-cols-5">
        <div>
          <label htmlFor="bp-amount" className={lbl}>Amount ($)</label>
          <input id="bp-amount" inputMode="decimal" value={f.amount} onChange={(e) => set("amount", e.target.value.replace(/[^\d.]/g, ""))} className={`${field} mt-1`} data-testid="bp-amount" />
        </div>
        <div>
          <label htmlFor="bp-date" className={lbl}>Paid on</label>
          <input id="bp-date" type="date" value={f.paidOn} onChange={(e) => set("paidOn", e.target.value)} className={`${field} mt-1`} data-testid="bp-date" />
        </div>
        <div>
          <label htmlFor="bp-method" className={lbl}>How</label>
          <input id="bp-method" value={f.method} onChange={(e) => set("method", e.target.value)} placeholder="ACH, wire, check…" className={`${field} mt-1`} data-testid="bp-method" />
        </div>
        <div>
          <label htmlFor="bp-ref" className={lbl}>Reference</label>
          <input id="bp-ref" value={f.reference} onChange={(e) => set("reference", e.target.value)} placeholder="Check or confirmation no." className={`${field} mt-1`} data-testid="bp-ref" />
        </div>
        <div>
          <label htmlFor="bp-note" className={lbl}>Note</label>
          <input id="bp-note" value={f.note} onChange={(e) => set("note", e.target.value)} className={`${field} mt-1`} data-testid="bp-note" />
        </div>
      </div>
      <button className={primaryBtn} disabled={pending} data-testid="bp-save">{pending ? "Saving…" : "Record payment"}</button>
      <Msg m={msg} id="bp" />
    </form>
  );
}

export type FileRow = { id: string; filename: string; kindLabel: string; sizeKb: number };

/** The supplier's invoice (and any proof of payment) as photos or PDFs, kept privately. */
export function BillFiles({ billId, files, canEdit }: { billId: string; files: FileRow[]; canEdit: boolean }) {
  const { pending, msg, run } = useRun();
  const [kind, setKind] = useState("INVOICE");
  return (
    <div className="space-y-3" data-testid="bill-files">
      {files.length === 0 ? (
        <p className="text-sm text-slate-600 dark:text-slate-400" data-testid="bill-files-empty">No files yet. Add the supplier&apos;s invoice so it is kept with the bill.</p>
      ) : (
        <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
          {files.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center gap-3 py-2" data-testid="bill-file-row">
              <a href={`/api/payables/files/${f.id}`} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-medium underline" data-testid="bill-file-link">{f.filename}</a>
              <span className="text-slate-500">{f.kindLabel} · {f.sizeKb} KB</span>
              {canEdit && <button type="button" disabled={pending} className="text-xs text-red-700 underline dark:text-red-300" onClick={() => run(() => removeBillFileAction(billId, f.id))} data-testid="bill-file-remove">Remove</button>}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <form
          className="flex flex-wrap items-end gap-3"
          data-testid="bill-file-form"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const fd = new FormData(form);
            run(() => uploadBillFileAction(billId, kind, fd), () => form.reset());
          }}
        >
          <div>
            <label htmlFor="bf-kind" className={lbl}>What is it</label>
            <select id="bf-kind" value={kind} onChange={(e) => setKind(e.target.value)} className={`${field} mt-1`} data-testid="bf-kind">
              <option value="INVOICE">Supplier&apos;s invoice</option>
              <option value="PROOF">Proof of payment</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <div>
            <label htmlFor="bf-file" className={lbl}>Photo or PDF (up to 4 MB)</label>
            <input id="bf-file" name="file" type="file" accept="image/*,application/pdf" className={`${field} mt-1`} data-testid="bf-file" />
          </div>
          <button className={ghostBtn} disabled={pending} data-testid="bf-add">{pending ? "Adding…" : "Add file"}</button>
        </form>
      )}
      <Msg m={msg} id="bf" />
    </div>
  );
}

export type NoticeFormItem = { paymentId: string; contact: string | null; reference: string; poNumber: string | null; amount: number; paidOn: string; method: string | null; paymentReference: string | null; balanceAfter: number };

/** The email as it will go (fixed wording, one editable note), the address to send it to, Send, and "No email needed". */
export function SupplierNoticeForm({ billId, item, from, email }: { billId: string; item: NoticeFormItem; from: string; email: string }) {
  const { pending, msg, run } = useRun();
  const [to, setTo] = useState(email);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const mail = supplierNoticeEmail({ ...item, note: note || null, balance: item.balanceAfter, from });
  return (
    <div className="space-y-3" data-testid="sn-form" data-payment={item.paymentId}>
      <div className="rounded-lg border border-slate-200 bg-stone-50 p-3 dark:border-slate-800 dark:bg-slate-950">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">The email the supplier will get</p>
        <p className="mt-2 text-sm"><span className="text-slate-500">Subject: </span><span data-testid="sn-subject">{mail.subject}</span></p>
        <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-slate-800 dark:text-slate-200" data-testid="sn-body">{mail.text}</pre>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`sn-to-${item.paymentId}`} className={lbl}>Send to</label>
          <input id={`sn-to-${item.paymentId}`} value={to} onChange={(e) => setTo(e.target.value)} placeholder="accounts@supplier.com" className={`${field} mt-1`} data-testid="sn-to" />
        </div>
        <div>
          <label htmlFor={`sn-note-${item.paymentId}`} className={lbl}>A note to the supplier (optional)</label>
          <input id={`sn-note-${item.paymentId}`} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} className={`${field} mt-1`} data-testid="sn-note" />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={pending} className={primaryBtn} onClick={() => run(() => sendSupplierNoticeAction(billId, item.paymentId, to, note))} data-testid="sn-send">{pending ? "Sending…" : "Send the email"}</button>
        <span className="text-xs text-slate-500">Nothing is sent until you press Send.</span>
      </div>
      <div className="flex flex-wrap items-end gap-3 border-t border-slate-200 pt-3 dark:border-slate-800">
        <div className="min-w-60 flex-1">
          <label htmlFor={`sn-reason-${item.paymentId}`} className={lbl}>No email needed? Why (optional)</label>
          <input id={`sn-reason-${item.paymentId}`} value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="For example: told them by phone" className={`${field} mt-1`} data-testid="sn-reason" />
        </div>
        <button type="button" disabled={pending} className={ghostBtn} onClick={() => run(() => skipSupplierNoticeAction(billId, item.paymentId, reason))} data-testid="sn-skip">Set aside, no email</button>
      </div>
      <Msg m={msg} id="sn" />
    </div>
  );
}
