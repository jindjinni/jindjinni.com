"use client";

import { useActionState, useState, useTransition } from "react";
import { removeQuotationLogo, saveQuotationProfile, uploadQuotationLogo, type QuotationProfileState } from "@/app/actions/quotation-profile";

const field = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900";
const card = "rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900";

export function QuotationProfileForm({
  initial,
  ownLogo,
  fallbackName,
  fallbackLogo,
}: {
  initial: { displayName: string; showLogo: boolean };
  ownLogo: string | null;
  fallbackName: string;
  fallbackLogo: string | null;
}) {
  const [name, setName] = useState(initial.displayName);
  const [showLogo, setShowLogo] = useState(initial.showLogo);
  const [saveState, saveAction, saving] = useActionState<QuotationProfileState, FormData>(saveQuotationProfile, undefined);
  const [upState, upAction, uploading] = useActionState<QuotationProfileState, FormData>(uploadQuotationLogo, undefined);
  const [removing, startRemove] = useTransition();
  const [removeMsg, setRemoveMsg] = useState<string | null>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);

  const shownLogo = localPreview ?? ownLogo ?? fallbackLogo;
  const shownName = name.trim() || fallbackName;

  return (
    <div className="mt-5 space-y-4">
      <div className={card} data-testid="qp-preview">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">How the top of a quotation will look</p>
        <div className="mt-3 flex flex-col items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white py-6 text-center dark:border-slate-700 dark:bg-slate-950">
          {showLogo && shownLogo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shownLogo} alt="" className="h-14 object-contain" data-testid="qp-preview-logo" />
          )}
          <p className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50" data-testid="qp-preview-name">{shownName}</p>
        </div>
      </div>

      <form action={saveAction} className={`${card} space-y-3`}>
        <div>
          <label htmlFor="qp-name" className="text-sm font-medium text-slate-900 dark:text-slate-50">Company name on quotations</label>
          <input id="qp-name" name="displayName" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className={`${field} mt-1`} placeholder={fallbackName} data-testid="qp-name" />
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Leave it blank to use the Business Profile name ({fallbackName}).</p>
        </div>
        <label htmlFor="qp-show" className="flex items-center gap-2 text-sm text-slate-800 dark:text-slate-100">
          <input id="qp-show" name="showLogo" type="checkbox" checked={showLogo} onChange={(e) => setShowLogo(e.target.checked)} data-testid="qp-show-logo" />
          Show the logo on quotations
        </label>
        <div className="flex items-center gap-3">
          <button type="submit" disabled={saving} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60" data-testid="qp-save">
            {saving ? "Saving…" : "Save"}
          </button>
          {saveState?.message && <span className="text-sm text-emerald-800 dark:text-emerald-300" data-testid="qp-message">{saveState.message}</span>}
          {saveState?.error && <span className="text-sm text-red-700 dark:text-red-300" data-testid="qp-error">{saveState.error}</span>}
        </div>
      </form>

      <div className={`${card} space-y-3`}>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
            {localPreview ?? ownLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={(localPreview ?? ownLogo) as string} alt="Quotation logo" className="h-full w-full object-contain" data-testid="qp-own-logo" />
            ) : (
              <span className="px-2 text-center text-[10px] text-slate-500" data-testid="qp-no-own-logo">{fallbackLogo ? "Using the Business Profile logo" : "No logo"}</span>
            )}
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-50">Quotation logo</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">PNG or JPG, up to 2MB. Without one, the Business Profile logo is used.</p>
            <form
              action={upAction}
              onSubmit={(e) => {
                const f = (e.currentTarget.elements.namedItem("logo") as HTMLInputElement | null)?.files?.[0];
                if (f) setLocalPreview(URL.createObjectURL(f));
              }}
              className="flex flex-wrap items-center gap-2"
            >
              <label htmlFor="qp-logo" className="sr-only">Choose a logo file</label>
              <input id="qp-logo" name="logo" type="file" accept="image/png,image/jpeg" required className="text-xs text-slate-600 dark:text-slate-400" data-testid="qp-file" />
              <button type="submit" disabled={uploading} className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-60 dark:bg-slate-50 dark:text-slate-900" data-testid="qp-upload">
                {uploading ? "Uploading…" : ownLogo ? "Replace logo" : "Upload logo"}
              </button>
            </form>
            {ownLogo && (
              <button
                type="button"
                disabled={removing}
                onClick={() => startRemove(async () => { const r = await removeQuotationLogo(); setLocalPreview(null); setRemoveMsg(r?.error ?? r?.message ?? null); })}
                className="text-xs text-red-700 hover:underline disabled:opacity-60 dark:text-red-300"
                data-testid="qp-remove"
              >
                {removing ? "Removing…" : "Remove logo"}
              </button>
            )}
            {upState?.message && <p className="text-xs text-emerald-800 dark:text-emerald-300" data-testid="qp-up-message">{upState.message}</p>}
            {upState?.error && <p className="text-xs text-red-700 dark:text-red-300" data-testid="qp-up-error">{upState.error}</p>}
            {removeMsg && <p className="text-xs text-slate-600 dark:text-slate-300" data-testid="qp-remove-message">{removeMsg}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
