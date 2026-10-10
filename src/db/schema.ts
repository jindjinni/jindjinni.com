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
  primaryKey,
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
  // Each department's color theme as JSON, e.g. {"purchasing":"blue"} (see lib/theme.ts).
  // null = every department uses its own default color. Nullable on purpose.
  departmentThemes: text("department_themes"),
  // Each department's sidebar menu as JSON: the order of its tabs and any names the company changed
  // (see lib/sidebar-menu.ts). null = every department shows its original menu. Nullable on purpose.
  sidebarMenus: text("sidebar_menus"),
  // Team-size cap. null = use the default for this company (see lib/seats.ts);
  // -1 = unlimited; any other number = that many people (active members +
  // pending invitations). Nullable on purpose -- never NOT NULL on a table
  // that already has rows (see the note on drizzle-kit in scripts/safe-push.ts).
  seatLimit: integer("seat_limit"),
  // Closing the company (Settings -> Close company). closedAt set = everyone
  // is locked out; the owner can restore until purgeAfter (30 days later),
  // after which the nightly clean-up deletes the company's data for good.
  // All nullable -- same drizzle-kit rule as seatLimit above.
  closedAt: text("closed_at"),
  closedByUserId: text("closed_by_user_id"),
  purgeAfter: text("purge_after"),
  // Which version of the platform's shared default catalog this company has
  // received (see platformCatalogTemplates). null = never. Plain nullable
  // integer on purpose -- same drizzle-kit rule as seatLimit above.
  catalogTemplateVersion: integer("catalog_template_version"),
  // Platform approval of a NEW company (see lib/business-verification.ts). null = approved (every company that existed before
  // approval was introduced); "pending" = signed up, waiting for the platform owner; "rejected" = turned down or suspended.
  // Plain nullable text on purpose -- same drizzle-kit rule as seatLimit above.
  approvalStatus: text("approval_status"),
  approvalReason: text("approval_reason"),
  approvalDecidedAt: text("approval_decided_at"),
  // The plan picked at sign-up ("monthly" or "yearly"); billing is not live yet, so nothing is charged. Empty = none chosen.
  billingPlan: text("billing_plan"),
  // Payment standing, set by billing once it is live: "current", "grace" (a failed payment, with a 3-day grace period) or "past_due"
  // (suspended until paid). Empty = billing has not started for this company.
  // The 7-day free trial, as billing-calendar days ("YYYY-MM-DD", see lib/billing-schedule.ts). It starts the day the company is
  // approved; firstBillableOn is the first paid day (the first charge happens that day once billing is live). Empty = not approved yet.
  trialStartsOn: text("trial_starts_on"),
  firstBillableOn: text("first_billable_on"),
  // Plan cancellation (see lib/cancellation.ts): the day the owner cancelled, the last day of service, and the refund the policy
  // works out (whole cents; the money itself is paid out by billing once it is live). All empty = not cancelled.
  cancelRequestedOn: text("cancel_requested_on"),
  serviceEndsOn: text("service_ends_on"),
  cancelRefundCents: integer("cancel_refund_cents"),
  paymentStatus: text("payment_status"),
  paymentGraceEndsAt: text("payment_grace_ends_at"),
  lastPaymentAt: text("last_payment_at"),
  // The company's short, permanent reference (e.g. "JJ-1042"), handed out once (see lib/company-code.ts). Shown on every support ticket
  // and in the Companies panel so the platform owner always knows which company is calling. Empty until first needed.
  companyCode: text("company_code"),
  // How the company operates: "WHOLESALER" | "DISTRIBUTOR" | "BOTH" (see lib/operation-type.ts). Asked at sign-up; null = a company that
  // existed before the question (not answered yet -- never guessed). Plain nullable text on purpose -- same drizzle-kit rule as seatLimit.
  operationType: text("operation_type"),
  // The two operation sides (see lib/operations-rules.ts). Each is the day-and-time the company switched that side on; empty = off. Both are
  // free and can be switched on or off by the owner or an admin at any time. `operationsChosenAt` empty = the company has not confirmed its
  // sides yet (then the old `operationType` answer decides, and with no answer both sides count as on, so nothing is ever hidden).
  wholesaleActiveAt: text("wholesale_active_at"),
  distributionActiveAt: text("distribution_active_at"),
  operationsChosenAt: text("operations_chosen_at"),
  operationsChosenBy: text("operations_chosen_by"),
  // Separate operations under one company (see lib/operation-groups-rules.ts). An operation is its own workspace: its own organization row, so
  // every query already scoped by organizationId keeps its customers, suppliers, products, orders, stock, money and connections apart from
  // the other operation's. `operationKind` says which one this workspace is ("wholesale" | "distribution"; null = a company that has not
  // chosen yet). `parentOrganizationId` points at the company's main row (the one that holds the verification, plan, approval and closing);
  // null = this row is the main one. Both plain nullable text on purpose -- same drizzle-kit rule as seatLimit.
  operationKind: text("operation_kind"),
  parentOrganizationId: text("parent_organization_id"),
  // Day-and-time an owner or admin switched on "show every tab" for this operation (see lib/operation-tabs-rules.ts). Empty = the menu hides
  // the tabs that only belong to the other operation's way of working. Plain nullable text on purpose -- same drizzle-kit rule as seatLimit.
  allTabsShownAt: text("all_tabs_shown_at"),
  // The price book this company signed up at (see lib/pricing-rules.ts): one operation's monthly and yearly price in cents, and the extra
  // percent for running both operations. A later price change never touches it. Empty = a company from before prices could change, which
  // keeps the original prices. Plain nullable integers on purpose -- same drizzle-kit rule as seatLimit.
  lockedMonthlyCents: integer("locked_monthly_cents"),
  lockedYearlyCents: integer("locked_yearly_cents"),
  lockedBothPercent: integer("locked_both_percent"),
  ...timestamps,
}, (t) => [index("organizations_approval_idx").on(t.approvalStatus, t.createdAt), uniqueIndex("organizations_company_code_unique").on(t.companyCode)]);

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
  // Stamped on every successful sign-in; shown in the Admin panel's team list.
  lastLoginAt: text("last_login_at"),
  // Which version of the Terms/Privacy this person agreed to, and when.
  termsAcceptedAt: text("terms_accepted_at"),
  termsVersion: text("terms_version"),
  // Staff logins an admin creates (username + generated password, no email): the
  // username is "<name>_<company-slug>" so it is unique across the platform and
  // already says which company it belongs to. managedByOrgId is the one company
  // whose admins may reset this person's password. All nullable on purpose --
  // never NOT NULL on a table that already has rows (see scripts/safe-push.ts).
  username: text("username"),
  managedByOrgId: text("managed_by_org_id"),
  // Set while the password is still the one an admin generated; the dashboard
  // asks the person to choose their own, and changing it clears the flag.
  mustChangePassword: integer("must_change_password", { mode: "boolean" }),
  // Sign-in throttle: too many wrong passwords in a row pauses sign-in for a while.
  failedLogins: integer("failed_logins"),
  lockedUntil: text("locked_until"),
  // Two-step sign-in (authenticator app). The secret is stored ENCRYPTED (see lib/email-connector-crypto.ts); the backup codes are
  // stored only as hashes (a JSON list) and each works once; totpLastStep is the last time step accepted so a code can't be replayed.
  // All nullable -- never NOT NULL on a table that already has rows. totpEnabledAt empty = two-step is off for this person.
  totpSecret: text("totp_secret"),
  totpEnabledAt: text("totp_enabled_at"),
  totpBackupCodes: text("totp_backup_codes"),
  totpLastStep: integer("totp_last_step"),
  ...timestamps,
}, (t) => [uniqueIndex("users_username_unique").on(t.username)]);

/** One row per successful sign-in -- powers Settings -> Security & activity. No IP address or device data is stored. */
export const signInEvents = sqliteTable(
  "sign_in_events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (t) => [index("sign_in_events_user_idx").on(t.userId, t.createdAt)],
);

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
    // See src/lib/permissions.ts for what each role can do. "staff" is the
    // legacy pre-Admin-panel role and behaves like purchasing_agent.
    role: text("role", {
      enum: ["owner", "admin", "purchasing_manager", "purchasing_agent", "receiver", "accountant", "customer_service", "custom", "staff"],
    })
      .notNull()
      .default("staff"),
    // Extra, hand-picked department access on top of the role, as JSON like
    // {"purchasing":"view","receiving":"work"}. See parseAccess in permissions.ts. Null = just the role.
    deptAccess: text("dept_access"),
    // Set when an admin removes someone's access; the row (and their history) stays.
    deactivatedAt: text("deactivated_at"),
    ...timestamps,
  },
  (t) => [uniqueIndex("membership_user_org_unique").on(t.userId, t.organizationId)],
);

/**
 * A pending (or finished) invitation to join a company's workspace. The
 * private link carries a random token; only its SHA-256 hash is stored, so
 * a database leak can't be turned into working invite links. Valid while
 * not accepted, not revoked and not past expiresAt.
 */
export const teamInvitations = sqliteTable(
  "team_invitations",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role", {
      enum: ["admin", "purchasing_manager", "purchasing_agent", "receiver", "accountant", "customer_service", "custom"],
    }).notNull(),
    // Hand-picked department access chosen when inviting (copied to the membership on accept).
    deptAccess: text("dept_access"),
    tokenHash: text("token_hash").notNull().unique(),
    invitedByUserId: text("invited_by_user_id").references(() => users.id),
    expiresAt: text("expires_at").notNull(),
    acceptedAt: text("accepted_at"),
    revokedAt: text("revoked_at"),
    lastSentAt: text("last_sent_at"),
    ...timestamps,
  },
  (t) => [index("team_invitations_org_idx").on(t.organizationId), index("team_invitations_email_idx").on(t.email)],
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
    // National Drug Code (e.g. 53885-0245-50). MUST stay nullable: adding a
    // NOT NULL column to this populated table makes drizzle-kit emit
    // `delete from purchasing_products` (see scripts/safe-push.ts).
    ndc: text("ndc"),
    /** What the Audit Center prints as the product description: package size or device duration ("10-Day", "50ct"). Nullable. */
    packageDescription: text("package_description"),
    standardPrice: real("standard_price").notNull().default(0),
    notes: text("notes"),
    // Products that never expire (receivers, readers, ...) -- the quotation
    // form hides the Expiry field for them instead of offering month ranges.
    noExpiration: integer("no_expiration", { mode: "boolean" }).notNull().default(false),
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
    // USPS_GROUND is the older USPS choice (labels already bought); new USPS labels are always USPS_PRIORITY.
    labelCarrier: text("label_carrier", { enum: ["UPS_GROUND", "USPS_GROUND", "USPS_PRIORITY"] })
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
    // Orders brought in from another website via Quotation Summary -> Import.
    // null source = created in this app. All nullable (drizzle-kit rule).
    source: text("source"),
    importedItemsText: text("imported_items_text"),
    importedShippingAddress: text("imported_shipping_address"),
    importedAt: text("imported_at"),
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
 * The PDF receipt shown on the Quotation Summary. kind GENERATED = the app's
 * own receipt PDF (replaced whenever the order changes); kind UPLOADED = a PDF
 * someone attached by hand (e.g. for an imported order) -- it wins over the
 * generated one. At most one of each kind per quotation. The file itself is
 * kept as base64 text and is only ever served through a signed-in, company-
 * checked route -- never a public link.
 */
export const purchasingQuotationDocuments = sqliteTable(
  "purchasing_quotation_documents",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    quotationId: text("quotation_id")
      .notNull()
      .references(() => purchasingQuotations.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["GENERATED", "UPLOADED"] }).notNull(),
    filename: text("filename").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    contentBase64: text("content_base64").notNull(),
    createdByUserId: text("created_by_user_id").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    index("purchasing_quotation_documents_org_idx").on(t.organizationId),
    uniqueIndex("purchasing_quotation_documents_quote_kind_idx").on(t.quotationId, t.kind),
  ],
);

// ---------------------------------------------------------------------------
// Receiving department (separate from the older buyback-order tables above).
// One package per quotation (the Quotation Summary in Purchasing is the
// shared order list; Receiving never keeps its own copy of
// an order -- it points at the quotation and records what physically arrived).
// ---------------------------------------------------------------------------

