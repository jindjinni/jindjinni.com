import Link from "next/link";
import { requireOrg } from "@/lib/tenant";
import {
  getProducts,
  getConditions,
  getBuyers,
  getInvoices,
  getSellers,
  getBuybackOrders,
  getBuybackOrderItemsAll,
  getReceivingShipments,
  getReceivedItemsAll,
} from "@/lib/queries";

/**
 * Admin-only raw view across every table this app has data in -- the web
 * equivalent of an owner opening the Airtable base directly instead of one
 * of its Interface pages. Read-only: every one of these rows is still
 * created/changed through its purpose-built workflow page (Sellers,
 * Buyback, Receiving, Invoices, Settings) -- this is purely for seeing
 * everything at once, the thing that's hardest to do once data lives behind
 * separate app screens instead of one spreadsheet-like base.
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
  if (org.role === "staff") {
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
    products,
    conditions,
    buyers,
    invoices,
    sellers,
    buybackOrders,
    quotedItems,
    shipments,
    receivedItems,
  ] = await Promise.all([
    getProducts(org.organizationId),
    getConditions(org.organizationId),
    getBuyers(org.organizationId),
    getInvoices(org.organizationId),
    getSellers(org.organizationId),
    getBuybackOrders(org.organizationId),
    getBuybackOrderItemsAll(org.organizationId),
    getReceivingShipments(org.organizationId),
    getReceivedItemsAll(org.organizationId),
  ]);

  const money = (n: number) => `$${n.toFixed(2)}`;
  const date = (s: string | null) => (s ? new Date(s).toLocaleString() : "—");

  const tables = {
    sellers: {
      label: "Sellers",
      ...buildTable(sellers, [
        { header: "Name", render: (r) => r.name },
        { header: "Email", render: (r) => r.email ?? "—" },
        { header: "Phone", render: (r) => r.phone ?? "—" },
        { header: "Shipping address", render: (r) => r.shippingAddress ?? "—" },
        { header: "Created", render: (r) => date(r.createdAt) },
      ]),
    },
    buybackOrders: {
      label: "Buyback orders (quotes)",
      ...buildTable(buybackOrders, [
        { header: "Seller", render: (r) => r.sellerName },
        { header: "Reference", render: (r) => r.orderReference ?? "—" },
        { header: "Order date", render: (r) => r.orderDate ?? "—" },
        { header: "Package status", render: (r) => r.packageStatus },
        { header: "Quoted total", align: "right" as const, render: (r) => money(r.quotedTotal) },
      ]),
    },
    quotedItems: {
      label: "Quoted items",
      ...buildTable(quotedItems, [
        { header: "Seller", render: (r) => r.sellerName },
        { header: "Order ref", render: (r) => r.orderReference ?? "—" },
        { header: "Line", render: (r) => r.lineLabel },
        { header: "Code / variant", render: (r) => r.productCodeVariant ?? "—" },
        { header: "Qty quoted", align: "right" as const, render: (r) => r.quotedQuantity },
        { header: "Unit price", align: "right" as const, render: (r) => money(r.quotedUnitPrice) },
      ]),
    },
    shipments: {
      label: "Receiving shipments",
      ...buildTable(shipments, [
        { header: "Seller", render: (r) => r.sellerName },
        { header: "Order ref", render: (r) => r.orderReference ?? "—" },
        { header: "Receiving status", render: (r) => r.receivingStatus.replaceAll("_", " ") },
        { header: "Accounts decision", render: (r) => r.accountsDecision.replaceAll("_", " ") },
        { header: "Accounts status", render: (r) => r.accountsStatus },
        { header: "Created", render: (r) => date(r.createdAt) },
      ]),
    },
    receivedItems: {
      label: "Received items",
      ...buildTable(receivedItems, [
        { header: "Seller", render: (r) => r.sellerName },
        { header: "Order ref", render: (r) => r.orderReference ?? "—" },
        { header: "Product", render: (r) => r.productName },
        { header: "Condition", render: (r) => r.conditionName },
        { header: "Source", render: (r) => (r.itemSource === "EXTRA" ? "Extra" : "Quoted") },
        { header: "Qty received", align: "right" as const, render: (r) => r.quantityReceived },
        { header: "Posted to inventory", render: (r) => (r.postedToInventory ? "Yes" : "No") },
      ]),
    },
    products: {
      label: "Products",
      ...buildTable(products, [
        { header: "Name", render: (r) => r.name },
        { header: "SKU", render: (r) => r.sku ?? "—" },
        { header: "Base price", align: "right" as const, render: (r) => money(r.basePrice) },
        { header: "Created", render: (r) => date(r.createdAt) },
      ]),
    },
    conditions: {
      label: "Conditions",
      ...buildTable(conditions, [
        { header: "Name", render: (r) => r.name },
        { header: "Sort order", align: "right" as const, render: (r) => r.sortOrder },
      ]),
    },
    buyers: {
      label: "Buyers",
      ...buildTable(buyers, [
        { header: "Company", render: (r) => r.companyName },
        { header: "Contact", render: (r) => r.contactName ?? "—" },
        { header: "Email", render: (r) => r.email ?? "—" },
        { header: "Phone", render: (r) => r.phone ?? "—" },
      ]),
    },
    invoices: {
      label: "Invoices",
      ...buildTable(invoices, [
        { header: "Number", render: (r) => r.invoiceNumber ?? "—" },
        { header: "Buyer", render: (r) => r.buyerCompanyName ?? "—" },
        { header: "Status", render: (r) => r.status },
        { header: "Date", render: (r) => r.invoiceDate },
        { header: "Total", align: "right" as const, render: (r) => money(r.total) },
      ]),
    },
  };

  type TableKey = keyof typeof tables;
  const order: TableKey[] = [
    "sellers",
    "buybackOrders",
    "quotedItems",
    "shipments",
    "receivedItems",
    "products",
    "conditions",
    "buyers",
    "invoices",
  ];
  const activeKey: TableKey = (order as string[]).includes(requestedTable ?? "")
    ? (requestedTable as TableKey)
    : "sellers";
  const active = tables[activeKey];

  return (
    <div>
      <p className="text-sm">
        <Link href="/dashboard/buyback" className="text-emerald-700 hover:underline dark:text-emerald-400">
          ← Operations Center
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-50">
        Database
      </h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Every table, raw. Owners and admins only. Create or edit records
        through their own page -- this is a read-only view across all of
        them at once.
      </p>

      <div className="mt-6 flex flex-wrap gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
        {order.map((key) => (
          <Link
            key={key}
            href={`/dashboard/database?table=${key}`}
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
