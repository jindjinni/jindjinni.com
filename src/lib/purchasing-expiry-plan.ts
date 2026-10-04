// Works out -- without writing anything -- what applying the brand-level
// expiry rules would change for one org. The page preview renders this, and
// the apply action runs the very same plan, so what you see is what you get.
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  purchasingAuditLog,
  purchasingCategories,
  purchasingExpirationRanges,
  purchasingProductMultipliers,
  purchasingProducts,
} from "@/db/schema";
import { newId } from "@/lib/ids";
import { expiryRules, ruleForProduct, sameRangeShape, type ExpiryOption, type ExpiryRule } from "@/lib/purchasing-expiry-rules";

type RangeRow = {
  id: string;
  label: string;
  minMonths: number | null;
  maxMonths: number | null;
  defaultMultiplier: number;
};

export type PlannedProduct = {
  id: string;
  name: string;
  /** Options this product is missing and will gain. */
  toAdd: ExpiryOption[];
  /** Existing option rows (range ids) that are NOT part of the rule. */
  extraRowIds: string[];
  extraLabels: string[];
  /** Rows already in place. */
  alreadyHave: number;
  /** Whether the product's "does not expire" flag will change. */
  flagChange: boolean;
};

export type PlannedRule = {
  rule: ExpiryRule;
  products: PlannedProduct[];
};

export type ExpiryPlan = {
  rules: PlannedRule[];
  unmatched: string[];
  ranges: RangeRow[];
};

/** Prefer an exact multiplier match; otherwise any range with the same label and months. */
export function findRangeForOption(ranges: RangeRow[], option: ExpiryOption): RangeRow | null {
  const sameShape = ranges.filter((r) => sameRangeShape(r, option));
  if (sameShape.length === 0) return null;
  return sameShape.find((r) => Math.abs(r.defaultMultiplier - option.multiplier) < 0.0005) ?? sameShape[0];
}

export async function buildExpiryPlan(organizationId: string): Promise<ExpiryPlan> {
  const [products, ranges, multiplierRows] = await Promise.all([
    db
      .select({
        id: purchasingProducts.id,
        name: purchasingProducts.name,
        noExpiration: purchasingProducts.noExpiration,
        categoryName: purchasingCategories.name,
        active: purchasingProducts.active,
        archivedAt: purchasingProducts.archivedAt,
      })
      .from(purchasingProducts)
      .leftJoin(purchasingCategories, eq(purchasingProducts.categoryId, purchasingCategories.id))
      .where(eq(purchasingProducts.organizationId, organizationId))
      .orderBy(purchasingProducts.name),
    db
      .select({
        id: purchasingExpirationRanges.id,
        label: purchasingExpirationRanges.label,
        minMonths: purchasingExpirationRanges.minMonths,
        maxMonths: purchasingExpirationRanges.maxMonths,
        defaultMultiplier: purchasingExpirationRanges.defaultMultiplier,
      })
      .from(purchasingExpirationRanges)
      .where(eq(purchasingExpirationRanges.organizationId, organizationId)),
    db
      .select({
        id: purchasingProductMultipliers.id,
        productId: purchasingProductMultipliers.productId,
        expirationRangeId: purchasingProductMultipliers.expirationRangeId,
      })
      .from(purchasingProductMultipliers)
      .where(eq(purchasingProductMultipliers.organizationId, organizationId)),
  ]);

  const rangeById = new Map(ranges.map((r) => [r.id, r]));
  const rowsByProduct = new Map<string, { id: string; rangeId: string }[]>();
  for (const m of multiplierRows) {
    const list = rowsByProduct.get(m.productId) ?? [];
    list.push({ id: m.id, rangeId: m.expirationRangeId });
    rowsByProduct.set(m.productId, list);
  }

  const planned = new Map<string, PlannedProduct[]>(expiryRules.map((r) => [r.key, []]));
  const unmatched: string[] = [];

  for (const p of products) {
    if (!p.active || p.archivedAt) continue;
    const rule = ruleForProduct({ name: p.name, categoryName: p.categoryName });
    if (!rule) {
      unmatched.push(p.name);
      continue;
    }

    const existingRows = rowsByProduct.get(p.id) ?? [];
    const wanted = rule.options.map((o) => ({ option: o, range: findRangeForOption(ranges, o) }));
    const wantedRangeIds = new Set(wanted.map((w) => w.range?.id).filter((x): x is string => !!x));

    const toAdd = wanted
      .filter((w) => !w.range || !existingRows.some((row) => row.rangeId === w.range!.id))
      .map((w) => w.option);

    const extra = existingRows.filter((row) => !wantedRangeIds.has(row.rangeId));

    planned.get(rule.key)!.push({
      id: p.id,
      name: p.name,
      toAdd,
      extraRowIds: extra.map((e) => e.id),
      extraLabels: extra.map((e) => rangeById.get(e.rangeId)?.label ?? "(removed range)"),
      alreadyHave: existingRows.length - extra.length,
      flagChange: p.noExpiration !== !!rule.noExpiration,
    });
  }

  return {
    rules: expiryRules.map((rule) => ({ rule, products: planned.get(rule.key)! })),
    unmatched,
    ranges,
  };
}


