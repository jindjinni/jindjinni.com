# Ledger — Phase 1 scaffold

Multi-tenant inventory + invoicing app, rebuilt from the Airtable "Live
Inventory + Invoice Management System" base. See `../SPEC.md` (or the
published "Ledger SaaS Blueprint" doc) for the full architecture and roadmap
— this file is just how to run what's here.

## What's actually built (Phase 1 + Phase 2 data-entry UI + buyback/receiving core workflow)

- Sign-up creates a brand-new **Organization** with its own login — every
  table in the app is scoped to `organizationId`, so companies can never see
  each other's data. See `src/lib/tenant.ts`.
- The full data model: Organizations, Users/Memberships, per-org
  Conditions, Products, the append-only inventory ledger, Receipts, Buyers,
  Invoices, Invoice Line Items. See `src/db/schema.ts`.
- Email/password auth (Auth.js), session-protected dashboard.
- **Add a product** from `/dashboard/products`.
- **Receive stock** from `/dashboard/receive` — posts straight to the
  ledger, same as the Airtable receiving automation (no approval step).
- **Create a draft invoice** (`/dashboard/invoices/new`, picking or adding a
  buyer inline), **add/remove line items** on it, then **finalize** it —
  finalize is blocked if any line would push on-hand-by-condition negative,
  mirroring automation #4's stock-block, and nothing partially posts if
  it's blocked.
- **Void a finalized invoice** — reverses its ledger entries with a
  correcting transaction rather than deleting anything; the original
  FINALIZED lines stay in history.
- Read views: inventory on-hand broken out by condition, and an invoices
  list.
- A seed script with example data so the app isn't empty on first run.
- **Buyback / receiving module**, ported from the separate "USA Test Strips
  Center / Plantarz Medical Exchange — Receiving" Airtable base and unified
  under the same organization login as inventory + invoicing — a seller's
  quote and a buyer's invoice post into the exact same `inventoryTransactions`
  ledger, so there is one real source of truth, not just shared navigation:
  - **Sellers** (`/dashboard/sellers`) — add the people/companies you buy
    product back from.
  - **Order Operations Center** (`/dashboard/buyback`) — the launch screen
    for the module, modeled on the Airtable base's own "Order Operations
    Center" interface. Every open buyback order/shipment is sorted into
    exactly one queue card (Awaiting arrival, Receiving, Accounts, Customer
    service), the same split the Airtable base did across six separate
    Receiving / Accounts / Customer Service interface pages — here it's one
    screen, derived live from the same rows, with nothing duplicated or
    cached.
  - **Quotes** (`/dashboard/buyback/orders`) — start a quote for a seller,
    add quoted line items (product, quantity, unit price); the quoted total
    computes automatically.
  - **Receiving shipments** (`/dashboard/buyback/shipments`) — once a
    package physically arrives, record packaging condition, log each
    received item against a condition grade (including items that don't
    match the quote: wrong quantity, an "extra"/unquoted item, damage,
    wrong expiration, a required return), then **complete receiving**,
    which posts every logged item straight into the inventory ledger
    (type `RECEIVED`) in one transaction and flags the shipment
    `COMPLETE` or `COMPLETE_WITH_DISCREPANCY` automatically.
  - **Accounts workflow** on a completed shipment — mark the seller paid,
    mark the customer notified — mirrors the Airtable base's accounts
    hand-off, done as manual status changes for this pass.
  - **Conditions settings** (`/dashboard/settings/conditions`) — the same
    per-org condition list used by inventory receiving now ships with the
    Airtable base's real 11-value grading scale (Mint, Dinged, Minor
    Damage, Damaged, Stained, Torn, Crushed, Opened, Unsealed, Expired,
    Other) and lets you add more.
  - The shipment detail page (Step 2 of receiving) is laid out as four
    numbered steps -- Shipment, Packaging, Verify items, Complete &
    Accounts -- mirroring the old Airtable "Receiving Intake Form"'s
    sequential flow, minus the photo-capture steps (no photo support yet).
  - **Database** (`/dashboard/database`, owners/admins only) — a raw,
    tabbed grid across every table in the app (Sellers, Buyback Orders,
    Quoted Items, Receiving Shipments, Received Items, Products,
    Conditions, Buyers, Invoices): the web equivalent of an owner opening
    the Airtable base directly instead of one of its Interface pages.
    Read-only by design -- every row here is still created or changed
    through its own purpose-built page; this is for seeing everything at
    once, which is the thing that's hardest to do once data lives behind
    separate app screens instead of one spreadsheet-like base.

