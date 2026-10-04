// Permanent clean-up, run nightly by api/cron/purge-closed:
//  1. companies closed more than CLOSE_GRACE_DAYS ago are deleted with all
//     their data, and people who belonged only to them are removed;
//  2. sign-in records older than SIGN_IN_HISTORY_MONTHS are deleted.
// Nothing here runs for a company that is still open or still inside its
// 30 days, and a company the owner reopened has purgeAfter cleared.

import { and, eq, inArray, isNotNull, lte, lt, notInArray } from "drizzle-orm";
import { getTableColumns } from "drizzle-orm";
import { db } from "@/db/client";
import { memberships, organizations, signInEvents, users } from "@/db/schema";
import { orgScopedTables } from "@/lib/company-export";
import { SIGN_IN_HISTORY_MONTHS } from "@/lib/legal";

export type PurgeResult = { companiesDeleted: number; peopleRemoved: number; signInsDeleted: number };

export async function purgeClosedCompanies(now = new Date()): Promise<PurgeResult> {
  const due = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(and(isNotNull(organizations.closedAt), isNotNull(organizations.purgeAfter), lte(organizations.purgeAfter, now.toISOString())));

  let peopleRemoved = 0;
  for (const { id } of due) {
    const memberRows = await db.select({ userId: memberships.userId }).from(memberships).where(eq(memberships.organizationId, id));
    const userIds = [...new Set(memberRows.map((m) => m.userId))];

    // Children first (their rows reference the company), then the company itself.
    for (const { table } of orgScopedTables()) {
      const cols = getTableColumns(table) as Record<string, import("drizzle-orm").Column>;
      await db.delete(table).where(eq(cols.organizationId, id)).catch(() => {});
    }
    await db.delete(organizations).where(eq(organizations.id, id));

    // People who belong to no other company are removed (or, if some record still points at them, anonymised).
    if (userIds.length) {
      const stillMembers = await db.select({ userId: memberships.userId }).from(memberships).where(inArray(memberships.userId, userIds));
      const keep = new Set(stillMembers.map((m) => m.userId));
      for (const uid of userIds.filter((u) => !keep.has(u))) {
        try {
          await db.delete(users).where(eq(users.id, uid));
        } catch {
          await db
            .update(users)
            .set({ email: `deleted-${uid}@deleted.invalid`, name: null, passwordHash: null, image: null })
            .where(eq(users.id, uid));
        }
        peopleRemoved++;
      }
    }
  }

  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - SIGN_IN_HISTORY_MONTHS);
  const old = await db.delete(signInEvents).where(lt(signInEvents.createdAt, cutoff.toISOString())).returning({ id: signInEvents.id });
  return { companiesDeleted: due.length, peopleRemoved, signInsDeleted: old.length };
}
