// HR rules, pure (reads and writes nothing): the time clock's states, how a day's presses turn into hours,
// and the day/time arithmetic in the company's time zone. The pages, the service and the tests all use this one place.

export type ClockKind = "CLOCK_IN" | "BREAK_START" | "BREAK_END" | "CLOCK_OUT";
export type ClockEvent = { kind: ClockKind; at: string };
export type ClockState = "OUT" | "WORKING" | "BREAK";

/** A shift left open this long is treated as a forgotten clock-out. */
export const STALE_SHIFT_HOURS = 16;

export const CLOCK_LABELS: Record<ClockKind, string> = {
  CLOCK_IN: "Clocked in",
  BREAK_START: "Started a break",
  BREAK_END: "Back from break",
  CLOCK_OUT: "Clocked out",
};

/** The state someone is in after their presses (earliest first). */
export function stateOf(events: ClockEvent[]): ClockState {
  let s: ClockState = "OUT";
  for (const e of sortEvents(events)) s = next(s, e.kind) ?? s;
  return s;
}

/** What a press does from a state; null when that press isn't allowed there. */
export function next(state: ClockState, kind: ClockKind): ClockState | null {
  if (state === "OUT") return kind === "CLOCK_IN" ? "WORKING" : null;
  if (state === "WORKING") return kind === "BREAK_START" ? "BREAK" : kind === "CLOCK_OUT" ? "OUT" : null;
  return kind === "BREAK_END" ? "WORKING" : kind === "CLOCK_OUT" ? "OUT" : null;
}

/** The buttons to show in a state, in order. */
export function buttonsFor(state: ClockState): { kind: ClockKind; label: string }[] {
  if (state === "OUT") return [{ kind: "CLOCK_IN", label: "Clock in" }];
  if (state === "WORKING") return [{ kind: "BREAK_START", label: "Start break" }, { kind: "CLOCK_OUT", label: "Clock out" }];
  return [{ kind: "BREAK_END", label: "End break" }, { kind: "CLOCK_OUT", label: "Clock out" }];
}

/** Why a press can't be made (plain words), or null when it can. */
export function refusal(state: ClockState, kind: ClockKind): string | null {
  if (next(state, kind)) return null;
  if (kind === "CLOCK_IN") return "You are already clocked in.";
  if (state === "OUT") return "Clock in first.";
  if (kind === "BREAK_START") return "You are already on a break.";
  return "You are not on a break.";
}

const byTime = (a: ClockEvent, b: ClockEvent) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0);
export const sortEvents = (events: ClockEvent[]) => [...events].sort(byTime);

export type Break = { start: string; end: string | null };
export type Shift = {
  start: string;
  end: string | null;
  breaks: Break[];
  /** Still open, and long enough that someone surely forgot to clock out. */
  forgotClockOut: boolean;
  /** Minutes worked, breaks taken off; null for a forgotten clock-out (there is no honest number). */
  workedMinutes: number | null;
  breakMinutes: number;
};

const mins = (from: string, to: string) => Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 60000));

/** Turns a person's presses into shifts. Presses that don't fit the sequence (a second clock-in, a stray break end) are skipped. */
export function buildShifts(events: ClockEvent[], nowIso: string): Shift[] {
  const out: Shift[] = [];
  let state: ClockState = "OUT";
  let cur: { start: string; breaks: Break[] } | null = null;
  const close = (end: string | null) => {
    if (!cur) return;
    const open = end === null;
    const stopAt = end ?? nowIso;
    const breaks = cur.breaks.map((b) => ({ start: b.start, end: b.end }));
    const breakMinutes = breaks.reduce((n, b) => n + mins(b.start, b.end ?? stopAt), 0);
    const stale = open && Date.parse(nowIso) - Date.parse(cur.start) > STALE_SHIFT_HOURS * 3600000;
    out.push({
      start: cur.start,
      end,
      breaks,
      forgotClockOut: stale,
      workedMinutes: stale ? null : Math.max(0, mins(cur.start, stopAt) - breakMinutes),
      breakMinutes,
    });
    cur = null;
  };
  for (const e of sortEvents(events)) {
    const to = next(state, e.kind);
    if (!to) continue;
    if (e.kind === "CLOCK_IN") cur = { start: e.at, breaks: [] };
    else if (e.kind === "BREAK_START") cur!.breaks.push({ start: e.at, end: null });
    else if (e.kind === "BREAK_END") cur!.breaks[cur!.breaks.length - 1].end = e.at;
    else if (e.kind === "CLOCK_OUT") {
      // Clocking out on a break ends the break at the same moment.
      const last = cur!.breaks[cur!.breaks.length - 1];
      if (last && !last.end) last.end = e.at;
      close(e.at);
    }
    state = to;
  }
  if (cur) close(null);
  return out;
}

