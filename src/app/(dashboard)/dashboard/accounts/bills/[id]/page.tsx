import Link from "next/link";
import { notFound } from "next/navigation";
import { fromNameFor, getBill, noticeItemsFor } from "@/lib/payable-service";
import { todayFor } from "@/lib/receivable-service";
import { ageBucket, dueText } from "@/lib/receivable-rules";
import { BILL_FILE_KIND_LABEL, BILL_LABEL, billBalance, inSupplierNoticeWindow, type BillStatus } from "@/lib/payable-rules";
import { card, fmtDay, fmtMoney } from "@/components/sales-ui";
import { requireBills } from "../gate";
import { ApproveBar, BillDetailsForm, BillFiles, BillPayForm, SupplierNoticeForm } from "./bill-forms";

export const dynamic = "force-dynamic";

const PILL: Record<BillStatus, string> = {
  PENDING: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  APPROVED: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  PARTIALLY_PAID: "bg-yellow-100 text-yellow-900 dark:bg-yellow-950 dark:text-yellow-200",
  PAID: "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200",
  VOID: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

export default async function BillPage({ params }: { params: Promise<{ id: string }> }) {
  const { org, canWrite } = await requireBills();
  const { id } = await params;
  const d = await getBill(org.organizationId, id);
  if (!d) notFound();
  const b = d.bill;
  const status = b.status as BillStatus;
  const [today, from, items] = await Promise.all([todayFor(org.organizationId), fromNameFor(org.organizationId), noticeItemsFor(org.organizationId, b.id)]);
  const owed = billBalance(b);
  const open = status === "PENDING" || status === "APPROVED" || status === "PARTIALLY_PAID";
  const noticeBy = new Map(d.notices.map((n) => [n.paymentId, n]));
  const late = open && owed > 0 ? ageBucket(b.dueDate, today) : "CURRENT";
  const h2 = "text-sm font-semibold text-slate-900 dark:text-slate-50";
  return (
    <div className="max-w-4xl space-y-5 px-4 py-6 sm:px-8" data-testid="bill-page" data-status={status}>
      <div>
        <p className="text-sm"><Link href="/dashboard/accounts/bills" className="underline">Supplier Bills</Link></p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50" data-testid="bill-number">{b.billNumber}</h1>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${PILL[status]}`} data-testid="bill-status">{BILL_LABEL[status]}</span>
        </div>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          <span className="font-medium text-slate-900 dark:text-slate-50" data-testid="bill-supplier">{b.supplierName}</span>
          {b.purchaseOrderId && b.poNumber && <> · our order <Link href={`/dashboard/purchasing/purchase-orders/${b.purchaseOrderId}`} className="underline" data-testid="bill-po-link">{b.poNumber}</Link></>}
          {b.terms ? ` · ${b.terms}` : ""}
        </p>
        {b.approvedAt && <p className="mt-1 text-xs text-slate-500" data-testid="bill-approved">Approved by {b.approvedByName ?? "a team member"} on {fmtDay(b.approvedAt.slice(0, 10))}</p>}
        {status === "VOID" && <p className="mt-1 text-xs text-slate-500" data-testid="bill-void-note">Set aside{b.voidReason ? `: ${b.voidReason}` : ""}</p>}
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <div className={card}><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Invoice total</p><p className="mt-1 text-lg font-bold tabular-nums" data-testid="bill-total">{fmtMoney(b.total)}</p></div>
        <div className={card}><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Paid</p><p className="mt-1 text-lg font-bold tabular-nums text-green-700 dark:text-green-300" data-testid="bill-paid">{fmtMoney(b.amountPaid)}</p></div>
        <div className={card}><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Still owed</p><p className="mt-1 text-lg font-bold tabular-nums" data-testid="bill-owed">{fmtMoney(owed)}</p></div>
        <div className={card}>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Due</p>
          <p className={`mt-1 text-sm font-semibold ${late !== "CURRENT" ? "text-red-700 dark:text-red-300" : ""}`} data-testid="bill-due">{open && owed > 0 ? dueText(b.dueDate, today) : b.dueDate ? fmtDay(b.dueDate) : "No due date"}</p>
          {b.dueDate && open && owed > 0 && <p className="text-xs text-slate-500">{fmtDay(b.dueDate)}</p>}
        </div>
      </div>

      {canWrite && (status === "PENDING" || (open && d.payments.length === 0)) && (
        <section className={card}>
          <ApproveBar billId={b.id} canApprove={status === "PENDING"} canVoid={d.payments.length === 0 && (status === "PENDING" || status === "APPROVED")} />
        </section>
      )}

      <section className={card}>
        <h2 className={`${h2} mb-3`}>The supplier&apos;s invoice</h2>
        <BillDetailsForm
          key={`${b.updatedAt}`}
          billId={b.id}
          canEdit={canWrite && open}
          locked={b.amountPaid > 0}
          initial={{ supplierInvoiceNumber: b.supplierInvoiceNumber ?? "", invoiceDate: b.invoiceDate ?? "", dueDate: b.dueDate ?? "", total: b.total.toFixed(2), note: b.note ?? "", supplierEmail: b.supplierEmail ?? "" }}
        />
        <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-800">
          <BillFiles billId={b.id} canEdit={canWrite && status !== "VOID"} files={d.files.map((f) => ({ id: f.id, filename: f.filename, kindLabel: BILL_FILE_KIND_LABEL[f.kind] ?? "Other", sizeKb: Math.max(1, Math.round(f.sizeBytes / 1024)) }))} />
        </div>
      </section>

      <details className={`${card} !p-0`} data-testid="bill-items">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-900 dark:text-slate-50">Items on the order ({d.lines.length})</summary>
        {d.lines.length === 0 ? (
          <p className="border-t border-slate-200 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-400">No items are listed for this bill.</p>
        ) : (
          <div className="overflow-x-auto border-t border-slate-200 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-4 py-2">Item</th><th className="px-2 py-2">NDC</th><th className="px-2 py-2 text-right">Qty</th><th className="px-2 py-2 text-right">Cost</th><th className="px-4 py-2 text-right">Total</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {d.lines.map((l) => (
                  <tr key={l.position} data-testid="bill-line">
                    <td className="px-4 py-2">{l.name}</td>
                    <td className="px-2 py-2 tabular-nums text-slate-500">{l.ndc ?? ""}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{l.quantity}{l.unit ? ` ${l.unit}` : ""}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{fmtMoney(l.unitCost)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmtMoney(l.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </details>

      {canWrite && (status === "APPROVED" || status === "PARTIALLY_PAID") && (
        <section className={card}>
          <h2 className={`${h2} mb-3`}>Record a payment</h2>
          <BillPayForm billId={b.id} owed={owed} today={today} />
        </section>
      )}
      {status === "PENDING" && <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200" data-testid="bill-needs-approval">This bill is waiting for approval. Once it is approved you can record the payment here.</p>}

      <section className={card}>
        <h2 className={`${h2} mb-2`}>Payments ({d.payments.length})</h2>
        {d.payments.length === 0 ? (
          <p className="text-sm text-slate-600 dark:text-slate-400" data-testid="bill-payments-empty">No payment has been recorded yet.</p>
        ) : (
          <ul className="space-y-2">
            {d.payments.map((p) => {
              const n = noticeBy.get(p.id);
              const item = items.find((i) => i.paymentId === p.id);
              const stillAsk = !n && status !== "VOID" && !!item && inSupplierNoticeWindow(item.recordedDay, today);
              return (
                <li key={p.id} className="rounded-lg border border-slate-200 dark:border-slate-800" data-testid="bill-payment" data-notice={n ? n.status : "NONE"}>
                  <div className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                    <span className="w-28 text-slate-500">{fmtDay(p.paidOn)}</span>
                    <span className="font-semibold tabular-nums">{fmtMoney(p.amount)}</span>
                    <span className="min-w-0 flex-1 truncate text-slate-600 dark:text-slate-400">{[p.method, p.reference ? `ref ${p.reference}` : "", p.note].filter(Boolean).join(" · ")}{p.recordedByName ? ` · by ${p.recordedByName}` : ""}</span>
                    {n?.status === "SENT" && <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-900 dark:bg-green-950 dark:text-green-200" data-testid="payment-emailed">Supplier emailed{n.toEmail ? ` (${n.toEmail})` : ""}</span>}
                    {n?.status === "SKIPPED" && <span className="rounded bg-slate-200 px-2 py-0.5 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300" data-testid="payment-skipped">No email needed</span>}
                  </div>
                  {n?.status === "SENT" && n.body && (
                    <details className="border-t border-slate-100 px-3 py-2 text-sm dark:border-slate-800">
                      <summary className="cursor-pointer text-slate-600 dark:text-slate-400">The email that was sent</summary>
                      <p className="mt-2 text-xs text-slate-500">Subject: {n.subject}</p>
                      <pre className="mt-1 whitespace-pre-wrap font-sans text-sm" data-testid="payment-sent-body">{n.body}</pre>
                    </details>
                  )}
                  {stillAsk && canWrite && item && (
                    <details className="border-t border-slate-100 px-3 py-2 dark:border-slate-800" data-testid="payment-notice-open">
                      <summary className="cursor-pointer text-sm font-medium text-emerald-800 dark:text-emerald-300" data-testid="payment-notice-summary">Email the supplier about this payment</summary>
                      <div className="mt-3">
                        <SupplierNoticeForm
                          billId={b.id}
                          from={from}
                          email={b.supplierEmail ?? ""}
                          item={{ paymentId: p.id, contact: item.contact, reference: item.reference, poNumber: item.poNumber, amount: item.amount, paidOn: item.paidOn, method: item.method, paymentReference: item.paymentReference, balanceAfter: item.balanceAfter }}
                        />
                      </div>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
