"use client";

import { useState, useTransition } from "react";
import { AuthSection as Section } from "@/components/auth/auth-ui";
import { BillingTrialNotice } from "@/components/billing-trial-notice";
import { BILLING_LIVE, usd } from "@/lib/billing-config";
import { monthlyPrice, operationsFor, yearlyPrice, yearlyRegular, yearlySavings, type PlanKind, type PriceBook } from "@/lib/pricing-rules";
import { checkPromoAction, type PromoCheck } from "@/app/actions/pricing-public";

const card =
  "flex cursor-pointer flex-col gap-1 rounded-xl border border-line bg-white p-4 transition hover:border-ink has-[:checked]:border-brand-deep has-[:checked]:bg-mint has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-deep";

/**
 * Plan and payment on the sign-up page. The price follows the answer to "What type of operation do you run?" above it: one
 * operation has one price, running both costs the percent more the platform owner has set. Picking a plan is saved with the company
 * (along with the price book it signed up at), but billing is not live yet: no card or bank details are asked for, and nothing is charged.
 * The Promo code box checks a code without using it up; the code itself is used when the account is created.
 */
export function BillingSection({ book, operationType, referred = false }: { book: PriceBook; operationType: string | null; referred?: boolean }) {
  const [plan, setPlan] = useState<PlanKind | null>(null);
  const [code, setCode] = useState("");
  const [result, setResult] = useState<PromoCheck>(undefined);
  const [busy, startCheck] = useTransition();
  const ops = operationsFor(operationType);
  const other = ops === 2 ? 1 : 2;
  const monthly = monthlyPrice(book, ops);
  const yearly = yearlyPrice(book, ops);

  function apply() {
    setResult(undefined);
    startCheck(async () => setResult(await checkPromoAction(code, plan, operationType)));
  }

  return (
    <Section title="Plan & Payment" description="Choose how you'd like to be billed once billing opens.">
      <fieldset className="grid gap-3 sm:col-span-2 sm:grid-cols-2" data-testid="billing-section" data-ops={ops}>
        <legend className="sr-only">Billing plan</legend>
        <label className={card}>
          <input type="radio" name="billingPlan" value="monthly" className="sr-only" data-testid="plan-monthly" checked={plan === "monthly"} onChange={() => { setPlan("monthly"); setResult(undefined); }} />
          <span className="text-sm font-extrabold text-ink">Monthly</span>
          <span className="text-2xl font-extrabold text-ink" data-testid="price-monthly">{usd(monthly)}<span className="text-base font-bold">/month</span></span>
          <span className="text-sm text-muted">Billed monthly &middot; {ops === 2 ? "Wholesale and Distribution" : "one operation"}</span>
          <span className="text-xs text-muted" data-testid="other-monthly">{other === 2 ? `Running both operations: ${usd(monthlyPrice(book, 2))}/month` : `One operation only: ${usd(monthlyPrice(book, 1))}/month`}</span>
        </label>
        <label className={card}>
          <input type="radio" name="billingPlan" value="yearly" className="sr-only" data-testid="plan-yearly" checked={plan === "yearly"} onChange={() => { setPlan("yearly"); setResult(undefined); }} />
          <span className="flex items-center gap-2 text-sm font-extrabold text-ink">
            Yearly
            <span className="rounded-full bg-brand px-2 py-0.5 text-xs font-extrabold text-ink">Best Value</span>
          </span>
          <span className="text-sm text-muted line-through" data-testid="yearly-regular">{usd(yearlyRegular(book, ops))}/year</span>
          <span className="text-2xl font-extrabold text-ink" data-testid="price-yearly">{usd(yearly)}<span className="text-base font-bold">/year</span></span>
          <span className="text-sm font-bold text-brand-deep" data-testid="yearly-savings">Save {usd(yearlySavings(book, ops))} per year</span>
          <span className="text-xs text-muted" data-testid="other-yearly">{other === 2 ? `Running both operations: ${usd(yearlyPrice(book, 2))}/year` : `One operation only: ${usd(yearlyPrice(book, 1))}/year`}</span>
        </label>
      </fieldset>

      {book.bothPercent > 0 && (
        <p className="text-sm text-muted sm:col-span-2" data-testid="both-note">
          One operation (Wholesale or Distribution) has one price. Running both costs {book.bothPercent}% more, and each keeps its own customers, suppliers, products, orders and payments. Choose your type of operation above and the prices change to match.
        </p>
      )}

      <div className="flex flex-col gap-2 sm:col-span-2" data-testid="promo-box">
        <label htmlFor="promoCode" className="text-sm font-bold text-ink">Promo code <span className="font-normal text-muted">(optional)</span></label>
        <div className="flex gap-2">
          <input
            id="promoCode"
            name="promoCode"
            value={code}
            maxLength={24}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => { setCode(e.target.value); setResult(undefined); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (code.trim()) apply(); } }}
            className="w-full max-w-xs rounded-xl border border-line bg-white px-3 py-2 text-sm uppercase"
            data-testid="promo-input"
          />
          <button type="button" onClick={apply} disabled={busy || !code.trim()} className="rounded-xl border border-ink px-4 py-2 text-sm font-bold text-ink hover:bg-mint disabled:opacity-50" data-testid="promo-apply">
            {busy ? "Checking..." : "Apply"}
          </button>
        </div>
        {result?.ok && (
          <p role="status" className="text-sm font-bold text-brand-deep" data-testid="promo-result">
            {result.text}.{result.example ? ` ${result.example}` : ""}
          </p>
        )}
        {result && !result.ok && <p role="alert" className="text-sm font-bold text-red-700" data-testid="promo-error">{result.error}</p>}
        {referred && <p className="text-xs text-muted" data-testid="referred-note">You came here through a friend&rsquo;s link. Thank you for joining through them.</p>}
        <p className="text-xs text-muted">A promo code takes money off your first payment after the free trial. It is checked again when you create your account.</p>
      </div>

      <BillingTrialNotice monthlyCents={monthly} yearlyCents={yearly} />

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
