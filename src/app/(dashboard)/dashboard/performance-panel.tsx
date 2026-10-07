"use client";

import Link from "next/link";
import { useState } from "react";
import { PERIODS, PERIOD_WORDS, money, moneyWhole, plural, type Period } from "@/lib/home-rules";
import type { Pulse } from "@/lib/home-stats";

function Stat({ label, value, note, tone = "plain", testId }: { label: string; value: string; note?: string; tone?: "plain" | "warn"; testId?: string }) {
  return (
    <div className="min-h-[7.5rem] min-w-0 rounded-xl bg-slate-50 px-3 py-3 dark:bg-slate-800/60">
      <div className={`whitespace-nowrap text-xl font-bold tabular-nums sm:text-2xl ${tone === "warn" ? "text-red-700 dark:text-red-400" : "text-slate-900 dark:text-slate-50"}`} data-testid={testId}>
        {value}
      </div>
      <div className="mt-0.5 text-xs font-medium text-slate-600 dark:text-slate-300">{label}</div>
      {note && <div className="mt-0.5 text-xs text-slate-500">{note}</div>}
    </div>
  );
}

function Card({ title, href, accent, children, now }: { title: string; href: string; accent: string; children: React.ReactNode; now: string[] }) {
  return (
    <section className="flex flex-col rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" data-testid={`perf-${title.toLowerCase()}`}>
      <div className={`h-1.5 rounded-t-2xl ${accent}`} />
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-50">{title}</h3>
          <Link href={href} className="text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400">
            Open {title}
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-2">{children}</div>
        <div className="mt-auto border-t border-slate-100 pt-3 dark:border-slate-800">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Right now</div>
          <ul className="mt-1 min-h-[4.25rem] space-y-0.5 text-sm text-slate-700 dark:text-slate-300">
            {now.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/** Purchasing, Receiving and Accounts at a glance, for Today, This week or This month. */
export function PerformancePanel({ pulse }: { pulse: Pulse }) {
  const [period, setPeriod] = useState<Period>("week");
  const p = pulse.periods[period];
  const when = PERIOD_WORDS[period];
  const n = pulse.now;
  return (
    <div className="mt-4" data-testid="performance-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600 dark:text-slate-400">A quick look at how the departments are doing, {when}.</p>
        <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-700 dark:bg-slate-800" role="group" aria-label="Time period">
          {PERIODS.map((x) => (
            <button key={x.key} type="button" onClick={() => setPeriod(x.key)} aria-pressed={period === x.key} data-testid={`period-${x.key}`} className={`rounded-full px-3 py-1 text-sm font-medium ${period === x.key ? "bg-emerald-600 text-white shadow-sm" : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"}`}>
              {x.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card
          title="Purchasing"
          href="/dashboard/purchasing"
          accent="bg-emerald-500"
          now={[`${plural(n.purchasing.waitingForCustomer, "quotation")} waiting for the customer`, `${plural(n.purchasing.onTheWay, "package")} on the way to us`, n.purchasing.shippingTrouble > 0 ? `${plural(n.purchasing.shippingTrouble, "package")} with a shipping problem` : "No shipping problems"]}
        >
          <Stat label={`Quotations given ${when}`} value={String(p.purchasing.quotesGiven)} testId="stat-quotes" />
          <Stat label="Value quoted" value={moneyWhole(p.purchasing.quotedValue)} testId="stat-quoted-value" />
          <Stat label="Confirmed by customers" value={String(p.purchasing.confirmed)} note={p.purchasing.quotesGiven > 0 ? `${Math.round((p.purchasing.confirmed / p.purchasing.quotesGiven) * 100)}% of quotes` : undefined} />
          <Stat label="Packages delivered" value={String(p.purchasing.delivered)} />
        </Card>
        <Card
          title="Receiving"
          href="/dashboard/receiving"
          accent="bg-amber-500"
          now={[`${plural(n.receiving.inProgress, "shipment")} being received`, `${plural(n.receiving.waitingForDecision, "shipment")} waiting for a decision`]}
        >
          <Stat label={`Shipments received ${when}`} value={String(p.receiving.received)} testId="stat-received" />
          <Stat label="Value received" value={moneyWhole(p.receiving.receivedValue)} />
          <Stat label="With a problem found" value={String(p.receiving.withDiscrepancy)} tone={p.receiving.withDiscrepancy > 0 ? "warn" : "plain"} />
          <Stat label="Needing an adjusted quote" value={String(p.receiving.adjustments)} />
        </Card>
        <Card
          title="Accounts"
          href="/dashboard/accounts"
          accent="bg-sky-500"
          now={[
            `${plural(n.accounts.toPay, "order")} to be paid (${money(n.accounts.toPayValue)})`,
            n.accounts.overdue > 0 ? `${plural(n.accounts.overdue, "order")} overdue (${money(n.accounts.overdueValue)})` : "Nothing overdue",
            n.accounts.dueToday > 0 ? `${plural(n.accounts.dueToday, "order")} due today` : "Nothing due today",
          ]}
        >
          <Stat label={`Orders paid ${when}`} value={String(p.accounts.paid)} testId="stat-paid" />
          <Stat label="Amount paid out" value={moneyWhole(p.accounts.paidValue)} />
          <Stat label="Waiting to be paid" value={String(n.accounts.toPay)} note={money(n.accounts.toPayValue)} testId="stat-to-pay" />
          <Stat label="Overdue" value={String(n.accounts.overdue)} note={n.accounts.overdue > 0 ? money(n.accounts.overdueValue) : undefined} tone={n.accounts.overdue > 0 ? "warn" : "plain"} />
        </Card>
      </div>
    </div>
  );
}
