import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { canViewPurchasing, canWritePurchasing, isAdmin, isPurchasingManager } from "@/lib/permissions";
import { DEPARTMENT_MENUS, menuIdsFor, resolveMenu } from "@/lib/sidebar-menu";
import { getSavedSidebarMenus } from "@/lib/sidebar-menu-store";
import { DepartmentSidebar } from "@/components/department-sidebar";
import { PurchasingContent } from "./purchasing-content";
import { operationTypeOf, purchaseOrdersEnabled } from "@/lib/purchase-order-service";
import { primaryDocument } from "@/lib/operation-type";
import { tabViewOf } from "@/lib/operations-service";
import { withoutHidden } from "@/lib/operation-tabs-rules";

// Purchasing is its own department, laid out like Receiving: a colored sidebar down the left, a full-width workspace.
// The sidebar's names and order can be changed by an Administrator (Edit menu); see lib/sidebar-menu.ts.
export default async function PurchasingLayout({ children }: { children: React.ReactNode }) {
  const org = await requireOrg();
  // Receivers (and any future role without Purchasing) are sent home.
  if (!canViewPurchasing(org.role, org.access)) redirect("/dashboard");
  const isManager = isPurchasingManager(org.role);
  const viewOnly = !canWritePurchasing(org.role, org.access);

  // Everyone sees the four everyday tabs. Managers also see the Setup tabs. (Archive, Audit log and Database are under Settings.)
  const everyday = DEPARTMENT_MENUS.purchasing.items.filter((i) => !i.setup).map((i) => i.id);
  const allowed = menuIdsFor("purchasing", { connectors: isAdmin(org.role), base: isManager ? undefined : everyday });
  // Purchase orders, suppliers and the document templates come with the "purchase-orders" rollout feature, for every company.
  // The sign-up answer only decides which comes first: a Distributor sees Purchase Orders above Quotations.
  const [poOn, operation, view] = await Promise.all([purchaseOrdersEnabled(org.organizationId), operationTypeOf(org.organizationId), tabViewOf(org.organizationId)]);
  const menu = resolveMenu(
    "purchasing",
    await getSavedSidebarMenus(org.organizationId),
    // A Wholesale operation does not show Purchase Orders and Suppliers; a Distribution operation does not show Quotations and the tabs that price
    // packages from individuals (lib/operation-tabs-rules.ts). The pages still open by address and an owner can switch every tab on.
    withoutHidden(poOn ? allowed : allowed.filter((id) => id !== "purchase-orders" && id !== "suppliers" && id !== "templates"), view.sides, "purchasing", view.showAll),
    { purchaseOrdersFirst: primaryDocument(operation) === "PURCHASE_ORDER" },
  );

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
