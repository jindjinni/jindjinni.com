// One-off backfill for organizations created before the Purchasing module
// existed (so signup/onboarding never seeded their Categories / Conditions
// / Expiration Ranges / Bonus Tiers). Safe to run more than once -- skips
// any org that already has at least one purchasing_categories row.
import { eq } from "drizzle-orm";
import { db } from "../src/db/client";
import { organizations, purchasingCategories, purchasingConditions, purchasingExpirationRanges, purchasingBonusTiers } from "../src/db/schema";
import {
  defaultPurchasingCategoryRows,
  defaultPurchasingConditionRows,
  defaultPurchasingExpirationRangeRows,
  defaultPurchasingBonusTierRows,
} from "../src/lib/ids";

async function main() {
  const orgs = await db.select({ id: organizations.id, name: organizations.name }).from(organizations);
  let seeded = 0;
  for (const org of orgs) {
    const [existing] = await db
      .select({ id: purchasingCategories.id })
      .from(purchasingCategories)
      .where(eq(purchasingCategories.organizationId, org.id))
      .limit(1);
    if (existing) continue;

    await db.insert(purchasingCategories).values(defaultPurchasingCategoryRows(org.id));
    await db.insert(purchasingConditions).values(defaultPurchasingConditionRows(org.id));
    await db.insert(purchasingExpirationRanges).values(defaultPurchasingExpirationRangeRows(org.id));
    await db.insert(purchasingBonusTiers).values(defaultPurchasingBonusTierRows(org.id));
    console.log(`Seeded Purchasing defaults for "${org.name}" (${org.id})`);
    seeded++;
  }
  console.log(`Done. Seeded ${seeded} of ${orgs.length} organization(s).`);
}

main().then(() => process.exit(0));
