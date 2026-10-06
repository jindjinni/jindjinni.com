import Link from "next/link";
import { requireOrg } from "@/lib/tenant";
import { getLotRegister } from "@/lib/receiving-lot-register";
import { SOURCE_LABELS, checkLabel, getSerialRegister } from "@/lib/receiving-serial-register";
import { traceByCustomer } from "@/lib/receiving-trace";
import { chipClass, formatStamp } from "@/lib/receiving-ui";

export const dynamic = "force-dynamic";

const PAGE = 100;
const control = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900";
type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const TONE = {
  ok: "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-100",
  warn: "bg-yellow-100 text-yellow-900 dark:bg-yellow-900/40 dark:text-yellow-100",
  stop: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-100",
} as const;

export default async function LotSerialTrackerPage({ searchParams }: { searchParams: Promise<SP> }) {
  const org = await requireOrg();
  const sp = await searchParams;
  const view = one(sp.view) === "serials" ? "serials" : "lots";
  const f = { q: one(sp.q), from: one(sp.from), to: one(sp.to), only: one(sp.only) === "1" };
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const paging = { limit: PAGE, offset: (page - 1) * PAGE };

  const [lotsRes, serialsRes] = await Promise.all([
    getLotRegister(org.organizationId, { q: f.q, from: f.from, to: f.to, recalledOnly: view === "lots" && f.only, ...(view === "lots" ? paging : { limit: 1 }) }),
    getSerialRegister(org.organizationId, { q: f.q, from: f.from, to: f.to, flaggedOnly: view === "serials" && f.only, ...(view === "serials" ? paging : { limit: 1 }) }),
  ]);
  // "Who sent it": when the receiver searches for something, list the customers behind every match (lots and serials).
  let trace: ReturnType<typeof traceByCustomer> = [];
  if (f.q.trim()) {
    const [allLots, allSerials] = await Promise.all([
      getLotRegister(org.organizationId, { q: f.q, from: f.from, to: f.to, limit: 5000 }),
      getSerialRegister(org.organizationId, { q: f.q, from: f.from, to: f.to, limit: 5000 }),
    ]);
    trace = traceByCustomer(allLots.rows, allSerials.rows);
  }

  const total = view === "lots" ? lotsRes.total : serialsRes.total;
  const qs = (over: Record<string, string>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ view: view === "serials" ? "serials" : "", q: f.q, from: f.from, to: f.to, only: f.only ? "1" : "", ...over })) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `?${s}` : "";
  };
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const tab = (key: "lots" | "serials", label: string, n: number) => (
    <Link
      href={`/dashboard/receiving/tracker${qs({ view: key === "serials" ? "serials" : "", page: "" })}`}
      aria-current={view === key ? "page" : undefined}
      className={`-mb-px rounded-t-lg border px-4 py-2 text-sm font-semibold ${view === key ? "border-slate-200 border-b-white bg-white text-slate-900 dark:border-slate-700 dark:border-b-slate-900 dark:bg-slate-900 dark:text-slate-50" : "border-transparent text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"}`}
    >
      {label} <span className="font-normal text-slate-500">({n})</span>
    </Link>
  );

  return (
    <div className="mx-auto max-w-[96rem] px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Lot &amp; Serial Tracker</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-400">
            Every lot number and serial number recorded in Step 6, with the product, who sent it, and the date it was received. If a recall comes out, search the lot or serial number (or the product) and the box below shows which customers sent it and how to reach them. A shipment appears here once receiving is submitted.
          </p>
        </div>
        <a href={`/api/receiving/tracker/csv${qs({ page: "", view })}`} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800">
          Download {view === "lots" ? "lots" : "serials"} as CSV
        </a>
      </div>

      <form method="get" className="mt-5 flex flex-wrap items-end gap-3">
        {view === "serials" && <input type="hidden" name="view" value="serials" />}
        <div className="min-w-[14rem] flex-1">
          <label htmlFor="tr-q" className="text-xs font-medium text-slate-600 dark:text-slate-400">Search a lot #, serial #, product, NDC, customer or order</label>
          <input id="tr-q" name="q" defaultValue={f.q} className={`${control} w-full`} placeholder="e.g. PH1U0415 or Dexcom G7 Receiver" />
        </div>
        <div>
          <label htmlFor="tr-from" className="text-xs font-medium text-slate-600 dark:text-slate-400">Received from</label>
          <input id="tr-from" name="from" type="date" defaultValue={f.from} className={`${control} block`} />
        </div>
        <div>
          <label htmlFor="tr-to" className="text-xs font-medium text-slate-600 dark:text-slate-400">to</label>
          <input id="tr-to" name="to" type="date" defaultValue={f.to} className={`${control} block`} />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm text-slate-700 dark:text-slate-200">
          <input type="checkbox" name="only" value="1" defaultChecked={f.only} /> {view === "lots" ? "Only recalled lots" : "Only ones needing a look"}
        </label>
        <button className="rounded-lg bg-[var(--dept-accent,#F7B838)] px-4 py-2 text-sm font-semibold text-amber-950 hover:brightness-95">Search</button>
        {(f.q || f.from || f.to || f.only) && <Link href={`/dashboard/receiving/tracker${view === "serials" ? "?view=serials" : ""}`} className="pb-2 text-sm text-amber-800 underline dark:text-amber-300">Clear</Link>}
      </form>

      {f.q.trim() && (
        <section data-testid="trace" aria-label="Who sent it" className="mt-5 rounded-xl border border-sky-300 bg-sky-50/60 p-4 dark:border-sky-800 dark:bg-sky-950/20">
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-50">Who sent it</h2>
          {trace.length === 0 ? (
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Nothing matches &ldquo;{f.q}&rdquo; in submitted shipments, so no customer is linked to it.</p>
          ) : (
            <>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                &ldquo;{f.q}&rdquo; came from <strong>{trace.length}</strong> {trace.length === 1 ? "customer" : "customers"}:
              </p>
              <ul className="mt-2 grid gap-2 md:grid-cols-2">
                {trace.map((c) => (
                  <li key={`${c.customer}|${c.email}`} data-testid="trace-customer" className="rounded-lg border border-slate-200 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-900">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${chipClass(c.customer)}`}>{c.customer}</span>
                      <span className="text-xs text-slate-500">{c.firstDay === c.lastDay ? c.firstDay : `${c.firstDay} to ${c.lastDay}`}</span>
                    </p>
                    <p className="mt-1 text-slate-700 dark:text-slate-200">{[c.email, c.phone].filter(Boolean).join(" · ") || <span className="text-slate-400">No contact details on the order</span>}</p>
                    <p className="mt-1 text-slate-600 dark:text-slate-300">
                      Orders: {c.orders.join(", ")}
                      {c.units > 0 && <> · {c.units} units in {c.lots.length} {c.lots.length === 1 ? "lot" : "lots"}</>}
                      {c.serials.length > 0 && <> · {c.serials.length} serial {c.serials.length === 1 ? "number" : "numbers"}</>}
                    </p>
                    {c.lots.length > 0 && <p className="mt-1 text-xs text-slate-500">Lots: {c.lots.slice(0, 8).map((l) => `${l.lot} (${l.units})`).join(", ")}{c.lots.length > 8 ? ` +${c.lots.length - 8} more` : ""}</p>}
                    {c.serials.length > 0 && <p className="mt-0.5 text-xs text-slate-500">Serials: {c.serials.slice(0, 6).map((s) => s.serial).join(", ")}{c.serials.length > 6 ? ` +${c.serials.length - 6} more` : ""}</p>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      <div role="tablist" className="mt-6 flex gap-1 border-b border-slate-200 dark:border-slate-700">
        {tab("lots", "Lot numbers", lotsRes.total)}
        {tab("serials", "Serial numbers", serialsRes.total)}
      </div>

      {view === "lots" ? (
        <div className="overflow-x-auto rounded-b-xl border border-t-0 border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full min-w-[78rem] text-sm" data-testid="lot-table">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2">Date received</th>
                <th className="px-3 py-2">Lot #</th>
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2">NDC</th>
                <th className="px-3 py-2">Condition</th>
                <th className="px-3 py-2">Expiration</th>
                <th className="px-3 py-2 text-right">Units</th>
                <th className="px-3 py-2">Came from</th>
                <th className="px-3 py-2">Order</th>
                <th className="px-3 py-2">Received by</th>
                <th className="px-3 py-2">Recall</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {lotsRes.rows.map((r) => (
                <tr key={r.id} data-testid="lot-row" className="align-top">
                  <td className="whitespace-nowrap px-3 py-2">{formatStamp(r.receivedAt)}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono font-medium">{r.lot}</td>
                  <td className="min-w-[13rem] px-3 py-2 font-medium">{r.productName}</td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">{r.ndc || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2">{r.condition || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">{r.expiration || "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.quantity}</td>
                  <td className="whitespace-nowrap px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${chipClass(r.customer)}`}>{r.customer || "—"}</span></td>
                  <td className="whitespace-nowrap px-3 py-2"><Link href={`/dashboard/receiving/intake/${r.packageId}`} className="text-amber-800 underline dark:text-amber-300">{r.orderNumber}</Link></td>
                  <td className="whitespace-nowrap px-3 py-2">{r.receivedBy ?? "—"}</td>
                  <td className="px-3 py-2">{r.recalled ? <span title={r.recallName ?? undefined} className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">Recalled</span> : <span className="text-slate-400">—</span>}</td>
                </tr>
              ))}
              {lotsRes.rows.length === 0 && <tr><td colSpan={11} className="px-3 py-10 text-center text-slate-500">No lot numbers match. They appear here once a shipment is submitted.</td></tr>}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-b-xl border border-t-0 border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full min-w-[84rem] text-sm" data-testid="serial-table">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2">Date received</th>
                <th className="px-3 py-2">Serial #</th>
                <th className="px-3 py-2">Check</th>
                <th className="px-3 py-2">Lot #</th>
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2">NDC</th>
                <th className="px-3 py-2">Condition</th>
                <th className="px-3 py-2">Expiration</th>
                <th className="px-3 py-2">Came from</th>
                <th className="px-3 py-2">Order</th>
                <th className="px-3 py-2">Received by</th>
                <th className="px-3 py-2">Entered</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {serialsRes.rows.map((r) => {
                const c = checkLabel(r.flags);
                return (
                  <tr key={r.id} data-testid="serial-row" className="align-top">
                    <td className="whitespace-nowrap px-3 py-2">{formatStamp(r.receivedAt)}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono font-medium">{r.serial}</td>
                    <td className="px-3 py-2"><span title={r.note ?? undefined} className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TONE[c.tone]}`}>{c.text}</span></td>
                    <td className="whitespace-nowrap px-3 py-2">{r.lot || "—"}</td>
                    <td className="min-w-[13rem] px-3 py-2 font-medium">{r.productName}</td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">{r.ndc || "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2">{r.condition || "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">{r.expiration || "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${chipClass(r.customer)}`}>{r.customer || "—"}</span></td>
                    <td className="whitespace-nowrap px-3 py-2"><Link href={`/dashboard/receiving/intake/${r.packageId}`} className="text-amber-800 underline dark:text-amber-300">{r.orderNumber}</Link></td>
                    <td className="whitespace-nowrap px-3 py-2">{r.receivedBy ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-600 dark:text-slate-300">{SOURCE_LABELS[r.source]}</td>
                  </tr>
                );
              })}
              {serialsRes.rows.length === 0 && <tr><td colSpan={12} className="px-3 py-10 text-center text-slate-500">No serial numbers match. They appear here once a shipment is submitted.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 && (
        <nav className="mt-4 flex items-center gap-3 text-sm" aria-label="Pages">
          {page > 1 && <Link href={`/dashboard/receiving/tracker${qs({ page: String(page - 1) })}`} className="underline">← Newer</Link>}
          <span className="text-slate-500">Page {page} of {pages}</span>
          {page < pages && <Link href={`/dashboard/receiving/tracker${qs({ page: String(page + 1) })}`} className="underline">Older →</Link>}
        </nav>
      )}
    </div>
  );
}
