"use client";

import { money } from "@/lib/checkout-rules";
import type { OrderView } from "@/lib/website-checkout";

/**
 * What a customer sees of their own order: the quotation, the free shipping label (to print) and tracking. Used on the final screen after
 * checkout and on the private order page the email links to. It never shows bank numbers, only "account ending 1234".
 */
export function OrderSummary({ order, emailed, justPlaced }: { order: OrderView; emailed?: boolean; justPlaced?: boolean }) {
  const hasLabel = order.label.status === "GENERATED" && !!order.label.labelUrl;
  const received = order.status === "RECEIVED";
  const cancelled = order.status === "CANCELLED";
  return (
    <div className="mt-8 flex flex-col gap-6" data-testid="co-summary">
      <div className="rounded-2xl border border-line p-6">
        <h2 className="text-2xl font-extrabold text-ink" data-testid="co-heading">
          {cancelled ? "This order was cancelled" : received ? "We received your package" : justPlaced ? "Thank you, your order is in" : "Your order"}
        </h2>
        <p className="mt-2 text-base text-muted">
          Order <span className="font-mono font-extrabold text-ink" data-testid="co-reference">{order.reference}</span> &middot; Quotation <span className="font-mono" data-testid="co-quotation">{order.quotationNumber}</span>
        </p>
        {justPlaced && (
          <p className="mt-2 text-sm text-muted" data-testid="co-emailed">
            {emailed ? `We emailed your quotation and shipping label to ${order.email}.` : `We could not send the email just now, so keep this page: your label and quotation are below. You can also reopen it from the link at the bottom.`}
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-line p-6">
        <h3 className="text-lg font-extrabold text-ink">Your quotation</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-sm" data-testid="co-lines">
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
                <th className="py-2 pr-3 font-semibold">Product</th>
                <th className="py-2 pr-3 text-right font-semibold">Qty</th>
                <th className="py-2 pr-3 text-right font-semibold">Each</th>
                <th className="py-2 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {order.lines.map((l, i) => (
                <tr key={i} className="border-b border-line/60 align-top">
                  <td className="py-2 pr-3 text-ink">{l.name}{l.detail ? <span className="block text-xs text-muted">{l.detail}</span> : null}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{l.quantity}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{money(l.unitPrice)}</td>
                  <td className="py-2 text-right tabular-nums">{money(l.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="mt-4 ml-auto flex max-w-xs flex-col gap-1 text-sm">
          {order.bonus > 0 && <div className="flex justify-between"><dt className="text-muted">Bonus</dt><dd className="tabular-nums">{money(order.bonus)}</dd></div>}
          <div className="flex justify-between text-base font-extrabold text-ink"><dt>Estimated payout</dt><dd className="tabular-nums" data-testid="co-total">{money(order.total)}</dd></div>
        </dl>
        <p className="mt-3 text-sm text-muted">
          {order.accountLast4 ? `We pay by direct deposit to your ${order.accountType === "savings" ? "savings" : "checking"} account ending ${order.accountLast4}` : "We pay by direct deposit"} after we receive and check your package. If anything differs from this order, we contact you first.
        </p>
      </div>

      <div className="rounded-2xl border border-line p-6" data-testid="co-label-box">
        <h3 className="text-lg font-extrabold text-ink">Your free shipping label</h3>
        {hasLabel ? (
          <>
            <p className="mt-2 text-sm text-muted">Print it, put it on the box, and drop the box off with {order.label.carrierName ?? "the carrier"}. You do not pay for shipping.</p>
            <div className="mt-4 flex flex-wrap gap-3 print:hidden">
              {order.label.labels.map((l) => (
                <a key={l.number} href={l.labelUrl ?? "#"} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center rounded-full bg-brand px-6 py-3 text-sm font-bold text-ink hover:bg-brand-hover" data-testid="co-label-link">
                  {order.label.labels.length > 1 ? `Open label ${l.number}` : "Open and print my label"}
                </a>
              ))}
              <button type="button" onClick={() => window.print()} className="inline-flex items-center justify-center rounded-full border border-line px-6 py-3 text-sm font-bold text-ink hover:border-ink" data-testid="co-print">Print this page</button>
            </div>
            {order.label.trackingNumber && (
              <p className="mt-4 text-sm text-ink" data-testid="co-tracking">
                {order.label.carrierName ?? "Carrier"} tracking number: <span className="font-mono font-bold">{order.label.trackingNumber}</span>
                {order.label.trackingUrl ? <> &middot; <a href={order.label.trackingUrl} target="_blank" rel="noopener noreferrer" className="font-semibold underline">Track my package</a></> : null}
              </p>
            )}
            <p className="mt-2 text-sm text-muted" data-testid="co-package">Package status: {order.packageStatus}</p>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted" data-testid="co-label-pending">Your label is not ready yet. Our team makes sure every order is right first, and we will email it to you as soon as it is ready. You can reopen this page later to see it.</p>
        )}
      </div>
    </div>
  );
}
