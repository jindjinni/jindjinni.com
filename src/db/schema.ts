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

/**
 * "Who the company is" -- one row per Organization, separate from the
 * `organizations` table so the lean tenancy anchor doesn't carry every
 * display/branding/contact field. `organizations.name` stays the single
 * source of truth for the Legal Business Name (set at signup); everything
 * else a quotation receipt or future document needs lives here: DBA,
 * logo, addresses, contact info, the Primary Contact person, optional
 * compliance IDs, and which of these a generated document is allowed to
 * show. The logo is stored as actual bytes (base64) + its content type,
 * not a browser object URL, so it's a permanent reference that survives
 * reloads and can be embedded verbatim in a receipt snapshot (see
 * purchasingReceiptVersions.snapshotJson) even if the profile changes later.
 */
export const businessProfiles = sqliteTable(
  "business_profiles",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .unique()
      .references(() => organizations.id, { onDelete: "cascade" }),

    dbaName: text("dba_name"),
    nameDisplayPreference: text("name_display_preference", { enum: ["legal", "dba", "both"] })
      .notNull()
      .default("legal"),

    logoData: text("logo_data"), // base64, no data: prefix
    logoContentType: text("logo_content_type"),
    logoUpdatedAt: text("logo_updated_at"),

    businessAddressStreet1: text("business_address_street1"),
    businessAddressStreet2: text("business_address_street2"),
    businessAddressCity: text("business_address_city"),
    businessAddressState: text("business_address_state"),
    businessAddressZip: text("business_address_zip"),
    businessAddressCountry: text("business_address_country").notNull().default("US"),

    shippingSameAsBusiness: integer("shipping_same_as_business", { mode: "boolean" }).notNull().default(true),
    shippingAddressStreet1: text("shipping_address_street1"),
    shippingAddressStreet2: text("shipping_address_street2"),
    shippingAddressCity: text("shipping_address_city"),
    shippingAddressState: text("shipping_address_state"),
    shippingAddressZip: text("shipping_address_zip"),
    shippingAddressCountry: text("shipping_address_country").notNull().default("US"),

    businessPhone: text("business_phone"),
    businessEmail: text("business_email"),
    website: text("website"),

    primaryContactFirstName: text("primary_contact_first_name"),
    primaryContactLastName: text("primary_contact_last_name"),
    primaryContactTitle: text("primary_contact_title"),
    primaryContactEmail: text("primary_contact_email"),
    primaryContactPhone: text("primary_contact_phone"),

    taxId: text("tax_id"),
    businessRegistrationNumber: text("business_registration_number"),

    // Document Display Settings -- what a generated quotation receipt (and
    // later documents) is allowed to pull from this profile.
    docShowLogo: integer("doc_show_logo", { mode: "boolean" }).notNull().default(true),
    docShowLegalName: integer("doc_show_legal_name", { mode: "boolean" }).notNull().default(true),
    docShowDba: integer("doc_show_dba", { mode: "boolean" }).notNull().default(true),
    docShowAddress: integer("doc_show_address", { mode: "boolean" }).notNull().default(true),
    docShowPhone: integer("doc_show_phone", { mode: "boolean" }).notNull().default(true),
    docShowEmail: integer("doc_show_email", { mode: "boolean" }).notNull().default(true),
    docShowWebsite: integer("doc_show_website", { mode: "boolean" }).notNull().default(false),

    ...timestamps,
  },
  (t) => [uniqueIndex("business_profiles_org_idx").on(t.organizationId)],
);

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

/**
 * Short-lived codes emailed during signup to prove the account email is
 * real and reachable -- created and checked BEFORE any User/Organization
 * row exists, so a wrong/abandoned code never leaves a half-created
 * account behind. Keyed by the email itself (no user id yet). A row is
 * consumed (consumedAt set) the moment its code is accepted; expired or
 * never-consumed rows are harmless leftovers nothing else reads.
 */
