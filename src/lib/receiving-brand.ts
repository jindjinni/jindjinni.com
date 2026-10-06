// Groups received products under their brand (Dexcom, Omnipod, Freestyle, ...) so Daily Receiving and the Lot & Serial
// Tracker can show one tidy line per brand that opens to its products. Pure; reads nothing.

export const NO_BRAND = "Other";

export type BrandBlock<T> = { key: string; brand: string; rows: T[] };

/** The name shown for a brand ("Other" when the product has none). */
export const brandLabel = (brand: string | null | undefined) => (brand ?? "").trim() || NO_BRAND;

/** Groups rows by brand, brands A to Z with "Other" last. Rows keep the order they came in. */
export function groupByBrand<T>(rows: T[], brandOf: (r: T) => string | null | undefined): BrandBlock<T>[] {
  const map = new Map<string, BrandBlock<T>>();
  for (const r of rows) {
    const brand = brandLabel(brandOf(r));
    const key = brand.toLowerCase();
    let b = map.get(key);
    if (!b) map.set(key, (b = { key, brand, rows: [] }));
    b.rows.push(r);
  }
  return [...map.values()].sort((a, b) => {
    const ao = a.brand === NO_BRAND ? 1 : 0;
    const bo = b.brand === NO_BRAND ? 1 : 0;
    return ao - bo || a.brand.localeCompare(b.brand);
  });
}
