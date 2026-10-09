// The mothership's staff list: the Owner(s) of the platform's own companies plus everyone given a level on the Staff page.

import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { memberships, organizations, platformStaff, users } from "@/db/schema";
import type { StaffLevel } from "@/lib/mothership-rules";

export type StaffRow = {
  userId: string;
  membershipId: string;
  name: string;
  email: string;
  level: StaffLevel;
  twoStep: boolean;
  mustChangePassword: boolean;
  createdAt: string;
  /** True when this company's Owner created the login (so the Owner can hand out a new temporary password). */
  managed: boolean;
};

/** Everyone on the mothership team in the given platform company, Owner first, then co-owners, admins and customer support. */
export async function listStaff(organizationId: string): Promise<StaffRow[]> {
  const owners = await db
    .select({ userId: users.id, membershipId: memberships.id, name: users.name, email: users.email, on: users.totpEnabledAt, must: users.mustChangePassword, createdAt: memberships.createdAt, managedBy: users.managedByOrgId })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.organizationId, organizationId), eq(memberships.role, "owner"), isNull(memberships.deactivatedAt)))
    .orderBy(asc(memberships.createdAt));
  const staff = await db
    .select({ userId: users.id, membershipId: memberships.id, name: users.name, email: users.email, on: users.totpEnabledAt, must: users.mustChangePassword, createdAt: platformStaff.createdAt, level: platformStaff.level, managedBy: users.managedByOrgId })
    .from(platformStaff)
    .innerJoin(users, eq(users.id, platformStaff.userId))
    .innerJoin(memberships, and(eq(memberships.userId, users.id), eq(memberships.organizationId, organizationId), isNull(memberships.deactivatedAt)))
    .where(inArray(platformStaff.level, ["co_owner", "admin", "support"]))
    .orderBy(asc(platformStaff.createdAt));
  const rank: Record<string, number> = { co_owner: 1, admin: 2, support: 3 };
  const rows: StaffRow[] = [
    ...owners.map((o) => ({ userId: o.userId, membershipId: o.membershipId, name: o.name ?? "", email: o.email, level: "owner" as const, twoStep: !!o.on, mustChangePassword: !!o.must, createdAt: o.createdAt, managed: o.managedBy === organizationId })),
    ...staff
      .sort((a, b) => (rank[a.level] ?? 9) - (rank[b.level] ?? 9))
      .map((s) => ({ userId: s.userId, membershipId: s.membershipId, name: s.name ?? "", email: s.email, level: s.level as StaffLevel, twoStep: !!s.on, mustChangePassword: !!s.must, createdAt: s.createdAt, managed: s.managedBy === organizationId })),
  ];
  return rows;
}

/** Email addresses of everyone on the team, for "a ticket needs us" mail (customer support included). */
export async function staffEmails(platformSlugs: string[]): Promise<string[]> {
  const orgRows = await db.select({ id: organizations.id }).from(organizations).where(inArray(organizations.slug, platformSlugs));
  const out = new Set<string>();
  for (const o of orgRows) for (const s of await listStaff(o.id)) out.add(s.email);
  return [...out].filter((e) => !!e && !e.endsWith(".local") && !e.endsWith(".invalid") && e.includes("@"));
}
