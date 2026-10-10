// The database side of the free-trial memory (rules in trial-memory-rules.ts). Only a company's MAIN row has a trial; an operation
// that is a different business shares the company's. The ledger is keyed by a one-way hash of the business's papers, so it keeps
// working after the company's own data is deleted.

import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { businessVerifications, organizations, trialMemory } from "@/db/schema";
import { TRIAL_DAYS, billingDateOf } from "@/lib/billing-schedule";
import { daysUsed, memoryKey, resumed, returnPlan, returningNote, stopped, trialDatesFor, undoStop, type Memory, type ReturnPlan } from "@/lib/trial-memory-rules";

const today = () => billingDateOf();

type Row = { key: string; lastOrganizationId: string | null; daysBeforeRun: number; runStartedOn: string | null; stoppedOn: string | null };
const asMemory = (r: Pick<Row, "daysBeforeRun" | "runStartedOn" | "stoppedOn">): Memory => ({ daysBeforeRun: r.daysBeforeRun, runStartedOn: r.runStartedOn, stoppedOn: r.stoppedOn });

/** The ledger key of a company, from its verification papers (null when it has none, or it is only an operation of another company). */
export async function keyOfOrg(orgId: string): Promise<string | null> {
  const [v] = await db
    .select({ ein: businessVerifications.ein, state: businessVerifications.registeredState, file: businessVerifications.stateFileNumber, parent: organizations.parentOrganizationId })
    .from(businessVerifications)
    .innerJoin(organizations, eq(organizations.id, businessVerifications.organizationId))
    .where(eq(businessVerifications.organizationId, orgId))
    .limit(1);
  if (!v || v.parent) return null;
  return memoryKey(v.ein, v.state, v.file);
}

async function rowOf(key: string): Promise<Row | null> {
  const [r] = await db.select().from(trialMemory).where(eq(trialMemory.key, key)).limit(1);
  return r ?? null;
}

async function save(key: string, orgId: string, m: Memory): Promise<void> {
  const now = new Date().toISOString();
  await db
    .insert(trialMemory)
    .values({ key, lastOrganizationId: orgId, daysBeforeRun: m.daysBeforeRun, runStartedOn: m.runStartedOn, stoppedOn: m.stoppedOn })
    .onConflictDoUpdate({ target: trialMemory.key, set: { lastOrganizationId: orgId, daysBeforeRun: m.daysBeforeRun, runStartedOn: m.runStartedOn, stoppedOn: m.stoppedOn, updatedAt: now } });
}

/**
 * What approving this company gives it, worked out from what the ledger remembers about its business: a full trial for a business
 * never seen, only the remaining days for one that left early, no trial for one that used it all. Writes nothing.
 */
export async function planForApproval(orgId: string, day = today()): Promise<{ plan: ReturnPlan; startsOn: string; firstBillableOn: string }> {
  const key = await keyOfOrg(orgId);
  const row = key ? await rowOf(key) : null;
  const plan = returnPlan(row ? asMemory(row) : null, day);
  return { plan, ...trialDatesFor(plan, day) };
}

/** Starts the ledger run for a company approved today, carrying forward the days its business used before. */
export async function beginRun(orgId: string, plan: ReturnPlan, day = today()): Promise<void> {
  const key = await keyOfOrg(orgId);
  if (!key) return;
  const carried = plan.kind === "fresh" ? 0 : plan.daysUsed;
  await save(key, orgId, { daysBeforeRun: carried, runStartedOn: day, stoppedOn: null });
}

/**
 * Makes sure the ledger knows this company. A company from before this memory existed is read from its own trial dates: if it has a
 * trial start, that is where its run began; a company approved before trials existed counts as having used the whole trial. A company
 * that was never approved has nothing to remember yet (null).
 */