- **Purchasing department** (`/dashboard/purchasing`) — a second,
  independent buy-back-style module (separate tables, separate Airtable
  source base) for buying product back from individual customers rather
  than sellers: customizable product catalog/conditions/multipliers/bonus
  tiers, fully-editable quotations with a printable, per-org-customizable
  receipt, a unified Archive across every archivable record type, a
  Quotation Summary list screen, and Shippo-backed free shipping labels for
  customers to ship items in. See `docs/purchasing-module.md` for the full
  write-up.

## What's NOT built yet (see SPEC.md "Phase 2"/"Phase 3")

- Editing a line item on an *already-finalized* invoice (the Airtable
  base's reconciliation automation #5 equivalent) — once finalized, a line
  is frozen; the only move right now is voiding the whole invoice.
- Real multi-tenant sign-up polish, team invites/roles beyond Owner, and
  Stripe billing (Phase 3).
- **Deliberately deferred from the buyback/receiving module**, to ship the
  core workflow first (the user's own call when scoping this pass):
  live carrier tracking (Shippo integration — package status is a manual
  field for now, not a live sync); automatic customer emails/texts
  (payment confirmation, packaging-issue warning, adjustment notice —
  "customer notified" is a manual checkbox for now); photo attachments on
  received items; multi-lot/multi-batch expiration dates per line (one
  expiration field per received item for now); and categorized,
  multi-select discrepancy tagging (discrepancies are a free-text note for
  now). All of these are additive — none of them change the ledger-posting
  design already in place.

## Running it locally

```bash
npm install
cp .env.example .env
# then put a real secret in .env:
openssl rand -base64 32   # paste the output as AUTH_SECRET in .env

npm run db:push    # creates local.db with the schema above
npm run db:seed    # adds the demo organization
npm run dev         # http://localhost:3000
```

Log in with `demo@example.com` / `password123`, or go to `/signup` to create
a fresh organization of your own.

## Deploying for real

1. **Database**: create a free database at [turso.tech](https://turso.tech),
   copy its URL and auth token into `DATABASE_URL` / `DATABASE_AUTH_TOKEN` in
   your production environment. Prefer Postgres instead? Only
   `src/db/client.ts` and `drizzle.config.ts` need to change — the schema and
   every query in `src/lib/queries.ts` are portable.
2. **Hosting**: push this to GitHub and import it into
   [vercel.com](https://vercel.com) — it auto-detects Next.js. Set the same
   env vars there (`DATABASE_URL`, `DATABASE_AUTH_TOKEN`, `AUTH_SECRET`).
   `trustHost: true` in `src/lib/auth.ts` is already set for exactly this.
   The `build` script runs `drizzle-kit push --force` before `next build`,
   so every deploy syncs the schema against the live Turso database
   automatically — no separate migration step to remember.
3. **Billing**: not wired up yet (Phase 3) — add Stripe when you're ready to
   charge companies.

## Project layout

```
src/db/schema.ts        the entire data model, one table per comment block
src/db/client.ts        database connection (swap this file to change DB)
src/lib/auth.ts         Auth.js config (email/password, JWT sessions)
src/lib/tenant.ts       requireOrg() -- the one place org-scoping is enforced
src/lib/queries.ts      data access layer; pages call these, never `db` directly
src/app/(dashboard)/    everything behind login
src/app/actions/        server actions (signup, login, onboarding, buyback.ts, conditions.ts)
scripts/seed.ts         example data
```
