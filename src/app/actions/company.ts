"use server";

// Closing (and reopening) a company. Owner only. Closing locks every member
// out immediately; the data is kept for 30 days so the owner can change their
// mind, then the nightly clean-up (api/cron/purge-closed) deletes it for good.

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "@/db/client";
import { organizations, purchasingAuditLog, teamInvitations, users } from "@/db/schema";
import { getClosedCompanyForUser, getSessionUserId, requireOrg } from "@/lib/tenant";
import { isOwner } from "@/lib/permissions";
import { rootIdOf } from "@/lib/operation-groups";
import { newId } from "@/lib/ids";
import { sendEmail } from "@/lib/email";

import { CLOSE_GRACE_DAYS } from "@/lib/legal";

export type CompanyActionState = { error?: string } | undefined;

export async function closeCompany(_prev: CompanyActionState, formData: FormData): Promise<CompanyActionState> {
  const org = await requireOrg();
  if (!isOwner(org.role)) return { error: "Only the owner can close the company." };

  const typedName = String(formData.get("companyName") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (formData.get("understand") !== "on") return { error: "Tick the box to confirm you understand what happens." };
  if (typedName !== org.organizationName) return { error: "Type your company name exactly as shown to confirm." };

  const [me] = await db
    .select({ passwordHash: users.passwordHash, email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, org.userId))
    .limit(1);
  if (!me?.passwordHash || !password || !(await bcrypt.compare(password, me.passwordHash))) {
    return { error: "Your password isn't right." };
  }

  const rootId = await rootIdOf(org.organizationId);
  const now = new Date();
  const purgeAfter = new Date(now.getTime() + CLOSE_GRACE_DAYS * 24 * 60 * 60 * 1000);
  await db
    .update(organizations)
    .set({ closedAt: now.toISOString(), closedByUserId: org.userId, purgeAfter: purgeAfter.toISOString() })
    .where(or(eq(organizations.id, rootId), eq(organizations.parentOrganizationId, rootId))); // the company and all of its operations
  // Open invitations can't be used once the company is closed -- cancel them so a reopened company doesn't revive stale links.
  await db
    .update(teamInvitations)
    .set({ revokedAt: now.toISOString() })
    .where(
      and(
        eq(teamInvitations.organizationId, org.organizationId),
        isNull(teamInvitations.acceptedAt),
        isNull(teamInvitations.revokedAt),
      ),
    );
  await db.insert(purchasingAuditLog).values({
    id: newId("paudit"),
    organizationId: org.organizationId,
    userId: org.userId,
    recordType: "company",
    recordId: org.organizationId,
    fieldName: "status",
    previousValue: "open",
    newValue: "closed",
    note: `Company closed; data deleted after ${purgeAfter.toISOString().slice(0, 10)} unless restored`,
  });

  const until = purgeAfter.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  await sendEmail({
    to: me.email,
    subject: `${org.organizationName} was closed on jindjinni`,
    text: `You closed ${org.organizationName}. Everyone has been signed out of the workspace. You can reopen it until ${until} by signing in; after that the company's data is permanently deleted. If you didn't do this, sign in and reopen it right away and change your password.`,
    html: `<p>You closed <strong>${org.organizationName}</strong>. Everyone has been signed out of the workspace.</p><p>You can reopen it until <strong>${until}</strong> by signing in. After that, the company&rsquo;s data is permanently deleted.</p><p style="color:#64748b;font-size:13px">If you didn&rsquo;t do this, sign in and reopen it right away, then change your password.</p>`,
  }).catch(() => {});

  redirect("/closed");
}

export async function restoreCompany(): Promise<CompanyActionState> {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");
  const closed = await getClosedCompanyForUser(userId);
  if (!closed) redirect("/dashboard");
  if (!isOwner(closed.role)) return { error: "Only the owner can reopen the company." };
  if (closed.purgeAfter && new Date(closed.purgeAfter).getTime() <= Date.now()) {
    return { error: "The 30 days are up, so this company can no longer be reopened." };
  }
  await db
    .update(organizations)
    .set({ closedAt: null, closedByUserId: null, purgeAfter: null })
    .where(or(eq(organizations.id, closed.organizationId), eq(organizations.parentOrganizationId, closed.organizationId)));
  await db.insert(purchasingAuditLog).values({
    id: newId("paudit"),
    organizationId: closed.organizationId,
    userId,
    recordType: "company",
    recordId: closed.organizationId,
    fieldName: "status",
    previousValue: "closed",
    newValue: "open",
    note: "Company reopened",
  });
  redirect("/dashboard");
}
