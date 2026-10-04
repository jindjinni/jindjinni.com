"use server";

// Purchasing department server actions. Permission model reuses the same
// owner/admin/staff roles as the rest of the app (per chat): staff =
// Purchasing Agent (create customers/quotations, add quoted lines at the
// computed price), admin = Purchasing Manager (also edits the catalog --
// products/categories/conditions/expiration ranges/multipliers/bonus tiers
// -- archives records, and can override a line's computed price), owner =
// Master Admin (everything, no restrictions).
//
// Every write that the framework singled out for history (prices,
// quantities, totals, tracking numbers, customer info, product rules,
// multipliers) records a row to purchasing_audit_log via logAudit() below.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { requireOrg, type CurrentOrg } from "@/lib/tenant";
import { db } from "@/db/client";
import {
  purchasingCustomers,
  purchasingCategories,
  purchasingProducts,
  purchasingConditions,
  purchasingExpirationRanges,
  purchasingProductMultipliers,
  purchasingBonusTiers,
  purchasingQuotations,
  purchasingQuotedItems,
  purchasingAuditLog,
  purchasingReceiptVersions,
} from "@/db/schema";
import { newId } from "@/lib/ids";
import {
  getNextQuotationNumber,
  getPurchasingBonusTiers,
  getPurchasingCustomer,
  computeAutomaticBonus,
  getBusinessProfile,
  resolveBusinessDocumentIdentity,
} from "@/lib/queries";
import { seedPurchasingProductCatalogForOrg } from "@/lib/purchasing-catalog-seed";
import { parseSpreadsheetFile, findColumn } from "@/lib/spreadsheet-import";

export type ActionState = { error?: string } | undefined;
export type SeedCatalogActionState = { error?: string; message?: string } | undefined;
export type ImportActionState = { error?: string; message?: string } | undefined;

const trimmed = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim() || null;

async function readUploadedFile(formData: FormData): Promise<{ buffer: Buffer; filename: string } | { error: string }> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a CSV or Excel file to import." };
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  return { buffer, filename: file.name };
}

function requireManager(org: CurrentOrg): ActionState {
  if (org.role === "staff") {
    return { error: "Only a Purchasing Manager or Master Admin can do that." };
  }
  return undefined;
}

