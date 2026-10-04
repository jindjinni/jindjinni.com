"use client";

import { useActionState } from "react";
import { applyExpiryRules, type ApplyExpiryRulesState } from "@/app/actions/purchasing";

export type ExpiryCardRule = {
  key: string;
  title: string;
  covers: string;
  noExpiration: boolean;
  options: { label: string; multiplier: number }[];
  products: {
    id: string;
    name: string;
    toAdd: number;
    extraLabels: string[];
    flagChange: boolean;
  }[];
};

/**
 * One-click "set up expiry options for every product" -- the brand rules
 * live in src/lib/purchasing-expiry-rules.ts. Shows exactly what each rule
 * matched in this org's catalog before anything is written.
 */
export function AutoExpiryCard({ rules, unmatched }: { rules: ExpiryCardRule[]; unmatched: string[] }) {
  const [state, action, pending] = useActionState<ApplyExpiryRulesState, FormData>(applyExpiryRules, undefined);

  const totalMatched = rules.reduce((n, r) => n + r.products.length, 0);
  const totalChanges = rules.reduce(
    (n, r) => n + r.products.filter((p) => p.toAdd > 0 || p.flagChange).length,
    0,
  );
  const totalExtras = rules.reduce((n, r) => n + r.products.reduce((m, p) => m + p.extraLabels.length, 0), 0);

  return (
    <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50/50 p-6 dark:border-emerald-900 dark:bg-emerald-950/20">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Auto-assign expiry options by brand</h2>
      <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
        Sets each product&rsquo;s expiry options in one go, using the rules below. Options a product already has are kept as they are.
        {" "}
        <span className="font-medium">{totalMatched}</span> product(s) matched;{" "}
        <span className="font-medium">{totalChanges}</span> need changes.
      </p>

      <div className="mt-4 flex flex-col gap-3">
        {rules.map((r) => {
          const needing = r.products.filter((p) => p.toAdd > 0 || p.flagChange).length;
          return (
            <div key={r.key} className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-50">{r.title}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {r.products.length} product(s){needing > 0 ? ` · ${needing} to update` : " · up to date"}
                </p>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {r.noExpiration ? (
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    Does not expire
                  </span>
                ) : (
                  r.options.map((o) => (
                    <span
                      key={o.label}
                      className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                    >
                      {o.label} · {Math.round(o.multiplier * 100)}% payout
                    </span>
                  ))
                )}
              </div>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{r.covers}</p>
              {r.products.length > 0 && (
                <details className="mt-2 text-xs">
                  <summary className="cursor-pointer text-slate-600 dark:text-slate-300">Show the {r.products.length} matched product(s)</summary>
                  <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                    {r.products.map((p) => (
                      <li key={p.id} className="text-slate-700 dark:text-slate-300">
                        {p.name}
                        {p.toAdd === 0 && !p.flagChange && <span className="text-emerald-700 dark:text-emerald-400"> ✓</span>}
                        {p.extraLabels.length > 0 && (
                          <span className="text-amber-700 dark:text-amber-400"> (also has: {p.extraLabels.join(", ")})</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          );
        })}
      </div>

      {unmatched.length > 0 && (
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer text-slate-600 dark:text-slate-300">
            {unmatched.length} product(s) have no rule yet and are left untouched
          </summary>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
            {unmatched.map((n) => (
              <li key={n} className="text-slate-600 dark:text-slate-400">
                {n}
              </li>
            ))}
          </ul>
        </details>
      )}

      <form action={action} className="mt-4 flex flex-col items-start gap-3">
        {totalExtras > 0 && (
          <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input name="removeOthers" type="checkbox" className="mt-1" />
            <span>
              Also remove the other expiry options those products currently have ({totalExtras}), so each product keeps only the options above.
            </span>
          </label>
        )}
        <button
          type="submit"
          disabled={pending || (totalChanges === 0 && totalExtras === 0)}
          className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
        >
          {pending ? "Applying…" : totalChanges === 0 && totalExtras === 0 ? "Everything is up to date" : totalChanges === 0 ? "Remove the extra options" : `Apply to ${totalChanges} product(s)`}
        </button>
        {state?.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
        {state?.message && <p className="text-sm text-emerald-700 dark:text-emerald-400">{state.message}</p>}
      </form>
    </div>
  );
}
