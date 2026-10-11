import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { findPublicStorefront } from "@/lib/storefront-public";
import { currentBuyer } from "@/lib/storefront-buyers";
import { orderByReference } from "@/lib/storefront-orders";
import { ORDER_REFERENCE_PATTERN, ORDER_STATE_LABEL } from "@/lib/storefront-order-rules";
import { StorefrontShell } from "../../../storefront-shell";

export const metadata: Metadata = { title: "Your order", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

/** One of the signed-in pharmacy's own orders. Another pharmacy's order, or one that does not exist, is "not found". */
export default async function OrderDetailPage({ params, searchParams }: { params: Promise<{ handle: string; ref: string }>; searchParams: Promise<{ placed?: string }> }) {
  const { handle, ref } = await params;
  const { placed } = await searchParams;
  const sf = await findPublicStorefront(handle);
  if (!sf || !sf.buyOpen) notFound();
  const me = await currentBuyer(sf);
  if (!me) redirect(`/s/${sf.handle}/account`);
  const reference = ref.toUpperCase();
  if (!ORDER_REFERENCE_PATTERN.test(reference)) notFound();
  const o = await orderByReference(sf, me.id, reference);
  if (!o) notFound();
  return (
    <StorefrontShell name={sf.displayName} handle={sf.handle}>
      {placed === "1" && (
        <p className="mb-6 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-base font-semibold text-emerald-900" role="status" data-testid="ord-placed">
          {o.state === "confirmed" ? "Thank you. Your order is confirmed." : "Thank you. We received your order and will confirm it shortly."} We emailed you a copy.
        </p>
      )}
      <h1 className="text-3xl font-extrabold tracking-tight text-ink" data-testid="ord-ref">{o.reference}</h1>
      <p className="mt-2 text-base text-muted"><span className="font-bold text-ink" data-testid="ord-state">{ORDER_STATE_LABEL[o.state]}</span> · placed {o.createdAt.slice(0, 10)}{o.poNumber ? ` · PO ${o.poNumber}` : ""}</p>
      <ul className="mt-6 divide-y divide-line rounded-2xl border border-line" data-testid="ord-lines">
        {o.lines.map((l, i) => (
          <li key={i} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <span className="min-w-0 flex-1"><span className="font-bold text-ink">{l.name}</span> <span className="text-sm text-muted">({l.condition})</span></span>
            <span className="text-sm text-muted">{l.quantity} × {money(l.unitPrice)}</span>
            <span className="w-24 text-right font-bold text-ink">{money(l.lineTotal)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-right text-lg font-extrabold text-ink" data-testid="ord-total">Total {money(o.total)}</p>
      <p className="mt-6 text-sm"><Link className="font-bold text-ink underline" href={`/s/${sf.handle}/orders`}>All your orders</Link> · <Link className="font-bold text-ink underline" href={`/s/${sf.handle}/order`}>Place another order</Link></p>
    </StorefrontShell>
  );
}
