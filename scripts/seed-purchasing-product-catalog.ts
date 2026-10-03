// One-off seed of the real Purchasing product catalog -- pulled from the
// team's Airtable "Product Database" (see docs/airtable-product-catalog.md
// for the full pull notes and data-quality caveats; the exact normalized
// data lives in src/lib/purchasing-product-catalog-data.ts, which also
// backs the in-app "Load product catalog" button on the Purchasing >
// Products screen -- this script is the same logic, for re-running by hand
// across every org at once, e.g. against a fresh local.db).
//
// Safe to run more than once: for a given org, it skips any product whose
// name that org already has, so re-running after someone has started
// editing the catalog by hand won't create duplicates.
import { db } from "../src/db/client";
import { organizations } from "../src/db/schema";
import { seedPurchasingProductCatalogForOrg } from "../src/lib/purchasing-catalog-seed";

async function main() {
  const orgs = await db.select({ id: organizations.id, name: organizations.name }).from(organizations);

  let totalInserted = 0;
  let totalSkipped = 0;
  for (const org of orgs) {
    const { inserted, skipped, missingCategories } = await seedPurchasingProductCatalogForOrg(org.id);
    if (missingCategories.length > 0) {
      console.warn(
        `  "${org.name}": no category found for [${missingCategories.join(", ")}] -- run scripts/backfill-purchasing-defaults.ts first.`,
      );
    }
    console.log(`"${org.name}" (${org.id}): inserted ${inserted}, skipped ${skipped}.`);
    totalInserted += inserted;
    totalSkipped += skipped;
  }

  console.log(`Done. ${totalInserted} product(s) inserted, ${totalSkipped} skipped, across ${orgs.length} organization(s).`);
}

main().then(() => process.exit(0));
