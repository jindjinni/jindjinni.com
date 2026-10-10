import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { canManageSalesSettings, canViewSales, isAdmin } from "@/lib/permissions";
import { menuIdsFor, resolveMenu } from "@/lib/sidebar-menu";
import { getSavedSidebarMenus } from "@/lib/sidebar-menu-store";
import { DepartmentSidebar } from "@/components/department-sidebar";
import { salesOrdersOn } from "@/lib/sales-service";
import { quickbooksOn } from "@/lib/quickbooks-service";
import { operationTypeOf, purchaseOrdersEnabled } from "@/lib/purchase-order-service";
import { primaryDocument } from "@/lib/operation-type";
import { operationsOf } from "@/lib/operations-service";
import { wordsFor } from "@/lib/operations-rules";
import { withMailTab } from "@/lib/mail-access";
import { mailBadges } from "@/lib/mailbox-service";

// Sales is its own department, built like Inventory: a colored sidebar down the left and a workspace beside it.
// Quotations, invoices, buyers and prices are for the Purchasing roles (the accountant only looks); the company profile
// the invoices come from is for Purchasing managers, Admin and the Owner.
export default async function SalesLayout({ children }: { children: React.ReactNode }) {
  const org = await requireOrg();
  if (!canViewSales(org.role, org.access)) notFound();
  const everyday = ["quotations", "purchase-orders", "sales-orders", "invoices", "buyers", "price-comparison", "quickbooks", "mail"];
  const allowed = menuIdsFor("sales", { connectors: isAdmin(org.role), base: canManageSalesSettings(org.role) ? undefined : everyday });
  // Purchase orders and the document templates come with the "purchase-orders" rollout feature; a Distributor sees Purchase Orders first.
  const [poOn, soOn, qbOn, operation, sides] = await Promise.all([purchaseOrdersEnabled(org.organizationId), salesOrdersOn(org.organizationId), quickbooksOn(org.organizationId), operationTypeOf(org.organizationId), operationsOf(org.organizationId)]);
  const menu = resolveMenu(
    "sales",
    await getSavedSidebarMenus(org.organizationId),
    await withMailTab((poOn ? allowed : allowed.filter((id) => id !== "purchase-orders" && id !== "templates")).filter((id) => soOn || id !== "sales-orders").filter((id) => qbOn || id !== "quickbooks"), org.organizationId),
    { purchaseOrdersFirst: primaryDocument(operation) === "PURCHASE_ORDER", defaultLabels: { buyers: wordsFor(sides).buyers } },
  );

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
        badges={await mailBadges(org, "sales")}
      />
      <div className="min-w-0 flex-1 bg-stone-50 dark:bg-slate-950">
        <div className="pz px-4 py-6 sm:px-8">{children}</div>
      </div>
    </div>
  );
}
