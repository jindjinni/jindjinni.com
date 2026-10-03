// Multi-tenant data model.
//
// The one rule every table below follows: every business record belongs to
// exactly one Organization (organizationId), with no exceptions. Every query
// the app makes must filter by the signed-in user's organization — that is
// what keeps 50 different companies' data from ever touching each other on
// the same app. See src/lib/tenant.ts for the helper that enforces this.

import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  real,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(current_timestamp)`),
};

// ---------------------------------------------------------------------------
// Tenancy & auth
// ---------------------------------------------------------------------------

/** The tenant. Every paying (or trialing) company is one row here. */
export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  plan: text("plan", { enum: ["trial", "starter", "pro"] })
    .notNull()
    .default("trial"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionStatus: text("stripe_subscription_status"),
  // "Ship from" details used on every outbound shipping label this org
  // generates (e.g. a free return/buyback label sent to a seller). Edited
  // from Settings -> Business; left null until the admin fills it in, which
  // is what gates label generation (see generateShippingLabel).
  shipFromName: text("ship_from_name"),
  shipFromCompany: text("ship_from_company"),
  shipFromStreet1: text("ship_from_street1"),
  shipFromStreet2: text("ship_from_street2"),
  shipFromCity: text("ship_from_city"),
  shipFromState: text("ship_from_state"),
  shipFromZip: text("ship_from_zip"),
  shipFromCountry: text("ship_from_country").notNull().default("US"),
  shipFromPhone: text("ship_from_phone"),
  shipFromEmail: text("ship_from_email"),
  ...timestamps,
});

/** A person who can sign in. Can belong to more than one Organization. */
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  passwordHash: text("password_hash"),
  emailVerified: text("email_verified"),
  image: text("image"),
  ...timestamps,
});

/** Which organization(s) a user belongs to, and with what role. */
export const memberships = sqliteTable(
  "memberships",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["owner", "admin", "staff"] })
      .notNull()
      .default("staff"),
    ...timestamps,
  },
  (t) => [uniqueIndex("membership_user_org_unique").on(t.userId, t.organizationId)],
);

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

/**
 * Per-organization, not hardcoded. This business uses Mint / Dinged /
 * Damaged; a refurbished-electronics reseller might use Grade A / B / C.
 * Each org configures its own list from Settings.
 */
export const conditions = sqliteTable(
  "conditions",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("conditions_org_idx").on(t.organizationId)],
);

export const products = sqliteTable(
  "products",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sku: text("sku"),
    basePrice: real("base_price").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("products_org_idx").on(t.organizationId)],
);

export const buyers = sqliteTable(
  "buyers",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    companyName: text("company_name").notNull(),
    contactName: text("contact_name"),
    email: text("email"),
    phone: text("phone"),
    billingAddress: text("billing_address"),
    shippingAddress: text("shipping_address"),
    ...timestamps,
  },
  (t) => [index("buyers_org_idx").on(t.organizationId)],
);

// ---------------------------------------------------------------------------
// Inventory — ledger-based, same design proven out in the Airtable base
// ---------------------------------------------------------------------------

export const inventoryReceipts = sqliteTable(
  "inventory_receipts",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    conditionId: text("condition_id")
      .notNull()
      .references(() => conditions.id),
    quantityReceived: integer("quantity_received").notNull(),
    expirationDate: text("expiration_date"),
    expirationRangeStart: text("expiration_range_start"),
    expirationRangeEnd: text("expiration_range_end"),
    posted: integer("posted", { mode: "boolean" }).notNull().default(false),
    ...timestamps,
  },
  (t) => [index("receipts_org_idx").on(t.organizationId)],
);

/**
 * The ledger. Append-only — never edited, only added to. This is the single
 * source of truth for on-hand quantity; Product on-hand numbers are always a
 * derived rollup off this table, never a number typed by a person.
 */
export const inventoryTransactions = sqliteTable(
  "inventory_transactions",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    conditionId: text("condition_id")
      .notNull()
      .references(() => conditions.id),
    quantityChange: integer("quantity_change").notNull(), // positive or negative
    type: text("type", {
      enum: ["RECEIVED", "INVOICE_OUT", "RETURN", "CORRECTION"],
    }).notNull(),
    inventoryReceiptId: text("inventory_receipt_id").references(
      () => inventoryReceipts.id,
    ),
    invoiceLineItemId: text("invoice_line_item_id"),
    receivedItemId: text("received_item_id"),
    note: text("note"),
    ...timestamps,
  },
  (t) => [
    index("txn_org_idx").on(t.organizationId),
    index("txn_product_idx").on(t.productId),
  ],
);

// ---------------------------------------------------------------------------
// Buyback / receiving -- ported from the "USA Test Strips Center / Plantarz
// Medical Exchange - Receiving" Airtable base. Mirrors that base's workflow
// (customer gets quoted -> ships items in -> staff verify the package
// against the quote -> Accounts decides pay/adjust/return) but feeds
// verified items into the SAME inventory_transactions ledger the
// invoicing side already uses, instead of a separate inventory log --
// this is what makes receiving and invoicing one system instead of two.
//
// Deferred from this pass (see chat): live carrier tracking (Shippo),
// automatic customer emails/texts, photo attachments, multi-lot
// expiration batches per line, and categorized discrepancy tagging --
// all noted as follow-ups rather than modeled here yet.
// ---------------------------------------------------------------------------

/** The person/company sending items in to be bought back -- distinct from a Buyer (who buys FROM the org). */
export const sellers = sqliteTable(
  "sellers",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    // Legacy free-text address -- kept for any existing data/notes. New
    // structured fields below are what a generated Shippo label actually
    // reads from; both can coexist, but the structured ones are required
    // for "Generate shipping label" to work.
    shippingAddress: text("shipping_address"),
    addressStreet1: text("address_street1"),
    addressStreet2: text("address_street2"),
    addressCity: text("address_city"),
    addressState: text("address_state"),
    addressZip: text("address_zip"),
    addressCountry: text("address_country").notNull().default("US"),
    isResidential: integer("is_residential", { mode: "boolean" }).notNull().default(true),
    ...timestamps,
  },
  (t) => [index("sellers_org_idx").on(t.organizationId)],
);

/** The quote given to a seller for items they're about to ship in. */
export const buybackOrders = sqliteTable(
  "buyback_orders",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    sellerId: text("seller_id")
      .notNull()
      .references(() => sellers.id),
    orderReference: text("order_reference"),
    orderDate: text("order_date"),
    trackingNumber: text("tracking_number"),
    carrier: text("carrier", { enum: ["UPS", "USPS", "FedEx", "Other"] }),
    packageStatus: text("package_status", {
      enum: [
        "Pre-Transit",
        "In Transit",
        "Out for Delivery",
        "Delivered",
        "Exception",
        "Returned",
        "Unknown",
      ],
    })
      .notNull()
      .default("Pre-Transit"),
    quotedTotal: real("quoted_total").notNull().default(0),
    // Order-level adjustment -- matches the reference quotation tool's
    // "Bonus/Additional items" section. When enabled, deductionAmount is
    // subtracted from the items total to get the grand total.
    adjustmentEnabled: integer("adjustment_enabled", { mode: "boolean" }).notNull().default(false),
    deductionAmount: real("deduction_amount").notNull().default(0),
    // Outbound label: which service to buy, the parcel to assume, and the
    // result once generated. Nothing here is set until "Generate shipping
    // label" succeeds -- see generateShippingLabel in actions/buyback.ts.
    labelCarrier: text("label_carrier", { enum: ["UPS_GROUND", "USPS_GROUND"] })
      .notNull()
      .default("UPS_GROUND"),
    parcelLengthIn: real("parcel_length_in").notNull().default(10),
    parcelWidthIn: real("parcel_width_in").notNull().default(10),
    parcelHeightIn: real("parcel_height_in").notNull().default(10),
    parcelWeightLb: real("parcel_weight_lb").notNull().default(3),
    labelStatus: text("label_status", { enum: ["NOT_GENERATED", "GENERATED", "ERROR"] })
      .notNull()
      .default("NOT_GENERATED"),
    shippoShipmentId: text("shippo_shipment_id"),
    shippoRateId: text("shippo_rate_id"),
    shippoTransactionId: text("shippo_transaction_id"),
    labelUrl: text("label_url"),
    labelTrackingNumber: text("label_tracking_number"),
    labelTrackingUrl: text("label_tracking_url"),
    labelError: text("label_error"),
    labelGeneratedAt: text("label_generated_at"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [index("buyback_orders_org_idx").on(t.organizationId)],
);

/** One quoted line on a buyback order -- what we told the seller we'd pay for. */
export const buybackOrderItems = sqliteTable(
  "buyback_order_items",
  {
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => buybackOrders.id, { onDelete: "cascade" }),
    productId: text("product_id").references(() => products.id),
    conditionId: text("condition_id").references(() => conditions.id),
    lineLabel: text("line_label").notNull(),
    productCodeVariant: text("product_code_variant"),
    expirationDate: text("expiration_date"),
    quotedQuantity: integer("quoted_quantity").notNull(),
    quotedUnitPrice: real("quoted_unit_price").notNull().default(0),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [index("buyback_order_items_order_idx").on(t.orderId)],
);

/** One incoming package being physically verified against its order's quote. */
export const receivingShipments = sqliteTable(
  "receiving_shipments",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    orderId: text("order_id")
      .notNull()
      .references(() => buybackOrders.id),
    receivedByUserId: text("received_by_user_id").references(() => users.id),
    receivedAt: text("received_at"),
    receivingStatus: text("receiving_status", {
      enum: ["IN_PROGRESS", "COMPLETE", "COMPLETE_WITH_DISCREPANCY"],
    })
      .notNull()
      .default("IN_PROGRESS"),
    packagingCondition: text("packaging_condition", {
      enum: ["ACCEPTABLE", "NOT_ACCEPTABLE"],
    }),
    packagingIssueNotes: text("packaging_issue_notes"),
    quantityMatchesQuoted: text("quantity_matches_quoted", { enum: ["YES", "NO"] }),
    adjustmentNeeded: integer("adjustment_needed", { mode: "boolean" })
      .notNull()
      .default(false),
    adjustmentDetails: text("adjustment_details"),
    adjustedTotal: real("adjusted_total"),
    accountsDecision: text("accounts_decision", {
      enum: [
        "NEEDS_REVIEW",
        "NEEDS_ADJUSTED_QUOTE",
        "NEEDS_RETURN",
        "NEEDS_PAYMENT",
        "PAID",
      ],
    })
      .notNull()
      .default("NEEDS_REVIEW"),
    accountsStatus: text("accounts_status", { enum: ["IN_REVIEW", "PAID"] })
      .notNull()
      .default("IN_REVIEW"),
    paidAt: text("paid_at"),
    customerNotified: integer("customer_notified", { mode: "boolean" })
      .notNull()
      .default(false),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    index("receiving_shipments_org_idx").on(t.organizationId),
    index("receiving_shipments_order_idx").on(t.orderId),
  ],
);

/**
 * One row per product verified during receiving -- whether it was quoted or
 * arrived unquoted ("extra"), same distinction the Airtable base made.
 * Marking a shipment Complete posts each not-yet-posted row here into
 * inventory_transactions (type RECEIVED), the same ledger the manual
 * "receive stock" form and invoices' finalize step already write to.
 */
export const receivedItems = sqliteTable(
  "received_items",
  {
    id: text("id").primaryKey(),
    shipmentId: text("shipment_id")
      .notNull()
      .references(() => receivingShipments.id, { onDelete: "cascade" }),
    quotedItemId: text("quoted_item_id").references(() => buybackOrderItems.id),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    conditionId: text("condition_id")
      .notNull()
      .references(() => conditions.id),
    itemSource: text("item_source", { enum: ["QUOTED", "EXTRA"] })
      .notNull()
      .default("QUOTED"),
    wasReceived: text("was_received", { enum: ["YES", "NO", "PARTIAL"] })
      .notNull()
      .default("YES"),
    quantityReceived: integer("quantity_received").notNull().default(0),
    expirationDate: text("expiration_date"),
    expirationRangeStart: text("expiration_range_start"),
    expirationRangeEnd: text("expiration_range_end"),
    discrepancyNotes: text("discrepancy_notes"),
    returnRequired: integer("return_required", { mode: "boolean" })
      .notNull()
      .default(false),
    quantityToBeReturned: integer("quantity_to_be_returned").notNull().default(0),
    returnStatus: text("return_status", {
      enum: ["NOT_APPLICABLE", "RETURN_REQUESTED", "RETURN_SHIPPED", "RETURNED"],
    })
      .notNull()
      .default("NOT_APPLICABLE"),
    returnTrackingNumber: text("return_tracking_number"),
    returnNotes: text("return_notes"),
    postedToInventory: integer("posted_to_inventory", { mode: "boolean" })
      .notNull()
      .default(false),
    ...timestamps,
  },
  (t) => [index("received_items_shipment_idx").on(t.shipmentId)],
);

// ---------------------------------------------------------------------------
// Invoicing
// ---------------------------------------------------------------------------

export const invoices = sqliteTable(
  "invoices",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    buyerId: text("buyer_id").references(() => buyers.id),
    invoiceNumber: text("invoice_number"),
    invoiceSequence: integer("invoice_sequence").notNull(),
    status: text("status", { enum: ["DRAFT", "FINALIZED", "VOID"] })
      .notNull()
      .default("DRAFT"),
    invoiceDate: text("invoice_date"),
    dueDate: text("due_date"),
    billFromCompany: text("bill_from_company"),
    billFromAddress: text("bill_from_address"),
    subtotal: real("subtotal").notNull().default(0),
    total: real("total").notNull().default(0),
    inventoryPosted: integer("inventory_posted", { mode: "boolean" })
      .notNull()
      .default(false),
    duplicatedFromInvoiceId: text("duplicated_from_invoice_id"),
    ...timestamps,
  },
  (t) => [
    index("invoices_org_idx").on(t.organizationId),
    uniqueIndex("invoices_org_sequence_unique").on(
      t.organizationId,
      t.invoiceSequence,
    ),
  ],
);

export const invoiceLineItems = sqliteTable(
  "invoice_line_items",
  {
    id: text("id").primaryKey(),
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    conditionId: text("condition_id")
      .notNull()
      .references(() => conditions.id),
    quantity: integer("quantity").notNull(),
    unitPrice: real("unit_price").notNull(),
    expirationDate: text("expiration_date"),
    expirationRangeStart: text("expiration_range_start"),
    expirationRangeEnd: text("expiration_range_end"),
    lineStatus: text("line_status", { enum: ["Active", "Removed"] })
      .notNull()
      .default("Active"),
    previousPostedQuantity: integer("previous_posted_quantity")
      .notNull()
      .default(0),
    ...timestamps,
  },
  (t) => [index("line_items_invoice_idx").on(t.invoiceId)],
);
