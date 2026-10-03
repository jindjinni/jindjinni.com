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
