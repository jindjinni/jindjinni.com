"use client";

import { useMemo, useState, useTransition } from "react";
import { removePurchasingQuotedItem, updatePurchasingQuotedItem } from "@/app/actions/purchasing";
import { expiryMultiplierFor, pct, priceBreakdown, type PriceTables } from "@/lib/purchasing-price";
import { LivePrice, useManualPrice } from "./live-price";

const inputClass =
  "rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800";

const CUSTOM_CONDITION_VALUE = "__custom__";

type Item = {
  id: string;
  productId: string | null;
  productNameSnapshot: string;
  productCodeSnapshot: string | null;
  conditionId: string | null;
  conditionNameSnapshot: string | null;
  expirationRangeId: string | null;
  expirationRangeLabelSnapshot: string | null;
  quantity: number;
  baseUnitPrice: number;
  finalUnitPrice: number;
  lineTotal: number;
};
type Condition = { id: string; name: string };
type Range = { id: string; label: string };

/**
 * One quoted line, editable in place. A customer dispute or a mis-keyed
 * condition/expiry/quantity no longer requires remove + re-add -- "Edit"
 * opens the same fields the Add-line form uses, pre-filled, and saves via
 * updatePurchasingQuotedItem. Remove still works the same as before, now
 * with its own pending/error state isolated to this row (so one row's
 * action never looks stuck because of another).
 */
