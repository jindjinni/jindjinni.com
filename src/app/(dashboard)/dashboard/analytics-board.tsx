"use client";

import Link from "next/link";
import { DUE_BUCKETS, FUNNEL_STEPS, dropped, pct, shortDay, type DueBucketKey } from "@/lib/analytics-rules";
import { PERIOD_WORDS, money, moneyWhole, plural, type Period } from "@/lib/home-rules";
import type { Pulse } from "@/lib/home-stats";

// Colors are picked by the job they do (checked with the data-viz palette validator, light and dark):
//  - steps in a process: one blue hue, lighter to darker (ordinal ramp)
//  - two things side by side (delivered vs received): blue and orange
//  - how something ended or how urgent it is: fixed status colors, always with an icon and a word.
const STEP_FILL = ["bg-[#86b6ef] dark:bg-[#184f95]", "bg-[#5598e7] dark:bg-[#256abf]", "bg-[#2a78d6] dark:bg-[#3987e5]", "bg-[#1c5cab] dark:bg-[#6da7ec]", "bg-[#104281] dark:bg-[#9ec5f4]"];
const SERIES_BLUE = "bg-[#2a78d6] dark:bg-[#3987e5]";
const SERIES_ORANGE = "bg-[#eb6834] dark:bg-[#d95926]";
const GOOD = "bg-[#0ca30c]";
const CRITICAL = "bg-[#d03b3b]";
const WARNING = "bg-[#fab219]";
const SERIOUS = "bg-[#ec835a]";
const NEUTRAL = "bg-[#898781]";

/** A short note that appears on hover or keyboard focus. */
function Tip({ text, children, className = "", align = "center", style }: { text: string; children: React.ReactNode; className?: string; align?: "center" | "left"; style?: React.CSSProperties }) {
  return (
    <span className={`group/tip relative outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${className}`} tabIndex={0} role="img" aria-label={text} style={style}>
      {children}
      <span role="tooltip" className={`pointer-events-none absolute bottom-full z-20 mb-1 hidden whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white shadow-lg group-hover/tip:block group-focus/tip:block dark:bg-slate-100 dark:text-slate-900 ${align === "left" ? "left-0" : "left-1/2 -translate-x-1/2"}`}>
        {text}
      </span>
    </span>
  );
}

function Kpi({ label, value, note, tone = "plain", testId }: { label: string; value: string; note?: string; tone?: "plain" | "warn" | "good"; testId?: string }) {
  const color = tone === "warn" ? "text-red-700 dark:text-red-400" : tone === "good" ? "text-emerald-700 dark:text-emerald-400" : "text-slate-900 dark:text-slate-50";
  return (
    <div className="min-w-0 rounded-xl bg-slate-50 px-3 py-3 dark:bg-slate-800/60">
      <div className={`whitespace-nowrap text-2xl font-bold tabular-nums ${color}`} data-testid={testId}>
        {value}
      </div>
      <div className="mt-0.5 text-xs font-medium text-slate-600 dark:text-slate-300">{label}</div>
      {note && <div className="mt-0.5 text-xs text-slate-500">{note}</div>}
    </div>
  );
}

function Panel({ title, hint, children, testId }: { title: string; hint?: string; children: React.ReactNode; testId?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 p-4 dark:border-slate-800" data-testid={testId}>
      <h4 className="text-sm font-bold text-slate-900 dark:text-slate-50">{title}</h4>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
      <div className="mt-3">{children}</div>
    </div>
  );
}

