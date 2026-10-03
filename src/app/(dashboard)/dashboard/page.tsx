import Link from "next/link";
import { requireOrg } from "@/lib/tenant";
import { getDashboardCounts } from "@/lib/queries";

export default async function DashboardOverviewPage() {
  const org = await requireOrg();
  const counts = await getDashboardCounts(org.organizationId);

  const tiles = [
    { label: "Products tracked", value: counts.products, href: "/dashboard/products" },
    { label: "Buyers on file", value: counts.buyers, href: "/dashboard/invoices" },
    { label: "Draft invoices", value: counts.draftInvoices, href: "/dashboard/invoices" },
    {
      label: "Shipments awaiting payment",
      value: counts.openShipments,
      href: "/dashboard/buyback/shipments",
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">
        Welcome back
      </h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Phase 1 scaffold -- inventory ledger and invoicing, scoped to{" "}
        {org.organizationName}.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => (
          <Link
            key={tile.label}
            href={tile.href}
            className="rounded-xl border border-slate-200 bg-white p-5 hover:border-emerald-300 dark:border-slate-800 dark:bg-slate-900"
          >
            <p className="text-3xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">
              {tile.value}
            </p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{tile.label}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
