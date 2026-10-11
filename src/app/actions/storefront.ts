"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrg, type CurrentOrg } from "@/lib/tenant";
import { canWritePurchasing, isAdmin } from "@/lib/permissions";
import { featureOn } from "@/lib/features";
import { cleanStorefrontSettings } from "@/lib/storefront-rules";
import { canWriteSales } from "@/lib/permissions";
import { decideBuyer, setBuyerHidden } from "@/lib/storefront-buyers";
import { getStorefront } from "@/lib/storefront-service";
import type { BuyerDecision } from "@/lib/storefront-buyer-rules";
import { makeQuotationFromRequest, moveRequest, saveStorefront, setRequestHidden } from "@/lib/storefront-service";

export type StorefrontState = { error?: string; saved?: boolean } | undefined;

/** Every storefront action starts here: the feature must be on for this company, and the person must be allowed to change Purchasing. */
async function requireRequestHandler(): Promise<CurrentOrg> {
  const org = await requireOrg();
  if (org.viewAs) throw new Error("Viewing a company is read-only.");
  if (!(await featureOn("storefronts", org.organizationId))) throw new Error("Storefronts are not switched on for this company yet.");
  if (!canWritePurchasing(org.role, org.access)) throw new Error("Your role can't make changes in Purchasing.");
  return org;
}

/** Settings -> Storefront. Owners and admins only. */
export async function saveStorefrontAction(_prev: StorefrontState, formData: FormData): Promise<StorefrontState> {
  const org = await requireOrg();
  if (org.viewAs) return { error: "Viewing a company is read-only." };
  if (!isAdmin(org.role)) return { error: "Only an owner or admin can change the storefront." };
  if (!(await featureOn("storefronts", org.organizationId))) return { error: "Storefronts are not switched on for this company yet." };
  const cleaned = cleanStorefrontSettings({ handle: formData.get("handle"), displayName: formData.get("displayName"), welcomeText: formData.get("welcomeText") });
  if (!cleaned.ok) return { error: cleaned.error };
  const saved = await saveStorefront(org.organizationId, {
    ...cleaned.value,
    sellOpen: formData.get("sellOpen") === "on",
    buyOpen: formData.get("buyOpen") === "on",
    hidden: formData.get("hidden") === "on",
  });
  if (!saved.ok) return { error: saved.error };
  revalidatePath("/dashboard/settings/storefront");
  return { saved: true };
}

export async function makeQuotationAction(requestId: string): Promise<void> {
  const org = await requireRequestHandler();
  const r = await makeQuotationFromRequest(org.organizationId, org.userId, requestId);
  revalidatePath("/dashboard/purchasing/website-requests");
  if (!r.ok) redirect(`/dashboard/purchasing/website-requests?problem=${encodeURIComponent(r.error)}`);
  redirect(`/dashboard/purchasing/quotations/${r.quotationId}`);
}

export async function declineRequestAction(requestId: string): Promise<void> {
  const org = await requireRequestHandler();
  await moveRequest(org.organizationId, org.userId, requestId, "DECLINED");
  revalidatePath("/dashboard/purchasing/website-requests");
}

export async function reopenRequestAction(requestId: string): Promise<void> {
  const org = await requireRequestHandler();
  await moveRequest(org.organizationId, org.userId, requestId, "NEW");
  revalidatePath("/dashboard/purchasing/website-requests");
}

export async function hideRequestAction(requestId: string, hidden: boolean): Promise<void> {
  const org = await requireRequestHandler();
  await setRequestHidden(org.organizationId, org.userId, requestId, hidden);
  revalidatePath("/dashboard/purchasing/website-requests");
}

/** Sales' "Web accounts": the person must be able to write in Sales (an accountant only looks), and the feature must be on. */
async function requireAccountHandler(): Promise<CurrentOrg> {
  const org = await requireOrg();
  if (org.viewAs) throw new Error("Viewing a company is read-only.");
  if (!(await featureOn("storefronts", org.organizationId))) throw new Error("Storefronts are not switched on for this company yet.");
  if (!canWriteSales(org.role, org.access)) throw new Error("Your role can't make changes in Sales.");
  return org;
}

export async function decideBuyerAction(id: string, decision: BuyerDecision): Promise<void> {
  const org = await requireAccountHandler();
  const sf = await getStorefront(org.organizationId);
  if (!sf) return;
  const r = await decideBuyer(org.organizationId, org.userId, id, decision, { name: sf.displayName, handle: sf.handle });
  revalidatePath("/dashboard/sales/web-accounts");
  const note = !r.ok ? `problem:${r.error}` : decision === "approve" ? (r.emailed ? "approved" : "approved-noemail") : "done";
  redirect(`/dashboard/sales/web-accounts?note=${encodeURIComponent(note)}`);
}

export async function hideBuyerAction(id: string, hidden: boolean): Promise<void> {
  const org = await requireAccountHandler();
  await setBuyerHidden(org.organizationId, org.userId, id, hidden);
  revalidatePath("/dashboard/sales/web-accounts");
}
