import Link from "next/link";
import { listHandled, listNoticeCandidates } from "@/lib/receivable-service";
import { card, fmtDay, fmtMoney } from "@/components/sales-ui";
import { requirePayments } from "./gate";

export const dynamic = "force-dynamic";

// Payments Received: money that arrived on an invoice, waiting for a person to email the customer (or set it aside). Nothing is sent by itself.
export default async function PaymentsReceivedPage() {
  const org = await requirePayments();
  const [waiting, handled] = await Promise.all([listNoticeCandidates(org.organizationId), listHandled(org.organizationId)]);
  // Grouped under the day the money arrived, newest first.
  const days = [...new Set(waiting.map((w) => w.paidOn))].sort().reverse();
  return (
    <div className="max-w-4xl" data-testid="payments-page">
      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Payments Received</h1>
      <p className="mt-1 mb-5 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
        Accounts has recorded these payments on invoices. Open one to check the email, then press Send, or set it aside if the customer doesn&apos;t need to hear about it. Only payments from the last 30 days are listed.
      </p>
      {waiting.length === 0 ? (
        <p className={`${card} text-sm text-slate-600 dark:text-slate-400`} data-testid="payments-empty">No payments are waiting for an email.</p>
      ) : (
        <div className="space-y-3" data-testid="payments-waiting">
          {days.map((day) => {
            const rows = waiting.filter((w) => w.paidOn === day);
            return (
              <details key={day} className={`${card} !p-0`} data-testid="payments-day">
                <summary className="flex cursor-pointer flex-wrap items-center gap-3 px-4 py-3">
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-50">{fmtDay(day)}</span>
                  <span className="text-sm text-slate-600 dark:text-slate-400">{rows.length} {rows.length === 1 ? "payment" : "payments"}</span>
                  <span className="ml-auto text-sm font-semibold tabular-nums">{fmtMoney(rows.reduce((n, r) => n + r.amount, 0))}</span>
                </summary>
                <ul className="divide-y divide-slate-100 border-t border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                  {rows.map((r) => (
                    <li key={r.paymentId}>
                      <Link href={`/dashboard/customer-service/payments/${r.paymentId}`} className="grid gap-1 px-4 py-2.5 text-sm hover:bg-stone-50 sm:grid-cols-[5rem_1fr_8rem_9rem] sm:items-center dark:hover:bg-slate-800/50" data-testid="payments-row">
                        <span className="font-semibold tabular-nums">#{r.invoiceNumber}</span>
                        <span className="truncate">{r.buyer}</span>
                        <span className="font-semibold tabular-nums sm:text-right">{fmtMoney(r.amount)}</span>
                        <span className={r.email ? "text-slate-500" : "font-medium text-amber-700 dark:text-amber-300"}>{r.email ? "Ready to send" : "Needs an email address"}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </details>
            );
          })}
        </div>
      )}

      <details className={`${card} mt-6 !p-0`} data-testid="payments-handled">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-900 dark:text-slate-50">Already handled ({handled.length})</summary>
        {handled.length === 0 ? (
          <p className="border-t border-slate-200 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-400">Nothing yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 border-t border-slate-200 text-sm dark:divide-slate-800 dark:border-slate-800">
            {handled.map((h) => (
              <li key={h.id}>
                <Link href={`/dashboard/customer-service/payments/${h.paymentId}`} className="flex flex-wrap items-center gap-3 px-4 py-2 hover:bg-stone-50 dark:hover:bg-slate-800/50" data-testid="payments-handled-row">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${h.status === "SENT" ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200" : "bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-200"}`}>{h.status === "SENT" ? "Emailed" : "Set aside"}</span>
                  <span className="font-semibold tabular-nums">#{h.invoiceNumber}</span>
                  <span className="min-w-0 flex-1 truncate">{h.buyerCompany}</span>
                  <span className="tabular-nums">{fmtMoney(h.amount)}</span>
                  <span className="text-xs text-slate-500">{h.handledByName ?? ""} · {fmtDay(h.handledAt.slice(0, 10))}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </details>
    </div>
  );
}