async function logAudit(
  org: CurrentOrg,
  recordType: string,
  recordId: string,
  fieldName: string,
  previousValue: string | number | null,
  newValue: string | number | null,
  note?: string,
) {
  await db.insert(purchasingAuditLog).values({
    id: newId("paudit"),
    organizationId: org.organizationId,
    userId: org.userId,
    recordType,
    recordId,
    fieldName,
    previousValue: previousValue === null ? null : String(previousValue),
    newValue: newValue === null ? null : String(newValue),
    note: note ?? null,
  });
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export async function createPurchasingCustomer(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const org = await requireOrg();

  const firstName = String(formData.get("firstName") ?? "").trim();
  if (!firstName) return { error: "Enter the customer's first name." };

  const customerId = newId("pcust");
  await db.insert(purchasingCustomers).values({
    id: customerId,
    organizationId: org.organizationId,
    firstName,
    lastName: trimmed(formData, "lastName"),
    customerReferenceNumber: trimmed(formData, "customerReferenceNumber"),
    email: trimmed(formData, "email"),
    phone: trimmed(formData, "phone"),
    addressStreet1: trimmed(formData, "addressStreet1"),
    addressStreet2: trimmed(formData, "addressStreet2"),
    addressCity: trimmed(formData, "addressCity"),
    addressState: trimmed(formData, "addressState"),
    addressZip: trimmed(formData, "addressZip"),
    addressCountry: trimmed(formData, "addressCountry") ?? "US",
    isResidential: formData.get("isResidential") === "on",
    notes: trimmed(formData, "notes"),
  });

  revalidatePath("/dashboard/purchasing/customers");
  redirect(`/dashboard/purchasing/customers/${customerId}`);
}

async function requireOrgCustomer(organizationId: string, customerId: string) {
  return getPurchasingCustomer(organizationId, customerId);
}

export async function updatePurchasingCustomer(
  customerId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const org = await requireOrg();
  const customer = await requireOrgCustomer(org.organizationId, customerId);
  if (!customer) return { error: "Customer not found." };

  const firstName = String(formData.get("firstName") ?? "").trim();
  if (!firstName) return { error: "Enter the customer's first name." };

  await db
    .update(purchasingCustomers)
    .set({
      firstName,
      lastName: trimmed(formData, "lastName"),
      customerReferenceNumber: trimmed(formData, "customerReferenceNumber"),
      email: trimmed(formData, "email"),
      phone: trimmed(formData, "phone"),
      addressStreet1: trimmed(formData, "addressStreet1"),
      addressStreet2: trimmed(formData, "addressStreet2"),
      addressCity: trimmed(formData, "addressCity"),
      addressState: trimmed(formData, "addressState"),
      addressZip: trimmed(formData, "addressZip"),
      addressCountry: trimmed(formData, "addressCountry") ?? "US",
      isResidential: formData.get("isResidential") === "on",
      notes: trimmed(formData, "notes"),
    })
    .where(eq(purchasingCustomers.id, customerId));

  await logAudit(org, "customer", customerId, "contact_info", null, null, "Customer details updated");

  revalidatePath("/dashboard/purchasing/customers");
  revalidatePath(`/dashboard/purchasing/customers/${customerId}`);
}

export async function archivePurchasingCustomer(
  customerId: string,
  _prevState: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const org = await requireOrg();
  const blocked = requireManager(org);
  if (blocked) return blocked;
  const customer = await requireOrgCustomer(org.organizationId, customerId);
  if (!customer) return { error: "Customer not found." };

  await db
    .update(purchasingCustomers)
    .set({ archivedAt: new Date().toISOString() })
    .where(eq(purchasingCustomers.id, customerId));

  revalidatePath("/dashboard/purchasing/customers");
}

export async function restorePurchasingCustomer(
  customerId: string,
  _prevState: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const org = await requireOrg();
  const blocked = requireManager(org);
  if (blocked) return blocked;

  await db
    .update(purchasingCustomers)
    .set({ archivedAt: null })
    .where(and(eq(purchasingCustomers.id, customerId), eq(purchasingCustomers.organizationId, org.organizationId)));

  revalidatePath("/dashboard/purchasing/customers");
}

// ---------------------------------------------------------------------------
// Categories (brand groupings)
// ---------------------------------------------------------------------------

export async function createPurchasingCategory(formData: FormData): Promise<void> {
  const org = await requireOrg();
  if (org.role === "staff") return;

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  await db.insert(purchasingCategories).values({
    id: newId("pcat"),
    organizationId: org.organizationId,
    name,
    sortOrder: 999,
  });

  revalidatePath("/dashboard/purchasing/categories");
}

export async function updatePurchasingCategory(categoryId: string, formData: FormData): Promise<void> {
  const org = await requireOrg();
  if (org.role === "staff") return;

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const active = formData.get("active") === "on";

  await db
    .update(purchasingCategories)
    .set({ name, active })
    .where(and(eq(purchasingCategories.id, categoryId), eq(purchasingCategories.organizationId, org.organizationId)));

  revalidatePath("/dashboard/purchasing/categories");
}

// ---------------------------------------------------------------------------
// Products (unified catalog)
// ---------------------------------------------------------------------------

export async function createPurchasingProduct(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const org = await requireOrg();
  const blocked = requireManager(org);
  if (blocked) return blocked;

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Enter a product name." };
  const standardPrice = Number(formData.get("standardPrice") ?? 0);
  if (Number.isNaN(standardPrice) || standardPrice < 0) return { error: "Standard price must be a positive number." };

  const productId = newId("pprod");
  await db.insert(purchasingProducts).values({
    id: productId,
    organizationId: org.organizationId,
    categoryId: trimmed(formData, "categoryId"),
    name,
    productCode: trimmed(formData, "productCode"),
    standardPrice,
    notes: trimmed(formData, "notes"),
  });

  revalidatePath("/dashboard/purchasing/products");
  redirect(`/dashboard/purchasing/products/${productId}`);
}

async function requireOrgProduct(organizationId: string, productId: string) {
  const [row] = await db
    .select()
    .from(purchasingProducts)
    .where(and(eq(purchasingProducts.id, productId), eq(purchasingProducts.organizationId, organizationId)))
    .limit(1);
  return row ?? null;
}

export async function updatePurchasingProduct(
  productId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const org = await requireOrg();
  const blocked = requireManager(org);
  if (blocked) return blocked;
  const product = await requireOrgProduct(org.organizationId, productId);
  if (!product) return { error: "Product not found." };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Enter a product name." };
  const standardPrice = Number(formData.get("standardPrice") ?? 0);
  if (Number.isNaN(standardPrice) || standardPrice < 0) return { error: "Standard price must be a positive number." };
  const active = formData.get("active") === "on";

  if (standardPrice !== product.standardPrice) {
    await logAudit(org, "product", productId, "standard_price", product.standardPrice, standardPrice);
  }

  await db
    .update(purchasingProducts)
    .set({
      categoryId: trimmed(formData, "categoryId"),
      name,
      productCode: trimmed(formData, "productCode"),
      standardPrice,
      notes: trimmed(formData, "notes"),
      active,
    })
    .where(eq(purchasingProducts.id, productId));

  revalidatePath("/dashboard/purchasing/products");
  revalidatePath(`/dashboard/purchasing/products/${productId}`);
}

export async function archivePurchasingProduct(
  productId: string,
  _prevState: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const org = await requireOrg();
  const blocked = requireManager(org);
  if (blocked) return blocked;

  await db
    .update(purchasingProducts)
    .set({ archivedAt: new Date().toISOString() })
    .where(and(eq(purchasingProducts.id, productId), eq(purchasingProducts.organizationId, org.organizationId)));

  revalidatePath("/dashboard/purchasing/products");
}

export async function restorePurchasingProduct(
  productId: string,
  _prevState: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const org = await requireOrg();
  const blocked = requireManager(org);
  if (blocked) return blocked;

  await db
    .update(purchasingProducts)
    .set({ archivedAt: null })
    .where(and(eq(purchasingProducts.id, productId), eq(purchasingProducts.organizationId, org.organizationId)));

  revalidatePath("/dashboard/purchasing/products");
}

/** Makes an independent copy of a product -- own id, own price, own multipliers never carried over (intentionally: a copy shouldn't silently inherit pricing rules the person may be about to change). Lands on the new product's own page so it can be tweaked right away. */
export async function duplicatePurchasingProduct(
  productId: string,
  _prevState: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const org = await requireOrg();
  const blocked = requireManager(org);
  if (blocked) return blocked;
  const product = await requireOrgProduct(org.organizationId, productId);
  if (!product) return { error: "Product not found." };

  const newProductId = newId("pprod");
  await db.insert(purchasingProducts).values({
    id: newProductId,
    organizationId: org.organizationId,
    categoryId: product.categoryId,
    name: `${product.name} (Copy)`,
    productCode: product.productCode,
    standardPrice: product.standardPrice,
    notes: product.notes,
    active: true,
  });

  revalidatePath("/dashboard/purchasing/products");
  redirect(`/dashboard/purchasing/products/${newProductId}`);
}

/**
 * Permanently removes a product -- distinct from Archive, which only hides
 * it from new quotes. Only allowed when nothing actually depends on it: a
 * product that has ever been quoted keeps that quotation's line item alive
 * via its own frozen snapshot fields (productNameSnapshot etc.), but the
 * line item's productId foreign key would be left dangling by a hard
 * delete, so that case is refused in favor of Archive instead. Safe to
 * call on a product nobody has quoted yet (e.g. a duplicate made by
 * mistake, or a CSV import typo).
 */
export async function deletePurchasingProduct(
  productId: string,
  _prevState: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const org = await requireOrg();
  const blocked = requireManager(org);
  if (blocked) return blocked;
  const product = await requireOrgProduct(org.organizationId, productId);
  if (!product) return { error: "Product not found." };

  const [quotedUsage] = await db
    .select({ id: purchasingQuotedItems.id })
    .from(purchasingQuotedItems)
    .where(eq(purchasingQuotedItems.productId, productId))
    .limit(1);
  if (quotedUsage) {
    return {
      error: "This product has already been used on a quotation, so it can't be permanently deleted -- use Archive instead to hide it from new quotes while keeping that quotation's records intact.",
    };
  }

  await db.delete(purchasingProductMultipliers).where(eq(purchasingProductMultipliers.productId, productId));
  await db.delete(purchasingProducts).where(eq(purchasingProducts.id, productId));

  revalidatePath("/dashboard/purchasing/products");
}

/** Upserts the (product, expirationRange) -> multiplier row -- the editable price table behind a quoted line's unit price. */
export async function setProductMultiplier(
  productId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const org = await requireOrg();
  const blocked = requireManager(org);
  if (blocked) return blocked;
  const product = await requireOrgProduct(org.organizationId, productId);
  if (!product) return { error: "Product not found." };

  const expirationRangeId = String(formData.get("expirationRangeId") ?? "");
  const multiplier = Number(formData.get("multiplier"));
  if (!expirationRangeId) return { error: "Choose an expiration range." };
  if (Number.isNaN(multiplier) || multiplier < 0) return { error: "Multiplier must be a positive number." };

  const [existing] = await db
    .select()
    .from(purchasingProductMultipliers)
    .where(
      and(
        eq(purchasingProductMultipliers.productId, productId),
        eq(purchasingProductMultipliers.expirationRangeId, expirationRangeId),
      ),
    )
    .limit(1);

  if (existing) {
    if (existing.multiplier !== multiplier) {
      await logAudit(org, "product_multiplier", existing.id, "multiplier", existing.multiplier, multiplier);
    }
    await db
      .update(purchasingProductMultipliers)
      .set({ multiplier })
      .where(eq(purchasingProductMultipliers.id, existing.id));
  } else {
    const id = newId("pmult");
    await db.insert(purchasingProductMultipliers).values({
      id,
      organizationId: org.organizationId,
      productId,
      expirationRangeId,
      multiplier,
    });
    await logAudit(org, "product_multiplier", id, "multiplier", null, multiplier, "Multiplier created");
  }

  revalidatePath(`/dashboard/purchasing/products/${productId}`);
}

export async function removeProductMultiplier(
  multiplierId: string,
  _prevState: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const org = await requireOrg();
  const blocked = requireManager(org);
  if (blocked) return blocked;

  const [row] = await db
    .select({ id: purchasingProductMultipliers.id, productId: purchasingProductMultipliers.productId })
    .from(purchasingProductMultipliers)
    .where(
      and(
        eq(purchasingProductMultipliers.id, multiplierId),
        eq(purchasingProductMultipliers.organizationId, org.organizationId),
      ),
    )
    .limit(1);
  if (!row) return { error: "Not found." };

  await db.delete(purchasingProductMultipliers).where(eq(purchasingProductMultipliers.id, multiplierId));
  revalidatePath(`/dashboard/purchasing/products/${row.productId}`);
}

// ---------------------------------------------------------------------------
// Conditions & expiration ranges
// ---------------------------------------------------------------------------

export async function createPurchasingCondition(formData: FormData): Promise<void> {
  const org = await requireOrg();
  if (org.role === "staff") return;

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const multiplier = Number(formData.get("multiplier") ?? 1) || 1;

  await db.insert(purchasingConditions).values({
    id: newId("pcond"),
    organizationId: org.organizationId,
    name,
    multiplier,
    sortOrder: 999,
  });

  revalidatePath("/dashboard/purchasing/conditions");
}

export async function updatePurchasingCondition(conditionId: string, formData: FormData): Promise<void> {
  const org = await requireOrg();
  if (org.role === "staff") return;

  const [existing] = await db
    .select()
    .from(purchasingConditions)
    .where(and(eq(purchasingConditions.id, conditionId), eq(purchasingConditions.organizationId, org.organizationId)))
    .limit(1);
  if (!existing) return;

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const multiplier = Number(formData.get("multiplier") ?? 1) || 1;
  const active = formData.get("active") === "on";

  if (multiplier !== existing.multiplier) {
    await logAudit(org, "condition", conditionId, "multiplier", existing.multiplier, multiplier);
  }

  await db.update(purchasingConditions).set({ name, multiplier, active }).where(eq(purchasingConditions.id, conditionId));
  revalidatePath("/dashboard/purchasing/conditions");
}

function parseMultiplier(formData: FormData): number {
  const raw = formData.get("defaultMultiplier");
  const n = raw === null || String(raw).trim() === "" ? 1 : Number(raw);
  return Number.isNaN(n) || n < 0 ? 1 : n;
}

export async function createPurchasingExpirationRange(formData: FormData): Promise<void> {
  const org = await requireOrg();
  if (org.role === "staff") return;

  const label = String(formData.get("label") ?? "").trim();
  if (!label) return;
  const minMonths = formData.get("minMonths") ? Number(formData.get("minMonths")) : null;
  const maxMonths = formData.get("maxMonths") ? Number(formData.get("maxMonths")) : null;
  const defaultMultiplier = parseMultiplier(formData);

  await db.insert(purchasingExpirationRanges).values({
    id: newId("prange"),
    organizationId: org.organizationId,
    label,
    minMonths,
    maxMonths,
    defaultMultiplier,
    sortOrder: 999,
  });

  revalidatePath("/dashboard/purchasing/expiration-ranges");
}

export async function updatePurchasingExpirationRange(rangeId: string, formData: FormData): Promise<void> {
  const org = await requireOrg();
  if (org.role === "staff") return;

  const label = String(formData.get("label") ?? "").trim();
  if (!label) return;
  const minMonths = formData.get("minMonths") ? Number(formData.get("minMonths")) : null;
  const maxMonths = formData.get("maxMonths") ? Number(formData.get("maxMonths")) : null;
  const defaultMultiplier = parseMultiplier(formData);
  const active = formData.get("active") === "on";

  const [existing] = await db
    .select({ defaultMultiplier: purchasingExpirationRanges.defaultMultiplier })
    .from(purchasingExpirationRanges)
    .where(and(eq(purchasingExpirationRanges.id, rangeId), eq(purchasingExpirationRanges.organizationId, org.organizationId)))
    .limit(1);
  if (existing && existing.defaultMultiplier !== defaultMultiplier) {
    await logAudit(org, "expiration_range", rangeId, "default_multiplier", existing.defaultMultiplier, defaultMultiplier);
  }

  await db
    .update(purchasingExpirationRanges)
    .set({ label, minMonths, maxMonths, defaultMultiplier, active })
    .where(and(eq(purchasingExpirationRanges.id, rangeId), eq(purchasingExpirationRanges.organizationId, org.organizationId)));

  revalidatePath("/dashboard/purchasing/expiration-ranges");
}

/** Independent copy -- own id, same label/months/multiplier as a starting point. */
export async function duplicatePurchasingExpirationRange(
  rangeId: string,
  _prevState: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const org = await requireOrg();
  const blocked = requireManager(org);
  if (blocked) return blocked;

  const [existing] = await db
    .select()
    .from(purchasingExpirationRanges)
    .where(and(eq(purchasingExpirationRanges.id, rangeId), eq(purchasingExpirationRanges.organizationId, org.organizationId)))
    .limit(1);
  if (!existing) return { error: "Month range not found." };

  await db.insert(purchasingExpirationRanges).values({
    id: newId("prange"),
    organizationId: org.organizationId,
    label: `${existing.label} (Copy)`,
    minMonths: existing.minMonths,
    maxMonths: existing.maxMonths,
    defaultMultiplier: existing.defaultMultiplier,
    sortOrder: existing.sortOrder,
    active: existing.active,
  });

  revalidatePath("/dashboard/purchasing/expiration-ranges");
}

/**
 * Permanent delete -- blocked once a quotation has actually used this range
 * (its quoted item keeps expirationRangeLabelSnapshot for display, but the
 * live expirationRangeId foreign key would dangle), same guard as products.
 * Also cleans up any per-product override rows keyed to this range, since
 * FK cascade isn't enforced at the DB level here.
 */
export async function deletePurchasingExpirationRange(
  rangeId: string,
  _prevState: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const org = await requireOrg();
  const blocked = requireManager(org);
  if (blocked) return blocked;

  const [existing] = await db
    .select({ id: purchasingExpirationRanges.id })
    .from(purchasingExpirationRanges)
    .where(and(eq(purchasingExpirationRanges.id, rangeId), eq(purchasingExpirationRanges.organizationId, org.organizationId)))
    .limit(1);
  if (!existing) return { error: "Month range not found." };

  const [quotedUsage] = await db
    .select({ id: purchasingQuotedItems.id })
    .from(purchasingQuotedItems)
    .where(eq(purchasingQuotedItems.expirationRangeId, rangeId))
    .limit(1);
  if (quotedUsage) {
    return {
      error: "This month range has already been used on a quotation, so it can't be permanently deleted -- turn off Active instead to stop it from being offered on new quotes.",
    };
  }

  await db.delete(purchasingProductMultipliers).where(eq(purchasingProductMultipliers.expirationRangeId, rangeId));
  await db.delete(purchasingExpirationRanges).where(eq(purchasingExpirationRanges.id, rangeId));

  revalidatePath("/dashboard/purchasing/expiration-ranges");
}

// ---------------------------------------------------------------------------
// Bonus tiers
// ---------------------------------------------------------------------------

export async function createPurchasingBonusTier(formData: FormData): Promise<void> {
  const org = await requireOrg();
  if (org.role === "staff") return;

  const thresholdAmount = Number(formData.get("thresholdAmount"));
  const bonusAmount = Number(formData.get("bonusAmount"));
  if (Number.isNaN(thresholdAmount) || thresholdAmount < 0) return;
  if (Number.isNaN(bonusAmount) || bonusAmount < 0) return;

  await db.insert(purchasingBonusTiers).values({
    id: newId("pbonus"),
    organizationId: org.organizationId,
    thresholdAmount,
    bonusAmount,
    description: trimmed(formData, "description"),
    sortOrder: 999,
  });

  revalidatePath("/dashboard/purchasing/bonus-tiers");
}

export async function updatePurchasingBonusTier(tierId: string, formData: FormData): Promise<void> {
  const org = await requireOrg();
  if (org.role === "staff") return;

  const [existing] = await db
    .select()
    .from(purchasingBonusTiers)
    .where(and(eq(purchasingBonusTiers.id, tierId), eq(purchasingBonusTiers.organizationId, org.organizationId)))
    .limit(1);
  if (!existing) return;

  const thresholdAmount = Number(formData.get("thresholdAmount"));
  const bonusAmount = Number(formData.get("bonusAmount"));
  if (Number.isNaN(thresholdAmount) || thresholdAmount < 0) return;
  if (Number.isNaN(bonusAmount) || bonusAmount < 0) return;
  const active = formData.get("active") === "on";

  if (thresholdAmount !== existing.thresholdAmount || bonusAmount !== existing.bonusAmount) {
    await logAudit(
      org,
      "bonus_tier",
      tierId,
      "threshold_or_bonus",
      `${existing.thresholdAmount}->${existing.bonusAmount}`,
      `${thresholdAmount}->${bonusAmount}`,
    );
  }

  await db
    .update(purchasingBonusTiers)
    .set({ thresholdAmount, bonusAmount, description: trimmed(formData, "description"), active })
    .where(eq(purchasingBonusTiers.id, tierId));
  revalidatePath("/dashboard/purchasing/bonus-tiers");
}

/** Independent copy -- own id, same threshold/bonus/description as a starting point. No dependents to worry about (bonus tiers are never referenced by id from a quotation, only snapshotted as a label + amount), so this is always safe. */
export async function duplicatePurchasingBonusTier(
  tierId: string,
  _prevState: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const org = await requireOrg();
  const blocked = requireManager(org);
  if (blocked) return blocked;

  const [existing] = await db
    .select()
    .from(purchasingBonusTiers)
    .where(and(eq(purchasingBonusTiers.id, tierId), eq(purchasingBonusTiers.organizationId, org.organizationId)))
    .limit(1);
  if (!existing) return { error: "Bonus tier not found." };

  await db.insert(purchasingBonusTiers).values({
    id: newId("pbonus"),
    organizationId: org.organizationId,
    thresholdAmount: existing.thresholdAmount,
    bonusAmount: existing.bonusAmount,
    description: existing.description,
    sortOrder: existing.sortOrder,
    active: existing.active,
  });

  revalidatePath("/dashboard/purchasing/bonus-tiers");
}

/** Permanent delete -- safe unconditionally: a quotation only ever snapshots a tier's label + amount (bonusTierLabelSnapshot, bonusAmount), never a live foreign key to this row, so nothing can be left dangling. */
export async function deletePurchasingBonusTier(
  tierId: string,
  _prevState: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const org = await requireOrg();
  const blocked = requireManager(org);
  if (blocked) return blocked;

  await db
    .delete(purchasingBonusTiers)
    .where(and(eq(purchasingBonusTiers.id, tierId), eq(purchasingBonusTiers.organizationId, org.organizationId)));

  revalidatePath("/dashboard/purchasing/bonus-tiers");
}

// ---------------------------------------------------------------------------
// Quotations (= the "Overall Order") & quoted items
// ---------------------------------------------------------------------------

async function requireOrgQuotation(organizationId: string, quotationId: string) {
  const [row] = await db
    .select()
    .from(purchasingQuotations)
    .where(and(eq(purchasingQuotations.id, quotationId), eq(purchasingQuotations.organizationId, organizationId)))
    .limit(1);
  return row ?? null;
}

/** Recomputes items total, the automatic bonus tier, and the grand total. Never touches an individual line's frozen price fields. */
async function recomputeQuotationTotals(org: CurrentOrg, quotationId: string) {
  const items = await db
    .select({ lineTotal: purchasingQuotedItems.lineTotal })
    .from(purchasingQuotedItems)
    .where(eq(purchasingQuotedItems.quotationId, quotationId));
  const itemsTotal = items.reduce((sum, i) => sum + i.lineTotal, 0);

  const tiers = await getPurchasingBonusTiers(org.organizationId);
  const { bonusAmount, tier } = computeAutomaticBonus(itemsTotal, tiers);

  const [quotation] = await db
    .select()
    .from(purchasingQuotations)
    .where(eq(purchasingQuotations.id, quotationId))
    .limit(1);
  if (!quotation) return;

  const deduction = quotation.deductionEnabled ? quotation.deductionAmount : 0;
  const grandTotal = itemsTotal + bonusAmount - deduction + quotation.returnLabelCost;

  await db
    .update(purchasingQuotations)
    .set({
      itemsTotal,
      bonusAmount,
      bonusTierLabelSnapshot: tier ? `$${tier.thresholdAmount}+ -> $${tier.bonusAmount} bonus` : null,
      grandTotal,
    })
    .where(eq(purchasingQuotations.id, quotationId));
}

/**
 * Starts a quotation. Either pass an existing customerId, or -- when the
 * customer isn't in the system yet -- pass newCustomerFirstName (required)
 * plus whatever other newCustomer* fields are known; a customer record is
 * created on the fly so the quotation always points at a real customer.
 */
export async function createPurchasingQuotation(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const org = await requireOrg();

  let customerId = String(formData.get("customerId") ?? "");
  let customer: Awaited<ReturnType<typeof getPurchasingCustomer>>;

  if (customerId) {
    customer = await getPurchasingCustomer(org.organizationId, customerId);
    if (!customer) return { error: "Customer not found." };
  } else {
    const firstName = String(formData.get("newCustomerFirstName") ?? "").trim();
    if (!firstName) return { error: "Choose an existing customer, or enter a first name for a new one." };

    customerId = newId("pcust");
    const newCustomerRow = {
      id: customerId,
      organizationId: org.organizationId,
      firstName,
      lastName: trimmed(formData, "newCustomerLastName"),
      email: trimmed(formData, "newCustomerEmail"),
      phone: trimmed(formData, "newCustomerPhone"),
      addressStreet1: trimmed(formData, "newCustomerAddressStreet1"),
      addressStreet2: trimmed(formData, "newCustomerAddressStreet2"),
      addressCity: trimmed(formData, "newCustomerAddressCity"),
      addressState: trimmed(formData, "newCustomerAddressState"),
      addressZip: trimmed(formData, "newCustomerAddressZip"),
      isResidential: formData.get("newCustomerIsResidential") === "on",
    };
    await db.insert(purchasingCustomers).values(newCustomerRow);
    customer = newCustomerRow as unknown as Awaited<ReturnType<typeof getPurchasingCustomer>>;
  }
  if (!customer) return { error: "Customer not found." };

  const quotationId = newId("pquote");
  const quotationNumber = await getNextQuotationNumber(org.organizationId);
  const customerName = [customer.firstName, customer.lastName].filter(Boolean).join(" ");

  await db.insert(purchasingQuotations).values({
    id: quotationId,
    organizationId: org.organizationId,
    quotationNumber,
    customerId,
    customerNameSnapshot: customerName,
    customerEmailSnapshot: customer.email,
    customerPhoneSnapshot: customer.phone,
    quotationDate: trimmed(formData, "quotationDate") ?? new Date().toISOString().slice(0, 10),
    createdByUserId: org.userId,
  });

  revalidatePath("/dashboard/purchasing/quotations");
  revalidatePath("/dashboard/purchasing");
  redirect(`/dashboard/purchasing/quotations/${quotationId}`);
}

export async function addPurchasingQuotedItem(
  quotationId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const org = await requireOrg();
  const quotation = await requireOrgQuotation(org.organizationId, quotationId);
  if (!quotation) return { error: "Quotation not found." };

  const productId = String(formData.get("productId") ?? "") || null;
  const conditionId = String(formData.get("conditionId") ?? "") || null;
  const expirationRangeId = String(formData.get("expirationRangeId") ?? "") || null;
  const quantity = Number(formData.get("quantity"));
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return { error: "Quantity must be a whole number greater than zero." };
  }

  let productNameSnapshot = trimmed(formData, "productNameSnapshot");
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
      .where(eq(purchasingExpirationRanges.id, expirationRangeId))
      .limit(1);
    expirationRangeLabelSnapshot = range?.label ?? null;
    rangeDefaultMultiplier = range?.defaultMultiplier ?? 1;
    appliedMultiplier = rangeDefaultMultiplier;
  }

  if (productId) {
    const [product] = await db
      .select({
        name: purchasingProducts.name,
        productCode: purchasingProducts.productCode,
        standardPrice: purchasingProducts.standardPrice,
        categoryId: purchasingProducts.categoryId,
      })
      .from(purchasingProducts)
      .where(and(eq(purchasingProducts.id, productId), eq(purchasingProducts.organizationId, org.organizationId)))
      .limit(1);
    if (!product) return { error: "Product not found." };
    productNameSnapshot = product.name;
    productCodeSnapshot = product.productCode;
    baseUnitPrice = product.standardPrice;

    if (product.categoryId) {
      const [cat] = await db
        .select({ name: purchasingCategories.name })
        .from(purchasingCategories)
        .where(eq(purchasingCategories.id, product.categoryId))
        .limit(1);
      categoryNameSnapshot = cat?.name ?? null;
    }

    if (expirationRangeId) {
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
  if (conditionId) {
    const [condition] = await db
      .select({ name: purchasingConditions.name, multiplier: purchasingConditions.multiplier })
      .from(purchasingConditions)
      .where(and(eq(purchasingConditions.id, conditionId), eq(purchasingConditions.organizationId, org.organizationId)))
      .limit(1);
    conditionNameSnapshot = condition?.name ?? null;
    conditionMultiplier = condition?.multiplier ?? 1;
  }


  const computedUnitPrice = baseUnitPrice * appliedMultiplier * conditionMultiplier;
  const overrideRaw = formData.get("overrideUnitPrice");
  let finalUnitPrice = computedUnitPrice;
  if (overrideRaw !== null && String(overrideRaw).trim() !== "") {
    if (org.role === "staff") return { error: "Only a Purchasing Manager or Master Admin can override a price." };
    const override = Number(overrideRaw);
    if (Number.isNaN(override) || override < 0) return { error: "Override price must be a positive number." };
    finalUnitPrice = override;
  }

  const itemId = newId("pqitem");
  await db.insert(purchasingQuotedItems).values({
    id: itemId,
    quotationId,
    productId,
    productNameSnapshot,
    productCodeSnapshot,
    categoryNameSnapshot,
    conditionId,
    conditionNameSnapshot,
    expirationRangeId,
    expirationRangeLabelSnapshot,
    quantity,
    baseUnitPrice,
    appliedMultiplier,
    conditionMultiplier,
    finalUnitPrice,
    lineTotal: finalUnitPrice * quantity,
    notes: trimmed(formData, "notes"),
  });

  if (finalUnitPrice !== computedUnitPrice) {
    await logAudit(
      org,
      "quoted_item",
      itemId,
      "price_override",
      computedUnitPrice,
      finalUnitPrice,
      `Overridden on quotation ${quotation.quotationNumber}`,
    );
  }

  await recomputeQuotationTotals(org, quotationId);
  revalidatePath(`/dashboard/purchasing/quotations/${quotationId}`);
}

export async function removePurchasingQuotedItem(
  itemId: string,
  _prevState: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const org = await requireOrg();

  const [item] = await db
    .select({ id: purchasingQuotedItems.id, quotationId: purchasingQuotedItems.quotationId })
    .from(purchasingQuotedItems)
    .innerJoin(purchasingQuotations, eq(purchasingQuotedItems.quotationId, purchasingQuotations.id))
    .where(and(eq(purchasingQuotedItems.id, itemId), eq(purchasingQuotations.organizationId, org.organizationId)))
    .limit(1);
  if (!item) return { error: "Line not found." };

  await db.delete(purchasingQuotedItems).where(eq(purchasingQuotedItems.id, itemId));
  await recomputeQuotationTotals(org, item.quotationId);
  revalidatePath(`/dashboard/purchasing/quotations/${item.quotationId}`);
}

export async function updatePurchasingQuotationHeader(
  quotationId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const org = await requireOrg();
  const quotation = await requireOrgQuotation(org.organizationId, quotationId);
  if (!quotation) return { error: "Quotation not found." };

  const newTracking = trimmed(formData, "trackingNumber");
  if (newTracking !== quotation.trackingNumber) {
    await logAudit(org, "quotation", quotationId, "tracking_number", quotation.trackingNumber, newTracking);
  }

  const carrier = (trimmed(formData, "carrier") as typeof quotation.carrier) ?? null;
  const packageStatus = (trimmed(formData, "packageStatus") as typeof quotation.packageStatus) ?? quotation.packageStatus;

  await db
    .update(purchasingQuotations)
    .set({
      quotationDate: trimmed(formData, "quotationDate") ?? quotation.quotationDate,
      trackingNumber: newTracking,
      carrier,
      packageStatus,
      notes: trimmed(formData, "notes"),
    })
    .where(eq(purchasingQuotations.id, quotationId));

  revalidatePath(`/dashboard/purchasing/quotations/${quotationId}`);
  revalidatePath("/dashboard/purchasing/quotations");
}

/** The quotation's manual deduction -- separate from, and on top of, the automatic bonus. A reason is required so the audit trail says why. */
export async function setPurchasingQuotationDeduction(
  quotationId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const org = await requireOrg();
  const quotation = await requireOrgQuotation(org.organizationId, quotationId);
  if (!quotation) return { error: "Quotation not found." };

  const deductionEnabled = formData.get("deductionEnabled") === "on";
  const deductionAmount = Number(formData.get("deductionAmount") ?? 0) || 0;
  const deductionReason = trimmed(formData, "deductionReason");
  if (deductionEnabled && deductionAmount > 0 && !deductionReason) {
    return { error: "Enter a reason for the deduction." };
  }
  if (deductionAmount < 0) return { error: "Deduction amount can't be negative." };

  if (deductionEnabled !== quotation.deductionEnabled || deductionAmount !== quotation.deductionAmount) {
    await logAudit(
      org,
      "quotation",
      quotationId,
      "deduction",
      quotation.deductionEnabled ? quotation.deductionAmount : 0,
      deductionEnabled ? deductionAmount : 0,
      deductionReason ?? undefined,
    );
  }

  await db
    .update(purchasingQuotations)
    .set({ deductionEnabled, deductionAmount, deductionReason })
    .where(eq(purchasingQuotations.id, quotationId));

  await recomputeQuotationTotals(org, quotationId);
  revalidatePath(`/dashboard/purchasing/quotations/${quotationId}`);
}

export async function archivePurchasingQuotation(
  quotationId: string,
  _prevState: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const org = await requireOrg();
  const blocked = requireManager(org);
  if (blocked) return blocked;

  await db
    .update(purchasingQuotations)
    .set({ archivedAt: new Date().toISOString() })
    .where(and(eq(purchasingQuotations.id, quotationId), eq(purchasingQuotations.organizationId, org.organizationId)));

  revalidatePath("/dashboard/purchasing/quotations");
}

/** Freezes a copy of the quotation's current totals/lines into history -- an old saved receipt never silently changes after later edits. */
export async function saveReceiptVersion(
  quotationId: string,
  _prevState: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const org = await requireOrg();
  const [quotation] = await db
    .select()
    .from(purchasingQuotations)
    .where(and(eq(purchasingQuotations.id, quotationId), eq(purchasingQuotations.organizationId, org.organizationId)))
    .limit(1);
  if (!quotation) return { error: "Quotation not found." };

  const items = await db
    .select()
    .from(purchasingQuotedItems)
    .where(eq(purchasingQuotedItems.quotationId, quotationId));

  const existingVersions = await db
    .select({ version: purchasingReceiptVersions.version })
    .from(purchasingReceiptVersions)
    .where(eq(purchasingReceiptVersions.quotationId, quotationId));
  const nextVersion = (existingVersions.reduce((max, v) => Math.max(max, v.version), 0) || 0) + 1;

  // Freeze the business identity shown right now -- if the profile changes
  // later (new phone number, new logo), this saved version keeps showing
  // what was true when it was generated (see resolveBusinessDocumentIdentity).
  const businessProfile = await getBusinessProfile(org.organizationId);
  const business = resolveBusinessDocumentIdentity(org.organizationName, businessProfile);

  await db.insert(purchasingReceiptVersions).values({
    id: newId("preceipt"),
    quotationId,
    version: nextVersion,
    generatedAt: new Date().toISOString(),
    generatedByUserId: org.userId,
    snapshotJson: JSON.stringify({ quotation, items, business }),
  });

  revalidatePath(`/dashboard/purchasing/quotations/${quotationId}/receipt`);
}

export async function restorePurchasingQuotation(
  quotationId: string,
  _prevState: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const org = await requireOrg();
  const blocked = requireManager(org);
  if (blocked) return blocked;

  await db
    .update(purchasingQuotations)
    .set({ archivedAt: null })
    .where(and(eq(purchasingQuotations.id, quotationId), eq(purchasingQuotations.organizationId, org.organizationId)));

  revalidatePath("/dashboard/purchasing/quotations");
}

/**
 * Loads the reference product catalog (pulled from the team's Airtable
 * base -- see src/lib/purchasing-product-catalog-data.ts) into this org's
 * Products list. Safe to click more than once: already-present product
 * names are skipped, never duplicated. Every row lands at a $0 standard
 * price (Airtable has no cost data) -- a Manager still needs to set real
 * prices from this screen before a product is usable on a quotation.
 */
export async function loadPurchasingProductCatalog(
  _prevState: SeedCatalogActionState,
  _formData: FormData,
): Promise<SeedCatalogActionState> {
  const org = await requireOrg();
  const blocked = requireManager(org);
  if (blocked) return blocked;

  const { inserted, skipped, missingCategories } = await seedPurchasingProductCatalogForOrg(org.organizationId);

  revalidatePath("/dashboard/purchasing/products");

  if (missingCategories.length > 0) {
    return {
      error: `Added ${inserted} product(s), but couldn't find a "${missingCategories.join('", "')}" category to file the rest under -- add it under Purchasing > Categories, then click this again.`,
    };
  }
  if (inserted === 0) {
    return { message: "Already up to date -- every catalog product is already in your list." };
  }
  return { message: `Added ${inserted} product(s) from the catalog (${skipped} were already in your list). Set real prices before quoting them.` };
}

/**
 * Bulk-adds products from an uploaded CSV/Excel file. Expected columns
 * (case-insensitive, any order): Name (required), Category, Product Code,
 * Standard Price, Active, Notes. A Category that doesn't exist yet is
 * created on the fly. Rows whose name already matches a product this org
 * has are skipped, not duplicated or overwritten -- re-upload a corrected
 * file as many times as needed.
 */
export async function importPurchasingProducts(
  _prevState: ImportActionState,
  formData: FormData,
): Promise<ImportActionState> {
  const org = await requireOrg();
  const blocked = requireManager(org);
  if (blocked) return blocked;

  const file = await readUploadedFile(formData);
  if ("error" in file) return file;

  let parsed;
  try {
    parsed = parseSpreadsheetFile(file.buffer, file.filename);
  } catch {
    return { error: "Couldn't read that file -- make sure it's a CSV or Excel export." };
  }
  if (parsed.rows.length === 0) return { error: "That file doesn't have any data rows." };

  const nameCol = findColumn(parsed.headers, ["name", "product", "product name"]);
  if (!nameCol) {
    return { error: `Couldn't find a Name column. Found: ${parsed.headers.join(", ") || "(no headers)"}.` };
  }
  const categoryCol = findColumn(parsed.headers, ["category", "brand"]);
  const codeCol = findColumn(parsed.headers, ["product code", "code", "sku"]);
  const priceCol = findColumn(parsed.headers, ["standard price", "price", "cost"]);
  const activeCol = findColumn(parsed.headers, ["active"]);
  const notesCol = findColumn(parsed.headers, ["notes"]);

  const categories = await db
    .select({ id: purchasingCategories.id, name: purchasingCategories.name })
    .from(purchasingCategories)
    .where(eq(purchasingCategories.organizationId, org.organizationId));
  const categoryIdByName = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]));
  let nextSortOrder = categories.length;

  const existingProducts = await db
    .select({ name: purchasingProducts.name })
    .from(purchasingProducts)
    .where(eq(purchasingProducts.organizationId, org.organizationId));
  const existingNames = new Set(existingProducts.map((p) => p.name.toLowerCase()));

  let inserted = 0;
  let skipped = 0;
  let categoriesCreated = 0;
  const errors: string[] = [];

  for (let i = 0; i < parsed.rows.length; i++) {
    const row = parsed.rows[i];
    const rowNumber = i + 2; // +1 for the header row, +1 for 1-indexing
    const name = row[nameCol]?.trim();
    if (!name) {
      errors.push(`Row ${rowNumber}: missing name.`);
      continue;
    }
    if (existingNames.has(name.toLowerCase())) {
      skipped++;
      continue;
    }

    let categoryId: string | null = null;
    const categoryName = categoryCol ? row[categoryCol]?.trim() : "";
    if (categoryName) {
      categoryId = categoryIdByName.get(categoryName.toLowerCase()) ?? null;
      if (!categoryId) {
        categoryId = newId("pcat");
        await db.insert(purchasingCategories).values({
          id: categoryId,
          organizationId: org.organizationId,
          name: categoryName,
          sortOrder: nextSortOrder++,
        });
        categoryIdByName.set(categoryName.toLowerCase(), categoryId);
        categoriesCreated++;
      }
    }

    let standardPrice = 0;
    const rawPrice = priceCol ? row[priceCol]?.trim() : "";
    if (rawPrice) {
      const parsedPrice = Number(rawPrice.replace(/[$,]/g, ""));
      if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
        errors.push(`Row ${rowNumber}: "${rawPrice}" isn't a valid price -- set it to $0, fix it after import.`);
      } else {
        standardPrice = parsedPrice;
      }
    }

    const activeValue = (activeCol ? row[activeCol]?.trim() : "").toLowerCase();
    const active = activeValue === "" || !["no", "false", "0", "inactive"].includes(activeValue);

    await db.insert(purchasingProducts).values({
      id: newId("pprod"),
      organizationId: org.organizationId,
      categoryId,
      name,
      productCode: codeCol ? row[codeCol]?.trim() || null : null,
      standardPrice,
      notes: notesCol ? row[notesCol]?.trim() || null : null,
      active,
    });
    existingNames.add(name.toLowerCase());
    inserted++;
  }

  revalidatePath("/dashboard/purchasing/products");

  const parts = [`Imported ${inserted} product(s)`];
  if (skipped > 0) parts.push(`skipped ${skipped} already in your list`);
  if (categoriesCreated > 0) {
    parts.push(`created ${categoriesCreated} new categor${categoriesCreated === 1 ? "y" : "ies"}`);
  }
  let message = parts.join(", ") + ".";
  if (errors.length > 0) {
    message += ` ${errors.length} row(s) had problems: ${errors.slice(0, 5).join(" ")}${errors.length > 5 ? " …" : ""}`;
  }
  return { message };
}

