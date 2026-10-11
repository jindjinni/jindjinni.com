import Link from "next/link";
import { Eyebrow } from "@/components/landing/site-shell";
import { usd } from "@/lib/billing-config";
import { signupHref } from "@/lib/operation-type";
import { monthlyPrice, yearlyPrice, yearlyRegular, yearlySavings, type PriceBook } from "@/lib/pricing-rules";
import { TRIAL_DAYS } from "@/lib/billing-schedule";
import type { OperationSlug } from "@/lib/landing-content";

const NAMES: Record<OperationSlug, string> = { wholesale: "Wholesale", distribution: "Distribution", both: "Wholesale and Distribution together" };

/**
 * The price for this operation, as two buttons. Pressing Monthly or Yearly opens the sign-up page with this operation and that
 * plan already chosen, so the visitor carries on with the rest of the form. Prices come from the price book, never from words.
 */
export function PricingChoice({ slug, book }: { slug: OperationSlug; book: PriceBook }) {
  const ops = slug === "both" ? 2 : 1;
  const card = "group flex flex-col rounded-3xl border bg-white p-7 transition motion-safe:hover:-translate-y-1 hover:shadow-[0_24px_50px_-28px_rgba(10,122,58,0.45)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";
  return (
    <section className="bg-slate-50 py-16 sm:py-24" data-testid="op-pricing">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Eyebrow>Pricing</Eyebrow>
        <h2 className="mt-3 max-w-3xl text-balance text-3xl font-extrabold tracking-tight sm:text-5xl">
          {TRIAL_DAYS} days free. Pick a plan and start.
        </h2>
        <p className="mt-4 max-w-3xl text-lg text-muted">
          {NAMES[slug]}: choose monthly or yearly and we take you straight to sign-up with it already selected. Nothing is charged during the free trial, and you can cancel before it ends.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Link href={signupHref(slug, "monthly")} data-testid={`choose-${slug}-monthly`} className={`${card} border-line hover:border-brand`}>
            <h3 className="text-sm font-extrabold uppercase tracking-wider text-muted">Monthly</h3>
            <p className="mt-3 text-4xl font-extrabold tracking-tight">{usd(monthlyPrice(book, ops))}<span className="text-lg font-bold">/month</span></p>
            <p className="mt-1 text-sm font-semibold text-muted">Billed monthly &middot; {ops === 2 ? "both operations" : "one operation"}</p>
            <span className="mt-6 inline-flex items-center justify-center rounded-full bg-ink px-6 py-3 text-sm font-bold text-white group-hover:bg-black">Choose Monthly and sign up</span>
          </Link>
          <Link href={signupHref(slug, "yearly")} data-testid={`choose-${slug}-yearly`} className={`${card} border-2 border-brand`}>
            <h3 className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-wider text-muted">
              Yearly <span className="rounded-full bg-brand px-2.5 py-0.5 text-xs font-extrabold normal-case tracking-normal text-ink">Best Value</span>
            </h3>
            <p className="mt-3 text-sm font-semibold text-muted line-through">{usd(yearlyRegular(book, ops))}/year</p>
            <p className="text-4xl font-extrabold tracking-tight">{usd(yearlyPrice(book, ops))}<span className="text-lg font-bold">/year</span></p>
            <p className="mt-1 text-sm font-bold text-brand-deep">Save {usd(yearlySavings(book, ops))} per year</p>
            <span className="mt-6 inline-flex items-center justify-center rounded-full bg-brand px-6 py-3 text-sm font-bold text-ink group-hover:brightness-95">Choose Yearly and sign up</span>
          </Link>
        </div>
        <p className="mt-4 text-sm font-semibold text-muted">
          {slug === "both"
            ? `Running both costs ${book.bothPercent}% more than one operation. Each side keeps its own records.`
            : "Running both Wholesale and Distribution costs more, and you can add the second one later in Settings."}
        </p>
      </div>
    </section>
  );
}
