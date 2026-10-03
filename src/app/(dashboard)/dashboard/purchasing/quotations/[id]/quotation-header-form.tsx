"use client";

import { useActionState, useState } from "react";
import { updatePurchasingQuotationHeader } from "@/app/actions/purchasing";

type ActionState = { error?: string } | undefined;

const inputClass =
  "rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800";

export function QuotationHeaderForm({
  quotationId,
  quotationDate,
  trackingNumber,
  carrier,
  packageStatus,
  notes,
}: {
  quotationId: string;
  quotationDate: string;
  trackingNumber: string | null;
  carrier: string | null;
  packageStatus: string;
  notes: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    updatePurchasingQuotationHeader.bind(null, quotationId),
    undefined,
  );

  if (!editing) {
    return (
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        {new Date(quotationDate).toLocaleDateString()} · {packageStatus}
        {trackingNumber ? ` · Tracking ${trackingNumber}` : ""}{" "}
        <button type="button" onClick={() => setEditing(true)} className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
          Edit
        </button>
      </p>
    );
  }

  return (
    <form
      action={(formData) => {
        formAction(formData);
        setEditing(false);
      }}
      className="mt-2 flex flex-wrap items-end gap-3 rounded-lg border border-dashed border-slate-300 p-3 dark:border-slate-700"
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-600 dark:text-slate-400">Quotation date</span>
        <input name="quotationDate" type="date" defaultValue={quotationDate.slice(0, 10)} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-600 dark:text-slate-400">Tracking number</span>
        <input name="trackingNumber" defaultValue={trackingNumber ?? ""} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-600 dark:text-slate-400">Carrier</span>
        <select name="carrier" defaultValue={carrier ?? ""} className={inputClass}>
          <option value="">—</option>
          <option value="UPS">UPS</option>
          <option value="USPS">USPS</option>
          <option value="FedEx">FedEx</option>
          <option value="Other">Other</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-600 dark:text-slate-400">Package status</span>
        <select name="packageStatus" defaultValue={packageStatus} className={inputClass}>
          {["Pre-Transit", "In Transit", "Out for Delivery", "Delivered", "Exception", "Returned", "Unknown"].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-600 dark:text-slate-400">Notes</span>
        <input name="notes" defaultValue={notes ?? ""} className={inputClass} />
      </label>
      <button type="submit" disabled={pending} className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60 dark:bg-slate-50 dark:text-slate-900 dark:hover:bg-slate-200">
        {pending ? "Saving..." : "Save"}
      </button>
      <button type="button" onClick={() => setEditing(false)} className="text-sm text-slate-500 hover:underline dark:text-slate-400">
        Cancel
      </button>
      {state?.error && <p className="w-full text-sm text-red-600 dark:text-red-400">{state.error}</p>}
    </form>
  );
}
