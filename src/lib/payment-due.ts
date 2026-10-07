// When is a customer's payment due? Pure rules (no database), safe to import from the browser.
//
// A company pays a customer within N business days after the package is delivered. Business days skip weekends,
// US federal holidays (when the company keeps that on) and the company's own closure days. Days are plain
// "YYYY-MM-DD" strings read as written, so nothing shifts with a time zone.

export type PaymentTerms = { businessDays: number; skipUsHolidays: boolean; timeZone: string; closureDays: string[] };

export const DEFAULT_TERMS: PaymentTerms = { businessDays: 3, skipUsHolidays: true, timeZone: "America/New_York", closureDays: [] };
export const MAX_BUSINESS_DAYS = 30;

export const US_TIME_ZONES: { value: string; label: string }[] = [
  { value: "America/New_York", label: "Eastern" },
  { value: "America/Chicago", label: "Central" },
  { value: "America/Denver", label: "Mountain" },
  { value: "America/Phoenix", label: "Arizona (no daylight saving)" },
  { value: "America/Los_Angeles", label: "Pacific" },
  { value: "America/Anchorage", label: "Alaska" },
  { value: "Pacific/Honolulu", label: "Hawaii" },
];
export const isUsTimeZone = (v: string) => US_TIME_ZONES.some((z) => z.value === v);

