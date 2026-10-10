"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { sendPaymentNoticeAction, skipPaymentNoticeAction } from "@/app/actions/receivables";
import { composeClientPreview } from "./preview";
import { field, ghostBtn, primaryBtn } from "@/components/sales-ui";

type Item = { invoiceNumber: string; buyer: string; contact: string | null; amount: number; paidOn: string; balanceAfter: number };

/** The email as it will go (fixed wording, one editable note), the address to send it to, Send, and "No email needed". The server checks everything again. */
export function NoticeForm({ paymentId, item, from, email, canSend }: { paymentId: string; item: Item; from: string; email: string; canSend: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [to, setTo] = useState(email);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const mail = composeClientPreview(item, from, note);
  const run = (fn: () => ReturnType<typeof sendPaymentNoticeAction>) => {
    setMsg(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) return setMsg({ ok: false, text: r.error });
      setMsg({ ok: true, text: r.message ?? "Done." });
      router.refresh();
    });
  };
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900" data-testid="notice-preview">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">The email the customer will get</p>
        <p className="mt-2 text-sm"><span className="text-slate-500">Subject: </span><span data-testid="notice-subject">{mail.subject}</span></p>
        <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-slate-800 dark:text-slate-200" data-testid="notice-body">{mail.text}</pre>
      </div>
      {canSend && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="pn-to" className="text-xs font-medium text-slate-700 dark:text-slate-300">Send to</label>
              <input id="pn-to" value={to} onChange={(e) => setTo(e.target.value)} placeholder="customer@company.com" className={`${field} mt-1`} data-testid="pn-to" />
            </div>
            <div>
              <label htmlFor="pn-note" className="text-xs font-medium text-slate-700 dark:text-slate-300">A note to the customer (optional)</label>
              <input id="pn-note" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} className={`${field} mt-1`} data-testid="pn-note" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" disabled={pending} className={primaryBtn} onClick={() => run(() => sendPaymentNoticeAction(paymentId, to, note))} data-testid="pn-send">{pending ? "Sending…" : "Send the email"}</button>
            <span className="text-xs text-slate-500">Nothing is sent until you press Send.</span>
          </div>
          <div className="flex flex-wrap items-end gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
            <div className="min-w-60 flex-1">
              <label htmlFor="pn-reason" className="text-xs font-medium text-slate-700 dark:text-slate-300">No email needed? Why (optional)</label>
              <input id="pn-reason" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="For example: told them by phone" className={`${field} mt-1`} data-testid="pn-reason" />
            </div>
            <button type="button" disabled={pending} className={ghostBtn} onClick={() => run(() => skipPaymentNoticeAction(paymentId, reason))} data-testid="pn-skip">Set aside, no email</button>
          </div>
        </>
      )}
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-emerald-800 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`} data-testid={msg.ok ? "pn-ok" : "pn-error"}>{msg.text}</p>}
    </div>
  );
}