export const RECEIVING_STATUSES = ["IN_PROGRESS", "RECEIVING_COMPLETE", "RECEIVING_COMPLETE_WITH_DISCREPANCY"] as const;
export const RECEIVING_PHOTO_KINDS = [
  "UNOPENED_PACKAGE",
  "SHIPPING_LABEL",
  "DAMAGE",
  "PACKAGE_AS_OPENED",
  "PACKAGING_ISSUE",
  "COMPLETE_CONTENTS",
  "PACKING_SHEET",
  // Step 6 (per product line, tied to itemId)
  "ITEM_PRODUCT",
  "ITEM_DAMAGE",
  "ITEM_DISCREPANCY",
  "ITEM_EXPIRATION",
  // Step 7 / 8 / 9
  "REVISED_INVOICE",
  "CUSTOMER_NOTE",
  "PAYMENT_CONFIRMATION",
] as const;
export const RECEIVING_ACCOUNTS_DECISIONS = [
  "NEED_TO_BE_REVIEWED",
  "NEED_ADJUSTED_QUOTATION",
  "NEED_TO_BE_RETURNED",
  "NEED_TO_BE_PAID",
  "PAID",
] as const;

export const receivingPackages = sqliteTable(
  "receiving_packages",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    quotationId: text("quotation_id")
      .notNull()
      .references(() => purchasingQuotations.id, { onDelete: "cascade" }),
    status: text("status", { enum: RECEIVING_STATUSES }).notNull().default("IN_PROGRESS"),
    trackingNumber: text("tracking_number"),
    carrier: text("carrier", { enum: ["UPS", "USPS", "FedEx", "Other"] }),
    receivedAt: text("received_at"), // "YYYY-MM-DD HH:MM:SS" exactly as the receiver entered it (no time-zone shift)
    receivedByUserId: text("received_by_user_id").references(() => users.id),
    // Set once, by the app, the moment an agent opens the package: server time (UTC) and the signed-in agent. Never edited.
    startedAt: text("started_at"),
    // No FK on purpose: this column was added to a live table by ALTER ... ADD, which cannot attach one, and a declared FK makes every later deploy plan a table rebuild.
    startedByUserId: text("started_by_user_id"),
    externalDamage: text("external_damage", { enum: ["YES", "NO"] }),
    damageTypes: text("damage_types"), // JSON array of labels
    damageNotes: text("damage_notes"),
    doubleBoxed: text("double_boxed", { enum: ["YES", "NO"] }),
    protectiveMaterial: text("protective_material", { enum: ["YES", "NO"] }),
    sturdyOuterBox: text("sturdy_outer_box", { enum: ["YES", "NO"] }),
    productsSecured: text("products_secured", { enum: ["YES", "NO"] }),
    packageSealed: text("package_sealed", { enum: ["YES", "NO"] }),
    packagingRequirementsMet: text("packaging_requirements_met", { enum: ["YES", "NO", "PARTIALLY"] }),
    overallPackaging: text("overall_packaging", { enum: ["ACCEPTABLE", "NOT_ACCEPTABLE"] }),
    packagingIssueNotes: text("packaging_issue_notes"),
    packingSheetIncluded: text("packing_sheet_included", { enum: ["YES", "NO"] }),
    quantityMatches: text("quantity_matches", { enum: ["YES", "NO"] }),
    adjustmentNeeded: text("adjustment_needed", { enum: ["YES", "NO"] }),
    adjustmentDetails: text("adjustment_details"),
    receivingNotes: text("receiving_notes"),
    submittedByUserId: text("submitted_by_user_id").references(() => users.id),
    submittedAt: text("submitted_at"),
    // Step 7 -- adjustments (dollar amounts the customer is told / actually paid)
    adjustedOrderTotal: real("adjusted_order_total"),
    adjustmentAmountEmail: real("adjustment_amount_email"),
    // Step 8 -- the agent's own words for the customer email
    customerEmailNote: text("customer_email_note"),
    // Step 9 -- accounts
    accountsDecision: text("accounts_decision", { enum: RECEIVING_ACCOUNTS_DECISIONS }),
    accountsStatus: text("accounts_status", { enum: ["IN_REVIEW", "PAID"] }),
    paidAt: text("paid_at"),
    // Customer notification (set by the app when the email goes out)
    customerNotifiedAt: text("customer_notified_at"),
    packagingWarningSentAt: text("packaging_warning_sent_at"),
    customerTexted: integer("customer_texted", { mode: "boolean" }),
    ...timestamps,
  },
  (t) => [
    index("receiving_packages_org_idx").on(t.organizationId),
    uniqueIndex("receiving_packages_quotation_idx").on(t.quotationId),
  ],
);

/** A photo on a shipment. The file itself lives in private file storage (never a public link) and is served only through a signed-in, company-checked route. */
// Every shipping label bought for a quotation, one row per label. Most
// orders have one; now and then a customer needs several (5-6 boxes), each
// with its own tracking number. The single-label columns on
// purchasing_quotations still mirror the FIRST label so older screens (the
// Quotation Summary's Tracking # column) keep working; this table is the
// full record and is what the quotation page shows.
export const purchasingQuotationLabels = sqliteTable(
  "purchasing_quotation_labels",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    quotationId: text("quotation_id")
      .notNull()
      .references(() => purchasingQuotations.id, { onDelete: "cascade" }),
    // 1, 2, 3... in the order the labels were bought for this quotation.
    labelNumber: integer("label_number").notNull(),
    carrier: text("carrier", { enum: ["UPS_GROUND", "USPS_GROUND", "USPS_PRIORITY"] }).notNull(),
    shippoShipmentId: text("shippo_shipment_id"),
    shippoRateId: text("shippo_rate_id"),
    shippoTransactionId: text("shippo_transaction_id"),
    labelUrl: text("label_url").notNull(),
    trackingNumber: text("tracking_number"),
    trackingUrl: text("tracking_url"),
    ...timestamps,
  },
  (t) => [
    index("purchasing_quotation_labels_org_idx").on(t.organizationId),
    index("purchasing_quotation_labels_quotation_idx").on(t.quotationId),
  ],
);

/**
 * Live tracking for one package (one tracking number) of a quotation, kept up to date from Shippo. A quotation with
 * several boxes has one row per tracking number. The quotation's own package status, last-update time and delivered
 * time are rolled up from these rows (see lib/tracking-service.ts).
 */
export const purchasingTracking = sqliteTable(
  "purchasing_tracking",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    quotationId: text("quotation_id")
      .notNull()
      .references(() => purchasingQuotations.id, { onDelete: "cascade" }),
    // The label this number came from (null when someone typed the number in). No FK on purpose.
    labelId: text("label_id"),
    carrier: text("carrier", { enum: ["UPS", "USPS", "FedEx", "Other"] }).notNull(),
    trackingNumber: text("tracking_number").notNull(),
    // Same words as the quotation's package status: Pre-Transit, In Transit, Out for Delivery, Delivered, Exception, Returned, Unknown.
    status: text("status").notNull().default("Unknown"),
    statusDetails: text("status_details"),
    location: text("location"),
    eta: text("eta"),
    // "YYYY-MM-DD HH:MM:SS" UTC: when the carrier reported the latest status, and (when delivered) when it was delivered.
    statusAt: text("status_at"),
    deliveredAt: text("delivered_at"),
    // The carrier's scan history as JSON, newest first.
    history: text("history"),
    lastCheckedAt: text("last_checked_at"),
    lastError: text("last_error"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("purchasing_tracking_number_idx").on(t.organizationId, t.quotationId, t.trackingNumber),
    index("purchasing_tracking_org_status_idx").on(t.organizationId, t.status),
    index("purchasing_tracking_number_lookup_idx").on(t.trackingNumber),
  ],
);

// A company's own Shippo account, so its labels are bought (and billed) there and its packages are tracked there.
// An owner or admin pastes the Shippo token in Purchasing -> Settings -> Connectors; we keep it encrypted (lib/email-connector-crypto.ts),
// show only the last 4 characters afterwards, and never send it back to the browser. One per company.
export const shippoConnections = sqliteTable(
  "shippo_connections",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    apiKeyEnc: text("api_key_enc").notNull(),
    keyHint: text("key_hint").notNull(),
    // A "shippo_test_" token only makes practice labels; "shippo_live_" buys real ones.
    isTest: integer("is_test", { mode: "boolean" }).notNull().default(false),
    // The carriers switched on in their Shippo account when we last checked, e.g. "USPS,UPS".
    carriers: text("carriers"),
    // ACTIVE, or NEEDS_ATTENTION when Shippo stopped accepting the token or it can't be read any more.
    status: text("status", { enum: ["ACTIVE", "NEEDS_ATTENTION"] }).notNull().default("ACTIVE"),
    lastError: text("last_error"),
    // The "package moved" notification we registered in their Shippo account (null = live tracking not on).
    webhookId: text("webhook_id"),
    connectedByUserId: text("connected_by_user_id").references(() => users.id),
    connectedAt: text("connected_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    lastCheckedAt: text("last_checked_at"),
  },
  (t) => [uniqueIndex("shippo_connections_org_idx").on(t.organizationId)],
);

// A company's own Claude (Anthropic) key, for the AI features that cost money per use (reading label photos).
// Pasted by an owner or admin in Settings -> Connectors, checked with Anthropic first, kept encrypted, shown only as
// the last 4 characters. One per company. Usage is billed to that company's own Anthropic account.
export const aiConnections = sqliteTable(
  "ai_connections",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // Which AI the company connected: "anthropic" (Claude) or "openai" (ChatGPT).
    provider: text("provider").notNull().default("anthropic"),
    apiKeyEnc: text("api_key_enc").notNull(),
    keyHint: text("key_hint").notNull(),
    // ACTIVE, or NEEDS_ATTENTION when the provider stopped accepting the key or it can't be read any more.
    status: text("status", { enum: ["ACTIVE", "NEEDS_ATTENTION"] }).notNull().default("ACTIVE"),
    lastError: text("last_error"),
    connectedByUserId: text("connected_by_user_id").references(() => users.id),
    connectedAt: text("connected_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    lastCheckedAt: text("last_checked_at"),
  },
  (t) => [uniqueIndex("ai_connections_org_idx").on(t.organizationId)],
);

// How many questions each person has asked Jin (the built-in assistant) on a given day, so a fair daily limit can be kept
// per person and per company. Only counts are stored here, never what was asked or answered.
export const jinUsage = sqliteTable(
  "jin_usage",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // The UTC day, "YYYY-MM-DD".
    day: text("day").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [uniqueIndex("jin_usage_org_user_day_idx").on(t.organizationId, t.userId, t.day)],
);

// Jin's industry library: facts the platform owner records (a maker's lot/serial layout, recall notes, counterfeit signs...).
// This is PLATFORM content, shared by every company's Jin, so it deliberately has no organizationId and must never hold a
// company's private records. Only LIVE entries reach Jin; DRAFT ones are the owner's work in progress.
export const jinKnowledge = sqliteTable(
  "jin_knowledge",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    category: text("category").notNull(),
    brand: text("brand"),
    body: text("body").notNull(),
    source: text("source").notNull().default(""),
    // The day someone last checked this against its source, "YYYY-MM-DD".
    verifiedOn: text("verified_on"),
    // Lot or serial layouts in the plain symbols 9 / A / X, one per line (see industry-checks.ts).
    formats: text("formats"),
    formatKind: text("format_kind"),
    status: text("status", { enum: ["DRAFT", "LIVE"] }).notNull().default("DRAFT"),
    createdByUserId: text("created_by_user_id"),
    ...timestamps,
  },
  (t) => [index("jin_knowledge_status_idx").on(t.status)],
);