export const signupEmailVerifications = sqliteTable(
  "signup_email_verifications",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    codeHash: text("code_hash").notNull(),
    expiresAt: text("expires_at").notNull(),
    attempts: integer("attempts").notNull().default(0),
    consumedAt: text("consumed_at"),
    ...timestamps,
  },
  (t) => [index("signup_email_verifications_email_idx").on(t.email)],
);

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
// Purchasing department -- Phase 1. A fresh, separate module from Buyback
// above (by design -- see chat): its own Customers, its own unified Product
// catalog, its own editable Categories / Conditions / Expiration Ranges /
// Product Multipliers / Bonus Tiers, and its own Quotations (which double as
// the framework's "Overall Order" -- one record, not two, per that
// document's own stated flexibility). Every price-bearing field on a
// line item is a frozen historical snapshot: later edits to the product
// catalog, a multiplier, or a bonus tier must never change what an existing
// quotation says it already quoted. Permissions reuse the same
// owner/admin/staff roles as the rest of the app: staff = Purchasing Agent,
// admin = Purchasing Manager, owner = Master Admin.
// ---------------------------------------------------------------------------

/** The person selling items to the business -- Purchasing's own contact record (kept separate from `sellers`, which Buyback owns). */
export const purchasingCustomers = sqliteTable(
  "purchasing_customers",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name"),
    customerReferenceNumber: text("customer_reference_number"),
    email: text("email"),
    phone: text("phone"),
    addressStreet1: text("address_street1"),
    addressStreet2: text("address_street2"),
    addressCity: text("address_city"),
    addressState: text("address_state"),
    addressZip: text("address_zip"),
    addressCountry: text("address_country").notNull().default("US"),
    isResidential: integer("is_residential", { mode: "boolean" }).notNull().default(true),
    notes: text("notes"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    archivedAt: text("archived_at"),
    ...timestamps,
  },
  (t) => [index("purchasing_customers_org_idx").on(t.organizationId)],
);

/** Brand/category grouping for the Purchasing product catalog -- editable, never hardcoded (e.g. Dexcom, Omnipod, Freestyle...). */
export const purchasingCategories = sqliteTable(
  "purchasing_categories",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    ...timestamps,
  },
  (t) => [index("purchasing_categories_org_idx").on(t.organizationId)],
);

/**
 * One unified Purchasing product catalog (deliberately not split into a
 * second "Quotation Products" table the way the legacy reference app did --
 * see chat). standardPrice is the base price a Quoted Item's unit price is
 * computed from, before any expiration/condition multiplier is applied.
 */
export const purchasingProducts = sqliteTable(
  "purchasing_products",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    categoryId: text("category_id").references(() => purchasingCategories.id),
    name: text("name").notNull(),
    productCode: text("product_code"),
    standardPrice: real("standard_price").notNull().default(0),
    notes: text("notes"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    archivedAt: text("archived_at"),
    ...timestamps,
  },
  (t) => [index("purchasing_products_org_idx").on(t.organizationId)],
);

/** Purchasing's own grading scale -- separate from the Inventory/Buyback `conditions` table so it can carry its own optional price multiplier. */
export const purchasingConditions = sqliteTable(
  "purchasing_conditions",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    multiplier: real("multiplier").notNull().default(1),
    sortOrder: integer("sort_order").notNull().default(0),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    ...timestamps,
  },
  (t) => [index("purchasing_conditions_org_idx").on(t.organizationId)],
);

/**
 * Which conditions a product "carries" -- shown on the product's own Conditions
 * section and, once a product has at least one row here, the only conditions
 * offered for that product on a quoted line (falls back to the full active
 * list for a product with none assigned yet, so nothing already in use
 * breaks). Pure membership, no per-product multiplier: a condition's payout
 * is the same wherever it's used, per chat -- Mint pays 100% everywhere,
 * Ding pays its set % everywhere. That's what makes this a join table
 * instead of a second purchasing_product_multipliers-style override table.
 */
export const purchasingProductConditions = sqliteTable(
  "purchasing_product_conditions",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => purchasingProducts.id, { onDelete: "cascade" }),
    conditionId: text("condition_id")
      .notNull()
      .references(() => purchasingConditions.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [
    index("purchasing_product_conditions_org_idx").on(t.organizationId),
    uniqueIndex("purchasing_product_conditions_product_condition_unique").on(t.productId, t.conditionId),
  ],
);

/** Selectable expiry buckets (e.g. "7+ months") used on a quoted line and keyed into Product Multipliers -- not a typed/raw date. */
export const purchasingExpirationRanges = sqliteTable(
  "purchasing_expiration_ranges",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    minMonths: integer("min_months"),
    maxMonths: integer("max_months"),
    // Applied to EVERY product at this range unless that product has its
    // own row in purchasing_product_multipliers, which wins when present
    // (see computeQuotedItemPrice-equivalent logic in actions/purchasing.ts).
    // This is what makes a brand-new range price correctly right away,
    // instead of defaulting to full price until someone configures every
    // product one at a time.
    defaultMultiplier: real("default_multiplier").notNull().default(1),
    sortOrder: integer("sort_order").notNull().default(0),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    ...timestamps,
  },
  (t) => [index("purchasing_expiration_ranges_org_idx").on(t.organizationId)],
);

