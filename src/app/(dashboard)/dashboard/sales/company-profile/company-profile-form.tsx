"use client";

import { useActionState, useState, useTransition } from "react";
import { removeSalesLogo, saveSalesProfile, uploadSalesLogo, type SalesFormState } from "@/app/actions/sales";
import { TERMS_OPTIONS } from "@/lib/sales-rules";
import { card, field, primaryBtn } from "@/components/sales-ui";

type Initial = {
  companyName: string;
  address: string;
  email: string;
  phone: string;
  showLogo: boolean;
  defaultTerms: string;
  defaultNotes: string;
  footerText: string;
  nextInvoiceNumber: number;
  nextQuotationNumber: number;
};

export function CompanyProfileForm({ initial, logo, fallbackName }: { initial: Initial; logo: string | null; fallbackName: string; previewName: string }) {
  const [v, setV] = useState(initial);
  const [saveState, saveAction, saving] = useActionState<SalesFormState, FormData>(saveSalesProfile, undefined);
  const [upState, upAction, uploading] = useActionState<SalesFormState, FormData>(uploadSalesLogo, undefined);
  const [removing, startRemove] = useTransition();
  const [removeMsg, setRemoveMsg] = useState<string | null>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const set = <K extends keyof Initial>(k: K, val: Initial[K]) => setV((p) => ({ ...p, [k]: val }));
  const shownLogo = localPreview ?? logo;
  const shownName = v.companyName.trim() || fallbackName;

  return (
    <div className="mt-5 space-y-4">
      <div className={card} data-testid="sp-preview">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">How the top of an invoice will look</p>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4 rounded-lg border border-dashed border-slate-300 bg-white p-5 dark:border-slate-700 dark:bg-slate-950">
          <div className="space-y-0.5">
            {v.showLogo && shownLogo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shownLogo} alt="" className="mb-2 h-10 object-contain" data-testid="sp-preview-logo" />
            )}
            <p className="text-lg font-bold text-slate-900 dark:text-slate-50" data-testid="sp-preview-name">{shownName}</p>
            {v.address && <p className="whitespace-pre-line text-xs text-slate-500" data-testid="sp-preview-address">{v.address}</p>}
            {v.phone && <p className="text-xs text-slate-500">{v.phone}</p>}
            {v.email && <p className="text-xs text-slate-500">{v.email}</p>}
          </div>
          <div className="text-right">
            <p className="text-[11px] font-bold tracking-wider text-slate-500">INVOICE</p>
            <p className="text-3xl font-bold text-sky-700 dark:text-sky-400" data-testid="sp-preview-number">#{v.nextInvoiceNumber}</p>
            <p className="text-xs text-slate-500">Terms {v.defaultTerms}</p>
          </div>
        </div>
      </div>

      <form action={saveAction} className={`${card} space-y-4`}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="sp-name" className="text-sm font-medium text-slate-900 dark:text-slate-50">Company name on invoices</label>
            <input id="sp-name" name="companyName" value={v.companyName} onChange={(e) => set("companyName", e.target.value)} maxLength={120} placeholder={fallbackName} className={`${field} mt-1`} data-testid="sp-name" />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Leave it blank to use your company name ({fallbackName}).</p>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="sp-address" className="text-sm font-medium text-slate-900 dark:text-slate-50">Address</label>
            <textarea id="sp-address" name="address" rows={2} value={v.address} onChange={(e) => set("address", e.target.value)} maxLength={400} className={`${field} mt-1`} placeholder={"Street\nCity, State ZIP"} data-testid="sp-address" />
          </div>
          <div>
            <label htmlFor="sp-email" className="text-sm font-medium text-slate-900 dark:text-slate-50">Company email</label>
            <input id="sp-email" name="email" type="email" value={v.email} onChange={(e) => set("email", e.target.value)} className={`${field} mt-1`} data-testid="sp-email" />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Prints on the invoice, and buyers&apos; replies go here.</p>
          </div>
          <div>
            <label htmlFor="sp-phone" className="text-sm font-medium text-slate-900 dark:text-slate-50">Phone</label>
            <input id="sp-phone" name="phone" value={v.phone} onChange={(e) => set("phone", e.target.value)} maxLength={40} className={`${field} mt-1`} data-testid="sp-phone" />
          </div>
          <div>
            <label htmlFor="sp-terms" className="text-sm font-medium text-slate-900 dark:text-slate-50">Usual payment terms</label>
            <select id="sp-terms" name="defaultTerms" value={v.defaultTerms} onChange={(e) => set("defaultTerms", e.target.value)} className={`${field} mt-1`} data-testid="sp-terms">
              {TERMS_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Used when a buyer has no terms of its own.</p>
          </div>
          <div>
            <label htmlFor="sp-footer" className="text-sm font-medium text-slate-900 dark:text-slate-50">Line at the bottom of each page</label>
            <input id="sp-footer" name="footerText" value={v.footerText} onChange={(e) => set("footerText", e.target.value)} maxLength={110} className={`${field} mt-1`} placeholder={`Thank you for your business - ${v.companyName.trim() || fallbackName}`} data-testid="sp-footer" />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="sp-notes" className="text-sm font-medium text-slate-900 dark:text-slate-50">Notes printed on every invoice (you can change them on each one)</label>
            <textarea id="sp-notes" name="defaultNotes" rows={2} value={v.defaultNotes} onChange={(e) => set("defaultNotes", e.target.value)} maxLength={1000} className={`${field} mt-1`} placeholder="Thank you for your business." data-testid="sp-notes" />
          </div>
          <div>
            <label htmlFor="sp-next-inv" className="text-sm font-medium text-slate-900 dark:text-slate-50">Next invoice number</label>
            <input id="sp-next-inv" name="nextInvoiceNumber" inputMode="numeric" value={v.nextInvoiceNumber} onChange={(e) => set("nextInvoiceNumber", Number(e.target.value.replace(/[^\d]/g, "")) || 0)} className={`${field} mt-1`} data-testid="sp-next-invoice" />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Set this to carry on from your old numbers. A number already used is skipped.</p>
          </div>
          <div>
            <label htmlFor="sp-next-quo" className="text-sm font-medium text-slate-900 dark:text-slate-50">Next quotation number</label>
            <input id="sp-next-quo" name="nextQuotationNumber" inputMode="numeric" value={v.nextQuotationNumber} onChange={(e) => set("nextQuotationNumber", Number(e.target.value.replace(/[^\d]/g, "")) || 0)} className={`${field} mt-1`} data-testid="sp-next-quotation" />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Quotations are numbered Q-{v.nextQuotationNumber}.</p>
          </div>
        </div>
        <label htmlFor="sp-show" className="flex items-center gap-2 text-sm text-slate-800 dark:text-slate-100">
          <input id="sp-show" name="showLogo" type="checkbox" checked={v.showLogo} onChange={(e) => set("showLogo", e.target.checked)} data-testid="sp-show-logo" />
          Show the logo on quotations and invoices
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={saving} className={primaryBtn} data-testid="sp-save">{saving ? "Saving…" : "Save"}</button>
          {saveState?.message && <span className="text-sm text-emerald-800 dark:text-emerald-300" data-testid="sp-message">{saveState.message}</span>}
          {saveState?.error && <span className="text-sm text-red-700 dark:text-red-300" data-testid="sp-error">{saveState.error}</span>}
        </div>
      </form>

      <div className={`${card} space-y-3`}>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-20 w-28 items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
            {shownLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shownLogo} alt="Company logo" className="h-full w-full object-contain" data-testid="sp-logo" />
            ) : (
              <span className="px-2 text-center text-[10px] text-slate-500" data-testid="sp-no-logo">No logo</span>
            )}
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-50">Logo</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">PNG or JPG, up to 2MB. It prints at the top left of every quotation and invoice.</p>
            <form
              action={upAction}
              onSubmit={(e) => {
                const f = (e.currentTarget.elements.namedItem("logo") as HTMLInputElement | null)?.files?.[0];
                if (f) setLocalPreview(URL.createObjectURL(f));
              }}
              className="flex flex-wrap items-center gap-2"
            >
              <label htmlFor="sp-logo-file" className="sr-only">Choose a logo file</label>
              <input id="sp-logo-file" name="logo" type="file" accept="image/png,image/jpeg" required className="text-xs text-slate-600 dark:text-slate-400" data-testid="sp-file" />
              <button type="submit" disabled={uploading} className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-60 dark:bg-slate-50 dark:text-slate-900" data-testid="sp-upload">
                {uploading ? "Uploading…" : logo ? "Replace logo" : "Upload logo"}
              </button>
            </form>
            {logo && (
              <button type="button" disabled={removing} onClick={() => startRemove(async () => { const r = await removeSalesLogo(); setLocalPreview(null); setRemoveMsg(r?.error ?? r?.message ?? null); })} className="text-xs text-red-700 hover:underline disabled:opacity-60 dark:text-red-300" data-testid="sp-remove">
                {removing ? "Removing…" : "Remove logo"}
              </button>
            )}
            {upState?.message && <p className="text-xs text-emerald-800 dark:text-emerald-300" data-testid="sp-up-message">{upState.message}</p>}
            {upState?.error && <p className="text-xs text-red-700 dark:text-red-300" data-testid="sp-up-error">{upState.error}</p>}
            {removeMsg && <p className="text-xs text-slate-600 dark:text-slate-300" data-testid="sp-remove-message">{removeMsg}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
