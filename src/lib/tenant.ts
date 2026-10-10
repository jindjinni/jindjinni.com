// The org-scoping convention every page and every data query in this app
// must follow: never query products/invoices/inventory directly by a raw
// organizationId string typed into the code. Always go through
// requireOrg() (or requireOrgApi() in a route handler) so the id always
// comes from the signed-in user's own membership row, never from a URL
// param or a client-supplied value. That's the whole multi-tenant
// guarantee, in one place.

import { operationHeld } from "@/lib/second-business-rules";
import { billingDateOf } from "@/lib/billing-schedule";
import { serviceHasEnded } from "@/lib/cancellation";
import { endPlanIfDue } from "@/lib/plan-end";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { memberships, organizations } from "@/db/schema";
import { parseAccess, type Access, type Role } from "@/lib/permissions";
import { applyViewAs, type ViewAsInfo } from "@/lib/view-as";
import { COOKIE_NAME, parseKind, pickWorkspace } from "@/lib/operation-groups-rules";

export type CurrentOrg = {
  userId: string;
  organizationId: string;
  organizationName: string;
  role: Role;
  /** Departments an admin opened for this person by hand, on top of the role (empty for most people). */
  access: Access;
  /** Set only while a platform person is looking at this company through "View as company" (read-only). userId is then the company owner's. */
  viewAs?: ViewAsInfo;
};

export type OrgOptions = {
  /** Ignore any "View as company" session and give the person's own company. Only the support screens use this. */
  real?: boolean;
};


type Candidate = {
  organizationId: string;
  organizationName: string;
  role: string;
  deptAccess: string | null;
  parent: string | null;
  kind: string | null;
  approvalStatus: string | null;
  serviceEndsOn: string | null;
};

/**
 * Every workspace this person may open (active membership, company not closed), and the one to use now. A company can run two
 * operations, each its own workspace: a remembered choice wins, one workspace opens straight away, and two of the same company ask
 * (the caller sends the person to /choose). The approval, plan end and closing of a workspace are the company's, so they are read from
 * its main row.
 */
async function workspaceFor(userId: string): Promise<{ pick: Candidate | null; ask: boolean; main: { approvalStatus: string | null; serviceEndsOn: string | null } | null }> {
  const rows: Candidate[] = await db
    .select({
      organizationId: organizations.id,
      organizationName: organizations.name,
      role: memberships.role,
      deptAccess: memberships.deptAccess,
      parent: organizations.parentOrganizationId,
      kind: organizations.operationKind,
      approvalStatus: organizations.approvalStatus,
      serviceEndsOn: organizations.serviceEndsOn,
    })
    .from(memberships)
    .innerJoin(organizations, eq(memberships.organizationId, organizations.id))
    .where(and(eq(memberships.userId, userId), isNull(memberships.deactivatedAt), isNull(organizations.closedAt)));
  // An operation of a company that was closed is closed too (the main row carries the closing).
  const parents = [...new Set(rows.map((r) => r.parent).filter((x): x is string => !!x))];
  const mains = parents.length
    ? await db.select({ id: organizations.id, closedAt: organizations.closedAt, approvalStatus: organizations.approvalStatus, serviceEndsOn: organizations.serviceEndsOn }).from(organizations).where(inArray(organizations.id, parents))
    : [];
  const mainOf = new Map(mains.map((m) => [m.id, m]));
  const open = rows.filter((r) => !r.parent || !mainOf.get(r.parent)?.closedAt);
  let remembered: string | undefined;
  if (open.length > 1) {
    try {
      remembered = (await cookies()).get(COOKIE_NAME)?.value;
    } catch {
      remembered = undefined;
    }
  }
  const verdict = pickWorkspace(open.map((r) => ({ organizationId: r.organizationId, rootId: r.parent ?? r.organizationId, kind: parseKind(r.kind), role: r.role, companyName: r.organizationName })), remembered);
  if (!verdict) return { pick: null, ask: false, main: null };
  if (verdict.action === "choose") return { pick: null, ask: true, main: null };
  const pick = open.find((r) => r.organizationId === verdict.organizationId)!;
  const main = pick.parent ? mainOf.get(pick.parent) ?? pick : pick;
  return { pick, ask: false, main: { approvalStatus: main.approvalStatus, serviceEndsOn: main.serviceEndsOn } };
}

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
export async function requireOrg(opts: OrgOptions = {}): Promise<CurrentOrg> {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/login");

  // Only ACTIVE memberships in a company that isn't closed count: an admin can
  // switch someone's access off (deactivatedAt) without deleting their
  // history, and the owner can close the whole company (closedAt) for 30 days.
  const found = await workspaceFor(userId!);
  if (found.ask) redirect("/choose");
  const row = found.pick;

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
  if (isHeldBack(found.main!.approvalStatus)) redirect("/under-review");
  // An operation that is a different LLC has its own review: it stays locked until approved, while the other operation works.
  if (operationHeld(row!.parent, row!.approvalStatus)) redirect("/under-review");
  // A cancelled plan keeps working through its last day, then the company is switched off (data kept).
  if (found.main!.serviceEndsOn && serviceHasEnded(found.main!.serviceEndsOn, billingDateOf())) {
    await endPlanIfDue(row!.parent ?? row!.organizationId);
    redirect("/under-review");
  }

  const own: CurrentOrg = {
    userId: userId!,
    organizationId: row!.organizationId,
    organizationName: row!.organizationName,
    role: row!.role as CurrentOrg["role"],
    access: parseAccess(row!.deptAccess),
  };
  return opts.real ? own : applyViewAs(own, { pages: true });
}

