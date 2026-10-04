import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { businessProfiles, organizations } from "@/db/schema";
import { requireOrg } from "@/lib/tenant";
import { isAdmin } from "@/lib/permissions";
import { getSeatUsage } from "@/lib/seats";

const PLAN_LABELS: Record<string, string> = { trial: "Free trial", starter: "Starter", pro: "Pro" };

export default async function BillingPage() {
  const org = await requireOrg();
  if (!isAdmin(org.role)) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">This page is limited to owners and admins.</p>;
  }
  const [row] = await db
    .select({ plan: organizations.plan, createdAt: organizations.createdAt, subscription: organizations.stripeSubscriptionStatus })
    .from(organizations)
    .where(eq(organizations.id, org.organizationId))
    .limit(1);
  const [profile] = await db
    .select({ email: businessProfiles.businessEmail })
    .from(businessProfiles)
    .where(eq(businessProfiles.organizationId, org.organizationId))
    .limit(1);
  const seats = await getSeatUsage(org.organizationId);

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Plan &amp; billing</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">What your company is on and how much of it you&rsquo;re using.</p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">Plan</dt>
            <dd className="mt-1 text-slate-900 dark:text-slate-50">{PLAN_LABELS[row?.plan ?? "trial"] ?? row?.plan}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">Company since</dt>
            <dd className="mt-1 text-slate-900 dark:text-slate-50">
              {row?.createdAt ? new Date(row.createdAt.replace(" ", "T") + (row.createdAt.includes("Z") ? "" : "Z")).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "-"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">Team seats</dt>
            <dd className="mt-1 text-slate-900 dark:text-slate-50">
              {seats.unlimited ? `${seats.used} in use · no limit` : `${seats.used} of ${seats.limit} in use`}
              {seats.pendingInvites > 0 && (
                <span className="text-slate-500 dark:text-slate-400"> (includes {seats.pendingInvites} pending invite{seats.pendingInvites === 1 ? "" : "s"})</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">Billing contact</dt>
            <dd className="mt-1 text-slate-900 dark:text-slate-50">{profile?.email ?? "Set in Business profile"}</dd>
          </div>
        </dl>
        {!seats.unlimited && (
          <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
            Need more seats? Contact us and we&rsquo;ll raise your limit.
          </p>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">Invoices &amp; payment method</h3>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Online payments aren&rsquo;t switched on yet, so there are no invoices and no card on file. We&rsquo;ll tell the
          owner by email, with notice, before any charge begins. Closing your company stops any future billing.
        </p>
      </section>
    </div>
  );
}
