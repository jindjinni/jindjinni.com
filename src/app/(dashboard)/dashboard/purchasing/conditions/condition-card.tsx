"use client";

import { useState, useTransition } from "react";
import {
  updatePurchasingCondition,
  archivePurchasingCondition,
  restorePurchasingCondition,
  deletePurchasingCondition,
} from "@/app/actions/purchasing";

const inputClass =
  "rounded-md border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800";

export type Condition = { id: string; name: string; multiplier: number; active: boolean };

export function ConditionCard({ condition }: { condition: Condition }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function runAndClose(action: () => Promise<{ error?: string } | undefined>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result?.error) setError(result.error);
    });
  }

  if (editing) {
    return (
      <div className="rounded-xl border border-emerald-300 bg-white p-4 dark:border-emerald-800 dark:bg-slate-900">
        <form
          action={async (formData) => {
            await updatePurchasingCondition(condition.id, formData);
            setEditing(false);
          }}
          className="flex flex-col gap-3"
        >
          <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-400">
            Condition name
            <input name="name" defaultValue={condition.name} required className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-400">
            Price multiplier
            <input name="multiplier" type="number" step="0.01" min="0" defaultValue={condition.multiplier} className={`w-28 ${inputClass}`} />
          </label>
          <input type="hidden" name="active" value={condition.active ? "on" : ""} />
          <div className="flex items-center gap-3">
            <button type="submit" className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800">
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white shadow-sm p-4 dark:border-slate-800 dark:bg-slate-900">
      <span className="inline-block w-fit rounded-md bg-slate-100 px-2.5 py-1 text-sm font-semibold text-slate-800 dark:bg-slate-800 dark:text-slate-100">
        {condition.name}
      </span>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Price multiplier: <span className="font-semibold text-emerald-700 dark:text-emerald-400">{condition.multiplier.toFixed(2)}×</span>
      </p>
      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
        {condition.active ? (
          <>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Edit
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => runAndClose(() => archivePurchasingCondition(condition.id, undefined, new FormData()))}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Archive
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (!window.confirm(`Permanently delete "${condition.name}"? This can't be undone.`)) return;
                runAndClose(() => deletePurchasingCondition(condition.id, undefined, new FormData()));
              }}
              className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              Delete
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => runAndClose(() => restorePurchasingCondition(condition.id, undefined, new FormData()))}
              className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              Restore
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (!window.confirm(`Permanently delete "${condition.name}"? This can't be undone.`)) return;
                runAndClose(() => deletePurchasingCondition(condition.id, undefined, new FormData()));
              }}
              className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              Delete
            </button>
          </>
        )}
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
