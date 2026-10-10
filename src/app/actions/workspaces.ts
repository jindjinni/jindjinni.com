"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOrg, getSessionUserId } from "@/lib/tenant";
import { isAdmin } from "@/lib/permissions";
import { COOKIE_NAME, mayOpen, parseKind } from "@/lib/operation-groups-rules";
import { after } from "next/server";
import { addOperation, nameWorkspace, rootIdOf, workspacesOfUser } from "@/lib/operation-groups";
import { readVerification, type VerificationInput } from "@/lib/business-verification";
import { checkSecondBusiness, entityOfSecondOperation, startSeparateBusiness } from "@/lib/second-business";
import { parseSameBusiness, SAME_BUSINESS_REQUIRED, SECOND_PREFIX } from "@/lib/second-business-rules";
import { runRegistryCheck } from "@/lib/state-registry";
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
  // Are the two operations the same LLC? A different LLC brings its own papers, which are checked before anything is created.
  const same = parseSameBusiness(fd.get("sameBusiness"));
  if (!same) return { error: SAME_BUSINESS_REQUIRED };
  let papers: VerificationInput | undefined;
  if (same === "different") {
    const second = await readVerification(fd, SECOND_PREFIX);
    if ("error" in second) return { error: second.error };
    const problem = await checkSecondBusiness(second.data, { rootId: await rootIdOf(org.organizationId) });
    if (problem) return { error: problem };
    papers = second.data;
  }
  const done = await addOperation(org, isAdmin(org.role), kind, papers);
  if (!done.ok) return { error: done.error };
  if (papers) after(() => runRegistryCheck(done.organizationId));
  // Stay in the operation you are in: with two operations the page would otherwise ask which to open.
  await remember(org.organizationId);
  revalidatePath("/dashboard", "layout");
  return {
    message: papers
      ? `The ${kind === "wholesale" ? "Wholesale" : "Distribution"} operation is added. Its business is waiting for review, and the operation opens once it is approved. This operation keeps working.`
      : `The ${kind === "wholesale" ? "Wholesale" : "Distribution"} operation is ready. It starts empty and separate from this one.`,
    openId: done.organizationId,
  };
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

/**
 * A company that already runs two operations (treated as one business so far) says the second one is a different LLC. Its papers go
 * to review and that operation is locked until they are approved. Owner or admin only.
 */
export async function makeSeparateBusinessAction(_prev: OpsState, fd: FormData): Promise<OpsState> {
  const org = await requireOrg();
  if (org.viewAs) return { error: "Nothing can be changed while you are only viewing." };
  if (!isAdmin(org.role)) return { error: "Only an owner or admin can do this." };
  const rootId = await rootIdOf(org.organizationId);
  const second = await entityOfSecondOperation(rootId);
  if (!second) return { error: "Add your second operation first." };
  if (second.status !== null) return { error: "That operation is already a separate business." };
  const read = await readVerification(fd, SECOND_PREFIX);
  if ("error" in read) return { error: read.error };
  const problem = await checkSecondBusiness(read.data, { rootId, childId: second.childId });
  if (problem) return { error: problem };
  await startSeparateBusiness(second.childId, read.data);
  after(() => runRegistryCheck(second.childId));
  revalidatePath("/dashboard", "layout");
  return { message: "Sent for review. That operation is locked until the second business is approved. Your other operation keeps working." };
}
