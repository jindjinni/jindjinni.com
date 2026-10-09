import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { isAdmin } from "@/lib/permissions";
import { getOperations, operationsEnabled } from "@/lib/operations-service";
import { SIDE_INFO } from "@/lib/operations-rules";
import { OperationsCards } from "./operations-cards";

export const dynamic = "force-dynamic";

/** Settings -> Operations: switch the Wholesale and Distribution sides on or off (both free), with a plain explanation of each. */
export default async function OperationsPage() {
  const org = await requireOrg();
  if (!(await operationsEnabled(org.organizationId))) notFound();
  if (!isAdmin(org.role)) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">This page is limited to owners and admins.</p>;
  }
  const ops = await getOperations(org.organizationId);
  return (
    <div className="max-w-3xl" data-testid="operations-page">
      <h2 className="text-xl font-bold text-slate-900 dark:text-slate-50">Operations</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Your company can run two kinds of business. <strong>Both are free</strong>, and you can switch either one on or off whenever you like. Switching a side off only hides it. Nothing is deleted, and it comes back exactly as you left it.
      </p>
      <OperationsCards
        sides={ops.sides}
        confirmed={ops.confirmed}
        since={ops.since}
        info={[SIDE_INFO.wholesale, SIDE_INFO.distribution]}
        canEdit={!org.viewAs}
      />
    </div>
  );
}
