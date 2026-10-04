import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { memberships, teamInvitations, users } from "@/db/schema";

export async function getTeamMembers(organizationId: string) {
  return db
    .select({
      membershipId: memberships.id,
      userId: users.id,
      name: users.name,
      email: users.email,
      role: memberships.role,
      deactivatedAt: memberships.deactivatedAt,
      lastLoginAt: users.lastLoginAt,
    })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(eq(memberships.organizationId, organizationId))
    .orderBy(asc(users.name));
}

/** Open invitations (not accepted, not cancelled). Expired ones are included so they can be re-sent. */
export async function getOpenInvitations(organizationId: string) {
  const now = Date.now();
  const rows = await db
    .select({
      id: teamInvitations.id,
      email: teamInvitations.email,
      role: teamInvitations.role,
      expiresAt: teamInvitations.expiresAt,
      lastSentAt: teamInvitations.lastSentAt,
    })
    .from(teamInvitations)
    .where(
      and(
        eq(teamInvitations.organizationId, organizationId),
        isNull(teamInvitations.acceptedAt),
        isNull(teamInvitations.revokedAt),
      ),
    )
    .orderBy(desc(teamInvitations.createdAt));
  return rows.map((r) => ({ ...r, expired: new Date(r.expiresAt).getTime() <= now }));
}