const p2 = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${p2(m)}-${p2(d)}`;
const fromIso = (day: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
};
export const isDay = (v: string) => {
  const t = fromIso(v);
  if (!t) return false;
  const d = new Date(Date.UTC(t.y, t.m - 1, t.d));
  return d.getUTCFullYear() === t.y && d.getUTCMonth() === t.m - 1 && d.getUTCDate() === t.d;
};
const utc = (day: string) => {
  const t = fromIso(day)!;
  return new Date(Date.UTC(t.y, t.m - 1, t.d));
};
const dayOfDate = (d: Date) => iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
/** The day after `day` (or before, with a negative step). */
export const addDays = (day: string, n: number) => {
  const d = utc(day);
  d.setUTCDate(d.getUTCDate() + n);
  return dayOfDate(d);
};
const weekday = (day: string) => utc(day).getUTCDay(); // 0 = Sunday
export const isWeekend = (day: string) => weekday(day) === 0 || weekday(day) === 6;

/** The nth (1-based) given weekday of a month; n = -1 means the last one. */
function nthWeekday(y: number, m: number, wd: number, n: number): string {
  if (n > 0) {
    const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    return iso(y, m, 1 + ((wd - first + 7) % 7) + (n - 1) * 7);
  }
  const last = new Date(Date.UTC(y, m, 0));
  return iso(y, m, last.getUTCDate() - ((last.getUTCDay() - wd + 7) % 7));
}

/** A fixed-date holiday is observed on the Friday before when it falls on a Saturday, the Monday after when on a Sunday. */
function observed(y: number, m: number, d: number): string {
  const day = iso(y, m, d);
  const wd = weekday(day);
  return wd === 6 ? addDays(day, -1) : wd === 0 ? addDays(day, 1) : day;
}

/** The days the US federal government observes as holidays in a year (the dates banks and most payables systems close). */
export function usFederalHolidays(y: number): { day: string; name: string }[] {
  return [
    { day: observed(y, 1, 1), name: "New Year's Day" },
    { day: nthWeekday(y, 1, 1, 3), name: "Martin Luther King Jr. Day" },
    { day: nthWeekday(y, 2, 1, 3), name: "Presidents' Day" },
    { day: nthWeekday(y, 5, 1, -1), name: "Memorial Day" },
    { day: observed(y, 6, 19), name: "Juneteenth" },
    { day: observed(y, 7, 4), name: "Independence Day" },
    { day: nthWeekday(y, 9, 1, 1), name: "Labor Day" },
    { day: nthWeekday(y, 10, 1, 2), name: "Columbus Day" },
    { day: observed(y, 11, 11), name: "Veterans Day" },
    { day: nthWeekday(y, 11, 4, 4), name: "Thanksgiving" },
    { day: observed(y, 12, 25), name: "Christmas Day" },
  ];
}

/** Every holiday day that can matter around a year (a holiday observed early can land in the year before). */
function holidaySet(years: number[]): Set<string> {
  const out = new Set<string>();
  for (const y of years) for (const h of usFederalHolidays(y)) out.add(h.day);
  return out;
}

export function isBusinessDay(day: string, terms: Pick<PaymentTerms, "skipUsHolidays" | "closureDays">): boolean {
  if (isWeekend(day)) return false;
  if (terms.closureDays.includes(day)) return false;
  if (terms.skipUsHolidays) {
    const y = utc(day).getUTCFullYear();
    if (holidaySet([y - 1, y, y + 1]).has(day)) return false;
  }
  return true;
}

/**
 * The day that is `n` business days after `startDay`. The start day itself is day zero, so a package delivered on a
 * Friday with 3 business days is due the next Wednesday. With n = 0 the payment is due the start day (or the next
 * business day when the start day is not one).
 */
export function addBusinessDays(startDay: string, n: number, terms: Pick<PaymentTerms, "skipUsHolidays" | "closureDays">): string {
  let day = startDay;
  let left = Math.max(0, Math.floor(n));
  if (left === 0) {
    while (!isBusinessDay(day, terms)) day = addDays(day, 1);
    return day;
  }
  while (left > 0) {
    day = addDays(day, 1);
    if (isBusinessDay(day, terms)) left--;
  }
  return day;
}

/** The calendar day of a UTC stamp ("YYYY-MM-DD HH:MM:SS") in a time zone. */
export function dayInZone(stamp: string | null | undefined, timeZone: string): string {
  const m = stamp ? /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):?(\d{2})?/.exec(stamp) : null;
  if (!m) return "";
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0)));
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
    const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    return `${g("year")}-${g("month")}-${g("day")}`;
  } catch {
    return `${m[1]}-${m[2]}-${m[3]}`;
  }
}

/** The date part of a stamp read as written (Receiving's own received time is never shifted). */
export const dayAsWritten = (stamp: string | null | undefined) => (stamp && /^(\d{4}-\d{2}-\d{2})/.exec(stamp)?.[1]) || "";

export type DueInfo = {
  /** The day payment is due ("YYYY-MM-DD"). */
  dueDay: string;
  /** The day the clock started. */
  startDay: string;
  /** DELIVERED = the delivered day is on file; RECEIVED = it isn't, so the day Receiving received it is used. */
  basis: "DELIVERED" | "RECEIVED";
};

/** When a package's payment is due, or null when there is no day to count from. */
export function paymentDue(pkg: { deliveredAt: string | null; receivedAt: string | null }, terms: PaymentTerms): DueInfo | null {
  const delivered = dayInZone(pkg.deliveredAt, terms.timeZone);
  const startDay = delivered || dayAsWritten(pkg.receivedAt);
  if (!startDay) return null;
  return { dueDay: addBusinessDays(startDay, terms.businessDays, terms), startDay, basis: delivered ? "DELIVERED" : "RECEIVED" };
}

/** Today's calendar day in a time zone. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  return dayInZone(now.toISOString().slice(0, 19).replace("T", " "), timeZone);
}

export type DueState = "OVERDUE" | "TODAY" | "TOMORROW" | "LATER";

/** Overdue, due today, due tomorrow, or later, as of `today`. */
export function dueState(dueDay: string, today: string): DueState {
  if (dueDay < today) return "OVERDUE";
  if (dueDay === today) return "TODAY";
  return dueDay === addDays(today, 1) ? "TOMORROW" : "LATER";
}

/** Whole calendar days between two days (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((utc(b).getTime() - utc(a).getTime()) / 86_400_000);
}
