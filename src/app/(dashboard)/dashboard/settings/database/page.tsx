import { isPurchasingManager } from "@/lib/permissions";
import Link from "next/link";
import { requireOrg } from "@/lib/tenant";
import {
  getPurchasingCustomers,
  getPurchasingCategories,
  getPurchasingProducts,
  getPurchasingConditions,
  getPurchasingExpirationRanges,
  getPurchasingProductMultipliersAll,
  getPurchasingBonusTiers,
  getPurchasingQuotations,
  getPurchasingQuotedItemsAll,
  getPurchasingReceiptVersionsAll,
  getPurchasingAuditLog,
  purchasingCustomerName,
  getBusinessProfile,
} from "@/lib/queries";

/**
 * Admin-only raw view across every Purchasing table -- the web equivalent
 * of an owner opening the base directly instead of one purpose-built
 * screen. Read-only: every one of these rows is still created/changed
 * through its own Purchasing page -- this is purely for seeing everything
 * at once, the thing that's hardest to do once data lives behind separate
 * app screens instead of one spreadsheet-like base.
 */

type Column<T> = { header: string; align?: "right"; render: (row: T) => React.ReactNode };

function buildTable<T>(rows: T[], columns: Column<T>[]) {
  return { rows, columns };
}

export default async function DatabasePage({
  searchParams,
}: {
  searchParams: Promise<{ table?: string }>;
}) {
  const org = await requireOrg();
  if (!isPurchasingManager(org.role)) {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Database</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          This view is limited to owners and admins.
        </p>
      </div>
    );
  }

  const { table: requestedTable } = await searchParams;

  const [
    businessProfile,
    customers,
    categories,
    products,
    conditions,
    expirationRanges,
    productMultipliers,
    bonusTiers,
    quotations,
    quotedItems,
    receiptVersions,
    auditLog,
  ] = await Promise.all([
    getBusinessProfile(org.organizationId),
    getPurchasingCustomers(org.organizationId, { includeArchived: true }),
    getPurchasingCategories(org.organizationId, { includeInactive: true }),
    getPurchasingProducts(org.organizationId, { includeInactive: true }),
    getPurchasingConditions(org.organizationId, { includeInactive: true }),
    getPurchasingExpirationRanges(org.organizationId, { includeInactive: true }),
    getPurchasingProductMultipliersAll(org.organizationId),
    getPurchasingBonusTiers(org.organizationId, { includeInactive: true }),
    getPurchasingQuotations(org.organizationId, { includeArchived: true }),
    getPurchasingQuotedItemsAll(org.organizationId),
    getPurchasingReceiptVersionsAll(org.organizationId),
    getPurchasingAuditLog(org.organizationId),
  ]);

  const money = (n: number) => `$${n.toFixed(2)}`;
  const date = (s: string | null | undefined) => (s ? new Date(s).toLocaleString() : "—");

  const tables = {
    businessProfile: {
      label: "Business Profile",
      ...buildTable(businessProfile ? [businessProfile] : [], [
        { header: "Legal name", render: () => org.organizationName },
        { header: "DBA", render: (r) => r.dbaName ?? "—" },
        { header: "Name shown on documents", render: (r) => r.nameDisplayPreference },
        { header: "Business phone", render: (r) => r.businessPhone ?? "—" },
        { header: "Business email", render: (r) => r.businessEmail ?? "—" },
        { header: "Website", render: (r) => r.website ?? "—" },
        {
          header: "Business address",
          render: (r) =>
            [r.businessAddressStreet1, r.businessAddressCity, r.businessAddressState, r.businessAddressZip]
              .filter(Boolean)
              .join(", ") || "—",
        },
        { header: "Primary contact", render: (r) => [r.primaryContactFirstName, r.primaryContactLastName].filter(Boolean).join(" ") || "—" },
        { header: "Logo", render: (r) => (r.logoData ? "Uploaded" : "—") },
        { header: "Updated", render: (r) => date(r.updatedAt) },
      ]),
    },
    customers: {
      label: "Customers",
      ...buildTable(customers, [
        { header: "Name", render: (r) => purchasingCustomerName(r) },
        { header: "Reference #", render: (r) => r.customerReferenceNumber ?? "—" },
        { header: "Email", render: (r) => r.email ?? "—" },
        { header: "Phone", render: (r) => r.phone ?? "—" },
        { header: "City", render: (r) => r.addressCity ?? "—" },
        { header: "State", render: (r) => r.addressState ?? "—" },
        { header: "Active", render: (r) => (r.archivedAt ? "Archived" : r.active ? "Yes" : "No") },
      ]),
    },
    categories: {
      label: "Categories",
      ...buildTable(categories, [
        { header: "Name", render: (r) => r.name },
        { header: "Sort order", align: "right" as const, render: (r) => r.sortOrder },
        { header: "Active", render: (r) => (r.active ? "Yes" : "No") },
      ]),
    },
    products: {
      label: "Products",
      ...buildTable(products, [
        { header: "Name", render: (r) => r.name },
        { header: "Category", render: (r) => r.categoryName ?? "—" },
        { header: "Code", render: (r) => r.productCode ?? "—" },
        { header: "Standard price", align: "right" as const, render: (r) => money(r.standardPrice) },
        { header: "Active", render: (r) => (r.archivedAt ? "Archived" : r.active ? "Yes" : "No") },
      ]),
    },
    conditions: {
      label: "Conditions",
      ...buildTable(conditions, [
        { header: "Name", render: (r) => r.name },
        { header: "Multiplier", align: "right" as const, render: (r) => r.multiplier },
        { header: "Sort order", align: "right" as const, render: (r) => r.sortOrder },
        { header: "Active", render: (r) => (r.active ? "Yes" : "No") },
      ]),
    },
    expirationRanges: {
      label: "Expiration ranges",
      ...buildTable(expirationRanges, [
        { header: "Label", render: (r) => r.label },
        { header: "Min months", align: "right" as const, render: (r) => r.minMonths ?? "—" },
        { header: "Max months", align: "right" as const, render: (r) => r.maxMonths ?? "—" },
        { header: "Active", render: (r) => (r.active ? "Yes" : "No") },
      ]),
    },
    productMultipliers: {
      label: "Product multipliers",
      ...buildTable(productMultipliers, [
        { header: "Product", render: (r) => r.productName },
        { header: "Expiration range", render: (r) => r.expirationRangeLabel },
        { header: "Multiplier", align: "right" as const, render: (r) => r.multiplier },
      ]),
    },
    bonusTiers: {
      label: "Bonus tiers",
      ...buildTable(bonusTiers, [
        { header: "Threshold amount", align: "right" as const, render: (r) => money(r.thresholdAmount) },
        { header: "Bonus amount", align: "right" as const, render: (r) => money(r.bonusAmount) },
        { header: "Active", render: (r) => (r.active ? "Yes" : "No") },
      ]),
    },
    quotations: {
      label: "Quotations",
      ...buildTable(quotations, [
        { header: "Number", render: (r) => r.quotationNumber },
        { header: "Customer", render: (r) => r.customerNameSnapshot },
        { header: "Status", render: (r) => r.status },
        { header: "Items total", align: "right" as const, render: (r) => money(r.itemsTotal) },
        { header: "Bonus", align: "right" as const, render: (r) => money(r.bonusAmount) },
        { header: "Grand total", align: "right" as const, render: (r) => money(r.grandTotal) },
        { header: "Package status", render: (r) => r.packageStatus },
        { header: "Created", render: (r) => date(r.createdAt) },
      ]),
    },
    quotedItems: {
      label: "Quoted items",
      ...buildTable(quotedItems, [
        { header: "Quotation #", render: (r) => r.quotationNumber },
        { header: "Product", render: (r) => r.productNameSnapshot },
        { header: "Condition", render: (r) => r.conditionNameSnapshot },
        { header: "Expiration range", render: (r) => r.expirationRangeLabelSnapshot },
        { header: "Qty", align: "right" as const, render: (r) => r.quantity },
        { header: "Unit price", align: "right" as const, render: (r) => money(r.finalUnitPrice) },
        { header: "Line total", align: "right" as const, render: (r) => money(r.lineTotal) },
      ]),
    },
    receiptVersions: {
      label: "Receipt versions",
      ...buildTable(receiptVersions, [
        { header: "Quotation #", render: (r) => r.quotationNumber },
        { header: "Version", align: "right" as const, render: (r) => r.version },
        { header: "Generated", render: (r) => date(r.generatedAt) },
      ]),
    },
    auditLog: {
      label: "Audit log",
      ...buildTable(auditLog, [
        { header: "Record type", render: (r) => r.recordType },
        { header: "Field", render: (r) => r.fieldName },
        { header: "Previous", render: (r) => r.previousValue ?? "—" },
        { header: "New", render: (r) => r.newValue ?? "—" },
        { header: "Changed", render: (r) => date(r.changedAt) },
      ]),
    },
  };

  type TableKey = keyof typeof tables;
  const order: TableKey[] = [
    "businessProfile",
    "customers",
    "categories",
    "products",
    "conditions",
    "expirationRanges",
    "productMultipliers",
    "bonusTiers",
    "quotations",
    "quotedItems",
    "receiptVersions",
    "auditLog",
  ];
  const activeKey: TableKey = (order as string[]).includes(requestedTable ?? "")
    ? (requestedTable as TableKey)
    : "businessProfile";
  const active = tables[activeKey];

  return (
    <div>
      <p className="text-sm">
        <Link href="/dashboard/purchasing" className="text-emerald-700 hover:underline dark:text-emerald-400">
          ← Purchasing
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-50">
        Database
      </h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Every Purchasing table, raw. Owners and admins only. Create or edit records
        through their own page -- this is a read-only view across all of
        them at once.
      </p>

      <div className="mt-6 flex flex-wrap gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
        {order.map((key) => (
          <Link
            key={key}
            href={`/dashboard/settings/database?table=${key}`}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${
              key === activeKey
                ? "bg-slate-900 text-white dark:bg-slate-50 dark:text-slate-900"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            }`}
          >
            {tables[key].label} · {tables[key].rows.length}
          </Link>
        ))}
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
            <tr>
              {active.columns.map((c) => (
                <th
                  key={c.header}
                  className={`px-4 py-3 font-medium ${c.align === "right" ? "text-right" : ""}`}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {active.rows.length === 0 && (
              <tr>
                <td colSpan={active.columns.length} className="px-4 py-8 text-center text-slate-400">
                  No rows in {active.label.toLowerCase()} yet.
                </td>
              </tr>
            )}
            {active.rows.map((row: unknown, i: number) => (
              // Admin grid is read-only across heterogeneous row shapes --
              // row identity doesn't need to survive a reorder, so index is fine here.
              <tr key={i} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                {active.columns.map((c) => (
                  <td
                    key={c.header}
                    className={`px-4 py-2.5 text-slate-700 dark:text-slate-300 ${c.align === "right" ? "text-right tabular-nums" : ""}`}
                  >
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {c.render(row as any)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
