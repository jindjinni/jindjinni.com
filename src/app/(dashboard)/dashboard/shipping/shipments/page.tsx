import Link from "next/link";
import { card, fmtDay } from "@/components/sales-ui";
import { listShipments } from "@/lib/shipping-service";
import { STAGES, STAGE_HELP, docWordFor, statusLabel } from "@/lib/shipping-rules";
import { pillClass } from "@/lib/tracking-rules";
import { requireShipping } from "../gate";

export const dynamic = "force-dynamic";

// Shipments: everything going out, grouped by where it is. Each row shows the buyer, the order, every tracking number and the box status.
export default async function ShipmentsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { org } = await requireShipping();
  const q = ((await searchParams).q ?? "").trim().toLowerCase().slice(0, 80);
  const all = await listShipments(org.organizationId);
  const rows = q
    ? all.filter((s) => [s.buyer, s.docNumber, s.reference ?? "", ...s.boxes.map((b) => b.trackingNumber)].some((v) => v.toLowerCase().includes(q)))
    : all;
  return (
    <div className="max-w-5xl" data-testid="shipments-page">
      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Shipments</h1>
      <p className="mt-1 mb-4 max-w-2xl text-sm text-slate-600 dark:text-slate-400">Every shipment going out to your buyers, with the status of each box. Statuses update by themselves when live tracking is connected.</p>
      <form className="mb-5 flex gap-2" role="search">
        <label htmlFor="ship-q" className="sr-only">Search shipments</label>
        <input id="ship-q" name="q" defaultValue={q} placeholder="Search by buyer, order, PO or tracking number" className="w-full max-w-md rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-900" data-testid="ship-search" />
        <button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700">Search</button>
      </form>
      {all.length === 0 ? (
        <p className={`${card} text-sm text-slate-600 dark:text-slate-400`} data-testid="shipments-empty">No shipments yet. Start one from To Ship.</p>
      ) : rows.length === 0 ? (
        <p className={`${card} text-sm text-slate-600 dark:text-slate-400`}>Nothing matches that search.</p>
      ) : (
        <div className="space-y-3">
          {STAGES.map((stage) => {
            const list = rows.filter((s) => s.stage === stage);
            if (list.length === 0) return null;
            return (
              <details key={stage} className={`${card} !p-0`} data-testid="shipments-group" data-stage={stage}>
                <summary className="flex cursor-pointer flex-wrap items-center gap-3 px-4 py-3">
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-50">{stage}</span>
                  <span className="text-sm text-slate-600 dark:text-slate-400">{list.length} {list.length === 1 ? "shipment" : "shipments"}</span>
                  <span className="text-xs text-slate-500">{STAGE_HELP[stage]}</span>
                </summary>
                <ul className="divide-y divide-slate-100 border-t border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                  {list.map((s) => (
                    <li key={s.id}>
                      <Link href={`/dashboard/shipping/shipments/${s.id}`} className="grid gap-1 px-4 py-2.5 text-sm hover:bg-stone-50 sm:grid-cols-[1fr_1.4fr_auto] sm:items-center dark:hover:bg-slate-800/50" data-testid="shipments-row">
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{s.buyer || "(no name)"}</span>
                          <span className="block text-xs text-slate-500">{docWordFor(s.docKind)} {s.docNumber}{s.reference ? ` · PO ${s.reference}` : ""} · shipment {s.seq} · {fmtDay(s.shipDate)}</span>
                        </span>
                        <span className="min-w-0 text-xs tabular-nums text-slate-700 dark:text-slate-300">
                          {s.boxes.length === 0 ? <span className="text-slate-500">No boxes yet</span> : s.boxes.map((b) => <span key={b.trackingNumber} className="block truncate">{b.carrier === "Other" ? "" : `${b.carrier} `}{b.trackingNumber}</span>)}
                        </span>
                        <span className={`justify-self-start rounded-full px-2 py-0.5 text-xs font-semibold sm:justify-self-end ${pillClass(s.status)}`} data-testid="shipments-status">{statusLabel(s.status)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}
