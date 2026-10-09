"use client";

import { useId, useState } from "react";
import type { MiniKind, MiniSegment } from "@/lib/analytics-mini";

export type Chip = { text: string; tone: "red" | "amber" | "green" | "slate" };

const TONE: Record<Chip["tone"], string> = {
  red: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  amber: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  green: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  slate: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

// Colors for the thin summary bar: how something ended or how urgent it is use the fixed status colors; steps use one blue hue.
const KIND: Record<MiniKind, string> = {
  good: "bg-[#0ca30c]",
  critical: "bg-[#d03b3b]",
  serious: "bg-[#ec835a]",
  warning: "bg-[#fab219]",
  neutral: "bg-[#898781]",
  blueLight: "bg-[#86b6ef] dark:bg-[#6da7ec]",
  blue: "bg-[#2a78d6] dark:bg-[#3987e5]",
  blueDark: "bg-[#104281] dark:bg-[#9ec5f4]",
};

/** One thin stacked bar for the closed state of a section. The chips beside it carry the numbers, so the bar is only a picture. */
export function MiniBar({ segments }: { segments: MiniSegment[] }) {
  const total = segments.reduce((n, s) => n + s.n, 0);
  return (
    <span aria-hidden="true" className="mt-2 flex h-1.5 max-w-md gap-[2px]" data-testid="mini-bar">
      {total === 0 ? (
        <span className="h-full w-full rounded-full bg-slate-200 dark:bg-slate-700" />
      ) : (
        segments.map((s) => (s.n > 0 ? <span key={s.key} title={`${s.label}: ${s.n}`} className={`h-full rounded-full ${KIND[s.kind]}`} style={{ width: `${(s.n / total) * 100}%`, minWidth: "6px" }} /> : null))
      )}
    </span>
  );
}

/**
 * A closed-until-opened section of the Home screen: a slim heading with its key numbers (and an optional thin bar), and the
 * detail underneath when opened. It can keep its own open/closed state, or be told (`open` + `onToggle`) so the Home screen can
 * remember it. `controls` sit beside the heading (the move arrows while the person is arranging the screen).
 */
export function HomeSection({
  id,
  title,
  blurb,
  chips,
  preview,
  mini,
  dot,
  open: openProp,
  onToggle,
  controls,
  children,
}: {
  id: string;
  title: string;
  blurb: string;
  chips: Chip[];
  preview?: string[];
  mini?: React.ReactNode;
  dot?: string;
  open?: boolean;
  onToggle?: () => void;
  controls?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [own, setOwn] = useState(false);
  const open = openProp ?? own;
  const toggle = onToggle ?? (() => setOwn((o) => !o));
  const panel = useId();
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900" data-testid={`home-section-${id}`}>
      <div className="flex items-start">
        <button type="button" aria-expanded={open} aria-controls={panel} onClick={toggle} data-testid={`home-toggle-${id}`} className="flex min-w-0 flex-1 items-start justify-between gap-3 rounded-2xl px-4 py-3 text-left hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-emerald-600 dark:hover:bg-slate-800/60">
          <span className="min-w-0">
            <span className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-slate-50">
              {dot && <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} />}
              {title}
            </span>
            <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{blurb}</span>
            <span className="mt-2 flex flex-wrap gap-1.5" data-testid={`home-chips-${id}`}>
              {chips.map((c) => (
                <span key={c.text} className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONE[c.tone]}`}>
                  {c.text}
                </span>
              ))}
            </span>
            {!open && mini}
            {!open && preview && preview.length > 0 && (
              <span className="mt-2 block space-y-0.5 text-sm text-slate-700 dark:text-slate-300" data-testid={`home-preview-${id}`}>
                {preview.map((p) => (
                  <span key={p} className="flex gap-2">
                    <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                    <span className="truncate">{p}</span>
                  </span>
                ))}
              </span>
            )}
          </span>
          <span className="mt-0.5 flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:border-slate-700 dark:text-slate-300">
            {open ? "Close" : "Open"}
            <span aria-hidden="true">{open ? "▴" : "▾"}</span>
          </span>
        </button>
        {controls}
      </div>
      <div id={panel} hidden={!open} className="border-t border-slate-100 px-4 pb-4 dark:border-slate-800">
        {children}
      </div>
    </section>
  );
}
