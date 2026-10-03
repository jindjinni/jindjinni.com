import { randomUUID } from "crypto";

/** Prefixed ids (e.g. "org_3f1c2b...") -- self-describing in logs and DB browsers. */
export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "")}`;
}

/**
 * Starter conditions for a brand-new organization. Covers both the plain
 * resale grading (Mint / Dinged / Damaged) and the richer grading the
 * receiving/buyback module uses (ported from the Airtable base's "Product
 * Condition" choices, minus a handful of stray junk values that had crept
 * into that list -- e.g. "9/2027", "MINY" -- which were data-entry mistakes,
 * not real conditions). An org that doesn't use receiving can just ignore
 * the extra ones; Settings -> Conditions lets anyone add more later.
 */
export function defaultConditionRows(organizationId: string) {
  const names = [
    "Mint",
    "Dinged",
    "Minor Damage",
    "Damaged",
    "Stained",
    "Torn",
    "Crushed",
    "Opened",
    "Unsealed",
    "Expired",
    "Other",
  ];
  return names.map((name, sortOrder) => ({
    id: newId("cond"),
    organizationId,
    name,
    sortOrder,
  }));
}

// ---------------------------------------------------------------------------
// Purchasing department starter data -- every new org gets the same
// editable defaults (never hardcoded into the app itself), seeded once at
// signup/onboarding so Settings isn't an empty shell on day one.
// ---------------------------------------------------------------------------

/** Starter brand/category list -- pulled from the real product catalog (docs/airtable-product-catalog.md). Fully editable afterward. */
export function defaultPurchasingCategoryRows(organizationId: string) {
  const names = [
    "Dexcom",
    "Omnipod",
    "Freestyle",
    "Medtronic",
    "BD Pen Needles",
    "Accu-Chek",
    "OneTouch",
    "Contour",
    "True Metrix",
    "Tandem",
  ];
  return names.map((name, sortOrder) => ({
    id: newId("pcat"),
    organizationId,
    name,
    sortOrder,
  }));
}

/** Starter Purchasing grading scale -- separate editable list from the Inventory/Buyback `conditions` table. */
export function defaultPurchasingConditionRows(organizationId: string) {
  const names = ["Mint", "Dinged", "Minor Damage", "Damaged", "Expired"];
  return names.map((name, sortOrder) => ({
    id: newId("pcond"),
    organizationId,
    name,
    sortOrder,
  }));
}

/** Starter expiry buckets -- a quoted line picks one of these, never a typed date. */
export function defaultPurchasingExpirationRangeRows(organizationId: string) {
  const ranges: { label: string; minMonths: number | null; maxMonths: number | null }[] = [
    { label: "Expired", minMonths: null, maxMonths: -1 },
    { label: "0-3 months", minMonths: 0, maxMonths: 3 },
    { label: "4-6 months", minMonths: 4, maxMonths: 6 },
    { label: "7-9 months", minMonths: 7, maxMonths: 9 },
    { label: "10-12 months", minMonths: 10, maxMonths: 12 },
    { label: "12+ months", minMonths: 12, maxMonths: null },
  ];
  return ranges.map((r, sortOrder) => ({
    id: newId("prange"),
    organizationId,
    label: r.label,
    minMonths: r.minMonths,
    maxMonths: r.maxMonths,
    sortOrder,
  }));
}

/** Starter automatic bonus thresholds -- editable from Settings, matches the shape seen in the reference Bonus Management screenshot. */
export function defaultPurchasingBonusTierRows(organizationId: string) {
  const tiers = [
    { thresholdAmount: 100, bonusAmount: 1 },
    { thresholdAmount: 500, bonusAmount: 5 },
    { thresholdAmount: 1000, bonusAmount: 10 },
    { thresholdAmount: 2000, bonusAmount: 20 },
  ];
  return tiers.map((t, sortOrder) => ({
    id: newId("pbonus"),
    organizationId,
    thresholdAmount: t.thresholdAmount,
    bonusAmount: t.bonusAmount,
    sortOrder,
  }));
}
