"use client";

import { useActionState } from "react";
import { updateShipmentPackaging } from "@/app/actions/buyback";

type Shipment = {
  packagingCondition: "ACCEPTABLE" | "NOT_ACCEPTABLE" | null;
  packagingIssueNotes: string | null;
};

export function PackagingForm({ shipmentId, shipment }: { shipmentId: string; shipment: Shipment }) {
  const action = updateShipmentPackaging.bind(null, shipmentId);
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form
      action={formAction}
      className="mt-2 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-600 dark:text-slate-400">Overall packaging condition</span>
        <select
          name="packagingCondition"
          defaultValue={shipment.packagingCondition ?? ""}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800"
        >
          <option value="">Not assessed yet</option>
          <option value="ACCEPTABLE">Acceptable</option>
          <option value="NOT_ACCEPTABLE">Not acceptable</option>
        </select>
      </label>
      <label className="flex flex-1 min-w-[16rem] flex-col gap-1 text-sm">
        <span className="text-slate-600 dark:text-slate-400">
          Issue notes (required if not acceptable -- up to 50% payout deduction applies)
        </span>
        <input
          name="packagingIssueNotes"
          defaultValue={shipment.packagingIssueNotes ?? ""}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        {pending ? "Saving..." : "Save"}
      </button>
      {state?.error && (
        <p className="w-full text-sm text-red-600 dark:text-red-400">{state.error}</p>
      )}
    </form>
  );
}
