"use client";

import { useActionState, useMemo, useState } from "react";
import { addPurchasingQuotedItem } from "@/app/actions/purchasing";

type ActionState = { error?: string } | undefined;

const inputClass =
  "rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800";

const CUSTOM_CONDITION_VALUE = "__custom__";

type Product = { id: string; name: string; standardPrice: number };
type Condition = { id: string; name: string };
type Range = { id: string; label: string };

export function AddQuotedItemForm({
  quotationId,
  products,
  conditions,
  productConditions,
  ranges,
  productExpiryOptions,
  noExpirationProductIds,
  canOverridePrice,
}: {
  quotationId: string;
  products: Product[];
  conditions: Condition[];
  /** productId -> the conditions that product carries. A product with no entry (or an empty list) offers the full `conditions` list instead -- see getProductConditionsMap. */
  productConditions: Record<string, { id: string; name: string }[]>;
  ranges: Range[];
  productExpiryOptions: Record<string, string[]>;
  noExpirationProductIds: string[];
  canOverridePrice: boolean;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    addPurchasingQuotedItem.bind(null, quotationId),
    undefined,
  );
  const [productId, setProductId] = useState("");
  const [conditionSelection, setConditionSelection] = useState("");
  const isCustomCondition = conditionSelection === CUSTOM_CONDITION_VALUE;

  const availableConditions = useMemo(() => {
    const assigned = productConditions[productId];
    return assigned && assigned.length > 0 ? assigned : conditions;
  }, [productId, productConditions, conditions]);

  const productNeverExpires = noExpirationProductIds.includes(productId);
  const availableRanges = useMemo(() => {
    const ids = productExpiryOptions[productId];
    return ids && ids.length > 0 ? ranges.filter((r) => ids.includes(r.id)) : ranges;
  }, [productId, productExpiryOptions, ranges]);
  // A product with exactly one option (e.g. test strips: 10+ months) preselects it.
  const onlyOptionId = productExpiryOptions[productId]?.length === 1 && availableRanges.length === 1 ? availableRanges[0].id : "";

  return (
    <form action={formAction} className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-dashed border-slate-300 p-4 dark:border-slate-700">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-600 dark:text-slate-400">Product</span>
        <select
          name="productId"
          required
          className={`min-w-[12rem] ${inputClass}`}
          value={productId}
          onChange={(e) => {
            setProductId(e.target.value);
            setConditionSelection("");
          }}
        >
          <option value="" disabled>
            Choose a product
          </option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.standardPrice > 0 ? p.name : `${p.name} — not accepting`}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-600 dark:text-slate-400">Condition</span>
        <select
          name="conditionId"
          className={inputClass}
          value={conditionSelection}
          onChange={(e) => setConditionSelection(e.target.value)}
        >
          <option value="">— None —</option>
          {availableConditions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value={CUSTOM_CONDITION_VALUE}>Custom…</option>
        </select>
      </label>
      {isCustomCondition && (
        <>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600 dark:text-slate-400">Custom condition</span>
            <input
              name="customConditionName"
              required
              placeholder="e.g. Water damage"
              className={`w-40 ${inputClass}`}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600 dark:text-slate-400">Custom payout (×)</span>
            <input
              name="customConditionMultiplier"
              type="number"
              step="0.01"
              min="0"
              required
              placeholder="e.g. 0.60"
              className={`w-28 ${inputClass}`}
            />
          </label>
        </>
      )}
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-600 dark:text-slate-400">Expiry</span>
        {productNeverExpires ? (
          <span className={`${inputClass} bg-slate-50 text-slate-500 dark:bg-slate-800/50 dark:text-slate-400`}>Does not expire</span>
        ) : (
          <select key={productId} name="expirationRangeId" className={inputClass} defaultValue={onlyOptionId}>
            <option value="">— None —</option>
            {availableRanges.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        )}
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-600 dark:text-slate-400">Qty</span>
        <input name="quantity" type="number" min="1" step="1" required defaultValue={1} className={`w-20 ${inputClass}`} />
      </label>
      {canOverridePrice && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600 dark:text-slate-400">Override unit price ($)</span>
          <input name="overrideUnitPrice" type="number" step="0.01" min="0" placeholder="auto" className={`w-32 ${inputClass}`} />
        </label>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
      >
        {pending ? "Adding..." : "Add line"}
      </button>
      {state?.error && <p className="w-full text-sm text-red-600 dark:text-red-400">{state.error}</p>}
    </form>
  );
}
