// How many people a company may have. One number per company:
//   organizations.seatLimit  -> an explicit override (-1 means unlimited)
//   otherwise                -> UNLIMITED for the platform owner's own company,
//                               DEFAULT_SEAT_LIMIT for everyone else
// "Seats used" = active team members + invitations that are still pending
// (so a company can't invite 50 people while sitting at its cap).
import { and, eq, isNull, gt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { memberships, organizations, teamInvitations } from "@/db/schema";

export const DEFAULT_SEAT_LIMIT = 5;
export const UNLIMITED = -1;

/** Companies that run on their own platform with no team cap. Extend with the UNLIMITED_SEAT_ORG_SLUGS env var (comma separated). */
const BUILT_IN_UNLIMITED_SLUGS = ["plantarz-medical-exchange", "usa-test-strips-center"];

function unlimitedSlugs(): string[] {
  const fromEnv = (process.env.UNLIMITED_SEAT_ORG_SLUGS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return [...BUILT_IN_UNLIMITED_SLUGS, ...fromEnv];
}

/** Pure: the effective cap (UNLIMITED = -1). */
export function effectiveSeatLimit(org: { slug: string; seatLimit: number | null }): number {
  if (org.seatLimit !== null && org.seatLimit !== undefined) return org.seatLimit;
  return unlimitedSlugs().includes(org.slug.toLowerCase()) ? UNLIMITED : DEFAULT_SEAT_LIMIT;
}

export type SeatUsage = { used: number; members: number; pendingInvites: number; limit: number; unlimited: boolean; full: boolean };

export async function getSeatUsage(organizationId: string): Promise<SeatUsage> {
  const [org] = await db
    .select({ slug: organizations.slug, seatLimit: organizations.seatLimit })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  const [{ members }] = await db
    .select({ members: sql<number>`count(*)` })
    .from(memberships)
    .where(and(eq(memberships.organizationId, organizationId), isNull(memberships.deactivatedAt)));
  const now = new Date().toISOString();
  const [{ pending }] = await db
    .select({ pending: sql<number>`count(*)` })
    .from(teamInvitations)
    .where(
      and(
        eq(teamInvitations.organizationId, organizationId),
        isNull(teamInvitations.acceptedAt),
        isNull(teamInvitations.revokedAt),
        gt(teamInvitations.expiresAt, now),
      ),
    );
  const limit = org ? effectiveSeatLimit(org) : DEFAULT_SEAT_LIMIT;
  const used = Number(members) + Number(pending);
  const unlimited = limit === UNLIMITED;
  return { used, members: Number(members), pendingInvites: Number(pending), limit, unlimited, full: !unlimited && used >= limit };
}
