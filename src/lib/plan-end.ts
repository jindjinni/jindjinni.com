// Switching a company off when its cancelled plan runs out. A cancelled company keeps working until the end of its last day of
// service; the day after, it becomes "suspended" (data kept) with a note, exactly like a suspension, so every existing lock-out
// rule applies. It happens in two places so it never depends on one job running: the first time anyone from the company makes a
// request after the last day (lazily, in tenant.ts) and in a nightly job (/api/cron/end-cancelled), which also keeps the platform
// owner's Companies panel accurate.

import { and, eq, isNotNull, isNull, lt, or } from "drizzle-orm";
import { db } from "@/db/client";
import { organizations } from "@/db/schema";
import { billingDateOf } from "@/lib/billing-schedule";
import { logDecision } from "@/lib/company-admin";
import { longDay } from "@/lib/billing-schedule";

/** Switches one company off if its last day of service has passed and it is still active. Returns true if it did. */
export async function endPlanIfDue(orgId: string): Promise<boolean> {
  const today = billingDateOf();
  const [o] = await db
    .select({ status: organizations.approvalStatus, serviceEndsOn: organizations.serviceEndsOn })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!o || !o.serviceEndsOn || today <= o.serviceEndsOn) return false;
  if (o.status !== null && o.status !== "approved") return false;
  const now = new Date().toISOString();
  // The WHERE repeats the checks so two requests racing can only switch it off once.
  const res = await db
    .update(organizations)
    .set({ approvalStatus: "suspended", approvalReason: `Plan cancelled. Service ended on ${longDay(o.serviceEndsOn)}.`, approvalDecidedAt: now, updatedAt: now })
    .where(and(eq(organizations.id, orgId), or(isNull(organizations.approvalStatus), eq(organizations.approvalStatus, "approved")), isNotNull(organizations.serviceEndsOn), lt(organizations.serviceEndsOn, today)));
  if (res.rowsAffected > 0) {
    await logDecision(orgId, "plan_ended", `Service ended on ${longDay(o.serviceEndsOn)}`, null);
    return true;
  }
  return false;
}

/** The nightly sweep: every active company whose last day of service has passed. */
export async function endDuePlans(): Promise<{ ended: number }> {
  const today = billingDateOf();
  const due = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(and(isNotNull(organizations.serviceEndsOn), lt(organizations.serviceEndsOn, today), or(isNull(organizations.approvalStatus), eq(organizations.approvalStatus, "approved"))))
    .limit(500);
  let ended = 0;
  for (const d of due) if (await endPlanIfDue(d.id)) ended++;
  return { ended };
}
