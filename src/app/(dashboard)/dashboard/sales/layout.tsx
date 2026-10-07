import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { canManageSalesSettings, canViewSales, isAdmin } from "@/lib/permissions";
import { resolveMenu } from "@/lib/sidebar-menu";
import { getSavedSidebarMenus } from "@/lib/sidebar-menu-store";
import { DepartmentSidebar } from "@/components/department-sidebar";

// Sales is its own department, built like Inventory: a colored sidebar down the left and a workspace beside it.
// Quotations, invoices, buyers and prices are for the Purchasing roles (the accountant only looks); the company profile
// the invoices come from is for Purchasing managers, Admin and the Owner.
export default async function SalesLayout({ children }: { children: React.ReactNode }) {
  const org = await requireOrg();
  if (!canViewSales(org.role)) notFound();
  const all = ["quotations", "invoices", "buyers", "price-comparison", "company-profile"];
  const allowed = canManageSalesSettings(org.role) ? undefined : all.filter((id) => id !== "company-profile");
  const menu = resolveMenu("sales", await getSavedSidebarMenus(org.organizationId), allowed);

  return (
    <div className="-my-8 mx-[calc(50%-50vw)] flex min-h-[calc(100vh-3.4rem)] w-screen flex-col md:flex-row print:m-0 print:w-auto">
      <DepartmentSidebar
        dept="sales"
        tone="amber"
        title={menu.title}
        orgName={org.organizationName}
        items={menu.items}
        setupLabel={menu.setupLabel}
        defaultSetupLabel={menu.defaultSetupLabel}
        canEdit={isAdmin(org.role)}
      />
      <div className="min-w-0 flex-1 bg-stone-50 dark:bg-slate-950">
        <div className="pz px-4 py-6 sm:px-8">{children}</div>
      </div>
    </div>
  );
}
