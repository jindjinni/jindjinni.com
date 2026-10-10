import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { organizations } from "@/db/schema";
import { requireOrg } from "@/lib/tenant";
import { isAdmin } from "@/lib/permissions";
import { operationsEnabled } from "@/lib/operations-service";
import { groupOf, rootIdOf } from "@/lib/operation-groups";
import { companyPricing } from "@/lib/pricing-service";
import { monthlyPrice, yearlyPrice } from "@/lib/pricing-rules";
import { BILLING_LIVE, usd } from "@/lib/billing-config";
import { otherKind, parseKind } from "@/lib/operation-groups-rules";
import { SIDE_INFO } from "@/lib/operations-rules";
import { SIDE_FLOW } from "@/lib/operation-tabs-rules";
import { tabViewOf } from "@/lib/operations-service";
import { OperationsPanel } from "./operations-panel";

export const dynamic = "force-dynamic";

/** Settings -> Operations: which operation this workspace is, and adding the other one as a separate workspace . */
export default async function OperationsPage() {
  const org = await requireOrg();
  if (!(await operationsEnabled(org.organizationId))) notFound();
  if (!isAdmin(org.role)) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">This page is limited to owners and admins.</p>;
  }
  const [row] = await db.select({ kind: organizations.operationKind }).from(organizations).where(eq(organizations.id, org.organizationId)).limit(1);
  const kind = parseKind(row?.kind);
  const group = await groupOf(org.organizationId);
  const { showAll } = await tabViewOf(org.organizationId);
  const pricing = await companyPricing(await rootIdOf(org.organizationId));
  const per = pricing.plan === "yearly" ? "year" : "month";
  const one = pricing.plan === "yearly" ? yearlyPrice(pricing.book, 1) : monthlyPrice(pricing.book, 1);
  const both = pricing.plan === "yearly" ? yearlyPrice(pricing.book, 2) : monthlyPrice(pricing.book, 2);
  const cost = {
    hasBoth: pricing.ops === 2,
    percent: pricing.book.bothPercent,
    oneText: `${usd(one)} a ${per}`,
    bothText: `${usd(both)} a ${per}`,
    moreText: `${usd(both - one)} more a ${per}`,
    planNamed: pricing.plan !== null,
    billingLive: BILLING_LIVE,
  };
  const other = kind ? group.find((g) => g.kind === otherKind(kind)) : null;
  return (
    <div className="max-w-3xl" data-testid="operations-page">
      <h2 className="text-xl font-bold text-slate-900 dark:text-slate-50">Operations</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Your company can run Wholesale and Distribution as two separate operations under one sign-in. Running both costs more than running one (see below). Each one keeps its own customers, suppliers, products, orders, stock and payments, so nothing is mixed.
      </p>
      <OperationsPanel kind={kind} otherId={other?.organizationId ?? null} info={SIDE_INFO} canEdit={!org.viewAs} flow={SIDE_FLOW} showAll={showAll} cost={cost} />
    </div>
  );
}
