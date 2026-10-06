import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { canViewPurchasing, isPurchasingManager } from "@/lib/permissions";
import { PurchasingContent, PurchasingNav, type NavEntry } from "./purchasing-tabs";

// Purchasing is its own department, laid out like Receiving: a colored sidebar down the left, a full-width workspace.
export default async function PurchasingLayout({ children }: { children: React.ReactNode }) {
  const org = await requireOrg();
  // Receivers (and any future role without Purchasing) are sent home.
  if (!canViewPurchasing(org.role)) redirect("/dashboard");
  const isManager = isPurchasingManager(org.role);
  const viewOnly = org.role === "accountant";

  const links: NavEntry[] = [
    { href: "/dashboard/purchasing", label: "Dashboard", icon: "🏠" },
    { href: "/dashboard/purchasing/quotations", label: "Quotations", icon: "🧾" },
    { href: "/dashboard/purchasing/customers", label: "Customers", icon: "👥" },
    { href: "/dashboard/purchasing/products", label: "Products", icon: "🏷️" },
    ...(isManager
      ? [
          { href: "/dashboard/purchasing/categories", label: "Categories", secondary: true },
          { href: "/dashboard/purchasing/conditions", label: "Conditions", secondary: true },
          { href: "/dashboard/purchasing/expiration-ranges", label: "Month Range", secondary: true },
          { href: "/dashboard/purchasing/product-multipliers", label: "Product Multipliers", secondary: true },
          { href: "/dashboard/purchasing/bonus-tiers", label: "Bonus tiers", secondary: true },
          { href: "/dashboard/purchasing/receipt-layout", label: "Quotation Receipt Layout", secondary: true },
          { href: "/dashboard/purchasing/archive", label: "Archive", secondary: true },
          { href: "/dashboard/purchasing/audit-log", label: "Audit log", secondary: true },
        ]
      : viewOnly
        ? [{ href: "/dashboard/purchasing/audit-log", label: "Audit log", icon: "📜" }]
        : []),
  ];

  return (
    <div className="-my-8 mx-[calc(50%-50vw)] flex min-h-[calc(100vh-3.4rem)] w-screen flex-col md:flex-row print:m-0 print:w-auto">
      <PurchasingNav orgName={org.organizationName} items={links} />
      <div className="min-w-0 flex-1 bg-stone-50 dark:bg-slate-950">
        <PurchasingContent>
          {viewOnly && (
            <p className="mb-4 rounded-md bg-sky-50 px-3 py-2 text-sm text-sky-800 print:hidden dark:bg-sky-950 dark:text-sky-200">
              You have view-only access to Purchasing. You can look at quotations, customers and receipts, but not change them.
            </p>
          )}
          {children}
        </PurchasingContent>
      </div>
    </div>
  );
}
