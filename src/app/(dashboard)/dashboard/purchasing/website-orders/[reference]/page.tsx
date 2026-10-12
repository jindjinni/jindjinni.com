import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { featureOn } from "@/lib/features";
import { canRevealBankDetails, canWritePurchasing } from "@/lib/permissions";
import { getStorefront } from "@/lib/storefront-service";
import { REFERENCE_PATTERN } from "@/lib/storefront-api-rules";
import { getOrderRequest } from "@/lib/website-orders-service";
import { loadOrderView, orderViewUrl } from "@/lib/website-checkout";
import { payoutSummaries } from "@/lib/storefront-payouts";
import { maskedLine } from "@/lib/bank-rules";
import { money } from "@/lib/checkout-rules";
import { trackingForQuotations } from "@/lib/tracking-service";
import { BankBox } from "../../website-requests/bank-box";
import { CancelOrderForm, EmailCopyForm, MakeLabelForm } from "./order-actions";
import { clearOrderFlagAction, hideOrderAction } from "@/app/actions/storefront";

export const dynamic = "force-dynamic";

const when = (iso: string) => new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z").toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
const lbl = "text-xs font-medium uppercase tracking-wide text-slate-400";

export default async function WebsiteOrderPage({ params }: { params: Promise<{ reference: string }> }) {
  const org = await requireOrg();
  if (!(await featureOn("storefronts", org.organizationId))) notFound();
  const reference = (await params).reference.toUpperCase();
  if (!REFERENCE_PATTERN.test(reference)) notFound();
  const [req, order, storefront] = await Promise.all([getOrderRequest(org.organizationId, reference), loadOrderView(org.organizationId, reference), getStorefront(org.organizationId)]);
  if (!req || !order) notFound();
  const trackers = await trackingForQuotations(org.organizationId, [order.quotationId]).catch(() => []);
  const bank = (await payoutSummaries(org.organizationId, [req.id])).get(req.id);
  const canWrite = canWritePurchasing(org.role, org.access) && !org.viewAs;
  const canReveal = !org.viewAs && canRevealBankDetails(org.role, org.access);
  const open = order.status === "QUOTED";
  const hasLabel = order.label.status === "GENERATED" && !!order.label.labelUrl;
  const customerLink = storefront ? orderViewUrl(org.organizationId, storefront.handle, reference) : null;

  return (
    <div>
      <p className="text-sm"><Link href="/dashboard/purchasing/website-orders" className="text-slate-500 underline" data-testid="wo-back">&larr; Website orders</Link></p>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50" data-testid="wo-title">Order {order.reference}</h1>
        <span className="text-sm text-slate-500">Quotation {order.quotationNumber} &middot; placed {when(req.createdAt)}{req.source === "API" ? " from your website" : " on your checkout page"}</span>
        {order.status === "CANCELLED" && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-900 dark:bg-red-950 dark:text-red-100" data-testid="wo-cancelled">Cancelled</span>}
        {order.status === "RECEIVED" && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">Received</span>}
      </div>

      {req.flagReason && (
        <div className="mt-4 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200" role="status" data-testid="wo-flag-box">
          <p className="font-medium">Look at this order</p>
          <p className="mt-1" data-testid="wo-flag-reason">{req.flagReason}</p>
          {canWrite && (
            <form action={clearOrderFlagAction.bind(null, reference)} className="mt-2"><button className="rounded-md border border-amber-400 px-3 py-1 text-xs hover:bg-amber-100 dark:hover:bg-amber-900" data-testid="wo-flag-clear">I looked, it is fine</button></form>
          )}
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900" aria-label="Quotation">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">Quotation</h2>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-sm" data-testid="wo-lines">
              <thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800"><th className="py-1 pr-2 font-medium">Product</th><th className="py-1 pr-2 text-right font-medium">Qty</th><th className="py-1 pr-2 text-right font-medium">Each</th><th className="py-1 text-right font-medium">Total</th></tr></thead>
              <tbody>
                {order.lines.map((l, i) => (
                  <tr key={i} className="border-b border-slate-100 align-top dark:border-slate-800"><td className="py-1.5 pr-2 text-slate-900 dark:text-slate-50">{l.name}{l.detail ? <span className="block text-xs text-slate-500">{l.detail}</span> : null}</td><td className="py-1.5 pr-2 text-right tabular-nums">{l.quantity}</td><td className="py-1.5 pr-2 text-right tabular-nums">{money(l.unitPrice)}</td><td className="py-1.5 text-right tabular-nums">{money(l.lineTotal)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="mt-3 ml-auto flex max-w-xs flex-col gap-1 text-sm">
            {order.bonus > 0 && <div className="flex justify-between"><dt className="text-slate-500">Bonus</dt><dd className="tabular-nums">{money(order.bonus)}</dd></div>}
            <div className="flex justify-between font-semibold text-slate-900 dark:text-slate-50"><dt>Payout</dt><dd className="tabular-nums" data-testid="wo-total">{money(order.total)}</dd></div>
          </dl>
          <p className="mt-3"><Link href={`/dashboard/purchasing/quotations/${order.quotationId}`} className="text-sm font-medium text-emerald-700 underline dark:text-emerald-400" data-testid="wo-open-quote">Open the full quotation</Link></p>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900" aria-label="Customer">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">Customer</h2>
          <dl className="mt-2 grid gap-3 sm:grid-cols-2 text-sm">
            <div><dt className={lbl}>Business</dt><dd className="mt-0.5 text-slate-800 dark:text-slate-100">{req.businessName}</dd></div>
            <div><dt className={lbl}>Contact</dt><dd className="mt-0.5 text-slate-800 dark:text-slate-100">{req.contactName}</dd></div>
            <div><dt className={lbl}>Email</dt><dd className="mt-0.5 break-all text-slate-800 dark:text-slate-100" data-testid="wo-email">{req.email}</dd></div>
            <div><dt className={lbl}>Phone</dt><dd className="mt-0.5 text-slate-800 dark:text-slate-100">{req.phone ?? "Not given"}</dd></div>
            <div className="sm:col-span-2"><dt className={lbl}>Ships from</dt><dd className="mt-0.5 text-slate-800 dark:text-slate-100">{[req.street1, req.street2, `${req.city}, ${req.state} ${req.zip}`].filter(Boolean).join(", ")}</dd></div>
            {req.notes && <div className="sm:col-span-2"><dt className={lbl}>Their note</dt><dd className="mt-0.5 whitespace-pre-wrap text-slate-800 dark:text-slate-100">{req.notes}</dd></div>}
          </dl>
          {bank ? (
            <BankBox requestId={req.id} line={maskedLine(bank.accountType, bank.accountLast4)} canReveal={canReveal} erased={!!bank.erasedAt} />
          ) : <p className="mt-4 text-sm text-slate-500">No bank details were sent with this order.</p>}
        </section>
      </div>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900" aria-label="Shipping label and tracking" data-testid="wo-label-section">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">Free shipping label and tracking</h2>
        {hasLabel ? (
          <div className="mt-2 text-sm">
            <p className="flex flex-wrap items-center gap-3">
              {order.label.labels.map((l) => (
                <a key={l.number} href={l.labelUrl ?? "#"} target="_blank" rel="noopener noreferrer" className="rounded-md bg-emerald-600 px-3 py-1.5 font-medium text-white hover:bg-emerald-700" data-testid="wo-label-link">Open label{order.label.labels.length > 1 ? ` ${l.number}` : ""} (to print)</a>
              ))}
            </p>
            <p className="mt-3 text-slate-800 dark:text-slate-100" data-testid="wo-tracking">{order.label.carrierName ?? "Carrier"} tracking number: <span className="font-mono font-semibold">{order.label.trackingNumber ?? "pending"}</span>{order.label.trackingUrl ? <> &middot; <a href={order.label.trackingUrl} target="_blank" rel="noopener noreferrer" className="underline">Track</a></> : null}</p>
            <p className="mt-1 text-slate-500" data-testid="wo-package-status">Package status: {order.packageStatus}{trackers[0]?.statusDetails ? `: ${trackers[0].statusDetails}` : ""}{trackers[0]?.statusAt ? ` (as of ${when(trackers[0].statusAt)})` : ""}</p>
          </div>
        ) : (
          <div className="mt-2 text-sm text-slate-700 dark:text-slate-200">
            <p data-testid="wo-no-label">{order.label.status === "ERROR" ? "The automatic label could not be made." : "No label has been made for this order yet."}</p>
            {canWrite && open && <div className="mt-2"><MakeLabelForm reference={reference} /></div>}
          </div>
        )}
        {customerLink && <p className="mt-3 text-xs text-slate-500">The customer&rsquo;s own order page (they have this link in their email): <a href={customerLink} target="_blank" rel="noopener noreferrer" className="break-all underline" data-testid="wo-customer-link">open it</a></p>}
      </section>

      {canWrite && (
        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900" aria-label="Email the customer" data-testid="wo-email-section">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">Email the customer a copy</h2>
          <p className="mt-1 text-sm text-slate-500">For a customer who cannot find their quotation or label. It carries the quotation, the label link and the tracking number.{req.copySentAt ? ` Last sent ${when(req.copySentAt)}.` : ""}</p>
          <div className="mt-3"><EmailCopyForm reference={reference} email={req.email} /></div>
        </section>
      )}

      {canWrite && (
        <div className="mt-6 flex flex-wrap items-center gap-6">
          {open && <CancelOrderForm reference={reference} />}
          <form action={hideOrderAction.bind(null, req.id, reference, !req.hiddenAt)}><button className="text-xs text-slate-500 underline hover:text-slate-800 dark:hover:text-slate-200" data-testid="wo-hide">{req.hiddenAt ? "Show in the list again" : "Hide from the list"}</button></form>
        </div>
      )}
    </div>
  );
}