// The proof of who a company is, collected at sign-up and read only by the platform owner when approving it. One row per
// company. The proof document is kept as bytes (base64) like the logo; it is never shown to the company's own team again.
export const businessVerifications = sqliteTable("business_verifications", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .unique()
    .references(() => organizations.id, { onDelete: "cascade" }),
  ein: text("ein").notNull(), // stored as XX-XXXXXXX
  registeredState: text("registered_state").notNull(), // 2-letter US state the business is registered in
  entityType: text("entity_type").notNull(),
  stateFileNumber: text("state_file_number").notNull(),
  yearFormed: integer("year_formed").notNull(),
  businessType: text("business_type").notNull(),
  businessDescription: text("business_description").notNull(),
  proofType: text("proof_type").notNull(),
  proofFileName: text("proof_file_name").notNull(),
  proofContentType: text("proof_content_type").notNull(),
  proofData: text("proof_data").notNull(), // base64, no data: prefix
  submittedAt: text("submitted_at").notNull().default(sql`(current_timestamp)`),
  // Result of checking the file number against the state's public records (see lib/state-registry.ts). Empty = not checked yet.
  registryStatus: text("registry_status"),
  registryDetail: text("registry_detail"),
  registryCheckedAt: text("registry_checked_at"),
  ...timestamps,
}, (t) => [index("business_verifications_ein_idx").on(t.ein)]);

// Counters that slow down abuse of public forms (sign-in, sign-up, codes): one row per key and time window. Keys are hashes,
// so no email address or IP is stored in the clear. See lib/rate-limit.ts.
export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: integer("window_start").notNull(),
  count: integer("count").notNull(),
});

// Every decision the platform owner makes about a company, and when a company sends its details again. Plain text ids on
// purpose (no foreign keys): the history must outlive the people and companies it is about.
export const companyDecisions = sqliteTable(
  "company_decisions",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    // "submitted" | "resubmitted" | "approved" | "turned_down" | "suspended" | "banned" | "reinstated"
    decision: text("decision").notNull(),
    reason: text("reason"),
    decidedByUserId: text("decided_by_user_id"),
    createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
  },
  (t) => [index("company_decisions_org_idx").on(t.organizationId, t.createdAt)],
);

// What people say about Jin's answers. Only saved when a person presses "Helpful" or "Not right"; the platform owner reads
// these to improve the library. A company's name is kept so the owner knows where a note came from.
export const jinFeedback = sqliteTable(
  "jin_feedback",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    rating: text("rating", { enum: ["UP", "DOWN"] }).notNull(),
    question: text("question").notNull(),
    answer: text("answer").notNull(),
    note: text("note"),
    status: text("status", { enum: ["NEW", "REVIEWED", "DISMISSED"] }).notNull().default("NEW"),
    createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
  },
  (t) => [index("jin_feedback_status_idx").on(t.status, t.createdAt)],
);

// Industry news is a built-in courtesy for every company, paid for by the platform. To keep that cheap, Claude checks each
// headline once per BRAND, not once per company: the verdict is kept here and reused by every company that buys that brand.
// Nothing in these two tables belongs to a company; it is public information about a brand and its news.
export const industryAiCache = sqliteTable(
  "industry_ai_cache",
  {
    id: text("id").primaryKey(),
    brandKey: text("brand_key").notNull(),
    fingerprint: text("fingerprint").notNull(),
    relevant: integer("relevant", { mode: "boolean" }).notNull(),
    kind: text("kind").notNull(),
    severity: text("severity").notNull(),
    summary: text("summary"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (t) => [uniqueIndex("industry_ai_cache_brand_fp_idx").on(t.brandKey, t.fingerprint)],
);

// Who owns a brand, as worked out once by Claude and shared by every company that buys that brand.
export const industryMakerCache = sqliteTable(
  "industry_maker_cache",
  {
    id: text("id").primaryKey(),
    brandKey: text("brand_key").notNull(),
    owner: text("owner").notNull(),
    firms: text("firms").notNull().default(""),
    terms: text("terms").notNull().default(""),
    broadMaker: integer("broad_maker", { mode: "boolean" }).notNull().default(false),
    ambiguous: integer("ambiguous", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (t) => [uniqueIndex("industry_maker_cache_brand_idx").on(t.brandKey)],
);

// The mailbox a company sends its customer emails from (an admin connects it with Google's sign-in, like Airtable's
// "connect a Gmail account"). We keep only the long-lived refresh token, encrypted; the company's password is never seen.
// One per company. With none, emails go from the platform's own sending address.
export const emailConnections = sqliteTable(
  "email_connections",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    provider: text("provider", { enum: ["GOOGLE", "MICROSOFT", "SMTP"] }).notNull().default("GOOGLE"),
    // The mailbox the customer sees as the sender.
    accountEmail: text("account_email").notNull(),
    // AES-256-GCM encrypted secret (see lib/email-connector-crypto.ts): the sign-in permission (refresh token) for
    // Google and Microsoft, or the mail server login (JSON) for "other" mailboxes.
    credentialEnc: text("credential_enc").notNull(),
    // ACTIVE, or NEEDS_RECONNECT when Google says the permission was removed or expired.
    status: text("status", { enum: ["ACTIVE", "NEEDS_RECONNECT"] }).notNull().default("ACTIVE"),
    lastError: text("last_error"),
    connectedByUserId: text("connected_by_user_id").references(() => users.id),
    connectedAt: text("connected_at")
      .notNull()
      .default(sql`(current_timestamp)`),
    lastUsedAt: text("last_used_at"),
  },
  (t) => [uniqueIndex("email_connections_org_idx").on(t.organizationId)],
);

/**
 * How a company pays its customers: how many business days after a package is delivered the payment is due, whether
 * US federal holidays are skipped, and the time zone that turns a delivered time into a calendar day. One row per
 * company; no row means the defaults (3 business days, holidays skipped, Eastern time).
 */
export const accountsSettings = sqliteTable("accounts_settings", {
  organizationId: text("organization_id")
    .primaryKey()
    .references(() => organizations.id, { onDelete: "cascade" }),
  payWithinBusinessDays: integer("pay_within_business_days").notNull().default(3),
  skipUsHolidays: integer("skip_us_holidays", { mode: "boolean" }).notNull().default(true),
  timeZone: text("time_zone").notNull().default("America/New_York"),
  ...timestamps,
});

/** A day the company is closed (on top of weekends and US federal holidays), so it doesn't count toward the payment terms. */
export const accountsClosureDays = sqliteTable(
  "accounts_closure_days",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    day: text("day").notNull(), // "YYYY-MM-DD"
    label: text("label"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (t) => [uniqueIndex("accounts_closure_day_idx").on(t.organizationId, t.day)],
);

// A company's edited wording for one customer email (subject and text, with {placeholders}). A template with no row
// here uses the original wording built into lib/email-templates.ts.
export const receivingEmailTemplates = sqliteTable(
  "receiving_email_templates",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // STANDARD | STANDARD_PACKAGING_NOTICE | ADJUSTMENT_ONLY | ADJUSTMENT_PACKAGING | PACKAGING_WARNING
    templateKey: text("template_key").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    updatedByUserId: text("updated_by_user_id").references(() => users.id),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (t) => [primaryKey({ columns: [t.organizationId, t.templateKey] })],
);

// Every customer email the Customer Service department sends (the "package received & processed" emails and the
// stand-alone packaging warning): the exact message and attachments, who sent it and when. Resends add a new row.
// A row only exists once the email service accepted the message.
export const receivingCustomerEmails = sqliteTable(
  "receiving_customer_emails",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    packageId: text("package_id")
      .notNull()
      .references(() => receivingPackages.id, { onDelete: "cascade" }),
    // STATUS = the payment email, WARNING = the stand-alone packaging warning.
    kind: text("kind", { enum: ["STATUS", "WARNING"] }).notNull(),
    template: text("template").notNull(),
    toEmail: text("to_email").notNull(),
    bccEmails: text("bcc_emails"),
    subject: text("subject").notNull(),
    bodyHtml: text("body_html").notNull(),
    // JSON array of the attached file names.
    attachmentNames: text("attachment_names"),
    skippedAttachments: integer("skipped_attachments").notNull().default(0),
    // The address the email was sent from: the connected mailbox, or null when it went from the platform address.
    sentFrom: text("sent_from"),
    sentByUserId: text("sent_by_user_id").references(() => users.id),
    sentAt: text("sent_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (t) => [
    index("receiving_customer_emails_org_idx").on(t.organizationId),
    index("receiving_customer_emails_package_idx").on(t.packageId),
  ],
);

export const receivingPackagePhotos = sqliteTable(
  "receiving_package_photos",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    packageId: text("package_id")
      .notNull()
      .references(() => receivingPackages.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: RECEIVING_PHOTO_KINDS }).notNull(),
    // Set for the per-product photo kinds (Step 6); null for shipment-level photos.
    itemId: text("item_id"),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    storagePath: text("storage_path").notNull(),
    uploadedByUserId: text("uploaded_by_user_id").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    index("receiving_package_photos_org_idx").on(t.organizationId),
    index("receiving_package_photos_package_idx").on(t.packageId),
  ],
);

export const RECEIVING_CONDITIONS = [
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
] as const;
export const RECEIVING_DISCREPANCY_CATEGORIES = [
  "Product Mismatch",
  "Quantity Mismatch",
  "Product Code Mismatch",
  "Variant Mismatch",
  "Expiration Issue",
  "Mixed Expiration Dates",
  "Expiration Quantity Mismatch",
  "Product Damage",
  "Packaging Damage",
  "Packaging Non-Compliance",
  "Missing Product",
  "Extra Product",
  "Open Product",
  "Other",
] as const;
export const RECEIVING_ADJUSTMENT_REASONS = [
  "Incorrect Product",
  "Wrong Quantity",
  "Wrong Code",
  "Wrong Variant",
  "Expiration Issue",
  "Short-Dated Product",
  "Product Damage",
  "Packaging Damage",
  "Packaging Non-Compliance",
  "Product Not Eligible",
  "Missing Item",
  "Extra Item",
  "Other",
] as const;

/** Step 6 -- one row per product verified on a shipment: quoted lines (pre-filled from the quotation) and anything extra that arrived. */
export const receivingItems = sqliteTable(
  "receiving_items",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    packageId: text("package_id")
      .notNull()
      .references(() => receivingPackages.id, { onDelete: "cascade" }),
    quotedItemId: text("quoted_item_id").references(() => purchasingQuotedItems.id, { onDelete: "set null" }),
    productId: text("product_id").references(() => purchasingProducts.id, { onDelete: "set null" }),
    productName: text("product_name").notNull(),
    itemSource: text("item_source", { enum: ["QUOTED", "EXTRA"] }).notNull().default("QUOTED"),
    // Copied from the quotation line when the row is created, so a later edit to the quotation never rewrites what was verified.
    quotedQuantity: integer("quoted_quantity"),
    quotedAmount: real("quoted_amount"),
    wasReceived: text("was_received", { enum: ["YES", "NO", "PARTIALLY"] }),
    quantityReceived: integer("quantity_received"),
    condition: text("condition", { enum: RECEIVING_CONDITIONS }),
    needsReturn: text("needs_return", { enum: ["YES", "NO", "PENDING_REVIEW"] }),
    notes: text("notes"),
    // Identification the agent reads off the product
    ndc: text("ndc"),
    lotNumber: text("lot_number"),
    codeMatches: text("code_matches", { enum: ["YES", "NO", "NA"] }),
    expirationQualifies: text("expiration_qualifies", { enum: ["YES", "NO", "REVIEW_REQUIRED", "NA"] }),
    expirationEntryType: text("expiration_entry_type", { enum: ["SINGLE", "RANGE", "MULTIPLE", "NA"] }),
    expirationDate: text("expiration_date"), // YYYY-MM-DD (single date)
    discrepancyCategories: text("discrepancy_categories"), // JSON array of labels
    discrepancyNotes: text("discrepancy_notes"),
    adjustmentRequired: text("adjustment_required", { enum: ["YES", "NO"] }),
    managementReview: text("management_review", { enum: ["YES", "NO"] }),
    returnRequired: text("return_required", { enum: ["YES", "NO"] }),
    quotationAdjusted: text("quotation_adjusted", { enum: ["YES", "NO", "PENDING"] }),
    proposedRevisedAmount: real("proposed_revised_amount"),
    adjustmentReason: text("adjustment_reason", { enum: RECEIVING_ADJUSTMENT_REASONS }),
    adjustmentNotes: text("adjustment_notes"),
    quantityToReturn: integer("quantity_to_return"),
    returnStatus: text("return_status", { enum: ["NOT_APPLICABLE", "RETURN_REQUESTED", "RETURN_SHIPPED", "RETURNED"] }),
    returnTracking: text("return_tracking"),
    returnNotes: text("return_notes"),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index("receiving_items_org_idx").on(t.organizationId),
    index("receiving_items_package_idx").on(t.packageId),
  ],
);

/** One row per expiration date / lot of a received product (a single date, a range, or several lots). */
export const receivingExpirationLots = sqliteTable(
  "receiving_expiration_lots",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    itemId: text("item_id")
      .notNull()
      .references(() => receivingItems.id, { onDelete: "cascade" }),
    label: text("label"),
    lotNumber: text("lot_number"),
    expirationDate: text("expiration_date"),
    expirationEndDate: text("expiration_end_date"),
    quantity: integer("quantity"),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("receiving_expiration_lots_item_idx").on(t.itemId)],
);

