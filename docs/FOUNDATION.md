# Foundation v1 — the benchmark for this system

Set on 2026-10-06 by Radcliffe Green (Plantarz Property Solutions LLC). This is the baseline the platform is built on.
Everything we add or change from here is measured against it. It is tagged in git as `foundation-v1`.

To see exactly what the foundation was at any time: `git show foundation-v1`.
To compare today's code with it: `git diff foundation-v1`.
To go back to it if something breaks badly: `git checkout foundation-v1` (or branch from it).

## What the foundation includes

**Platform**
- Multi-tenant: every company has its own login and data. Every table is scoped by `organizationId`; all server code gets the company from `src/lib/tenant.ts` (`requireOrg`), never from the browser.
- Roles in one file, `src/lib/permissions.ts`: owner, admin, purchasing manager, purchasing agent, receiver, accountant (and legacy staff). No scattered role checks.
- Sign-up with email verification, invitations, team management, Admin panel, company close/purge, data export, appearance (themes), terms acceptance, business profile.
- Hosting and services: GitHub, Vercel (with Blob storage and a nightly purge cron), Turso (libSQL), Next.js App Router, Drizzle, Auth.js, Shippo (labels), pdf-lib (PDFs). Resend email and the Anthropic label reader are optional.

**Purchasing department**
- Products catalog, categories, conditions, expiration ranges, per-product multipliers, bonus tiers, customers (with duplicate checks), archive, audit log.
- Quotations with the automatic price: Standard price x Expiry % x Condition %, rounded to cents. Price is editable by managers only; any manual price is clearly marked (`src/lib/purchasing-price.ts`; the server recalculates on save).
- Quotation import from spreadsheet, shipping labels, receipt PDF with its own layout.

**Receiving department** (the most critical module: no counterfeit or recalled items get through)
- Seven-step intake of each shipment, with photos, checks and the received-items board.
- Step 6 Lot & serial numbers: typed lists or clear group photos read in the browser (barcodes + text), the receiver confirms every number, the server then checks repeats, made-up or wrong-shaped serials, expiry and recall lists. Photo reading only ever suggests; it never decides.
- Recall lists and automatic recall checks; near-match warnings.
- Step 7 Adjustments: "Adjustment Quotation" shows right inside the adjustment screen with the reason, and refreshes itself after save, regenerate and finalize.
- Test-lock so test shipments cannot mix with real ones.

## The standards we keep (the "style" of the system)

1. **Plain language for people.** Screens, messages and PDFs say what happened and what to do next. No internal terms.
2. **Automatic first, manual by permission.** The system works out the answer (price, reason, checks); a person may adjust it only when their role allows, and an adjustment is visible as such.
3. **The server decides.** Anything the screen shows early (live price, photo-read numbers) is re-checked and recalculated on the server before it is saved.
4. **Safety over speed in Receiving.** A suspicious number, a repeat, or a recall hit stops or flags the item. A clean result never claims to prove authenticity ("OK" is not proof), and the receiver confirms what the reader suggested.
5. **Documents populate where you are working.** Finished quotations and adjustments appear in the same screen, simple format, with the reason; no extra windows or steps.
6. **One place for each rule.** Permissions in `permissions.ts`, pricing in `purchasing-price.ts`, number lists in `receiving-number-list.ts`, scan checks in `receiving-scan-core.ts`. Change the rule there, not in screens.
7. **Every change leaves a trail.** Receiving and Purchasing actions write to the audit log; money is never silently altered; voids reverse instead of delete.
8. **Tested before shipping.** Logic suites for numbers, scans, recalls, stress, and test-lock; browser end-to-end checks for the screens we change; `tsc` and `eslint` clean before a commit.
9. **Small, named commits.** One feature per commit, with a plain-language message.
10. **Every department has the same sidebar, and the company can edit it.** Each department (Purchasing, Receiving, and every one we add: Accounts, Customer Service, Inventory, Sales) opens with a colored sidebar down the left showing the company name and that department's tabs, with Setup pages under their own heading. An Administrator or Master Admin can press "Edit menu" at the bottom of the sidebar to rename any tab (and the Setup heading) and move tabs up or down; it saves for the whole company and has a "put the original names and order back" button. It is one shared component, `src/components/department-sidebar.tsx`, driven by one list per department in `src/lib/sidebar-menu.ts` (`DEPARTMENT_MENUS`) and saved in `organizations.sidebar_menus`. **To add a department:** add its tabs to `DEPARTMENT_MENUS`, use `<DepartmentSidebar>` in its layout (copy `receiving/layout.tsx`), and add its color in `src/lib/theme.ts`. Renaming and ordering then work with no more code. Tab names only change the sidebar; page titles stay as built. Roles decide which tabs a person sees (see the Purchasing layout), never the saved menu.
11. **A clean look, always: group the data, closed until opened.** The direction for the whole platform: wherever a page holds a lot of data, group it under closed, expandable headings by what it naturally belongs to (brand, day, customer, status), with totals and any warning badge on the closed line; a search or filter opens them; summary first, detail on request. For Receiving specifically, brand is the grouping. Every Receiving record or database page (Daily Receiving, Received Items, the Lot & Serial Tracker, and any new one such as Inventory or the weekly trackers) is grouped under the product brand, one closed line per brand with its totals and any recall or "needs a look" badge, opening to the detail. A search or filter opens the groups. The grouping rule lives in `src/lib/receiving-brand.ts`.

## Known open items at the time of this foundation

- Not yet built: Accounts Department, Accounting Paid Orders, Customer Service Department (including emails), Weekly Received Tracker, Products Received Tracker.
- Dexcom G7 receiver recall has no official lot/serial list to load; the Omnipod official lot list can be pasted in Step 6 > Manage recalls.
- Duplicate "5-6 months" expiration ranges (50% and 80%) to tidy up.
- Group-photo reading needs real-product testing to tune it.
- Shippo finalization, domain transfer follow-up, optional email sender (`RESEND_FROM_EMAIL`) and `ANTHROPIC_API_KEY`.
- Tenant-separation audit (offered, not yet run).

## How to change the foundation

The foundation is a starting line, not a freeze. When we deliberately improve it, we tag the new state (`foundation-v2`, ...) and add a short note here saying what changed and why. Ordinary work does not need a new tag.
