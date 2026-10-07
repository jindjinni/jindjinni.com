import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { receivingItemSerials } from "@/db/schema";
import { requireOrg } from "@/lib/tenant";
import { getInventory } from "@/lib/inventory-service";
import { expirySpan, MONEY, rangeLabel } from "@/lib/inventory-rules";
import { conditionChip } from "@/lib/inventory-ui";
import { FLAG_LABELS, flagsFromString } from "@/lib/receiving-serial-rules";

export const dynamic = "force-dynamic";

const nf = new Intl.NumberFormat("en-US");

// One product in Inventory: each of its lines (condition + expiration group) with the lots behind it and the serial
// numbers Receiving scanned for those units.
export default async function InventoryProductPage({ params }: { params: Promise<{ key: string }> }) {
  const { key: raw } = await params;
  const productKey = decodeURIComponent(raw);
  const org = await requireOrg();
  const snap = await getInventory(org.organizationId);
  const lines = snap.lines.filter((l) => l.productKey === productKey);
  if (lines.length === 0) notFound();

  const itemIds = [...new Set(lines.flatMap((l) => l.layers.map((x) => x.sourceItemId)).filter((x): x is string => !!x))];
  const serialRows = itemIds.length
    ? await db
        .select({ itemId: receivingItemSerials.itemId, serial: receivingItemSerials.serial, lot: receivingItemSerials.lot, expiry: receivingItemSerials.expiry, flag: receivingItemSerials.flag })
        .from(receivingItemSerials)
        .where(and(eq(receivingItemSerials.organizationId, org.organizationId), inArray(receivingItemSerials.itemId, itemIds)))
    : [];
  const serialsByItem = new Map<string, typeof serialRows>();
  for (const s of serialRows) serialsByItem.set(s.itemId, [...(serialsByItem.get(s.itemId) ?? []), s]);

  const head = lines[0];
  const units = lines.reduce((n, l) => n + l.quantity, 0);
  return (
    <div className="max-w-5xl">
      <Link href="/dashboard/inventory" className="text-sm text-emerald-800 underline dark:text-emerald-300">‹ Live Stock</Link>
      <h1 className="mt-2 text-xl font-bold text-slate-900 dark:text-slate-50" data-testid="ip-title">{head.productName}</h1>
      <p className="text-sm text-slate-600 dark:text-slate-400">{head.brand} · <strong className="tabular-nums">{nf.format(units)}</strong> in stock across {lines.length} {lines.length === 1 ? "line" : "lines"}</p>

      <div className="mt-5 space-y-4">
        {lines.map((l) => {
          const serials = l.layers.flatMap((x) => (x.sourceItemId ? serialsByItem.get(x.sourceItemId) ?? [] : []));
          const uniq = [...new Map(serials.map((s) => [(s.serial ?? "").toLowerCase() + "|" + (s.lot ?? ""), s])).values()].filter((s) => s.serial);
          return (
            <section key={l.key} data-testid="ip-line" className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${conditionChip(l.condition)}`}>{l.condition}</span>
                <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-900 dark:bg-sky-900/40 dark:text-sky-100">{l.group.label}</span>
                {l.expiryFrom && <span className="text-xs text-slate-600 dark:text-slate-300">{expirySpan(l.expiryFrom, l.expiryTo)}</span>}
                <span className="ml-auto text-sm"><strong className="tabular-nums" data-testid="ip-line-qty">{nf.format(l.quantity)}</strong> in stock</span>
              </div>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                {l.costKnownUnits > 0 ? <>Cost value {MONEY.format(l.costValue)}</> : "Cost not known"}
                {rangeLabel(l.estLow, l.estHigh) && <> · Estimated value {rangeLabel(l.estLow, l.estHigh)}</>}
              </p>

              <table className="mt-3 w-full text-left text-sm" data-testid="ip-lots">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    <th className="py-1 pr-3 font-medium">Lot</th>
                    <th className="py-1 pr-3 font-medium">Expiration</th>
                    <th className="py-1 text-right font-medium">Units</th>
                  </tr>
                </thead>
                <tbody>
                  {l.lots.map((lot, i) => (
                    <tr key={i} className="border-t border-slate-100 dark:border-slate-800" data-testid="ip-lot">
                      <td className="py-1.5 pr-3">{lot.lot ?? <span className="text-slate-400">no lot number</span>}</td>
                      <td className="py-1.5 pr-3 tabular-nums">{lot.expiry ?? "none"}</td>
                      <td className="py-1.5 text-right font-semibold tabular-nums">{nf.format(lot.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {uniq.length > 0 && (
                <details className="mt-3" data-testid="ip-serials">
                  <summary className="cursor-pointer text-sm font-medium text-emerald-800 dark:text-emerald-300">{nf.format(uniq.length)} serial {uniq.length === 1 ? "number" : "numbers"} scanned at Receiving</summary>
                  <ul className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-2 lg:grid-cols-3">
                    {uniq.map((s, i) => {
                      const flags = flagsFromString(s.flag);
                      return (
                        <li key={i} className="tabular-nums text-slate-800 dark:text-slate-100" data-testid="ip-serial">
                          {s.serial}{s.lot && <span className="text-slate-500"> · lot {s.lot}</span>}
                          {flags.length > 0 && <span className="ml-1 text-amber-700 dark:text-amber-300">({flags.map((f) => FLAG_LABELS[f]).join(", ")})</span>}
                        </li>
                      );
                    })}
                  </ul>
                </details>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
