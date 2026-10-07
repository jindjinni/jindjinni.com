import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { canViewHr, isAdmin } from "@/lib/permissions";
import { resolveMenu } from "@/lib/sidebar-menu";
import { getSavedSidebarMenus } from "@/lib/sidebar-menu-store";
import { DepartmentSidebar } from "@/components/department-sidebar";

// HR is its own department with the same colored sidebar as the others. Only the Admin and the Owner can open it:
// it shows every person's hours and what they did.
export default async function HrLayout({ children }: { children: React.ReactNode }) {
  const org = await requireOrg();
  if (!canViewHr(org.role)) notFound();
  const menu = resolveMenu("hr", await getSavedSidebarMenus(org.organizationId));

  return (
    <div className="-my-8 mx-[calc(50%-50vw)] flex min-h-[calc(100vh-3.4rem)] w-screen flex-col md:flex-row print:m-0 print:w-auto">
      <DepartmentSidebar
        dept="hr"
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