/**
 * A product recall the receiving team checks received products against (Omnipod 5 pods, Libre 3 sensors, Dexcom G7
 * receivers ...). A recall can carry a list of affected lot / serial numbers (pasted in by an admin) and/or point at the
 * manufacturer's own lookup page, for manufacturers that don't publish a list.
 */
export const receivingRecalls = sqliteTable(
  "receiving_recalls",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    manufacturer: text("manufacturer").notNull().default(""),
    /** Comma-separated words in a product name that point at this recall ("omnipod, pod"). */
    keywords: text("keywords").notNull().default(""),
    numberHint: text("number_hint"),
    lookupUrl: text("lookup_url"),
    lookupLabel: text("lookup_label"),
    noticeUrl: text("notice_url"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    /** When the pasted list was last replaced / added to. */
    listUpdatedAt: text("list_updated_at"),
    ...timestamps,
  },
  (t) => [index("receiving_recalls_org_idx").on(t.organizationId)],
);

/** One affected lot / serial number of a recall, normalised (upper case, letters and digits only). A prefix covers every number that starts with it. */
export const receivingRecallNumbers = sqliteTable(
  "receiving_recall_numbers",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    recallId: text("recall_id")
      .notNull()
      .references(() => receivingRecalls.id, { onDelete: "cascade" }),
    value: text("value").notNull(),
    isPrefix: integer("is_prefix", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [uniqueIndex("receiving_recall_numbers_unique").on(t.recallId, t.value), index("receiving_recall_numbers_org_idx").on(t.organizationId)],
);

/** Every recall check made on a received row: the number checked and what was found. */
export const receivingRecallChecks = sqliteTable(
  "receiving_recall_checks",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    packageId: text("package_id")
      .notNull()
      .references(() => receivingPackages.id, { onDelete: "cascade" }),
    itemId: text("item_id")
      .notNull()
      .references(() => receivingItems.id, { onDelete: "cascade" }),
    /** The recall it matched or was confirmed against; null when nothing matched. */
    recallId: text("recall_id"),
    recallName: text("recall_name"),
    enteredNumber: text("entered_number").notNull(),
    result: text("result", { enum: ["ON_LIST", "NOT_ON_LIST", "CONFIRMED_AFFECTED", "CONFIRMED_OK"] }).notNull(),
    note: text("note"),
    checkedByUserId: text("checked_by_user_id"),
    checkedAt: text("checked_at").notNull().default(sql`(current_timestamp)`),
  },
  (t) => [index("receiving_recall_checks_item_idx").on(t.itemId), index("receiving_recall_checks_pkg_idx").on(t.packageId)],
);

/**
 * Step 6 scanner: one row per unit scanned (or typed) while receiving. The serial number is stored normalised so the
 * same serial turning up twice -- in one shipment or in any earlier one -- can be found with a single indexed lookup.
 * A serial that repeats is the main sign of a counterfeit or re-boxed product, so `flag` says what was found.
 */
export const receivingItemSerials = sqliteTable(
  "receiving_item_serials",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    packageId: text("package_id")
      .notNull()
      .references(() => receivingPackages.id, { onDelete: "cascade" }),
    itemId: text("item_id")
      .notNull()
      .references(() => receivingItems.id, { onDelete: "cascade" }),
    /** As scanned or typed. */
    serial: text("serial"),
    /** Upper case, letters and digits only. Null when the barcode had no serial (a lot-only product). */
    serialNorm: text("serial_norm"),
    lot: text("lot"),
    gtin: text("gtin"),
    expiry: text("expiry"),
    source: text("source", { enum: ["SCANNER", "CAMERA", "PHOTO", "TYPED"] }).notNull().default("SCANNER"),
    /** OK, or a short code list (DUPLICATE_SHIPMENT, DUPLICATE_PRIOR, BAD_FORMAT, BAD_GTIN, PLACEHOLDER, RECALLED), comma separated. */
    flag: text("flag").notNull().default("OK"),
    flagNote: text("flag_note"),
    scannedByUserId: text("scanned_by_user_id"),
    scannedAt: text("scanned_at").notNull().default(sql`(current_timestamp)`),
  },
  (t) => [
    index("receiving_item_serials_item_idx").on(t.itemId),
    index("receiving_item_serials_pkg_idx").on(t.packageId),
    index("receiving_item_serials_org_serial_idx").on(t.organizationId, t.serialNorm),
  ],
);

/**
 * The inventory ledger for received shipments: one header per shipment
 * (who sent it, when, what was paid) and one line per product received.
 * Written when a shipment is submitted; feeds the Weekly Received and
 * Products Received trackers.
 */
export const receivingIntakeLogs = sqliteTable(
  "receiving_intake_logs",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    packageId: text("package_id")
      .notNull()
      .references(() => receivingPackages.id, { onDelete: "cascade" }),
    receivedFrom: text("received_from").notNull(),
    receivedAt: text("received_at"),
    receivedByUserId: text("received_by_user_id"),
    startedAt: text("started_at"),
    pricePaid: real("price_paid"),
    notes: text("notes"),
    loggedByUserId: text("logged_by_user_id").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    index("receiving_intake_logs_org_idx").on(t.organizationId),
    uniqueIndex("receiving_intake_logs_package_idx").on(t.packageId),
  ],
);

export const receivingIntakeLines = sqliteTable(
  "receiving_intake_lines",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    logId: text("log_id")
      .notNull()
      .references(() => receivingIntakeLogs.id, { onDelete: "cascade" }),
    productId: text("product_id").references(() => purchasingProducts.id, { onDelete: "set null" }),
    productName: text("product_name").notNull(),
    ndc: text("ndc"),
    lotNumber: text("lot_number"),
    quantity: integer("quantity").notNull().default(0),
    condition: text("condition"),
    expirationEarliest: text("expiration_earliest"),
    expirationLatest: text("expiration_latest"),
    weekOf: text("week_of"), // the Monday of the week it was received, YYYY-MM-DD
    receivedFrom: text("received_from"),
    receivedAt: text("received_at"),
    receivedByUserId: text("received_by_user_id"),
    needsReturn: text("needs_return"),
    quantityToReturn: integer("quantity_to_return"),
    // What inventory will use: the units that are accepted (received minus returned; empty while the return decision is
    // still pending), plus a snapshot of the product and the receiving row this came from. Plain columns (no FK) on purpose:
    // they were added to a live table, and ALTER ... ADD can't attach a foreign key.
    quantityAccepted: integer("quantity_accepted"),
    expirationDate: text("expiration_date"),
    productCode: text("product_code"),
    brand: text("brand"),
    returnStatus: text("return_status"),
    itemNotes: text("item_notes"),
    sourceItemId: text("source_item_id"),
    // Recall check result for the row at submit time: RECALLED or CHECKED (null = not checked). Plain nullable, no FK.
    recallStatus: text("recall_status"),
    recallName: text("recall_name"),
    ...timestamps,
  },
  (t) => [
    index("receiving_intake_lines_org_idx").on(t.organizationId),
    index("receiving_intake_lines_log_idx").on(t.logId),
  ],
);

/** Per-company switches and wording for the customer emails Receiving sends. All optional. */
export const receivingSettings = sqliteTable("receiving_settings", {
  organizationId: text("organization_id")
    .primaryKey()
    .references(() => organizations.id, { onDelete: "cascade" }),
  emailsEnabled: integer("emails_enabled", { mode: "boolean" }).notNull().default(false),
  fromName: text("from_name"),
  replyTo: text("reply_to"),
  bccEmails: text("bcc_emails"), // comma separated
  quoteLinkUrl: text("quote_link_url"),
  packagingGuideUrl: text("packaging_guide_url"),
  ...timestamps,
});

/**
 * An adjustment quotation: a corrected copy of the quotation the customer was given, made while receiving
 * (different quantities, conditions or prices, with a reason). One per shipment. Finalizing it produces the
 * adjusted invoice PDF that is attached to the shipment and sent to the customer.
 */
export const receivingAdjustments = sqliteTable(
  "receiving_adjustments",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    packageId: text("package_id")
      .notNull()
      .references(() => receivingPackages.id, { onDelete: "cascade" }),
    number: text("number").notNull(),
    status: text("status", { enum: ["DRAFT", "FINAL"] }).notNull().default("DRAFT"),
    reasonCategory: text("reason_category", { enum: RECEIVING_ADJUSTMENT_REASONS }),
    reasonNotes: text("reason_notes"),
    // Copied from the original quotation when the adjustment is started, so the comparison never shifts.
    originalTotal: real("original_total").notNull().default(0),
    bonusAmount: real("bonus_amount").notNull().default(0),
    deductionAmount: real("deduction_amount").notNull().default(0),
    itemsTotal: real("items_total").notNull().default(0),
    adjustedTotal: real("adjusted_total").notNull().default(0),
    finalizedAt: text("finalized_at"),
    finalizedByUserId: text("finalized_by_user_id").references(() => users.id),
    // The stored PDF (a REVISED_INVOICE photo row on the shipment), when file storage is connected.
    documentPhotoId: text("document_photo_id"),
    createdByUserId: text("created_by_user_id").references(() => users.id),
    ...timestamps,
  },
  (t) => [
    index("receiving_adjustments_org_idx").on(t.organizationId),
    uniqueIndex("receiving_adjustments_package_idx").on(t.packageId),
  ],
);

export const receivingAdjustmentLines = sqliteTable(
  "receiving_adjustment_lines",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    adjustmentId: text("adjustment_id")
      .notNull()
      .references(() => receivingAdjustments.id, { onDelete: "cascade" }),
    quotedItemId: text("quoted_item_id"),
    productId: text("product_id"),
    productName: text("product_name").notNull(),
    productCode: text("product_code"),
    condition: text("condition"),
    expiryLabel: text("expiry_label"),
    // What the original quotation said (null for a line added during the adjustment).
    originalQuantity: integer("original_quantity"),
    originalUnitPrice: real("original_unit_price"),
    originalLineTotal: real("original_line_total"),
    quantity: integer("quantity").notNull().default(0),
    unitPrice: real("unit_price").notNull().default(0),
    lineTotal: real("line_total").notNull().default(0),
    note: text("note"),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("receiving_adjustment_lines_adj_idx").on(t.adjustmentId)],
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

/**
 * The Quotation Profile: the company name and logo printed at the top of quotations (and the documents that go
 * with them), set by Purchasing on its own. A company may buy under a different name or brand than its main
 * business, so this is separate from the Business Profile. One row per Organization. A blank name or no logo
 * falls back to the Business Profile's (see resolveBusinessDocumentIdentity). Quotations never print an address.
 */
export const purchasingQuotationProfiles = sqliteTable("purchasing_quotation_profiles", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .unique()
    .references(() => organizations.id, { onDelete: "cascade" }),
  displayName: text("display_name"),
  logoData: text("logo_data"), // base64, no data: prefix
  logoContentType: text("logo_content_type"),
  logoUpdatedAt: text("logo_updated_at"),
  showLogo: integer("show_logo", { mode: "boolean" }).notNull().default(true),
  ...timestamps,
});

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

