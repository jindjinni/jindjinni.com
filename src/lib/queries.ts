// Data access layer -- every function here takes an explicit organizationId
// and filters by it. Pages call these instead of touching `db` directly, so
// there is exactly one place that has to get tenant-scoping right.
import { getReceivingStatusByQuotation } from "@/lib/receiving-queries";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
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
  organizations,
  purchasingCustomers,
  purchasingCategories,
  purchasingProducts,
  purchasingConditions,
  purchasingProductConditions,
  purchasingExpirationRanges,
  purchasingProductMultipliers,
  purchasingBonusTiers,
  purchasingQuotations,
  purchasingQuotedItems,
  purchasingAuditLog,
  purchasingReceiptVersions,
  purchasingQuotationDocuments,
  purchasingReceiptSettings,
  businessProfiles,
} from "@/db/schema";

export type BusinessProfile = typeof businessProfiles.$inferSelect;

export async function getBusinessProfile(organizationId: string) {
  const [row] = await db
    .select()
    .from(businessProfiles)
    .where(eq(businessProfiles.organizationId, organizationId))
    .limit(1);
  return row ?? null;
}

/** The address a document should print: Shipping/Operating when distinct, otherwise the Business Address. */
export function resolveBusinessDocumentAddress(profile: BusinessProfile | null) {
  if (!profile) return null;
  const useShipping = !profile.shippingSameAsBusiness;
  const street1 = useShipping ? profile.shippingAddressStreet1 : profile.businessAddressStreet1;
  const street2 = useShipping ? profile.shippingAddressStreet2 : profile.businessAddressStreet2;
  const city = useShipping ? profile.shippingAddressCity : profile.businessAddressCity;
  const state = useShipping ? profile.shippingAddressState : profile.businessAddressState;
  const zip = useShipping ? profile.shippingAddressZip : profile.businessAddressZip;
  const country = useShipping ? profile.shippingAddressCountry : profile.businessAddressCountry;
  if (!street1 && !city && !state && !zip) return null;
  return { street1, street2, city, state, zip, country };
}

export type BusinessDocumentIdentity = {
  displayName: string;
  showLogo: boolean;
  logoDataUrl: string | null;
  address: ReturnType<typeof resolveBusinessDocumentAddress>;
  phone: string | null;
  email: string | null;
  website: string | null;
};

/**
 * Everything a generated document (quotation receipt today) needs from the
 * Business Profile, already resolved per the Document Display Settings and
 * the Name Display preference. Used both to render the live receipt and to
 * freeze into a receipt version's snapshotJson (see saveReceiptVersion) --
 * the snapshot stores this resolved object verbatim so an old receipt keeps
 * showing what was true when it was generated, even if the profile or this
 * resolution logic changes later.
 */
export function resolveBusinessDocumentIdentity(
  organizationName: string,
  profile: BusinessProfile | null,
): BusinessDocumentIdentity {
  const dba = profile?.dbaName?.trim() || null;
  const pref = profile?.nameDisplayPreference ?? "legal";
  const showLegal = profile?.docShowLegalName ?? true;
  const showDba = profile?.docShowDba ?? true;

  let displayName = organizationName;
  if (pref === "dba" && dba && showDba) {
    displayName = dba;
  } else if (pref === "both" && dba && showDba) {
    displayName = showLegal ? `${dba} (${organizationName})` : dba;
  } else if (!showLegal && dba && showDba) {
    displayName = dba; // Legal name suppressed but DBA allowed -- never show a blank header.
  } else {
    displayName = organizationName;
  }

  return {
    displayName,
    showLogo: profile?.docShowLogo ?? true,
    logoDataUrl:
      profile?.logoData && profile?.logoContentType ? `data:${profile.logoContentType};base64,${profile.logoData}` : null,
    address: (profile?.docShowAddress ?? true) ? resolveBusinessDocumentAddress(profile) : null,
    phone: (profile?.docShowPhone ?? true) ? profile?.businessPhone ?? null : null,
    email: (profile?.docShowEmail ?? true) ? profile?.businessEmail ?? null : null,
    website: (profile?.docShowWebsite ?? false) ? profile?.website ?? null : null,
  };
}

export type PurchasingReceiptSettings = typeof purchasingReceiptSettings.$inferSelect;

export async function getPurchasingReceiptSettings(organizationId: string) {
  const [row] = await db
    .select()
    .from(purchasingReceiptSettings)
    .where(eq(purchasingReceiptSettings.organizationId, organizationId))
    .limit(1);
  return row ?? null;
}

