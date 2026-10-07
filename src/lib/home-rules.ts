// Pure helpers for the Home screen's "Company performance": which days make up Today / This week / This month (in the
// company's own time zone) and how the numbers are worded. Reads nothing.

import { addDays } from "@/lib/payment-due";

export type Period = "today" | "week" | "month";
export const PERIODS: { key: Period; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
];
export const isPeriod = (v: unknown): v is Period => v === "today" || v === "week" || v === "month";

const weekday = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay(); // 0 = Sunday

/** The first day (YYYY-MM-DD) of a period that ends today: today itself, the Monday of this week, or the 1st of this month. */
export function periodStart(period: Period, today: string): string {
  if (period === "today") return today;
  if (period === "month") return `${today.slice(0, 7)}-01`;
  const back = (weekday(today) + 6) % 7; // Monday = 0 days back
  return addDays(today, -back);
}

/** True when a day falls on or after the start of the period (and not in the future). */
export const inPeriod = (day: string, period: Period, today: string) => !!day && day >= periodStart(period, today) && day <= today;

export const PERIOD_WORDS: Record<Period, string> = { today: "today", week: "this week", month: "this month" };

export function money(n: number): string {
  const whole = Math.abs(n) >= 100_000;
  return `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 })}`;
}

/** Whole dollars, for big-number tiles where cents only add clutter. */
export const moneyWhole = (n: number) => `${n < 0 ? "-" : ""}$${Math.round(Math.abs(n)).toLocaleString("en-US")}`;

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** "Good morning" / "Good afternoon" / "Good evening" for an hour of the day (0 to 23). */
export const greeting = (hour: number) => (hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening");

/** The hour (0 to 23) right now in a time zone. */
export function hourIn(timeZone: string, now: Date = new Date()): number {
  try {
    const h = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hour12: false }).formatToParts(now).find((p) => p.type === "hour")?.value;
    return Number(h) % 24;
  } catch {
    return now.getUTCHours();
  }
}

/** "Wednesday, October 7" for a day (YYYY-MM-DD). */
export const longDay = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