/**
 * The platform's shared DEFAULT catalog -- the one table in this app that
 * deliberately has no organization_id. Each published version is a snapshot
 * (JSON) of one company's products / brands / NDCs, conditions, month ranges,
 * starter recalls and receipt wording, with every price stripped. New
 * companies get a COPY of the latest snapshot when they sign up; nothing is
 * shared live afterwards, so a company that edits or removes things never
 * affects anyone else. Only platform admins (PLATFORM_ADMIN_EMAILS) publish.
 */
export const platformCatalogTemplates = sqliteTable("platform_catalog_templates", {
  id: text("id").primaryKey(),
  version: integer("version").notNull().unique(),
  payload: text("payload").notNull(),
  publishedByEmail: text("published_by_email"),
  publishedFromOrganizationId: text("published_from_organization_id"),
  publishedAt: text("published_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});

// ---------------------------------------------------------------------------
// Inventory department. Stock that comes from Receiving is NOT copied here: it is read live from Receiving's accepted
// units (receiving_intake_lines), so a correction in Receiving is reflected at once. This table holds only what
// Receiving does not know about: stock added by hand (opening stock, corrections), units taken out by Sales, and
// manual adjustments. One signed row per change, never edited (a mistake is fixed with a new row).
// ---------------------------------------------------------------------------

export const INVENTORY_MOVEMENT_KINDS = ["MANUAL_ADD", "SALE", "ADJUSTMENT"] as const;

export const inventoryMovements = sqliteTable(
  "inventory_movements",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: INVENTORY_MOVEMENT_KINDS }).notNull(),
    // Plain columns, no FK: the product name and brand are kept as they were when the row was made.
    productId: text("product_id"),
    productKey: text("product_key").notNull(),
    productName: text("product_name").notNull(),
    brand: text("brand"),
    condition: text("condition").notNull(),
    expirationDate: text("expiration_date"), // YYYY-MM-DD, null = no expiration date
    lotNumber: text("lot_number"),
    /** Signed: positive adds stock, negative takes it out. */
    quantity: integer("quantity").notNull(),
    /** What one unit cost (dollars). Null when unknown. */
    unitCost: real("unit_cost"),
    note: text("note"),
    /** What caused it, e.g. an invoice id for a sale. */
    refType: text("ref_type"),
    refId: text("ref_id"),
    createdByUserId: text("created_by_user_id"),
    ...timestamps,
  },
  (t) => [
    index("inventory_movements_org_idx").on(t.organizationId),
    index("inventory_movements_product_idx").on(t.organizationId, t.productKey),
  ],
);

/** The estimated selling price range of one product in one condition (per unit). */
export const inventoryEstimates = sqliteTable(
  "inventory_estimates",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    productKey: text("product_key").notNull(),
    conditionKey: text("condition_key").notNull(),
    priceLow: real("price_low"),
    priceHigh: real("price_high"),
    updatedByUserId: text("updated_by_user_id"),
    ...timestamps,
  },
  (t) => [uniqueIndex("inventory_estimates_unique").on(t.organizationId, t.productKey, t.conditionKey)],
);

// ---------------------------------------------------------------------------
// Sales department. Quotations and invoices to wholesale buyers, fed by Inventory (live stock beside each item; units are
// held by a DRAFT invoice and taken out of Inventory when the invoice is SENT). Buyers carry an uploaded price sheet so
// the Price Comparison tab can say who pays the most for each product.
// ---------------------------------------------------------------------------

/** The company the invoices come from (name, address, email, phone, logo) and the numbering. One row per company. */
export const salesProfiles = sqliteTable(
  "sales_profiles",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    companyName: text("company_name"),
    address: text("address"),
    email: text("email"),
    phone: text("phone"),
    logoData: text("logo_data"),
    logoContentType: text("logo_content_type"),
    showLogo: integer("show_logo", { mode: "boolean" }).notNull().default(true),
    defaultTerms: text("default_terms").notNull().default("Due on Receipt"),
    defaultNotes: text("default_notes"),
    footerText: text("footer_text"),
    nextInvoiceNumber: integer("next_invoice_number").notNull().default(1001),
    nextQuotationNumber: integer("next_quotation_number").notNull().default(1001),
    /** Numbering of the purchase orders we receive (RPO-1001...). Null until the first one is logged; counts from 1001. */
    nextPurchaseOrderNumber: integer("next_purchase_order_number"),
    ...timestamps,
  },
  (t) => [uniqueIndex("sales_profiles_org_unique").on(t.organizationId)],
);

export const salesBuyers = sqliteTable(
  "sales_buyers",
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
    paymentTerms: text("payment_terms"),
    taxInfo: text("tax_info"),
    taxExempt: integer("tax_exempt", { mode: "boolean" }).notNull().default(false),
    defaultNotes: text("default_notes"),
    /** The pharmacy's NCPDP provider number and NPI, used by the Audit Center (PBM audits need the NCPDP). Nullable on purpose. */
    ncpdp: text("ncpdp"),
    npi: text("npi"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    ...timestamps,
  },
  (t) => [index("sales_buyers_org_idx").on(t.organizationId)],
);

/** The file a buyer sent (kept as it came) and what was read from it. One current sheet per buyer. */
export const salesPriceSheets = sqliteTable(
  "sales_price_sheets",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    buyerId: text("buyer_id")
      .notNull()
      .references(() => salesBuyers.id, { onDelete: "cascade" }),
    fileName: text("file_name").notNull(),
    fileContentType: text("file_content_type"),
    fileData: text("file_data"), // base64 of the original upload
    uploadedByUserId: text("uploaded_by_user_id"),
    ...timestamps,
  },
  (t) => [uniqueIndex("sales_price_sheets_buyer_unique").on(t.organizationId, t.buyerId)],
);

/** One price a buyer pays: for a product (matched to the catalog, or not yet) in a condition. */
export const salesPriceItems = sqliteTable(
  "sales_price_items",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    buyerId: text("buyer_id")
      .notNull()
      .references(() => salesBuyers.id, { onDelete: "cascade" }),
    sheetId: text("sheet_id").references(() => salesPriceSheets.id, { onDelete: "cascade" }),
    /** The name exactly as the buyer's sheet wrote it. */
    rawName: text("raw_name").notNull(),
    productId: text("product_id"),
    productKey: text("product_key"),
    condition: text("condition").notNull().default("Mint"),
    price: real("price").notNull(),
    ...timestamps,
  },
  (t) => [index("sales_price_items_org_buyer_idx").on(t.organizationId, t.buyerId), index("sales_price_items_product_idx").on(t.organizationId, t.productKey)],
);

export const SALES_KINDS = ["QUOTATION", "INVOICE", "PURCHASE_ORDER"] as const;
export const SALES_STATUSES = ["DRAFT", "SENT", "PARTIALLY_PAID", "PAID", "ACCEPTED", "DECLINED", "CONVERTED", "VOID"] as const;

export const salesDocuments = sqliteTable(
  "sales_documents",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: SALES_KINDS }).notNull(),
    seq: integer("seq").notNull(),
    number: text("number").notNull(),
    status: text("status", { enum: SALES_STATUSES }).notNull().default("DRAFT"),
    buyerId: text("buyer_id"),
    // The buyer and the company are copied onto the document when it is made, so changing a buyer later never changes an old invoice.
    buyerCompany: text("buyer_company"),
    buyerContact: text("buyer_contact"),
    buyerBillingAddress: text("buyer_billing_address"),
    buyerShippingAddress: text("buyer_shipping_address"),
    buyerEmail: text("buyer_email"),
    buyerPhone: text("buyer_phone"),
    fromName: text("from_name"),
    fromAddress: text("from_address"),
    fromEmail: text("from_email"),
    fromPhone: text("from_phone"),
    docDate: text("doc_date").notNull(),
    dueDate: text("due_date"), // an invoice's due date; a quotation's "valid until"
    terms: text("terms"),
    reference: text("reference"),
    discount: real("discount").notNull().default(0),
    shipping: real("shipping").notNull().default(0),
    tax: real("tax").notNull().default(0),
    otherCharges: real("other_charges").notNull().default(0),
    subtotal: real("subtotal").notNull().default(0),
    total: real("total").notNull().default(0),
    amountPaid: real("amount_paid").notNull().default(0),
    paidAt: text("paid_at"),
    sentAt: text("sent_at"),
    emailedTo: text("emailed_to"),
    customerNotes: text("customer_notes"),
    internalNotes: text("internal_notes"),
    convertedFromId: text("converted_from_id"),
    convertedToId: text("converted_to_id"),
    /** Revision number sent to the other company (null or 0 = the original). */
    revision: integer("revision"),
    revisionNote: text("revision_note"),
    revisedAt: text("revised_at"),
    /** Stock has been taken out of Inventory for this invoice. */
    inventoryPosted: integer("inventory_posted", { mode: "boolean" }).notNull().default(false),
    createdByUserId: text("created_by_user_id"),
    ...timestamps,
  },
  (t) => [
    index("sales_documents_org_idx").on(t.organizationId, t.kind),
    uniqueIndex("sales_documents_number_unique").on(t.organizationId, t.kind, t.seq),
  ],
);

export const salesDocumentLines = sqliteTable(
  "sales_document_lines",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    documentId: text("document_id")
      .notNull()
      .references(() => salesDocuments.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    productId: text("product_id"),
    productKey: text("product_key").notNull(),
    productName: text("product_name").notNull(),
    condition: text("condition").notNull().default("Mint"),
    /** The expiration group the units come from (a stock line's group key), or null for "any, earliest first". */
    groupKey: text("group_key"),
    groupLabel: text("group_label"),
    quantity: integer("quantity").notNull(),
    unitPrice: real("unit_price").notNull().default(0),
    /** What prints in the Expires column; filled from the real stock when the document is sent. */
    expiryText: text("expiry_text"),
    note: text("note"),
    /** NDC, printed on purchase orders (and quotations when filled in). */
    ndc: text("ndc"),
    ...timestamps,
  },
  (t) => [index("sales_document_lines_doc_idx").on(t.documentId)],
);

export const salesPayments = sqliteTable(
  "sales_payments",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    documentId: text("document_id")
      .notNull()
      .references(() => salesDocuments.id, { onDelete: "cascade" }),
    amount: real("amount").notNull(),
    paidOn: text("paid_on").notNull(),
    method: text("method"),
    note: text("note"),
    createdByUserId: text("created_by_user_id"),
    ...timestamps,
  },
  (t) => [index("sales_payments_doc_idx").on(t.documentId)],
);

// ---------------------------------------------------------------------------
// HR: the time clock and the activity log
// ---------------------------------------------------------------------------

export const HR_CLOCK_KINDS = ["CLOCK_IN", "BREAK_START", "BREAK_END", "CLOCK_OUT"] as const;

/** One press of a time-clock button by a staff member. `at` is the server's UTC time; never edited, only added to. */
export const hrTimeEvents = sqliteTable(
  "hr_time_events",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: HR_CLOCK_KINDS }).notNull(),
    at: text("at").notNull(),
    // Set when an admin corrected the clock for someone (who did it); null for the person's own presses.
    enteredByUserId: text("entered_by_user_id"),
    note: text("note"),
  },
  (t) => [index("hr_time_events_org_user_idx").on(t.organizationId, t.userId, t.at)],
);

/**
 * Work that isn't already stamped with a person elsewhere (shipping labels, invoices sent, payments, stock adds...).
 * Quotations created, packages received and emails sent are read from their own tables, so they are never written here.
 */
export const hrActivity = sqliteTable(
  "hr_activity",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    kind: text("kind").notNull(),
    label: text("label").notNull(),
    refType: text("ref_type"),
    refId: text("ref_id"),
    at: text("at").notNull(),
  },
  (t) => [index("hr_activity_org_at_idx").on(t.organizationId, t.at), index("hr_activity_user_idx").on(t.userId, t.at)],
);

// ---------------------------------------------------------------------------
// Marketing: contacts, opt-outs, email and text campaigns
// ---------------------------------------------------------------------------

