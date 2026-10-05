"use client";

import { useActionState, useState } from "react";
import { saveDepartmentColors, type AppearanceState } from "@/app/actions/appearance";
import { DEPARTMENTS, THEME_KEYS, THEMES, themeStyle, type DepartmentKey, type DepartmentThemes } from "@/lib/theme";

export function ThemeForm({ current }: { current: DepartmentThemes }) {
  const [state, action, pending] = useActionState<AppearanceState, FormData>(saveDepartmentColors, undefined);
  const [choice, setChoice] = useState<DepartmentThemes>(current);
  const unchanged = DEPARTMENTS.every((d) => choice[d.key] === current[d.key]);

  function pick(dept: DepartmentKey, key: DepartmentThemes[DepartmentKey]) {
    setChoice((c) => ({ ...c, [dept]: key }));
  }

  return (
    <form action={action} className="mt-6 max-w-3xl">
      <div className="flex flex-col gap-4">
        {DEPARTMENTS.map((d) => (
          <fieldset key={d.key} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <legend className="text-base font-semibold text-slate-900 dark:text-slate-50">{d.label}</legend>
                <p className="text-xs text-slate-500 dark:text-slate-400">{d.blurb}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {THEME_KEYS.map((key) => {
                  const t = THEMES[key];
                  const selected = choice[d.key] === key;
                  return (
                    <label
                      key={key}
                      title={t.label}
                      className={`flex h-10 w-10 cursor-pointer items-center justify-center rounded-full transition focus-within:ring-2 focus-within:ring-slate-900 ${
                        selected ? "ring-2 ring-slate-900 ring-offset-2 dark:ring-slate-100 dark:ring-offset-slate-900" : "hover:scale-105"
                      }`}
                      style={{ background: t.tint }}
                    >
                      <input type="radio" name={d.key} value={key} checked={selected} onChange={() => pick(d.key, key)} className="sr-only" aria-label={`${d.label}: ${t.label}`} />
                      <span className="h-5 w-5 rounded-full" style={{ background: t.swatch }} />
                    </label>
                  );
                })}
              </div>
            </div>
            <div style={themeStyle(choice[d.key], d.key)} className="flex flex-wrap items-center gap-3 border-t border-emerald-100 bg-emerald-50 px-4 py-2.5 text-sm dark:border-emerald-900 dark:bg-emerald-950">
              <span className="font-semibold text-emerald-900 dark:text-emerald-100">{THEMES[choice[d.key]].label}</span>
              <span className="rounded-full bg-emerald-600 px-3 py-0.5 text-white">{d.label}</span>
              <span className="rounded-md bg-emerald-600 px-3 py-1 font-medium text-white">+ New</span>
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-100">Highlight</span>
            </div>
          </fieldset>
        ))}
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button type="submit" disabled={pending || (unchanged && !state?.message)} className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60">
          {pending ? "Saving…" : "Save colors"}
        </button>
        {state?.error && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{state.error}</p>}
        {state?.message && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">{state.message}</p>}
      </div>
    </form>
  );
}
