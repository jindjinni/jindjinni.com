// Small display helpers shared by the Receiving screens (safe in the browser).

const CHIPS = [
  "bg-sky-100 text-sky-900 dark:bg-sky-900/50 dark:text-sky-100",
  "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-100",
  "bg-violet-100 text-violet-900 dark:bg-violet-900/50 dark:text-violet-100",
  "bg-rose-100 text-rose-900 dark:bg-rose-900/50 dark:text-rose-100",
  "bg-teal-100 text-teal-900 dark:bg-teal-900/50 dark:text-teal-100",
  "bg-orange-100 text-orange-900 dark:bg-orange-900/50 dark:text-orange-100",
  "bg-indigo-100 text-indigo-900 dark:bg-indigo-900/50 dark:text-indigo-100",
  "bg-lime-100 text-lime-900 dark:bg-lime-900/50 dark:text-lime-100",
];

/** The same customer always gets the same colored chip, like the old Airtable view. */
export function chipClass(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return CHIPS[h % CHIPS.length];
}

export const STATUS_PILL: Record<string, string> = {
  IN_PROGRESS: "bg-yellow-100 text-yellow-900 dark:bg-yellow-900/40 dark:text-yellow-100",
  RECEIVING_COMPLETE: "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-100",
  RECEIVING_COMPLETE_WITH_DISCREPANCY: "bg-orange-100 text-orange-900 dark:bg-orange-900/40 dark:text-orange-100",
};

export const MONEY = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** "2026-10-04 13:05:00" -> "Oct 4, 2026 1:05 PM" (shown exactly as entered, no time-zone shift). */
export function formatStamp(v: string | null | undefined): string {
  const m = v ? /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(v) : null;
  if (!m) return "—";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const h = Number(m[4]);
  return `${months[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]} ${h % 12 || 12}:${m[5]} ${h < 12 ? "AM" : "PM"}`;
}
