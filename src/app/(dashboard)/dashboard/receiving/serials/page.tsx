import Link from "next/link";
import { requireOrg } from "@/lib/tenant";
import { SOURCE_LABELS, checkLabel, getSerialRegister } from "@/lib/receiving-serial-register";
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

export default async function SerialNumbersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const org = await requireOrg();
  const sp = await searchParams;
  const f = { q: one(sp.q), from: one(sp.from), to: one(sp.to), flagged: one(sp.flagged) === "1" };
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const { rows, total, flagged } = await getSerialRegister(org.organizationId, { q: f.q, from: f.from, to: f.to, flaggedOnly: f.flagged, limit: PAGE, offset: (page - 1) * PAGE });
  const qs = (over: Record<string, string>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: f.q, from: f.from, to: f.to, flagged: f.flagged ? "1" : "", ...over })) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `?${s}` : "";
  };
  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <div className="mx-auto max-w-[96rem] px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Serial Numbers</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-400">
            Every serial number the receiving agents recorded in Step 6 (typed, read from a group photo, or scanned), one line each, with the product, lot, NDC, condition, expiration and shipment it came with. A shipment appears here once receiving is submitted. This is the unit-level record the Inventory department will use.
          </p>
        </div>
        <a href={`/api/receiving/serials/csv${qs({ page: "" })}`} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800">
          Download as CSV
        </a>
      </div>

      <form method="get" className="mt-5 flex flex-wrap items-end gap-3">
        <div className="min-w-[14rem] flex-1">
          <label htmlFor="sn-q" className="text-xs font-medium text-slate-600 dark:text-slate-400">Search</label>
          <input id="sn-q" name="q" defaultValue={f.q} className={`${control} w-full`} placeholder="Serial #, lot #, product, NDC, order #, customer" />
        </div>
        <div>
          <label htmlFor="sn-from" className="text-xs font-medium text-slate-600 dark:text-slate-400">Received from</label>
          <input id="sn-from" name="from" type="date" defaultValue={f.from} className={`${control} block`} />
        </div>
        <div>
          <label htmlFor="sn-to" className="text-xs font-medium text-slate-600 dark:text-slate-400">to</label>
          <input id="sn-to" name="to" type="date" defaultValue={f.to} className={`${control} block`} />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm text-slate-700 dark:text-slate-200">
          <input type="checkbox" name="flagged" value="1" defaultChecked={f.flagged} /> Only ones needing a look
        </label>
        <button className="rounded-lg bg-[var(--dept-accent,#F7B838)] px-4 py-2 text-sm font-semibold text-amber-950 hover:brightness-95">Filter</button>
        {(f.q || f.from || f.to || f.flagged) && <Link href="/dashboard/receiving/serials" className="pb-2 text-sm text-amber-800 underline dark:text-amber-300">Clear</Link>}
      </form>

      <p className="mt-4 text-sm text-slate-600 dark:text-slate-300" data-testid="serial-totals">
        <strong className="tabular-nums">{total}</strong> serial {total === 1 ? "number" : "numbers"}
        {flagged > 0 && <> · <strong className="tabular-nums text-red-700 dark:text-red-300">{flagged}</strong> need a look</>}
      </p>

      <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full min-w-[78rem] text-sm">
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
              <th className="px-3 py-2">Order</th>
              <th className="px-3 py-2">Customer</th>
              <th className="px-3 py-2">Received by</th>
              <th className="px-3 py-2">Entered</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {rows.map((r) => {
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
                  <td className="whitespace-nowrap px-3 py-2"><Link href={`/dashboard/receiving/intake/${r.packageId}`} className="text-amber-800 underline dark:text-amber-300">{r.orderNumber}</Link></td>
                  <td className="whitespace-nowrap px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${chipClass(r.customer)}`}>{r.customer || "—"}</span></td>
                  <td className="whitespace-nowrap px-3 py-2">{r.receivedBy ?? "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-600 dark:text-slate-300">{SOURCE_LABELS[r.source]}</td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={12} className="px-3 py-10 text-center text-slate-500">No serial numbers match. Serial numbers appear here once a shipment is submitted.</td></tr>}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <nav className="mt-4 flex items-center gap-3 text-sm" aria-label="Pages">
          {page > 1 && <Link href={`/dashboard/receiving/serials${qs({ page: String(page - 1) })}`} className="underline">← Newer</Link>}
          <span className="text-slate-500">Page {page} of {pages}</span>
          {page < pages && <Link href={`/dashboard/receiving/serials${qs({ page: String(page + 1) })}`} className="underline">Older →</Link>}
        </nav>
      )}
    </div>
  );
}
