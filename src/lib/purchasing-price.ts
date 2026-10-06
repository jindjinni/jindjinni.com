// The one place a quoted line's unit price is worked out, used by the server (when a line is saved) and by the quotation
// form in the browser (to show the price live while the agent chooses), so the two can never disagree.
//
//   Unit price = Standard price x Expiry % x Condition %
//
// - Standard price: the price set on the product (Purchasing > Products).
// - Expiry %: the product's own % for that expiry range if it has one (Product Multipliers), otherwise the range's
//   default % (Expiration Ranges). A product that never expires has no expiry %.
// - Condition %: the condition's payout % (Conditions), e.g. Mint 100%, Ding 80%; or the one typed for a custom condition.

export const roundCents = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type PriceTables = {
  /** Expiry range id -> default multiplier (1 = 100%). */
  rangeDefaults: Record<string, number>;
  /** Product id -> expiry range id -> that product's own multiplier. */
  productMultipliers: Record<string, Record<string, number>>;
  /** Condition id -> multiplier. */
  conditionMultipliers: Record<string, number>;
};

/** The expiry multiplier for a product and range: the product's own, else the range default, else 100%. */
export function expiryMultiplierFor(t: PriceTables, productId: string | null, rangeId: string | null, noExpiration: boolean): number {
  if (noExpiration || !rangeId) return 1;
  const own = productId ? t.productMultipliers[productId]?.[rangeId] : undefined;
  return own ?? t.rangeDefaults[rangeId] ?? 1;
}

export type PriceBreakdown = {
  standardPrice: number;
  expiryMultiplier: number;
  conditionMultiplier: number;
  unitPrice: number;
};

export function priceBreakdown(standardPrice: number, expiryMultiplier: number, conditionMultiplier: number): PriceBreakdown {
  return { standardPrice, expiryMultiplier, conditionMultiplier, unitPrice: roundCents(standardPrice * expiryMultiplier * conditionMultiplier) };
}

/** 0.8 -> "80%", 0.625 -> "62.5%". */
export function pct(multiplier: number): string {
  const v = Math.round(multiplier * 10000) / 100;
  return `${v}%`;
}
