"use client";

import { useEffect, useState } from "react";
import { usd } from "@/lib/billing-config";
import { billingDateOf, longDay, scheduleIfTrialStarts, TRIAL_DAYS } from "@/lib/billing-schedule";
import { chargeLine } from "@/lib/account-status";
import { CANCEL_COMEBACK_TEXT, CANCEL_MONTHLY_TEXT, CANCEL_TRIAL_TEXT, CANCEL_YEARLY_TEXT } from "@/lib/cancellation-copy";

/**
 * The free-trial and proration explanation in the sign-up payment section. The worked example uses today's date in the billing
 * time zone, worked out in the browser after the page loads (so the page itself is the same for everyone and cacheable).
 */
export function BillingTrialNotice({ monthlyCents, yearlyCents }: { monthlyCents: number; yearlyCents: number }) {
  // Worked out after mount so the server-rendered page is the same for everyone.
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => {
    const id = setTimeout(() => setToday(billingDateOf(new Date())), 0);
    return () => clearTimeout(id);
  }, []);
  const monthly = today ? scheduleIfTrialStarts("monthly", today, 2, { monthlyCents, yearlyCents }) : null;
  const yearly = today ? scheduleIfTrialStarts("yearly", today, 2, { monthlyCents, yearlyCents }) : null;

  return (
    <div className="rounded-xl border border-mint-line bg-white p-4 text-sm text-ink sm:col-span-2" data-testid="trial-notice">
      <p className="font-bold">{TRIAL_DAYS}-day free trial</p>
      <p className="mt-1 text-muted" data-testid="trial-days-notice">
        Every new company gets a {TRIAL_DAYS}-day free trial. It starts the day we approve your company, so you never lose trial days while we review you. Nothing is charged during the trial. Cancel before it ends and you won&rsquo;t be charged.
      </p>

      <p className="mt-3 font-bold">How your first charge works (Monthly plan)</p>
      <p className="mt-1 text-muted" data-testid="proration-notice">
        We bill on the 1st of every month, prepaid for that month. Your trial usually ends part-way through a month, so the first day after your trial we charge you only for the rest of that month. This is called a prorated charge: the monthly price ({usd(monthlyCents)}) &times; the days left in the month &divide; the days in that month. Then on the 1st of every month after that we charge the full {usd(monthlyCents)}. If your trial ends on the last day of a month, your first charge is simply the full month on the 1st. The days of your free trial are never charged.
      </p>

      <p className="mt-3 font-bold">Yearly plan</p>
      <p className="mt-1 text-muted">
        No proration. The first day after your trial we charge the full {usd(yearlyCents)} for one year, and again on that same date every year.
      </p>

      <p className="mt-3 font-bold">Cancelling</p>
      <ul className="mt-1 list-disc pl-5 text-muted" data-testid="cancel-notice">
        <li data-testid="cancel-trial">{CANCEL_TRIAL_TEXT}</li>
        <li data-testid="cancel-monthly">{CANCEL_MONTHLY_TEXT}</li>
        <li data-testid="cancel-yearly">{CANCEL_YEARLY_TEXT}</li>
        <li>{CANCEL_COMEBACK_TEXT}</li>
      </ul>

      {monthly && yearly && today && (
        <div className="mt-3 rounded-lg border border-line bg-mint p-3" data-testid="billing-example">
          <p className="font-bold">Example: if we approved you today ({longDay(today)})</p>
          <ul className="mt-1 list-disc pl-5 text-muted">
            <li>Free trial: {longDay(monthly.trial.startsOn, false)} through {longDay(monthly.trial.lastFreeDay)}. No charge.</li>
            {monthly.charges.map((c) => (<li key={c.date} data-testid="example-monthly">Monthly plan, {chargeLine(c)}</li>))}
            <li data-testid="example-yearly">Yearly plan, {chargeLine(yearly.charges[0])}, then {longDay(yearly.charges[1].date)}</li>
          </ul>
          <p className="mt-2 text-xs text-muted">Amounts are rounded to the nearest cent. Dates follow US Eastern time.</p>
        </div>
      )}
    </div>
  );
}
