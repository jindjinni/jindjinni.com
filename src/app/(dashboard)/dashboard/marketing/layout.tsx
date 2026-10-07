import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { canViewMarketing, isAdmin } from "@/lib/permissions";
import { menuIdsFor, resolveMenu } from "@/lib/sidebar-menu";
import { getSavedSidebarMenus } from "@/lib/sidebar-menu-store";
import { DepartmentSidebar } from "@/components/department-sidebar";

// Marketing is its own department with the same colored sidebar as the others. Admin, the Owner and Purchasing
// managers can use it: it reaches customers by email (and, later, by text).
export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const org = await requireOrg();
  if (!canViewMarketing(org.role, org.access)) notFound();
  const menu = resolveMenu("marketing", await getSavedSidebarMenus(org.organizationId), menuIdsFor("marketing", { connectors: isAdmin(org.role) }));

  return (
    <div className="-my-8 mx-[calc(50%-50vw)] flex min-h-[calc(100vh-3.4rem)] w-screen flex-col md:flex-row print:m-0 print:w-auto">
      <DepartmentSidebar
        dept="marketing"
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
