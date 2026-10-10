// The platform remembers how much of the 7-day free trial a business has used, so a company that leaves and comes back (even after
// its data was deleted) does not get a brand-new trial every time. Pure rules, no database and no clock unless passed in.
//
// Decided by the platform owner:
//  - A business is recognised by its EIN plus its state and state file number (kept only as a one-way hash).
//  - Day 1 of the trial is the day the company is approved. A trial day is used up to and including the day the company cancels,
//    closes or is suspended (cancel on day 4 = 4 days used, 3 left). Time spent waiting for approval does not count.
//  - Cancelling during the trial stops the service that day. The unused days are kept for when the company comes back.
//  - A company that comes back with days left gets only those days, then billing starts on the normal schedule. A company that
//    used the whole trial (or has been paying) comes back straight to a paid plan, with no trial.
// Dates are billing-calendar days ("YYYY-MM-DD", US Eastern; see billing-schedule.ts).

import { createHash } from "node:crypto";
import { TRIAL_DAYS, daysBetween, trialFrom } from "@/lib/billing-schedule";

/** What the ledger keeps about one business. */
export type Memory = {
  /** Trial days used before the current run began. */
  daysBeforeRun: number;
  /** The day the current run of trial days began (approval day, or the day the company came back); null when no run was started. */
  runStartedOn: string | null;
  /** The day the company stopped (cancelled, closed, suspended); null while it is running. */
  stoppedOn: string | null;
};

/** A one-way key for "this business": the same EIN, state and file number always give the same key, and nothing can be read back from it. */
export function memoryKey(ein: string, registeredState: string, stateFileNumber: string): string {
  const digits = String(ein ?? "").replace(/\D/g, "");
  const state = String(registeredState ?? "").trim().toUpperCase();
  const file = String(stateFileNumber ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return createHash("sha256").update(`jj-trial|${digits}|${state}|${file}`).digest("hex");
}

/** Trial days used so far (never more than the trial). While a run is going, today counts. */
export function daysUsed(m: Memory, today: string): number {
  if (!m.runStartedOn) return Math.min(TRIAL_DAYS, Math.max(0, m.daysBeforeRun));
  const end = m.stoppedOn ?? today;
  const inRun = Math.max(0, daysBetween(m.runStartedOn, end) + 1);
  return Math.min(TRIAL_DAYS, Math.max(0, m.daysBeforeRun) + inRun);
}

/** The company stopped on this day. Stopping twice changes nothing. */
export function stopped(m: Memory, day: string): Memory {
  return m.stoppedOn || !m.runStartedOn ? m : { ...m, stoppedOn: day };
}

/** The company stopped by mistake or changed its mind before service ended (for example it undid a cancellation). */
export function undoStop(m: Memory): Memory {
  return { ...m, stoppedOn: null };
}

/** The company is back today: everything used so far is carried forward and a new run begins. */
export function resumed(m: Memory, today: string): Memory {
  return { daysBeforeRun: daysUsed(m, m.stoppedOn ?? today), runStartedOn: today, stoppedOn: null };
}

export type ReturnPlan =
  | { kind: "fresh" }
  | { kind: "resume"; daysUsed: number; daysLeft: number }
  | { kind: "used_up"; daysUsed: number };

/** What a company coming back gets: a full new trial (never seen before), only its remaining days, or no trial at all. */
export function returnPlan(m: Memory | null, today: string): ReturnPlan {
  if (!m) return { kind: "fresh" };
  const used = daysUsed(m, today);
  if (used >= TRIAL_DAYS) return { kind: "used_up", daysUsed: used };
  if (used <= 0) return { kind: "fresh" };
  return { kind: "resume", daysUsed: used, daysLeft: TRIAL_DAYS - used };
}

/** The trial dates a plan gives a company that starts (or restarts) today. No trial = the first charge date is today. */
export function trialDatesFor(plan: ReturnPlan, today: string): { startsOn: string; firstBillableOn: string } {
  if (plan.kind === "used_up") return { startsOn: today, firstBillableOn: today };
  if (plan.kind === "resume") {
    const t = trialFrom(today, plan.daysLeft);
    return { startsOn: t.startsOn, firstBillableOn: t.firstBillableOn };
  }
  const t = trialFrom(today);
  return { startsOn: t.startsOn, firstBillableOn: t.firstBillableOn };
}

/** The line the platform owner reads about a business that has been here before, or null for a business seen for the first time. */
export function returningNote(plan: ReturnPlan): string | null {
  if (plan.kind === "fresh") return null;
  if (plan.kind === "resume") return `Returning company: it used ${plan.daysUsed} of its ${TRIAL_DAYS} free trial days before, so approving it gives it only the ${plan.daysLeft} that are left.`;
  return "Returning company: it already used its whole free trial, so approving it starts a paid plan today, with no new trial.";
}

/** The line the company reads on its billing page when it came back with days left. */
export function welcomeBackNote(daysUsedBefore: number): string | null {
  if (daysUsedBefore <= 0 || daysUsedBefore >= TRIAL_DAYS) return null;
  return `Welcome back. You used ${daysUsedBefore} of your ${TRIAL_DAYS} free trial days before, so this trial has ${TRIAL_DAYS - daysUsedBefore} days.`;
}
