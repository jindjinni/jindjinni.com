"use server";

// The owner or an admin switches the company's Wholesale and Distribution sides on or off (Settings -> Operations). Both are free.
// Nothing is saved while someone is only viewing the company, and the feature must be on for the company.

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/tenant";
import { isAdmin } from "@/lib/permissions";
import { getOperations, operationsEnabled, setSides } from "@/lib/operations-service";

export type OperationsState = { error?: string; message?: string } | undefined;

/** Switches one side on or off; the other side keeps whatever it was. */
export async function setSideAction(side: string, on: boolean): Promise<OperationsState> {
  const org = await requireOrg();
  if (org.viewAs) return { error: "You are only viewing this company, so nothing was changed." };
  if (!isAdmin(org.role)) return { error: "Only the company's owner or an admin can change this." };
  if (!(await operationsEnabled(org.organizationId))) return { error: "This isn't turned on for your company yet." };
  if (side !== "wholesale" && side !== "distribution") return { error: "Something went wrong. Reload the page and try again." };
  const cur = await getOperations(org.organizationId);
  const res = await setSides(org, { ...cur.sides, [side]: !!on });
  if (!res.ok) return { error: res.error };
  revalidatePath("/dashboard", "layout");
  return { message: res.message };
}

/** "Yes, this is right": confirms the sides the company already has (for a company that never chose). */
export async function confirmSidesAction(): Promise<OperationsState> {
  const org = await requireOrg();
  if (org.viewAs) return { error: "You are only viewing this company, so nothing was changed." };
  if (!isAdmin(org.role)) return { error: "Only the company's owner or an admin can change this." };
  if (!(await operationsEnabled(org.organizationId))) return { error: "This isn't turned on for your company yet." };
  const cur = await getOperations(org.organizationId);
  const res = await setSides(org, cur.sides);
  if (!res.ok) return { error: res.error };
  revalidatePath("/dashboard", "layout");
  return { message: res.message };
}
