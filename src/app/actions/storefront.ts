"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrg, type CurrentOrg } from "@/lib/tenant";
import { canRevealBankDetails, canWritePurchasing, isAdmin } from "@/lib/permissions";
import { featureOn } from "@/lib/features";
import { cleanStorefrontSettings } from "@/lib/storefront-rules";
import { canWriteSales } from "@/lib/permissions";
import { decideBuyer, setBuyerHidden } from "@/lib/storefront-buyers";
import { getStorefront } from "@/lib/storefront-service";
import { erasePayout, revealPayout } from "@/lib/storefront-payouts";
import { createApiKey, revokeApiKey, saveAllowedOrigins } from "@/lib/storefront-api";
import { KEY_KINDS, type KeyKind } from "@/lib/storefront-api-rules";
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

// ---- Connect your website (keys and allowed website addresses). Owners and admins only. ----------------------------------------------

async function requireConnectAdmin(): Promise<{ org: CurrentOrg } | { error: string }> {
  const org = await requireOrg();
  if (org.viewAs) return { error: "Viewing a company is read-only." };
  if (!isAdmin(org.role)) return { error: "Only an owner or admin can change the website connection." };
  if (!(await featureOn("storefronts", org.organizationId))) return { error: "Storefronts are not switched on for this company yet." };
  return { org };
}

export type KeyState = { error?: string; key?: string; kind?: string; label?: string } | undefined;

/** Makes a key. The key is shown once, in the answer, and is never kept. */
export async function makeKeyAction(_prev: KeyState, formData: FormData): Promise<KeyState> {
  const g = await requireConnectAdmin();
  if ("error" in g) return { error: g.error };
  const kind = String(formData.get("kind") ?? "");
  if (!(KEY_KINDS as readonly string[]).includes(kind)) return { error: "Choose which kind of key to make." };
  const sf = await getStorefront(g.org.organizationId);
  if (!sf) return { error: "Set up your storefront first (name and web address), then make a key." };
  const made = await createApiKey(g.org.organizationId, g.org.userId, sf.id, kind as KeyKind, formData.get("label"));
  if (!made.ok) return { error: made.error };
  revalidatePath("/dashboard/settings/storefront");
  return { key: made.key, kind, label: String(formData.get("label") ?? "").trim() };
}

export async function revokeKeyAction(id: string): Promise<void> {
  const g = await requireConnectAdmin();
  if ("error" in g) return;
  await revokeApiKey(g.org.organizationId, g.org.userId, id);
  revalidatePath("/dashboard/settings/storefront");
}

export type OriginsState = { error?: string; saved?: boolean; origins?: string } | undefined;

export async function saveOriginsAction(_prev: OriginsState, formData: FormData): Promise<OriginsState> {
  const g = await requireConnectAdmin();
  if ("error" in g) return { error: g.error };
  const r = await saveAllowedOrigins(g.org.organizationId, g.org.userId, formData.get("origins"));
  if (!r.ok) return { error: r.error };
  revalidatePath("/dashboard/settings/storefront");
  return { saved: true, origins: r.origins.join("\n") };
}

// ---- Direct-deposit details a seller sent (owners, admins and Accounts only) -----------------------------------------------------------

export type BankView = { error?: string; details?: { ownerName: string; routingNumber: string; accountNumber: string; accountType: string } } | undefined;

async function requireBankViewer(): Promise<{ org: CurrentOrg } | { error: string }> {
  const org = await requireOrg();
  if (org.viewAs) return { error: "Viewing a company is read-only." };
  if (!(await featureOn("storefronts", org.organizationId))) return { error: "Storefronts are not switched on for this company yet." };
  if (!canRevealBankDetails(org.role, org.access)) return { error: "Your role can't see bank details. Ask an owner, an admin or Accounts." };
  return { org };
}

/** Shows the full details to one person who is allowed, once, and records that they looked. Nothing is kept on the page afterwards. */
export async function revealBankAction(requestId: string): Promise<BankView> {
  const g = await requireBankViewer();
  if ("error" in g) return { error: g.error };
  const r = await revealPayout(g.org.organizationId, g.org.userId, requestId);
  return r.ok ? { details: r.details } : { error: r.error };
}

export async function eraseBankAction(requestId: string): Promise<{ error?: string; erased?: boolean }> {
  const g = await requireBankViewer();
  if ("error" in g) return { error: g.error };
  const r = await erasePayout(g.org.organizationId, g.org.userId, requestId);
  revalidatePath("/dashboard/purchasing/website-requests");
  return r.ok ? { erased: true } : { error: r.error };
}
