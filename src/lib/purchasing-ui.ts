// Colors and labels for the Purchasing screens (safe in the browser).

export const QUOTATION_STATUS_LABELS: Record<string, string> = {
  QUOTED: "Quoted",
  CONFIRMED: "Confirmed",
  RECEIVED: "Received",
  CANCELLED: "Cancelled",
};

/** Same pill shape everywhere; only the color tells the status. Received is always real green, whatever the company theme. */
export const QUOTATION_STATUS_PILL: Record<string, string> = {
  QUOTED: "bg-sky-100 text-sky-900 dark:bg-sky-900/50 dark:text-sky-100",
  CONFIRMED: "bg-violet-100 text-violet-900 dark:bg-violet-900/50 dark:text-violet-100",
  RECEIVED: "bg-green-100 text-green-900 dark:bg-green-900/50 dark:text-green-100",
  CANCELLED: "bg-rose-100 text-rose-900 dark:bg-rose-900/50 dark:text-rose-100",
};

export const PILL_BASE = "inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium";

/** Bigger quotations get a warmer, stronger pill so the valuable ones stand out at a glance. */
export function totalPillClass(total: number): string {
  if (total >= 1500) return "bg-amber-200 text-amber-950 dark:bg-amber-700/60 dark:text-amber-50";
  if (total >= 500) return "bg-emerald-200 text-emerald-950 dark:bg-emerald-700/60 dark:text-emerald-50";
  if (total >= 150) return "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-100";
  return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200";
}
