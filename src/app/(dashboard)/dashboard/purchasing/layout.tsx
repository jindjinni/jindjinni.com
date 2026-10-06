import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { canViewPurchasing, isAdmin, isPurchasingManager } from "@/lib/permissions";
import { DEPARTMENT_MENUS, resolveMenu } from "@/lib/sidebar-menu";
import { getSavedSidebarMenus } from "@/lib/sidebar-menu-store";
import { DepartmentSidebar } from "@/components/department-sidebar";
import { PurchasingContent } from "./purchasing-content";

// Purchasing is its own department, laid out like Receiving: a colored sidebar down the left, a full-width workspace.
// The sidebar's names and order can be changed by an Administrator (Edit menu); see lib/sidebar-menu.ts.
export default async function PurchasingLayout({ children }: { children: React.ReactNode }) {
  const org = await requireOrg();
  // Receivers (and any future role without Purchasing) are sent home.
  if (!canViewPurchasing(org.role)) redirect("/dashboard");
  const isManager = isPurchasingManager(org.role);
  const viewOnly = org.role === "accountant";

  // Everyone sees the four everyday tabs. Managers also see the Setup tabs. (Archive, Audit log and Database are under Settings.)
  const everyday = DEPARTMENT_MENUS.purchasing.items.filter((i) => !i.setup).map((i) => i.id);
  const allowed = isManager ? DEPARTMENT_MENUS.purchasing.items.map((i) => i.id) : everyday;
  const menu = resolveMenu("purchasing", await getSavedSidebarMenus(org.organizationId), allowed);

  return (
    <div className="-my-8 mx-[calc(50%-50vw)] flex min-h-[calc(100vh-3.4rem)] w-screen flex-col md:flex-row print:m-0 print:w-auto">
      <DepartmentSidebar
        dept="purchasing"
        tone="emerald"
        title={menu.title}
        orgName={org.organizationName}
        items={menu.items}
        setupLabel={menu.setupLabel}
        defaultSetupLabel={menu.defaultSetupLabel}
        canEdit={isAdmin(org.role)}
      />
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