/** Contacts people typed in or uploaded. Customers from Purchasing are NOT copied here: Marketing reads them live. */
export const marketingContacts = sqliteTable(
  "marketing_contacts",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name"),
    email: text("email"),
    phone: text("phone"),
    company: text("company"),
    notes: text("notes"),
    // MANUAL = typed in, UPLOAD = from a spreadsheet.
    source: text("source", { enum: ["MANUAL", "UPLOAD"] }).notNull().default("MANUAL"),
    createdByUserId: text("created_by_user_id"),
    ...timestamps,
  },
  (t) => [index("marketing_contacts_org_idx").on(t.organizationId)],
);

/** Someone who asked not to be contacted by one channel. Keyed by the address itself, so it holds whether they are a customer, an uploaded contact or both. */
export const marketingOptouts = sqliteTable(
  "marketing_optouts",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    channel: text("channel", { enum: ["EMAIL", "TEXT"] }).notNull(),
    // Lower-case email, or the phone as +1XXXXXXXXXX.
    addressKey: text("address_key").notNull(),
    // Who: "link" (they used the unsubscribe link), "staff" (someone marked it by hand), "reply" (replied STOP).
    via: text("via").notNull().default("staff"),
    note: text("note"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (t) => [uniqueIndex("marketing_optouts_unique").on(t.organizationId, t.channel, t.addressKey)],
);

export const MARKETING_AUDIENCES = ["ALL", "CUSTOMERS", "UPLOADED"] as const;

export const marketingCampaigns = sqliteTable(
  "marketing_campaigns",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    channel: text("channel", { enum: ["EMAIL", "TEXT"] }).notNull(),
    name: text("name").notNull(),
    subject: text("subject"),
    body: text("body").notNull().default(""),
    audience: text("audience", { enum: MARKETING_AUDIENCES }).notNull().default("ALL"),
    // DRAFT -> SENDING (a batch at a time, can be resumed) -> SENT, or CANCELLED when stopped part-way.
    status: text("status", { enum: ["DRAFT", "SENDING", "SENT", "CANCELLED"] }).notNull().default("DRAFT"),
    startedAt: text("started_at"),
    finishedAt: text("finished_at"),
    createdByUserId: text("created_by_user_id"),
    sentByUserId: text("sent_by_user_id"),
    ...timestamps,
  },
  (t) => [index("marketing_campaigns_org_idx").on(t.organizationId, t.channel)],
);

/** One row per person a campaign goes to, fixed when sending starts, so a stopped send can be picked up where it stopped. */
export const marketingMessages = sqliteTable(
  "marketing_messages",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => marketingCampaigns.id, { onDelete: "cascade" }),
    channel: text("channel", { enum: ["EMAIL", "TEXT"] }).notNull(),
    toAddress: text("to_address").notNull(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    // customer or contact, for the person's page; not a foreign key (either table).
    source: text("source").notNull().default("CONTACT"),
    status: text("status", { enum: ["PENDING", "SENT", "FAILED", "SKIPPED"] }).notNull().default("PENDING"),
    error: text("error"),
    sentAt: text("sent_at"),
  },
  (t) => [index("marketing_messages_campaign_idx").on(t.campaignId, t.status), index("marketing_messages_org_sent_idx").on(t.organizationId, t.sentAt)],
);

/** One row per company: who emails come from, the address that must be printed on them, and the (future) text settings. */
export const marketingSettings = sqliteTable(
  "marketing_settings",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    senderName: text("sender_name"),
    replyTo: text("reply_to"),
    // Email law (CAN-SPAM) requires a real mailing address on marketing email.
    businessAddress: text("business_address"),
    footerText: text("footer_text"),
    dailyEmailLimit: integer("daily_email_limit").notNull().default(500),
    // Text messaging: not connected yet. The provider and number are kept so the department is ready when it is.
    textProvider: text("text_provider").notNull().default("NONE"),
    textFromNumber: text("text_from_number"),
    textOptOutLine: text("text_opt_out_line").notNull().default("Reply STOP to opt out."),
    ...timestamps,
  },
  (t) => [uniqueIndex("marketing_settings_org_unique").on(t.organizationId)],
);

// ---------------------------------------------------------------------------
// Chat (the company's internal messaging)
// ---------------------------------------------------------------------------

/**
 * One chat message. `roomKey` says where it was posted: "everyone", "dept:<department>" or "dm:<userA>:<userB>" (ids sorted).
 * Rooms themselves aren't stored: who may read a room is worked out from the person's role (or, for a private message, who the two people are).
 * `seq` only ever goes up, so the screen can ask "anything after number N?". Deleting keeps the row (deletedAt) so the conversation still reads in order.
 */
export const chatMessages = sqliteTable(
  "chat_messages",
  {
    seq: integer("seq").primaryKey({ autoIncrement: true }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    roomKey: text("room_key").notNull(),
    senderUserId: text("sender_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // The other person in a private message (null in group rooms) -- what the unread counts look at.
    recipientUserId: text("recipient_user_id"),
    body: text("body").notNull().default(""),
    attachmentId: text("attachment_id"),
    createdAt: text("created_at").notNull(),
    // Moves whenever the message is created, edited or deleted, so the screen can pick up changes to older messages too.
    changedAt: text("changed_at").notNull(),
    editedAt: text("edited_at"),
    deletedAt: text("deleted_at"),
    deletedByUserId: text("deleted_by_user_id"),
  },
  (t) => [
    index("chat_messages_room_idx").on(t.organizationId, t.roomKey, t.seq),
    index("chat_messages_changed_idx").on(t.organizationId, t.roomKey, t.changedAt),
    index("chat_messages_dm_idx").on(t.organizationId, t.recipientUserId, t.seq),
  ],
);

/** A photo or file shared in a chat. The bytes live in the private file store; people open them through a signed-in, room-checked route. */
export const chatAttachments = sqliteTable(
  "chat_attachments",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    roomKey: text("room_key").notNull(),
    uploadedByUserId: text("uploaded_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    storagePath: text("storage_path").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("chat_attachments_org_idx").on(t.organizationId, t.roomKey)],
);

/** How far each person has read in each room (the highest message number they have seen). Unread = newer messages from other people. */
export const chatReads = sqliteTable(
  "chat_reads",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roomKey: text("room_key").notNull(),
    lastReadSeq: integer("last_read_seq").notNull().default(0),
  },
  (t) => [uniqueIndex("chat_reads_unique").on(t.organizationId, t.userId, t.roomKey)],
);

export const CHAT_STATUSES = ["AVAILABLE", "BUSY", "LUNCH", "AWAY", "OUT_OF_OFFICE"] as const;

/** What each person has set as their status, and when they were last seen in the app (the screens report in every few seconds). */
export const chatPresence = sqliteTable(
  "chat_presence",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status", { enum: CHAT_STATUSES }).notNull().default("AVAILABLE"),
    statusNote: text("status_note"),
    statusSetAt: text("status_set_at"),
    lastSeenAt: text("last_seen_at"),
  },
  (t) => [uniqueIndex("chat_presence_unique").on(t.organizationId, t.userId)],
);

/**
 * One piece of industry news or one official recall about a brand the company buys (shown on the Home screen).
 * Filled daily (and when someone opens Home after a few hours) from the FDA recall list and news headlines; see
 * src/lib/industry-service.ts. `fingerprint` (the link, or the FDA recall number) keeps the same story from being added twice.
 */
export const industryNews = sqliteTable(
  "industry_news",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** The company's own brand name (a Purchasing category such as "Dexcom"). */
    brand: text("brand").notNull(),
    /** recall | safety | business | product | other */
    kind: text("kind").notNull().default("other"),
    /** urgent | important | info */
    severity: text("severity").notNull().default("info"),
    title: text("title").notNull(),
    /** One plain sentence about it (from the FDA record, or written by the AI summary when it is switched on). */
    summary: text("summary"),
    url: text("url").notNull(),
    /** "FDA recall list", or the news site's name. */
    source: text("source").notNull().default(""),
    /** When it was published (ISO date or date-time). */
    publishedAt: text("published_at").notNull(),
    fingerprint: text("fingerprint").notNull(),
    /** The website the story came from (its own site, a news site or a press-release wire); empty for FDA records. */
    sourceHost: text("source_host"),
    /** False when the AI check decided it is not about this brand; kept so it is not looked at again. */
    relevant: integer("relevant", { mode: "boolean" }).notNull().default(true),
    aiChecked: integer("ai_checked", { mode: "boolean" }).notNull().default(false),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("industry_news_unique").on(t.organizationId, t.brand, t.fingerprint),
    index("industry_news_org_date_idx").on(t.organizationId, t.publishedAt),
  ],
);

/** One refresh of the industry news for a company: when, what came of it, and any source that failed. */
export const industryWatchRuns = sqliteTable(
  "industry_watch_runs",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    startedAt: text("started_at").notNull(),
    finishedAt: text("finished_at"),
    added: integer("added").notNull().default(0),
    brandsChecked: integer("brands_checked").notNull().default(0),
    aiUsed: integer("ai_used", { mode: "boolean" }).notNull().default(false),
    /** Plain-language problems ("The FDA list didn't answer"), one per line; empty when all went well. */
    problems: text("problems").notNull().default(""),
    trigger: text("trigger").notNull().default("auto"),
  },
  (t) => [index("industry_watch_runs_org_idx").on(t.organizationId, t.startedAt)],
);

/** Who owns a brand the built-in list does not know (worked out by Claude once, then kept): Home shows it next to the brand and uses it to find the FDA recalls. */
export const industryBrandMakers = sqliteTable(
  "industry_brand_makers",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    brand: text("brand").notNull(),
    owner: text("owner").notNull().default(""),
    /** Names the FDA recall list uses for the owner, separated by " | ". */
    firms: text("firms").notNull().default(""),
    /** Words headlines use for the brand, separated by " | ". */
    terms: text("terms").notNull().default(""),
    broadMaker: integer("broad_maker", { mode: "boolean" }).notNull().default(false),
    /** True when the bare brand name is also an everyday word, so only the product words count. */
    ambiguous: integer("ambiguous", { mode: "boolean" }).notNull().default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex("industry_brand_makers_unique").on(t.organizationId, t.brand)],
);


// ---------------------------------------------------------------------------
// Support center. Companies send tickets from their own Support page (or by email to support@); the platform owner answers from
// Settings -> Support. A ticket always remembers which company it came from (organizationId + the company's permanent code),
// unless it arrived by email from someone we could not match to a company.
// ---------------------------------------------------------------------------

