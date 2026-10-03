// Data access layer -- every function here takes an explicit organizationId
// and filters by it. Pages call these instead of touching `db` directly, so
// there is exactly one place that has to get tenant-scoping right.
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  conditions,
  products,
  inventoryTransactions,
  invoices,
  invoiceLineItems,
  buyers,
} from "@/db/schema";

/** Simple product list for <select> inputs -- no on-hand rollup needed. */
export async function getProducts(organizationId: string) {
  return db
    .select()
    .from(products)
    .where(eq(products.organizationId, organizationId))
    .orderBy(products.name);
}

export async function getBuyers(organizationId: string) {
  return db
    .select()
    .from(buyers)
    .where(eq(buyers.organizationId, organizationId))
    .orderBy(buyers.companyName);
}

/**
 * On-hand quantity for every (product, condition) pair the org has ever
 * moved, keyed the same way getProductsWithOnHand keys its lookup map.
 * Shared by the dashboard rollup and the finalize-invoice stock check, so
 * there is exactly one place that sums the ledger.
 */
export async function getOnHandMap(organizationId: string) {
  const rows = await db
    .select({
      productId: inventoryTransactions.productId,
      conditionId: inventoryTransactions.conditionId,
      onHand: sql<number>`sum(${inventoryTransactions.quantityChange})`.as("on_hand"),
    })
    .from(inventoryTransactions)
    .where(eq(inventoryTransactions.organizationId, organizationId))
    .groupBy(inventoryTransactions.productId, inventoryTransactions.conditionId);

  return new Map(rows.map((r) => [onHandKey(r.productId, r.conditionId), Number(r.onHand ?? 0)]));
}

export function onHandKey(productId: string, conditionId: string) {
  return `${productId}:${conditionId}`;
}

/** One invoice, its buyer, and its active line items -- for the detail/edit page. */
export async function getInvoiceWithLines(organizationId: string, invoiceId: string) {
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.organizationId, organizationId)))
    .limit(1);
  if (!invoice) return null;

  const [buyer] = invoice.buyerId
    ? await db.select().from(buyers).where(eq(buyers.id, invoice.buyerId)).limit(1)
    : [undefined];

  const lines = await db
    .select({
      id: invoiceLineItems.id,
      productId: invoiceLineItems.productId,
      productName: products.name,
      conditionId: invoiceLineItems.conditionId,
      conditionName: conditions.name,
      quantity: invoiceLineItems.quantity,
      unitPrice: invoiceLineItems.unitPrice,
      lineStatus: invoiceLineItems.lineStatus,
    })
    .from(invoiceLineItems)
    .innerJoin(products, eq(invoiceLineItems.productId, products.id))
    .innerJoin(conditions, eq(invoiceLineItems.conditionId, conditions.id))
    .where(
      and(eq(invoiceLineItems.invoiceId, invoiceId), eq(invoiceLineItems.lineStatus, "Active")),
    )
    .orderBy(invoiceLineItems.createdAt);

  return { invoice, buyer, lines };
}

export async function getConditions(organizationId: string) {
  return db
    .select()
    .from(conditions)
    .where(eq(conditions.organizationId, organizationId))
    .orderBy(conditions.sortOrder);
}

/**
 * Every product for the org, with on-hand quantity broken out by
 * condition -- the same rollup-off-the-ledger pattern proven out in the
 * Airtable base. Nothing here is a number typed by a person; it's always
 * derived from inventory_transactions.
 */
export async function getProductsWithOnHand(organizationId: string) {
  const [productRows, conditionRows, onHandMap] = await Promise.all([
    db
      .select()
      .from(products)
      .where(eq(products.organizationId, organizationId))
      .orderBy(products.name),
    getConditions(organizationId),
    getOnHandMap(organizationId),
  ]);

  const rows = productRows.map((product) => {
    const byCondition = conditionRows.map((condition) => ({
      conditionId: condition.id,
      conditionName: condition.name,
      onHand: onHandMap.get(onHandKey(product.id, condition.id)) ?? 0,
    }));
    return {
      ...product,
      byCondition,
      totalOnHand: byCondition.reduce((sum, c) => sum + c.onHand, 0),
    };
  });

  return { conditions: conditionRows, products: rows };
}

export async function getInvoices(organizationId: string) {
  return db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      status: invoices.status,
      invoiceDate: invoices.invoiceDate,
      total: invoices.total,
      buyerCompanyName: buyers.companyName,
    })
    .from(invoices)
    .leftJoin(buyers, eq(invoices.buyerId, buyers.id))
    .where(eq(invoices.organizationId, organizationId))
    .orderBy(desc(invoices.invoiceSequence));
}

export async function getNextInvoiceSequence(organizationId: string) {
  const [row] = await db
    .select({
      max: sql<number>`coalesce(max(${invoices.invoiceSequence}), 0)`,
    })
    .from(invoices)
    .where(eq(invoices.organizationId, organizationId));
  return (row?.max ?? 0) + 1;
}

export async function getDashboardCounts(organizationId: string) {
  const [[productCount], [buyerCount], [invoiceCount]] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)` })
      .from(products)
      .where(eq(products.organizationId, organizationId)),
    db
      .select({ count: sql<number>`count(*)` })
      .from(buyers)
      .where(eq(buyers.organizationId, organizationId)),
    db
      .select({ count: sql<number>`count(*)` })
      .from(invoices)
      .where(
        and(eq(invoices.organizationId, organizationId), eq(invoices.status, "DRAFT")),
      ),
  ]);
  return {
    products: Number(productCount?.count ?? 0),
    buyers: Number(buyerCount?.count ?? 0),
    draftInvoices: Number(invoiceCount?.count ?? 0),
  };
}