/** The same numbers as a plain table, for anyone who prefers reading them (and for screen readers). */
function AsTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <details className="mt-3 text-xs text-slate-500">
      <summary className="cursor-pointer select-none font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100">Show as a table</summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700">
              {head.map((h, i) => (
                <th key={h} className={`py-1 pr-3 font-semibold ${i > 0 ? "text-right" : ""}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={String(r[0])} className="border-b border-slate-100 dark:border-slate-800">
                {r.map((c, i) => (
                  <td key={i} className={`py-1 pr-3 tabular-nums ${i > 0 ? "text-right" : ""}`}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/** A process drawn as boxes joined by arrows, each box showing how many are at that step. */
function Flow({ steps, testId }: { steps: { label: string; value: number; note?: string; tone?: "plain" | "warn" | "good" }[]; testId: string }) {
  return (
    <ol className="flex flex-col items-stretch sm:flex-row" data-testid={testId}>
      {steps.map((s, i) => {
        const color = s.tone === "warn" && s.value > 0 ? "text-red-700 dark:text-red-400" : s.tone === "good" ? "text-emerald-700 dark:text-emerald-400" : "text-slate-900 dark:text-slate-50";
        const ring = s.tone === "warn" && s.value > 0 ? "border-red-300 dark:border-red-800" : "border-slate-200 dark:border-slate-700";
        return (
          <li key={s.label} className="flex flex-1 flex-col items-stretch sm:flex-row sm:items-center">
            <div className={`flex-1 rounded-xl border bg-white px-3 py-2.5 text-center dark:bg-slate-900 ${ring}`}>
              <div className={`text-2xl font-bold tabular-nums ${color}`}>{s.value.toLocaleString("en-US")}</div>
              <div className="text-xs font-medium text-slate-700 dark:text-slate-300">{s.label}</div>
              {s.note && <div className="mt-0.5 text-[11px] text-slate-500">{s.note}</div>}
            </div>
            {i < steps.length - 1 && (
              <span aria-hidden="true" className="select-none self-center px-1 py-0.5 text-lg leading-none text-slate-400">
                <span className="sm:hidden">↓</span>
                <span className="hidden sm:inline">→</span>
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Quotations that made it to each step, as bars that can only shrink. */
function Funnel({ funnel, when }: { funnel: Pulse["periods"][Period]["purchasing"]["funnel"]; when: string }) {
  const top = Math.max(funnel.given, 1);
  return (
    <div data-testid="funnel">
      <ul className="space-y-1">
        {FUNNEL_STEPS.map((step, i) => {
          const n = funnel[step.key];
          const prev = i > 0 ? funnel[FUNNEL_STEPS[i - 1].key] : n;
          const lost = dropped(prev, n);
          const width = n === 0 ? 0 : Math.max(2, (n / top) * 100);
          return (
            <li key={step.key}>
              {i > 0 && (
                <div className="ml-1 flex items-center gap-1.5 py-0.5 text-[11px] text-slate-500" aria-hidden={lost === 0}>
                  <span aria-hidden="true">↓</span>
                  {lost > 0 ? `${plural(lost, "quotation")} did not go further` : "all went on"}
                </div>
              )}
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-medium text-slate-800 dark:text-slate-200">{step.label}</span>
                <span className="shrink-0 tabular-nums text-slate-900 dark:text-slate-50">
                  <span className="font-bold" data-testid={`funnel-${step.key}`}>
                    {n}
                  </span>
                  <span className="ml-1.5 text-xs text-slate-500">{pct(n, funnel.given)}%</span>
                </span>
              </div>
              <Tip align="left" className="mt-1 block h-3.5 rounded-r-[4px] bg-slate-100 dark:bg-slate-800" text={`${step.label}: ${n} of ${funnel.given} given ${when} (${pct(n, funnel.given)}%). ${step.note}.`}>
                <span className={`block h-full rounded-r-[4px] ${STEP_FILL[i]}`} style={{ width: `${width}%` }} />
              </Tip>
            </li>
          );
        })}
      </ul>
      <AsTable head={["Step", "Quotations", "Share of given"]} rows={FUNNEL_STEPS.map((s) => [s.label, funnel[s.key], `${pct(funnel[s.key], funnel.given)}%`])} />
    </div>
  );
}

/** How the quotations given in the period ended: well, badly, or not yet. One bar, three parts, each with an icon and a word. */
function Outcome({ funnel, when }: { funnel: Pulse["periods"][Period]["purchasing"]["funnel"]; when: string }) {
  const parts = [
    { key: "successful", label: "Successful", icon: "✓", n: funnel.successful, fill: GOOD, note: "Received by us and not sent back" },
    { key: "unsuccessful", label: "Unsuccessful", icon: "✕", n: funnel.unsuccessful, fill: CRITICAL, note: "Cancelled, returned, or sent back after checking" },
    { key: "inProgress", label: "Still in progress", icon: "…", n: funnel.inProgress, fill: NEUTRAL, note: "On its way somewhere in between" },
  ] as const;
  const total = funnel.given;
  return (
    <div data-testid="outcome">
      {total === 0 ? (
        <p className="text-sm text-slate-500">No quotations given {when}.</p>
      ) : (
        <div className="flex h-4 gap-[2px]" role="img" aria-label={`Of ${total} quotations given ${when}: ${parts.map((p) => `${p.n} ${p.label.toLowerCase()}`).join(", ")}`}>
          {parts.map((p) =>
            p.n > 0 ? (
              <Tip key={p.key} className="block h-full" style={{ width: `${(p.n / total) * 100}%`, minWidth: "8px" }} text={`${p.label}: ${p.n} of ${total} (${pct(p.n, total)}%). ${p.note}.`} align="left">
                <span className={`block h-full rounded-[4px] ${p.fill}`} />
              </Tip>
            ) : null,
          )}
        </div>
      )}
      <ul className="mt-3 grid gap-2 sm:grid-cols-3">
        {parts.map((p) => (
          <li key={p.key} className="flex items-start gap-2">
            <span aria-hidden="true" className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${p.fill}`}>
              {p.icon}
            </span>
            <span className="min-w-0 text-sm">
              <span className="block font-bold tabular-nums text-slate-900 dark:text-slate-50" data-testid={`outcome-${p.key}`}>
                {p.n} <span className="text-xs font-normal text-slate-500">{total > 0 ? `${pct(p.n, total)}%` : ""}</span>
              </span>
              <span className="block text-xs font-medium text-slate-700 dark:text-slate-300">{p.label}</span>
              <span className="block text-[11px] leading-snug text-slate-500">{p.note}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The last seven days as columns: one series, or two side by side. Only the busiest day and today carry a number; hover for the rest. */
function Days({ days, series, testId }: { days: string[]; series: { name: string; values: number[]; fill: string }[]; testId: string }) {
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const today = days.length - 1;
  return (
    <div data-testid={testId}>
      {series.length > 1 && (
        <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
          {series.map((s) => (
            <span key={s.name} className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-[3px] ${s.fill}`} />
              {s.name}
            </span>
          ))}
        </div>
      )}
      <div className="flex h-36 items-end gap-2 border-b border-slate-200 dark:border-slate-700">
        {days.map((d, i) => {
          const text = `${shortDay(d)}: ${series.map((s) => `${s.values[i]} ${s.name.toLowerCase()}`).join(", ")}`;
          return (
            <Tip key={d} className="flex h-full flex-1 items-end justify-center gap-[2px]" text={text}>
              {series.map((s) => {
                const v = s.values[i];
                const showNumber = v > 0 && (v === Math.max(...s.values) || i === today);
                return (
                  <span key={s.name} className={`flex h-full min-w-0 flex-1 flex-col justify-end ${series.length === 1 ? "max-w-[44px]" : "max-w-[28px]"}`}>
                    {showNumber && <span className="mb-0.5 text-center text-[11px] font-semibold tabular-nums text-slate-700 dark:text-slate-200">{v}</span>}
                    <span className={`block w-full rounded-t-[4px] ${s.fill}`} style={{ height: v === 0 ? "0" : `${Math.max(4, (v / max) * 100)}%`, maxHeight: "calc(100% - 16px)" }} />
                  </span>
                );
              })}
            </Tip>
          );
        })}
      </div>
      <div className="mt-1 flex gap-2 text-[11px] text-slate-500">
        {days.map((d, i) => (
          <span key={d} className={`flex-1 text-center ${i === today ? "font-semibold text-slate-800 dark:text-slate-200" : ""}`}>
            {i === today ? "Today" : shortDay(d)}
          </span>
        ))}
      </div>
      <AsTable head={["Day", ...series.map((s) => s.name)]} rows={days.map((d, i) => [shortDay(d), ...series.map((s) => s.values[i])])} />
    </div>
  );
}

const DUE_LOOK: Record<DueBucketKey, { fill: string; icon: string }> = {
  overdueLong: { fill: CRITICAL, icon: "!" },
  overdue: { fill: SERIOUS, icon: "!" },
  today: { fill: WARNING, icon: "●" },
  tomorrow: { fill: "bg-[#86b6ef] dark:bg-[#6da7ec]", icon: "" },
  later: { fill: "bg-[#2a78d6] dark:bg-[#3987e5]", icon: "" },
  noDay: { fill: NEUTRAL, icon: "" },
};

/** Unpaid orders by how soon the payment is due. */
function DueBars({ buckets }: { buckets: Pulse["now"]["accounts"]["buckets"] }) {
  const rows = DUE_BUCKETS.filter((b) => b.key !== "noDay" || buckets.noDay.count > 0);
  const max = Math.max(1, ...rows.map((b) => buckets[b.key].count));
  const total = rows.reduce((n, b) => n + buckets[b.key].count, 0);
  if (total === 0)
    return (
      <p className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300" data-testid="due-empty">
        <span aria-hidden="true" className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold text-white ${GOOD}`}>
          ✓
        </span>
        Nothing is waiting to be paid.
      </p>
    );
  return (
    <div data-testid="due-bars">
      <ul className="space-y-2">
        {rows.map((b) => {
          const v = buckets[b.key];
          const look = DUE_LOOK[b.key];
          return (
            <li key={b.key} data-testid={`due-${b.key}`}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-1.5 truncate font-medium text-slate-800 dark:text-slate-200">
                  {look.icon && (
                    <span aria-hidden="true" className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${b.key === "today" ? "text-slate-900" : "text-white"} ${look.fill}`}>
                      {look.icon}
                    </span>
                  )}
                  {b.label}
                </span>
                <span className="shrink-0 tabular-nums">
                  <span className="font-bold text-slate-900 dark:text-slate-50">{v.count}</span>
                  <span className="ml-1.5 text-xs text-slate-500">{v.count > 0 ? money(v.amount) : ""}</span>
                </span>
              </div>
              <Tip align="left" className="mt-1 block h-3 rounded-r-[4px] bg-slate-100 dark:bg-slate-800" text={`${b.label}: ${plural(v.count, "order")}, ${money(v.amount)}`}>
                <span className={`block h-full rounded-r-[4px] ${look.fill}`} style={{ width: v.count === 0 ? "0" : `${Math.max(2, (v.count / max) * 100)}%` }} />
              </Tip>
            </li>
          );
        })}
      </ul>
      <AsTable head={["When", "Orders", "Amount"]} rows={rows.map((b) => [b.label, buckets[b.key].count, money(buckets[b.key].amount)])} />
    </div>
  );
}

function OpenLink({ href, name }: { href: string; name: string }) {
  return (
    <div className="flex justify-end">
      <Link href={href} className="text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400">
        Open {name}
      </Link>
    </div>
  );
}

/** The full Purchasing picture: numbers, the quotation flow, how they ended, and a week of quotations. */
export function PurchasingBody({ pulse, period }: { pulse: Pulse; period: Period }) {
  const p = pulse.periods[period];
  const when = PERIOD_WORDS[period];
  const f = p.purchasing.funnel;
  return (
    <div className="space-y-4 pt-4" data-testid="perf-purchasing">
      <OpenLink href="/dashboard/purchasing" name="Purchasing" />
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        <Kpi label={`Quotations given ${when}`} value={String(p.purchasing.quotesGiven)} testId="stat-quotes" />
        <Kpi label="Value quoted" value={moneyWhole(p.purchasing.quotedValue)} testId="stat-quoted-value" />
        <Kpi label="Went through the full process" value={String(f.fullProcess)} note={`${pct(f.fullProcess, f.given)}% had a free label and a tracking number`} testId="stat-full-process" />
        <Kpi label="Successful" value={String(f.successful)} tone={f.successful > 0 ? "good" : "plain"} note={f.given > 0 ? `${pct(f.successful, f.given)}% of quotations` : undefined} testId="stat-successful" />
        <Kpi label="Unsuccessful" value={String(f.unsuccessful)} tone={f.unsuccessful > 0 ? "warn" : "plain"} note={f.given > 0 ? `${pct(f.unsuccessful, f.given)}% of quotations` : undefined} testId="stat-unsuccessful" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="From quotation to received" hint={`Of the quotations given ${when}, how many reached each step.`} testId="panel-funnel">
          <Funnel funnel={f} when={when} />
        </Panel>
        <div className="space-y-4">
          <Panel title="How they ended" hint={`The quotations given ${when}: successful, unsuccessful, or still in progress.`}>
            <Outcome funnel={f} when={when} />
          </Panel>
          <Panel title="Quotations given, last 7 days">
            <Days days={pulse.daily.days} series={[{ name: "Quotations", values: pulse.daily.quotes, fill: SERIES_BLUE }]} testId="days-quotes" />
          </Panel>
        </div>
      </div>
    </div>
  );
}

/** The full Receiving picture: what came in, what is queued, where every package is. */
export function ReceivingBody({ pulse, period }: { pulse: Pulse; period: Period }) {
  const p = pulse.periods[period];
  const when = PERIOD_WORDS[period];
  const n = pulse.now;
  const queue = n.receiving.waitingToOpen + n.receiving.inProgress;
  return (
    <div className="space-y-4 pt-4" data-testid="perf-receiving">
      <OpenLink href="/dashboard/receiving" name="Receiving" />
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        <Kpi label={`Delivered ${when}`} value={String(p.purchasing.delivered)} note="Packages the carrier delivered to us" testId="stat-delivered" />
        <Kpi label={`Received ${when}`} value={String(p.receiving.received)} note="Opened and checked by our team" testId="stat-received" />
        <Kpi label="In the queue to be received" value={String(queue)} tone={queue > 0 ? "warn" : "plain"} note={`${n.receiving.waitingToOpen} not started, ${n.receiving.inProgress} being received`} testId="stat-queue" />
        <Kpi label="Value received" value={moneyWhole(p.receiving.receivedValue)} />
        <Kpi label="With a problem found" value={String(p.receiving.withDiscrepancy)} tone={p.receiving.withDiscrepancy > 0 ? "warn" : "plain"} note={p.receiving.adjustments > 0 ? `${p.receiving.adjustments} need an adjusted quote` : undefined} />
      </div>
      <Panel title="Where the packages are" hint="Right now, from the carrier to checked and done.">
          <Flow
            testId="receiving-flow"
            steps={[
              { label: "On the way", value: n.receiving.onTheWay, note: "with the carrier" },
              { label: "Delivered, not started", value: n.receiving.waitingToOpen, note: "waiting in the queue", tone: "warn" },
              { label: "Being received", value: n.receiving.inProgress, note: "someone is checking" },
              { label: `Received ${when}`, value: p.receiving.received, note: "checked and submitted", tone: "good" },
            ]}
          />
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Delivered and received, last 7 days">
          <Days
            days={pulse.daily.days}
            series={[
              { name: "Delivered", values: pulse.daily.delivered, fill: SERIES_BLUE },
              { name: "Received", values: pulse.daily.received, fill: SERIES_ORANGE },
            ]}
            testId="days-receiving"
          />
        </Panel>
        <Panel title="What the queue means" hint="Delivered means the carrier dropped it off. Received means our team opened and checked it.">
          <ul className="space-y-1.5 text-sm text-slate-700 dark:text-slate-300">
            <li>{plural(n.receiving.waitingToOpen, "package")} delivered and waiting for someone to start.</li>
            <li>{plural(n.receiving.inProgress, "package")} being checked right now.</li>
            <li>{plural(n.receiving.onTheWay, "package")} still with the carrier.</li>
            <li>{n.receiving.waitingForDecision > 0 ? `${plural(n.receiving.waitingForDecision, "shipment")} checked and waiting for Accounts to decide.` : "Nothing waiting for Accounts to decide."}</li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}

/** The full Accounts picture: what is overdue or due, how orders move to paid, what was paid. */
export function AccountsBody({ pulse, period }: { pulse: Pulse; period: Period }) {
  const p = pulse.periods[period];
  const when = PERIOD_WORDS[period];
  const n = pulse.now;
  const decisions = n.accounts.decisions;
  return (
    <div className="space-y-4 pt-4" data-testid="perf-accounts">
      <OpenLink href="/dashboard/accounts" name="Accounts" />
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        <Kpi label="Overdue" value={String(n.accounts.overdue)} tone={n.accounts.overdue > 0 ? "warn" : "plain"} note={n.accounts.overdue > 0 ? money(n.accounts.overdueValue) : "Nothing overdue"} testId="stat-overdue" />
        <Kpi label="Due today" value={String(n.accounts.dueToday)} note={n.accounts.dueToday > 0 ? money(n.accounts.buckets.today.amount) : undefined} testId="stat-due-today" />
        <Kpi label="Waiting to be paid" value={String(n.accounts.toPay)} note={money(n.accounts.toPayValue)} testId="stat-to-pay" />
        <Kpi label={`Orders paid ${when}`} value={String(p.accounts.paid)} tone={p.accounts.paid > 0 ? "good" : "plain"} testId="stat-paid" />
        <Kpi label="Amount paid out" value={moneyWhole(p.accounts.paidValue)} />
      </div>
      <Panel title="From received to paid" hint="Right now, what Accounts is doing with received orders.">
        <Flow
          testId="accounts-flow"
          steps={[
            { label: "Waiting for a decision", value: decisions.none, tone: "warn" },
            { label: "Being reviewed", value: decisions.review + decisions.adjusted, note: decisions.adjusted > 0 ? `${decisions.adjusted} need an adjusted quote` : undefined },
            { label: "To be paid", value: n.accounts.toPay },
            { label: `Paid ${when}`, value: p.accounts.paid, tone: "good" },
          ]}
        />
        <p className="mt-2 text-xs text-slate-500">{decisions.returned > 0 ? `${plural(decisions.returned, "order")} to be sent back to the customer.` : "None to be sent back."}</p>
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="When payments are due" hint="Orders waiting to be paid, by how soon they are due.">
          <DueBars buckets={n.accounts.buckets} />
        </Panel>
        <Panel title="Orders paid, last 7 days">
          <Days days={pulse.daily.days} series={[{ name: "Orders paid", values: pulse.daily.paid, fill: SERIES_BLUE }]} testId="days-paid" />
        </Panel>
      </div>
    </div>
  );
}
