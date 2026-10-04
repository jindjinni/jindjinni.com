// The org-scoping convention every page and every data query in this app
// must follow: never query products/invoices/inventory directly by a raw
// organizationId string typed into the code. Always go through
// requireOrg() (or requireOrgApi() in a route handler) so the id always
// comes from the signed-in user's own membership row, never from a URL
// param or a client-supplied value. That's the whole multi-tenant
// guarantee, in one place.

import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/db/client";
import { memberships, organizations } from "@/db/schema";
import type { Role } from "@/lib/permissions";

export type CurrentOrg = {
  userId: string;
  organizationId: string;
  organizationName: string;
  role: Role;
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

  // Only ACTIVE memberships count: an admin can switch someone's access off
  // (deactivatedAt) without deleting their history.
  const [row] = await db
    .select({
      organizationId: organizations.id,
      organizationName: organizations.name,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(organizations, eq(memberships.organizationId, organizations.id))
    .where(and(eq(memberships.userId, userId!), isNull(memberships.deactivatedAt)))
    .limit(1);

  if (!row) {
    // Had access once but it was removed -> explain, don't send them to
    // create a brand-new company by mistake.
    const [anyMembership] = await db
      .select({ id: memberships.id })
      .from(memberships)
      .where(eq(memberships.userId, userId!))
      .limit(1);
    redirect(anyMembership ? "/no-access" : "/onboarding");
  }

  return {
    userId: userId!,
    organizationId: row!.organizationId,
    organizationName: row!.organizationName,
    role: row!.role as CurrentOrg["role"],
  };
}
