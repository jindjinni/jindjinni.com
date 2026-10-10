"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { recordCollectionAction } from "@/app/actions/receivables";
import { field, fmtMoney, primaryBtn } from "@/components/sales-ui";

/** Record money that arrived on this invoice. The server checks the amount again, so this form only helps. */
export function CollectPaymentForm({ invoiceId, owed, today }: { invoiceId: string; owed: number; today: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [f, setF] = useState({ amount: owed.toFixed(2), paidOn: today, method: "", note: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  return (
    <form
      className="space-y-3"
      data-testid="collect-form"
      onSubmit={(e) => {
        e.preventDefault();
        setMsg(null);
        start(async () => {
          const r = await recordCollectionAction(invoiceId, { amount: Number(f.amount), paidOn: f.paidOn, method: f.method, note: f.note });
          if (!r.ok) return setMsg({ ok: false, text: r.error });
          setMsg({ ok: true, text: r.message ?? "Recorded." });
          router.refresh();
        });
      }}
    >
      <p className="text-sm text-slate-600 dark:text-slate-400">{fmtMoney(owed)} is still owed. Enter what arrived; a smaller amount leaves the invoice partly paid.</p>
      <div className="grid gap-3 sm:grid-cols-4">
        <div>
          <label htmlFor="cp-amount" className="text-xs font-medium text-slate-700 dark:text-slate-300">Amount ($)</label>
          <input id="cp-amount" inputMode="decimal" value={f.amount} onChange={(e) => set("amount", e.target.value.replace(/[^\d.]/g, ""))} className={`${field} mt-1`} data-testid="cp-amount" />
        </div>
        <div>
          <label htmlFor="cp-date" className="text-xs font-medium text-slate-700 dark:text-slate-300">Received on</label>
          <input id="cp-date" type="date" value={f.paidOn} onChange={(e) => set("paidOn", e.target.value)} className={`${field} mt-1`} data-testid="cp-date" />
        </div>
        <div>
          <label htmlFor="cp-method" className="text-xs font-medium text-slate-700 dark:text-slate-300">How</label>
          <input id="cp-method" value={f.method} onChange={(e) => set("method", e.target.value)} placeholder="ACH, wire, check…" className={`${field} mt-1`} data-testid="cp-method" />
        </div>
        <div>
          <label htmlFor="cp-note" className="text-xs font-medium text-slate-700 dark:text-slate-300">Note</label>
          <input id="cp-note" value={f.note} onChange={(e) => set("note", e.target.value)} className={`${field} mt-1`} data-testid="cp-note" />
        </div>
      </div>
      <button className={primaryBtn} disabled={pending} data-testid="cp-save">{pending ? "Saving…" : "Record payment"}</button>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-emerald-800 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`} data-testid={msg.ok ? "cp-ok" : "cp-error"}>{msg.text}</p>}
    </form>
  );
}
