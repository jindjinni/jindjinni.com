import Link from "next/link";
import { notFound } from "next/navigation";
import { getDocument } from "@/lib/sales-service";
import { todayFor } from "@/lib/receivable-service";
import { ageBucket, AGE_LABEL, dueText } from "@/lib/receivable-rules";
import { balanceOf, lineAmount } from "@/lib/sales-rules";
import { canWritePayment } from "@/lib/permissions";
import { StatusChip, card, fmtDay, fmtMoney } from "@/components/sales-ui";
import { requireCollect } from "../gate";
import { CollectPaymentForm } from "../collect-payment-form";

export const dynamic = "force-dynamic";

// One invoice, from Accounts' side: what is owed, how late, every payment so far, and the form to record the next one.
export default async function CollectInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const org = await requireCollect();
  const { id } = await params;
  const found = await getDocument(org.organizationId, id);
  if (!found || found.doc.kind !== "INVOICE" || found.doc.status === "DRAFT") notFound();
  const { doc, lines, payments } = found;
  const today = await todayFor(org.organizationId);
  const owed = balanceOf(doc);
  const open = (doc.status === "SENT" || doc.status === "PARTIALLY_PAID") && owed > 0;
  const bucket = ageBucket(doc.dueDate, today);
  const canWrite = canWritePayment(org.role, org.access) && !org.viewAs;
  return (
    <div className="max-w-4xl space-y-5 px-4 py-6 sm:px-8" data-testid="collect-invoice">
      <Link href="/dashboard/accounts/collect" className="text-sm text-slate-600 underline dark:text-slate-400">← To Be Collected</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50" data-testid="ci-title">Invoice #{doc.number}</h1>
        <StatusChip status={open && bucket !== "CURRENT" ? "PAST_DUE" : (doc.status as "SENT" | "PARTIALLY_PAID" | "PAID" | "VOID")} />
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        {doc.buyerCompany}{doc.buyerEmail ? ` · ${doc.buyerEmail}` : ""} · invoiced {fmtDay(doc.docDate)}{doc.dueDate ? ` · ${dueText(doc.dueDate, today).toLowerCase()} (${fmtDay(doc.dueDate)})` : ""}{doc.terms ? ` · ${doc.terms}` : ""}
      </p>
      <div className={`${card} grid gap-4 sm:grid-cols-4`} data-testid="ci-money">
        <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Invoice total</p><p className="mt-1 text-lg font-bold tabular-nums">{fmtMoney(doc.total)}</p></div>
        <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Paid so far</p><p className="mt-1 text-lg font-bold tabular-nums text-green-700 dark:text-green-300">{fmtMoney(doc.amountPaid)}</p></div>
        <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Still owed</p><p className="mt-1 text-lg font-bold tabular-nums" data-testid="ci-owed">{fmtMoney(owed)}</p></div>
        <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Age</p><p className="mt-1 text-sm font-medium" data-testid="ci-age">{owed > 0 ? AGE_LABEL[bucket] : "Paid in full"}</p></div>
      </div>

      <div className={card} data-testid="ci-payments">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Payments</h2>
        {payments.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">No payment recorded yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100 text-sm dark:divide-slate-800">
            {payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 py-1.5" data-testid="ci-payment">
                <span className="font-medium tabular-nums">{fmtMoney(p.amount)}</span>
                <span className="text-slate-500">{fmtDay(p.paidOn)}{p.method ? ` · ${p.method}` : ""}{p.note ? ` · ${p.note}` : ""}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-slate-500">A payment recorded by mistake is corrected on the invoice in Sales.</p>
      </div>

      {open && canWrite && (
        <div className={card} data-testid="ci-record">
          <h2 className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-50">Record a payment</h2>
          <CollectPaymentForm invoiceId={doc.id} owed={owed} today={today} />
        </div>
      )}
      {open && !canWrite && <p className={`${card} text-sm text-slate-600 dark:text-slate-400`} data-testid="ci-readonly">You can look at this invoice. Only the accountant, an Admin or the Owner records payments.</p>}

      <div className="flex flex-wrap gap-2 text-sm">
        <a href={`/api/sales/documents/${doc.id}/pdf`} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-300 px-3 py-2 font-medium hover:bg-white dark:border-slate-700 dark:hover:bg-slate-900" data-testid="ci-pdf">View the invoice PDF</a>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-sm" data-testid="ci-lines">
          <thead className="bg-sky-700 text-left text-xs uppercase tracking-wide text-white"><tr><th className="px-3 py-2">Item</th><th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2 text-right">Unit price</th><th className="px-3 py-2 text-right">Amount</th></tr></thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="border-t border-slate-100 dark:border-slate-800"><td className="px-3 py-2">{l.productName}</td><td className="px-3 py-2 text-right tabular-nums">{l.quantity}</td><td className="px-3 py-2 text-right tabular-nums">{fmtMoney(l.unitPrice)}</td><td className="px-3 py-2 text-right tabular-nums">{fmtMoney(lineAmount(l.quantity, l.unitPrice))}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
