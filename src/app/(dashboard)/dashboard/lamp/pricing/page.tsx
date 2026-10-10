import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { staffLevelOf } from "@/lib/platform-admin";
import { isFullLevel } from "@/lib/mothership-rules";
import { usd } from "@/lib/billing-config";
import { REFERRAL_LABEL } from "@/lib/pricing-rules";
import { affiliateLink, currentBook, listAffiliates, listPromos, priceHistory, referralRows } from "@/lib/pricing-service";
import { affiliateStatusAction, togglePromoAction } from "@/app/actions/pricing-admin";
import { ApproveForm, PaidForm, PriceForm, PromoForm } from "./pricing-forms";

export const dynamic = "force-dynamic";

const box = "rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900";
const small = "rounded-md border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800";
const dollars = (cents: number) => (cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2));

/** The Lamp's Pricing tab: the price new companies pay, promo codes, and the affiliate program. Owner, co-owner and admin only. */
export default async function PricingPage() {
  const org = await requireOrg({ real: true });
  if (!isFullLevel(await staffLevelOf(org))) notFound();
  const [book, history, promos, affiliates, referrals] = await Promise.all([currentBook(), priceHistory(), listPromos(), listAffiliates(), referralRows()]);
  const pending = affiliates.filter((a) => a.status === "pending");
  const people = affiliates.filter((a) => a.status !== "pending");
  const owed = referrals.filter((r) => r.status === "owed");
  const owedTotal = owed.reduce((n, r) => n + (r.cutCents ?? 0), 0);

  return (
    <div className="flex max-w-5xl flex-col gap-4" data-testid="pricing-page">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Pricing</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">The price new companies pay, promo codes for deals like Black Friday, and the affiliate program. Nothing here charges anyone: billing is not switched on yet.</p>
      </div>

      <details open className={box} data-testid="sec-prices">
        <summary className="cursor-pointer px-4 py-3 text-base font-semibold text-slate-900 dark:text-slate-50">
          Prices <span className="ml-2 text-sm font-normal text-slate-500">{usd(book.monthlyCents)}/month or {usd(book.yearlyCents)}/year for one operation, {book.bothPercent}% more for both</span>
        </summary>
        <div className="border-t border-slate-100 p-4 dark:border-slate-800">
          <PriceForm monthly={dollars(book.monthlyCents)} yearly={dollars(book.yearlyCents)} bothPercent={String(book.bothPercent)} />
          {history.length > 0 && (
            <details className="mt-5">
              <summary className="cursor-pointer text-sm font-medium text-slate-700 dark:text-slate-200">Price history ({history.length})</summary>
              <table className="mt-2 w-full text-left text-sm" data-testid="price-history">
                <thead className="text-xs text-slate-500"><tr><th className="py-1 font-medium">Set on</th><th className="py-1 font-medium">Monthly</th><th className="py-1 font-medium">Yearly</th><th className="py-1 font-medium">Both costs</th><th className="py-1 font-medium">Note</th></tr></thead>
                <tbody className="tabular-nums">
                  {history.map((h) => (
                    <tr key={h.id} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="py-1">{h.createdAt.slice(0, 10)}</td><td className="py-1">{usd(h.monthlyCents)}</td><td className="py-1">{usd(h.yearlyCents)}</td><td className="py-1">{h.bothPercent}% more</td><td className="py-1 text-slate-600 dark:text-slate-300">{h.note ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </div>
      </details>

      <details className={box} data-testid="sec-promos">
        <summary className="cursor-pointer px-4 py-3 text-base font-semibold text-slate-900 dark:text-slate-50">
          Promo codes <span className="ml-2 text-sm font-normal text-slate-500">{promos.filter((p) => p.active).length} active of {promos.length}</span>
        </summary>
        <div className="flex flex-col gap-4 border-t border-slate-100 p-4 dark:border-slate-800">
          <PromoForm />
          {promos.length > 0 && (
            <table className="w-full text-left text-sm" data-testid="promo-list">
              <thead className="text-xs text-slate-500"><tr><th className="py-1 font-medium">Code</th><th className="py-1 font-medium">What it does</th><th className="py-1 font-medium">Used</th><th className="py-1 font-medium">Dates</th><th className="py-1 font-medium"></th></tr></thead>
              <tbody>
                {promos.map((p) => (
                  <tr key={p.id} className="border-t border-slate-100 align-top dark:border-slate-800" data-testid="promo-row" data-code={p.code}>
                    <td className="py-2 font-mono font-semibold">{p.code}{!p.active && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 font-sans text-xs font-normal text-slate-600 dark:bg-slate-800 dark:text-slate-300">paused</span>}</td>
                    <td className="py-2">{p.text}</td>
                    <td className="py-2 tabular-nums">{p.usedCount}{p.maxUses != null ? ` of ${p.maxUses}` : ""}</td>
                    <td className="py-2 text-slate-600 dark:text-slate-300">{p.startsOn || p.endsOn ? `${p.startsOn ?? "any time"} to ${p.endsOn ?? "no end"}` : "No dates"}</td>
                    <td className="py-2 text-right">
                      <form action={togglePromoAction}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="active" value={p.active ? "0" : "1"} /><button className={small} data-testid="promo-toggle">{p.active ? "Pause" : "Resume"}</button></form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </details>

      <details className={box} data-testid="sec-affiliates">
        <summary className="cursor-pointer px-4 py-3 text-base font-semibold text-slate-900 dark:text-slate-50">
          Affiliates <span className="ml-2 text-sm font-normal text-slate-500">{pending.length} waiting for approval · {owed.length} cut{owed.length === 1 ? "" : "s"} owed{owed.length ? ` (${usd(owedTotal)})` : ""}</span>
        </summary>
        <div className="flex flex-col gap-5 border-t border-slate-100 p-4 dark:border-slate-800">
          <p className="text-sm text-slate-600 dark:text-slate-300">People apply on the public page <strong>/affiliates</strong>. You set each person&rsquo;s cut. They earn it once, as a percent of the first payment of each company they bring in. The new company pays the normal price. You pay them yourself and mark it paid here.</p>

          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Waiting for approval</h3>
            {pending.length === 0 ? <p className="mt-1 text-sm text-slate-500" data-testid="no-pending">Nobody is waiting.</p> : (
              <ul className="mt-2 flex flex-col gap-3" data-testid="pending-list">
                {pending.map((a) => (
                  <li key={a.id} className="rounded-md border border-slate-200 p-3 dark:border-slate-700" data-testid="pending-item" data-email={a.email}>
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-50">{a.name} <span className="font-normal text-slate-500">{a.email}</span></p>
                    {a.about && <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{a.about}</p>}
                    <div className="mt-2 flex flex-wrap items-end gap-3">
                      <ApproveForm id={a.id} name={a.name} />
                      <form action={affiliateStatusAction}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="status" value="declined" /><button className={small} data-testid="ap-decline">Decline</button></form>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Affiliates</h3>
            {people.length === 0 ? <p className="mt-1 text-sm text-slate-500">None yet.</p> : (
              <table className="mt-2 w-full text-left text-sm" data-testid="affiliate-list">
                <thead className="text-xs text-slate-500"><tr><th className="py-1 font-medium">Name</th><th className="py-1 font-medium">Code and link</th><th className="py-1 font-medium">Cut</th><th className="py-1 font-medium">Status</th><th className="py-1 font-medium"></th></tr></thead>
                <tbody>
                  {people.map((a) => (
                    <tr key={a.id} className="border-t border-slate-100 align-top dark:border-slate-800" data-testid="affiliate-row" data-email={a.email}>
                      <td className="py-2">{a.name}<br /><span className="text-xs text-slate-500">{a.email}</span></td>
                      <td className="py-2">{a.code ? <><span className="font-mono font-semibold">{a.code}</span><br /><span className="break-all text-xs text-slate-500">{affiliateLink(a.code)}</span></> : "-"}</td>
                      <td className="py-2 tabular-nums">{a.percent ? `${a.percent}%` : "-"}</td>
                      <td className="py-2 capitalize">{a.status}</td>
                      <td className="py-2 text-right">
                        {a.status !== "declined" && (
                          <form action={affiliateStatusAction}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="status" value={a.status === "active" ? "paused" : "active"} /><button className={small} data-testid="aff-toggle">{a.status === "active" ? "Pause" : "Resume"}</button></form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Companies they brought in</h3>
            {referrals.length === 0 ? <p className="mt-1 text-sm text-slate-500" data-testid="no-referrals">None yet.</p> : (
              <table className="mt-2 w-full text-left text-sm" data-testid="referral-list">
                <thead className="text-xs text-slate-500"><tr><th className="py-1 font-medium">Company</th><th className="py-1 font-medium">Affiliate</th><th className="py-1 font-medium">First payment</th><th className="py-1 font-medium">Their cut</th><th className="py-1 font-medium">Status</th></tr></thead>
                <tbody className="tabular-nums">
                  {referrals.map((r) => (
                    <tr key={r.useId} className="border-t border-slate-100 align-top dark:border-slate-800" data-testid="referral-row" data-status={r.status}>
                      <td className="py-2">{r.company}</td>
                      <td className="py-2">{r.affiliateName}<br /><span className="font-mono text-xs text-slate-500">{r.code}</span></td>
                      <td className="py-2">{r.firstPaymentCents === null ? "after approval" : usd(r.firstPaymentCents)}{r.promoOffCents > 0 && <span className="block text-xs text-slate-500">{usd(r.promoOffCents)} promo off</span>}</td>
                      <td className="py-2" data-testid="referral-cut">{r.cutCents === null ? "-" : usd(r.cutCents)}{r.percent ? <span className="block text-xs text-slate-500">{r.percent}% of what they pay</span> : null}</td>
                      <td className="py-2 font-sans">
                        <span data-testid="referral-status">{REFERRAL_LABEL[r.status]}</span>
                        {r.status === "owed" && <div className="mt-1"><PaidForm id={r.useId} /></div>}
                        {r.status === "paid" && r.paidAt && <span className="block text-xs text-slate-500">on {r.paidAt.slice(0, 10)}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </details>
    </div>
  );
}
