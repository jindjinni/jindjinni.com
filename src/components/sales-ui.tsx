import type { SalesStatus } from "@/lib/sales-rules";
import { STATUS_LABEL } from "@/lib/sales-rules";

// Small pieces every Sales screen shares. Status colors are fixed (not the department's emerald/amber, which the theme
// repaints), so Paid always reads green and Past due always reads red.

export const field = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-900";
export const card = "rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900";
export const primaryBtn = "rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60";
export const ghostBtn = "rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-white disabled:opacity-60 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-900";

const TONE: Record<SalesStatus | "PAST_DUE", string> = {
  DRAFT: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  SENT: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  PARTIALLY_PAID: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200",
  PAID: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
  ACCEPTED: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
  DECLINED: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
  CONVERTED: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  VOID: "bg-stone-200 text-stone-600 line-through dark:bg-stone-800 dark:text-stone-300",
  PAST_DUE: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
};

export function StatusChip({ status }: { status: SalesStatus | "PAST_DUE" }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${TONE[status]}`} data-testid="status-chip" data-status={status}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export const fmtMoney = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

/** "Oct 6, 2026" for a YYYY-MM-DD day. */
export function fmtDay(day: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day ?? "");
  if (!m) return day ?? "";
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}
