"use client";

import { useActionState } from "react";
import { createSeller } from "@/app/actions/buyback";

export function AddSellerForm() {
  const [state, action, pending] = useActionState(createSeller, undefined);

  return (
    <form
      action={action}
      className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700 dark:text-slate-300">Name</span>
        <input
          name="name"
          required
          className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700 dark:text-slate-300">Email</span>
        <input
          name="email"
          type="email"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700 dark:text-slate-300">Phone</span>
        <input
          name="phone"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800"
        />
      </label>
      <label className="flex flex-1 min-w-[14rem] flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700 dark:text-slate-300">Street address</span>
        <input
          name="addressStreet1"
          placeholder="For the shipping label"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700 dark:text-slate-300">Apt/suite</span>
        <input
          name="addressStreet2"
          className="w-24 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700 dark:text-slate-300">City</span>
        <input
          name="addressCity"
          className="w-32 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700 dark:text-slate-300">State</span>
        <input
          name="addressState"
          maxLength={2}
          className="w-16 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-700 dark:text-slate-300">ZIP</span>
        <input
          name="addressZip"
          className="w-20 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800"
        />
      </label>
      <label className="flex items-center gap-2 pb-2 text-sm text-slate-600 dark:text-slate-400">
        <input type="checkbox" name="isResidential" defaultChecked className="h-4 w-4" />
        Residential
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
      >
        {pending ? "Adding..." : "Add seller"}
      </button>
      {state?.error && (
        <p className="w-full text-sm text-red-600 dark:text-red-400">{state.error}</p>
      )}
    </form>
  );
}