/** The "now" status shown on the staff list. */
export function statusLabel(state: ClockState, anyShiftToday: boolean): string {
  if (state === "WORKING") return "Working";
  if (state === "BREAK") return "On break";
  return anyShiftToday ? "Clocked out" : "Not clocked in";
}

export type DaySummary = {
  shifts: Shift[];
  firstIn: string | null;
  lastOut: string | null;
  workedMinutes: number;
  breakMinutes: number;
  breakCount: number;
  forgotClockOut: boolean;
};

/** A day's hours: the shifts that STARTED on that local day (a shift past midnight counts for the day it began). */
export function summarizeDay(shifts: Shift[], day: string, tz: string): DaySummary {
  const mine = shifts.filter((s) => localDay(s.start, tz) === day);
  const ends = mine.map((s) => s.end).filter((e): e is string => !!e);
  return {
    shifts: mine,
    firstIn: mine.length ? mine[0].start : null,
    lastOut: ends.length && !mine[mine.length - 1].forgotClockOut && mine[mine.length - 1].end ? ends[ends.length - 1] : null,
    workedMinutes: mine.reduce((n, s) => n + (s.workedMinutes ?? 0), 0),
    breakMinutes: mine.reduce((n, s) => n + s.breakMinutes, 0),
    breakCount: mine.reduce((n, s) => n + s.breaks.length, 0),
    forgotClockOut: mine.some((s) => s.forgotClockOut),
  };
}

// ---- Days and times in the company's time zone ----

const p2 = (n: number) => String(n).padStart(2, "0");

export function localDay(iso: string, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
  return parts; // en-CA gives YYYY-MM-DD
}

/** "9:05 AM" in the company's time zone. */
export function localTime(iso: string | null | undefined, tz: string): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

/** "Sun, Oct 4" for a YYYY-MM-DD day. */
export function dayLabel(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).format(new Date(Date.UTC(y, m - 1, d)));
}

function offsetMinutes(utcMs: number, tz: string): number {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const get = (t: string) => Number(f.formatToParts(new Date(utcMs)).find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - utcMs) / 60000);
}

/** The UTC instant when `day` begins in `tz` (handles daylight-saving days). */
export function dayStartUtc(day: string, tz: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  let ms = guess - offsetMinutes(guess, tz) * 60000;
  ms = guess - offsetMinutes(ms, tz) * 60000;
  return new Date(ms).toISOString();
}

/** [start, end) in UTC for a run of days: `from` through `to` inclusive. */
export function rangeBounds(from: string, to: string, tz: string): { start: string; end: string } {
  const [y, m, d] = to.split("-").map(Number);
  const after = new Date(Date.UTC(y, m - 1, d + 1));
  const nextDay = `${after.getUTCFullYear()}-${p2(after.getUTCMonth() + 1)}-${p2(after.getUTCDate())}`;
  return { start: dayStartUtc(from, tz), end: dayStartUtc(nextDay, tz) };
}

// ---- The date picker's ranges ----

export type RangeKind = "day" | "week" | "month";
export const isRangeKind = (v: unknown): v is RangeKind => v === "day" || v === "week" || v === "month";

/** The days a pick covers: a day, the Monday-to-Sunday week it falls in, or its calendar month. */
export function daysOf(kind: RangeKind, day: string): { from: string; to: string; days: string[] } {
  const [y, m, d] = day.split("-").map(Number);
  let from = new Date(Date.UTC(y, m - 1, d));
  let to = new Date(from);
  if (kind === "week") {
    const wd = (from.getUTCDay() + 6) % 7; // Monday = 0
    from = new Date(Date.UTC(y, m - 1, d - wd));
    to = new Date(Date.UTC(y, m - 1, d - wd + 6));
  } else if (kind === "month") {
    from = new Date(Date.UTC(y, m - 1, 1));
    to = new Date(Date.UTC(y, m, 0));
  }
  const days: string[] = [];
  for (let t = from.getTime(); t <= to.getTime(); t += 86400000) {
    const x = new Date(t);
    days.push(`${x.getUTCFullYear()}-${p2(x.getUTCMonth() + 1)}-${p2(x.getUTCDate())}`);
  }
  return { from: days[0], to: days[days.length - 1], days };
}

