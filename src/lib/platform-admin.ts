// The mothership's staff. A company the platform runs itself (the same list as PLATFORM slugs used for the platform's own Shippo
// account) is the Lamp. Its Owner is the platform owner; people the Owner adds are co-owners, admins or customer support
// (platform_staff). Owner, co-owner and admin have complete access (isPlatformAdmin); customer support is staff (isPlatformStaff)
// but never opens Settings. Always re-checked on the server; never tied to an email address.

import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { memberships, organizations, platformStaff } from "@/db/schema";
import { isOwner } from "@/lib/permissions";
import { isFullLevel, isStaffLevel, type StaffLevel } from "@/lib/mothership-rules";
import { mayUsePlatformShippo } from "@/lib/shippo-connection";

type OrgLike = { organizationId: string; userId?: string; role: string };

/** This person's staff level in the company they are signed in to, or null when they are not Lamp staff. */
export async function staffLevelOf(org: OrgLike): Promise<StaffLevel | null> {
  const [row] = await db.select({ slug: organizations.slug }).from(organizations).where(eq(organizations.id, org.organizationId)).limit(1);
  if (!row || !mayUsePlatformShippo(row.slug)) return null;
  if (isOwner(org.role)) return "owner";
  if (!org.userId) return null;
  const [s] = await db
    .select({ level: platformStaff.level })
    .from(platformStaff)
    .innerJoin(memberships, and(eq(memberships.userId, platformStaff.userId), eq(memberships.organizationId, org.organizationId), isNull(memberships.deactivatedAt)))
    .where(eq(platformStaff.userId, org.userId))
    .limit(1);
  return s?.level === "co_owner" || s?.level === "admin" || s?.level === "support" ? s.level : null;
}

/** Owner, co-owner or admin of the Lamp: complete access. */
export async function isPlatformAdmin(org: OrgLike): Promise<boolean> {
  return isFullLevel(await staffLevelOf(org));
}

/** Anyone on the Lamp's team, customer support included. */
export async function isPlatformStaff(org: OrgLike): Promise<boolean> {
  return isStaffLevel(await staffLevelOf(org));
}
