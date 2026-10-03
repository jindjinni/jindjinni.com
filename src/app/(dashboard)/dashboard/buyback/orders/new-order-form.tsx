"use client";

import { useActionState } from "react";
import Link from "next/link";
import { createBuybackOrder } from "@/app/actions/buyback";

type Seller = { id: string; name: string };

export function NewOrderForm({ sellers }: { sellers: Seller[] }) {
  const [state, action, pending] = useActionState(createBuybackOrder, undefined);

  if (sellers.length === 0) {
    return (
      <p className="mt-6 rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
        Add a seller first from the{" "}
        <Link href="/dashboard/sellers" className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
          Sellers
        </Link>{" "}
        page, then come back here to quote their order.
      </p>
    );
  }

  return (
    <form
      action={action}
      className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700 dark:text-slate-300">Seller</span>
        <select
          name="sellerId"
          required
          defaultValue=""
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800"
        >
          <option value="" disabled>
            Choose a seller
          </option>
          {sellers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700 dark:text-slate-300">
          Customer reference (optional)
        </span>
        <input
          name="orderReference"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700 dark:text-slate-300">
          Tracking number (optional)
        </span>
        <input
          name="trackingNumber"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
      >
        {pending ? "Starting..." : "Start quote"}
      </button>
      {state?.error && (
        <p className="w-full text-sm text-red-600 dark:text-red-400">{state.error}</p>
      )}
    </form>
  );
}
