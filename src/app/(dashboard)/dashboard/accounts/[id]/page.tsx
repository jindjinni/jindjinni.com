import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { canWritePayment } from "@/lib/permissions";
import { getReceivingPackage } from "@/lib/receiving-queries";
import { finalPayout } from "@/lib/receiving-rules";
import { storage } from "@/lib/receiving-storage";
import { chipClass, formatUtcStamp, MONEY } from "@/lib/receiving-ui";
import { MarkPaidButton } from "../mark-paid-button";
import { ReceiptSlot } from "../receipt-slot";

export const dynamic = "force-dynamic";

// One order in Accounts: what the customer is owed, the receipt, and the button that marks it Paid.
export default async function AccountsOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const org = await requireOrg();
  const { id } = await params;
  const data = await getReceivingPackage(org.organizationId, id);
  if (!data) notFound();
  const { pkg, brief, quotedLines } = data;
  const paid = pkg.accountsStatus === "PAID";
  const waiting = !paid && pkg.status !== "IN_PROGRESS" && pkg.accountsDecision === "NEED_TO_BE_PAID";
  const receipts = data.photos.filter((p) => p.kind === "PAYMENT_CONFIRMATION");
  const amount = finalPayout(brief.grandTotal, pkg.adjustedOrderTotal);
  const adjusted = pkg.adjustedOrderTotal != null && pkg.adjustedOrderTotal !== brief.grandTotal;
  const canPay = canWritePayment(org.role);

  return (
    <article>
      <Link href={paid ? "/dashboard/accounts/paid" : "/dashboard/accounts"} className="text-sm text-emerald-800 underline dark:text-emerald-300">
        ‹ {paid ? "Paid Orders" : "To Be Paid"}
      </Link>
      <header className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold leading-tight text-slate-900 dark:text-slate-50">
            {brief.customerName} — {brief.quotationNumber}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className={`rounded-full px-2.5 py-1 font-medium ${chipClass(brief.customerName)}`}>{brief.customerName}</span>
            <span data-testid="order-state" className={`rounded-full px-2.5 py-1 font-medium ${paid ? "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-100" : waiting ? "bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-100" : "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-100"}`}>
              {paid ? "Paid" : waiting ? "Need to Be Paid" : "Not waiting for payment"}
            </span>
            <Link href={`/dashboard/receiving/intake/${pkg.id}`} className="text-emerald-800 underline dark:text-emerald-300">Open the receiving record</Link>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{paid ? "Amount paid" : "Amount to pay"}</p>
          <p className="text-3xl font-bold tabular-nums text-slate-900 dark:text-slate-50" data-testid="order-amount">{MONEY.format(amount)}</p>
          {adjusted && <p className="text-xs text-slate-500">Quoted {MONEY.format(brief.grandTotal)}, adjusted by Receiving</p>}
        </div>
      </header>

      {!paid && !waiting && (
        <p role="note" className="mt-4 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
          Receiving hasn&apos;t sent this order to Accounts yet (it must be submitted and set to Need to Be Paid), so it can&apos;t be paid from here.
        </p>
      )}

      <section className="mt-6 grid gap-6 md:grid-cols-2" aria-label="Order details">
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Customer</h2>
          <dl className="mt-2 space-y-1 text-sm">
            <div className="flex gap-3"><dt className="w-24 shrink-0 text-slate-500">Name</dt><dd>{brief.customerName}</dd></div>
            <div className="flex gap-3"><dt className="w-24 shrink-0 text-slate-500">Email</dt><dd className="break-all">{brief.email ?? "—"}</dd></div>
            <div className="flex gap-3"><dt className="w-24 shrink-0 text-slate-500">Phone</dt><dd>{brief.phone ?? "—"}</dd></div>
            <div className="flex gap-3"><dt className="w-24 shrink-0 text-slate-500">Tracking</dt><dd>{pkg.trackingNumber ?? brief.trackingNumber ?? "—"}</dd></div>
          </dl>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">What was quoted</h2>
          {quotedLines.length === 0 ? (
            <p className="mt-2 whitespace-pre-line text-sm text-slate-700 dark:text-slate-200">{brief.itemsText}</p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100 text-sm dark:divide-slate-800">
              {quotedLines.map((l) => (
                <li key={l.id} className="flex justify-between gap-3 py-1.5">
                  <span>{l.name} <span className="text-slate-500">× {l.quantity}</span></span>
                  <span className="tabular-nums">{MONEY.format(l.lineTotal)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-sm font-medium dark:border-slate-700"><span>Quoted total</span><span className="tabular-nums">{MONEY.format(brief.grandTotal)}</span></p>
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900" aria-label="Payment">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Payment</h2>
        {paid ? (
          <p className="mt-2 text-sm" data-testid="paid-stamp">
            Paid by ACH direct deposit on <strong suppressHydrationWarning>{formatUtcStamp(pkg.paidAt)}</strong>.
          </p>
        ) : (
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Pay <strong className="tabular-nums">{MONEY.format(amount)}</strong> to {brief.customerName} by ACH direct deposit on your payables system, then attach a screenshot of the receipt and mark the order Paid. The date and time are stamped for you.
          </p>
        )}
        <h3 className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Payment receipt</h3>
        <div className="mt-2">
          <ReceiptSlot packageId={pkg.id} photos={receipts} canChange={canPay && waiting} storageOk={storage.configured()} />
          {receipts.length === 0 && !waiting && <span className="text-sm text-slate-500">None attached.</span>}
        </div>
        {waiting && canPay && (
          <div className="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800">
            <MarkPaidButton packageId={pkg.id} hasReceipt={receipts.length > 0} />
          </div>
        )}
        {paid && <p className="mt-4 text-xs text-slate-500">Need to correct a payment? Open the receiving record and change it in Step 10.</p>}
      </section>
    </article>
  );
}
