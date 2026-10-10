import Link from "next/link";
import { collectionSummary, listCollectible, recentPayments } from "@/lib/receivable-service";
import { ageBucket, dueText } from "@/lib/receivable-rules";
import { card, fmtDay, fmtMoney } from "@/components/sales-ui";
import { requireCollect } from "./gate";
import { CollectList, type CollectRow } from "./collect-list";

export const dynamic = "force-dynamic";

// To Be Collected: the money customers still owe on sent invoices, how late it is, and where payments are recorded.
export default async function ToBeCollectedPage() {
  const org = await requireCollect();
  const [list, sum, recent] = await Promise.all([listCollectible(org.organizationId), collectionSummary(org.organizationId), recentPayments(org.organizationId, 14)]);
  const rows: CollectRow[] = list.map((r) => ({ id: r.id, number: r.number, buyer: r.buyer, dueDate: r.dueDate, total: r.total, balance: r.balance, partly: r.status === "PARTIALLY_PAID", bucket: ageBucket(r.dueDate, sum.today), dueText: dueText(r.dueDate, sum.today) }));
  const tile = "rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900";
  return (
    <div className="max-w-5xl px-4 py-6 sm:px-8" data-testid="collect-page">
      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">To Be Collected</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
        Invoices Sales has sent that still have a balance. Open one to record a payment when the money arrives; Customer Service then sees it under Payments Received.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-4" data-testid="collect-tiles">
        <div className={tile}><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Owed to us</p><p className="mt-1 text-xl font-bold tabular-nums" data-testid="tile-owed">{fmtMoney(sum.owed)}</p></div>
        <div className={tile}><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Past due</p><p className="mt-1 text-xl font-bold tabular-nums text-red-700 dark:text-red-300" data-testid="tile-pastdue">{fmtMoney(sum.pastDue)}</p></div>
        <div className={tile}><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Due in the next 7 days</p><p className="mt-1 text-xl font-bold tabular-nums" data-testid="tile-soon">{fmtMoney(sum.dueSoon)}</p></div>
        <div className={tile}><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Collected, last 30 days</p><p className="mt-1 text-xl font-bold tabular-nums text-green-700 dark:text-green-300" data-testid="tile-collected">{fmtMoney(sum.collected30)}</p></div>
      </div>
      <div className="mt-5">
        <CollectList rows={rows} />
      </div>
      <details className={`${card} mt-6 !p-0`} data-testid="collect-recent">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-900 dark:text-slate-50">Collected in the last 14 days ({recent.length})</summary>
        {recent.length === 0 ? (
          <p className="border-t border-slate-200 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-400">No payments recorded in the last 14 days.</p>
        ) : (
          <ul className="divide-y divide-slate-100 border-t border-slate-200 text-sm dark:divide-slate-800 dark:border-slate-800">
            {recent.map((p) => (
              <li key={p.paymentId} className="flex flex-wrap items-center gap-3 px-4 py-2" data-testid="collect-recent-row">
                <span className="w-28 text-slate-500">{fmtDay(p.paidOn)}</span>
                <Link href={`/dashboard/accounts/collect/${p.documentId}`} className="font-medium underline">#{p.number}</Link>
                <span className="min-w-0 flex-1 truncate">{p.buyer}{p.method ? ` · ${p.method}` : ""}</span>
                <span className="font-semibold tabular-nums">{fmtMoney(p.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </details>
    </div>
  );
}
