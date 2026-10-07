import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { canViewInventory, canWriteInventory, isAdmin } from "@/lib/permissions";
import { resolveMenu } from "@/lib/sidebar-menu";
import { getSavedSidebarMenus } from "@/lib/sidebar-menu-store";
import { DepartmentSidebar } from "@/components/department-sidebar";

// Inventory is its own department, built like Accounts and Customer Service: a colored sidebar down the left and a
// workspace beside it. Everyone except Customer Service can look; Purchasing managers, Admin and the Owner change it.
// The sidebar's names and order can be changed by an Administrator (Edit menu); see lib/sidebar-menu.ts.
export default async function InventoryLayout({ children }: { children: React.ReactNode }) {
  const org = await requireOrg();
  if (!canViewInventory(org.role, org.access)) notFound();
  const canWrite = canWriteInventory(org.role, org.access);
  // Everyone sees the stock and its history; only people who can change Inventory see Manual Add and Estimated Prices.
  const allowed = canWrite ? undefined : ["stock", "movements"];
  const menu = resolveMenu("inventory", await getSavedSidebarMenus(org.organizationId), allowed);

  return (
    <div className="-my-8 mx-[calc(50%-50vw)] flex min-h-[calc(100vh-3.4rem)] w-screen flex-col md:flex-row print:m-0 print:w-auto">
      <DepartmentSidebar
        dept="inventory"
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
