"use server";

import { isAdmin } from "@/lib/permissions";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { requireOrg } from "@/lib/tenant";
import { db } from "@/db/client";
import { organizations } from "@/db/schema";

export type ActionState = { error?: string; success?: boolean } | undefined;

const str = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim() || null;

/**
 * The "ship from" identity printed on every generated label. Owners/admins
 * only -- requireOrg() alone doesn't gate by role, so that check lives here
 * (mirroring the page-level check on the settings page itself).
 */
export async function updateBusinessSettings(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const org = await requireOrg();
  if (!isAdmin(org.role)) return { error: "Only owners and admins can change this." };

  await db
    .update(organizations)
    .set({
      shipFromName: str(formData, "shipFromName"),
      shipFromCompany: str(formData, "shipFromCompany"),
      shipFromStreet1: str(formData, "shipFromStreet1"),
      shipFromStreet2: str(formData, "shipFromStreet2"),
      shipFromCity: str(formData, "shipFromCity"),
      shipFromState: str(formData, "shipFromState"),
      shipFromZip: str(formData, "shipFromZip"),
      shipFromCountry: str(formData, "shipFromCountry") ?? "US",
      shipFromPhone: str(formData, "shipFromPhone"),
      shipFromEmail: str(formData, "shipFromEmail"),
    })
    .where(eq(organizations.id, org.organizationId));

  revalidatePath("/dashboard/settings/business");
  return { success: true };
}
