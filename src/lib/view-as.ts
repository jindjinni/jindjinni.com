// "View as company": a platform person looks at a company's account the way its owner sees it -- only after that company said yes
// on a support ticket, only for a short time, and only read-only (src/proxy.ts blocks every change). Every condition is
// re-checked on the server each time a page asks who is signed in, so taking the permission back, ending the look, turning off
// two-step or the time running out all stop it at once.

import { and, asc, eq, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { memberships, organizations, supportTickets, supportViewSessions } from "@/db/schema";
import { featureOn } from "@/lib/features";
import { isPlatformStaff } from "@/lib/platform-admin";
import { parseAccess } from "@/lib/permissions";
import { consentActive } from "@/lib/support-rules";
import { twoStepOn } from "@/lib/two-step";
import { VIEW_COOKIE, readViewToken } from "@/lib/view-as-token";
import type { CurrentOrg } from "@/lib/tenant";

export type ViewAsInfo = { sessionId: string; adminUserId: string; ticketId: string; ticketNo: number | null; expiresAt: string };

/**
 * If this signed-in person has a valid "view as company" session, the company they are looking at, shown with that company's owner
 * permissions; otherwise null (and they are just themselves). `real` is their own, normal company.
 */
export async function applyViewAs(real: CurrentOrg, opts: { pages?: boolean } = {}): Promise<CurrentOrg> {
  let raw: string | undefined;
  try {
    raw = (await cookies()).get(VIEW_COOKIE)?.value;
  } catch {
    return real;
  }
  if (!raw) return real;
  const token = readViewToken(raw);
  if (!token) return real;
  const live = await liveView(real, token);
  if (live) return live;
  // A genuine cookie that no longer counts (time ran out, the company took its OK back, the look was ended, or it belongs to
  // someone else): clear it, because while it exists nothing can be changed in this browser. Pages send the person to the clearing
  // link; API routes just carry on as the person themselves.
  if (opts.pages) redirect("/api/support/view-as/end");
  return real;
}

async function liveView(real: CurrentOrg, token: { s: string; u: string; exp: number }): Promise<CurrentOrg | null> {
  if (token.u !== real.userId) return null;

  const [s] = await db.select().from(supportViewSessions).where(eq(supportViewSessions.id, token.s)).limit(1);
  const now = Date.now();
  if (!s || s.endedAt || s.adminUserId !== real.userId || Date.parse(s.expiresAt) <= now) return null;
  const [t] = await db.select({ org: supportTickets.organizationId, until: supportTickets.viewConsentUntil, status: supportTickets.status }).from(supportTickets).where(eq(supportTickets.id, s.ticketId)).limit(1);
  if (!t || t.org !== s.organizationId || !consentActive(t.until, now)) return null;
  if (s.organizationId === real.organizationId) return null;
  // The person must still be the platform owner, with two-step on, and the feature must still be on for the platform.
  if (!(await isPlatformStaff(real)) || !(await twoStepOn(real.userId)) || !(await featureOn("view-as-company", real.organizationId))) return null;

  const [target] = await db
    .select({ organizationId: organizations.id, organizationName: organizations.name, userId: memberships.userId, role: memberships.role, deptAccess: memberships.deptAccess })
    .from(organizations)
    .innerJoin(memberships, eq(memberships.organizationId, organizations.id))
    .where(and(eq(organizations.id, s.organizationId), eq(memberships.role, "owner"), isNull(memberships.deactivatedAt)))
    .orderBy(asc(memberships.createdAt))
    .limit(1);
  if (!target) return null;
  return {
    userId: target.userId,
    organizationId: target.organizationId,
    organizationName: target.organizationName,
    role: target.role as CurrentOrg["role"],
    access: parseAccess(target.deptAccess),
    viewAs: { sessionId: s.id, adminUserId: real.userId, ticketId: s.ticketId, ticketNo: s.ticketNo, expiresAt: s.expiresAt },
  };
}
