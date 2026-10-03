"use client";

import { useActionState } from "react";
import { setProductMultiplier, removeProductMultiplier } from "@/app/actions/purchasing";
import { ActionButton } from "@/components/action-button";

type ActionState = { error?: string } | undefined;

type Range = { id: string; label: string };
type Row = { id: string; expirationRangeId: string; expirationRangeLabel: string; multiplier: number };

export function MultipliersSection({
  productId,
  standardPrice,
  ranges,
  rows,
}: {
  productId: string;
  standardPrice: number;
  ranges: Range[];
  rows: Row[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    setProductMultiplier.bind(null, productId),
    undefined,
  );
  const usedRangeIds = new Set(rows.map((r) => r.expirationRangeId));
  const availableRanges = ranges.filter((r) => !usedRangeIds.has(r.id));

  return (
    <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Expiration-range multipliers</h2>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Final unit price = standard price (${standardPrice.toFixed(2)}) × multiplier for the chosen expiry bucket.
      </p>

      <div className="mt-3 flex flex-col gap-2">
        {rows.map((r) => (
          <MultiplierRow key={r.id} productId={productId} standardPrice={standardPrice} row={r} />
        ))}
        {rows.length === 0 && <p className="text-sm text-slate-400">No expiry buckets priced yet.</p>}
      </div>

      {availableRanges.length > 0 && (
        <form action={action} className="mt-4 flex items-end gap-3 border-t border-dashed border-slate-200 pt-4 text-sm dark:border-slate-700">
          <label className="flex flex-col gap-1">
            <span className="text-slate-600 dark:text-slate-400">Expiry bucket</span>
            <select
              name="expirationRangeId"
              required
              className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800"
            >
              {availableRanges.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-slate-600 dark:text-slate-400">Multiplier</span>
            <input
              name="multiplier"
              type="number"
              step="0.01"
              min="0"
              defaultValue={1}
              className="w-24 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800"
            />
          </label>
          <button type="submit" disabled={pending} className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60">
            {pending ? "Adding..." : "Add bucket"}
          </button>
        </form>
      )}
      {state?.error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{state.error}</p>}
    </div>
  );
}

function MultiplierRow({
  productId,
  standardPrice,
  row,
}: {
  productId: string;
  standardPrice: number;
  row: Row;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    setProductMultiplier.bind(null, productId),
    undefined,
  );

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-3 text-sm">
        <span className="w-32 text-slate-700 dark:text-slate-300">{row.expirationRangeLabel}</span>
        <form action={formAction} className="flex items-center gap-2">
          <input type="hidden" name="expirationRangeId" value={row.expirationRangeId} />
          <input
            name="multiplier"
            type="number"
            step="0.01"
            min="0"
            defaultValue={row.multiplier}
            className="w-24 rounded-md border border-slate-300 px-2 py-1 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800"
          />
          <span className="tabular-nums text-slate-500">= ${(standardPrice * row.multiplier).toFixed(2)}</span>
          <button type="submit" disabled={pending} className="text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400">
            {pending ? "Saving..." : "Save"}
          </button>
        </form>
        <ActionButton
          action={removeProductMultiplier.bind(null, row.id)}
          label="Remove"
          pendingLabel="Removing..."
          className="text-xs font-medium text-red-600 hover:underline dark:text-red-400"
        />
      </div>
      {state?.error && <p className="text-xs text-red-600 dark:text-red-400">{state.error}</p>}
    </div>
  );
}
