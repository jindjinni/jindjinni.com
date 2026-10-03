"use client";

import { useActionState } from "react";
import { updatePurchasingCustomer } from "@/app/actions/purchasing";

type ActionState = { error?: string } | undefined;

const inputClass =
  "rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800";

type Customer = {
  firstName: string;
  lastName: string | null;
  customerReferenceNumber: string | null;
  email: string | null;
  phone: string | null;
  addressStreet1: string | null;
  addressStreet2: string | null;
  addressCity: string | null;
  addressState: string | null;
  addressZip: string | null;
  isResidential: boolean;
  notes: string | null;
};

export function EditCustomerForm({ customerId, customer }: { customerId: string; customer: Customer }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    updatePurchasingCustomer.bind(null, customerId),
    undefined,
  );

  return (
    <form action={action} className="mt-4 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-400">First name</span>
          <input name="firstName" required defaultValue={customer.firstName} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-400">Last name</span>
          <input name="lastName" defaultValue={customer.lastName ?? ""} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-400">Email</span>
          <input name="email" type="email" defaultValue={customer.email ?? ""} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-400">Phone</span>
          <input name="phone" defaultValue={customer.phone ?? ""} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-400">Customer reference #</span>
          <input name="customerReferenceNumber" defaultValue={customer.customerReferenceNumber ?? ""} className={inputClass} />
        </label>
      </div>

      <h3 className="mt-5 text-sm font-semibold text-slate-900 dark:text-slate-50">Shipping address</h3>
      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="text-slate-600 dark:text-slate-400">Street 1</span>
          <input name="addressStreet1" defaultValue={customer.addressStreet1 ?? ""} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="text-slate-600 dark:text-slate-400">Street 2</span>
          <input name="addressStreet2" defaultValue={customer.addressStreet2 ?? ""} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-400">City</span>
          <input name="addressCity" defaultValue={customer.addressCity ?? ""} className={inputClass} />
        </label>
        <span className="flex gap-2">
          <label className="flex flex-1 flex-col gap-1 text-sm">
            <span className="text-slate-600 dark:text-slate-400">State</span>
            <input name="addressState" maxLength={2} defaultValue={customer.addressState ?? ""} className={inputClass} />
          </label>
          <label className="flex flex-1 flex-col gap-1 text-sm">
            <span className="text-slate-600 dark:text-slate-400">ZIP</span>
            <input name="addressZip" defaultValue={customer.addressZip ?? ""} className={inputClass} />
          </label>
        </span>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
        <input type="checkbox" name="isResidential" defaultChecked={customer.isResidential} />
        Residential address
      </label>

      <label className="mt-3 flex flex-col gap-1 text-sm">
        <span className="text-slate-600 dark:text-slate-400">Notes</span>
        <textarea name="notes" defaultValue={customer.notes ?? ""} rows={2} className={inputClass} />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60 dark:bg-slate-50 dark:text-slate-900 dark:hover:bg-slate-200"
      >
        {pending ? "Saving..." : "Save customer"}
      </button>
      {state?.error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{state.error}</p>}
    </form>
  );
}
