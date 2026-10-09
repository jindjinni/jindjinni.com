import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { memberships, teamInvitations, users } from "@/db/schema";
import { lockMinutesLeft } from "@/lib/login-throttle";

export async function getTeamMembers(organizationId: string) {
  const now = Date.now();
  const rows = await db
    .select({
      membershipId: memberships.id,
      userId: users.id,
      name: users.name,
      email: users.email,
      username: users.username,
      managedByOrgId: users.managedByOrgId,
      role: memberships.role,
      deptAccess: memberships.deptAccess,
      deactivatedAt: memberships.deactivatedAt,
      lastLoginAt: users.lastLoginAt,
      lockedUntil: users.lockedUntil,
      totpEnabledAt: users.totpEnabledAt,
    })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(eq(memberships.organizationId, organizationId))
    .orderBy(asc(users.name));
  // "Paused" = sign-in is locked for a while after too many wrong passwords.
  return rows.map((r) => ({ ...r, paused: lockMinutesLeft(r.lockedUntil, now) > 0, hasTwoStep: !!r.totpEnabledAt }));
}

/** Open invitations (not accepted, not cancelled). Expired ones are included so they can be re-sent. */
export async function getOpenInvitations(organizationId: string) {
  const now = Date.now();
  const rows = await db
    .select({
      id: teamInvitations.id,
      email: teamInvitations.email,
      role: teamInvitations.role,
      deptAccess: teamInvitations.deptAccess,
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