export const supportTickets = sqliteTable(
  "support_tickets",
  {
    id: text("id").primaryKey(),
    /** Human number shown to people ("#1042"), handed out in order. */
    ticketNo: integer("ticket_no").notNull(),
    /** The company it came from. Empty only for email from an unknown address. No cascade: tickets outlive a purged company. */
    organizationId: text("organization_id"),
    createdByUserId: text("created_by_user_id"),
    fromEmail: text("from_email"),
    fromName: text("from_name"),
    subject: text("subject").notNull(),
    category: text("category"),
    /** "open" (needs us), "waiting" (waiting on the company), "solved". */
    status: text("status").notNull().default("open"),
    priority: text("priority").notNull().default("normal"),
    /** "app" or "email". */
    source: text("source").notNull().default("app"),
    /** Who spoke last: "company" or "support" -- drives the "needs reply" badge. */
    lastAuthorKind: text("last_author_kind").notNull().default("company"),
    lastMessageAt: text("last_message_at").notNull().default(sql`(current_timestamp)`),
    /** The company's OK for support to look at its account (read-only), good until this time. Empty = no permission. */
    viewConsentUntil: text("view_consent_until"),
    viewConsentByUserId: text("view_consent_by_user_id"),
    viewConsentAt: text("view_consent_at"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("support_tickets_no_unique").on(t.ticketNo),
    index("support_tickets_org_idx").on(t.organizationId, t.lastMessageAt),
    index("support_tickets_status_idx").on(t.status, t.lastMessageAt),
  ],
);

export const supportMessages = sqliteTable(
  "support_messages",
  {
    id: text("id").primaryKey(),
    ticketId: text("ticket_id")
      .notNull()
      .references(() => supportTickets.id, { onDelete: "cascade" }),
    /** "company" (the customer), "support" (our reply, the customer sees it) or "note" (internal, the customer NEVER sees it). */
    authorKind: text("author_kind").notNull(),
    authorUserId: text("author_user_id"),
    authorName: text("author_name"),
    body: text("body").notNull(),
    /** "app" or "email". */
    via: text("via").notNull().default("app"),
    /** The email's Message-ID, so a webhook that is delivered twice never creates two messages. */
    externalId: text("external_id"),
    createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
  },
  (t) => [index("support_messages_ticket_idx").on(t.ticketId, t.createdAt), uniqueIndex("support_messages_external_unique").on(t.externalId)],
);

/** Every time support looked at a company's account ("View as company"). The company can read this list. */
export const supportViewSessions = sqliteTable(
  "support_view_sessions",
  {
    id: text("id").primaryKey(),
    ticketId: text("ticket_id").notNull(),
    ticketNo: integer("ticket_no"),
    organizationId: text("organization_id").notNull(),
    adminUserId: text("admin_user_id").notNull(),
    adminName: text("admin_name"),
    reason: text("reason"),
    startedAt: text("started_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    endedAt: text("ended_at"),
    createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
  },
  (t) => [index("support_view_sessions_org_idx").on(t.organizationId, t.startedAt)],
);

/**
 * The mothership's own staff. The Owner is whoever has the Owner role in a platform company (not listed here); everyone else on the
 * team is one row: level "co_owner" and "admin" can do everything, "support" can help companies but never opens Settings.
 * Only counts while the person is an active member of a platform company; the server re-checks that every time.
 */
export const platformStaff = sqliteTable(
  "platform_staff",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    level: text("level").notNull(),
    addedBy: text("added_by"),
    createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
    updatedAt: text("updated_at"),
  },
  (t) => [uniqueIndex("platform_staff_user_idx").on(t.userId)],
);

/**
 * How one person arranged their Home screen in one company: the order of its sections and which are open. New table, so it
 * can be added safely; one row per person per company. The text is JSON ({ order, open }) and is always re-checked on read.
 */
export const dashboardLayouts = sqliteTable(
  "dashboard_layouts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    layout: text("layout").notNull(),
    updatedAt: text("updated_at").notNull().default(sql`(current_timestamp)`),
  },
  (t) => [uniqueIndex("dashboard_layouts_user_org_unique").on(t.userId, t.organizationId)],
);

// ---------------------------------------------------------------------------
// Feature rollout. New features are switched on in stages: off -> only the platform's own company ("mothership") -> chosen
// companies -> everyone. The list of known features lives in code (lib/features.ts); a row here only records the chosen stage.
// ---------------------------------------------------------------------------

export const featureFlags = sqliteTable("feature_flags", {
  key: text("key").primaryKey(),
  /** "off" | "mothership" | "selected" | "everyone" */
  stage: text("stage").notNull().default("off"),
  updatedByUserId: text("updated_by_user_id"),
  updatedAt: text("updated_at").notNull().default(sql`(current_timestamp)`),
});

export const featureFlagCompanies = sqliteTable(
  "feature_flag_companies",
  {
    flagKey: text("flag_key").notNull(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
  },
  (t) => [primaryKey({ columns: [t.flagKey, t.organizationId] })],
);

// ---------------------------------------------------------------------------
// Purchase orders (Purchasing). A distributor buys from wholesalers by sending them purchase orders. Suppliers are typed in once and
// saved; a purchase order keeps its own copy (snapshot) of the supplier, ship-to and bill-to details as they were when it was made.
// ---------------------------------------------------------------------------

export const purchasingSuppliers = sqliteTable(
  "purchasing_suppliers",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    contactName: text("contact_name"),
    email: text("email"),
    phone: text("phone"),
    address: text("address"),
    licenseNumber: text("license_number"),
    licenseExpires: text("license_expires"), // YYYY-MM-DD
    notes: text("notes"),
    archivedAt: text("archived_at"),
    ...timestamps,
  },
  (t) => [index("purchasing_suppliers_org_idx").on(t.organizationId)],
);

export const purchasingPurchaseOrders = sqliteTable(
  "purchasing_purchase_orders",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    poNumber: text("po_number").notNull(),
    /** DRAFT | SENT | CONFIRMED | RECEIVED | CANCELLED */
    status: text("status").notNull().default("DRAFT"),
    supplierId: text("supplier_id").references(() => purchasingSuppliers.id, { onDelete: "set null" }),
    supplierName: text("supplier_name").notNull(),
    supplierAddress: text("supplier_address"),
    supplierEmail: text("supplier_email"),
    supplierLicense: text("supplier_license"),
    supplierLicenseExpires: text("supplier_license_expires"),
    issueDate: text("issue_date").notNull(),
    shipToName: text("ship_to_name"),
    shipToAddress: text("ship_to_address"),
    billToName: text("bill_to_name"),
    billToAddress: text("bill_to_address"),
    /** The "Reference" box on the order (our own reference or the supplier's quotation number). */
    reference: text("reference"),
    /** The "Comments" box. */
    comments: text("comments"),
    /** The terms printed at the bottom (dating requirements, how long the order stands, pedigree needs, ...). */
    terms: text("terms"),
    fromName: text("from_name"),
    fromAddress: text("from_address"),
    fromPhone: text("from_phone"),
    fromEmail: text("from_email"),
    subtotal: real("subtotal").notNull().default(0),
    shipping: real("shipping").notNull().default(0),
    total: real("total").notNull().default(0),
    sentAt: text("sent_at"),
    emailedTo: text("emailed_to"),
    /** Revision number sent to the supplier (null or 0 = the original), with the note that went with it. */
    revision: integer("revision"),
    revisionNote: text("revision_note"),
    revisedAt: text("revised_at"),
    createdByUserId: text("created_by_user_id"),
    ...timestamps,
  },
  (t) => [
    index("purchasing_po_org_idx").on(t.organizationId, t.status),
    uniqueIndex("purchasing_po_org_seq_unique").on(t.organizationId, t.seq),
  ],
);

export const purchasingPurchaseOrderLines = sqliteTable(
  "purchasing_purchase_order_lines",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    purchaseOrderId: text("purchase_order_id")
      .notNull()
      .references(() => purchasingPurchaseOrders.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    productId: text("product_id"),
    partNumber: text("part_number"),
    ndc: text("ndc"),
    name: text("name").notNull(),
    size: text("size"),
    quantity: integer("quantity").notNull().default(1),
    unit: text("unit").notNull().default("EA"),
    unitCost: real("unit_cost").notNull().default(0),
    total: real("total").notNull().default(0),
  },
  (t) => [index("purchasing_po_lines_po_idx").on(t.purchaseOrderId)],
);


// ---------------------------------------------------------------------------
// Document templates and revisions (Purchasing and Sales)
// ---------------------------------------------------------------------------

/**
 * How a company's Quotation and Purchase Order documents look, per department: the name and logo at the top, the title and
 * wording, the footer, and a standing notice (e.g. "We are out of the office until Monday") printed on every new document
 * while it is switched on and not past its end date. One row per company, department and document type; a blank field
 * falls back to the department's own profile (Quotation Profile / Sales Company Profile) and the built-in wording.
 */
export const documentTemplates = sqliteTable(
  "document_templates",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** purchasing | sales */
    department: text("department").notNull(),
    /** QUOTATION | PURCHASE_ORDER */
    docType: text("doc_type").notNull(),
    displayName: text("display_name"),
    logoData: text("logo_data"), // base64, no data: prefix
    logoContentType: text("logo_content_type"),
    showLogo: integer("show_logo", { mode: "boolean" }).notNull().default(true),
    titleText: text("title_text"),
    introText: text("intro_text"),
    termsText: text("terms_text"),
    footerText: text("footer_text"),
    noticeText: text("notice_text"),
    noticeEnabled: integer("notice_enabled", { mode: "boolean" }).notNull().default(false),
    /** Last day the notice shows (YYYY-MM-DD); empty = until it is switched off. */
    noticeUntil: text("notice_until"),
    updatedByUserId: text("updated_by_user_id"),
    ...timestamps,
  },
  (t) => [uniqueIndex("document_templates_unique").on(t.organizationId, t.department, t.docType)],
);

/**
 * One row each time a sent document is revised: the revision number, the note that went to the other company, and the
 * document as it was just before the change (JSON), so earlier versions are never lost.
 */
export const documentRevisions = sqliteTable(
  "document_revisions",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** purchasing_po | sales_doc */
    source: text("source").notNull(),
    documentId: text("document_id").notNull(),
    revision: integer("revision").notNull(),
    note: text("note").notNull(),
    snapshot: text("snapshot").notNull(),
    emailedTo: text("emailed_to"),
    createdByUserId: text("created_by_user_id"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (t) => [index("document_revisions_doc_idx").on(t.organizationId, t.source, t.documentId)],
);


// ---------------------------------------------------------------------------
// Pricing, promo codes and affiliates (platform-wide, owned by the Lamp; see lib/pricing-rules.ts and lib/pricing-service.ts)
// ---------------------------------------------------------------------------

/** Every price the Lamp has set, oldest to newest. The newest row is the price a NEW company signs up at; companies keep the one they locked. */
export const priceBooks = sqliteTable("price_books", {
  id: text("id").primaryKey(),
  monthlyCents: integer("monthly_cents").notNull(),
  yearlyCents: integer("yearly_cents").notNull(),
  bothPercent: integer("both_percent").notNull(),
  note: text("note"),
  createdBy: text("created_by"),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
});

/** A promo code (for example BLACKFRIDAY): takes money off the first payment after the free trial. */
export const promoCodes = sqliteTable(
  "promo_codes",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    /** "percent" or "amount" */
    kind: text("kind").notNull(),
    /** Percent (1-100), or whole cents for "amount". */
    value: integer("value").notNull(),
    /** "any" | "monthly" | "yearly" */
    plan: text("plan").notNull().default("any"),
    maxUses: integer("max_uses"),
    usedCount: integer("used_count").notNull().default(0),
    startsOn: text("starts_on"),
    endsOn: text("ends_on"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    note: text("note"),
    createdBy: text("created_by"),
    ...timestamps,
  },
  (t) => [uniqueIndex("promo_codes_code_unique").on(t.code)],
);

/** Someone who applied to refer companies. Approved by the Lamp, who sets their percent and gets them a code. */
export const affiliates = sqliteTable(
  "affiliates",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    /** What they told us about how they would refer people. */
    about: text("about"),
    /** "pending" | "active" | "paused" | "declined" */
    status: text("status").notNull().default("pending"),
    code: text("code"),
    /** Their one-time cut, as a whole percent of a referred company's first payment. */
    percent: integer("percent"),
    approvedAt: text("approved_at"),
    approvedBy: text("approved_by"),
    ...timestamps,
  },
  (t) => [uniqueIndex("affiliates_code_unique").on(t.code), index("affiliates_email_idx").on(t.email)],
);

/** Which codes a company signed up with (at most one promo code and one affiliate code). `organizationId` is the company's main row. */
export const codeUses = sqliteTable(
  "code_uses",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull(),
    /** "promo" | "affiliate" */
    kind: text("kind").notNull(),
    codeId: text("code_id").notNull(),
    code: text("code").notNull(),
    /** Affiliate only: when the Lamp marked the cut as paid, and the amount that was paid. */
    paidAt: text("paid_at"),
    paidCents: integer("paid_cents"),
    paidNote: text("paid_note"),
    createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
  },
  (t) => [uniqueIndex("code_uses_org_kind_unique").on(t.organizationId, t.kind), index("code_uses_code_idx").on(t.kind, t.codeId)],
);

/**
 * How much of the free trial a business has used, so a company that leaves and comes back (even after its data was deleted) does not
 * get a new trial every time. The key is a one-way hash of EIN + state + state file number (see trial-memory-rules.ts); nothing about
 * the company can be read back from it. Deliberately has no `organization_id` column: it must outlive the company's own data.
 */
export const trialMemory = sqliteTable("trial_memory", {
  key: text("key").primaryKey(),
  /** The company that last held this business's trial (plain text, no foreign key). */
  lastOrganizationId: text("last_organization_id"),
  /** Trial days used before the current run began. */
  daysBeforeRun: integer("days_before_run").notNull().default(0),
  runStartedOn: text("run_started_on"),
  stoppedOn: text("stopped_on"),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
  updatedAt: text("updated_at").notNull().default(sql`(current_timestamp)`),
});

