"use client";

import { useState, useTransition } from "react";
import { addProductCondition, removeProductCondition, createCustomProductCondition } from "@/app/actions/purchasing";

const inputClass =
  "rounded-md border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800";

type GlobalCondition = { id: string; name: string; multiplier: number };
type ProductCondition = { id: string; conditionId: string; conditionName: string; conditionMultiplier: number };

/**
 * The product's own "Conditions" -- which grading-scale conditions (Mint,
 * Ding, ...) this product carries, tied to purchasing_product_conditions.
 * Every condition pays the same percentage everywhere it's used (per chat),
 * so this is a plain checklist, not an editable-per-product multiplier like
 * Expiry Options. A product with none checked still offers the full active
 * list at quote time -- this only narrows it down once at least one is set.
 */
export function ConditionsSection({
  productId,
  allConditions,
  productConditions,
}: {
  productId: string;
  allConditions: GlobalCondition[];
  productConditions: ProductCondition[];
}) {
  const joinByConditionId = new Map(productConditions.map((pc) => [pc.conditionId, pc]));

  return (
    <div className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm p-6 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Conditions</h2>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Check every condition this product can be quoted at. Leave none checked to offer the full Conditions list at quote time instead.
      </p>

      <div className="mt-3 flex flex-col gap-2">
        {allConditions.map((condition) => (
          <ConditionCheckboxRow
            key={condition.id}
            productId={productId}
            condition={condition}
            joinRow={joinByConditionId.get(condition.id) ?? null}
          />
        ))}
        {allConditions.length === 0 && (
          <p className="text-sm text-slate-400">No conditions set up yet -- add some under Purchasing &gt; Conditions first.</p>
        )}
      </div>

      <AddCustomConditionForm productId={productId} />
    </div>
  );
}

function ConditionCheckboxRow({
  productId,
  condition,
  joinRow,
}: {
  productId: string;
  condition: GlobalCondition;
  joinRow: ProductCondition | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const checked = joinRow !== null;

  function toggle() {
    setError(null);
    startTransition(async () => {
      if (joinRow) {
        const result = await removeProductCondition(joinRow.id, undefined, new FormData());
        if (result?.error) setError(result.error);
      } else {
        const fd = new FormData();
        fd.set("conditionId", condition.id);
        const result = await addProductCondition(productId, undefined, fd);
        if (result?.error) setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <label
        className={
          checked
            ? "flex cursor-pointer items-center gap-3 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm dark:border-emerald-800 dark:bg-emerald-950/40"
            : "flex cursor-pointer items-center gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800/50"
        }
      >
        <input type="checkbox" checked={checked} disabled={pending} onChange={toggle} className="h-4 w-4 accent-emerald-700" />
        <span className="flex-1 text-slate-800 dark:text-slate-200">{condition.name}</span>
        <span className="tabular-nums text-xs text-slate-500 dark:text-slate-400">{condition.multiplier.toFixed(2)}×</span>
      </label>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

function AddCustomConditionForm({ productId }: { productId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createCustomProductCondition(productId, undefined, formData);
      if (result?.error) {
        setError(result.error);
      } else {
        setOpen(false);
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 rounded-md border border-dashed border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        + Add custom condition
      </button>
    );
  }

  return (
    <form action={submit} className="mt-4 flex flex-wrap items-end gap-3 border-t border-dashed border-slate-200 pt-4 dark:border-slate-700">
      <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-400">
        Condition name
        <input name="name" required placeholder="e.g. Tier on box" className={`w-44 ${inputClass}`} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-400">
        Price multiplier
        <input name="multiplier" type="number" step="0.01" min="0" defaultValue="1" required className={`w-28 ${inputClass}`} />
      </label>
      <button type="submit" disabled={pending} className="rounded-md bg-emerald-700 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-60">
        {pending ? "Adding…" : "Add & check"}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        Cancel
      </button>
      {error && <p className="w-full text-xs text-red-600 dark:text-red-400">{error}</p>}
      <p className="w-full text-xs text-slate-400">
        This also adds it to Purchasing &gt; Conditions so it&rsquo;s available for every product going forward.
      </p>
    </form>
  );
}
