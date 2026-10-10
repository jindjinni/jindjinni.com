"use server";

// What a company can do while it waits for approval: fix its details and send them again after being turned down.

import { after } from "next/server";
import { runRegistryCheck } from "@/lib/state-registry";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { businessProfiles, organizations } from "@/db/schema";
import { getHeldCompanyForUser, getSessionUserId } from "@/lib/tenant";
import { isOwner } from "@/lib/permissions";
import { rootIdOf } from "@/lib/operation-groups";
import { checkSecondBusiness, startSeparateBusiness } from "@/lib/second-business";
import { readVerification, einInUse, saveVerification, EIN_IN_USE_MESSAGE } from "@/lib/business-verification";

export type ResubmitState = { error?: string } | undefined;

export async function resubmitVerification(_prev: ResubmitState, formData: FormData): Promise<ResubmitState> {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");
  const held = await getHeldCompanyForUser(userId);
  if (!held) redirect("/dashboard");
  if (!isOwner(held.role)) return { error: "Only the company's owner can send the details again." };
  if (held.status !== "rejected") return { error: "Your details are already waiting for review." };

  const verification = await readVerification(formData);
  if ("error" in verification) return { error: verification.error };
  // Only one operation (a different business) was turned down: fix it the same way, keeping the company's other operation as it is.
  if (held.operationKind) {
    const problem = await checkSecondBusiness(verification.data, { rootId: await rootIdOf(held.organizationId), childId: held.organizationId });
    if (problem) return { error: problem };
    await startSeparateBusiness(held.organizationId, verification.data);
    after(() => runRegistryCheck(held.organizationId));
    redirect("/under-review");
  }
  if (await einInUse(verification.data.ein, held.organizationId)) return { error: EIN_IN_USE_MESSAGE };

  await saveVerification(held.organizationId, verification.data);
  // Compare the file number with the state's public records once the response is sent; the owner sees the result in Settings -> Companies.
  after(() => runRegistryCheck(held.organizationId));
  await db
    .update(businessProfiles)
    .set({ taxId: verification.data.ein, businessRegistrationNumber: verification.data.stateFileNumber })
    .where(eq(businessProfiles.organizationId, held.organizationId));
  await db
    .update(organizations)
    .set({ approvalStatus: "pending", approvalReason: null, approvalDecidedAt: null })
    .where(eq(organizations.id, held.organizationId));
  redirect("/under-review");
}
