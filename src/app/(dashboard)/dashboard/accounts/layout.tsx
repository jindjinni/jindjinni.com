import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { canViewAccounts, isAdmin } from "@/lib/permissions";
import { storage } from "@/lib/receiving-storage";
import { resolveMenu } from "@/lib/sidebar-menu";
import { getSavedSidebarMenus } from "@/lib/sidebar-menu-store";
import { DepartmentSidebar } from "@/components/department-sidebar";

// Accounts is its own department, built like Purchasing and Receiving: a colored sidebar down the left and a
// workspace beside it. Only the accountant, Admin and Owner can open it. The sidebar's names and order can be
// changed by an Administrator (Edit menu); see lib/sidebar-menu.ts.
export default async function AccountsLayout({ children }: { children: React.ReactNode }) {
  const org = await requireOrg();
  if (!canViewAccounts(org.role)) notFound();
  const menu = resolveMenu("accounts", await getSavedSidebarMenus(org.organizationId));

  return (
    <div className="-my-8 mx-[calc(50%-50vw)] flex min-h-[calc(100vh-3.4rem)] w-screen flex-col md:flex-row print:m-0 print:w-auto">
      <DepartmentSidebar
        dept="accounts"
        tone="emerald"
        title={menu.title}
        orgName={org.organizationName}
        items={menu.items}
        setupLabel={menu.setupLabel}
        defaultSetupLabel={menu.defaultSetupLabel}
        canEdit={isAdmin(org.role)}
      />
      <div className="min-w-0 flex-1 bg-stone-50 dark:bg-slate-950">
        {!storage.configured() && (
          <p className="border-b border-yellow-300 bg-yellow-100 px-6 py-2 text-sm text-yellow-950 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-100">
            File storage isn&apos;t connected yet, so payment receipts can&apos;t be attached. Everything else in Accounts works.
          </p>
        )}
        <div className="pz">{children}</div>
      </div>
    </div>
  );
}
