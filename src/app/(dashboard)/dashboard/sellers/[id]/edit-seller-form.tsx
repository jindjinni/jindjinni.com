"use client";

import { useActionState } from "react";

type ActionState = { error?: string } | undefined;
type Seller = {
  name: string;
  email: string | null;
  phone: string | null;
  addressStreet1: string | null;
  addressStreet2: string | null;
  addressCity: string | null;
  addressState: string | null;
  addressZip: string | null;
  isResidential: boolean;
};

const inputClass =
  "rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800";

export function EditSellerForm({
  sellerId,
  seller,
  action,
}: {
  sellerId: string;
  seller: Seller;
  action: (sellerId: string, state: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [state, formAction, pending] = useActionState(action.bind(null, sellerId), undefined);

  return (
    <form
      action={formAction}
      className="mt-6 flex max-w-2xl flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm sm:col-span-1">
          <span className="text-slate-600 dark:text-slate-400">Name *</span>
          <input name="name" defaultValue={seller.name} required className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-400">Email</span>
          <input type="email" name="email" defaultValue={seller.email ?? ""} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-400">Phone</span>
          <input name="phone" defaultValue={seller.phone ?? ""} className={inputClass} />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-600 dark:text-slate-400">Street address</span>
        <input name="addressStreet1" defaultValue={seller.addressStreet1 ?? ""} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-600 dark:text-slate-400">Apt / suite</span>
        <input name="addressStreet2" defaultValue={seller.addressStreet2 ?? ""} className={inputClass} />
      </label>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="text-slate-600 dark:text-slate-400">City</span>
          <input name="addressCity" defaultValue={seller.addressCity ?? ""} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-400">State</span>
          <input name="addressState" defaultValue={seller.addressState ?? ""} maxLength={2} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-400">ZIP</span>
          <input name="addressZip" defaultValue={seller.addressZip ?? ""} className={inputClass} />
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
        <input type="checkbox" name="isResidential" defaultChecked={seller.isResidential} className="h-4 w-4" />
        Residential address
      </label>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
        >
          {pending ? "Saving..." : "Save"}
        </button>
        {state?.error && <span className="text-sm text-red-600 dark:text-red-400">{state.error}</span>}
      </div>
    </form>
  );
}