/**
 * Final Unit Price = Product.standardPrice × ProductMultiplier(product,
 * expirationRange). A product's allowed expiration ranges are simply
 * whichever ranges it has a multiplier row for -- no separate "allowed
 * ranges" table needed.
 */
export const purchasingProductMultipliers = sqliteTable(
  "purchasing_product_multipliers",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => purchasingProducts.id, { onDelete: "cascade" }),
    expirationRangeId: text("expiration_range_id")
      .notNull()
      .references(() => purchasingExpirationRanges.id, { onDelete: "cascade" }),
    multiplier: real("multiplier").notNull().default(1),
    ...timestamps,
  },
  (t) => [
    index("purchasing_multipliers_org_idx").on(t.organizationId),
    uniqueIndex("purchasing_multipliers_product_range_unique").on(t.productId, t.expirationRangeId),
  ],
);

/** Automatic tiered bonus engine -- threshold reached -> flat bonus added. Separate from, and additive to, a quotation's manual deduction. */
export const purchasingBonusTiers = sqliteTable(
  "purchasing_bonus_tiers",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    thresholdAmount: real("threshold_amount").notNull(),
    bonusAmount: real("bonus_amount").notNull(),
    // Free-text, shown on the Bonus Management list (e.g. "Get $50 bonus for
    // orders over $2000+") -- purely descriptive, never parsed. Nothing
    // enforces it matches thresholdAmount/bonusAmount; that's on whoever
    // edits the tier, same as the reference tool this was ported from.
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    ...timestamps,
  },
  (t) => [index("purchasing_bonus_tiers_org_idx").on(t.organizationId)],
);

/**
 * A quotation IS the "Overall Order" the framework describes -- one record,
 * not two (the framework explicitly allows this). customer*Snapshot fields
 * freeze the customer's contact details as of quote time, independent of
 * `purchasingCustomers`, so a later edit to the customer record never
 * silently rewrites a historical receipt.
 */
export const purchasingQuotations = sqliteTable(
  "purchasing_quotations",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    quotationNumber: text("quotation_number").notNull(),
    customerId: text("customer_id")
      .notNull()
      .references(() => purchasingCustomers.id),
    customerNameSnapshot: text("customer_name_snapshot").notNull(),
    customerEmailSnapshot: text("customer_email_snapshot"),
    customerPhoneSnapshot: text("customer_phone_snapshot"),
    quotationDate: text("quotation_date").notNull(),
    status: text("status", {
      enum: ["QUOTED", "CONFIRMED", "RECEIVED", "CANCELLED"],
    })
      .notNull()
      .default("QUOTED"),
    itemsTotal: real("items_total").notNull().default(0),
    bonusAmount: real("bonus_amount").notNull().default(0),
    bonusTierLabelSnapshot: text("bonus_tier_label_snapshot"),
    deductionEnabled: integer("deduction_enabled", { mode: "boolean" }).notNull().default(false),
    deductionAmount: real("deduction_amount").notNull().default(0),
    deductionReason: text("deduction_reason"),
    returnLabelCost: real("return_label_cost").notNull().default(0),
    grandTotal: real("grand_total").notNull().default(0),
    carrier: text("carrier", { enum: ["UPS", "USPS", "FedEx", "Other"] }),
    trackingNumber: text("tracking_number"),
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
    lastTrackingUpdate: text("last_tracking_update"),
    deliveredAt: text("delivered_at"),
    // Outbound Shippo label -- which service/parcel to assume and the result
    // once purchased. Nothing here is set until "Generate shipping label"
    // succeeds -- see generatePurchasingShippingLabel in actions/purchasing.ts.
    // On success this also fills in carrier/trackingNumber above so the
    // Quotation Summary table's Tracking # column picks it up automatically.
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
    createdByUserId: text("created_by_user_id").references(() => users.id),
    archivedAt: text("archived_at"),
    ...timestamps,
  },
  (t) => [
    index("purchasing_quotations_org_idx").on(t.organizationId),
    uniqueIndex("purchasing_quotations_org_number_unique").on(t.organizationId, t.quotationNumber),
  ],
);

