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
  const more = r.settingsFilled.length > 0 ? ` Also filled in: ${r.settingsFilled.join(", ")}.` : "";
  if (r.priced === 0 && r.tiersAdded === 0 && r.settingsFilled.length === 0) {
    return { message: `Nothing to fill in: ${r.alreadyPriced} products already have a price${r.notInDefault ? ` and ${r.notInDefault} have no default price` : ""}.` };
  }
  const parts = [`priced ${r.priced} product${r.priced === 1 ? "" : "s"}`];
  if (r.tiersAdded) parts.push(`added ${r.tiersAdded} bonus tier${r.tiersAdded === 1 ? "" : "s"}`);
  return { message: `Done: ${parts.join(" and ")}. ${r.alreadyPriced} that already had a price were left alone.${more}` };
}