function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Applies the brand rules to every active product in the org. Additive by
 * default: it only adds the expiry options a product is missing, so options
 * someone already set (including a hand-tuned multiplier) are left alone.
 * With removeOthers it also removes any option the rule does not list, so
 * the product ends up with exactly the rule's options.
 */
export async function applyExpiryRulesForOrg(
  org: { organizationId: string; userId: string },
  removeOthers: boolean,
): Promise<{ message: string }> {
  const plan = await buildExpiryPlan(org.organizationId);

  const ranges = [...plan.ranges];
  let nextSort = ranges.length;
  let rangesCreated = 0;

  const newRows: (typeof purchasingProductMultipliers.$inferInsert)[] = [];
  const removeIds: string[] = [];
  const flagOn: string[] = [];
  const flagOff: string[] = [];
  const audits: (typeof purchasingAuditLog.$inferInsert)[] = [];
  let productsTouched = 0;

  for (const planned of plan.rules) {
    for (const p of planned.products) {
      const added: string[] = [];
      for (const option of p.toAdd) {
        let range = findRangeForOption(ranges, option);
        if (!range) {
          const id = newId("prange");
          await db.insert(purchasingExpirationRanges).values({
            id,
            organizationId: org.organizationId,
            label: option.label,
            minMonths: option.minMonths,
            maxMonths: option.maxMonths,
            defaultMultiplier: option.multiplier,
            sortOrder: nextSort++,
          });
          range = {
            id,
            label: option.label,
            minMonths: option.minMonths,
            maxMonths: option.maxMonths,
            defaultMultiplier: option.multiplier,
          };
          ranges.push(range);
          rangesCreated++;
        }
        newRows.push({
          id: newId("pmult"),
          organizationId: org.organizationId,
          productId: p.id,
          expirationRangeId: range.id,
          multiplier: option.multiplier,
        });
        added.push(`${option.label} @ ${Math.round(option.multiplier * 100)}%`);
      }

      const removed = removeOthers ? p.extraRowIds.length : 0;
      if (removeOthers) removeIds.push(...p.extraRowIds);
      if (p.flagChange) (planned.rule.noExpiration ? flagOn : flagOff).push(p.id);

      if (added.length > 0 || removed > 0 || p.flagChange) {
        productsTouched++;
        const parts = [
          added.length > 0 ? `added ${added.join(", ")}` : null,
          removed > 0 ? `removed ${removed} other option(s)` : null,
          p.flagChange ? (planned.rule.noExpiration ? "marked as does not expire" : "marked as expiring") : null,
        ].filter(Boolean);
        audits.push({
          id: newId("paudit"),
          organizationId: org.organizationId,
          userId: org.userId,
          recordType: "product",
          recordId: p.id,
          fieldName: "expiry_options_bulk",
          previousValue: null,
          newValue: parts.join("; "),
          note: `Bulk rule: ${planned.rule.title}`,
        });
      }
    }
  }

  for (const part of chunk(newRows, 100)) {
    await db.insert(purchasingProductMultipliers).values(part).onConflictDoNothing();
  }
  for (const part of chunk(removeIds, 100)) {
    await db.delete(purchasingProductMultipliers).where(inArray(purchasingProductMultipliers.id, part));
  }
  for (const part of chunk(flagOn, 100)) {
    await db
      .update(purchasingProducts)
      .set({ noExpiration: true })
      .where(and(eq(purchasingProducts.organizationId, org.organizationId), inArray(purchasingProducts.id, part)));
  }
  for (const part of chunk(flagOff, 100)) {
    await db
      .update(purchasingProducts)
      .set({ noExpiration: false })
      .where(and(eq(purchasingProducts.organizationId, org.organizationId), inArray(purchasingProducts.id, part)));
  }
  for (const part of chunk(audits, 100)) {
    await db.insert(purchasingAuditLog).values(part);
  }

  if (productsTouched === 0) {
    return { message: "Already up to date -- every matching product already has its expiry options." };
  }
  const bits = [
    `${productsTouched} product(s) updated`,
    `${newRows.length} expiry option(s) added`,
    flagOn.length > 0 ? `${flagOn.length} marked as does not expire` : null,
    removeIds.length > 0 && removeOthers ? `${removeIds.length} other option(s) removed` : null,
    rangesCreated > 0 ? `${rangesCreated} missing month range(s) created` : null,
  ].filter(Boolean);
  return { message: `Done: ${bits.join(", ")}.` };
}
