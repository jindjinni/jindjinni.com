"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveBuyerAction } from "@/app/actions/sales";
import { TERMS_OPTIONS } from "@/lib/sales-rules";
import { card, field, primaryBtn } from "@/components/sales-ui";

export type BuyerFormValues = {
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  billingAddress: string;
  shippingAddress: string;
  paymentTerms: string;
  taxInfo: string;
  taxExempt: boolean;
  defaultNotes: string;
  active: boolean;
};

export const EMPTY_BUYER: BuyerFormValues = { companyName: "", contactName: "", email: "", phone: "", billingAddress: "", shippingAddress: "", paymentTerms: "", taxInfo: "", taxExempt: false, defaultNotes: "", active: true };

export function BuyerForm({ id, initial, readOnly }: { id: string | null; initial: BuyerFormValues; readOnly?: boolean }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = <K extends keyof BuyerFormValues>(k: K, val: BuyerFormValues[K]) => setV((p) => ({ ...p, [k]: val }));

  function save() {
    setMsg(null);
    start(async () => {
      const res = await saveBuyerAction(id, v);
      if (!res.ok) return setMsg({ ok: false, text: res.error });
      if (!id && res.id) router.push(`/dashboard/sales/buyers/${res.id}`);
      else {
        setMsg({ ok: true, text: res.message ?? "Saved." });
        router.refresh();
      }
    });
  }

  const f = (label: string, key: keyof BuyerFormValues, opts: { testid: string; multi?: boolean; placeholder?: string; wide?: boolean }) => (
    <div className={opts.wide ? "sm:col-span-2" : ""}>
      <label htmlFor={opts.testid} className="text-xs font-medium text-slate-700 dark:text-slate-300">{label}</label>
      {opts.multi ? (
        <textarea id={opts.testid} rows={3} value={v[key] as string} disabled={readOnly} onChange={(e) => set(key, e.target.value as never)} className={`${field} mt-1`} placeholder={opts.placeholder} data-testid={opts.testid} />
      ) : (
        <input id={opts.testid} value={v[key] as string} disabled={readOnly} onChange={(e) => set(key, e.target.value as never)} className={`${field} mt-1`} placeholder={opts.placeholder} data-testid={opts.testid} />
      )}
    </div>
  );

  return (
    <div className={`${card} space-y-4`}>
      <div className="grid gap-3 sm:grid-cols-2">
        {f("Company name", "companyName", { testid: "by-company", wide: true })}
        {f("Contact person", "contactName", { testid: "by-contact" })}
        {f("Email (invoices are sent here)", "email", { testid: "by-email" })}
        {f("Phone", "phone", { testid: "by-phone" })}
        <div>
          <label htmlFor="by-terms" className="text-xs font-medium text-slate-700 dark:text-slate-300">Payment terms</label>
          <select id="by-terms" value={v.paymentTerms} disabled={readOnly} onChange={(e) => set("paymentTerms", e.target.value)} className={`${field} mt-1`} data-testid="by-terms">
            <option value="">Use my usual terms</option>
            {TERMS_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        {f("Billing address", "billingAddress", { testid: "by-billing", multi: true })}
        {f("Shipping address (blank = same as billing)", "shippingAddress", { testid: "by-shipping", multi: true })}
        {f("Tax information (resale certificate or ID)", "taxInfo", { testid: "by-tax" })}
        <label htmlFor="by-exempt" className="flex items-center gap-2 self-end pb-2 text-sm text-slate-800 dark:text-slate-100">
          <input id="by-exempt" type="checkbox" checked={v.taxExempt} disabled={readOnly} onChange={(e) => set("taxExempt", e.target.checked)} data-testid="by-exempt" /> Tax exempt
        </label>
        {f("Notes that go on this buyer's invoices", "defaultNotes", { testid: "by-notes", multi: true, wide: true })}
      </div>
      <label htmlFor="by-active" className="flex items-center gap-2 text-sm text-slate-800 dark:text-slate-100">
        <input id="by-active" type="checkbox" checked={v.active} disabled={readOnly} onChange={(e) => set("active", e.target.checked)} data-testid="by-active" /> Active (inactive buyers are hidden when you make an invoice)
      </label>
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={save} disabled={pending} className={primaryBtn} data-testid="by-save">{pending ? "Saving…" : id ? "Save buyer" : "Add buyer"}</button>
          {msg && <span className={`text-sm ${msg.ok ? "text-emerald-800 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`} data-testid={msg.ok ? "by-message" : "by-error"}>{msg.text}</span>}
        </div>
      )}
    </div>
  );
}
