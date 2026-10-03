// Shared by scripts/seed-purchasing-product-catalog.ts (loops every org,
// for one-off/local use) and the "Load product catalog" action a Purchasing
// Manager can trigger from the Products screen (scoped to their own org).
// Kept here rather than duplicated so the two stay in sync.
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { purchasingCategories, purchasingProducts } from "@/db/schema";
import { newId } from "@/lib/ids";
import { purchasingProductCatalog } from "@/lib/purchasing-product-catalog-data";

export type SeedCatalogResult = { inserted: number; skipped: number; missingCategories: string[] };

/**
 * Inserts the reference product catalog for one org, skipping any product
 * whose name that org already has. Safe to call more than once.
 */
export async function seedPurchasingProductCatalogForOrg(organizationId: string): Promise<SeedCatalogResult> {
  const categories = await db
    .select({ id: purchasingCategories.id, name: purchasingCategories.name })
    .from(purchasingCategories)
    .where(eq(purchasingCategories.organizationId, organizationId));
  const categoryIdByName = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]));

  const existingProducts = await db
    .select({ name: purchasingProducts.name })
    .from(purchasingProducts)
    .where(eq(purchasingProducts.organizationId, organizationId));
  const existingNames = new Set(existingProducts.map((p) => p.name.toLowerCase()));

  let inserted = 0;
  let skipped = 0;
  const missingCategories = new Set<string>();

  for (const row of purchasingProductCatalog) {
    if (existingNames.has(row.name.toLowerCase())) {
      skipped++;
      continue;
    }
    const categoryId = categoryIdByName.get(row.category.toLowerCase());
    if (!categoryId) {
      missingCategories.add(row.category);
      skipped++;
      continue;
    }
    const notes = [row.notes, row.ndc ? `NDC ${row.ndc}` : null].filter(Boolean).join(" -- ") || null;
    await db.insert(purchasingProducts).values({
      id: newId("pprod"),
      organizationId,
      categoryId,
      name: row.name,
      productCode: row.productCode,
      standardPrice: 0,
      notes,
      active: row.active,
    });
    inserted++;
  }

  return { inserted, skipped, missingCategories: [...missingCategories] };
}