async function ensureRow(orgId: string): Promise<{ key: string; m: Memory } | null> {
  const key = await keyOfOrg(orgId);
  if (!key) return null;
  const row = await rowOf(key);
  if (row && row.lastOrganizationId === orgId) return { key, m: asMemory(row) };
  const [o] = await db.select({ trialStartsOn: organizations.trialStartsOn, status: organizations.approvalStatus }).from(organizations).where(eq(organizations.id, orgId)).limit(1);
  if (!o) return null;
  if (o.trialStartsOn) {
    const m: Memory = { daysBeforeRun: row ? daysUsed(asMemory(row), today()) : 0, runStartedOn: o.trialStartsOn, stoppedOn: null };
    await save(key, orgId, m);
    return { key, m };
  }
  if (o.status === "pending" || o.status === "rejected") return null; // never approved: no trial days used
  const m: Memory = { daysBeforeRun: TRIAL_DAYS, runStartedOn: null, stoppedOn: null };
  await save(key, orgId, m);
  return { key, m };
}

/** The company stopped today (cancelled, closed, suspended): the days up to and including today are used. Harmless if repeated. */
export async function stopRun(orgId: string, day = today()): Promise<void> {
  const r = await ensureRow(orgId);
  if (!r) return;
  await save(r.key, orgId, stopped(r.m, day));
}

/** A cancellation was undone before service ended: the company is running again. */
export async function undoStopRun(orgId: string): Promise<void> {
  const r = await ensureRow(orgId);
  if (!r) return;
  await save(r.key, orgId, undoStop(r.m));
}

/**
 * The company is back (reinstated, reopened, or approved again after cancelling). With trial days left it gets only those days;
 * with none left, it pays from today when it had cancelled (`cancelled`), and is otherwise left as it is. Returns what happened.
 */
export async function resumeRun(orgId: string, opts: { cancelled: boolean }, day = today()): Promise<ReturnPlan> {
  const r = await ensureRow(orgId);
  if (!r) {
    // No papers on file to remember it by: if it had cancelled, it pays from today (as before this memory existed).
    if (!opts.cancelled) return { kind: "fresh" };
    await db.update(organizations).set({ firstBillableOn: day, updatedAt: new Date().toISOString() }).where(eq(organizations.id, orgId));
    return { kind: "used_up", daysUsed: TRIAL_DAYS };
  }
  const plan = returnPlan(r.m, day);
  if (plan.kind === "resume") {
    await save(r.key, orgId, resumed(r.m, day));
    const d = trialDatesFor(plan, day);
    await db.update(organizations).set({ trialStartsOn: d.startsOn, firstBillableOn: d.firstBillableOn, updatedAt: new Date().toISOString() }).where(eq(organizations.id, orgId));
  } else if (plan.kind === "used_up" && opts.cancelled) {
    await save(r.key, orgId, resumed(r.m, day));
    await db.update(organizations).set({ firstBillableOn: day, updatedAt: new Date().toISOString() }).where(eq(organizations.id, orgId));
  } else if (plan.kind === "fresh") {
    // (stopped on its first day with nothing used would be "fresh"; keep its original trial untouched)
    await save(r.key, orgId, resumed(r.m, day));
  }
  return plan;
}

/** For the Lamp: a line about each pending business that has been here before. Keys are worked out from the papers the company gave. */
export async function returningNotes(rows: { id: string; ein: string | null; registeredState: string | null; stateFileNumber: string | null }[]): Promise<Map<string, string>> {
  const keyed = rows.filter((r) => r.ein && r.registeredState && r.stateFileNumber).map((r) => ({ id: r.id, key: memoryKey(r.ein!, r.registeredState!, r.stateFileNumber!) }));
  const out = new Map<string, string>();
  if (!keyed.length) return out;
  const found = await db.select().from(trialMemory).where(inArray(trialMemory.key, keyed.map((k) => k.key)));
  const byKey = new Map(found.map((f) => [f.key, f]));
  for (const k of keyed) {
    const f = byKey.get(k.key);
    // A row held by this very company is its own current trial, not a previous visit.
    if (!f || f.lastOrganizationId === k.id) continue;
    const note = returningNote(returnPlan(asMemory(f), today()));
    if (note) out.set(k.id, note);
  }
  return out;
}

/** For the company's billing page: how many trial days its business used before this visit (0 when none). */
export async function daysUsedBefore(orgId: string): Promise<number> {
  const key = await keyOfOrg(orgId);
  if (!key) return 0;
  const row = await rowOf(key);
  return row ? Math.min(TRIAL_DAYS, Math.max(0, row.daysBeforeRun)) : 0;
}
