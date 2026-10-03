"use client";

import { useActionState } from "react";
import { addReceivedItem } from "@/app/actions/buyback";

type Option = { id: string; name: string };
type QuotedItem = { id: string; lineLabel: string };

export function AddReceivedItemForm({
  shipmentId,
  products,
  conditions,
  quotedItems,
}: {
  shipmentId: string;
  products: Option[];
  conditions: Option[];
  quotedItems: QuotedItem[];
}) {
  const action = addReceivedItem.bind(null, shipmentId);
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form
      action={formAction}
      className="mt-4 flex flex-col gap-3 rounded-lg border border-dashed border-slate-300 p-4 dark:border-slate-700"
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-400">Product</span>
          <select
            name="productId"
            required
            defaultValue=""
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800"
          >
            <option value="" disabled>
              Choose a product
            </option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-400">Condition</span>
          <select
            name="conditionId"
            required
            defaultValue=""
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800"
          >
            <option value="" disabled>
              Choose
            </option>
            {conditions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-400">Qty received</span>
          <input
            name="quantityReceived"
            type="number"
            min="0"
            step="1"
            required
            className="w-24 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-400">Was it received?</span>
          <select
            name="wasReceived"
            defaultValue="YES"
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800"
          >
            <option value="YES">Yes</option>
            <option value="NO">No</option>
            <option value="PARTIAL">Partially</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-400">Source</span>
          <select
            name="itemSource"
            defaultValue="QUOTED"
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800"
          >
            <option value="QUOTED">Quoted</option>
            <option value="EXTRA">Extra / unquoted</option>
          </select>
        </label>
        {quotedItems.length > 0 && (
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600 dark:text-slate-400">Matches quoted line</span>
            <select
              name="quotedItemId"
              defaultValue=""
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800"
            >
              <option value="">None / not sure</option>
              {quotedItems.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.lineLabel}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-400">Expiration (optional)</span>
          <input
            name="expirationDate"
            type="date"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-1 min-w-[16rem] flex-col gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-400">
            Discrepancy notes (optional -- e.g. wrong quantity, damage, expired)
          </span>
          <input
            name="discrepancyNotes"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
          <input name="returnRequired" type="checkbox" className="h-4 w-4" />
          Needs to be returned
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-400">Qty to return</span>
          <input
            name="quantityToBeReturned"
            type="number"
            min="0"
            step="1"
            defaultValue="0"
            className="w-24 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60 dark:bg-slate-50 dark:text-slate-900 dark:hover:bg-slate-200"
        >
          {pending ? "Adding..." : "Log item"}
        </button>
      </div>

      {state?.error && (
        <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
      )}
    </form>
  );
}
