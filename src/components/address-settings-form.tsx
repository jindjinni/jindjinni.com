"use client";

import { useActionState } from "react";

type ActionState = { error?: string; success?: boolean } | undefined;
export type AddressValues = {
  name: string | null; company: string | null; street1: string | null; street2: string | null; city: string | null; state: string | null; zip: string | null; country: string | null; phone: string | null; email: string | null;
};

const inputClass = "rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800";

/**
 * One address form used for both of the company's addresses. `prefix` is the start of the field names:
 * "shipFrom" (the Shipping department, where we are the sender) or "receive" (Purchasing, where we are the receiver).
 */
export function AddressSettingsForm({
  prefix, action, values, testId, extra,
}: {
  prefix: "shipFrom" | "receive";
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  values: AddressValues | null;
  testId?: string;
  extra?: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const n = (f: string) => `${prefix}${f}`;
  return (
    <form action={formAction} className="mt-6 flex max-w-2xl flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900" data-testid={testId}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-400">Contact name *</span>
          <input name={n("Name")} defaultValue={values?.name ?? ""} required className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-400">Company (optional)</span>
          <input name={n("Company")} defaultValue={values?.company ?? ""} className={inputClass} />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-600 dark:text-slate-400">Street address *</span>
        <input name={n("Street1")} defaultValue={values?.street1 ?? ""} required className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-600 dark:text-slate-400">Apt / suite (optional)</span>
        <input name={n("Street2")} defaultValue={values?.street2 ?? ""} className={inputClass} />
      </label>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="text-slate-600 dark:text-slate-400">City *</span>
          <input name={n("City")} defaultValue={values?.city ?? ""} required className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-400">State *</span>
          <input name={n("State")} defaultValue={values?.state ?? ""} required maxLength={2} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-400">ZIP *</span>
          <input name={n("Zip")} defaultValue={values?.zip ?? ""} required className={inputClass} />
        </label>
      </div>
      <input type="hidden" name={n("Country")} value={values?.country || "US"} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-400">Phone * <span className="text-xs text-slate-400">(USPS requires this to print a label)</span></span>
          <input name={n("Phone")} defaultValue={values?.phone ?? ""} required className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-400">Email * <span className="text-xs text-slate-400">(USPS requires this too)</span></span>
          <input type="email" name={n("Email")} defaultValue={values?.email ?? ""} required className={inputClass} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60" data-testid={testId ? `${testId}-save` : undefined}>
          {pending ? "Saving..." : "Save"}
        </button>
        {state?.success && <span className="text-sm text-emerald-700 dark:text-emerald-400" role="status">Saved ✓</span>}
        {state?.error && <span className="text-sm text-red-600 dark:text-red-400" role="alert">{state.error}</span>}
      </div>
      {extra}
    </form>
  );
}
