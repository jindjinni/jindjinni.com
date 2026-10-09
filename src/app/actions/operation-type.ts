"use server";

// The owner or an admin changes how the company operates (Wholesaler, Distributor or Both). It decides which Purchasing documents
// the company gets, so only people who run the company can change it, and nothing is saved while someone is only viewing the company.

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { organizations } from "@/db/schema";
import { requireOrg } from "@/lib/tenant";
import { isAdmin } from "@/lib/permissions";
import { logActivity } from "@/lib/hr-service";
import { operationLabel, parseOperationType, readRequiredOperationType } from "@/lib/operation-type";

export type OperationState = { error?: string; message?: string } | undefined;

export async function saveOperationType(_prev: OperationState, fd: FormData): Promise<OperationState> {
  const org = await requireOrg();
  if (org.viewAs) return { error: "You are only viewing this company, so nothing was changed." };
  if (!isAdmin(org.role)) return { error: "Only the company's owner or an admin can change this." };
  const picked = readRequiredOperationType(fd.get("operationType"));
  if (!picked.ok) return { error: picked.error };

  const [cur] = await db.select({ t: organizations.operationType }).from(organizations).where(eq(organizations.id, org.organizationId)).limit(1);
  if (parseOperationType(cur?.t) === picked.type) return { message: "That is already how your company is set up." };

  await db.update(organizations).set({ operationType: picked.type, updatedAt: new Date().toISOString() }).where(eq(organizations.id, org.organizationId));
  await logActivity(org, "OTHER", `Changed how the company operates from ${operationLabel(parseOperationType(cur?.t))} to ${operationLabel(picked.type)}`, { type: "organization", id: org.organizationId });
  revalidatePath("/dashboard", "layout");
  return { message: `Saved. Your company is set up as: ${operationLabel(picked.type)}.` };
}
