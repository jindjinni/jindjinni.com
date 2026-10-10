import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { canViewAccounts, isAdmin } from "@/lib/permissions";
import { storage } from "@/lib/receiving-storage";
import { menuIdsFor, resolveMenu } from "@/lib/sidebar-menu";
import { tabViewOf } from "@/lib/operations-service";
import { withoutHidden } from "@/lib/operation-tabs-rules";
import { auditCenterOn } from "@/lib/audit-access";
import { reminderCount } from "@/lib/audit-insights-service";
import { pastDueCount, receivablesOn } from "@/lib/receivable-service";
import { quickbooksOn } from "@/lib/quickbooks-service";
import { attentionBadge, payablesOn } from "@/lib/payable-service";
import { withMailTab } from "@/lib/mail-access";
import { mailBadges } from "@/lib/mailbox-service";
import { getSavedSidebarMenus } from "@/lib/sidebar-menu-store";
import { DepartmentSidebar } from "@/components/department-sidebar";

// Accounts is its own department, built like Purchasing and Receiving: a colored sidebar down the left and a
// workspace beside it. Only the accountant, Admin and Owner can open it. The sidebar's names and order can be
// changed by an Administrator (Edit menu); see lib/sidebar-menu.ts.
async function auditBadges(organizationId: string): Promise<Record<string, number>> {
  const n = await reminderCount(organizationId);
  return n > 0 ? { "audit-center": n } : {};
}

async function collectBadges(organizationId: string): Promise<Record<string, number>> {
  const n = await pastDueCount(organizationId);
  return n > 0 ? { "to-be-collected": n } : {};
}

async function billBadges(organizationId: string): Promise<Record<string, number>> {
  const n = await attentionBadge(organizationId);
  return n > 0 ? { "supplier-bills": n } : {};
}

export default async function AccountsLayout({ children }: { children: React.ReactNode }) {
  const org = await requireOrg();
  if (!canViewAccounts(org.role, org.access)) notFound();
  const view = await tabViewOf(org.organizationId);
  // The Audit Center tab appears only in a Distribution operation, and only while its rollout switch is on.
  const ids = withoutHidden(menuIdsFor("accounts", { connectors: isAdmin(org.role) }), view.sides, "accounts", view.showAll);
  const [auditOn, recvOn, qbOn, billsOn] = await Promise.all([auditCenterOn(org.organizationId), receivablesOn(org.organizationId), quickbooksOn(org.organizationId), payablesOn(org.organizationId)]);
  const shown = ids.filter((id) => (auditOn || id !== "audit-center") && (recvOn || id !== "to-be-collected") && (billsOn || id !== "supplier-bills") && (qbOn || (id !== "quickbooks" && id !== "connectors")));
  const menu = resolveMenu("accounts", await getSavedSidebarMenus(org.organizationId), await withMailTab(shown, org.organizationId));

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
        badges={{ ...(await mailBadges(org, "accounts")), ...(auditOn && canViewAccounts(org.role, org.access) ? await auditBadges(org.organizationId) : {}), ...(recvOn ? await collectBadges(org.organizationId) : {}), ...(billsOn ? await billBadges(org.organizationId) : {}) }}
      />
      <div className="min-w-0 flex-1 bg-stone-50 dark:bg-slate-950">
        {!storage.configured() && (
          <p className="border-b border-yellow-300 bg-yellow-100 print:hidden px-6 py-2 text-sm text-yellow-950 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-100">
            File storage isn&apos;t connected yet, so payment receipts can&apos;t be attached. Everything else in Accounts works.
          </p>
        )}
        <div className="pz">{children}</div>
      </div>
    </div>
  );
}