/** "7h 05m", "45m", "0m". */
export function fmtDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  return h ? `${h}h ${p2(m % 60)}m` : `${m}m`;
}

// ---- Who shows on the HR pages, and what work counts for them ----

/** What each role's work is measured by on the staff list. Order is the order the columns appear. */
export type MetricKey = "quotations" | "labels" | "opened" | "received" | "emails" | "invoices" | "stock";
export const METRIC_LABELS: Record<MetricKey, string> = {
  quotations: "Quotations created",
  labels: "Orders sent (labels)",
  opened: "Packages opened",
  received: "Packages received",
  emails: "Customer emails",
  invoices: "Invoices sent",
  stock: "Stock changes",
};

export function metricsForRole(role: string): MetricKey[] {
  switch (role) {
    case "purchasing_agent":
    case "staff":
    case "purchasing_manager":
      return ["quotations", "labels", "invoices"];
    case "receiver":
      return ["opened", "received"];
    case "customer_service":
      return ["emails"];
    case "accountant":
      return [];
    default:
      // Owner and Admin do a bit of everything: show whichever of the above they have actually done.
      return ["quotations", "labels", "opened", "received", "emails", "invoices", "stock"];
  }
}

/** Groups the staff list by what they do, in this order. */
export const ROLE_ORDER = ["purchasing_manager", "purchasing_agent", "staff", "receiver", "customer_service", "accountant", "admin", "owner"] as const;

/** One line of the activity log: its words, and which metric (if any) it counts toward. */
export type FeedKind =
  | "SIGN_IN"
  | "CLOCK_IN"
  | "BREAK_START"
  | "BREAK_END"
  | "CLOCK_OUT"
  | "QUOTATION_CREATED"
  | "LABEL_SENT"
  | "PACKAGE_OPENED"
  | "PACKAGE_RECEIVED"
  | "CUSTOMER_EMAIL"
  | "INVOICE_SENT"
  | "QUOTE_SENT"
  | "PAYMENT_RECORDED"
  | "STOCK_CHANGE"
  | "OTHER";

export const FEED_GROUPS: { key: string; label: string; kinds: FeedKind[] }[] = [
  { key: "time", label: "Time clock", kinds: ["SIGN_IN", "CLOCK_IN", "BREAK_START", "BREAK_END", "CLOCK_OUT"] },
  { key: "purchasing", label: "Purchasing", kinds: ["QUOTATION_CREATED", "LABEL_SENT"] },
  { key: "receiving", label: "Receiving", kinds: ["PACKAGE_OPENED", "PACKAGE_RECEIVED"] },
  { key: "customer-service", label: "Customer Service", kinds: ["CUSTOMER_EMAIL"] },
  { key: "sales", label: "Sales and stock", kinds: ["INVOICE_SENT", "QUOTE_SENT", "PAYMENT_RECORDED", "STOCK_CHANGE", "OTHER"] },
];

export const METRIC_OF_KIND: Partial<Record<FeedKind, MetricKey>> = {
  QUOTATION_CREATED: "quotations",
  LABEL_SENT: "labels",
  PACKAGE_OPENED: "opened",
  PACKAGE_RECEIVED: "received",
  CUSTOMER_EMAIL: "emails",
  INVOICE_SENT: "invoices",
  STOCK_CHANGE: "stock",
};

export const ACTIVITY_KINDS: FeedKind[] = ["LABEL_SENT", "INVOICE_SENT", "QUOTE_SENT", "PAYMENT_RECORDED", "STOCK_CHANGE", "OTHER"];
export const isActivityKind = (v: string): v is FeedKind => (ACTIVITY_KINDS as string[]).includes(v);

/** The database stamps "YYYY-MM-DD HH:MM:SS" (UTC, no zone); everything else is ISO. Both become ISO here. */
export function normIso(s: string | null | undefined): string | null {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) return `${s.replace(" ", "T")}Z`;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}
