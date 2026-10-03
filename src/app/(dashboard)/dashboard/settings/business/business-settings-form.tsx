"use client";

import { useActionState } from "react";

type ActionState = { error?: string; success?: boolean } | undefined;
type Org = {
  shipFromName: string | null;
  shipFromCompany: string | null;
  shipFromStreet1: string | null;
  shipFromStreet2: string | null;
  shipFromCity: string | null;
  shipFromState: string | null;
  shipFromZip: string | null;
  shipFromCountry: string;
  shipFromPhone: string | null;
  shipFromEmail: string | null;
};

const inputClass =
  "rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800";

export function BusinessSettingsForm({
  action,
  org,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  org: Org | undefined;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form
      action={formAction}
      className="mt-6 flex max-w-2xl flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-400">Sender name *</span>
          <input name="shipFromName" defaultValue={org?.shipFromName ?? ""} required className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-400">Company (optional)</span>
          <input name="shipFromCompany" defaultValue={org?.shipFromCompany ?? ""} className={inputClass} />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-600 dark:text-slate-400">Street address *</span>
        <input name="shipFromStreet1" defaultValue={org?.shipFromStreet1 ?? ""} required className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-600 dark:text-slate-400">Apt / suite (optional)</span>
        <input name="shipFromStreet2" defaultValue={org?.shipFromStreet2 ?? ""} className={inputClass} />
      </label>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="text-slate-600 dark:text-slate-400">City *</span>
          <input name="shipFromCity" defaultValue={org?.shipFromCity ?? ""} required className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-400">State *</span>
          <input name="shipFromState" defaultValue={org?.shipFromState ?? ""} required maxLength={2} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-400">ZIP *</span>
          <input name="shipFromZip" defaultValue={org?.shipFromZip ?? ""} required className={inputClass} />
        </label>
      </div>

      <input type="hidden" name="shipFromCountry" value={org?.shipFromCountry ?? "US"} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-400">
            Phone * <span className="text-xs text-slate-400">(USPS requires this to print a label)</span>
          </span>
          <input name="shipFromPhone" defaultValue={org?.shipFromPhone ?? ""} required className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-400">
            Email * <span className="text-xs text-slate-400">(USPS requires this too)</span>
          </span>
          <input type="email" name="shipFromEmail" defaultValue={org?.shipFromEmail ?? ""} required className={inputClass} />
        </label>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
        >
          {pending ? "Saving..." : "Save"}
        </button>
        {state?.success && <span className="text-sm text-emerald-700 dark:text-emerald-400">Saved ✓</span>}
        {state?.error && <span className="text-sm text-red-600 dark:text-red-400">{state.error}</span>}
      </div>
    </form>
  );
}
