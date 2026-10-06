import Link from "next/link";
import { requireOrg } from "@/lib/tenant";
import { getReceivedItems } from "@/lib/receiving-queries";
import { CONDITION_OPTIONS } from "@/lib/receiving-rules";
import { chipClass, formatStamp } from "@/lib/receiving-ui";
import { LocalTime } from "@/components/local-time";
import { groupByBrand } from "@/lib/receiving-brand";
import { db } from "@/db/client";
import { memberships, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

const PAGE = 100;
const control = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900";
type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function ReceivedItemsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const org = await requireOrg();
  const sp = await searchParams;
  const f = { q: one(sp.q), from: one(sp.from), to: one(sp.to), agentId: one(sp.agent), condition: one(sp.condition) };
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const [{ rows, total, totalQuantity }, agents] = await Promise.all([
    getReceivedItems(org.organizationId, { ...f, limit: PAGE, offset: (page - 1) * PAGE }),
    db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.organizationId, org.organizationId))),
  ]);
  const qs = (over: Record<string, string>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: f.q, from: f.from, to: f.to, agent: f.agentId, condition: f.condition, ...over })) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `?${s}` : "";
  };
  const pages = Math.max(1, Math.ceil(total / PAGE));
  // Everything received is grouped under its brand, each brand closed until opened. A search, a filter or a single brand opens them.
  const brands = groupByBrand(rows, (r) => r.brand);
  const openAll = !!(f.q.trim() || f.from || f.to || f.agentId || f.condition) || brands.length === 1;

  return (
    <div className="mx-auto max-w-[96rem] px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Received Items</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-slate-400">
            The permanent record of everything received: product, NDC, lot number, quantity, condition, expiration and the receiving agent who handled it. Each lot of a product is its own line, and the accepted quantity (received minus returned) is what the Inventory department will draw from. A shipment appears here once receiving is submitted.
          </p>
        </div>
        <a href={`/api/receiving/received-items/csv${qs({ page: "" })}`} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800">
          Download as CSV
        </a>
      </div>

      <form method="get" className="mt-5 flex flex-wrap items-end gap-3">
        <div className="min-w-[14rem] flex-1">
          <label htmlFor="ri-q" className="text-xs font-medium text-slate-600 dark:text-slate-400">Search</label>
          <input id="ri-q" name="q" defaultValue={f.q} className={`${control} w-full`} placeholder="Product, NDC, lot #, customer, order #, agent" />
        </div>
        <div>
          <label htmlFor="ri-from" className="text-xs font-medium text-slate-600 dark:text-slate-400">Received from</label>
          <input id="ri-from" name="from" type="date" defaultValue={f.from} className={control} />
        </div>
        <div>
          <label htmlFor="ri-to" className="text-xs font-medium text-slate-600 dark:text-slate-400">to</label>
          <input id="ri-to" name="to" type="date" defaultValue={f.to} className={control} />
        </div>
        <div>
          <label htmlFor="ri-agent" className="text-xs font-medium text-slate-600 dark:text-slate-400">Received by</label>
          <select id="ri-agent" name="agent" defaultValue={f.agentId} className={control}>
            <option value="">Anyone</option>
            {agents.map((a) => <option key={a.id} value={a.id}>{a.name || a.email}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="ri-cond" className="text-xs font-medium text-slate-600 dark:text-slate-400">Condition</label>
          <select id="ri-cond" name="condition" defaultValue={f.condition} className={control}>
            <option value="">Any</option>
            {CONDITION_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <button className="rounded-lg bg-[var(--dept-accent,#F7B838)] px-4 py-2 text-sm font-semibold text-amber-950 hover:brightness-95">Filter</button>
        {(f.q || f.from || f.to || f.agentId || f.condition) && <Link href="/dashboard/receiving/received-items" className="pb-2 text-sm text-amber-800 underline dark:text-amber-300">Clear</Link>}
      </form>

      <p className="mt-4 text-xs text-slate-500">{total} product lines · {totalQuantity} units</p>
      <div className="mt-2 space-y-2">
        {brands.map((b) => {
          const units = b.rows.reduce((n, r) => n + r.quantity, 0);
          const accepted = b.rows.reduce((n, r) => n + (r.quantityAccepted ?? 0), 0);
          const recalled = b.rows.filter((r) => r.recallStatus === "RECALLED").length;
          const pending = b.rows.filter((r) => r.quantityAccepted == null).length;
          return (
            <details key={b.key} open={openAll} data-testid="brand-block" className="group/brand rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                <span aria-hidden className="text-[10px] text-slate-400 transition group-open/brand:rotate-90">▶</span>
                <span data-testid="brand-name" className={`rounded-full px-2.5 py-0.5 text-sm font-semibold ${chipClass(b.brand)}`}>{b.brand}</span>
                <span className="text-sm text-slate-600 dark:text-slate-300"><strong className="tabular-nums">{b.rows.length}</strong> {b.rows.length === 1 ? "product line" : "product lines"}</span>
                <span className="text-sm text-slate-600 dark:text-slate-300"><strong className="tabular-nums">{units}</strong> received · <strong className="tabular-nums" data-testid="brand-accepted">{accepted}</strong> accepted</span>
                {pending > 0 && <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-semibold text-yellow-900 dark:bg-yellow-900/40 dark:text-yellow-100">{pending} pending review</span>}
                {recalled > 0 && <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">{recalled} recalled</span>}
              </summary>
              <div className="overflow-x-auto border-t border-slate-200 dark:border-slate-800">
                <table className="w-full min-w-[84rem] text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2">Date received</th>
                      <th className="px-3 py-2">Received by</th>
                      <th className="px-3 py-2">Package opened</th>
                      <th className="px-3 py-2">Customer</th>
                      <th className="px-3 py-2">Order</th>
                      <th className="px-3 py-2">Product</th>
                      <th className="px-3 py-2">NDC</th>
                      <th className="px-3 py-2">Lot #</th>
                      <th className="px-3 py-2 text-right">Qty received</th>
                      <th className="px-3 py-2 text-right">Qty accepted</th>
                      <th className="px-3 py-2">Condition</th>
                      <th className="px-3 py-2">Expiration</th>
                      <th className="px-3 py-2">Accepted / return</th>
                      <th className="px-3 py-2">Recall check</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {b.rows.map((r) => (
                      <tr key={r.id} data-testid="item-row" className="align-top">
                        <td className="whitespace-nowrap px-3 py-2">{formatStamp(r.receivedAt)}</td>
                        <td className="whitespace-nowrap px-3 py-2 font-medium">{r.receivedBy ?? "—"}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500"><LocalTime value={r.startedAt} /></td>
                        <td className="whitespace-nowrap px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${chipClass(r.customer)}`}>{r.customer || "—"}</span></td>
                        <td className="whitespace-nowrap px-3 py-2"><Link href={`/dashboard/receiving/intake/${r.packageId}`} className="text-amber-800 underline dark:text-amber-300">{r.orderNumber}</Link></td>
                        <td className="min-w-[13rem] px-3 py-2">
                          <span className="font-medium">{r.productName}</span>
                          {r.productCode && <span className="block text-xs text-slate-500">{r.productCode}</span>}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums">{r.ndc || "—"}</td>
                        <td className="whitespace-nowrap px-3 py-2">{r.lotNumber || <span className="text-orange-700 dark:text-orange-300">missing</span>}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.quantity}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.quantityAccepted == null ? <span className="text-slate-400">pending</span> : r.quantityAccepted}</td>
                        <td className="whitespace-nowrap px-3 py-2">{r.condition || "—"}</td>
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums">{r.expirationEarliest ? (r.expirationLatest && r.expirationLatest !== r.expirationEarliest ? `${r.expirationEarliest} – ${r.expirationLatest}` : r.expirationEarliest) : "—"}</td>
                        <td className="whitespace-nowrap px-3 py-2">{dispositionLabel(r.needsReturn, r.quantityToReturn)}</td>
                        <td className="whitespace-nowrap px-3 py-2">{recallLabel(r.recallStatus, r.recallName)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          );
        })}
        {rows.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500 dark:border-slate-700">No received items match.</p>}
      </div>
      {pages > 1 && (
        <nav className="mt-4 flex items-center gap-3 text-sm" aria-label="Pages">
          {page > 1 && <Link href={`/dashboard/receiving/received-items${qs({ page: String(page - 1) })}`} className="underline">← Newer</Link>}
          <span className="text-slate-500">Page {page} of {pages}</span>
          {page < pages && <Link href={`/dashboard/receiving/received-items${qs({ page: String(page + 1) })}`} className="underline">Older →</Link>}
        </nav>
      )}
    </div>
  );
}

function dispositionLabel(needsReturn: string | null, qty: number | null) {
  if (needsReturn === "YES") return <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-900 dark:bg-red-900/40 dark:text-red-100">Return{qty ? ` ${qty}` : ""}</span>;
  if (needsReturn === "PENDING_REVIEW") return <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-900 dark:bg-yellow-900/40 dark:text-yellow-100">Pending review</span>;
  if (needsReturn === "NO") return <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-900 dark:bg-green-900/40 dark:text-green-100">Accepted</span>;
  return <span className="text-slate-400">—</span>;
}

function recallLabel(status: string | null, name: string | null) {
  if (status === "RECALLED") return <span title={name ?? undefined} className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-bold text-white">Recalled</span>;
  if (status === "CHECKED") return <span className="text-xs text-slate-600 dark:text-slate-300">Checked</span>;
  return <span className="text-slate-400">—</span>;
}
