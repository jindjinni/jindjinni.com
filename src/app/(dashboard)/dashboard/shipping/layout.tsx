import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { canViewShipping, isAdmin } from "@/lib/permissions";
import { menuIdsFor, resolveMenu } from "@/lib/sidebar-menu";
import { getSavedSidebarMenus } from "@/lib/sidebar-menu-store";
import { DepartmentSidebar } from "@/components/department-sidebar";
import { shippingOn } from "@/lib/shipping-service";
import { withMailTab } from "@/lib/mail-access";
import { mailBadges } from "@/lib/mailbox-service";

// Shipping is its own department, built like Sales: a colored sidebar down the left and a workspace beside it.
// Orders going out to buyers, their boxes and tracking, and the one "your order has shipped" email for each shipment.
export default async function ShippingLayout({ children }: { children: React.ReactNode }) {
  const org = await requireOrg();
  if (!canViewShipping(org.role, org.access) || !(await shippingOn(org.organizationId))) notFound();
  const allowed = menuIdsFor("shipping", { connectors: isAdmin(org.role) });
  const menu = resolveMenu("shipping", await getSavedSidebarMenus(org.organizationId), await withMailTab(allowed, org.organizationId));

  return (
    <div className="-my-8 mx-[calc(50%-50vw)] flex min-h-[calc(100vh-3.4rem)] w-screen flex-col md:flex-row print:m-0 print:w-auto">
      <DepartmentSidebar
        dept="shipping"
        tone="amber"
        title={menu.title}
        orgName={org.organizationName}
        items={menu.items}
        setupLabel={menu.setupLabel}
        defaultSetupLabel={menu.defaultSetupLabel}
        canEdit={isAdmin(org.role)}
        badges={await mailBadges(org, "shipping")}
      />
      <div className="min-w-0 flex-1 bg-stone-50 dark:bg-slate-950">
        <div className="pz px-4 py-6 sm:px-8">{children}</div>
      </div>
    </div>
  );
}
