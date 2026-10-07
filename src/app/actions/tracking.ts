"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/tenant";
import { canViewPurchasing, isAdmin } from "@/lib/permissions";
import { getPurchasingQuotationWithItems } from "@/lib/queries";
import { syncQuotationTracking, turnOnLiveTracking } from "@/lib/tracking-service";

export type TrackingActionState = { ok?: boolean; error?: string };

/** Asks Shippo for the latest on every box of a quotation. Anyone who can open the quotation can press it. */
export async function refreshQuotationTracking(quotationId: string, force = false): Promise<TrackingActionState> {
  const org = await requireOrg();
  if (!canViewPurchasing(org.role, org.access)) return { error: "You can't refresh tracking." };
  const data = await getPurchasingQuotationWithItems(org.organizationId, quotationId);
  if (!data) return { error: "That quotation wasn't found." };
  await syncQuotationTracking(org.organizationId, quotationId, { force });
  revalidatePath(`/dashboard/purchasing/quotations/${quotationId}`);
  revalidatePath("/dashboard/purchasing/quotations");
  revalidatePath("/dashboard/receiving", "layout");
  return { ok: true };
}

/** Registers the app's tracking webhook with Shippo, so updates arrive the moment a package moves. Owner or admin only. */
export async function enableLiveTracking(): Promise<TrackingActionState> {
  const org = await requireOrg();
  if (!isAdmin(org.role)) return { error: "Only an owner or admin can turn on live tracking." };
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = process.env.APP_ORIGIN || `${proto}://${host}`;
  const res = await turnOnLiveTracking(origin);
  revalidatePath("/dashboard/purchasing/tracking");
  return res.ok ? { ok: true } : { error: res.error };
}
