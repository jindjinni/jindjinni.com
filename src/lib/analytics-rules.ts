// Pure rules for the Home screen's company analytics: how far each quotation got, whether it ended well, how payments
// are spread over their due days, and the small day-by-day series. Reads nothing, so every rule here is tested.

import { addDays, daysBetween } from "@/lib/payment-due";

/** What the analytics need to know about one quotation (and its receiving record, if it has one). */
export type QuoteFacts = {
  /** The day the quotation was given (YYYY-MM-DD). */
  day: string;
  status: "QUOTED" | "CONFIRMED" | "RECEIVED" | "CANCELLED";
  /** A free shipping label was bought and handed to the customer. */
  labelProvided: boolean;
  /** A tracking number is on file. */
  hasTracking: boolean;
  /** The carrier says it was delivered to us. */
  delivered: boolean;
  packageStatus: string;
  /** Receiving finished with the package (a submitted receiving record exists). */
  receivedByUs: boolean;
  /** What Accounts decided after Receiving, if anything. */
  decision: string | null;
};

export type Outcome = "successful" | "unsuccessful" | "open";

/** The steps a quotation can go through, in order. */
export const FUNNEL_STEPS = [
  { key: "given", label: "Quotation given", note: "Every quotation we gave" },
  { key: "confirmed", label: "Confirmed by the customer", note: "The customer said yes" },
  { key: "fullProcess", label: "Label and tracking number provided", note: "A free shipping label was given and a tracking number is on file" },
  { key: "delivered", label: "Delivered to us", note: "The carrier says the package arrived" },
  { key: "received", label: "Received by Receiving", note: "Opened and checked by our team" },
] as const;
export type FunnelKey = (typeof FUNNEL_STEPS)[number]["key"];

export type Funnel = Record<FunnelKey, number> & { successful: number; unsuccessful: number; inProgress: number };

export const emptyFunnel = (): Funnel => ({ given: 0, confirmed: 0, fullProcess: 0, delivered: 0, received: 0, successful: 0, unsuccessful: 0, inProgress: 0 });

/**
 * How a quotation ended up.
 * Unsuccessful: it was cancelled, the package came back to the customer, or Accounts decided it must be returned.
 * Successful: Receiving received it and it was not sent back.
 * Open: still on its way somewhere in between.
 */
export function outcomeOf(q: QuoteFacts): Outcome {
  if (q.status === "CANCELLED" || q.packageStatus === "Returned" || q.decision === "NEED_TO_BE_RETURNED") return "unsuccessful";
  if (q.receivedByUs || q.status === "RECEIVED") return "successful";
  return "open";
}

/** Which steps a quotation reached. A later step reached means the earlier ones were passed too, so the bars only ever shrink. */
export function stepsReached(q: QuoteFacts): Record<FunnelKey, boolean> {
  const received = q.receivedByUs || q.status === "RECEIVED";
  const delivered = q.delivered || received;
  const fullProcess = (q.labelProvided && q.hasTracking) || delivered;
  const confirmed = q.status === "CONFIRMED" || q.status === "RECEIVED" || fullProcess;
  return { given: true, confirmed, fullProcess, delivered, received };
}

export function buildFunnel(rows: QuoteFacts[]): Funnel {
  const f = emptyFunnel();
  for (const q of rows) {
    const s = stepsReached(q);
    for (const { key } of FUNNEL_STEPS) if (s[key]) f[key]++;
    const o = outcomeOf(q);
    if (o === "successful") f.successful++;
    else if (o === "unsuccessful") f.unsuccessful++;
    else f.inProgress++;
  }
  return f;
}

/** A whole-number percentage, 0 when there is nothing to divide by. */
export const pct = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : 0);

/** How many were lost between one step and the next (never negative). */
export const dropped = (earlier: number, later: number) => Math.max(0, earlier - later);

// ---- Accounts: when payments are due ----

export type DueBucketKey = "overdueLong" | "overdue" | "today" | "tomorrow" | "later" | "noDay";
export const DUE_BUCKETS: { key: DueBucketKey; label: string }[] = [
  { key: "overdueLong", label: "Overdue more than a week" },
  { key: "overdue", label: "Overdue" },
  { key: "today", label: "Due today" },
  { key: "tomorrow", label: "Due tomorrow" },
  { key: "later", label: "Due later" },
  { key: "noDay", label: "No due day yet" },
];
export type DueBuckets = Record<DueBucketKey, { count: number; amount: number }>;

export const emptyBuckets = (): DueBuckets => ({ overdueLong: { count: 0, amount: 0 }, overdue: { count: 0, amount: 0 }, today: { count: 0, amount: 0 }, tomorrow: { count: 0, amount: 0 }, later: { count: 0, amount: 0 }, noDay: { count: 0, amount: 0 } });

export function bucketOf(dueDay: string | null | undefined, today: string): DueBucketKey {
  if (!dueDay) return "noDay";
  if (dueDay < today) return daysBetween(dueDay, today) > 7 ? "overdueLong" : "overdue";
  if (dueDay === today) return "today";
  return dueDay === addDays(today, 1) ? "tomorrow" : "later";
}

/** Sorts unpaid orders into the due buckets. Amounts are added in cents so they never drift. */
export function bucketOrders(orders: { dueDay?: string | null; amount: number }[], today: string): DueBuckets {
  const cents = emptyBuckets();
  for (const o of orders) {
    const b = cents[bucketOf(o.dueDay, today)];
    b.count++;
    b.amount += Math.round(o.amount * 100);
  }
  const out = emptyBuckets();
  for (const { key } of DUE_BUCKETS) out[key] = { count: cents[key].count, amount: cents[key].amount / 100 };
  return out;
}

// ---- Day-by-day series ----

/** The last `n` days ending today, oldest first. */
export function lastDays(today: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addDays(today, i - (n - 1)));
}

/** How many of the given days (one entry per event) fall on each listed day. */
export function countByDay(days: string[], events: string[]): number[] {
  const at = new Map(days.map((d, i) => [d, i]));
  const out = days.map(() => 0);
  for (const e of events) {
    const i = at.get(e);
    if (i !== undefined) out[i]++;
  }
  return out;
}

/** "Mon 5" style short label for a day. */
export const shortDay = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", day: "numeric", timeZone: "UTC" });
