// Quotation pricing and totals with no signed-in person involved. The Purchasing page's actions AND the automatic website checkout both
// call these, so a line is priced (price x expiry band x condition) and totalled identically whoever asked.

import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  purchasingCategories, purchasingConditions, purchasingExpirationRanges, purchasingProductMultipliers, purchasingProducts,
  purchasingQuotations, purchasingQuotedItems,
} from "@/db/schema";
import { computeAutomaticBonus, getPurchasingBonusTiers } from "@/lib/queries";
import { roundCents } from "@/lib/purchasing-price";
import { refreshGeneratedReceipt } from "@/lib/purchasing-receipt-docs";

export type QuotedItemPricing = {
  /** The expiry band actually used -- null when the product never expires. */
  expirationRangeId: string | null;
  productNameSnapshot: string;
  productCodeSnapshot: string | null;
  categoryNameSnapshot: string | null;
  baseUnitPrice: number;
  appliedMultiplier: number;
  expirationRangeLabelSnapshot: string | null;
  conditionId: string | null;
  conditionNameSnapshot: string | null;
  conditionMultiplier: number;
};

/**
 * Shared by addPurchasingQuotedItem and updatePurchasingQuotedItem so a line
 * prices identically whether it's being created or corrected later --
 * product/condition/expiry lookups and the multiplier fallback chain
 * (per-product override -> range default -> 1) live in exactly one place.
 */
