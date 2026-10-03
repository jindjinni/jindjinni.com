"use client";

import { useActionState } from "react";
import { createInvoiceDraft } from "@/app/actions/invoices";

type Buyer = { id: string; companyName: string };

export function NewInvoiceForm({ buyers }: { buyers: Buyer[] }) {
  const [state, action, pending] = useActionState(createInvoiceDraft, undefined);

  return (
    <form
      action={action}
      className="mt-6 flex flex-col gap-5 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
    >
      {buyers.length > 0 && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-300">Existing buyer</span>
          <select
            name="existingBuyerId"
            defaultValue=""
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800"
          >
            <option value="">-- choose a buyer, or add a new one below --</option>
            {buyers.map((b) => (
              <option key={b.id} value={b.id}>
                {b.companyName}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="rounded-lg border border-dashed border-slate-300 p-4 dark:border-slate-700">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Or add a new buyer
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600 dark:text-slate-400">Company name</span>
            <input
              name="newBuyerCompanyName"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600 dark:text-slate-400">Contact name</span>
            <input
              name="newBuyerContactName"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-slate-600 dark:text-slate-400">Email</span>
            <input
              name="newBuyerEmail"
              type="email"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800"
            />
          </label>
        </div>
      </div>

      {state?.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
      >
        {pending ? "Creating..." : "Create draft invoice"}
      </button>
    </form>
  );
}