/** The built-in receipt wording -- what every org saw before this became editable, and what a null column still falls back to today. */
export const PURCHASING_RECEIPT_DEFAULTS = {
  bannerText: "Limited Time Offer!",
  shippingSuffix: "plus free shipping!",
  disclaimerIntro: "By sending your items, you acknowledge and agree to all {business} policies.",
  disclaimerReturnPolicy:
    "Supplies that are damaged, stained, ripped, torn, expired, or otherwise not accepted will be returned at the seller's expense.",
  disclaimerDamageSummary:
    "Hidden damage found under pharmacy labels or packaging damage caused by not following our packaging instructions may each be subject to up to a 50% deduction of the quoted value, and packages lost in transit are covered by the carrier for up to $100 only, unless additional coverage applies.",
  conditionHeading: "MINT CONDITION SUPPLIES ONLY:",
  conditionBullets: "No dents, scratches, tears, or stains.\nWe do NOT accept re-glued or re-taped supplies.\nFACTORY SEALED ONLY",
  paymentTimingText: "Payment is processed 3 business days after your package shows delivered to our office.",
  paymentTimingSubtext: "(Excludes weekends, public holidays, and days our office is closed.)",
  footerThankYou: "Thank you for your business! This quotation is valid for 72 hours.",
} as const;

export type ResolvedPurchasingReceiptSettings = { [K in keyof typeof PURCHASING_RECEIPT_DEFAULTS]: string };

/**
 * Every receipt-wording field with null columns swapped for the built-in
 * default -- the *unsubstituted* form, with the literal "{business}" token
 * still in disclaimerIntro. This is what the Quotation Receipt Layout
 * editor reads and saves, so an org can rename itself later without that
 * field silently going stale. Call renderReceiptCopy() to get the version
 * with {business} filled in for actually printing a receipt.
 */
export function resolvePurchasingReceiptSettings(row: PurchasingReceiptSettings | null): ResolvedPurchasingReceiptSettings {
  const d = PURCHASING_RECEIPT_DEFAULTS;
  return {
    bannerText: row?.bannerText || d.bannerText,
    shippingSuffix: row?.shippingSuffix || d.shippingSuffix,
    disclaimerIntro: row?.disclaimerIntro || d.disclaimerIntro,
    disclaimerReturnPolicy: row?.disclaimerReturnPolicy || d.disclaimerReturnPolicy,
    disclaimerDamageSummary: row?.disclaimerDamageSummary || d.disclaimerDamageSummary,
    conditionHeading: row?.conditionHeading || d.conditionHeading,
    conditionBullets: row?.conditionBullets || d.conditionBullets,
    paymentTimingText: row?.paymentTimingText || d.paymentTimingText,
    paymentTimingSubtext: row?.paymentTimingSubtext || d.paymentTimingSubtext,
    footerThankYou: row?.footerThankYou || d.footerThankYou,
  };
}

/** resolvePurchasingReceiptSettings() output with {business} filled in -- call this right before printing/rendering a receipt, never for the settings editor. */
export function renderReceiptCopy(
  copy: ResolvedPurchasingReceiptSettings,
  businessDisplayName: string,
): ResolvedPurchasingReceiptSettings {
  return { ...copy, disclaimerIntro: copy.disclaimerIntro.replaceAll("{business}", businessDisplayName) };
}

export async function getOrganization(organizationId: string) {
  const [row] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  return row ?? null;
}

/** True once every field a label purchase needs from the org is filled in. */
export function hasShipFromAddress(org: Awaited<ReturnType<typeof getOrganization>>) {
  return !!(
    org?.shipFromName &&
    org.shipFromStreet1 &&
    org.shipFromCity &&
    org.shipFromState &&
    org.shipFromZip &&
    org.shipFromPhone &&
    org.shipFromEmail
  );
}

/** True once a seller has a real structured address a label can ship to. */
export function hasSellerAddress(seller: { addressStreet1: string | null; addressCity: string | null; addressState: string | null; addressZip: string | null } | null | undefined) {
  return !!(seller?.addressStreet1 && seller.addressCity && seller.addressState && seller.addressZip);
}

/** True once a purchasing customer has a real structured address a label can ship to. */
export function hasCustomerAddress(customer: { addressStreet1: string | null; addressCity: string | null; addressState: string | null; addressZip: string | null } | null | undefined) {
  return !!(customer?.addressStreet1 && customer.addressCity && customer.addressState && customer.addressZip);
}

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

export async function getSeller(organizationId: string, sellerId: string) {
  const [seller] = await db
    .select()
    .from(sellers)
    .where(and(eq(sellers.id, sellerId), eq(sellers.organizationId, organizationId)))
    .limit(1);
  return seller ?? null;
}