export async function resolvePricing(
  organizationId: string,
  params: {
    productId: string | null;
    expirationRangeId: string | null;
    conditionId: string | null; // may be "__custom__"
    customConditionName: string | null;
    customConditionMultiplierRaw: FormDataEntryValue | null;
    fallbackProductNameSnapshot: string | null;
  },
): Promise<{ error: string } | QuotedItemPricing> {
  const { productId, fallbackProductNameSnapshot } = params;
  let expirationRangeId = params.expirationRangeId;
  let conditionId = params.conditionId;

  let productNameSnapshot = fallbackProductNameSnapshot;
  let productCodeSnapshot: string | null = null;
  let categoryNameSnapshot: string | null = null;
  let baseUnitPrice = 0;
  let appliedMultiplier = 1;

  // Range default comes first, so a brand-new range prices correctly even
  // before anyone sets up a per-product override; the override (looked up
  // below once productId is known) wins over this default when it exists.
  let expirationRangeLabelSnapshot: string | null = null;
  let rangeDefaultMultiplier = 1;
  if (expirationRangeId) {
    const [range] = await db
      .select({ label: purchasingExpirationRanges.label, defaultMultiplier: purchasingExpirationRanges.defaultMultiplier })
      .from(purchasingExpirationRanges)
      .where(
        and(
          eq(purchasingExpirationRanges.id, expirationRangeId),
          eq(purchasingExpirationRanges.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!range) return { error: "Expiry range not found." };
    expirationRangeLabelSnapshot = range.label;
    rangeDefaultMultiplier = range.defaultMultiplier ?? 1;
    appliedMultiplier = rangeDefaultMultiplier;
  }

  if (productId) {
    const [product] = await db
      .select({
        name: purchasingProducts.name,
        productCode: purchasingProducts.productCode,
        standardPrice: purchasingProducts.standardPrice,
        categoryId: purchasingProducts.categoryId,
        noExpiration: purchasingProducts.noExpiration,
      })
      .from(purchasingProducts)
      .where(and(eq(purchasingProducts.id, productId), eq(purchasingProducts.organizationId, organizationId)))
      .limit(1);
    if (!product) return { error: "Product not found." };
    if (product.noExpiration) {
      // Receivers/readers/meters never expire, so an expiry band must not
      // discount them even if one is sent along.
      expirationRangeId = null;
      expirationRangeLabelSnapshot = null;
      appliedMultiplier = 1;
    }
    productNameSnapshot = product.name;
    productCodeSnapshot = product.productCode;
    baseUnitPrice = product.standardPrice;

    if (product.categoryId) {
      const [cat] = await db
        .select({ name: purchasingCategories.name })
        .from(purchasingCategories)
        .where(and(eq(purchasingCategories.id, product.categoryId), eq(purchasingCategories.organizationId, organizationId)))
        .limit(1);
      categoryNameSnapshot = cat?.name ?? null;
    }

    if (expirationRangeId && !product.noExpiration) {
      const [mult] = await db
        .select({ multiplier: purchasingProductMultipliers.multiplier })
        .from(purchasingProductMultipliers)
        .where(
          and(
            eq(purchasingProductMultipliers.productId, productId),
            eq(purchasingProductMultipliers.expirationRangeId, expirationRangeId),
          ),
        )
        .limit(1);
      appliedMultiplier = mult?.multiplier ?? rangeDefaultMultiplier;
    }
  }
  if (!productNameSnapshot) return { error: "Choose a product, or describe the item." };

  let conditionNameSnapshot: string | null = null;
  let conditionMultiplier = 1;
  if (conditionId === "__custom__") {
    // A one-off condition that doesn't fit the normal grading scale -- a
    // free-text label + payout multiplier typed right on this line, same as
    // an override price, instead of forcing a new row into Manage
    // Conditions for something that may never come up again.
    const customName = params.customConditionName;
    if (!customName) return { error: "Enter a name for the custom condition." };
    const customMultiplier = Number(params.customConditionMultiplierRaw);
    if (Number.isNaN(customMultiplier) || customMultiplier < 0) {
      return { error: "Custom condition payout must be a positive number." };
    }
    if (customMultiplier > 1) {
      return {
        error:
          "A custom condition can't pay more than 100% of the standard price. A manager can use an override price if a higher payout is really intended.",
      };
    }
    conditionId = null;
    conditionNameSnapshot = customName;
    conditionMultiplier = customMultiplier;
  } else if (conditionId) {
    const [condition] = await db
      .select({ name: purchasingConditions.name, multiplier: purchasingConditions.multiplier })
      .from(purchasingConditions)
      .where(and(eq(purchasingConditions.id, conditionId), eq(purchasingConditions.organizationId, organizationId)))
      .limit(1);
    if (!condition) return { error: "Condition not found." };
    conditionNameSnapshot = condition.name;
    conditionMultiplier = condition.multiplier;
  }

  return {
    expirationRangeId,
    productNameSnapshot,
    productCodeSnapshot,
    categoryNameSnapshot,
    baseUnitPrice,
    appliedMultiplier,
    expirationRangeLabelSnapshot,
    conditionId,
    conditionNameSnapshot,
    conditionMultiplier,
  };
}


/** Recomputes items total, the automatic bonus tier, and the grand total. Never touches an individual line's frozen price fields. */
export async function recomputeTotals(org: { organizationId: string; organizationName: string; userId: string }, quotationId: string) {
  const items = await db
    .select({ lineTotal: purchasingQuotedItems.lineTotal })
    .from(purchasingQuotedItems)
    .where(eq(purchasingQuotedItems.quotationId, quotationId));

  const [quotation] = await db
    .select()
    .from(purchasingQuotations)
    .where(eq(purchasingQuotations.id, quotationId))
    .limit(1);
  if (!quotation) return;

  // An imported order has no quoted lines -- its total came from the file and
  // already includes whatever bonus was given, so keep it as the base instead
  // of recomputing it down to $0.
  const keepImportedTotal = quotation.source === "IMPORTED" && items.length === 0;
  const itemsTotal = keepImportedTotal ? quotation.itemsTotal : roundCents(items.reduce((sum, i) => sum + i.lineTotal, 0));

  const tiers = await getPurchasingBonusTiers(org.organizationId);
  const { bonusAmount, tier } = keepImportedTotal ? { bonusAmount: 0, tier: null } : computeAutomaticBonus(itemsTotal, tiers);

  const deduction = quotation.deductionEnabled ? quotation.deductionAmount : 0;
  const grandTotal = roundCents(itemsTotal + bonusAmount - deduction + quotation.returnLabelCost);

  await db
    .update(purchasingQuotations)
    .set({
      itemsTotal,
      bonusAmount,
      bonusTierLabelSnapshot: tier ? `$${tier.thresholdAmount}+ -> $${tier.bonusAmount} bonus` : null,
      grandTotal,
    })
    .where(eq(purchasingQuotations.id, quotationId));

  // Keep the stored receipt PDF in step with the order (never blocks the save).
  await refreshGeneratedReceipt(org, quotationId);
}