/**
 * Route-handler version of requireOrg(): same rule (the signed-in user's own
 * active membership in a company that isn't closed), but returns null instead
 * of redirecting, so an API route can answer 401/403 itself.
 */
export async function requireOrgApi(opts: OrgOptions = {}): Promise<CurrentOrg | null> {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return null;
  const found = await workspaceFor(userId);
  const row = found.pick;
  if (!row || isHeldBack(found.main!.approvalStatus) || operationHeld(row.parent, row.approvalStatus)) return null;
  if (found.main!.serviceEndsOn && serviceHasEnded(found.main!.serviceEndsOn, billingDateOf())) {
    await endPlanIfDue(row.parent ?? row.organizationId);
    return null;
  }
  const own: CurrentOrg = {
    userId,
    organizationId: row.organizationId,
    organizationName: row.organizationName,
    role: row.role as CurrentOrg["role"],
    access: parseAccess(row.deptAccess),
  };
  return opts.real ? own : applyViewAs(own);
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
    .orderBy(organizations.parentOrganizationId) // the company's main row first
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
  cancelRequestedOn: string | null;
  serviceEndsOn: string | null;
  cancelRefundCents: number | null;
  /** Set when only ONE operation (a different business) is locked: "wholesale" or "distribution". Null when the whole company is held. */
  operationKind: string | null;
  /** The company's other operation the person can open meanwhile (only when one operation is locked). */
  otherOrganizationId: string | null;
};

/** The signed-in user's company that is waiting for approval (or was turned down), for the /under-review page, or null. */
export async function getHeldCompanyForUser(userId: string): Promise<HeldCompany | null> {
  const rows = await db
    .select({
      organizationId: organizations.id,
      organizationName: organizations.name,
      role: memberships.role,
      status: organizations.approvalStatus,
      reason: organizations.approvalReason,
      decidedAt: organizations.approvalDecidedAt,
      createdAt: organizations.createdAt,
      paymentStatus: organizations.paymentStatus,
      cancelRequestedOn: organizations.cancelRequestedOn,
      serviceEndsOn: organizations.serviceEndsOn,
      cancelRefundCents: organizations.cancelRefundCents,
      parent: organizations.parentOrganizationId,
      kind: organizations.operationKind,
    })
    .from(memberships)
    .innerJoin(organizations, eq(memberships.organizationId, organizations.id))
    .where(and(eq(memberships.userId, userId), isNull(memberships.deactivatedAt), isNull(organizations.closedAt)))
    .orderBy(organizations.parentOrganizationId); // the company's main row first: it carries the approval
  // The whole company held back (waiting, turned down, suspended, banned) comes first.
  const heldMain = rows.find((r) => !r.parent && isHeldBack(r.status));
  if (heldMain) return { ...heldMain, role: heldMain.role as Role, status: heldMain.status as HeldCompany["status"], operationKind: null, otherOrganizationId: null };
  // Otherwise an operation that is a different business and is locked by its own review: the person can still open the other one.
  const heldOp = rows.find((r) => operationHeld(r.parent, r.status));
  if (!heldOp) return null;
  const other = rows.find((r) => r.organizationId !== heldOp.organizationId && (r.organizationId === heldOp.parent || r.parent === heldOp.parent) && !operationHeld(r.parent, r.status)) ?? null;
  return { ...heldOp, role: heldOp.role as Role, status: heldOp.status as HeldCompany["status"], operationKind: heldOp.kind, otherOrganizationId: other?.organizationId ?? null };
}

/** Current signed-in user id (no redirect), for pages that must work while the company is closed. */
export async function getSessionUserId(): Promise<string | null> {
  const session = await auth();
  return (session?.user as { id?: string } | undefined)?.id ?? null;
}
