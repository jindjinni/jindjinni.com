# Ledger — Phase 1 scaffold

Multi-tenant inventory + invoicing app, rebuilt from the Airtable "Live
Inventory + Invoice Management System" base. See `../SPEC.md` (or the
published "Ledger SaaS Blueprint" doc) for the full architecture and roadmap
— this file is just how to run what's here.

## What's actually built (Phase 1 + Phase 2 data-entry UI)

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

## What's NOT built yet (see SPEC.md "Phase 2"/"Phase 3")

- Editing a line item on an *already-finalized* invoice (the Airtable
  base's reconciliation automation #5 equivalent) — once finalized, a line
  is frozen; the only move right now is voiding the whole invoice.
- Real multi-tenant sign-up polish, team invites/roles beyond Owner, and
  Stripe billing (Phase 3).
- The buyback/receiving-from-individual-sellers workflow (a separate
  Airtable base, "USA Test Strips Center") is not modeled here yet —
  planned as its own schema + UI pass.

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
src/app/actions/        server actions (signup, login, onboarding)
scripts/seed.ts         example data
```
