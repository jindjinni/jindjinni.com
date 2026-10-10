import Link from "next/link";
import { PILL_BASE, totalPillClass } from "@/lib/purchasing-ui";
import { purchasingBlurb } from "@/lib/operation-tabs-rules";

const TILE_COLORS = [
  "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40",
  "border-sky-200 bg-sky-50 dark:border-sky-900 dark:bg-sky-950/40",
  "border-violet-200 bg-violet-50 dark:border-violet-900 dark:bg-violet-950/40",
  "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40",
];

export type RecentOrder = { id: string; number: string; supplier: string; date: string; status: string; total: number };

/** The Purchasing home of a Distribution operation: purchase orders to suppliers (usually wholesalers), not quotations. */
export function DistributionPurchasingHome(p: { draft: number; waiting: number; suppliers: number; products: number; recent: RecentOrder[] }) {
  const tiles = [
    { label: "Draft purchase orders", value: p.draft, href: "/dashboard/purchasing/purchase-orders" },
    { label: "Waiting on a supplier", value: p.waiting, href: "/dashboard/purchasing/purchase-orders" },
    { label: "Suppliers on file", value: p.suppliers, href: "/dashboard/purchasing/suppliers" },
    { label: "Active products", value: p.products, href: "/dashboard/purchasing/products" },
  ];
  return (
    <div data-testid="purchasing-home" data-side="distribution">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Purchasing</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{purchasingBlurb({ wholesale: false, distribution: true })}</p>
          <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-400" data-testid="purchasing-how">
            How it goes: your wholesaler sends you an invoice, you send back a purchase order, the goods arrive in Receiving.
          </p>
        </div>
        <Link href="/dashboard/purchasing/purchase-orders/new" className="shrink-0 rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800" data-testid="make-po">
          Make purchase order
        </Link>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile, i) => (
          <Link key={tile.label} href={tile.href} className={`rounded-2xl border p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow ${TILE_COLORS[i % TILE_COLORS.length]}`}>
            <p className="text-3xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">{tile.value}</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{tile.label}</p>
          </Link>
        ))}
      </div>

      <h2 className="mt-8 text-lg font-semibold text-slate-900 dark:text-slate-50">Recent purchase orders</h2>
      <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3 font-medium">Number</th>
              <th className="px-4 py-3 font-medium">Supplier</th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {p.recent.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  No purchase orders yet. Add a supplier, then make your first one.
                </td>
              </tr>
            )}
            {p.recent.map((o) => (
              <tr key={o.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                <td className="px-4 py-3">
                  <Link href={`/dashboard/purchasing/purchase-orders/${o.id}`} className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
                    {o.number}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{o.supplier}</td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{o.date}</td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{o.status}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  <span className={`${PILL_BASE} ${totalPillClass(o.total)}`}>${o.total.toFixed(2)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
