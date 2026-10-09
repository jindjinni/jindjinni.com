import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { organizations } from "@/db/schema";
import { requireOrg } from "@/lib/tenant";
import { isAdmin } from "@/lib/permissions";
import { operationsEnabled } from "@/lib/operations-service";
import { groupOf } from "@/lib/operation-groups";
import { otherKind, parseKind } from "@/lib/operation-groups-rules";
import { SIDE_INFO } from "@/lib/operations-rules";
import { OperationsPanel } from "./operations-panel";

export const dynamic = "force-dynamic";

/** Settings -> Operations: which operation this workspace is, and adding the other one as a separate workspace (free). */
export default async function OperationsPage() {
  const org = await requireOrg();
  if (!(await operationsEnabled(org.organizationId))) notFound();
  if (!isAdmin(org.role)) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">This page is limited to owners and admins.</p>;
  }
  const [row] = await db.select({ kind: organizations.operationKind }).from(organizations).where(eq(organizations.id, org.organizationId)).limit(1);
  const kind = parseKind(row?.kind);
  const group = await groupOf(org.organizationId);
  const other = kind ? group.find((g) => g.kind === otherKind(kind)) : null;
  return (
    <div className="max-w-3xl" data-testid="operations-page">
      <h2 className="text-xl font-bold text-slate-900 dark:text-slate-50">Operations</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Your company can run Wholesale and Distribution as two separate operations under one sign-in. <strong>Both are free.</strong> Each one keeps its own customers, suppliers, products, orders, stock and payments, so nothing is mixed.
      </p>
      <OperationsPanel kind={kind} otherId={other?.organizationId ?? null} info={SIDE_INFO} canEdit={!org.viewAs} />
    </div>
  );
}
