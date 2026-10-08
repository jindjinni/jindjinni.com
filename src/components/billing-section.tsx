import { AuthSection as Section } from "@/components/auth/auth-ui";
import { BillingTrialNotice } from "@/components/billing-trial-notice";
import { BILLING_LIVE, MONTHLY_CENTS, YEARLY_CENTS, YEARLY_REGULAR_CENTS, YEARLY_SAVINGS_CENTS, usd } from "@/lib/billing-config";

const card =
  "flex cursor-pointer flex-col gap-1 rounded-xl border border-line bg-white p-4 transition hover:border-ink has-[:checked]:border-brand-deep has-[:checked]:bg-mint has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-deep";

/**
 * Plan and payment on the sign-up page. Picking a plan is saved with the company, but billing is not live yet: no card or bank
 * details are asked for, and nothing is charged.
 */
export function BillingSection() {
  return (
    <Section title="Plan & Payment" description="Choose how you'd like to be billed once billing opens.">
      <fieldset className="grid gap-3 sm:col-span-2 sm:grid-cols-2" data-testid="billing-section">
        <legend className="sr-only">Billing plan</legend>
        <label className={card}>
          <input type="radio" name="billingPlan" value="monthly" className="sr-only" data-testid="plan-monthly" />
          <span className="text-sm font-extrabold text-ink">Monthly</span>
          <span className="text-2xl font-extrabold text-ink">{usd(MONTHLY_CENTS)}<span className="text-base font-bold">/month</span></span>
          <span className="text-sm text-muted">Billed monthly</span>
        </label>
        <label className={card}>
          <input type="radio" name="billingPlan" value="yearly" className="sr-only" data-testid="plan-yearly" />
          <span className="flex items-center gap-2 text-sm font-extrabold text-ink">
            Yearly
            <span className="rounded-full bg-brand px-2 py-0.5 text-xs font-extrabold text-ink">Best Value</span>
          </span>
          <span className="text-sm text-muted line-through" data-testid="yearly-regular">{usd(YEARLY_REGULAR_CENTS)}/year</span>
          <span className="text-2xl font-extrabold text-ink">{usd(YEARLY_CENTS)}<span className="text-base font-bold">/year</span></span>
          <span className="text-sm font-bold text-brand-deep" data-testid="yearly-savings">Save {usd(YEARLY_SAVINGS_CENTS)} per year</span>
        </label>
      </fieldset>

      <BillingTrialNotice />

      <div className="rounded-xl border border-mint-line bg-white p-4 text-sm text-ink sm:col-span-2" data-testid="autopay-notice">
        <p className="font-bold">Auto-pay only.</p>
        <p className="mt-1 text-muted">
          We bill by auto-pay only. When billing opens you&rsquo;ll add a credit card, a debit card or a bank account (ACH), and it is charged automatically: a monthly plan is prepaid on the 1st of every month, and a yearly plan is paid once a year.
        </p>
        <p className="mt-3 font-bold">If a payment doesn&rsquo;t go through</p>
        <p className="mt-1 text-muted" data-testid="grace-notice">
          You have a 3-day grace period to fix it. If the payment still hasn&rsquo;t gone through after 3 days, your account is suspended until it does.
        </p>
      </div>

      {!BILLING_LIVE && (
        <div className="rounded-xl border border-dashed border-mint-line bg-white p-4 text-sm text-ink sm:col-span-2" data-testid="billing-not-live">
          <p className="inline-flex rounded-full border border-mint-line bg-mint px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-brand-deep">Payment method: coming soon</p>
          <p className="mt-3 font-bold">Nothing is charged when you sign up.</p>
          <p className="mt-1 text-muted">Billing isn&rsquo;t switched on yet, so there are no card or bank details to enter. Your choice above is saved with your company, and we&rsquo;ll email the owner before any charge begins.</p>
        </div>
      )}
    </Section>
  );
}