/**
 * Bulk-adds customers from an uploaded CSV/Excel file. Expected columns
 * (case-insensitive, any order): Name or First Name (one is required), Last
 * Name, Email, Phone, Reference #, and optionally an address. A row is
 * skipped (not duplicated) when its email matches an existing customer, or
 * -- when neither row has an email -- when its first+last name matches.
 */
export async function importPurchasingCustomers(
  _prevState: ImportActionState,
  formData: FormData,
): Promise<ImportActionState> {
  const org = await requireOrg();

  const file = await readUploadedFile(formData);
  if ("error" in file) return file;

  let parsed;
  try {
    parsed = parseSpreadsheetFile(file.buffer, file.filename);
  } catch {
    return { error: "Couldn't read that file -- make sure it's a CSV or Excel export." };
  }
  if (parsed.rows.length === 0) return { error: "That file doesn't have any data rows." };

  const firstNameCol = findColumn(parsed.headers, ["first name", "firstname", "first"]);
  const fullNameCol = findColumn(parsed.headers, ["name", "full name", "customer name"]);
  if (!firstNameCol && !fullNameCol) {
    return { error: `Couldn't find a Name or First Name column. Found: ${parsed.headers.join(", ") || "(no headers)"}.` };
  }
  const lastNameCol = findColumn(parsed.headers, ["last name", "lastname", "last"]);
  const emailCol = findColumn(parsed.headers, ["email", "email address"]);
  const phoneCol = findColumn(parsed.headers, ["phone", "phone number", "telephone"]);
  const refCol = findColumn(parsed.headers, ["reference #", "reference number", "customer reference number", "ref #"]);
  const street1Col = findColumn(parsed.headers, ["address", "street", "address line 1", "street1", "address 1"]);
  const street2Col = findColumn(parsed.headers, ["address line 2", "street2", "address 2"]);
  const cityCol = findColumn(parsed.headers, ["city"]);
  const stateCol = findColumn(parsed.headers, ["state"]);
  const zipCol = findColumn(parsed.headers, ["zip", "zip code", "postal code"]);

  const existingCustomers = await db
    .select({
      firstName: purchasingCustomers.firstName,
      lastName: purchasingCustomers.lastName,
      email: purchasingCustomers.email,
    })
    .from(purchasingCustomers)
    .where(eq(purchasingCustomers.organizationId, org.organizationId));
  const existingEmails = new Set(
    existingCustomers.filter((c) => c.email).map((c) => c.email!.toLowerCase()),
  );
  const existingNamePairs = new Set(
    existingCustomers.map((c) => `${c.firstName} ${c.lastName ?? ""}`.trim().toLowerCase()),
  );

  let inserted = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let i = 0; i < parsed.rows.length; i++) {
    const row = parsed.rows[i];
    const rowNumber = i + 2;

    let firstName = "";
    let lastName = "";
    if (firstNameCol) {
      firstName = row[firstNameCol]?.trim() ?? "";
      lastName = lastNameCol ? row[lastNameCol]?.trim() ?? "" : "";
    } else if (fullNameCol) {
      const full = (row[fullNameCol] ?? "").trim();
      const spaceIdx = full.indexOf(" ");
      if (spaceIdx === -1) {
        firstName = full;
      } else {
        firstName = full.slice(0, spaceIdx);
        lastName = full.slice(spaceIdx + 1);
      }
    }
    if (!firstName) {
      errors.push(`Row ${rowNumber}: missing name.`);
      continue;
    }

    const email = emailCol ? row[emailCol]?.trim() || null : null;
    if (email && existingEmails.has(email.toLowerCase())) {
      skipped++;
      continue;
    }
    const namePair = `${firstName} ${lastName}`.trim().toLowerCase();
    if (!email && existingNamePairs.has(namePair)) {
      skipped++;
      continue;
    }

    await db.insert(purchasingCustomers).values({
      id: newId("pcust"),
      organizationId: org.organizationId,
      firstName,
      lastName: lastName || null,
      customerReferenceNumber: refCol ? row[refCol]?.trim() || null : null,
      email,
      phone: phoneCol ? row[phoneCol]?.trim() || null : null,
      addressStreet1: street1Col ? row[street1Col]?.trim() || null : null,
      addressStreet2: street2Col ? row[street2Col]?.trim() || null : null,
      addressCity: cityCol ? row[cityCol]?.trim() || null : null,
      addressState: stateCol ? row[stateCol]?.trim() || null : null,
      addressZip: zipCol ? row[zipCol]?.trim() || null : null,
    });
    if (email) existingEmails.add(email.toLowerCase());
    existingNamePairs.add(namePair);
    inserted++;
  }

  revalidatePath("/dashboard/purchasing/customers");

  const parts = [`Imported ${inserted} customer(s)`];
  if (skipped > 0) parts.push(`skipped ${skipped} already in your list`);
  let message = parts.join(", ") + ".";
  if (errors.length > 0) {
    message += ` ${errors.length} row(s) had problems: ${errors.slice(0, 5).join(" ")}${errors.length > 5 ? " …" : ""}`;
  }
  return { message };
}
