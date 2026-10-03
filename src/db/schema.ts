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
    note: text("note"),
    ...timestamps,
  },
  (t) => [
    index("txn_org_idx").on(t.organizationId),
    index("txn_product_idx").on(t.productId),
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
