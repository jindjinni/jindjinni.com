import Link from "next/link";
import { card, fmtDay } from "@/components/sales-ui";
import { listToShip } from "@/lib/shipping-service";
import { docWordFor } from "@/lib/shipping-rules";
import { operationsOf } from "@/lib/operations-service";
import { wordsFor } from "@/lib/operations-rules";
import { requireShipping } from "./gate";
import { StartButton } from "./start-button";

export const dynamic = "force-dynamic";

// To Ship: orders that have gone out to the buyer and have no shipment yet. Start a shipment, add its boxes and tracking numbers, then send one email.
export default async function ToShipPage() {
  const { org, canWrite } = await requireShipping();
  const [rows, sides] = await Promise.all([listToShip(org.organizationId), operationsOf(org.organizationId)]);
  const buyers = wordsFor(sides).buyers.toLowerCase();
  return (
    <div className="max-w-4xl" data-testid="toship-page">
      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">To Ship</h1>
      <p className="mt-1 mb-5 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
        Orders that have been sent to your {buyers} and haven&apos;t been shipped yet. Start a shipment, type the tracking number of each box, add photos of the labels, then send your {buyers} one email.
      </p>
      {rows.length === 0 ? (
        <p className={`${card} text-sm text-slate-600 dark:text-slate-400`} data-testid="toship-empty">Nothing is waiting to ship. Sent sales orders appear here.</p>
      ) : (
        <ul className={`${card} divide-y divide-slate-100 !p-0 dark:divide-slate-800`} data-testid="toship-list">
          {rows.map((r) => (
            <li key={r.documentId} className="grid items-center gap-2 px-4 py-3 text-sm sm:grid-cols-[1fr_9rem_auto]" data-testid="toship-row">
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-900 dark:text-slate-50">{r.buyer || "(no name)"}</p>
                <p className="text-xs text-slate-500">
                  {docWordFor(r.kind)} {r.number}{r.reference ? ` · PO ${r.reference}` : ""} · {r.lineCount} {r.lineCount === 1 ? "item" : "items"}
                </p>
              </div>
              <span className="text-xs text-slate-500">Ordered {fmtDay(r.docDate)}</span>
              <span className="flex items-center justify-end gap-3">
                <Link href={`/dashboard/sales/${r.kind === "INVOICE" ? "invoices" : "sales-orders"}/${r.documentId}`} className="text-xs text-slate-600 underline dark:text-slate-400">Open order</Link>
                {canWrite && <StartButton documentId={r.documentId} />}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
