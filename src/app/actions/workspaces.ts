"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOrg, getSessionUserId } from "@/lib/tenant";
import { isAdmin } from "@/lib/permissions";
import { COOKIE_NAME, mayOpen, parseKind } from "@/lib/operation-groups-rules";
import { addOperation, nameWorkspace, workspacesOfUser } from "@/lib/operation-groups";
import { setShowAllTabs } from "@/lib/operations-service";

const REMEMBER_FOR_SECONDS = 60 * 60 * 24 * 30;

async function remember(organizationId: string) {
  (await cookies()).set(COOKIE_NAME, organizationId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: REMEMBER_FOR_SECONDS });
}

/** Forget which operation was open, so the next sign-in asks again. Called when someone signs in or out. */
export async function forgetWorkspace() {
  (await cookies()).delete(COOKIE_NAME);
}

/** Opens one operation: only one the person really has access to (checked here, never trusted from the form). */
export async function openWorkspace(formData: FormData) {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");
  const organizationId = String(formData.get("organizationId") ?? "");
  if (!mayOpen(await workspacesOfUser(userId), organizationId)) redirect("/choose");
  await remember(organizationId);
  redirect("/dashboard");
}

/** Back to the screen that asks which operation to open (also where Overall status is). */
export async function leaveWorkspace() {
  await forgetWorkspace();
  redirect("/choose");
}

export type OpsState = { error?: string; message?: string; openId?: string } | undefined;

/** An older company says once what its current records are (Wholesale or Distribution). Owner or admin only. */
export async function nameWorkspaceAction(_prev: OpsState, fd: FormData): Promise<OpsState> {
  const org = await requireOrg();
  if (org.viewAs) return { error: "Nothing can be changed while you are only viewing." };
  if (!isAdmin(org.role)) return { error: "Only an owner or admin can do this." };
  const kind = parseKind(fd.get("kind"));
  if (!kind) return { error: "Choose Wholesale or Distribution." };
  const done = await nameWorkspace(org, kind);
  if (!done.ok) return { error: done.error };
  revalidatePath("/dashboard", "layout");
  return { message: `Saved. Your current records are the ${kind === "wholesale" ? "Wholesale" : "Distribution"} operation.` };
}

/** Adds the other operation as a separate, empty workspace. Owner or admin only. */
export async function addOperationAction(_prev: OpsState, fd: FormData): Promise<OpsState> {
  const org = await requireOrg();
  if (org.viewAs) return { error: "Nothing can be changed while you are only viewing." };
  const kind = parseKind(fd.get("kind"));
  if (!kind) return { error: "Choose Wholesale or Distribution." };
  if (String(fd.get("confirmCost") ?? "") !== "yes") return { error: "Tick the box to confirm you understand the price goes up when you add the second operation." };
  const done = await addOperation(org, isAdmin(org.role), kind);
  if (!done.ok) return { error: done.error };
  // Stay in the operation you are in: with two operations the page would otherwise ask which to open.
  await remember(org.organizationId);
  revalidatePath("/dashboard", "layout");
  return { message: `The ${kind === "wholesale" ? "Wholesale" : "Distribution"} operation is ready. It starts empty and separate from this one.`, openId: done.organizationId };
}

/** Owner or admin: show every tab in this operation's menus (including the ones that belong to the other way of working), or go back to the tailored menus. */
export async function showAllTabsAction(_prev: OpsState, fd: FormData): Promise<OpsState> {
  const org = await requireOrg();
  if (org.viewAs) return { error: "Nothing can be changed while you are only viewing." };
  if (!isAdmin(org.role)) return { error: "Only an owner or admin can do this." };
  const on = String(fd.get("on") ?? "") === "1";
  await setShowAllTabs(org, on);
  revalidatePath("/dashboard", "layout");
  return { message: on ? "Every tab is now shown in this operation's menus." : "The menus now show only what this operation uses." };
}
