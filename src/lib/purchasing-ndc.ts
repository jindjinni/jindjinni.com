// NDC (National Drug Code) helpers for Purchasing products.
//
// Before the dedicated `ndc` column existed, an NDC lived inside a product's
// Notes as "NDC 12345-678-90" (the catalog seed wrote it that way). This
// pulls those into the real column, once, without ever overwriting an NDC
// someone has set.
import { and, eq, isNull, or, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { purchasingProducts } from "@/db/schema";
import { purchasingProductCatalog } from "@/lib/purchasing-product-catalog-data";

const NDC_IN_TEXT = /\bNDC[:#\s-]*([0-9]{4,5}-?[0-9]{3,4}-?[0-9]{1,2})\b/i;

/** Pulls an NDC out of free text like "NDC 53885-0245-50 -- keep dry"; null if none. */
export function extractNdc(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = text.match(NDC_IN_TEXT);
  return m ? m[1] : null;
}

const catalogNdcByName = new Map(
  purchasingProductCatalog.filter((r) => r.ndc).map((r) => [r.name.trim().toLowerCase(), r.ndc as string]),
);

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Fills the NDC column for every product in the org that has none yet, from
 * (1) an "NDC ..." mention in its Notes, else (2) the built-in catalog by
 * name. Never overwrites an existing NDC. Cheap and idempotent -- safe to run
 * on every Products page load. Returns how many products were filled.
 */
export async function backfillProductNdcs(organizationId: string): Promise<number> {
  const missing = await db
    .select({ id: purchasingProducts.id, name: purchasingProducts.name, notes: purchasingProducts.notes })
    .from(purchasingProducts)
    .where(
      and(
        eq(purchasingProducts.organizationId, organizationId),
        or(isNull(purchasingProducts.ndc), eq(purchasingProducts.ndc, "")),
      ),
    );

  const byNdc = new Map<string, string[]>();
  for (const p of missing) {
    const ndc = extractNdc(p.notes) ?? catalogNdcByName.get(p.name.trim().toLowerCase()) ?? null;
    if (!ndc) continue;
    const ids = byNdc.get(ndc) ?? [];
    ids.push(p.id);
    byNdc.set(ndc, ids);
  }

  let filled = 0;
  for (const [ndc, ids] of byNdc) {
    for (const part of chunk(ids, 100)) {
      await db
        .update(purchasingProducts)
        .set({ ndc })
        .where(and(eq(purchasingProducts.organizationId, organizationId), inArray(purchasingProducts.id, part)));
      filled += part.length;
    }
  }
  return filled;
}
