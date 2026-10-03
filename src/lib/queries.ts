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
  sellers,
  buybackOrders,
  buybackOrderItems,
  receivingShipments,
  receivedItems,
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
  const [[productCount], [buyerCount], [invoiceCount], [openShipmentCount]] =
    await Promise.all([
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
      db
        .select({ count: sql<number>`count(*)` })
        .from(receivingShipments)
        .where(
          and(
            eq(receivingShipments.organizationId, organizationId),
            eq(receivingShipments.accountsStatus, "IN_REVIEW"),
          ),
        ),
    ]);
  return {
    products: Number(productCount?.count ?? 0),
    buyers: Number(buyerCount?.count ?? 0),
    draftInvoices: Number(invoiceCount?.count ?? 0),
    openShipments: Number(openShipmentCount?.count ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Buyback / receiving
// ---------------------------------------------------------------------------

export async function getSellers(organizationId: string) {
  return db
    .select()
    .from(sellers)
    .where(eq(sellers.organizationId, organizationId))
    .orderBy(sellers.name);
}

export async function getBuybackOrders(organizationId: string) {
  return db
    .select({
      id: buybackOrders.id,
      orderReference: buybackOrders.orderReference,
      orderDate: buybackOrders.orderDate,
      packageStatus: buybackOrders.packageStatus,
      quotedTotal: buybackOrders.quotedTotal,
      sellerName: sellers.name,
    })
    .from(buybackOrders)
    .innerJoin(sellers, eq(buybackOrders.sellerId, sellers.id))
    .where(eq(buybackOrders.organizationId, organizationId))
    .orderBy(desc(buybackOrders.createdAt));
}

/** One buyback order, its seller, and its quoted line items -- for the order detail page. */
export async function getBuybackOrderWithItems(organizationId: string, orderId: string) {
  const [order] = await db
    .select()
    .from(buybackOrders)
    .where(and(eq(buybackOrders.id, orderId), eq(buybackOrders.organizationId, organizationId)))
    .limit(1);
  if (!order) return null;

  const [seller] = await db.select().from(sellers).where(eq(sellers.id, order.sellerId)).limit(1);

  const items = await db
    .select({
      id: buybackOrderItems.id,
      lineLabel: buybackOrderItems.lineLabel,
      productId: buybackOrderItems.productId,
      productCodeVariant: buybackOrderItems.productCodeVariant,
      quotedQuantity: buybackOrderItems.quotedQuantity,
      quotedUnitPrice: buybackOrderItems.quotedUnitPrice,
    })
    .from(buybackOrderItems)
    .where(eq(buybackOrderItems.orderId, orderId))
    .orderBy(buybackOrderItems.createdAt);

  const shipments = await db
    .select({
      id: receivingShipments.id,
      receivingStatus: receivingShipments.receivingStatus,
      accountsStatus: receivingShipments.accountsStatus,
      createdAt: receivingShipments.createdAt,
    })
    .from(receivingShipments)
    .where(eq(receivingShipments.orderId, orderId))
    .orderBy(desc(receivingShipments.createdAt));

  return { order, seller, items, shipments };
}

export async function getReceivingShipments(organizationId: string) {
  return db
    .select({
      id: receivingShipments.id,
      receivingStatus: receivingShipments.receivingStatus,
      accountsDecision: receivingShipments.accountsDecision,
      accountsStatus: receivingShipments.accountsStatus,
      createdAt: receivingShipments.createdAt,
      orderReference: buybackOrders.orderReference,
      sellerName: sellers.name,
    })
    .from(receivingShipments)
    .innerJoin(buybackOrders, eq(receivingShipments.orderId, buybackOrders.id))
    .innerJoin(sellers, eq(buybackOrders.sellerId, sellers.id))
    .where(eq(receivingShipments.organizationId, organizationId))
    .orderBy(desc(receivingShipments.createdAt));
}

/**
 * One receiving shipment with everything needed to work it: the order it
 * came from, the seller, what was quoted (for comparison), and every
 * received-item row logged so far (joined with product/condition names).
 */
export async function getReceivingShipmentDetail(organizationId: string, shipmentId: string) {
  const [shipment] = await db
    .select()
    .from(receivingShipments)
    .where(
      and(
        eq(receivingShipments.id, shipmentId),
        eq(receivingShipments.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!shipment) return null;

  const [order] = await db
    .select()
    .from(buybackOrders)
    .where(eq(buybackOrders.id, shipment.orderId))
    .limit(1);
  const [seller] = order
    ? await db.select().from(sellers).where(eq(sellers.id, order.sellerId)).limit(1)
    : [undefined];

  const quotedItems = order
    ? await db
        .select()
        .from(buybackOrderItems)
        .where(eq(buybackOrderItems.orderId, order.id))
        .orderBy(buybackOrderItems.createdAt)
    : [];

  const items = await db
    .select({
      id: receivedItems.id,
      quotedItemId: receivedItems.quotedItemId,
      productId: receivedItems.productId,
      productName: products.name,
      conditionId: receivedItems.conditionId,
      conditionName: conditions.name,
      itemSource: receivedItems.itemSource,
      wasReceived: receivedItems.wasReceived,
      quantityReceived: receivedItems.quantityReceived,
      expirationDate: receivedItems.expirationDate,
      discrepancyNotes: receivedItems.discrepancyNotes,
      returnRequired: receivedItems.returnRequired,
      quantityToBeReturned: receivedItems.quantityToBeReturned,
      returnStatus: receivedItems.returnStatus,
      postedToInventory: receivedItems.postedToInventory,
    })
    .from(receivedItems)
    .innerJoin(products, eq(receivedItems.productId, products.id))
    .innerJoin(conditions, eq(receivedItems.conditionId, conditions.id))
    .where(eq(receivedItems.shipmentId, shipmentId))
    .orderBy(receivedItems.createdAt);

  return { shipment, order, seller, quotedItems, items };
}
