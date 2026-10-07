// HR: the time clock, the activity log and the per-person numbers. Reads what the other departments already record
// (who created each quotation, who opened and submitted each package, who sent each email, every sign-in) and adds the
// time clock and a small log for work nobody stamped yet. Everything is scoped to one company.
import { and, asc, eq, gte, inArray, isNull, lt } from "drizzle-orm";
import { db } from "@/db/client";
import {
  hrActivity,
  hrTimeEvents,
  memberships,
  purchasingQuotations,
  receivingCustomerEmails,
  receivingPackages,
  signInEvents,
  users,
} from "@/db/schema";
import { newId } from "@/lib/ids";
import { getPaymentTerms } from "@/lib/accounts-queries";
import { todayIn } from "@/lib/payment-due";
import {
  buildShifts,
  buttonsFor,
  CLOCK_LABELS,
  daysOf,
  localDay,
  METRIC_OF_KIND,
  metricsForRole,
  normIso,
  rangeBounds,
  refusal,
  sortEvents,
  stateOf,
  statusLabel,
  summarizeDay,
  type ClockEvent,
  type ClockKind,
  type ClockState,
  type DaySummary,
  type FeedKind,
  type MetricKey,
  type RangeKind,
} from "@/lib/hr-rules";

export type Org = { organizationId: string; userId: string };

export async function companyZone(organizationId: string): Promise<string> {
  return (await getPaymentTerms(organizationId)).timeZone;
}

// ---------------------------------------------------------------------------
// The time clock
// ---------------------------------------------------------------------------

const CLOCK_LOOKBACK_DAYS = 3;

async function eventsFor(organizationId: string, userId: string, sinceIso: string): Promise<ClockEvent[]> {
  const rows = await db
    .select({ kind: hrTimeEvents.kind, at: hrTimeEvents.at })
    .from(hrTimeEvents)
    .where(and(eq(hrTimeEvents.organizationId, organizationId), eq(hrTimeEvents.userId, userId), gte(hrTimeEvents.at, sinceIso)))
    .orderBy(asc(hrTimeEvents.at));
  return rows;
}

export type MyClock = {
  state: ClockState;
  buttons: { kind: ClockKind; label: string }[];
  /** When the current shift began (ISO), for "since 9:05 AM". */
  since: string | null;
  /** Worked and break minutes so far in the shift that is open now or the last one today. */
  workedMinutes: number;
  breakMinutes: number;
  zone: string;
};

export async function getMyClock(org: Org, nowIso = new Date().toISOString()): Promise<MyClock> {
  const zone = await companyZone(org.organizationId);
  const since = new Date(Date.parse(nowIso) - CLOCK_LOOKBACK_DAYS * 86400000).toISOString();
  const events = await eventsFor(org.organizationId, org.userId, since);
  const state = stateOf(events);
  const shifts = buildShifts(events, nowIso);
  const last = shifts[shifts.length - 1];
  const today = localDay(nowIso, zone);
  const day = summarizeDay(shifts, today, zone);
  return {
    state,
    buttons: buttonsFor(state),
    since: state !== "OUT" && last ? last.start : null,
    workedMinutes: day.workedMinutes,
    breakMinutes: day.breakMinutes,
    zone,
  };
}

/** A person's own press. Clocking out while on a break ends the break at the same moment. */
export async function pressClock(org: Org, kind: ClockKind, nowIso = new Date().toISOString()): Promise<{ ok: true } | { ok: false; error: string }> {
  const since = new Date(Date.parse(nowIso) - CLOCK_LOOKBACK_DAYS * 86400000).toISOString();
  const events = await eventsFor(org.organizationId, org.userId, since);
  const state = stateOf(events);
  const why = refusal(state, kind);
  if (why) return { ok: false, error: why };
  const rows: (typeof hrTimeEvents.$inferInsert)[] = [];
  if (kind === "CLOCK_OUT" && state === "BREAK") rows.push({ id: newId("hrt"), organizationId: org.organizationId, userId: org.userId, kind: "BREAK_END", at: nowIso });
  rows.push({ id: newId("hrt"), organizationId: org.organizationId, userId: org.userId, kind, at: nowIso });
  await db.insert(hrTimeEvents).values(rows);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// The activity log
// ---------------------------------------------------------------------------

/** Writes one line of work nobody else stamped. Never throws: a failed log line must not undo the work itself. */
export async function logActivity(org: Org, kind: FeedKind, label: string, ref?: { type: string; id: string } | null): Promise<void> {
  try {
    await db.insert(hrActivity).values({
      id: newId("hra"),
      organizationId: org.organizationId,
      userId: org.userId,
      kind,
      label: label.slice(0, 240),
      refType: ref?.type ?? null,
      refId: ref?.id ?? null,
      at: new Date().toISOString(),
    });
  } catch {
    /* ignore */
  }
}

export type FeedRow = { id: string; at: string; userId: string; kind: FeedKind; label: string; refType: string | null; refId: string | null };

export type Person = { userId: string; name: string; email: string; role: string; lastLoginAt: string | null };

/** Everyone with active access to this company. */
export async function listPeople(organizationId: string): Promise<Person[]> {
  const rows = await db
    .select({ userId: users.id, name: users.name, email: users.email, role: memberships.role, lastLoginAt: users.lastLoginAt })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.organizationId, organizationId), isNull(memberships.deactivatedAt)));
  return rows.map((r) => ({ userId: r.userId, name: r.name?.trim() || r.email, email: r.email, role: r.role, lastLoginAt: normIso(r.lastLoginAt) }));
}

