import type { Metadata } from "next";
import { AFFILIATE_MONTHLY_PERCENT, AFFILIATE_MONTHS, AFFILIATE_YEARLY_PERCENT } from "@/lib/affiliate-program";
import { usd } from "@/lib/billing-config";
import { currentAffiliate, portalFor } from "@/lib/affiliate-portal";
import { affiliateSignOut } from "@/app/actions/affiliate-portal";
import { AuthCard, AuthShell } from "@/components/auth/auth-ui";
import { AffiliateSigninForm } from "./signin-form";

export const metadata: Metadata = { title: "Affiliate portal", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const day = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

/** The affiliate portal. Not signed in: the email box. Signed in: the person's own code and link, and the few things they may see about the companies they referred. */
export default async function AffiliatePortalPage() {
  const me = await currentAffiliate();
  if (!me) return <AffiliateSigninForm />;
  const referrals = await portalFor(me.id);
  return (
    <AuthShell>
      <AuthCard className="max-w-3xl p-7 sm:p-10">
        <div data-testid="aff-portal">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-ink">Your affiliate portal</h1>
              <p className="mt-1 text-base text-muted">Welcome, {me.name}.</p>
            </div>
            <form action={affiliateSignOut}>
              <button className="rounded-full border border-line bg-white px-4 py-2 text-sm font-bold text-ink hover:border-ink" data-testid="aff-signout">Sign out</button>
            </form>
          </div>

          <dl className="mt-6 grid gap-3 sm:grid-cols-2" data-testid="aff-codes">
            <div className="rounded-2xl border border-line bg-slate-50 p-4">
              <dt className="text-xs font-extrabold uppercase tracking-wider text-muted">Your code</dt>
              <dd className="mt-1 font-mono text-xl font-extrabold text-ink" data-testid="aff-code">{me.code}</dd>
            </div>
            <div className="rounded-2xl border border-line bg-slate-50 p-4">
              <dt className="text-xs font-extrabold uppercase tracking-wider text-muted">Your link</dt>
              <dd className="mt-1 break-all text-sm font-bold text-ink" data-testid="aff-link">{me.link}</dd>
            </div>
          </dl>

          <h2 className="mt-8 text-xl font-extrabold tracking-tight text-ink">Companies you referred</h2>
          <p className="mt-1 text-sm text-muted">
            You earn a one-time payout for each company, once it has been billed for {AFFILIATE_MONTHS} months: {AFFILIATE_MONTHLY_PERCENT}% of one month if it pays monthly, or {AFFILIATE_YEARLY_PERCENT}% of the year if it pays yearly. We pay by direct deposit. When your payout for a company has been paid, it leaves this list.
          </p>
          {referrals.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-dashed border-line p-5 text-sm font-semibold text-muted" data-testid="aff-none">Nobody on your list right now. Share your link or code, and companies appear here when they sign up.</p>
          ) : (
            <ul className="mt-4 flex flex-col gap-3" data-testid="aff-referrals">
              {referrals.map((r, i) => (
                <li key={i} className="rounded-2xl border border-line p-4" data-testid="aff-referral" data-state={r.state}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-base font-extrabold text-ink">{r.company}</p>
                    <p className="text-sm font-bold text-brand-deep">{r.label}</p>
                  </div>
                  <p className="mt-1 text-sm text-muted">{r.activeSince ? `Active since ${day(r.activeSince)}` : "Waiting for approval"}</p>
                  {r.state !== "ended" && (
                    <>
                      <div className="mt-3 flex gap-1.5" aria-hidden="true">
                        {Array.from({ length: r.monthsNeeded }, (_, n) => (
                          <span key={n} className={`h-2 flex-1 rounded-full ${n < r.monthsDone ? "bg-brand" : "bg-slate-200"}`} />
                        ))}
                      </div>
                      <p className="mt-1.5 text-sm font-semibold text-ink" data-testid="aff-progress">{r.monthsDone} of {r.monthsNeeded} months billed</p>
                      <p className="text-sm text-muted">Your payout: {usd(r.payoutCents)}</p>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </AuthCard>
    </AuthShell>
  );
}
