// The org-scoping convention every page and every data query in this app
// must follow: never query products/invoices/inventory directly by a raw
// organizationId string typed into the code. Always go through
// requireOrg() (or requireOrgApi() in a route handler) so the id always
// comes from the signed-in user's own membership row, never from a URL
// param or a client-supplied value. That's the whole multi-tenant
// guarantee, in one place.

import { redirect } from "next/navigation";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { memberships, organizations } from "@/db/schema";
import { parseAccess, type Access, type Role } from "@/lib/permissions";

export type CurrentOrg = {
  userId: string;
  organizationId: string;
  organizationName: string;
  role: Role;
  /** Departments an admin opened for this person by hand, on top of the role (empty for most people). */
  access: Access;
};

/**
 * Server-component / server-action helper. Redirects to /login when
 * there's no session, and to /onboarding when the user has no
 * organization yet. Every dashboard page should start with this.
 *
 * MVP note: a user can belong to more than one organization (see the
 * memberships table), but there's no org-switcher UI yet -- this always
 * resolves to the first membership found. Add a selected-org cookie and a
 * switcher when that becomes a real need (Phase 2).
 */
export async function requireOrg(): Promise<CurrentOrg> {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/login");

  // Only ACTIVE memberships in a company that isn't closed count: an admin can
  // switch someone's access off (deactivatedAt) without deleting their
  // history, and the owner can close the whole company (closedAt) for 30 days.
  const [row] = await db
    .select({
      organizationId: organizations.id,
      organizationName: organizations.name,
      role: memberships.role,
      deptAccess: memberships.deptAccess,
      approvalStatus: organizations.approvalStatus,
    })
    .from(memberships)
    .innerJoin(organizations, eq(memberships.organizationId, organizations.id))
    .where(
      and(
        eq(memberships.userId, userId!),
        isNull(memberships.deactivatedAt),
        isNull(organizations.closedAt),
      ),
    )
    .limit(1);

  if (!row) {
    const [closed] = await db
      .select({ id: memberships.id })
      .from(memberships)
      .innerJoin(organizations, eq(memberships.organizationId, organizations.id))
      .where(
        and(
          eq(memberships.userId, userId!),
          isNull(memberships.deactivatedAt),
          isNotNull(organizations.closedAt),
        ),
      )
      .limit(1);
    if (closed) redirect("/closed");
    // Had access once but it was removed -> explain, don't send them to
    // create a brand-new company by mistake.
    const [anyMembership] = await db
      .select({ id: memberships.id })
      .from(memberships)
      .where(eq(memberships.userId, userId!))
      .limit(1);
    redirect(anyMembership ? "/no-access" : "/onboarding");
  }

  // A new company is locked until the platform owner approves it (and again if they later suspend it).
  if (isHeldBack(row!.approvalStatus)) redirect("/under-review");

  return {
    userId: userId!,
    organizationId: row!.organizationId,
    organizationName: row!.organizationName,
    role: row!.role as CurrentOrg["role"],
    access: parseAccess(row!.deptAccess),
  };
}

/**
 * Route-handler version of requireOrg(): same rule (the signed-in user's own
 * active membership in a company that isn't closed), but returns null instead
 * of redirecting, so an API route can answer 401/403 itself.
 */
export async function requireOrgApi(): Promise<CurrentOrg | null> {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return null;
  const [row] = await db
    .select({
      organizationId: organizations.id,
      organizationName: organizations.name,
      role: memberships.role,
      deptAccess: memberships.deptAccess,
      approvalStatus: organizations.approvalStatus,
    })
    .from(memberships)
    .innerJoin(organizations, eq(memberships.organizationId, organizations.id))
    .where(and(eq(memberships.userId, userId), isNull(memberships.deactivatedAt), isNull(organizations.closedAt)))
    .limit(1);
  if (!row || isHeldBack(row.approvalStatus)) return null;
  return {
    userId,
    organizationId: row.organizationId,
    organizationName: row.organizationName,
    role: row.role as CurrentOrg["role"],
    access: parseAccess(row.deptAccess),
  };
}

/**
 * null = approved (every company from before approvals existed). Locked out: "pending" (waiting for the platform owner),
 * "rejected" (turned down, can send details again), "suspended" (switched off for breaking the Terms, data kept) and
 * "banned" (permanently removed, its EIN can never sign up again).
 */
export function isHeldBack(status: string | null): boolean {
  return status === "pending" || status === "rejected" || status === "suspended" || status === "banned";
}

export type ClosedCompany = {
  organizationId: string;
  organizationName: string;
  role: Role;
  closedAt: string;
  purgeAfter: string | null;
  /** True once the 30 days are up (the company can no longer be reopened). */
  expired: boolean;
};

/** The signed-in user's company that is currently closed (for the /closed page and the data export), or null. */
export async function getClosedCompanyForUser(userId: string): Promise<ClosedCompany | null> {
  const [row] = await db
    .select({
      organizationId: organizations.id,
      organizationName: organizations.name,
      role: memberships.role,
      closedAt: organizations.closedAt,
      purgeAfter: organizations.purgeAfter,
    })
    .from(memberships)
    .innerJoin(organizations, eq(memberships.organizationId, organizations.id))
    .where(and(eq(memberships.userId, userId), isNull(memberships.deactivatedAt), isNotNull(organizations.closedAt)))
    .limit(1);
  if (!row || !row.closedAt) return null;
  const expired = !!row.purgeAfter && new Date(row.purgeAfter).getTime() <= Date.now();
  return { ...row, role: row.role as Role, closedAt: row.closedAt, expired };
}

export type HeldCompany = {
  organizationId: string;
  organizationName: string;
  role: Role;
  status: "pending" | "rejected" | "suspended" | "banned";
  reason: string | null;
  decidedAt: string | null;
  createdAt: string;
  paymentStatus: string | null;
};

/** The signed-in user's company that is waiting for approval (or was turned down), for the /under-review page, or null. */
export async function getHeldCompanyForUser(userId: string): Promise<HeldCompany | null> {
  const [row] = await db
    .select({
      organizationId: organizations.id,
      organizationName: organizations.name,
      role: memberships.role,
      status: organizations.approvalStatus,
      reason: organizations.approvalReason,
      decidedAt: organizations.approvalDecidedAt,
      createdAt: organizations.createdAt,
      paymentStatus: organizations.paymentStatus,
    })
    .from(memberships)
    .innerJoin(organizations, eq(memberships.organizationId, organizations.id))
    .where(and(eq(memberships.userId, userId), isNull(memberships.deactivatedAt), isNull(organizations.closedAt)))
    .limit(1);
  if (!row || !isHeldBack(row.status)) return null;
  return { ...row, role: row.role as Role, status: row.status as HeldCompany["status"] };
}

/** Current signed-in user id (no redirect), for pages that must work while the company is closed. */
export async function getSessionUserId(): Promise<string | null> {
  const session = await auth();
  return (session?.user as { id?: string } | undefined)?.id ?? null;
}
