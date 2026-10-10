import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { canViewCustomerService, isAdmin } from "@/lib/permissions";
import { storage } from "@/lib/receiving-storage";
import { menuIdsFor, resolveMenu } from "@/lib/sidebar-menu";
import { getSavedSidebarMenus } from "@/lib/sidebar-menu-store";
import { DepartmentSidebar } from "@/components/department-sidebar";
import { withMailTab } from "@/lib/mail-access";

// Customer Service is its own department, built like Accounts: a colored sidebar down the left and a workspace beside it.
// Only the Customer Service role, Admin and Owner can open it. This is the one place customers are emailed about a paid order.
export default async function CustomerServiceLayout({ children }: { children: React.ReactNode }) {
  const org = await requireOrg();
  if (!canViewCustomerService(org.role, org.access)) notFound();
  const menu = resolveMenu("customer-service", await getSavedSidebarMenus(org.organizationId), await withMailTab(menuIdsFor("customer-service", { connectors: isAdmin(org.role) }), org.organizationId));

  return (
    <div className="-my-8 mx-[calc(50%-50vw)] flex min-h-[calc(100vh-3.4rem)] w-screen flex-col md:flex-row print:m-0 print:w-auto">
      <DepartmentSidebar
        dept="customer-service"
        tone="amber"
        title={menu.title}
        orgName={org.organizationName}
        items={menu.items}
        setupLabel={menu.setupLabel}
        defaultSetupLabel={menu.defaultSetupLabel}
        canEdit={isAdmin(org.role)}
      />
      <div className="min-w-0 flex-1 bg-stone-50 dark:bg-slate-950">
        {!storage.configured() && (
          <p className="border-b border-yellow-300 bg-yellow-100 print:hidden px-6 py-2 text-sm text-yellow-950 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-100">
            File storage isn&apos;t connected yet, so payment receipts and photos can&apos;t be attached to emails. Everything else in Customer Service works.
          </p>
        )}
        <div className="pz px-4 py-6 sm:px-8">{children}</div>
      </div>
    </div>
  );
}
