"use client";

import { useState, useTransition } from "react";
import { setProductMultiplier, removeProductMultiplier, setProductNoExpiration } from "@/app/actions/purchasing";

type Range = { id: string; label: string; defaultMultiplier: number };
type Row = { id: string; expirationRangeId: string; multiplier: number };

/**
 * The product's "Expiry Options" -- which month ranges this product is
 * quoted at, tied straight to purchasing_product_multipliers (the same
 * table behind the standalone Product Multipliers page). Checking a box
 * adds a row at that range's own default multiplier; unchecking removes
 * it. A checked row also exposes its multiplier for fine-tuning here,
 * without leaving this page.
 */
export function MultipliersSection({
  productId,
  standardPrice,
  noExpiration,
  ranges,
  rows,
}: {
  productId: string;
  standardPrice: number;
  noExpiration: boolean;
  ranges: Range[];
  rows: Row[];
}) {
  const rowByRangeId = new Map(rows.map((r) => [r.expirationRangeId, r]));
  const [togglePending, startToggle] = useTransition();
  const [toggleError, setToggleError] = useState<string | null>(null);

  function toggleNoExpiration(next: boolean) {
    setToggleError(null);
    startToggle(async () => {
      const result = await setProductNoExpiration(productId, next);
      if (result?.error) setToggleError(result.error);
    });
  }

  return (
    <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Expiry Options</h2>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Check every month range this product is quoted at. Final unit price = standard price (${standardPrice.toFixed(2)}) × the multiplier below -- starts at that range&rsquo;s own default and is editable per product.
      </p>

      <label className="mt-3 flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
        <input
          type="checkbox"
          checked={noExpiration}
          disabled={togglePending}
          onChange={(e) => toggleNoExpiration(e.target.checked)}
        />
        This product does not expire (no expiration date is asked for when quoting it)
      </label>
      {toggleError && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{toggleError}</p>}

      <div className={`mt-3 flex flex-col gap-2 ${noExpiration ? "pointer-events-none opacity-40" : ""}`}>
        {ranges.map((range) => (
          <ExpiryOptionRow key={range.id} productId={productId} standardPrice={standardPrice} range={range} row={rowByRangeId.get(range.id) ?? null} />
        ))}
        {ranges.length === 0 && (
          <p className="text-sm text-slate-400">No month ranges set up yet -- add some under Purchasing &gt; Month Range first.</p>
        )}
      </div>
    </div>
  );
}

function ExpiryOptionRow({
  productId,
  standardPrice,
  range,
  row,
}: {
  productId: string;
  standardPrice: number;
  range: Range;
  row: Row | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const checked = row !== null;

  function toggle() {
    setError(null);
    startTransition(async () => {
      if (row) {
        const result = await removeProductMultiplier(row.id, undefined, new FormData());
        if (result?.error) setError(result.error);
      } else {
        const fd = new FormData();
        fd.set("expirationRangeId", range.id);
        fd.set("multiplier", String(range.defaultMultiplier));
        const result = await setProductMultiplier(productId, undefined, fd);
        if (result?.error) setError(result.error);
      }
    });
  }

  function saveMultiplier(formData: FormData) {
    setError(null);
    formData.set("expirationRangeId", range.id);
    startTransition(async () => {
      const result = await setProductMultiplier(productId, undefined, formData);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div
      className={
        checked
          ? "flex flex-wrap items-center gap-3 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm dark:border-emerald-800 dark:bg-emerald-950/40"
          : "flex flex-wrap items-center gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800/50"
      }
    >
      <label className="flex flex-1 cursor-pointer items-center gap-3">
        <input type="checkbox" checked={checked} disabled={pending} onChange={toggle} className="h-4 w-4 accent-emerald-700" />
        <span className="text-slate-800 dark:text-slate-200">{range.label}</span>
      </label>
      {row && (
        <form action={saveMultiplier} className="flex items-center gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-400">×</span>
          <input
            name="multiplier"
            type="number"
            step="0.01"
            min="0"
            defaultValue={row.multiplier}
            disabled={pending}
            className="w-20 rounded-md border border-slate-300 px-2 py-1 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800"
          />
          <span className="tabular-nums text-xs text-slate-500 dark:text-slate-400">= ${(standardPrice * row.multiplier).toFixed(2)}</span>
          <button type="submit" disabled={pending} className="text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400">
            Save
          </button>
        </form>
      )}
      {error && <p className="w-full text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
