"use client";

import { useRef, useState, useTransition, useEffect } from "react";
import {
  updatePurchasingExpirationRange,
  duplicatePurchasingExpirationRange,
  deletePurchasingExpirationRange,
} from "@/app/actions/purchasing";

const inputClass =
  "rounded-md border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800";

type Range = {
  id: string;
  label: string;
  minMonths: number | null;
  maxMonths: number | null;
  defaultMultiplier: number;
  active: boolean;
};

/** One row of Month Range -- a display row with a "..." menu (Edit / Duplicate / Delete) that swaps to an inline edit form when Edit is picked, matching the Bonus Management row pattern. */
export function MonthRangeRow({ range, rowNumber }: { range: Range; rowNumber: number }) {
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [menuOpen]);

  function runAndClose(action: () => Promise<{ error?: string } | undefined>) {
    setMenuOpen(false);
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result?.error) setError(result.error);
    });
  }

  if (editing) {
    return (
      <tr className="border-b border-slate-100 last:border-0 dark:border-slate-800">
        <td colSpan={7} className="px-4 py-3">
          <form
            action={async (formData) => {
              await updatePurchasingExpirationRange(range.id, formData);
              setEditing(false);
            }}
            className="flex flex-wrap items-end gap-3"
          >
            <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-400">
              Expiration Option
              <input name="label" defaultValue={range.label} className={`w-40 ${inputClass}`} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-400">
              Price Multiplier (×)
              <input name="defaultMultiplier" type="number" step="0.01" min="0" defaultValue={range.defaultMultiplier} className={`w-24 ${inputClass}`} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-400">
              Range Start
              <input name="minMonths" type="number" defaultValue={range.minMonths ?? ""} className={`w-24 ${inputClass}`} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-400">
              Range End (Months)
              <input name="maxMonths" type="number" defaultValue={range.maxMonths ?? ""} className={`w-24 ${inputClass}`} />
            </label>
            <label className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400">
              <input type="checkbox" name="active" defaultChecked={range.active} /> Active
            </label>
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
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-slate-100 last:border-0 dark:border-slate-800">
      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{rowNumber}</td>
      <td className="px-4 py-3 text-slate-900 dark:text-slate-50">{range.label}</td>
      <td className="px-4 py-3 tabular-nums text-slate-900 dark:text-slate-50">{range.defaultMultiplier.toFixed(2)}×</td>
      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{range.minMonths ?? "—"}</td>
      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{range.maxMonths ?? "—"}</td>
      <td className="px-4 py-3">
        <span
          className={
            range.active
              ? "rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
              : "rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400"
          }
        >
          {range.active ? "Active" : "Inactive"}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <div className="relative inline-block text-left" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            disabled={pending}
            aria-label={`Actions for month range ${rowNumber}`}
            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <circle cx="8" cy="2.5" r="1.4" />
              <circle cx="8" cy="8" r="1.4" />
              <circle cx="8" cy="13.5" r="1.4" />
            </svg>
          </button>
          {menuOpen && (
            <div className="absolute right-0 z-10 mt-1 w-40 rounded-md border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setEditing(true);
                }}
                className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => runAndClose(() => duplicatePurchasingExpirationRange(range.id, undefined, new FormData()))}
                className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Duplicate
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!window.confirm("Permanently delete this month range? This can't be undone.")) return;
                  runAndClose(() => deletePurchasingExpirationRange(range.id, undefined, new FormData()));
                }}
                className="block w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
              >
                Delete
              </button>
            </div>
          )}
          {error && (
            <p className="absolute right-0 z-10 mt-1 w-64 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700 shadow-lg dark:border-red-900 dark:bg-red-950 dark:text-red-300">
              {error}
            </p>
          )}
        </div>
      </td>
    </tr>
  );
}