const FEED_CAP = 6000;

/** Every timestamped thing people did between two days (inclusive), newest first. Nothing is stored twice: each kind is read from where it lives. */
export async function activityFeed(organizationId: string, from: string, to: string, zone: string, people: Person[]): Promise<FeedRow[]> {
  const { start, end } = rangeBounds(from, to, zone);
  const ids = people.map((p) => p.userId);
  if (!ids.length) return [];
  // Times are stored in two spellings ("YYYY-MM-DD HH:MM:SS" by the database, ISO by the app). Ask the database for a day
  // either side of the range (a date prefix compares correctly in both) and keep only what falls inside, by real time.
  const lo = new Date(Date.parse(start) - 86400000).toISOString().slice(0, 10);
  const hi = new Date(Date.parse(end) + 86400000).toISOString().slice(0, 10);
  const inside = (iso: string | null): iso is string => !!iso && iso >= start && iso < end;
  const rows: FeedRow[] = [];

  const signIns = await db
    .select({ id: signInEvents.id, at: signInEvents.createdAt, userId: signInEvents.userId })
    .from(signInEvents)
    .where(and(inArray(signInEvents.userId, ids), gte(signInEvents.createdAt, lo), lt(signInEvents.createdAt, hi)))
    .limit(FEED_CAP);
  for (const s of signIns) if (inside(normIso(s.at))) rows.push({ id: s.id, at: normIso(s.at)!, userId: s.userId, kind: "SIGN_IN", label: "Signed in", refType: null, refId: null });

  const clock = await db
    .select()
    .from(hrTimeEvents)
    .where(and(eq(hrTimeEvents.organizationId, organizationId), gte(hrTimeEvents.at, start), lt(hrTimeEvents.at, end)))
    .limit(FEED_CAP);
  for (const c of clock) rows.push({ id: c.id, at: c.at, userId: c.userId, kind: c.kind, label: CLOCK_LABELS[c.kind], refType: null, refId: null });

  const quotes = await db
    .select({ id: purchasingQuotations.id, at: purchasingQuotations.createdAt, by: purchasingQuotations.createdByUserId, number: purchasingQuotations.quotationNumber, customer: purchasingQuotations.customerNameSnapshot })
    .from(purchasingQuotations)
    .where(and(eq(purchasingQuotations.organizationId, organizationId), gte(purchasingQuotations.createdAt, lo), lt(purchasingQuotations.createdAt, hi)))
    .limit(FEED_CAP);
  for (const q of quotes) if (q.by && inside(normIso(q.at))) rows.push({ id: `q_${q.id}`, at: normIso(q.at)!, userId: q.by, kind: "QUOTATION_CREATED", label: `Created quotation ${q.number} for ${q.customer}`, refType: "quotation", refId: q.id });

  const quoteInfo = async (packageIds: string[]) => {
    if (!packageIds.length) return new Map<string, { number: string; customer: string }>();
    const r = await db
      .select({ pid: receivingPackages.id, number: purchasingQuotations.quotationNumber, customer: purchasingQuotations.customerNameSnapshot })
      .from(receivingPackages)
      .innerJoin(purchasingQuotations, eq(purchasingQuotations.id, receivingPackages.quotationId))
      .where(inArray(receivingPackages.id, packageIds));
    return new Map(r.map((x) => [x.pid, { number: x.number, customer: x.customer }]));
  };

  const opened = await db
    .select({ id: receivingPackages.id, at: receivingPackages.startedAt, by: receivingPackages.startedByUserId })
    .from(receivingPackages)
    .where(and(eq(receivingPackages.organizationId, organizationId), gte(receivingPackages.startedAt, lo), lt(receivingPackages.startedAt, hi)))
    .limit(FEED_CAP);
  const received = await db
    .select({ id: receivingPackages.id, at: receivingPackages.submittedAt, by: receivingPackages.submittedByUserId })
    .from(receivingPackages)
    .where(and(eq(receivingPackages.organizationId, organizationId), gte(receivingPackages.submittedAt, lo), lt(receivingPackages.submittedAt, hi)))
    .limit(FEED_CAP);
  const info = await quoteInfo([...new Set([...opened.map((o) => o.id), ...received.map((o) => o.id)])]);
  const tag = (pid: string) => {
    const i = info.get(pid);
    return i ? `order ${i.number} (${i.customer})` : "a package";
  };
  for (const o of opened) if (o.by && inside(normIso(o.at))) rows.push({ id: `po_${o.id}`, at: normIso(o.at)!, userId: o.by, kind: "PACKAGE_OPENED", label: `Opened ${tag(o.id)} to receive`, refType: "package", refId: o.id });
  for (const o of received) if (o.by && inside(normIso(o.at))) rows.push({ id: `pr_${o.id}`, at: normIso(o.at)!, userId: o.by, kind: "PACKAGE_RECEIVED", label: `Finished receiving ${tag(o.id)}`, refType: "package", refId: o.id });

  const mails = await db
    .select({ id: receivingCustomerEmails.id, at: receivingCustomerEmails.sentAt, by: receivingCustomerEmails.sentByUserId, kind: receivingCustomerEmails.kind, pid: receivingCustomerEmails.packageId })
    .from(receivingCustomerEmails)
    .where(and(eq(receivingCustomerEmails.organizationId, organizationId), gte(receivingCustomerEmails.sentAt, lo), lt(receivingCustomerEmails.sentAt, hi)))
    .limit(FEED_CAP);
  const mi = await quoteInfo([...new Set(mails.map((m) => m.pid))]);
  for (const m of mails) {
    if (!m.by || !inside(normIso(m.at))) continue;
    const i = mi.get(m.pid);
    rows.push({ id: `em_${m.id}`, at: normIso(m.at)!, userId: m.by, kind: "CUSTOMER_EMAIL", label: `${m.kind === "WARNING" ? "Sent a packaging warning" : "Sent the payment email"}${i ? ` for order ${i.number} (${i.customer})` : ""}`, refType: "package", refId: m.pid });
  }

  const logged = await db
    .select()
    .from(hrActivity)
    .where(and(eq(hrActivity.organizationId, organizationId), gte(hrActivity.at, start), lt(hrActivity.at, end)))
    .limit(FEED_CAP);
  for (const l of logged) if (l.userId) rows.push({ id: l.id, at: l.at, userId: l.userId, kind: (l.kind as FeedKind) ?? "OTHER", label: l.label, refType: l.refType, refId: l.refId });

  const known = new Set(ids);
  return rows.filter((r) => known.has(r.userId)).sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

/** Counts per person per metric from the feed (the one place the numbers come from, so the log and the totals always agree). */
export function countMetrics(feed: FeedRow[]): Map<string, Partial<Record<MetricKey, number>>> {
  const out = new Map<string, Partial<Record<MetricKey, number>>>();
  for (const r of feed) {
    const m = METRIC_OF_KIND[r.kind];
    if (!m) continue;
    const o = out.get(r.userId) ?? {};
    o[m] = (o[m] ?? 0) + 1;
    out.set(r.userId, o);
  }
  return out;
}

// ---------------------------------------------------------------------------
// The staff list and the time sheets
// ---------------------------------------------------------------------------

export type StaffRow = {
  person: Person;
  metrics: MetricKey[];
  counts: Partial<Record<MetricKey, number>>;
  status: string;
  stateNow: ClockState;
  signedInAt: string | null;
  signIns: number;
  day: DaySummary;
  lastAction: FeedRow | null;
};

export type Overview = { zone: string; from: string; to: string; rows: StaffRow[]; feed: FeedRow[]; today: string; people: Person[] };

async function allEvents(organizationId: string, ids: string[], start: string, end: string, nowIso: string) {
  // A shift that began the evening before still belongs on its own day, so start a day early; and run to now for open shifts.
  const early = new Date(Date.parse(start) - 86400000).toISOString();
  const rows = ids.length
    ? await db
        .select({ userId: hrTimeEvents.userId, kind: hrTimeEvents.kind, at: hrTimeEvents.at })
        .from(hrTimeEvents)
        .where(and(eq(hrTimeEvents.organizationId, organizationId), inArray(hrTimeEvents.userId, ids), gte(hrTimeEvents.at, early), lt(hrTimeEvents.at, nowIso > end ? nowIso : end)))
        .orderBy(asc(hrTimeEvents.at))
    : [];
  const by = new Map<string, ClockEvent[]>();
  for (const r of rows) by.set(r.userId, [...(by.get(r.userId) ?? []), { kind: r.kind, at: r.at }]);
  return by;
}

/** The staff list for a day, a week or a month: who they are, where they are on the clock, hours, and their work counts. */
export async function staffOverview(organizationId: string, kind: RangeKind, day: string, nowIso = new Date().toISOString()): Promise<Overview> {
  const zone = await companyZone(organizationId);
  const { from, to, days } = daysOf(kind, day);
  const people = await listPeople(organizationId);
  const feed = await activityFeed(organizationId, from, to, zone, people);
  const { start, end } = rangeBounds(from, to, zone);
  const events = await allEvents(organizationId, people.map((p) => p.userId), start, end, nowIso);
  const counts = countMetrics(feed);
  const today = todayIn(zone);
  const rows: StaffRow[] = people.map((p) => {
    const ev = sortEvents(events.get(p.userId) ?? []);
    const shifts = buildShifts(ev, nowIso);
    const sums = days.map((d) => summarizeDay(shifts, d, zone));
    const single = kind === "day" ? sums[0] : null;
    const merged: DaySummary = single ?? {
      shifts: sums.flatMap((s) => s.shifts),
      firstIn: null,
      lastOut: null,
      workedMinutes: sums.reduce((n, s) => n + s.workedMinutes, 0),
      breakMinutes: sums.reduce((n, s) => n + s.breakMinutes, 0),
      breakCount: sums.reduce((n, s) => n + s.breakCount, 0),
      forgotClockOut: sums.some((s) => s.forgotClockOut),
    };
    const mine = feed.filter((f) => f.userId === p.userId);
    const signs = mine.filter((f) => f.kind === "SIGN_IN").map((f) => f.at).sort();
    const stateNow = stateOf(ev);
    return {
      person: p,
      metrics: metricsForRole(p.role),
      counts: counts.get(p.userId) ?? {},
      status: kind === "day" && day !== today ? (merged.firstIn ? "Worked" : "Did not clock in") : statusLabel(stateNow, merged.shifts.length > 0),
      stateNow,
      signedInAt: signs[0] ?? null,
      signIns: signs.length,
      day: merged,
      lastAction: mine.find((f) => f.kind !== "SIGN_IN") ?? null,
    };
  });
  return { zone, from, to, rows, feed, today, people };
}

export type SheetDay = { day: string; summary: DaySummary };
export type Timesheet = { zone: string; from: string; to: string; days: string[]; people: { person: Person; days: SheetDay[]; workedMinutes: number; breakMinutes: number }[] };

/** Hours per person per day across a week or a month. */
export async function timesheet(organizationId: string, kind: RangeKind, day: string, nowIso = new Date().toISOString()): Promise<Timesheet> {
  const zone = await companyZone(organizationId);
  const { from, to, days } = daysOf(kind, day);
  const people = await listPeople(organizationId);
  const { start, end } = rangeBounds(from, to, zone);
  const events = await allEvents(organizationId, people.map((p) => p.userId), start, end, nowIso);
  return {
    zone,
    from,
    to,
    days,
    people: people.map((p) => {
      const shifts = buildShifts(sortEvents(events.get(p.userId) ?? []), nowIso);
      const ds = days.map((d) => ({ day: d, summary: summarizeDay(shifts, d, zone) }));
      return { person: p, days: ds, workedMinutes: ds.reduce((n, d) => n + d.summary.workedMinutes, 0), breakMinutes: ds.reduce((n, d) => n + d.summary.breakMinutes, 0) };
    }),
  };
}
