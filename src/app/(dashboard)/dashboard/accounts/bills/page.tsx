import Link from "next/link";
import { listBills, listUnbilled, payablesSummary, recentBillPayments } from "@/lib/payable-service";
import { ageBucket, dueText } from "@/lib/receivable-rules";
import { BILL_LABEL, billBalance, isOpen, type BillStatus } from "@/lib/payable-rules";
import { card, fmtDay, fmtMoney } from "@/components/sales-ui";
import { requireBills } from "./gate";
import { BillsList, type BillRow } from "./bills-list";
import { CreateBillButton } from "./create-bill-button";

export const dynamic = "force-dynamic";

// Supplier Bills: what the company owes its suppliers, how late it is, what waits for approval, and what was paid.
export default async function SupplierBillsPage() {
  const { org, canWrite } = await requireBills();
  const [bills, sum, unbilled, paid] = await Promise.all([listBills(org.organizationId), payablesSummary(org.organizationId), listUnbilled(org.organizationId), recentBillPayments(org.organizationId, 14)]);
  const rows: BillRow[] = bills
    .filter((b) => isOpen(b.status) && billBalance(b) > 0)
    .map((b) => ({
      id: b.id, number: b.billNumber, supplier: b.supplierName, poNumber: b.poNumber ?? "", invoiceNumber: b.supplierInvoiceNumber ?? "", dueDate: b.dueDate, total: b.total, balance: billBalance(b),
      status: b.status as BillStatus, statusLabel: BILL_LABEL[b.status as BillStatus], bucket: ageBucket(b.dueDate, sum.today), dueText: dueText(b.dueDate, sum.today),
    }));
  const tile = "rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900";
  const label = "text-xs font-semibold uppercase tracking-wide text-slate-500";
  return (
    <div className="max-w-5xl px-4 py-6 sm:px-8" data-testid="bills-page">
      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Supplier Bills</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
        What you owe the suppliers you ordered from. When Purchasing marks a supplier&apos;s order as received, a bill appears here. Check it against the supplier&apos;s invoice, approve it, then record the payment when you pay.
        This page keeps records only; no money is moved from here.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-5" data-testid="bills-tiles">
        <div className={tile}><p className={label}>We owe</p><p className="mt-1 text-xl font-bold tabular-nums" data-testid="tile-owed">{fmtMoney(sum.owed)}</p></div>
        <div className={tile}><p className={label}>Past due</p><p className="mt-1 text-xl font-bold tabular-nums text-red-700 dark:text-red-300" data-testid="tile-pastdue">{fmtMoney(sum.pastDue)}</p></div>
        <div className={tile}><p className={label}>Due in 7 days</p><p className="mt-1 text-xl font-bold tabular-nums" data-testid="tile-soon">{fmtMoney(sum.dueSoon)}</p></div>
        <div className={tile}><p className={label}>Waiting for approval</p><p className="mt-1 text-xl font-bold tabular-nums text-amber-700 dark:text-amber-300" data-testid="tile-waiting">{sum.waiting}</p></div>
        <div className={tile}><p className={label}>Paid, last 30 days</p><p className="mt-1 text-xl font-bold tabular-nums text-green-700 dark:text-green-300" data-testid="tile-paid">{fmtMoney(sum.paid30)}</p></div>
      </div>

      {unbilled.length > 0 && (
        <details className={`${card} mt-5 !p-0`} data-testid="bills-unbilled">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-900 dark:text-slate-50">Received orders with no bill yet ({unbilled.length})</summary>
          <ul className="divide-y divide-slate-100 border-t border-slate-200 text-sm dark:divide-slate-800 dark:border-slate-800">
            {unbilled.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-2" data-testid="bills-unbilled-row">
                <span className="font-semibold tabular-nums">{u.poNumber}</span>
                <span className="min-w-0 flex-1 truncate">{u.supplier}</span>
                <span className="font-semibold tabular-nums">{fmtMoney(u.total)}</span>
                {canWrite && <CreateBillButton purchaseOrderId={u.id} />}
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="mt-5">
        <BillsList rows={rows} />
      </div>

      <details className={`${card} mt-6 !p-0`} data-testid="bills-suppliers">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-900 dark:text-slate-50">Owed by supplier ({sum.suppliers.length})</summary>
        {sum.suppliers.length === 0 ? (
          <p className="border-t border-slate-200 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-400">Nothing is owed to any supplier.</p>
        ) : (
          <ul className="divide-y divide-slate-100 border-t border-slate-200 text-sm dark:divide-slate-800 dark:border-slate-800">
            {sum.suppliers.map((s) => (
              <li key={s.supplier} className="flex flex-wrap items-center gap-3 px-4 py-2" data-testid="bills-supplier-row">
                <span className="min-w-0 flex-1 truncate font-medium">{s.supplier}</span>
                <span className="text-slate-500">{s.count} {s.count === 1 ? "bill" : "bills"}</span>
                {s.pastDue > 0 && <span className="text-red-700 dark:text-red-300">{fmtMoney(s.pastDue)} past due</span>}
                <span className="w-28 text-right font-semibold tabular-nums">{fmtMoney(s.owed)}</span>
              </li>
            ))}
          </ul>
        )}
      </details>

      <details className={`${card} mt-3 !p-0`} data-testid="bills-paid">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-900 dark:text-slate-50">Paid in the last 14 days ({paid.length})</summary>
        {paid.length === 0 ? (
          <p className="border-t border-slate-200 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-400">No payments recorded in the last 14 days.</p>
        ) : (
          <ul className="divide-y divide-slate-100 border-t border-slate-200 text-sm dark:divide-slate-800 dark:border-slate-800">
            {paid.map((p) => (
              <li key={p.paymentId} className="flex flex-wrap items-center gap-3 px-4 py-2" data-testid="bills-paid-row">
                <span className="w-28 text-slate-500">{fmtDay(p.paidOn)}</span>
                <Link href={`/dashboard/accounts/bills/${p.billId}`} className="font-medium underline">{p.billNumber}</Link>
                <span className="min-w-0 flex-1 truncate">{p.supplier}{p.method ? ` · ${p.method}` : ""}</span>
                <span className="font-semibold tabular-nums">{fmtMoney(p.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </details>
    </div>
  );
}
