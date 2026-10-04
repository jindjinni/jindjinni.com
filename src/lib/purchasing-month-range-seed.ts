// Mirrors purchasing-catalog-seed.ts's pattern: shared by the "Load Month
// Range catalog" action a Purchasing Manager can trigger from the Month
// Range screen (scoped to their own org). Safe to click more than once --
// an exact (label, minMonths, maxMonths, defaultMultiplier) match is skipped
// so the two intentional same-label-different-multiplier rows ("5-6 months",
// "8-11 months") still both get inserted the first time but never duplicate.
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { purchasingExpirationRanges } from "@/db/schema";
import { newId } from "@/lib/ids";
import { purchasingMonthRangeCatalog } from "@/lib/purchasing-month-range-seed-data";

export type SeedMonthRangeResult = { inserted: number; skipped: number };

export async function seedPurchasingMonthRangesForOrg(organizationId: string): Promise<SeedMonthRangeResult> {
  const existing = await db
    .select({
      label: purchasingExpirationRanges.label,
      minMonths: purchasingExpirationRanges.minMonths,
      maxMonths: purchasingExpirationRanges.maxMonths,
      defaultMultiplier: purchasingExpirationRanges.defaultMultiplier,
    })
    .from(purchasingExpirationRanges)
    .where(eq(purchasingExpirationRanges.organizationId, organizationId));

  const existingKeys = new Set(
    existing.map((r) => `${r.label.toLowerCase()}|${r.minMonths ?? ""}|${r.maxMonths ?? ""}|${r.defaultMultiplier}`),
  );

  let inserted = 0;
  let skipped = 0;
  let sortOrder = existing.length;

  for (const row of purchasingMonthRangeCatalog) {
    const key = `${row.label.toLowerCase()}|${row.minMonths ?? ""}|${row.maxMonths ?? ""}|${row.defaultMultiplier}`;
    if (existingKeys.has(key)) {
      skipped++;
      continue;
    }
    await db.insert(purchasingExpirationRanges).values({
      id: newId("prange"),
      organizationId,
      label: row.label,
      minMonths: row.minMonths,
      maxMonths: row.maxMonths,
      defaultMultiplier: row.defaultMultiplier,
      sortOrder: sortOrder++,
    });
    existingKeys.add(key);
    inserted++;
  }

  return { inserted, skipped };
}
