import Link from "next/link";
import { daysOf, dayLabel, isRangeKind, type RangeKind } from "@/lib/hr-rules";
import { addDays, isDay } from "@/lib/payment-due";

export const card = "rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900";
export const field = "rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-900";

export type RangeParams = { range?: string; day?: string; person?: string; kind?: string };

/** The page's day and range from its address; anything odd falls back to today and "day". */
export function readRange(sp: RangeParams, today: string): { kind: RangeKind; day: string } {
  const kind: RangeKind = isRangeKind(sp.range) ? sp.range : "day";
  const day = sp.day && isDay(sp.day) ? sp.day : today;
  return { kind, day };
}

const STATUS_TONE: Record<string, string> = {
  Working: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  "On break": "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300",
  "Clocked out": "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  Worked: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  "Not clocked in": "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  "Did not clock in": "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};
export function StatusPill({ status }: { status: string }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_TONE[status] ?? STATUS_TONE["Not clocked in"]}`} data-testid="hr-status" data-status={status}>
      {status}
    </span>
  );
}

/** Day / Week / Month and a date, as plain links and a small form, so it works with no script and keeps any other filter. */
export function RangeBar({ base, kind, day, today, extra }: { base: string; kind: RangeKind; day: string; today: string; extra?: Record<string, string | undefined> }) {
  const q = (r: RangeKind, d: string) => {
    const u = new URLSearchParams();
    u.set("range", r);
    u.set("day", d);
    for (const [k, v] of Object.entries(extra ?? {})) if (v) u.set(k, v);
    return `${base}?${u.toString()}`;
  };
  const step = kind === "day" ? 1 : kind === "week" ? 7 : 31;
  const span = daysOf(kind, day);
  const prev = kind === "month" ? daysOf("month", addDays(span.from, -1)).from : addDays(day, -step);
  const nextDay = kind === "month" ? addDays(span.to, 1) : addDays(day, step);
  const title = kind === "day" ? dayLabel(day) : `${dayLabel(span.from)} to ${dayLabel(span.to)}`;
  const btn = "rounded-lg border px-3 py-1.5 text-sm font-medium";
  return (
    <div className="flex flex-wrap items-end gap-3" data-testid="range-bar">
      <div className="flex overflow-hidden rounded-lg border border-slate-300 dark:border-slate-700" role="group" aria-label="Range">
        {(["day", "week", "month"] as const).map((r) => (
          <Link key={r} href={q(r, day)} aria-current={r === kind ? "true" : undefined} data-testid={`range-${r}`} className={`px-3 py-1.5 text-sm font-medium ${r === kind ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "bg-white text-slate-700 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"}`}>
            {r === "day" ? "Day" : r === "week" ? "Week" : "Month"}
          </Link>
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <Link href={q(kind, prev)} className={`${btn} border-slate-300 dark:border-slate-700`} aria-label="Earlier" data-testid="range-prev">‹</Link>
        <span className="min-w-40 text-center text-sm font-semibold text-slate-900 dark:text-slate-50" data-testid="range-title">{title}</span>
        <Link href={q(kind, nextDay)} className={`${btn} border-slate-300 dark:border-slate-700`} aria-label="Later" data-testid="range-next">›</Link>
      </div>
      <form method="get" action={base} className="flex items-end gap-2">
        <input type="hidden" name="range" value={kind} />
        {Object.entries(extra ?? {}).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
        <div>
          <label htmlFor="hr-day" className="block text-xs font-medium text-slate-700 dark:text-slate-300">Pick a date</label>
          <input id="hr-day" type="date" name="day" defaultValue={day} max={today} className={`${field} mt-0.5`} data-testid="range-date" />
        </div>
        <button className={`${btn} border-slate-300 hover:bg-white dark:border-slate-700 dark:hover:bg-slate-900`}>Show</button>
      </form>
      {day !== today && <Link href={q(kind, today)} className="pb-2 text-sm font-medium text-slate-700 underline dark:text-slate-300" data-testid="range-today">Back to today</Link>}
    </div>
  );
}

export function Tile({ label, value, sub, testid }: { label: string; value: string | number; sub?: string; testid?: string }) {
  return (
    <div className={`${card} p-4`}>
      <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-50" data-testid={testid}>{value}</p>
      {sub && <p className="text-xs text-slate-500 dark:text-slate-400">{sub}</p>}
    </div>
  );
}
