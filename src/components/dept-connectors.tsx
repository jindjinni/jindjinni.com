import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { isAdmin } from "@/lib/permissions";
import { DEPT_CONNECTORS, connectorStatuses } from "@/lib/connectors";
import { quickbooksOn } from "@/lib/quickbooks-service";
import type { MenuDept } from "@/lib/sidebar-menu";
import { ConnectorSummaryCard } from "@/components/connector-card";

/**
 * A department's Settings -> Connectors tab: every connector the department needs to run on the company's own accounts,
 * each with its live state. Owner and admin only (the tab is hidden from everyone else and this page re-checks).
 * Connectors that serve the whole company are plugged in under the company's Settings; this page links there.
 */
export async function DepartmentConnectors({ dept }: { dept: MenuDept }) {
  const org = await requireOrg();
  if (!isAdmin(org.role)) notFound();
  const qbOn = await quickbooksOn(org.organizationId);
  const keys = (DEPT_CONNECTORS[dept] ?? []).filter((k) => k !== "quickbooks" || qbOn);
  const statuses = await connectorStatuses(org.organizationId);
  return (
    <div className="flex max-w-2xl flex-col gap-5" data-testid={`dept-connectors-${dept}`}>
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Connectors</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          The accounts this department needs, each one yours. {org.organizationName} plugs in its own logins, so nothing here is shared with any other company.
        </p>
      </div>
      {keys.map((k) => (
        <ConnectorSummaryCard key={k} status={statuses[k]} canManage />
      ))}
    </div>
  );
}
