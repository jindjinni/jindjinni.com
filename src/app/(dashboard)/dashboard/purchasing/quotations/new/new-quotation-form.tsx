"use client";

import { useActionState, useState } from "react";
import { createPurchasingQuotation } from "@/app/actions/purchasing";
import { AddressAutocompleteFields } from "@/components/address-autocomplete-fields";

type ActionState = { error?: string } | undefined;

const inputClass =
  "rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800";

type Customer = { id: string; firstName: string; lastName: string | null };

export function NewQuotationForm({
  customers,
  preselectedCustomerId,
}: {
  customers: Customer[];
  preselectedCustomerId?: string;
}) {
  const [mode, setMode] = useState<"existing" | "new">(preselectedCustomerId ? "existing" : "new");
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createPurchasingQuotation, undefined);

  return (
    <form action={formAction} className="mt-6 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Customer</h2>
      {customers.length > 0 && (
        <div className="mt-2 flex gap-4 text-sm">
          <label className="flex items-center gap-1.5">
            <input type="radio" name="mode" checked={mode === "new"} onChange={() => setMode("new")} />
            New customer
          </label>
          <label className="flex items-center gap-1.5">
            <input type="radio" name="mode" checked={mode === "existing"} onChange={() => setMode("existing")} />
            Existing customer
          </label>
        </div>
      )}

      {mode === "existing" ? (
        <label className="mt-3 flex flex-col gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-400">Choose customer</span>
          <select name="customerId" required defaultValue={preselectedCustomerId ?? ""} className={`min-w-[14rem] ${inputClass}`}>
            <option value="" disabled>
              Choose a customer
            </option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {[c.firstName, c.lastName].filter(Boolean).join(" ")}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600 dark:text-slate-400">First name</span>
            <input name="newCustomerFirstName" required className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600 dark:text-slate-400">Last name</span>
            <input name="newCustomerLastName" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600 dark:text-slate-400">Email</span>
            <input name="newCustomerEmail" type="email" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600 dark:text-slate-400">Phone</span>
            <input name="newCustomerPhone" className={inputClass} />
          </label>
          <AddressAutocompleteFields prefix="newCustomerAddress" />
          <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2 dark:text-slate-300">
            <input type="checkbox" name="newCustomerIsResidential" defaultChecked /> Residential address
          </label>
        </div>
      )}

      <label className="mt-4 flex flex-col gap-1 text-sm">
        <span className="text-slate-600 dark:text-slate-400">Quotation date</span>
        <input
          name="quotationDate"
          type="date"
          defaultValue={new Date().toISOString().slice(0, 10)}
          className={`w-48 ${inputClass}`}
        />
      </label>

      <p className="mt-3 text-xs text-slate-400">
        You&rsquo;ll add products, condition, expiry, and quantity on the next step.
      </p>

      <button
        type="submit"
        disabled={pending}
        className="mt-4 rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
      >
        {pending ? "Starting..." : "Start quotation"}
      </button>
      {state?.error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{state.error}</p>}
    </form>
  );
}
