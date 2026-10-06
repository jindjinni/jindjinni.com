@AGENTS.md

# Project standards (read docs/FOUNDATION.md for the full list)

- **Department sidebar.** Every department uses the same colored left sidebar (`src/components/department-sidebar.tsx`) with that department's tabs and a Setup group. The company's Administrator can rename and re-order the tabs ("Edit menu"); the tab lists live in `src/lib/sidebar-menu.ts` (`DEPARTMENT_MENUS`) and are saved per company in `organizations.sidebar_menus`. A new department (Accounts, Customer Service, Inventory, Sales, ...) must be built this way: add its tabs to `DEPARTMENT_MENUS`, use `<DepartmentSidebar>` in its layout, add its color to `src/lib/theme.ts`.
- **Tidy lists.** Every Receiving record or database page (Daily Receiving, Received Items, Lot & Serial Tracker, and any new one) groups what was received under its brand (Dexcom, Omnipod, ...) as one closed, expandable line with totals and any recall badge; searching or filtering opens them. Use `groupByBrand` in `src/lib/receiving-brand.ts`.
- Plain language for people; the server decides; one place for each rule; tests and `tsc`/`eslint` clean before every commit.
