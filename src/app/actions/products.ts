"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/tenant";
import { db } from "@/db/client";
import { products } from "@/db/schema";
import { newId } from "@/lib/ids";

export type ActionState = { error?: string } | undefined;

/**
 * Adds a Product to the catalog. On-hand quantity is never set here -- a
 * brand-new product starts at zero in every condition until stock is
 * received, same as the Airtable base.
 */
export async function createProduct(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const org = await requireOrg();

  const name = String(formData.get("name") ?? "").trim();
  const sku = String(formData.get("sku") ?? "").trim();
  const basePriceRaw = String(formData.get("basePrice") ?? "").trim();
  const basePrice = basePriceRaw ? Number(basePriceRaw) : 0;

  if (!name) return { error: "Product name is required." };
  if (Number.isNaN(basePrice) || basePrice < 0) {
    return { error: "Base price must be a positive number." };
  }

  await db.insert(products).values({
    id: newId("prod"),
    organizationId: org.organizationId,
    name,
    sku: sku || null,
    basePrice,
  });

  revalidatePath("/dashboard/products");
}
