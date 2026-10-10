"use client";

import { useActionState, useState } from "react";
import { approveAffiliateAction, createPromoAction, markPaidAction, savePriceAction, type PricingState } from "@/app/actions/pricing-admin";
import { usd } from "@/lib/billing-config";
import { monthlyPrice, validateBook, yearlyPrice, yearlyRegular, yearlySavings } from "@/lib/pricing-rules";

const input = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900";
const label = "text-xs font-medium text-slate-600 dark:text-slate-400";
const btn = "rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60";

function Notice({ s, id }: { s: PricingState; id: string }) {
  return (
    <>
      {s?.message && <p role="status" className="text-sm text-emerald-800 dark:text-emerald-300" data-testid={`${id}-message`}>{s.message}</p>}
      {s?.error && <p role="alert" className="text-sm text-red-700 dark:text-red-300" data-testid={`${id}-error`}>{s.error}</p>}
    </>
  );
}

/** Change the price new companies pay. Shows what every combination comes to as you type. */
export function PriceForm({ monthly, yearly, bothPercent }: { monthly: string; yearly: string; bothPercent: string }) {
  const [state, action, pending] = useActionState(savePriceAction, undefined);
  const [m, setM] = useState(monthly);
  const [y, setY] = useState(yearly);
  const [p, setP] = useState(bothPercent);
  const v = validateBook({ monthly: m, yearly: y, bothPercent: p });
  return (
    <form action={action} className="flex flex-col gap-4" data-testid="price-form">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="pf-monthly" className={label}>One operation, per month ($)</label>
          <input id="pf-monthly" name="monthly" value={m} onChange={(e) => setM(e.target.value)} inputMode="decimal" className={input} data-testid="pf-monthly" />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="pf-yearly" className={label}>One operation, per year ($)</label>
          <input id="pf-yearly" name="yearly" value={y} onChange={(e) => setY(e.target.value)} inputMode="decimal" className={input} data-testid="pf-yearly" />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="pf-both" className={label}>Running both costs this % more</label>
          <input id="pf-both" name="bothPercent" value={p} onChange={(e) => setP(e.target.value)} inputMode="numeric" className={input} data-testid="pf-both" />
        </div>
      </div>
      {v.ok ? (
        <table className="w-full max-w-xl text-left text-sm" data-testid="pf-preview">
          <thead className="text-xs text-slate-500 dark:text-slate-400">
            <tr><th className="py-1 font-medium">What they run</th><th className="py-1 font-medium">Monthly</th><th className="py-1 font-medium">Yearly</th><th className="py-1 font-medium">Yearly saves</th></tr>
          </thead>
          <tbody className="tabular-nums">
            {([1, 2] as const).map((ops) => (
              <tr key={ops} className="border-t border-slate-100 dark:border-slate-800">
                <td className="py-1">{ops === 1 ? "One operation" : "Both operations"}</td>
                <td className="py-1" data-testid={`pf-m${ops}`}>{usd(monthlyPrice(v.book, ops))}</td>
                <td className="py-1" data-testid={`pf-y${ops}`}>{usd(yearlyPrice(v.book, ops))}</td>
                <td className="py-1">{usd(yearlySavings(v.book, ops))} <span className="text-xs text-slate-500">(of {usd(yearlyRegular(v.book, ops))})</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-sm text-amber-800 dark:text-amber-300" data-testid="pf-hint">{v.error}</p>
      )}
      <div className="flex flex-col gap-1">
        <label htmlFor="pf-note" className={label}>Note for yourself (optional), for example &ldquo;Black Friday 2026&rdquo;</label>
        <input id="pf-note" name="note" maxLength={200} className={input} />
      </div>
      <p className="text-xs text-slate-600 dark:text-slate-400">New sign-ups pay the new price. Companies that already signed up keep the price they signed up at.</p>
      <div><button disabled={pending || !v.ok} className={btn} data-testid="pf-save">Save prices</button></div>
      <Notice s={state} id="pf" />
    </form>
  );
}

export function PromoForm() {
  const [state, action, pending] = useActionState(createPromoAction, undefined);
  const [kind, setKind] = useState("percent");
  return (
    <form action={action} className="flex flex-col gap-3" data-testid="promo-form">
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="pc-code" className={label}>Code</label>
          <input id="pc-code" name="code" maxLength={24} placeholder="BLACKFRIDAY" className={`${input} uppercase`} data-testid="pc-code" />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="pc-kind" className={label}>Takes off</label>
          <select id="pc-kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value)} className={input} data-testid="pc-kind">
            <option value="percent">A percent of the first payment</option>
            <option value="amount">A dollar amount</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="pc-value" className={label}>{kind === "percent" ? "Percent off (1 to 100)" : "Dollars off"}</label>
          <input id="pc-value" name="value" inputMode="decimal" className={input} data-testid="pc-value" />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="pc-plan" className={label}>For which plan</label>
          <select id="pc-plan" name="plan" className={input} data-testid="pc-plan">
            <option value="any">Monthly or Yearly</option>
            <option value="monthly">Monthly only</option>
            <option value="yearly">Yearly only</option>
          </select>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="pc-max" className={label}>Most times it can be used (empty = no limit)</label>
          <input id="pc-max" name="maxUses" inputMode="numeric" className={input} data-testid="pc-max" />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="pc-start" className={label}>First day (optional)</label>
          <input id="pc-start" name="startsOn" type="date" className={input} data-testid="pc-start" />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="pc-end" className={label}>Last day (optional)</label>
          <input id="pc-end" name="endsOn" type="date" className={input} data-testid="pc-end" />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="pc-note" className={label}>Note for yourself</label>
          <input id="pc-note" name="note" maxLength={200} className={input} />
        </div>
      </div>
      <p className="text-xs text-slate-600 dark:text-slate-400">A promo code takes money off the first payment after the free trial, and nothing after that.</p>
      <div><button disabled={pending} className={btn} data-testid="pc-create">Create promo code</button></div>
      <Notice s={state} id="pc" />
    </form>
  );
}

export function ApproveForm({ id, name }: { id: string; name: string }) {
  const [state, action, pending] = useActionState(approveAffiliateAction, undefined);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2" data-testid="approve-form">
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-col gap-1">
        <label htmlFor={`ap-${id}`} className={label}>Their cut of each first payment (%)</label>
        <input id={`ap-${id}`} name="percent" inputMode="numeric" defaultValue="10" className={`${input} w-28`} data-testid="ap-percent" aria-label={`Percent for ${name}`} />
      </div>
      <button disabled={pending} className={btn} data-testid="ap-approve">Approve and email the code</button>
      <Notice s={state} id="ap" />
    </form>
  );
}

export function PaidForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(markPaidAction, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2" data-testid="paid-form">
      <input type="hidden" name="id" value={id} />
      <input name="note" placeholder="How you paid (optional)" maxLength={200} className={`${input} w-56`} aria-label="How you paid" />
      <button disabled={pending} className={btn} data-testid="mark-paid">Mark paid</button>
      <Notice s={state} id="paid" />
    </form>
  );
}