/**
 * The Audit Center (Accounts, Distribution operation only; see audit-rules.ts). One row per audit case. The pharmacy's name and
 * NCPDP are copied onto the case when it is made, so later edits to the pharmacy never change an old case.
 */
export const audits = sqliteTable(
  "audits",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    caseYear: integer("case_year").notNull(),
    caseSeq: integer("case_seq").notNull(),
    /** AUD-2026-00001 */
    caseNumber: text("case_number").notNull(),
    /** INTERNAL | PBM | REGULATORY */
    auditType: text("audit_type").notNull(),
    auditSubtype: text("audit_subtype"),
    status: text("status").notNull().default("NEW_REQUEST"),
    buyerId: text("buyer_id"),
    pharmacyName: text("pharmacy_name").notNull(),
    pharmacyNcpdp: text("pharmacy_ncpdp"),
    pharmacyNpi: text("pharmacy_npi"),
    pharmacyEmail: text("pharmacy_email"),
    /** The pharmacy's billing address (named in a regulatory file only when staff chose to name the pharmacy). */
    pharmacyAddress: text("pharmacy_address"),
    startDate: text("start_date"),
    endDate: text("end_date"),
    /** YES | NO | UNCLEAR (PBM and regulatory audits must answer this). */
    deviceAnswer: text("device_answer"),
    /** ALL | SELECTED, with the chosen product keys as a JSON array. */
    productScope: text("product_scope").notNull().default("ALL"),
    productKeysJson: text("product_keys_json"),
    /** Internal and regulatory files: put the pharmacy's name in the sheet. */
    includePharmacy: integer("include_pharmacy", { mode: "boolean" }).notNull().default(false),
    auditorName: text("auditor_name"),
    auditorCompany: text("auditor_company"),
    auditorEmail: text("auditor_email"),
    auditorPhone: text("auditor_phone"),
    pbmName: text("pbm_name"),
    agency: text("agency"),
    referenceNumber: text("reference_number"),
    requestReceivedOn: text("request_received_on"),
    dueOn: text("due_on"),
    /** Who the file was sent to, typed when the case is marked sent. */
    sentTo: text("sent_to"),
    sentCc: text("sent_cc"),
    sentSubject: text("sent_subject"),
    sentAt: text("sent_at"),
    sentByUserId: text("sent_by_user_id"),
    completedAt: text("completed_at"),
    completedByUserId: text("completed_by_user_id"),
    createdByUserId: text("created_by_user_id"),
    createdByName: text("created_by_name"),
    ...timestamps,
  },
  (t) => [
    index("audits_org_idx").on(t.organizationId, t.status),
    uniqueIndex("audits_case_unique").on(t.organizationId, t.caseYear, t.caseSeq),
  ],
);

/**
 * A generated file for a case. Every generation is a new version and nothing is ever overwritten. The exact Excel bytes that were
 * made are kept here (base64) together with the rows they were built from, so an old audit can always be shown as it was sent.
 */
export const auditVersions = sqliteTable(
  "audit_versions",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    auditId: text("audit_id").notNull().references(() => audits.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    templateVersion: text("template_version").notNull(),
    fileName: text("file_name").notNull(),
    fileData: text("file_data").notNull(),
    fileBytes: integer("file_bytes").notNull(),
    fileHash: text("file_hash").notNull(),
    rowCount: integer("row_count").notNull(),
    invoiceCount: integer("invoice_count").notNull().default(0),
    /** The columns and rows that went into the file (JSON), frozen at the moment of generation. */
    snapshotJson: text("snapshot_json").notNull(),
    /** The filters used (dates, products, options), so the case can be explained later. */
    filtersJson: text("filters_json"),
    createdByUserId: text("created_by_user_id"),
    createdByName: text("created_by_name"),
    /** Set when this is the version that was sent. */
    sentAt: text("sent_at"),
    createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
  },
  (t) => [uniqueIndex("audit_versions_unique").on(t.auditId, t.version), index("audit_versions_org_idx").on(t.organizationId)],
);

/** Documents attached to a case (the auditor's request, a letter, an email). Kept as they came. */
export const auditAttachments = sqliteTable(
  "audit_attachments",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    auditId: text("audit_id").notNull().references(() => audits.id, { onDelete: "cascade" }),
    /** REQUEST | OTHER | INVOICE_COPIES (the invoice PDFs that went out with an email, kept as sent) */
    kind: text("kind").notNull().default("REQUEST"),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    fileData: text("file_data").notNull(),
    fileBytes: integer("file_bytes").notNull(),
    uploadedByUserId: text("uploaded_by_user_id"),
    uploadedByName: text("uploaded_by_name"),
    createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
  },
  (t) => [index("audit_attachments_audit_idx").on(t.auditId)],
);

/**
 * One row for every time an audit file went out (by email from the company's mailbox, or sent by hand and recorded). Written once and
 * never changed or deleted: it keeps the recipients, the subject, the exact message and the exact list of files (name, size and
 * fingerprint) so the company can always show what was sent, to whom and when.
 */
export const auditSends = sqliteTable(
  "audit_sends",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    auditId: text("audit_id").notNull().references(() => audits.id, { onDelete: "cascade" }),
    versionId: text("version_id"),
    /** EMAIL | HAND */
    method: text("method").notNull().default("EMAIL"),
    fromAddress: text("from_address"),
    toAddresses: text("to_addresses").notNull(),
    ccAddresses: text("cc_addresses"),
    subject: text("subject").notNull(),
    bodyText: text("body_text"),
    /** JSON list of { name, bytes, sha256, kind, refId } for every file that went out. */
    attachmentsJson: text("attachments_json"),
    /** JSON list of the checks that were green when it was sent. */
    checksJson: text("checks_json"),
    sentByUserId: text("sent_by_user_id"),
    sentByName: text("sent_by_name"),
    sentAt: text("sent_at").notNull().default(sql`(current_timestamp)`),
  },
  (t) => [index("audit_sends_audit_idx").on(t.auditId, t.sentAt)],
);

/** The case's trail: what was done, by whom, when, and the old and new value. Notes live here too and cannot be deleted. */
export const auditEvents = sqliteTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    auditId: text("audit_id").notNull().references(() => audits.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    detail: text("detail"),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    userId: text("user_id"),
    userName: text("user_name"),
    createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
  },
  (t) => [index("audit_events_audit_idx").on(t.auditId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Department mailboxes (Mail tab in Purchasing, Sales, Receiving, Accounts and Customer Service)
// ---------------------------------------------------------------------------

/**
 * A mailbox a department works from. A SHARED mailbox belongs to the department (an admin connects the company's address for it);
 * a PERSONAL one belongs to one person (only they read it). Each connects with the company's own Google, Microsoft or other
 * account (the secret is encrypted like email_connections) and never falls back to the platform's account. Hidden, never deleted.
 */
export const mailboxes = sqliteTable(
  "mailboxes",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    /** purchasing | sales | receiving | accounts | customer-service (see lib/mail-rules.ts) */
    department: text("department").notNull(),
    /** SHARED | PERSONAL */
    kind: text("kind").notNull().default("SHARED"),
    name: text("name").notNull(),
    ownerUserId: text("owner_user_id"),
    /** GOOGLE | MICROSOFT | SMTP, empty until connected. */
    provider: text("provider"),
    accountEmail: text("account_email"),
    credentialEnc: text("credential_enc"),
    /** NOT_CONNECTED | ACTIVE | NEEDS_RECONNECT */
    status: text("status").notNull().default("NOT_CONNECTED"),
    /** Was the permission to READ the mailbox given (not only to send)? */
    canRead: integer("can_read", { mode: "boolean" }).notNull().default(false),
    lastError: text("last_error"),
    connectedByUserId: text("connected_by_user_id"),
    connectedAt: text("connected_at"),
    lastUsedAt: text("last_used_at"),
    /** Inbox sync bookmark and last check (used by the Inbox refresh). */
    syncCursor: text("sync_cursor"),
    lastSyncAt: text("last_sync_at"),
    lastSyncError: text("last_sync_error"),
    hiddenAt: text("hidden_at"),
    createdByUserId: text("created_by_user_id"),
    createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
  },
  (t) => [index("mailboxes_org_dept_idx").on(t.organizationId, t.department)],
);

/** Every message that is in a mailbox's Inbox or Sent folder: received (IN), sent from the app or by a department (OUT). */
export const mailMessages = sqliteTable(
  "mail_messages",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    mailboxId: text("mailbox_id").notNull().references(() => mailboxes.id, { onDelete: "cascade" }),
    /** IN | OUT */
    direction: text("direction").notNull(),
    /** The provider's own id for the message (Inbox sync; empty for mail sent from the app). */
    providerMessageId: text("provider_message_id"),
    threadKey: text("thread_key"),
    fromName: text("from_name"),
    fromAddress: text("from_address"),
    toAddresses: text("to_addresses"),
    ccAddresses: text("cc_addresses"),
    subject: text("subject").notNull().default(""),
    snippet: text("snippet"),
    bodyText: text("body_text"),
    bodyHtml: text("body_html"),
    hasAttachments: integer("has_attachments", { mode: "boolean" }).notNull().default(false),
    /** When it was sent or received (ISO, UTC). */
    at: text("at").notNull(),
    readAt: text("read_at"),
    sentByUserId: text("sent_by_user_id"),
    sentByName: text("sent_by_name"),
    /** COMPOSE (typed in the app) | SYSTEM (the app sent it for a department, e.g. a purchase order) | SYNC (received) */
    source: text("source").notNull().default("COMPOSE"),
    relatedKind: text("related_kind"),
    relatedId: text("related_id"),
    createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
  },
  (t) => [
    index("mail_messages_box_idx").on(t.mailboxId, t.direction, t.at),
    uniqueIndex("mail_messages_provider_idx").on(t.mailboxId, t.providerMessageId),
    index("mail_messages_org_idx").on(t.organizationId, t.at),
  ],
);

/** Drafts and scheduled emails (and the record of what became of them). Sending turns a row into SENT with a mail_messages row. */
export const mailOutbox = sqliteTable(
  "mail_outbox",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    mailboxId: text("mailbox_id").notNull().references(() => mailboxes.id, { onDelete: "cascade" }),
    /** DRAFT | SCHEDULED | SENDING | SENT | FAILED | CANCELLED (a discarded draft) */
    status: text("status").notNull().default("DRAFT"),
    toAddresses: text("to_addresses").notNull().default(""),
    ccAddresses: text("cc_addresses").notNull().default(""),
    bccAddresses: text("bcc_addresses").notNull().default(""),
    subject: text("subject").notNull().default(""),
    bodyText: text("body_text").notNull().default(""),
    /** When a scheduled email goes out (ISO, UTC) and the time zone it was picked in. */
    scheduledFor: text("scheduled_for"),
    scheduleZone: text("schedule_zone"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    messageId: text("message_id"),
    createdByUserId: text("created_by_user_id"),
    createdByName: text("created_by_name"),
    sentAt: text("sent_at"),
    createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
    updatedAt: text("updated_at").notNull().default(sql`(current_timestamp)`),
  },
  (t) => [index("mail_outbox_box_idx").on(t.mailboxId, t.status), index("mail_outbox_due_idx").on(t.status, t.scheduledFor)],
);

/** Files on a draft/scheduled email or on a message (kept as base64 like audit files). One of outboxId / messageId (often both after sending). */
export const mailAttachments = sqliteTable(
  "mail_attachments",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    mailboxId: text("mailbox_id").notNull().references(() => mailboxes.id, { onDelete: "cascade" }),
    outboxId: text("outbox_id"),
    messageId: text("message_id"),
    filename: text("filename").notNull(),
    contentType: text("content_type"),
    bytes: integer("bytes").notNull().default(0),
    dataB64: text("data_b64").notNull(),
    createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
  },
  (t) => [index("mail_attachments_outbox_idx").on(t.outboxId), index("mail_attachments_message_idx").on(t.messageId)],
);
