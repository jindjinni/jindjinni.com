// Mirrors purchasing-month-range-seed.ts's pattern: shared by the "Load the
// real conditions" action a Purchasing Manager can trigger from the Manage
// Conditions tab (scoped to their own org). Safe to click more than once --
// skips any condition whose name (case-insensitive) already exists.
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { purchasingConditions } from "@/db/schema";
import { newId } from "@/lib/ids";
import { purchasingConditionCatalog } from "@/lib/purchasing-condition-seed-data";

export type SeedConditionResult = { inserted: number; skipped: number };

export async function seedPurchasingConditionsForOrg(organizationId: string): Promise<SeedConditionResult> {
  const existing = await db
    .select({ name: purchasingConditions.name })
    .from(purchasingConditions)
    .where(eq(purchasingConditions.organizationId, organizationId));
  const existingNames = new Set(existing.map((c) => c.name.toLowerCase()));

  let inserted = 0;
  let skipped = 0;
  let sortOrder = existing.length;

  for (const row of purchasingConditionCatalog) {
    if (existingNames.has(row.name.toLowerCase())) {
      skipped++;
      continue;
    }
    await db.insert(purchasingConditions).values({
      id: newId("pcond"),
      organizationId,
      name: row.name,
      multiplier: row.multiplier,
      sortOrder: sortOrder++,
    });
    existingNames.add(row.name.toLowerCase());
    inserted++;
  }

  return { inserted, skipped };
}
