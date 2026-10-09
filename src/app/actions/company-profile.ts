"use server";

// A company's owner updates the state file number on record (for example after the state issues a new one). The change is
// written to the company's history for the platform owner and checked against the state's public records again. The EIN and the
// business name are not changed here: those need a person at jindjinni.

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { businessProfiles, businessVerifications } from "@/db/schema";
import { requireOrg } from "@/lib/tenant";
import { isOwner } from "@/lib/permissions";
import { logDecision } from "@/lib/company-admin";
import { runRegistryCheck } from "@/lib/state-registry";

export type ProfileState = { error?: string; message?: string } | undefined;

export async function updateFilingNumber(_prev: ProfileState, fd: FormData): Promise<ProfileState> {
  const org = await requireOrg();
  if (!isOwner(org.role)) return { error: "Only the company's owner can update this." };
  const next = String(fd.get("stateFileNumber") ?? "").replace(/\r/g, "").trim().slice(0, 40);
  if (next.length < 3) return { error: "Enter the state registration / file number from your state filing (at least 3 characters)." };

  const [cur] = await db.select({ file: businessVerifications.stateFileNumber }).from(businessVerifications).where(eq(businessVerifications.organizationId, org.organizationId)).limit(1);
  if (!cur) return { error: "There are no verification details on file for this company. Contact support." };
  if (cur.file === next) return { message: "That is already the number on file." };

  const now = new Date().toISOString();
  await db
    .update(businessVerifications)
    .set({ stateFileNumber: next, updatedAt: now, registryStatus: null, registryDetail: null, registryCheckedAt: null })
    .where(eq(businessVerifications.organizationId, org.organizationId));
  await db.update(businessProfiles).set({ businessRegistrationNumber: next }).where(eq(businessProfiles.organizationId, org.organizationId));
  await logDecision(org.organizationId, "details_updated", `State file number changed from ${cur.file} to ${next}`, org.userId);
  after(() => runRegistryCheck(org.organizationId));

  revalidatePath("/dashboard/settings/company-profile");
  revalidatePath("/dashboard/mothership/companies");
  return { message: "Saved. We'll check the new number against your state's records." };
}
