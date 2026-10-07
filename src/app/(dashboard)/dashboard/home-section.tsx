"use client";

import { useId, useState } from "react";

export type Chip = { text: string; tone: "red" | "amber" | "green" | "slate" };

const TONE: Record<Chip["tone"], string> = {
  red: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  amber: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  green: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  slate: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

/** A big closed-until-opened card on the Home screen: a heading with its key numbers, and the detail underneath when opened. */
export function HomeSection({ id, title, blurb, chips, preview, children }: { id: string; title: string; blurb: string; chips: Chip[]; preview?: string[]; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const panel = useId();
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900" data-testid={`home-section-${id}`}>
      <button type="button" aria-expanded={open} aria-controls={panel} onClick={() => setOpen((o) => !o)} className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-emerald-600 dark:hover:bg-slate-800/60">
        <span className="min-w-0">
          <span className="block text-lg font-bold text-slate-900 dark:text-slate-50">{title}</span>
          <span className="mt-0.5 block text-sm text-slate-500 dark:text-slate-400">{blurb}</span>
          <span className="mt-3 flex flex-wrap gap-2" data-testid={`home-chips-${id}`}>
            {chips.map((c) => (
              <span key={c.text} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${TONE[c.tone]}`}>
                {c.text}
              </span>
            ))}
          </span>
          {!open && preview && preview.length > 0 && (
            <span className="mt-3 block space-y-0.5 text-sm text-slate-700 dark:text-slate-300" data-testid={`home-preview-${id}`}>
              {preview.map((p) => (
                <span key={p} className="flex gap-2">
                  <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                  <span className="truncate">{p}</span>
                </span>
              ))}
            </span>
          )}
        </span>
        <span className="mt-1 flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 dark:border-slate-700 dark:text-slate-300">
          {open ? "Close" : "Open"}
          <span aria-hidden="true">{open ? "▴" : "▾"}</span>
        </span>
      </button>
      <div id={panel} hidden={!open} className="border-t border-slate-100 px-5 pb-5 dark:border-slate-800">
        {children}
      </div>
    </section>
  );
}
