# Purchasing department — foundation

Status snapshot as of 2026-10-04. This is the department where the business
buys product back from individual customers (diabetic test strips, sensors,
etc.), the same basic shape as the existing Buyback module but modeled on a
separate Airtable base ("USA Test Strips Center / Plantarz Medical
Exchange — Purchasing") and kept as its own set of tables/routes rather than
merged into Buyback's. Everything lives under `/dashboard/purchasing`.

## Data model

All tables in `src/db/schema.ts`, prefixed `purchasing*`, scoped by
`organizationId` like every other table in the app:

- **purchasingCustomers** — the people the business buys from. Holds contact
  info and a structured shipping address (`addressStreet1/2`,
  `addressCity/State/Zip/Country`, `isResidential`). Soft-delete via
  `archivedAt`.
- **purchasingCategories**, **purchasingProducts** — the product catalog.
  Products soft-delete via `active: boolean`.
- **purchasingConditions** — per-org condition grades (e.g. "Mint only — no
  damages"), `active: boolean`.
- **purchasingProductConditions** — which conditions are valid for a given
  product (products aren't all gradeable the same way).
- **purchasingExpirationRanges** — month-until-expiry buckets (e.g. "7+
  months"), `active: boolean`.
- **purchasingProductMultipliers** — per (product, expiration range) price
  multiplier; falls back to 1 if no row matches. Edited from the standalone
  **Product Multipliers** page (`/dashboard/purchasing/product-multipliers`).
- **purchasingBonusTiers** — automatic bonus-by-total-spend tiers (e.g.
  "$100+ → $1 bonus"), `active: boolean`. Unconditionally hard-deletable —
  quotations only ever snapshot a tier's label + amount, never hold a live
  FK to it.
- **purchasingQuotations** — the core record (internally also called the
  "Overall Order"). Snapshots `customerNameSnapshot/Email/Phone` at creation
  time; `status` (QUOTED/CONFIRMED/RECEIVED/CANCELLED); money fields
  (`itemsTotal`, `bonusAmount`, `deductionAmount`, `grandTotal`); tracking
  fields (`carrier`, `trackingNumber`, `packageStatus`); and the Shippo
  label-tracking fields described below. Soft-delete via `archivedAt`.
- **purchasingQuotedItems** — line items on a quotation. Freezes
  `productNameSnapshot`, the resolved `finalUnitPrice`, and
  `appliedMultiplier` at the time the line was added/edited, so catalog or
  multiplier changes later never retroactively change a past quotation.
- **purchasingAuditLog** — append-only field-level change history (who
  changed what, old value → new value), written by every action that the
  framework singled out: prices, quantities, totals, tracking, customer
  info, catalog rules, multipliers, receipt settings, shipping labels.
- **purchasingReceiptVersions** — a saved snapshot each time a receipt is
  (re)generated, for history.
- **purchasingReceiptSettings** — one row per org, every column nullable; a
  null column falls back to a hardcoded default string at read time. This is
  what the **Quotation Receipt Layout** settings page edits.

## Permissions

Reuses the same owner/admin/staff roles as the rest of the app:

- **staff** = Purchasing Agent — create customers/quotations, add quoted
  lines at the computed price, generate receipts and shipping labels.
- **admin** = Purchasing Manager — everything staff can do, plus edit the
  catalog (products/categories/conditions/expiration
  ranges/multipliers/bonus tiers), archive records, override a line's
  computed price, edit the Quotation Receipt Layout.
- **owner** = Master Admin — no restrictions.

`requireManager()` in `src/app/actions/purchasing.ts` is the one place this
is enforced for manager-only actions.

## Quotations

`/dashboard/purchasing/quotations/[id]` is the detail/edit page. Fully
editable at any time, not just at creation — this was an explicit
requirement (a purchasing agent needs to go back and fix a quotation if a
customer says something's wrong, even after it was generated):

- **Add a line**: product → condition → expiration range → quantity, with
  the unit price auto-computed (base price × condition multiplier ×
  expiration-range multiplier, falling back through per-product override →
  range default → 1) or manually overridden (manager/owner only, audit
  logged).
- **Edit a line** in place (`quoted-item-row.tsx` / `resolveQuotedItemPricing`
  in `purchasing.ts`, shared between add and edit so the two paths can never
  price a line differently). Leaving the override-price field blank
  recomputes automatically from the newly chosen condition/expiration
  instead of silently re-applying the old price.
- **$0 products = "not accepting"**: a product whose standard price is $0
  shows a "Not accepting" badge on the Products list and "— not accepting"
  in the quote product picker. Adding (or recomputing) a line for one is
  refused with an explanatory error; a manager can still quote it by
  entering an override price.
- **Remove a line** — isolated per-row state/confirm dialog, no restrictions.
- Automatic bonus tier and any manual deduction (with a required reason)
  both factor into `grandTotal`, recomputed via `recomputeQuotationTotals()`
  after every line change.
- **Archive / restore** a whole quotation (manager+); archived quotations
  still show in the Archive page and keep full history, never hard-deleted.

### Receipt (`/quotations/[id]/receipt`)

Printable customer-facing receipt. Wording is pulled through
`resolvePurchasingReceiptSettings()` (raw, keeps the literal `{business}`
placeholder) → `renderReceiptCopy()` (substitutes the real business name) —
deliberately split so the settings editor never bakes in a point-in-time
business name. The three separate policy boxes (hidden damage / packaging
damage / lost packages) were condensed into one disclaimer sentence to save
print space, per an explicit request.

### Quotation Receipt Layout (`/dashboard/purchasing/receipt-layout`, manager+)

Per-org customization of every piece of copy on the receipt — banner text,
free-shipping suffix, disclaimer (intro / return policy / damage summary),
mint-condition heading + bullets, payment-timing text, footer thank-you —
tabbed by section, each tab its own form bound to
`updatePurchasingReceiptSettings()`. A blank field + Save clears that column
back to `null`, which resolves to the built-in default — so every existing
org renders byte-identical to before until someone actually opts into a
change.

### Quotation Summary (`/dashboard/purchasing/quotations`)

Redesigned list screen matching a specific reference layout: a blue banner
with embedded search, "+ New Quotation", a From/To date-range filter with
Clear Dates, a page-size selector, a client-side CSV Export button, and a
table (Date / Reference # / Customer Name / Email / Phone / Total Price /
Shipping Info / Items Quoted For / Tracking # / Actions). Breaks out of the
dashboard shell's usual `max-w-5xl` (`quotations/page.tsx`) so all ten
columns have room. Each row's 3-dot menu: **View PDF** and **Download**
both link to the receipt page (Download appends `?autoprint=1`, which
`print-button.tsx` picks up to fire `window.print()` automatically on load
— the closest approximation to a one-click PDF download without a
server-side PDF renderer); **Edit** links to the detail page; **Ship**
links to the detail page's shipping-label section.

Backing query: `getPurchasingQuotationsSummary()` in `src/lib/queries.ts` —
joins each quotation against its customer's *live* address/contact info
(not the frozen snapshot columns), so an address filled in after the quote
was given shows up immediately, plus a quoted-items summary built
client-side from a second grouped query.

## Shipping labels (Shippo)

Purchasing's counterpart to Buyback's existing label generation
(`src/lib/shippo.ts`, `src/app/actions/buyback.ts`), but **the direction is
reversed from Buyback's**: this business is only ever the *receiver* of
these packages, never the sender.

- `generatePurchasingShippingLabel()` in `purchasing.ts`: `addressFrom` =
  the customer (their address on file), `addressTo` = this org's fixed
  receiving address (`organizations.shipFrom*` columns, set once in
  Settings → Business — reused as the *destination* here, not the origin,
  despite the column names). `addressReturn` is pinned explicitly to the
  customer too, rather than relying on Shippo's implicit "defaults to
  addressFrom" behavior.
- UI (`quotations/[id]/shipping-label-section.tsx`): simplified to
  carrier-choice-and-go — a Service dropdown (UPS Ground, defaulted,
  regardless of whatever was last saved; USPS Ground one click away) plus a
  Generate button. Parcel L×W×H/weight sit behind a collapsed "Package
  size (optional)" disclosure, defaulting to 10×10×10in / 3lb.
  Amber banners point at exactly what's missing (business receiving
  address in Settings → Business, or the specific customer's address) when
  either side isn't complete.
- Once generated: a "Label ready" panel with an Open/print link, plus a
  separately labeled **tracking link with a one-click Copy button**, sized
  for pasting straight into a text/email to the customer. `labelTrackingNumber`
  also mirrors onto the quotation's general `trackingNumber`/`carrier`
  columns so the Quotation Summary table's Tracking # column picks it up
  without a schema join.
- `SHIPPO_API_KEY` is already set in Vercel production (a **live** token,
  originally wired up for Buyback — purchasing a label there is a real
  charge, not a free test). New schema columns mirror `buybackOrders`'
  label-tracking shape: `labelCarrier`, `parcelLengthIn/WidthIn/HeightIn/WeightLb`,
  `labelStatus`, `shippoShipmentId/RateId/TransactionId`, `labelUrl`,
  `labelTrackingNumber`, `labelTrackingUrl`, `labelError`,
  `labelGeneratedAt`.

**Known issue, unresolved**: UPS is connected and active on the Shippo
account, but returns zero rates (no error message, just silently absent)
for the business's real receiving address (353 West Inez Road, Unit 5,
Dothan, AL 36301) — confirmed via a direct Shippo API test, not an app bug.
USPS Ground Advantage quotes fine for the same address/parcel (~$7.52).
Until this is sorted out with Shippo support, use the Service dropdown to
pick **USPS Ground** when generating a real label. UPS is still the
hardcoded default carrier per an explicit request, so this will keep
surfacing the "No UPS Ground rate was returned for this address" error
until Shippo resolves it on their end.

**Worth a second look, not changed**: Buyback's `generateShippingLabel`
builds `addressFrom` from the org and `addressTo` from the seller — the
opposite direction from Purchasing's "we're only ever the receiver" model.
Not touched this pass since it wasn't asked for and Buyback's label flow is
already live/in use, but flag it for review if Buyback is supposed to work
the same way.

## Expiry options per product

Each product has its own list of **expiry options** (month ranges, each with a
payout multiplier) -- `purchasingProductMultipliers`, edited on the product
page ("Expiry Options") or the Product Multipliers page. The quotation form's
Expiry dropdown shows **only the chosen product's options** (a product with
none set up yet falls back to every month range; a product with exactly one
option preselects it). `purchasingProducts.noExpiration` marks items that
never expire (receivers, readers): the Expiry field is replaced by "Does not
expire" and no month range is stored.

**Auto-assign by brand** (Product Multipliers page, manager+): rules in
`src/lib/purchasing-expiry-rules.ts`, matched on product name/category, with a
preview of exactly which products each rule covers before anything is written
(`src/lib/purchasing-expiry-plan.ts`). Additive by default (never overwrites
an option that's already set, including a hand-tuned multiplier); an optional
checkbox also removes any other options so a product keeps only the rule's.
Safe to run repeatedly; every change is written to the audit log. Current rules:

| Products | Expiry options |
| --- | --- |
| Test strips (OneTouch, Freestyle, Contour, Accu-Chek, True Metrix; meters/lancets excluded) | 10+ months, 100% |
| Dexcom G7 sensors (10 & 15 day) | 7+ months 100%; 5-6 months 50% |
| Dexcom G7 receivers | does not expire |
| Omnipod (all) | 8+ months 100%; 5-7 months 50% |
| Medtronic (all) | 12+ months, 100% |
| Freestyle Libre sensors | 4+ months, 100% |
| Freestyle Libre readers | does not expire |

Not covered by any rule yet (left untouched): Dexcom G6, Dexcom Stelo, BD pen
needles, Tandem, meters, lancets. Add a rule in the rules file to cover them.

## Archive (`/dashboard/purchasing/archive`, manager+)

One unified read + restore surface across every archivable record type in
the department, even though the underlying mechanism differs by type
(`archivedAt` timestamp for customers/products/quotations vs. `active:
boolean` for conditions/expiration ranges/bonus tiers/categories): 7 tabs
(quotations, products, customers, conditions, ranges, bonus tiers,
categories), each with a count badge and a Restore action per row. Defaults
to the first tab that actually has something archived.

The underlying rule, enforced throughout: **Archive** is reversible (hides
from new use, keeps full history) and is always available. **Delete** is a
permanent hard `db.delete()`, only allowed when a record has zero
quotation-usage history (every delete action checks
`purchasingQuotedItems` for FK usage first and steers to Archive instead if
any is found) — except bonus tiers, which are unconditionally
hard-deletable since quotations only ever snapshot a tier's label + amount.

## Not built yet / explicitly deferred

- The "Users & Access" system (invitations, roles, department-level
  access) — currently every member of an org has the same
  owner/admin/staff role across the whole app, not per-department.
- Resend custom-domain DNS verification for `mail.jindjinni.com` — paused
  indefinitely per an earlier request; signup verification codes log to
  the console in dev and email in production via the existing
  `RESEND_API_KEY`, unrelated to this custom domain.
- Real PDF generation for "Download" (currently the browser's native
  print-to-PDF, auto-triggered).

## Deployment

Same pipeline as the rest of the app — no Purchasing-specific steps: a
schema push runs as part of `npm run build` (via `scripts/safe-push.ts`, see
below), so every schema change in `src/db/schema.ts` auto-migrates against
the live Turso database on the next Vercel deploy. No manual migration step,
unless safe-push blocks a destructive change. See the root
`README.md` for the general run/deploy instructions.

## Schema pushes are guarded (safe-push)

`npm run build` runs `scripts/safe-push.ts` instead of `drizzle-kit push --force`. It computes the
same schema plan, then **stops the deploy** if the plan would `DELETE FROM` / `DROP TABLE` a table that
has rows, or drop a column. Background: on SQLite/libSQL, adding a `NOT NULL` column to a populated table
makes drizzle-kit emit `delete from <table>` first, and `--force` approved it silently -- that wiped the
products table on 2026-10-04 (and quotations earlier the same day). Rule of thumb: new columns on existing
tables must be **nullable** (or the table must be empty). `ALLOW_DESTRUCTIVE_SCHEMA=1` overrides it for one
deploy when the loss is intended.

## NDC and restoring product details

- `purchasing_products.ndc` is a real (nullable) column. Existing "NDC ..." text in Notes is copied into it
  automatically (`backfillProductNdcs`, runs on the Products page; it only fills blanks).
- Products > "Update prices & details from CSV/Excel" matches rows by Name and fills Standard Price,
  Product Code, NDC and Notes. By default it only fills blanks / $0 prices; every price change is audit-logged.
- The Products list shows each product's expiry options with payout % (same numbers as Product Multipliers).