export function QuotedItemRow({
  item,
  index,
  conditions,
  productConditions,
  ranges,
  productExpiryOptions,
  noExpirationProductIds,
  canOverridePrice,
  priceTables,
}: {
  item: Item;
  index: number;
  conditions: Condition[];
  productConditions: Record<string, { id: string; name: string }[]>;
  ranges: Range[];
  productExpiryOptions: Record<string, string[]>;
  noExpirationProductIds: string[];
  canOverridePrice: boolean;
  priceTables: PriceTables;
}) {
  const [editing, setEditing] = useState(false);
  const [removePending, startRemove] = useTransition();
  const [removeError, setRemoveError] = useState<string | null>(null);

  const availableConditions = useMemo(() => {
    const assigned = item.productId ? productConditions[item.productId] : undefined;
    return assigned && assigned.length > 0 ? assigned : conditions;
  }, [item.productId, productConditions, conditions]);

  const neverExpires = item.productId ? noExpirationProductIds.includes(item.productId) : false;
  const availableRanges = useMemo(() => {
    const ids = item.productId ? productExpiryOptions[item.productId] : undefined;
    if (!ids || ids.length === 0) return ranges;
    // Keep the line's current range selectable even if it's no longer one of the product's options.
    return ranges.filter((r) => ids.includes(r.id) || r.id === item.expirationRangeId);
  }, [item.productId, item.expirationRangeId, productExpiryOptions, ranges]);

  function handleRemove() {
    if (!window.confirm(`Remove ${item.productNameSnapshot} from this quotation?`)) return;
    setRemoveError(null);
    startRemove(async () => {
      const result = await removePurchasingQuotedItem(item.id, undefined, new FormData());
      if (result?.error) setRemoveError(result.error);
    });
  }

  if (editing) {
    return (
      <tr className="border-b border-slate-100 bg-slate-50 last:border-0 dark:border-slate-800 dark:bg-slate-800/40">
        <td colSpan={8} className="px-4 py-3">
          <EditQuotedItemForm
            item={item}
            availableConditions={availableConditions}
            ranges={availableRanges}
            neverExpires={neverExpires}
            canOverridePrice={canOverridePrice}
            priceTables={priceTables}
            onDone={() => setEditing(false)}
          />
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-slate-100 last:border-0 dark:border-slate-800">
      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{index + 1}</td>
      <td className="px-4 py-3 text-slate-900 dark:text-slate-50">{item.productNameSnapshot}</td>
      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{item.conditionNameSnapshot ?? "—"}</td>
      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{item.expirationRangeLabelSnapshot ?? "—"}</td>
      <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-300">{item.quantity}</td>
      <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-300">
        ${item.finalUnitPrice.toFixed(2)}
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-slate-900 dark:text-slate-50">
        ${item.lineTotal.toFixed(2)}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-emerald-300 hover:text-emerald-700 dark:border-slate-700 dark:text-slate-300"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={handleRemove}
            disabled={removePending}
            className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
          >
            {removePending ? "Removing..." : "Remove"}
          </button>
        </div>
        {removeError && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{removeError}</p>}
      </td>
    </tr>
  );
}

function EditQuotedItemForm({
  item,
  availableConditions,
  ranges,
  neverExpires,
  canOverridePrice,
  priceTables,
  onDone,
}: {
  item: Item;
  availableConditions: Condition[];
  ranges: Range[];
  neverExpires: boolean;
  canOverridePrice: boolean;
  priceTables: PriceTables;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [conditionSelection, setConditionSelection] = useState(item.conditionId ?? "");
  const isCustomCondition = conditionSelection === CUSTOM_CONDITION_VALUE;
  const [rangeId, setRangeId] = useState(item.expirationRangeId ?? "");
  const [qty, setQty] = useState(String(item.quantity));
  const [customMult, setCustomMult] = useState("");

  // Live price. A line keeps the base price it was quoted at (see updatePurchasingQuotedItem), so the preview does too.
  const customN = Number(customMult);
  const conditionMult = isCustomCondition ? (customMult.trim() !== "" && !Number.isNaN(customN) && customN >= 0 ? customN : 1) : conditionSelection ? priceTables.conditionMultipliers[conditionSelection] ?? 1 : 1;
  const effectiveRange = neverExpires ? "" : rangeId;
  const breakdown = item.productId ? priceBreakdown(item.baseUnitPrice, expiryMultiplierFor(priceTables, item.productId, effectiveRange || null, neverExpires), conditionMult) : null;
  // A line that was saved with a manual price keeps showing it until the condition or expiry is changed.
  const wasManual = !!breakdown && item.finalUnitPrice !== priceBreakdown(item.baseUnitPrice, expiryMultiplierFor(priceTables, item.productId, item.expirationRangeId, neverExpires), item.conditionId ? priceTables.conditionMultipliers[item.conditionId] ?? 1 : 1).unitPrice;
  const price = useManualPrice(wasManual ? item.finalUnitPrice.toFixed(2) : null);

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await updatePurchasingQuotedItem(item.id, undefined, formData);
      if (result?.error) {
        setError(result.error);
      } else {
        onDone();
      }
    });
  }

  return (
    <form action={submit} className="flex flex-wrap items-end gap-3">
      <div className="text-sm font-medium text-slate-900 dark:text-slate-50">{item.productNameSnapshot}</div>

      <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-400">
        Condition
        <select
          name="conditionId"
          className={inputClass}
          value={conditionSelection}
          onChange={(e) => {
            setConditionSelection(e.target.value);
            price.reset();
          }}
        >
          <option value="">— None —</option>
          {availableConditions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} — {pct(priceTables.conditionMultipliers[c.id] ?? 1)}
            </option>
          ))}
          <option value={CUSTOM_CONDITION_VALUE}>Custom…</option>
        </select>
      </label>

      {isCustomCondition && (
        <>
          <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-400">
            Custom condition
            <input name="customConditionName" required placeholder="e.g. Water damage" className={`w-36 ${inputClass}`} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-400">
            Custom payout (×)
            <input
              name="customConditionMultiplier"
              type="number"
              step="0.01"
              min="0"
              required
              placeholder="e.g. 0.60"
              value={customMult}
              onChange={(e) => {
                setCustomMult(e.target.value);
                price.reset();
              }}
              className={`w-24 ${inputClass}`}
            />
          </label>
        </>
      )}

      <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-400">
        Expiry
        {neverExpires ? (
          <span className={`${inputClass} bg-slate-50 text-slate-500 dark:bg-slate-800/50 dark:text-slate-400`}>Does not expire</span>
        ) : (
          <select
            name="expirationRangeId"
            className={inputClass}
            value={rangeId}
            onChange={(e) => {
              setRangeId(e.target.value);
              price.reset();
            }}
          >
            <option value="">— None —</option>
            {ranges.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label} — {pct(expiryMultiplierFor(priceTables, item.productId, r.id, false))}
              </option>
            ))}
          </select>
        )}
      </label>

      <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-400">
        Qty
        <input name="quantity" type="number" min="1" step="1" required value={qty} onChange={(e) => setQty(e.target.value)} className={`w-16 ${inputClass}`} />
      </label>

      <LivePrice
        idPrefix={`edit-${item.id}`}
        b={breakdown}
        quantity={Number(qty)}
        manual={price.manual}
        onManual={price.setManual}
        canOverride={canOverridePrice}
        notAccepting={!!breakdown && item.baseUnitPrice <= 0}
        missing={[]}
      />

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-emerald-700 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
        >
          {pending ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          onClick={onDone}
          disabled={pending}
          className="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Cancel
        </button>
      </div>
      {error && <p className="w-full text-xs text-red-600 dark:text-red-400">{error}</p>}
    </form>
  );
}
