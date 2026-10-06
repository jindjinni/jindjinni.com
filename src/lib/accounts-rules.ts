// Pure helpers for the Accounts department (no database): who is waiting to be paid, how orders are grouped under
// their day, and the totals shown on each group. Safe to import from the browser.

export type AccountsOrder = {
  id: string;
  quotationNumber: string;
  customerName: string;
  trackingNumber: string | null;
  /** When the package was received, "YYYY-MM-DD HH:MM:SS" exactly as the receiver entered it. */
  receivedAt: string | null;
  /** When Accounts marked it Paid, "YYYY-MM-DD HH:MM:SS" in UTC (the app stamps it). Null while unpaid. */
  paidAt: string | null;
  /** What the customer is paid: the adjusted total when Receiving set one, otherwise the quoted total. */
  amount: number;
  adjusted: boolean;
  /** How many payment receipts are attached. */
  receipts: number;
  /** The first receipt, for a quick link. */
  receiptId: string | null;
  /** The unopened-package photo Receiving took, for the small card. */
  coverPhotoId: string | null;
};

export type DayGroup = { day: string; orders: AccountsOrder[]; total: number; receipts: number };

/** The date part of a stamp ("YYYY-MM-DD"), or "" when there isn't one. */
export function dayOf(stamp: string | null | undefined): string {
  const m = stamp ? /^(\d{4}-\d{2}-\d{2})/.exec(stamp) : null;
  return m ? m[1] : "";
}

/** The viewer's own calendar day of a UTC stamp ("YYYY-MM-DD HH:MM:SS"). Only call in the browser: it uses that computer's time zone. */
export function localDayOfUtc(stamp: string | null | undefined): string {
  const m = stamp ? /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):?(\d{2})?/.exec(stamp) : null;
  if (!m) return "";
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0)));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const cents = (n: number) => Math.round(n * 100);
export const sumAmounts = (orders: { amount: number }[]) => orders.reduce((n, o) => n + cents(o.amount), 0) / 100;

/** Groups orders under a day. `dayFor` says which day an order belongs to; `newestFirst` orders the groups. Orders with no day go last under "". */
export function groupByDay(orders: AccountsOrder[], dayFor: (o: AccountsOrder) => string, newestFirst: boolean): DayGroup[] {
  const by = new Map<string, AccountsOrder[]>();
  for (const o of orders) {
    const d = dayFor(o);
    by.set(d, [...(by.get(d) ?? []), o]);
  }
  const days = [...by.keys()].filter((d) => d !== "").sort();
  if (newestFirst) days.reverse();
  if (by.has("")) days.push("");
  return days.map((day) => {
    const list = by.get(day)!;
    return { day, orders: list, total: sumAmounts(list), receipts: list.filter((o) => o.receipts > 0).length };
  });
}

/** "Saturday, Oct 3, 2026" for a YYYY-MM-DD day (read as written, no time-zone shift). */
export function dayHeading(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  if (!y || !m || !d) return "No date";
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** Does a search word match this order (customer, quotation number, tracking number)? */
export function orderMatches(o: AccountsOrder, q: string): boolean {
  const t = q.trim().toLowerCase();
  if (!t) return true;
  return `${o.customerName} ${o.quotationNumber} ${o.trackingNumber ?? ""}`.toLowerCase().includes(t);
}

/** The time of day of a UTC stamp in the viewer's own time zone ("6:45 PM"). Only call in the browser. */
export function localTimeOfUtc(stamp: string | null | undefined): string {
  const m = stamp ? /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):?(\d{2})?/.exec(stamp) : null;
  if (!m) return "";
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0))).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** One line of the Monthly Report: who was paid, for what, how much, and when. (The quotation number is left out on purpose.) */
export type ReportOrder = {
  id: string;
  customerName: string;
  /** UTC stamp, "YYYY-MM-DD HH:MM:SS". */
  paidAt: string;
  /** The complete items quoted, one entry each ("Omnipod 5 5pk (G6/G7) (x8)"). */
  items: string[];
  /** The final payout: the adjusted total when Receiving set one, otherwise the quoted total. */
  payout: number;
};

/** "2026-10" for a viewer-local "YYYY-MM-DD" day. */
export const monthOfDay = (day: string) => day.slice(0, 7);

export const isMonth = (v: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

/** The month before or after "YYYY-MM". */
export function shiftMonth(month: string, by: -1 | 1): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** "October 2026" for "2026-10". */
export function monthHeading(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** The UTC window that is certain to hold every payment of a month on any time zone: the month plus a day either side. */
export function monthWindowUtc(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const fmt = (d: Date) => d.toISOString().slice(0, 19).replace("T", " ");
  return { start: fmt(new Date(Date.UTC(y, m - 1, 0))), end: fmt(new Date(Date.UTC(y, m, 2))) };
}