/** One quoted line. Every price field is a frozen snapshot at the moment it was added -- never recomputed from a later catalog/multiplier change. */
export const purchasingQuotedItems = sqliteTable(
  "purchasing_quoted_items",
  {
    id: text("id").primaryKey(),
    quotationId: text("quotation_id")
      .notNull()
      .references(() => purchasingQuotations.id, { onDelete: "cascade" }),
    productId: text("product_id").references(() => purchasingProducts.id),
    productNameSnapshot: text("product_name_snapshot").notNull(),
    productCodeSnapshot: text("product_code_snapshot"),
    categoryNameSnapshot: text("category_name_snapshot"),
    conditionId: text("condition_id").references(() => purchasingConditions.id),
    conditionNameSnapshot: text("condition_name_snapshot"),
    expirationRangeId: text("expiration_range_id").references(() => purchasingExpirationRanges.id),
    expirationRangeLabelSnapshot: text("expiration_range_label_snapshot"),
    quantity: integer("quantity").notNull(),
    baseUnitPrice: real("base_unit_price").notNull().default(0),
    appliedMultiplier: real("applied_multiplier").notNull().default(1),
    conditionMultiplier: real("condition_multiplier").notNull().default(1),
    finalUnitPrice: real("final_unit_price").notNull().default(0),
    lineTotal: real("line_total").notNull().default(0),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [index("purchasing_quoted_items_quotation_idx").on(t.quotationId)],
);

/** A frozen copy of a quotation's totals/lines each time its receipt is (re)generated, so an old printed receipt never silently changes. */
export const purchasingReceiptVersions = sqliteTable(
  "purchasing_receipt_versions",
  {
    id: text("id").primaryKey(),
    quotationId: text("quotation_id")
      .notNull()
      .references(() => purchasingQuotations.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    generatedAt: text("generated_at").notNull(),
    generatedByUserId: text("generated_by_user_id").references(() => users.id),
    snapshotJson: text("snapshot_json").notNull(),
    ...timestamps,
  },
  (t) => [index("purchasing_receipt_versions_quotation_idx").on(t.quotationId)],
);

/**
 * One row per org -- every piece of wording on the printed/exported
 * quotation receipt that isn't per-quotation data (banner, disclaimer,
 * mint-condition policy, payment-timing note, footer thank-you). Every
 * column is nullable; a null column means "use the built-in default
 * text" (see resolvePurchasingReceiptSettings), so a brand-new org's
 * receipt looks exactly like it did before this was customizable, and an
 * org only needs to set the fields it actually wants to change.
 */
export const purchasingReceiptSettings = sqliteTable(
  "purchasing_receipt_settings",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .unique()
      .references(() => organizations.id, { onDelete: "cascade" }),

    bannerText: text("banner_text"),
    shippingSuffix: text("shipping_suffix"),

    disclaimerIntro: text("disclaimer_intro"),
    disclaimerReturnPolicy: text("disclaimer_return_policy"),
    disclaimerDamageSummary: text("disclaimer_damage_summary"),

    conditionHeading: text("condition_heading"),
    // Newline-separated bullet list -- kept as one text column rather than
    // a child table since it's short, always edited as a whole block, and
    // never queried/filtered on its own.
    conditionBullets: text("condition_bullets"),

    paymentTimingText: text("payment_timing_text"),
    paymentTimingSubtext: text("payment_timing_subtext"),

    footerThankYou: text("footer_thank_you"),

    ...timestamps,
  },
  (t) => [index("purchasing_receipt_settings_org_idx").on(t.organizationId)],
);

/** Generic audit trail for Purchasing edits that matter: prices, quantities, totals, tracking numbers, customer info, product rules, multipliers. */
export const purchasingAuditLog = sqliteTable(
  "purchasing_audit_log",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id),
    recordType: text("record_type").notNull(),
    recordId: text("record_id").notNull(),
    fieldName: text("field_name").notNull(),
    previousValue: text("previous_value"),
    newValue: text("new_value"),
    note: text("note"),
    changedAt: text("changed_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (t) => [
    index("purchasing_audit_log_org_idx").on(t.organizationId),
    index("purchasing_audit_log_record_idx").on(t.recordType, t.recordId),
  ],
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
