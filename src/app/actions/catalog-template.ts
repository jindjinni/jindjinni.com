"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { requireOrg } from "@/lib/tenant";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { isPurchasingManager } from "@/lib/permissions";
import { addNewProductsForOrg, applyDefaultPricesForOrg, isPlatformAdminEmail, publishTemplateFromOrg } from "@/lib/catalog-template";

export type CatalogTemplateActionState = { error?: string; message?: string } | undefined;

async function emailOf(userId: string): Promise<string | null> {
  const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  return u?.email ?? null;
}

/**
 * Copies any products the platform's default catalog has gained since this company last received it. Never
 * overwrites or re-adds anything the company already edited, repriced or removed.
 */
export async function getNewProducts(_prev: CatalogTemplateActionState, _formData: FormData): Promise<CatalogTemplateActionState> {
  const org = await requireOrg();
  if (!isPurchasingManager(org.role)) return { error: "Only a Purchasing Manager or Master Admin can do that." };

  const r = await addNewProductsForOrg(org.organizationId);
  revalidatePath("/dashboard/purchasing/products");
  if (r.upToDate) return { message: "You're up to date -- there are no new products in the default catalog." };
  const parts = [];
  if (r.addedProducts) parts.push(`${r.addedProducts} new product${r.addedProducts === 1 ? "" : "s"}`);
  if (r.addedRecalls) parts.push(`${r.addedRecalls} new recall${r.addedRecalls === 1 ? "" : "s"} to check`);
  return { message: `Added ${parts.join(" and ")} with the default prices. Check them before quoting.` };
}

/** Platform admins only: makes this company's catalog (with its prices and bonus tiers) the default every NEW company starts with. */
export async function publishMasterCatalog(_prev: CatalogTemplateActionState, _formData: FormData): Promise<CatalogTemplateActionState> {
  const org = await requireOrg();
  if (!isPurchasingManager(org.role)) return { error: "Only a Purchasing Manager or Master Admin can do that." };
  const email = await emailOf(org.userId);
  if (!isPlatformAdminEmail(email)) return { error: "Only the platform owner can publish the default catalog." };

  const r = await publishTemplateFromOrg(org.organizationId, email);
  if (!r.ok) return { error: r.error };
  revalidatePath("/dashboard/purchasing/products");
  const c = r.counts;
  return {
    message: `Published version ${r.version}: ${c.products} products, ${c.categories} brands, ${c.conditions} conditions, ${c.ranges} month ranges, ${c.recalls} recalls and ${c.bonusTiers} bonus tier${c.bonusTiers === 1 ? "" : "s"}, plus your payment terms, receiving form, customer email wording and menus. ${c.priced} of the ${c.products} products have a price. New companies now start with this; existing companies can use "Use the default prices and settings" or "Get new products".`,
  };
}

/** Fills in default prices on this company's $0 products. Never changes a price the company already set. */
export async function fillDefaultPrices(_prev: CatalogTemplateActionState, _formData: FormData): Promise<CatalogTemplateActionState> {
  const org = await requireOrg();
  if (!isPurchasingManager(org.role)) return { error: "Only a Purchasing Manager or Master Admin can do that." };
  const r = await applyDefaultPricesForOrg(org.organizationId);
  revalidatePath("/dashboard/purchasing/products");
  if (!r.hasTemplate) return { error: "No default catalog has been published yet." };
  const bits: string[] = [];
  if (r.priced) bits.push(`priced ${r.priced} product${r.priced === 1 ? "" : "s"}`);
  if (r.productsWithExpiry) bits.push(`set the expiry options on ${r.productsWithExpiry} product${r.productsWithExpiry === 1 ? "" : "s"}`);
  if (r.rangesAdded) bits.push(`added ${r.rangesAdded} month range${r.rangesAdded === 1 ? "" : "s"}`);
  if (r.conditionsAdded) bits.push(`added ${r.conditionsAdded} condition${r.conditionsAdded === 1 ? "" : "s"}`);
  if (r.tiersAdded) bits.push(`added ${r.tiersAdded} bonus tier${r.tiersAdded === 1 ? "" : "s"}`);
  if (r.detailsFilled) bits.push(`filled in blank details (NDC, code, brand) on ${r.detailsFilled} product${r.detailsFilled === 1 ? "" : "s"}`);
  if (r.settingsFilled.length) bits.push(`filled in ${r.settingsFilled.join(", ")}`);
  if (r.hidden) bits.push(`hid ${r.hidden} leftover condition/month range${r.hidden === 1 ? "" : "s"} that are not in the default (hidden, not deleted)`);
  if (bits.length === 0) {
    return { message: `Nothing to fill in: ${r.alreadyPriced} products already have a price${r.notInDefault ? ` and ${r.notInDefault} have no default price` : ""}.` };
  }
  const note = r.matched ? " Because this company has no quotations yet, its conditions, month ranges and brands were matched to the default." : "";
  return { message: `Done: ${bits.join("; ")}. ${r.alreadyPriced} products that already had a price were left alone.${note}` };
}
