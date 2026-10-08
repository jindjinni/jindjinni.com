"use server";

// The platform owner's decisions about a company: approve, turn down, suspend, reinstate, ban and lift a ban. Every call
// re-checks that the person is the platform owner (hiding the page is never the guard), follows a fixed list of allowed
// moves so a company can't jump somewhere odd, and writes the decision into that company's history. A company can never
// be switched off by itself, so the owner can't lock themselves out.

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { organizations } from "@/db/schema";
import { requireOrg } from "@/lib/tenant";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { runRegistryCheck } from "@/lib/state-registry";
import { logDecision, normalizeStatus, type CompanyStatus } from "@/lib/company-admin";

export type ApprovalState = { error?: string; message?: string } | undefined;

type Decision = "approve" | "reject" | "suspend" | "reinstate" | "ban" | "unban";

/** Which moves are allowed from each state, and where they lead. */
const MOVES: Record<CompanyStatus, Partial<Record<Decision, CompanyStatus>>> = {
  pending: { approve: "approved", reject: "rejected", ban: "banned" },
  approved: { suspend: "suspended", ban: "banned" },
  rejected: { approve: "approved", ban: "banned" },
  suspended: { reinstate: "approved", ban: "banned" },
  banned: { unban: "approved" },
};

const LOG: Record<Decision, string> = { approve: "approved", reject: "turned_down", suspend: "suspended", reinstate: "reinstated", ban: "banned", unban: "ban_lifted" };

const DONE: Record<Decision, string> = {
  approve: "Approved. They can sign in now.",
  reject: "Turned down. They can see your note and send new details.",
  suspend: "Suspended. They are locked out and their data is kept.",
  reinstate: "Reinstated. They can sign in again.",
  ban: "Banned. Their account is closed and their EIN can't be used to sign up again.",
  unban: "Ban lifted. They can sign in again, and their EIN is free to use.",
};

export async function decideApprovalAction(_prev: ApprovalState, fd: FormData): Promise<ApprovalState> {
  const org = await requireOrg();
  if (!(await isPlatformAdmin(org))) return { error: "Only the platform owner can do this." };

  const orgId = String(fd.get("orgId") ?? "").slice(0, 80);
  const decision = String(fd.get("decision") ?? "") as Decision;
  const reason = String(fd.get("reason") ?? "").replace(/\r/g, "").trim().slice(0, 500);
  if (!orgId) return { error: "Choose a company." };
  if (orgId === org.organizationId) return { error: "You can't change your own company." };
  if (!["approve", "reject", "suspend", "reinstate", "ban", "unban"].includes(decision)) return { error: "Choose what to do." };

  const [target] = await db.select({ id: organizations.id, status: organizations.approvalStatus }).from(organizations).where(eq(organizations.id, orgId)).limit(1);
  if (!target) return { error: "That company no longer exists." };

  const from = normalizeStatus(target.status);
  const to = MOVES[from][decision];
  if (!to) return { error: "That isn't possible for this company right now. Reload the page to see where it stands." };

  if (decision === "reject" && reason.length < 5) return { error: "Say what's wrong so they can fix it (at least a few words)." };
  if (decision === "suspend" && reason.length < 5) return { error: "Say which part of our Terms and Conditions they broke (at least a few words). They will read it." };
  if (decision === "ban") {
    if (reason.length < 5) return { error: "Say which part of our Terms and Conditions they broke (at least a few words). This is kept in your records." };
    if (fd.get("confirm") !== "yes") return { error: "Tick the box to confirm. A ban is permanent and blocks their EIN." };
  }

  const now = new Date().toISOString();
  // What the company itself will read: the note for a turn-down or suspension; nothing after approval or a ban.
  const shown = decision === "reject" || decision === "suspend" ? reason : null;
  await db
    .update(organizations)
    .set({ approvalStatus: to, approvalReason: shown, approvalDecidedAt: now, updatedAt: now })
    .where(eq(organizations.id, orgId));
  await logDecision(orgId, LOG[decision], reason || null, org.userId);

  revalidatePath("/dashboard/settings/companies");
  return { message: DONE[decision] };
}

/** Runs the state-records check again for one company (the platform owner presses "Check again"). */
export async function recheckRegistryAction(_prev: ApprovalState, fd: FormData): Promise<ApprovalState> {
  const org = await requireOrg();
  if (!(await isPlatformAdmin(org))) return { error: "Only the platform owner can do this." };
  const orgId = String(fd.get("orgId") ?? "").slice(0, 80);
  if (!orgId) return { error: "Choose a company." };
  await runRegistryCheck(orgId);
  revalidatePath("/dashboard/settings/companies");
  return { message: "Checked again." };
}
