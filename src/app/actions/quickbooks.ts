"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { requireOrg, type CurrentOrg } from "@/lib/tenant";
import { canConnectQuickBooks, canPullReports, canSeeReport } from "@/lib/quickbooks-access";
import { pullReport, quickbooksOn, takeUpload } from "@/lib/quickbooks-service";
import { removeQuickBooks } from "@/lib/quickbooks";
import { isReportKind } from "@/lib/quickbooks-rules";
import { logActivity } from "@/lib/hr-service";

export type QbResult = { ok: true; message: string } | { ok: false; error: string };

const OFF = "QuickBooks isn't turned on for your company yet.";
const LOOK_ONLY = "You are looking at this company's account, so nothing can be changed.";

const refresh = () => {
  revalidatePath("/dashboard/accounts/quickbooks");
  revalidatePath("/dashboard/sales/quickbooks");
  revalidatePath("/dashboard/settings/connectors");
};

async function who(org: CurrentOrg): Promise<{ userId: string; name: string | null }> {
  const [u] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, org.userId)).limit(1);
  return { userId: org.userId, name: u?.name || u?.email || null };
}

async function gate(kindRaw: string, needPull: boolean): Promise<{ org: CurrentOrg; kind: "PAID" | "OWED" | "PNL" } | { error: string }> {
  const org = await requireOrg();
  if (org.viewAs) return { error: LOOK_ONLY };
  if (!(await quickbooksOn(org.organizationId))) return { error: OFF };
  if (!isReportKind(kindRaw)) return { error: "That report wasn't found." };
  if (!canSeeReport(org.role, org.access, kindRaw)) return { error: "Your role can't open this report." };
  if (needPull && !canPullReports(org.role, org.access)) return { error: "Only people who work in Sales or Accounts can pull a fresh copy." };
  return { org, kind: kindRaw };
}

/** Pulls a fresh copy of one report from the company's QuickBooks Online. */
export async function refreshReportAction(kindRaw: string): Promise<QbResult> {
  const g = await gate(String(kindRaw ?? ""), true);
  if ("error" in g) return { ok: false, error: g.error };
  const r = await pullReport(g.org.organizationId, g.kind, await who(g.org));
  refresh();
  return r.ok ? { ok: true, message: `Pulled ${r.rows} row${r.rows === 1 ? "" : "s"} from QuickBooks.` } : { ok: false, error: r.error };
}

/** Saves an exported CSV file from QuickBooks Desktop or Enterprise as the copy of one report. */
export async function uploadReportAction(formData: FormData): Promise<QbResult> {
  const g = await gate(String(formData.get("kind") ?? ""), true);
  if ("error" in g) return { ok: false, error: g.error };
  const f = formData.get("file");
  if (!(f instanceof File)) return { ok: false, error: "Choose a CSV file first." };
  const r = await takeUpload(g.org.organizationId, g.kind, f, await who(g.org));
  refresh();
  return r.ok ? { ok: true, message: `Saved ${r.rows} row${r.rows === 1 ? "" : "s"} from your file.` } : { ok: false, error: r.error };
}

/** Disconnects QuickBooks (owner or admin). QuickBooks is told to forget the key and ours is removed. Saved report copies stay. */
export async function disconnectQuickBooksAction(): Promise<QbResult> {
  const org = await requireOrg();
  if (org.viewAs) return { ok: false, error: LOOK_ONLY };
  if (!canConnectQuickBooks(org.role)) return { ok: false, error: "Only an owner or admin can disconnect QuickBooks." };
  if (!(await quickbooksOn(org.organizationId))) return { ok: false, error: OFF };
  await removeQuickBooks(org.organizationId);
  await logActivity(org, "OTHER", "Disconnected QuickBooks");
  refresh();
  return { ok: true, message: "QuickBooks disconnected. The saved report copies stay here; nothing in QuickBooks was changed." };
}
