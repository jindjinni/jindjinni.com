import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { canViewReceiving, canWriteReceiving, isAdmin } from "@/lib/permissions";
import { storage } from "@/lib/receiving-storage";
import { resolveMenu } from "@/lib/sidebar-menu";
import { getSavedSidebarMenus } from "@/lib/sidebar-menu-store";
import { DepartmentSidebar } from "@/components/department-sidebar";

// Receiving is its own department: colored sidebar, full-width workspace. The sidebar's names and order can be
// changed by an Administrator (Edit menu); see lib/sidebar-menu.ts.
export default async function ReceivingLayout({ children }: { children: React.ReactNode }) {
  const org = await requireOrg();
  if (!canViewReceiving(org.role)) notFound();
  const showStorageNote = canWriteReceiving(org.role) && !storage.configured();
  const menu = resolveMenu("receiving", await getSavedSidebarMenus(org.organizationId));

  return (
    <div className="-my-8 mx-[calc(50%-50vw)] flex min-h-[calc(100vh-3.4rem)] w-screen flex-col md:flex-row print:m-0 print:w-auto">
      <DepartmentSidebar
        dept="receiving"
        tone="amber"
        title={menu.title}
        orgName={org.organizationName}
        items={menu.items}
        setupLabel={menu.setupLabel}
        defaultSetupLabel={menu.defaultSetupLabel}
        canEdit={isAdmin(org.role)}
      />
      <div className="min-w-0 flex-1 bg-stone-50 dark:bg-slate-950">
        {showStorageNote && (
          <p className="border-b border-yellow-300 bg-yellow-100 px-6 py-2 text-sm text-yellow-950 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-100">
            Photo storage isn&apos;t connected yet, so photos can&apos;t be added. Everything else in Receiving works.
          </p>
        )}
        {children}
      </div>
    </div>
  );
}
