import Link from "next/link";
import { requireOrg } from "@/lib/tenant";
import { getReceivedItems } from "@/lib/receiving-queries";
import { HELD_LABELS, dayLabel, groupDaily } from "@/lib/receiving-daily";
import { chipClass } from "@/lib/receiving-ui";
import { getSerialsByItem } from "@/lib/receiving-serial-register";

export const dynamic = "force-dynamic";

const control = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900";
type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const isDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

function isoDaysAgo(n: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export default async function DailyReceivingPage({ searchParams }: { searchParams: Promise<SP> }) {
  const org = await requireOrg();
  const sp = await searchParams;
  const from = isDay(one(sp.from)) ? one(sp.from) : isoDaysAgo(13);
  const to = isDay(one(sp.to)) ? one(sp.to) : "";
  const q = one(sp.q);
  const { rows } = await getReceivedItems(org.organizationId, { from, to, q, limit: 5000 });
  const serialsByItem = await getSerialsByItem(org.organizationId, rows.map((r) => r.sourceItemId ?? ""));
  const days = groupDaily(rows, serialsByItem);
  const totalAccepted = days.reduce((n, d) => n + d.accepted, 0);
  const totalHeld = days.reduce((n, d) => n + d.heldUnits, 0);
  const csv = `/api/receiving/daily/csv?from=${from}${to ? `&to=${to}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Daily Receiving</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-400">
            Everything the receiving agents entered in Step 6, combined by day. The same product, NDC, condition, lot and expiration are added together. Only submitted shipments are counted, and only the accepted units: anything recalled, waiting on a return decision or going back is listed separately and never counted as stock. This is what the Inventory department will draw from.
          </p>
        </div>
        <a href={csv} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800">
          Download as CSV
        </a>
      </div>

      <form method="get" className="mt-5 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="dr-from" className="text-xs font-medium text-slate-600 dark:text-slate-400">From</label>
          <input id="dr-from" name="from" type="date" defaultValue={from} className={`${control} block`} />
        </div>
        <div>
          <label htmlFor="dr-to" className="text-xs font-medium text-slate-600 dark:text-slate-400">To</label>
          <input id="dr-to" name="to" type="date" defaultValue={to} className={`${control} block`} />
        </div>
        <div className="min-w-[12rem] flex-1">
          <label htmlFor="dr-q" className="text-xs font-medium text-slate-600 dark:text-slate-400">Search a product, NDC or lot</label>
          <input id="dr-q" name="q" defaultValue={q} className={`${control} w-full`} placeholder="e.g. Dexcom G7 or a lot number" />
        </div>
        <button className="rounded-lg bg-[var(--dept-accent,#F7B838)] px-4 py-2 text-sm font-semibold text-amber-950 hover:brightness-95">Show</button>
        <Link href="/dashboard/receiving/daily" className="pb-2 text-sm text-amber-800 underline dark:text-amber-300">Last 14 days</Link>
      </form>

      <p className="mt-4 text-sm text-slate-600 dark:text-slate-300" data-testid="daily-totals">
        <strong className="tabular-nums">{days.length}</strong> {days.length === 1 ? "day" : "days"} · <strong className="tabular-nums">{totalAccepted}</strong> units accepted
        {totalHeld > 0 && <> · <strong className="tabular-nums text-red-700 dark:text-red-300">{totalHeld}</strong> units held back</>}
      </p>

      {days.length === 0 && (
        <p className="mt-4 rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">
          Nothing was received in these dates, or no shipment has been submitted yet.
        </p>
      )}

      <div className="mt-3 space-y-3">
        {days.map((d, i) => (
          <details key={d.day} open={i === 0} data-testid="daily-day" className="group rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-5 gap-y-1 px-4 py-3">
              <span aria-hidden className="text-xs text-slate-400 transition group-open:rotate-90">▶</span>
              <span className="min-w-[13rem] text-base font-semibold text-slate-900 dark:text-slate-50">{dayLabel(d.day)}</span>
              <span className="text-sm text-slate-600 dark:text-slate-300"><strong className="tabular-nums" data-testid="day-accepted">{d.accepted}</strong> units accepted</span>
              <span className="text-sm text-slate-500">{d.groups.length} {d.groups.length === 1 ? "product line" : "product lines"} · {d.shipments} {d.shipments === 1 ? "shipment" : "shipments"}</span>
              {d.heldUnits > 0 && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-900 dark:bg-red-900/40 dark:text-red-100">{d.heldUnits} held back</span>}
            </summary>
            <div className="space-y-2 border-t border-slate-200 p-3 dark:border-slate-800">
              {d.brands.map((b) => (
                <details key={b.key} open={!!q} data-testid="brand-block" className="group/brand rounded-lg border border-slate-200 dark:border-slate-700">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5">
                    <span aria-hidden className="text-[10px] text-slate-400 transition group-open/brand:rotate-90">▶</span>
                    <span data-testid="brand-name" className={`rounded-full px-2.5 py-0.5 text-sm font-semibold ${chipClass(b.brand)}`}>{b.brand}</span>
                    <span className="text-sm text-slate-600 dark:text-slate-300"><strong className="tabular-nums" data-testid="brand-accepted">{b.accepted}</strong> units accepted</span>
                    <span className="text-sm text-slate-500">{b.groups.length} {b.groups.length === 1 ? "product line" : "product lines"}</span>
                  </summary>
                  <div className="overflow-x-auto border-t border-slate-200 dark:border-slate-700">
                    <table className="w-full min-w-[62rem] text-sm">
                      <thead>
                        <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                          <th className="px-4 py-2">Product</th>
                          <th className="px-3 py-2">NDC</th>
                          <th className="px-3 py-2">Condition</th>
                          <th className="px-3 py-2">Lot #</th>
                          <th className="px-3 py-2">Serial #</th>
                          <th className="px-3 py-2">Expiration</th>
                          <th className="px-3 py-2 text-right">Received</th>
                          <th className="px-3 py-2 text-right">Returned</th>
                          <th className="px-3 py-2 text-right">Accepted</th>
                          <th className="px-3 py-2 text-right">Packages</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {b.groups.map((g) => (
                          <tr key={g.key} className="align-top">
                            <td className="min-w-[14rem] px-4 py-2">
                              <span className="font-medium">{g.productName}</span>
                              {g.productCode && <span className="block text-xs text-slate-500">{g.productCode}</span>}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 tabular-nums">{g.ndc || "—"}</td>
                            <td className="whitespace-nowrap px-3 py-2">{g.condition || "—"}</td>
                            <td className="whitespace-nowrap px-3 py-2">{g.lot || <span className="text-orange-700 dark:text-orange-300">missing</span>}</td>
                            <td className="px-3 py-2" data-testid="serial-cell">
                              {g.serials.length === 0 ? (
                                <span className="text-slate-400">—</span>
                              ) : g.serials.length <= 2 ? (
                                <span className="font-mono text-xs">
                                  {g.serials.map((s, i) => (
                                    <span key={s.serial} className={s.flagged ? "text-orange-700 dark:text-orange-300" : ""}>{i > 0 ? ", " : ""}{s.serial}</span>
                                      ))}
                                    </span>
                                  ) : (
                                    <details>
                                      <summary className="cursor-pointer whitespace-nowrap text-xs font-medium text-amber-800 dark:text-amber-300">{g.serials.length} serial numbers</summary>
                                      <ul className="mt-1 max-h-48 space-y-0.5 overflow-y-auto font-mono text-xs">
                                        {g.serials.map((s) => (
                                          <li key={s.serial} className={s.flagged ? "text-orange-700 dark:text-orange-300" : ""}>{s.serial}</li>
                                        ))}
                                      </ul>
                                    </details>
                                  )}
                                </td>
                                <td className="whitespace-nowrap px-3 py-2 tabular-nums">{g.expiration || "—"}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{g.received}</td>
                                <td className="px-3 py-2 text-right tabular-nums text-slate-500">{g.returned || "—"}</td>
                                <td className="px-3 py-2 text-right font-semibold tabular-nums">{g.accepted}</td>
                                <td className="px-3 py-2 text-right tabular-nums text-slate-500">{g.packages}</td>
                              </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              ))}
              {d.brands.length === 0 && <p className="px-2 py-3 text-center text-sm text-slate-500">Nothing accepted on this day.</p>}
            </div>
            {d.groups.length > 0 && (
              <p className="border-t border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 dark:border-slate-800 dark:text-slate-200">
                Total for the day: <span className="tabular-nums">{d.groups.reduce((n, g) => n + g.received, 0)}</span> received · <span className="tabular-nums">{d.groups.reduce((n, g) => n + g.returned, 0)}</span> returned · <span className="tabular-nums">{d.accepted}</span> accepted
              </p>
            )}
            <p className="border-t border-slate-200 px-4 py-2 text-xs dark:border-slate-800">
              <Link href={`/dashboard/receiving/tracker?from=${d.day}&to=${d.day}`} className="font-medium text-amber-800 underline dark:text-amber-300">See the lot and serial numbers received this day, and who sent them</Link>
            </p>
            {d.held.length > 0 && (
              <div className="border-t border-slate-200 bg-red-50/50 px-4 py-3 dark:border-slate-800 dark:bg-red-950/20">
                <p className="text-sm font-semibold text-red-900 dark:text-red-200">Held back: not counted as stock</p>
                <ul className="mt-1.5 space-y-1 text-sm">
                  {d.held.map((h) => (
                    <li key={h.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                      <span className="font-medium">{h.productName}</span>
                      <span className="text-slate-600 dark:text-slate-300">{h.quantity} units{h.lot ? ` · lot ${h.lot}` : ""}</span>
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-900 dark:bg-red-900/40 dark:text-red-100" title={h.detail ?? undefined}>{HELD_LABELS[h.reason]}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${chipClass(h.customer)}`}>{h.customer}</span>
                      <Link href={`/dashboard/receiving/intake/${h.packageId}`} className="text-xs text-amber-800 underline dark:text-amber-300">{h.orderNumber}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </details>
        ))}
      </div>
    </div>
  );
}
