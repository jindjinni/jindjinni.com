import Link from "next/link";
import { requireOrg } from "@/lib/tenant";

export default async function PurchasingLayout({ children }: { children: React.ReactNode }) {
  const org = await requireOrg();
  const isManager = org.role !== "staff";

  const links = [
    { href: "/dashboard/purchasing", label: "Dashboard" },
    { href: "/dashboard/purchasing/quotations", label: "Quotations" },
    { href: "/dashboard/purchasing/customers", label: "Customers" },
    { href: "/dashboard/purchasing/products", label: "Products" },
    ...(isManager
      ? [
          { href: "/dashboard/purchasing/categories", label: "Categories" },
          { href: "/dashboard/purchasing/conditions", label: "Conditions" },
          { href: "/dashboard/purchasing/expiration-ranges", label: "Month Range" },
          { href: "/dashboard/purchasing/product-multipliers", label: "Product Multipliers" },
          { href: "/dashboard/purchasing/bonus-tiers", label: "Bonus tiers" },
          { href: "/dashboard/purchasing/receipt-layout", label: "Quotation Receipt Layout" },
          { href: "/dashboard/purchasing/audit-log", label: "Audit log" },
        ]
      : []),
  ];

  return (
    <div>
      <nav className="mb-6 flex flex-wrap gap-x-5 gap-y-2 border-b border-slate-200 pb-3 text-sm print:hidden dark:border-slate-800">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="text-slate-600 hover:text-emerald-700 dark:text-slate-400 dark:hover:text-emerald-400"
          >
            {l.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
