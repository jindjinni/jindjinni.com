"use client";

import { useActionState } from "react";
import { createPurchasingCustomer } from "@/app/actions/purchasing";

const inputClass =
  "rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800";

export function AddCustomerForm() {
  const [state, action, pending] = useActionState(createPurchasingCustomer, undefined);

  return (
    <form action={action} className="mt-6 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Add customer</h2>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-400">First name</span>
          <input name="firstName" required className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-400">Last name</span>
          <input name="lastName" className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-400">Email</span>
          <input name="email" type="email" className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-400">Phone</span>
          <input name="phone" className={inputClass} />
        </label>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="mt-4 rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
      >
        {pending ? "Adding..." : "Add customer"}
      </button>
      {state?.error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{state.error}</p>}
    </form>
  );
}