export async function getBuybackOrders(organizationId: string) {
  return db
    .select({
      id: buybackOrders.id,
      orderReference: buybackOrders.orderReference,
      orderDate: buybackOrders.orderDate,
      packageStatus: buybackOrders.packageStatus,
      quotedTotal: buybackOrders.quotedTotal,
      deductionAmount: buybackOrders.deductionAmount,
      adjustmentEnabled: buybackOrders.adjustmentEnabled,
      labelStatus: buybackOrders.labelStatus,
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
      conditionId: buybackOrderItems.conditionId,
      conditionName: conditions.name,
      expirationDate: buybackOrderItems.expirationDate,
      quotedQuantity: buybackOrderItems.quotedQuantity,
      quotedUnitPrice: buybackOrderItems.quotedUnitPrice,
    })
    .from(buybackOrderItems)
    .leftJoin(conditions, eq(buybackOrderItems.conditionId, conditions.id))
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

/**
 * The buyback module's "launch screen" -- one query that sorts every open
 * buyback order/shipment into exactly one queue, the same way the old
 * Airtable base split its single Receiving Shipments table across separate
 * Receiving / Accounts / Customer Service interface pages. Nothing here is
 * stored redundantly: it's all derived, on each load, from the same
 * buybackOrders/receivingShipments rows the detail pages already use.
 */
export async function getOperationsQueues(organizationId: string) {
  const [orders, shipments] = await Promise.all([
    db
      .select({
        id: buybackOrders.id,
        orderReference: buybackOrders.orderReference,
        orderDate: buybackOrders.orderDate,
        quotedTotal: buybackOrders.quotedTotal,
        sellerName: sellers.name,
      })
      .from(buybackOrders)
      .innerJoin(sellers, eq(buybackOrders.sellerId, sellers.id))
      .where(eq(buybackOrders.organizationId, organizationId))
      .orderBy(desc(buybackOrders.createdAt)),
    db
      .select({
        id: receivingShipments.id,
        orderId: receivingShipments.orderId,
        receivingStatus: receivingShipments.receivingStatus,
        accountsStatus: receivingShipments.accountsStatus,
        accountsDecision: receivingShipments.accountsDecision,
        customerNotified: receivingShipments.customerNotified,
        createdAt: receivingShipments.createdAt,
        paidAt: receivingShipments.paidAt,
        orderReference: buybackOrders.orderReference,
        quotedTotal: buybackOrders.quotedTotal,
        sellerName: sellers.name,
      })
      .from(receivingShipments)
      .innerJoin(buybackOrders, eq(receivingShipments.orderId, buybackOrders.id))
      .innerJoin(sellers, eq(buybackOrders.sellerId, sellers.id))
      .where(eq(receivingShipments.organizationId, organizationId))
      .orderBy(desc(receivingShipments.createdAt)),
  ]);

  const orderIdsWithShipments = new Set(shipments.map((s) => s.orderId));

  return {
    awaitingArrival: orders.filter((o) => !orderIdsWithShipments.has(o.id)),
    inProgress: shipments.filter((s) => s.receivingStatus === "IN_PROGRESS"),
    needsAccounts: shipments.filter(
      (s) => s.receivingStatus !== "IN_PROGRESS" && s.accountsStatus === "IN_REVIEW",
    ),
    needsNotification: shipments.filter(
      (s) => s.accountsStatus === "PAID" && !s.customerNotified,
    ),
    totalShipments: shipments.length,
  };
}

// ---------------------------------------------------------------------------
// Admin database view -- read-only, flat, one function per table. This is
// deliberately the raw rows (joined only enough to be readable), the same
// thing an admin would see opening the Airtable base directly. Editing still
// happens through the purpose-built workflow pages above; this is for
// visibility into everything at once.
// ---------------------------------------------------------------------------

export async function getBuybackOrderItemsAll(organizationId: string) {
  return db
    .select({
      id: buybackOrderItems.id,
      orderId: buybackOrderItems.orderId,
      orderReference: buybackOrders.orderReference,
      sellerName: sellers.name,
      lineLabel: buybackOrderItems.lineLabel,
      productCodeVariant: buybackOrderItems.productCodeVariant,
      quotedQuantity: buybackOrderItems.quotedQuantity,
      quotedUnitPrice: buybackOrderItems.quotedUnitPrice,
      createdAt: buybackOrderItems.createdAt,
    })
    .from(buybackOrderItems)
    .innerJoin(buybackOrders, eq(buybackOrderItems.orderId, buybackOrders.id))
    .innerJoin(sellers, eq(buybackOrders.sellerId, sellers.id))
    .where(eq(buybackOrders.organizationId, organizationId))
    .orderBy(desc(buybackOrderItems.createdAt));
}

// ---------------------------------------------------------------------------
// Purchasing department
// ---------------------------------------------------------------------------

export function purchasingCustomerName(c: { firstName: string; lastName: string | null }) {
  return [c.firstName, c.lastName].filter(Boolean).join(" ");
}

export async function getPurchasingCustomers(organizationId: string, opts: { includeArchived?: boolean } = {}) {
  const rows = await db
    .select()
    .from(purchasingCustomers)
    .where(eq(purchasingCustomers.organizationId, organizationId))
    .orderBy(purchasingCustomers.firstName);
  return opts.includeArchived ? rows : rows.filter((r) => !r.archivedAt);
}

export async function getPurchasingCustomer(organizationId: string, customerId: string) {
  const [row] = await db
    .select()
    .from(purchasingCustomers)
    .where(and(eq(purchasingCustomers.id, customerId), eq(purchasingCustomers.organizationId, organizationId)))
    .limit(1);
  return row ?? null;
}

/** Every quotation (reference number) ever created for one customer, newest first -- archived ones included and flagged. */
export async function getPurchasingQuotationsForCustomer(organizationId: string, customerId: string) {
  return db
    .select({
      id: purchasingQuotations.id,
      quotationNumber: purchasingQuotations.quotationNumber,
      quotationDate: purchasingQuotations.quotationDate,
      status: purchasingQuotations.status,
      itemsTotal: purchasingQuotations.itemsTotal,
      bonusAmount: purchasingQuotations.bonusAmount,
      deductionEnabled: purchasingQuotations.deductionEnabled,
      deductionAmount: purchasingQuotations.deductionAmount,
      grandTotal: purchasingQuotations.grandTotal,
      trackingNumber: purchasingQuotations.trackingNumber,
      packageStatus: purchasingQuotations.packageStatus,
      archivedAt: purchasingQuotations.archivedAt,
    })
    .from(purchasingQuotations)
    .where(and(eq(purchasingQuotations.organizationId, organizationId), eq(purchasingQuotations.customerId, customerId)))
    .orderBy(desc(purchasingQuotations.createdAt));
}

/** customerId -> how many quotations they have (for the Customers list). */
export async function getPurchasingQuotationCountsByCustomer(organizationId: string) {
  const rows = await db
    .select({ customerId: purchasingQuotations.customerId, count: sql<number>`count(*)` })
    .from(purchasingQuotations)
    .where(and(eq(purchasingQuotations.organizationId, organizationId), isNull(purchasingQuotations.archivedAt)))
    .groupBy(purchasingQuotations.customerId);
  return new Map(rows.map((r) => [r.customerId, Number(r.count)]));
}

export async function getPurchasingCategories(organizationId: string, opts: { includeInactive?: boolean } = {}) {
  const rows = await db
    .select()
    .from(purchasingCategories)
    .where(eq(purchasingCategories.organizationId, organizationId))
    .orderBy(purchasingCategories.sortOrder);
  return opts.includeInactive ? rows : rows.filter((r) => r.active);
}

export async function getPurchasingConditions(organizationId: string, opts: { includeInactive?: boolean } = {}) {
  const rows = await db
    .select()
    .from(purchasingConditions)
    .where(eq(purchasingConditions.organizationId, organizationId))
    .orderBy(purchasingConditions.sortOrder);
  return opts.includeInactive ? rows : rows.filter((r) => r.active);
}

/** The conditions one product carries -- for its own Conditions section (the join row id is what Remove deletes). */
export async function getProductConditions(organizationId: string, productId: string) {
  return db
    .select({
      id: purchasingProductConditions.id,
      conditionId: purchasingProductConditions.conditionId,
      conditionName: purchasingConditions.name,
      conditionMultiplier: purchasingConditions.multiplier,
    })
    .from(purchasingProductConditions)
    .innerJoin(purchasingConditions, eq(purchasingProductConditions.conditionId, purchasingConditions.id))
    .where(and(eq(purchasingProductConditions.organizationId, organizationId), eq(purchasingProductConditions.productId, productId)))
    .orderBy(purchasingConditions.sortOrder);
}

/** productId -> the conditions it carries, for filtering the quoted-line Condition dropdown to just that product's list (a product with none yet falls back to the full active list, so nothing already in use breaks). */
export async function getProductConditionsMap(organizationId: string) {
  const rows = await db
    .select({
      productId: purchasingProductConditions.productId,
      conditionId: purchasingProductConditions.conditionId,
      conditionName: purchasingConditions.name,
    })
    .from(purchasingProductConditions)
    .innerJoin(purchasingConditions, eq(purchasingProductConditions.conditionId, purchasingConditions.id))
    .where(eq(purchasingProductConditions.organizationId, organizationId))
    .orderBy(purchasingConditions.sortOrder);

  const map = new Map<string, { id: string; name: string }[]>();
  for (const r of rows) {
    const list = map.get(r.productId) ?? [];
    list.push({ id: r.conditionId, name: r.conditionName });
    map.set(r.productId, list);
  }
  return map;
}

export async function getPurchasingExpirationRanges(organizationId: string, opts: { includeInactive?: boolean } = {}) {
  const rows = await db
    .select()
    .from(purchasingExpirationRanges)
    .where(eq(purchasingExpirationRanges.organizationId, organizationId))
    .orderBy(purchasingExpirationRanges.sortOrder);
  return opts.includeInactive ? rows : rows.filter((r) => r.active);
}

export async function getPurchasingBonusTiers(organizationId: string, opts: { includeInactive?: boolean } = {}) {
  const rows = await db
    .select()
    .from(purchasingBonusTiers)
    .where(eq(purchasingBonusTiers.organizationId, organizationId))
    .orderBy(purchasingBonusTiers.sortOrder);
  return opts.includeInactive ? rows : rows.filter((r) => r.active);
}

/** The best (highest) automatic bonus for a given items total -- the framework's tiered threshold rule, read, never hardcoded. */
export function computeAutomaticBonus(
  itemsTotal: number,
  tiers: { thresholdAmount: number; bonusAmount: number; active: boolean }[],
) {
  const eligible = tiers.filter((t) => t.active && itemsTotal >= t.thresholdAmount);
  if (eligible.length === 0) return { bonusAmount: 0, tier: null as (typeof tiers)[number] | null };
  const best = eligible.reduce((a, b) => (b.thresholdAmount > a.thresholdAmount ? b : a));
  return { bonusAmount: best.bonusAmount, tier: best };
}

export async function getPurchasingProducts(organizationId: string, opts: { includeInactive?: boolean } = {}) {
  const rows = await db
    .select({
      id: purchasingProducts.id,
      categoryId: purchasingProducts.categoryId,
      categoryName: purchasingCategories.name,
      name: purchasingProducts.name,
      productCode: purchasingProducts.productCode,
      ndc: purchasingProducts.ndc,
      standardPrice: purchasingProducts.standardPrice,
      notes: purchasingProducts.notes,
      noExpiration: purchasingProducts.noExpiration,
      active: purchasingProducts.active,
      archivedAt: purchasingProducts.archivedAt,
    })
    .from(purchasingProducts)
    .leftJoin(purchasingCategories, eq(purchasingProducts.categoryId, purchasingCategories.id))
    .where(eq(purchasingProducts.organizationId, organizationId))
    .orderBy(purchasingProducts.name);
  return opts.includeInactive ? rows : rows.filter((r) => r.active && !r.archivedAt);
}

export async function getPurchasingProduct(organizationId: string, productId: string) {
  const [row] = await db
    .select()
    .from(purchasingProducts)
    .where(and(eq(purchasingProducts.id, productId), eq(purchasingProducts.organizationId, organizationId)))
    .limit(1);
  return row ?? null;
}

/** Every multiplier row for one product, joined to its expiration range label -- the editable "allowed ranges + price" list for that product. */
export async function getProductMultipliers(organizationId: string, productId: string) {
  return db
    .select({
      id: purchasingProductMultipliers.id,
      expirationRangeId: purchasingProductMultipliers.expirationRangeId,
      expirationRangeLabel: purchasingExpirationRanges.label,
      multiplier: purchasingProductMultipliers.multiplier,
    })
    .from(purchasingProductMultipliers)
    .innerJoin(
      purchasingExpirationRanges,
      eq(purchasingProductMultipliers.expirationRangeId, purchasingExpirationRanges.id),
    )
    .where(
      and(
        eq(purchasingProductMultipliers.organizationId, organizationId),
        eq(purchasingProductMultipliers.productId, productId),
      ),
    )
    .orderBy(purchasingExpirationRanges.sortOrder);
}

/** productId -> its selected Expiry Options (month ranges it's quoted at), for the pills shown on the Products list. Sourced from the same purchasing_product_multipliers rows as the Product Multipliers page and the per-product Expiry Options section. */
export async function getProductExpiryOptionsMap(organizationId: string) {
  const rows = await db
    .select({
      productId: purchasingProductMultipliers.productId,
      expirationRangeId: purchasingProductMultipliers.expirationRangeId,
      label: purchasingExpirationRanges.label,
      multiplier: purchasingProductMultipliers.multiplier,
    })
    .from(purchasingProductMultipliers)
    .innerJoin(purchasingExpirationRanges, eq(purchasingProductMultipliers.expirationRangeId, purchasingExpirationRanges.id))
    .where(eq(purchasingProductMultipliers.organizationId, organizationId))
    .orderBy(purchasingExpirationRanges.sortOrder);

  // multiplier = this product's own payout for that range (1 = 100%) -- the
  // same number shown on the Product Multipliers page.
  const map = new Map<string, { id: string; label: string; multiplier: number }[]>();
  for (const r of rows) {
    const list = map.get(r.productId) ?? [];
    list.push({ id: r.expirationRangeId, label: r.label, multiplier: r.multiplier });
    map.set(r.productId, list);
  }
  return map;
}

/** Every per-product multiplier override in the org, product name + range label joined in, for the standalone Product Multipliers list. */
export async function getAllProductMultipliersForOrg(organizationId: string) {
  return db
    .select({
      id: purchasingProductMultipliers.id,
      productId: purchasingProductMultipliers.productId,
      productName: purchasingProducts.name,
      expirationRangeId: purchasingProductMultipliers.expirationRangeId,
      expirationRangeLabel: purchasingExpirationRanges.label,
      expirationRangeSortOrder: purchasingExpirationRanges.sortOrder,
      multiplier: purchasingProductMultipliers.multiplier,
    })
    .from(purchasingProductMultipliers)
    .innerJoin(purchasingProducts, eq(purchasingProductMultipliers.productId, purchasingProducts.id))
    .innerJoin(purchasingExpirationRanges, eq(purchasingProductMultipliers.expirationRangeId, purchasingExpirationRanges.id))
    .where(eq(purchasingProductMultipliers.organizationId, organizationId))
    .orderBy(purchasingProducts.name, purchasingExpirationRanges.sortOrder);
}

/** One lookup map: `${productId}:${expirationRangeId}` -> multiplier, for the quotation line-item price calculator. */
export async function getAllProductMultipliersMap(organizationId: string) {
  const rows = await db
    .select({
      productId: purchasingProductMultipliers.productId,
      expirationRangeId: purchasingProductMultipliers.expirationRangeId,
      multiplier: purchasingProductMultipliers.multiplier,
    })
    .from(purchasingProductMultipliers)
    .where(eq(purchasingProductMultipliers.organizationId, organizationId));
  return new Map(rows.map((r) => [`${r.productId}:${r.expirationRangeId}`, r.multiplier]));
}

export async function getNextQuotationNumber(organizationId: string) {
  const today = new Date();
  const yy = String(today.getFullYear()).slice(2);
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const prefix = `REF-${yy}${mm}${dd}-`;

  const rows = await db
    .select({ quotationNumber: purchasingQuotations.quotationNumber })
    .from(purchasingQuotations)
    .where(eq(purchasingQuotations.organizationId, organizationId));

  const todaysSuffixes = rows
    .map((r) => r.quotationNumber)
    .filter((n) => n.startsWith(prefix))
    .map((n) => Number(n.slice(prefix.length)))
    .filter((n) => Number.isFinite(n));
  const next = todaysSuffixes.length ? Math.max(...todaysSuffixes) + 1 : 1;
  return `${prefix}${next}`;
}

export async function getPurchasingQuotations(organizationId: string, opts: { includeArchived?: boolean } = {}) {
  const rows = await db
    .select({
      id: purchasingQuotations.id,
      quotationNumber: purchasingQuotations.quotationNumber,
      quotationDate: purchasingQuotations.quotationDate,
      status: purchasingQuotations.status,
      customerNameSnapshot: purchasingQuotations.customerNameSnapshot,
      itemsTotal: purchasingQuotations.itemsTotal,
      bonusAmount: purchasingQuotations.bonusAmount,
      deductionEnabled: purchasingQuotations.deductionEnabled,
      deductionAmount: purchasingQuotations.deductionAmount,
      grandTotal: purchasingQuotations.grandTotal,
      trackingNumber: purchasingQuotations.trackingNumber,
      packageStatus: purchasingQuotations.packageStatus,
      archivedAt: purchasingQuotations.archivedAt,
      createdAt: purchasingQuotations.createdAt,
    })
    .from(purchasingQuotations)
    .where(eq(purchasingQuotations.organizationId, organizationId))
    .orderBy(desc(purchasingQuotations.createdAt));
  return opts.includeArchived ? rows : rows.filter((r) => !r.archivedAt);
}

/**
 * Everything the Quotation Summary table needs in one shot: the quotation
 * joined with its customer's *live* contact/address (not the frozen
 * snapshot columns) so a shipping address filled in after the quote was
 * given shows up immediately, plus a one-line "items quoted for" summary
 * built from the quoted items. Used by the redesigned
 * /dashboard/purchasing/quotations list page.
 */
export async function getPurchasingQuotationsSummary(organizationId: string, opts: { includeArchived?: boolean } = {}) {
  const rows = await db
    .select({
      id: purchasingQuotations.id,
      quotationNumber: purchasingQuotations.quotationNumber,
      quotationDate: purchasingQuotations.quotationDate,
      status: purchasingQuotations.status,
      grandTotal: purchasingQuotations.grandTotal,
      trackingNumber: purchasingQuotations.trackingNumber,
      labelStatus: purchasingQuotations.labelStatus,
      labelUrl: purchasingQuotations.labelUrl,
      archivedAt: purchasingQuotations.archivedAt,
      createdAt: purchasingQuotations.createdAt,
      source: purchasingQuotations.source,
      importedItemsText: purchasingQuotations.importedItemsText,
      importedShippingAddress: purchasingQuotations.importedShippingAddress,
      customerNameSnapshot: purchasingQuotations.customerNameSnapshot,
      customerEmailSnapshot: purchasingQuotations.customerEmailSnapshot,
      customerPhoneSnapshot: purchasingQuotations.customerPhoneSnapshot,
      customerId: purchasingCustomers.id,
      customerFirstName: purchasingCustomers.firstName,
      customerLastName: purchasingCustomers.lastName,
      customerEmail: purchasingCustomers.email,
      customerPhone: purchasingCustomers.phone,
      addressStreet1: purchasingCustomers.addressStreet1,
      addressCity: purchasingCustomers.addressCity,
      addressState: purchasingCustomers.addressState,
      addressZip: purchasingCustomers.addressZip,
    })
    .from(purchasingQuotations)
    .leftJoin(purchasingCustomers, eq(purchasingCustomers.id, purchasingQuotations.customerId))
    .where(eq(purchasingQuotations.organizationId, organizationId))
    .orderBy(desc(purchasingQuotations.createdAt));

  const visible = opts.includeArchived ? rows : rows.filter((r) => !r.archivedAt);

  const itemRows = await db
    .select({
      quotationId: purchasingQuotedItems.quotationId,
      productNameSnapshot: purchasingQuotedItems.productNameSnapshot,
      quantity: purchasingQuotedItems.quantity,
    })
    .from(purchasingQuotedItems)
    .innerJoin(purchasingQuotations, eq(purchasingQuotations.id, purchasingQuotedItems.quotationId))
    .where(eq(purchasingQuotations.organizationId, organizationId));

  // Which receipt PDFs exist (without loading the files themselves).
  const docRows = await db
    .select({
      quotationId: purchasingQuotationDocuments.quotationId,
      kind: purchasingQuotationDocuments.kind,
      filename: purchasingQuotationDocuments.filename,
      updatedAt: purchasingQuotationDocuments.updatedAt,
    })
    .from(purchasingQuotationDocuments)
    .where(eq(purchasingQuotationDocuments.organizationId, organizationId));
  const docsByQuotation = new Map<string, { uploaded?: string; generated?: string; uploadedIsImage?: boolean }>();
  for (const d of docRows) {
    const cur = docsByQuotation.get(d.quotationId) ?? {};
    if (d.kind === "UPLOADED") {
      cur.uploaded = d.updatedAt;
      cur.uploadedIsImage = !/\.pdf$/i.test(d.filename);
    }
    else cur.generated = d.updatedAt;
    docsByQuotation.set(d.quotationId, cur);
  }

  const itemsByQuotation = new Map<string, { productNameSnapshot: string; quantity: number }[]>();
  for (const item of itemRows) {
    const list = itemsByQuotation.get(item.quotationId) ?? [];
    list.push({ productNameSnapshot: item.productNameSnapshot, quantity: item.quantity });
    itemsByQuotation.set(item.quotationId, list);
  }

  const receivingByQuotation = await getReceivingStatusByQuotation(organizationId);

  return visible.map((r) => {
    const items = itemsByQuotation.get(r.id) ?? [];
    const docs = docsByQuotation.get(r.id);
    // "AUTO" = no PDF stored yet but the order has lines, so one is built the first time it is opened.
    const receipt: "UPLOADED" | "GENERATED" | "AUTO" | null = docs?.uploaded
      ? "UPLOADED"
      : docs?.generated
        ? "GENERATED"
        : items.length > 0
          ? "AUTO"
          : null;
    const receiptStamp = docs?.uploaded ?? docs?.generated ?? "";
    const itemsSummary =
      items.length === 0
        ? r.importedItemsText?.trim()
          ? r.importedItemsText.split(/\n+/).map((l) => l.trim()).filter(Boolean).join("; ")
          : "—"
        : items.map((i) => `${i.productNameSnapshot} (x${i.quantity})`).join(", ");
    const customerName = r.customerFirstName
      ? [r.customerFirstName, r.customerLastName].filter(Boolean).join(" ")
      : r.customerNameSnapshot;
    const email = r.customerEmail ?? r.customerEmailSnapshot;
    const phone = r.customerPhone ?? r.customerPhoneSnapshot;
    // Imported orders carry the full address exactly as it came in the file.
    const shippingInfo = r.importedShippingAddress
      ? r.importedShippingAddress
      : r.addressStreet1 && r.addressCity && r.addressState && r.addressZip
        ? `${r.addressCity}, ${r.addressState} ${r.addressZip}`
        : "Not provided";
    return {
      id: r.id,
      imported: r.source === "IMPORTED",
      receiving: receivingByQuotation.get(r.id) ?? null,
      receipt,
      receiptStamp,
      receiptIsImage: receipt === "UPLOADED" && !!docs?.uploadedIsImage,
      quotationNumber: r.quotationNumber,
      quotationDate: r.quotationDate,
      status: r.status,
      grandTotal: r.grandTotal,
      trackingNumber: r.trackingNumber,
      labelStatus: r.labelStatus,
      labelUrl: r.labelUrl,
      archivedAt: r.archivedAt,
      customerId: r.customerId,
      customerName,
      email,
      phone,
      shippingInfo,
      itemsSummary,
      itemCount: items.length,
    };
  });
}

export async function getPurchasingQuotationWithItems(organizationId: string, quotationId: string) {
  const [quotation] = await db
    .select()
    .from(purchasingQuotations)
    .where(and(eq(purchasingQuotations.id, quotationId), eq(purchasingQuotations.organizationId, organizationId)))
    .limit(1);
  if (!quotation) return null;

  const items = await db
    .select()
    .from(purchasingQuotedItems)
    .where(eq(purchasingQuotedItems.quotationId, quotationId))
    .orderBy(purchasingQuotedItems.createdAt);

  const customer = await getPurchasingCustomer(organizationId, quotation.customerId);

  return { quotation, items, customer };
}

export async function getPurchasingDashboardCounts(organizationId: string) {
  const [[customerCount], [productCount], [quotationCount], [activeQuotationCount]] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)` })
      .from(purchasingCustomers)
      .where(and(eq(purchasingCustomers.organizationId, organizationId), isNull(purchasingCustomers.archivedAt))),
    db
      .select({ count: sql<number>`count(*)` })
      .from(purchasingProducts)
      .where(and(eq(purchasingProducts.organizationId, organizationId), eq(purchasingProducts.active, true))),
    db
      .select({ count: sql<number>`count(*)` })
      .from(purchasingQuotations)
      .where(eq(purchasingQuotations.organizationId, organizationId)),
    db
      .select({ count: sql<number>`count(*)`, total: sql<number>`coalesce(sum(${purchasingQuotations.grandTotal}), 0)` })
      .from(purchasingQuotations)
      .where(
        and(
          eq(purchasingQuotations.organizationId, organizationId),
          isNull(purchasingQuotations.archivedAt),
          eq(purchasingQuotations.status, "QUOTED"),
        ),
      ),
  ]);
  return {
    customers: Number(customerCount?.count ?? 0),
    products: Number(productCount?.count ?? 0),
    quotations: Number(quotationCount?.count ?? 0),
    openQuotations: Number(activeQuotationCount?.count ?? 0),
    openQuotationsValue: Number((activeQuotationCount as { total?: number })?.total ?? 0),
  };
}

export async function getReceiptVersions(quotationId: string) {
  return db
    .select()
    .from(purchasingReceiptVersions)
    .where(eq(purchasingReceiptVersions.quotationId, quotationId))
    .orderBy(desc(purchasingReceiptVersions.version));
}

export async function getPurchasingAuditLog(organizationId: string, recordType?: string, recordId?: string) {
  const conds = [eq(purchasingAuditLog.organizationId, organizationId)];
  if (recordType) conds.push(eq(purchasingAuditLog.recordType, recordType));
  if (recordId) conds.push(eq(purchasingAuditLog.recordId, recordId));
  return db
    .select()
    .from(purchasingAuditLog)
    .where(and(...conds))
    .orderBy(desc(purchasingAuditLog.changedAt))
    .limit(200);
}

// The next three are org-wide, flattened versions of tables that only carry
// a quotationId/productId (not their own organizationId) -- joined back to
// something org-scoped so the Database page's raw-table view can filter by
// tenant like every other table there.

export async function getPurchasingQuotedItemsAll(organizationId: string) {
  return db
    .select({
      id: purchasingQuotedItems.id,
      quotationNumber: purchasingQuotations.quotationNumber,
      productNameSnapshot: purchasingQuotedItems.productNameSnapshot,
      conditionNameSnapshot: purchasingQuotedItems.conditionNameSnapshot,
      expirationRangeLabelSnapshot: purchasingQuotedItems.expirationRangeLabelSnapshot,
      quantity: purchasingQuotedItems.quantity,
      finalUnitPrice: purchasingQuotedItems.finalUnitPrice,
      lineTotal: purchasingQuotedItems.lineTotal,
      createdAt: purchasingQuotedItems.createdAt,
    })
    .from(purchasingQuotedItems)
    .innerJoin(purchasingQuotations, eq(purchasingQuotedItems.quotationId, purchasingQuotations.id))
    .where(eq(purchasingQuotations.organizationId, organizationId))
    .orderBy(desc(purchasingQuotedItems.createdAt));
}

export async function getPurchasingProductMultipliersAll(organizationId: string) {
  return db
    .select({
      id: purchasingProductMultipliers.id,
      productName: purchasingProducts.name,
      expirationRangeLabel: purchasingExpirationRanges.label,
      multiplier: purchasingProductMultipliers.multiplier,
    })
    .from(purchasingProductMultipliers)
    .innerJoin(purchasingProducts, eq(purchasingProductMultipliers.productId, purchasingProducts.id))
    .innerJoin(
      purchasingExpirationRanges,
      eq(purchasingProductMultipliers.expirationRangeId, purchasingExpirationRanges.id),
    )
    .where(eq(purchasingProductMultipliers.organizationId, organizationId));
}

export async function getPurchasingReceiptVersionsAll(organizationId: string) {
  return db
    .select({
      id: purchasingReceiptVersions.id,
      quotationNumber: purchasingQuotations.quotationNumber,
      version: purchasingReceiptVersions.version,
      generatedAt: purchasingReceiptVersions.generatedAt,
    })
    .from(purchasingReceiptVersions)
    .innerJoin(purchasingQuotations, eq(purchasingReceiptVersions.quotationId, purchasingQuotations.id))
    .where(eq(purchasingQuotations.organizationId, organizationId))
    .orderBy(desc(purchasingReceiptVersions.generatedAt));
}

export async function getReceivedItemsAll(organizationId: string) {
  return db
    .select({
      id: receivedItems.id,
      shipmentId: receivedItems.shipmentId,
      sellerName: sellers.name,
      orderReference: buybackOrders.orderReference,
      productName: products.name,
      conditionName: conditions.name,
      itemSource: receivedItems.itemSource,
      wasReceived: receivedItems.wasReceived,
      quantityReceived: receivedItems.quantityReceived,
      returnRequired: receivedItems.returnRequired,
      postedToInventory: receivedItems.postedToInventory,
      createdAt: receivedItems.createdAt,
    })
    .from(receivedItems)
    .innerJoin(receivingShipments, eq(receivedItems.shipmentId, receivingShipments.id))
    .innerJoin(buybackOrders, eq(receivingShipments.orderId, buybackOrders.id))
    .innerJoin(sellers, eq(buybackOrders.sellerId, sellers.id))
    .innerJoin(products, eq(receivedItems.productId, products.id))
    .innerJoin(conditions, eq(receivedItems.conditionId, conditions.id))
    .where(eq(receivingShipments.organizationId, organizationId))
    .orderBy(desc(receivedItems.createdAt));
}
