"use server";

// The platform owner's decision on a new company. Every call re-checks that the person is the platform owner; hiding the
// page is never the guard. A company can never be switched off by itself (so the owner can't lock themselves out).

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { organizations } from "@/db/schema";
import { requireOrg } from "@/lib/tenant";
import { isPlatformAdmin } from "@/lib/platform-admin";

export type ApprovalState = { error?: string; message?: string } | undefined;

export async function decideApprovalAction(_prev: ApprovalState, fd: FormData): Promise<ApprovalState> {
  const org = await requireOrg();
  if (!(await isPlatformAdmin(org))) return { error: "Only the platform owner can approve companies." };

  const orgId = String(fd.get("orgId") ?? "").slice(0, 80);
  const decision = String(fd.get("decision") ?? "");
  const reason = String(fd.get("reason") ?? "").replace(/\r/g, "").trim().slice(0, 500);
  if (!orgId) return { error: "Choose a company." };
  if (orgId === org.organizationId) return { error: "You can't change your own company's approval." };
  if (decision !== "approve" && decision !== "reject") return { error: "Choose Approve or Reject." };
  if (decision === "reject" && reason.length < 5) return { error: "Say what's wrong so they can fix it (at least a few words)." };

  const [target] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, orgId)).limit(1);
  if (!target) return { error: "That company no longer exists." };

  const now = new Date().toISOString();
  if (decision === "approve") {
    await db.update(organizations).set({ approvalStatus: "approved", approvalReason: null, approvalDecidedAt: now }).where(eq(organizations.id, orgId));
  } else {
    await db.update(organizations).set({ approvalStatus: "rejected", approvalReason: reason, approvalDecidedAt: now }).where(eq(organizations.id, orgId));
  }
  revalidatePath("/dashboard/settings/approvals");
  return { message: decision === "approve" ? "Approved. They can sign in now." : "Turned down. They can see your note and send new details." };
}
