import Link from "next/link";
import { requireOrg } from "@/lib/tenant";
import { getToBePaid } from "@/lib/accounts-queries";
import { dayHeading, dayOf, groupByDay, orderMatches, sumAmounts } from "@/lib/accounts-rules";
import { chipClass, MONEY } from "@/lib/receiving-ui";

export const dynamic = "force-dynamic";

const control = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900";
type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

// To Be Paid: every submitted order that Receiving sent to Accounts ("Need to Be Paid") and nobody has paid yet.
// It fills itself; nothing is typed in here. Orders sit under the day they were received, oldest first, so the
// ones that have waited longest are on top.
export default async function ToBePaidPage({ searchParams }: { searchParams: Promise<SP> }) {
  const org = await requireOrg();
  const q = one((await searchParams).q).trim();
  const all = await getToBePaid(org.organizationId);
  const shown = all.filter((o) => orderMatches(o, q));
  const days = groupByDay(shown, (o) => dayOf(o.receivedAt), false);
  const withReceipt = shown.filter((o) => o.receipts > 0).length;

  return (
    <div>
      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">To Be Paid</h1>
      <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-400">
        Orders Receiving has finished and sent to Accounts. Open one, pay it on your payables system, attach the receipt and mark it Paid. It then moves to Paid Orders with the date and time.
      </p>

      <form method="get" className="mt-5 flex flex-wrap items-end gap-3">
        <div className="min-w-[12rem] flex-1">
          <label htmlFor="tbp-q" className="text-xs font-medium text-slate-600 dark:text-slate-400">Search a customer, quotation number or tracking number</label>
          <input id="tbp-q" name="q" defaultValue={q} className={`${control} w-full`} placeholder="e.g. a customer name" />
        </div>
        <button className="rounded-lg bg-[var(--dept-accent,#60a5fa)] px-4 py-2 text-sm font-semibold text-emerald-950 hover:brightness-95">Search</button>
        {q && <Link href="/dashboard/accounts" className="pb-2 text-sm text-emerald-800 underline dark:text-emerald-300">Show all</Link>}
      </form>

      <p className="mt-4 text-sm text-slate-600 dark:text-slate-300" data-testid="tbp-totals">
        <strong className="tabular-nums">{shown.length}</strong> {shown.length === 1 ? "order" : "orders"} waiting · <strong className="tabular-nums">{MONEY.format(sumAmounts(shown))}</strong> to pay
        {shown.length > 0 && <> · <span className="tabular-nums">{withReceipt}</span> with a receipt attached</>}
      </p>

      {shown.length === 0 && (
        <p className="mt-4 rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">
          {q ? "No waiting order matches that search." : "Nothing is waiting to be paid. When Receiving sets an order to Need to Be Paid, it shows up here by itself."}
        </p>
      )}

      <div className="mt-3 space-y-3">
        {days.map((d) => (
          <details key={d.day || "none"} open={!!q} data-testid="tbp-day" className="group rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-5 gap-y-1 px-4 py-3">
              <span aria-hidden className="text-xs text-slate-400 transition group-open:rotate-90">▶</span>
              <span className="font-semibold text-slate-900 dark:text-slate-50">Received {d.day ? dayHeading(d.day) : "(no date)"}</span>
              <span className="text-sm text-slate-600 dark:text-slate-300"><strong className="tabular-nums">{d.orders.length}</strong> {d.orders.length === 1 ? "order" : "orders"}</span>
              <span className="text-sm text-slate-600 dark:text-slate-300"><strong className="tabular-nums">{MONEY.format(d.total)}</strong></span>
              {d.receipts < d.orders.length && (
                <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-medium text-sky-900 dark:bg-sky-900/40 dark:text-sky-100">{d.orders.length - d.receipts} need a receipt</span>
              )}
            </summary>
            <ul className="divide-y divide-slate-100 border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800">
              {d.orders.map((o) => (
                <li key={o.id} data-testid="tbp-order">
                  <Link href={`/dashboard/accounts/${o.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/60">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${chipClass(o.customerName)}`}>{o.customerName}</span>
                    <span className="font-medium text-slate-900 dark:text-slate-50">{o.quotationNumber}</span>
                    {o.trackingNumber && <span className="text-xs text-slate-500">{o.trackingNumber}</span>}
                    {o.adjusted && <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-900 dark:bg-orange-900/40 dark:text-orange-100">Adjusted</span>}
                    <span className="ml-auto flex items-center gap-3">
                      <span className={`text-xs ${o.receipts > 0 ? "text-green-700 dark:text-green-300" : "text-slate-500"}`}>{o.receipts > 0 ? "Receipt attached" : "No receipt yet"}</span>
                      <strong className="tabular-nums">{MONEY.format(o.amount)}</strong>
                      <span aria-hidden className="text-slate-400">›</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </div>
  );
}
