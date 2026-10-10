import Link from "next/link";
import { requireOrg } from "@/lib/tenant";
import { getPurchasingDashboardCounts, getPurchasingQuotations } from "@/lib/queries";
import { and, eq, like, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { purchasingCustomers, users } from "@/db/schema";
import { isAdmin } from "@/lib/permissions";
import { isPlatformAdminEmail } from "@/lib/catalog-template";
import { TEST_PREFIX } from "@/lib/test-orders-data";
import { TestOrdersPanel } from "./test-orders-panel";
import { chipClass } from "@/lib/receiving-ui";
import { PILL_BASE, QUOTATION_STATUS_LABELS, QUOTATION_STATUS_PILL, totalPillClass } from "@/lib/purchasing-ui";
import { tabViewOf } from "@/lib/operations-service";
import { purchasingBlurb, singleSide } from "@/lib/operation-tabs-rules";
import { listPurchaseOrders, listSuppliers, orderCounts, purchaseOrdersEnabled } from "@/lib/purchase-order-service";
import { PO_STATUS_LABEL, isPoStatus } from "@/lib/purchase-order-rules";
import { DistributionPurchasingHome } from "./distribution-home";

// Loading test orders runs a few orders per request; give each request room.
export const maxDuration = 60;

const TILE_COLORS = [
  "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40",
  "border-sky-200 bg-sky-50 dark:border-sky-900 dark:bg-sky-950/40",
  "border-violet-200 bg-violet-50 dark:border-violet-900 dark:bg-violet-950/40",
  "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40",
];

export default async function PurchasingDashboardPage() {
  const org = await requireOrg();
  // A Distribution operation buys from wholesalers with purchase orders, so its Purchasing home is about orders and suppliers, not quotations.
  const { sides } = await tabViewOf(org.organizationId);
  if (singleSide(sides) === "distribution" && (await purchaseOrdersEnabled(org.organizationId))) {
    const [orders, suppliers, c, products] = await Promise.all([listPurchaseOrders(org.organizationId), listSuppliers(org.organizationId), orderCounts(org.organizationId), getPurchasingDashboardCounts(org.organizationId)]);
    return (
      <DistributionPurchasingHome
        draft={c.DRAFT}
        waiting={c.SENT + c.CONFIRMED}
        suppliers={suppliers.length}
        products={products.products}
        recent={orders.slice(0, 8).map((o) => ({ id: o.id, number: o.poNumber, supplier: o.supplierName, date: o.issueDate, status: isPoStatus(o.status) ? PO_STATUS_LABEL[o.status] : o.status, total: o.total }))}
      />
    );
  }
  const [counts, recentQuotations] = await Promise.all([
    getPurchasingDashboardCounts(org.organizationId),
    getPurchasingQuotations(org.organizationId),
  ]);

  // Platform-owner-only test tool (hidden for everyone else).
  let testTool: { existing: number } | null = null;
  if (isAdmin(org.role)) {
    const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, org.userId)).limit(1);
    if (isPlatformAdminEmail(u?.email)) {
      const [r] = await db
        .select({ n: sql<number>`count(*)` })
        .from(purchasingCustomers)
        .where(and(eq(purchasingCustomers.organizationId, org.organizationId), like(purchasingCustomers.customerReferenceNumber, `${TEST_PREFIX}-%`)));
      testTool = { existing: Number(r?.n ?? 0) };
    }
  }

  const tiles = [
    { label: "Open quotations", value: counts.openQuotations, href: "/dashboard/purchasing/quotations" },
    {
      label: "Open quotations value",
      value: `$${counts.openQuotationsValue.toFixed(2)}`,
      href: "/dashboard/purchasing/quotations",
    },
    { label: "Customers on file", value: counts.customers, href: "/dashboard/purchasing/customers" },
    { label: "Active products", value: counts.products, href: "/dashboard/purchasing/products" },
  ];

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Purchasing</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {purchasingBlurb(sides)}
          </p>
        </div>
        <Link
          href="/dashboard/purchasing/quotations/new"
          className="shrink-0 rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
        >
          Generate quotation
        </Link>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile, i) => (
          <Link
            key={tile.label}
            href={tile.href}
            className={`rounded-2xl border p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow ${TILE_COLORS[i % TILE_COLORS.length]}`}
          >
            <p className="text-3xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">{tile.value}</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{tile.label}</p>
          </Link>
        ))}
      </div>

      <h2 className="mt-8 text-lg font-semibold text-slate-900 dark:text-slate-50">Recent quotations</h2>
      <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3 font-medium">Reference</th>
              <th className="px-4 py-3 font-medium">Customer</th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Grand total</th>
            </tr>
          </thead>
          <tbody>
            {recentQuotations.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  No quotations yet.
                </td>
              </tr>
            )}
            {recentQuotations.slice(0, 8).map((q) => (
              <tr key={q.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                <td className="px-4 py-3">
                  <Link
                    href={`/dashboard/purchasing/quotations/${q.id}`}
                    className="font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                  >
                    {q.quotationNumber}
                  </Link>
                </td>
                <td className="px-4 py-3"><span className={`${PILL_BASE} ${chipClass(q.customerNameSnapshot ?? "")}`}>{q.customerNameSnapshot}</span></td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{q.quotationDate}</td>
                <td className="px-4 py-3">
                  <span className={`${PILL_BASE} ${QUOTATION_STATUS_PILL[q.status] ?? "bg-slate-100 text-slate-700"}`}>{QUOTATION_STATUS_LABELS[q.status] ?? q.status}</span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  <span className={`${PILL_BASE} ${totalPillClass(q.grandTotal)}`}>${q.grandTotal.toFixed(2)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {testTool && <TestOrdersPanel existing={testTool.existing} />}
    </div>
  );
}
