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
  revalidatePath("/dashboard/shipping/settings");
  return { success: true };
}

/**
 * The address customers ship to (Purchasing). Every Purchasing label goes FROM the customer TO this address.
 * Owners/admins only. Every field a label needs is required, so a half-filled address can never be saved.
 */
export async function updateReceivingSettings(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const org = await requireOrg();
  if (!isAdmin(org.role)) return { error: "Only owners and admins can change this." };
  const v = {
    receiveName: str(formData, "receiveName"),
    receiveCompany: str(formData, "receiveCompany"),
    receiveStreet1: str(formData, "receiveStreet1"),
    receiveStreet2: str(formData, "receiveStreet2"),
    receiveCity: str(formData, "receiveCity"),
    receiveState: str(formData, "receiveState")?.toUpperCase() ?? null,
    receiveZip: str(formData, "receiveZip"),
    receiveCountry: str(formData, "receiveCountry") ?? "US",
    receivePhone: str(formData, "receivePhone"),
    receiveEmail: str(formData, "receiveEmail"),
  };
  const missing = (
    [["contact name", v.receiveName], ["street address", v.receiveStreet1], ["city", v.receiveCity], ["state", v.receiveState], ["ZIP", v.receiveZip], ["phone", v.receivePhone], ["email", v.receiveEmail]] as const
  ).filter(([, x]) => !x).map(([k]) => k);
  if (missing.length) return { error: `Fill in the ${missing[0]} (a label needs the full address, a phone and an email).` };
  await db.update(organizations).set(v).where(eq(organizations.id, org.organizationId));
  revalidatePath("/dashboard/purchasing/shipping-settings");
  revalidatePath("/dashboard/purchasing/quotations");
  return { success: true };
}

/** Goes back to using the shipping address for Purchasing labels too (clears the separate receiving address). */
export async function clearReceivingSettings(_prevState: ActionState, _formData: FormData): Promise<ActionState> {
  void _formData;
  const org = await requireOrg();
  if (!isAdmin(org.role)) return { error: "Only owners and admins can change this." };
  await db
    .update(organizations)
    .set({ receiveName: null, receiveCompany: null, receiveStreet1: null, receiveStreet2: null, receiveCity: null, receiveState: null, receiveZip: null, receiveCountry: null, receivePhone: null, receiveEmail: null })
    .where(eq(organizations.id, org.organizationId));
  revalidatePath("/dashboard/purchasing/shipping-settings");
  return { success: true };
}
