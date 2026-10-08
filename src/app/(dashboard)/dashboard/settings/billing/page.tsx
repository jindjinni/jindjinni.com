import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { businessProfiles, organizations } from "@/db/schema";
import { requireOrg } from "@/lib/tenant";
import { isAdmin } from "@/lib/permissions";
import { getSeatUsage } from "@/lib/seats";
import { isOwner } from "@/lib/permissions";
import { parseBillingPlan } from "@/lib/billing-config";
import { billingDateOf } from "@/lib/billing-schedule";
import { cancellationOutcome } from "@/lib/cancellation";
import { CANCEL_COMEBACK_TEXT, CANCEL_MONTHLY_TEXT, CANCEL_TRIAL_TEXT, CANCEL_YEARLY_TEXT } from "@/lib/cancellation-copy";
import { CancelPlanForm, UndoCancelForm } from "./cancel-plan-form";
import { BILLING_LIVE, usd, MONTHLY_CENTS, YEARLY_CENTS } from "@/lib/billing-config";
import { billingCalendar, chargeLine } from "@/lib/account-status";
import { addDays, longDay } from "@/lib/billing-schedule";

const PLAN_LABELS: Record<string, string> = { trial: "Free trial", starter: "Starter", pro: "Pro" };

export default async function BillingPage() {
  const org = await requireOrg();
  if (!isAdmin(org.role)) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">This page is limited to owners and admins.</p>;
  }
  const [row] = await db
    .select({ plan: organizations.plan, createdAt: organizations.createdAt, subscription: organizations.stripeSubscriptionStatus, billingPlan: organizations.billingPlan, trialStartsOn: organizations.trialStartsOn, firstBillableOn: organizations.firstBillableOn, paymentStatus: organizations.paymentStatus, cancelRequestedOn: organizations.cancelRequestedOn, serviceEndsOn: organizations.serviceEndsOn, cancelRefundCents: organizations.cancelRefundCents })
    .from(organizations)
    .where(eq(organizations.id, org.organizationId))
    .limit(1);
  const [profile] = await db
    .select({ email: businessProfiles.businessEmail })
    .from(businessProfiles)
    .where(eq(businessProfiles.organizationId, org.organizationId))
    .limit(1);
  const seats = await getSeatUsage(org.organizationId);
  const cal = billingCalendar({ billingPlan: row?.billingPlan, trialStartsOn: row?.trialStartsOn, firstBillableOn: row?.firstBillableOn });

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

      <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900" data-testid="trial-schedule">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">Free trial &amp; charges</h3>
        {cal ? (
          <div className="mt-2 flex flex-col gap-2 text-sm text-slate-600 dark:text-slate-400">
            <p data-testid="trial-line">
              {cal.trial.state === "in_trial"
                ? `Your 7-day free trial is running: ${cal.trial.daysLeft} day${cal.trial.daysLeft === 1 ? "" : "s"} left, free through ${longDay(cal.trial.lastFreeDay)}.`
                : `Your 7-day free trial ended on ${longDay(addDays(row?.firstBillableOn ?? "", -1))}.`}
            </p>
            {cal.plan ? (
              <>
                <p>On the {cal.plan === "monthly" ? `Monthly plan (${usd(MONTHLY_CENTS)}/month)` : `Yearly plan (${usd(YEARLY_CENTS)}/year)`}, the charges are:</p>
                <ul className="list-disc pl-5" data-testid="charge-list">
                  {cal.charges.map((c) => (<li key={c.date}>{chargeLine(c)}</li>))}
                </ul>
                <p className="text-xs">{cal.plan === "monthly" ? "The first charge covers the days left in that month after your free trial; after that the full month is charged on the 1st." : "The yearly price is charged once when the trial ends, then once a year on that date."}</p>
              </>
            ) : (
              <p>No plan was chosen at sign-up. Contact support to choose Monthly or Yearly.</p>
            )}
            {!BILLING_LIVE && <p className="text-xs">Billing isn&rsquo;t switched on yet. Nothing is charged until it is, and we&rsquo;ll email the owner first.</p>}
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400" data-testid="trial-pending">Your 7-day free trial starts the day your company is approved.</p>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900" data-testid="cancel-section">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-50">Cancel your plan</h3>
        <ul className="mt-2 list-disc pl-5 text-sm text-slate-600 dark:text-slate-400" data-testid="cancel-policy">
          <li>{CANCEL_TRIAL_TEXT}</li>
          <li>{CANCEL_MONTHLY_TEXT}</li>
          <li>{CANCEL_YEARLY_TEXT}</li>
        </ul>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{CANCEL_COMEBACK_TEXT}</p>
        {row?.cancelRequestedOn ? (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200" data-testid="cancel-status">
            <p className="font-semibold">Your plan is cancelled.</p>
            <p className="mt-1">You keep the service through <strong>{longDay(row.serviceEndsOn ?? "")}</strong>. After that the workspace is switched off and your data is kept.</p>
            <p className="mt-1" data-testid="cancel-refund-line">
              {(row.cancelRefundCents ?? 0) > 0
                ? `Refund: ${usd(row.cancelRefundCents ?? 0)} for the unused part of your year, back to your original payment method.`
                : "No refund is due."}
            </p>
            {isOwner(org.role) && <UndoCancelForm />}
          </div>
        ) : isOwner(org.role) ? (
          <>
            <p className="mt-3 rounded-md bg-slate-50 p-3 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-300" data-testid="cancel-preview">
              {(() => {
                const out = cancellationOutcome({ plan: parseBillingPlan(row?.billingPlan), today: billingDateOf(), firstBillableOn: row?.firstBillableOn ?? null, paid: row?.paymentStatus === "current" });
                return (
                  <>
                    If you cancel today ({longDay(billingDateOf())}), you keep the service through <strong>{longDay(out.serviceEndsOn)}</strong>.{" "}
                    {out.kind === "trial" ? "You won't be charged." : out.refundCents > 0 ? `You would be refunded ${usd(out.refundCents)} for the unused part of your year.` : out.kind === "yearly" && row?.paymentStatus !== "current" ? "No payment has been taken, so there is nothing to refund." : "There is no refund."}
                  </>
                );
              })()}
            </p>
            <CancelPlanForm />
          </>
        ) : (
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">Only the company&rsquo;s owner can cancel the plan.</p>
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
