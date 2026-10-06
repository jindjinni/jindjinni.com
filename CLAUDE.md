@AGENTS.md

# Project standards (read docs/FOUNDATION.md for the full list)

- **Department sidebar.** Every department uses the same colored left sidebar (`src/components/department-sidebar.tsx`) with that department's tabs and a Setup group. The company's Administrator can rename and re-order the tabs ("Edit menu"); the tab lists live in `src/lib/sidebar-menu.ts` (`DEPARTMENT_MENUS`) and are saved per company in `organizations.sidebar_menus`. A new department (Accounts, Customer Service, Inventory, Sales, ...) must be built this way: add its tabs to `DEPARTMENT_MENUS`, use `<DepartmentSidebar>` in its layout, add its color to `src/lib/theme.ts`.
- **Clean look, always (the platform's design direction).** Wherever a page would show a lot of data, group it under closed, expandable headings by whatever the data naturally belongs to (a brand, a day, a customer, a status), each heading showing its totals and any warning badge, and let a search or filter open them. Show the summary first and the detail on request; never a wall of rows. Apply this to every new page, not only the ones below.
- **Tidy lists.** Every Receiving record or database page (Daily Receiving, Received Items, Lot & Serial Tracker, and any new one) groups what was received under its brand (Dexcom, Omnipod, ...) as one closed, expandable line with totals and any recall badge; searching or filtering opens them. Use `groupByBrand` in `src/lib/receiving-brand.ts`.
- Plain language for people; the server decides; one place for each rule; tests and `tsc`/`eslint` clean before every commit.
