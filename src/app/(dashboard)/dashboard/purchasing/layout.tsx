import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { canViewPurchasing, isPurchasingManager } from "@/lib/permissions";
import { PurchasingTabs } from "./purchasing-tabs";

export default async function PurchasingLayout({ children }: { children: React.ReactNode }) {
  const org = await requireOrg();
  // Receivers (and any future role without Purchasing) are sent home.
  if (!canViewPurchasing(org.role)) redirect("/dashboard");
  const isManager = isPurchasingManager(org.role);
  const viewOnly = org.role === "accountant";

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
          { href: "/dashboard/purchasing/archive", label: "Archive" },
          { href: "/dashboard/purchasing/audit-log", label: "Audit log" },
        ]
      : viewOnly
        ? [{ href: "/dashboard/purchasing/audit-log", label: "Audit log" }]
        : []),
  ];

  return (
    <div className="pz">
      <PurchasingTabs items={links} />
      {viewOnly && (
        <p className="mb-4 rounded-md bg-sky-50 px-3 py-2 text-sm text-sky-800 print:hidden dark:bg-sky-950 dark:text-sky-200">
          You have view-only access to Purchasing. You can look at quotations, customers and receipts, but not change them.
        </p>
      )}
      {children}
    </div>
  );
}
