import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { findPublicStorefront } from "@/lib/storefront-public";
import { loadOrderView, tokenOk } from "@/lib/website-checkout";
import { REFERENCE_PATTERN } from "@/lib/storefront-api-rules";
import { StorefrontShell } from "../../../storefront-shell";
import { OrderSummary } from "../../order-summary";

export const metadata: Metadata = { title: "Your order", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

/**
 * A customer's own order (quotation, free label, tracking), opened from the link in their email. The link carries a private code made for
 * that one order; without the right code the page is the same plain "not found" as a wrong address.
 */
export default async function OrderStatusPage({ params, searchParams }: { params: Promise<{ handle: string; ref: string }>; searchParams: Promise<{ k?: string }> }) {
  const { handle, ref } = await params;
  const { k } = await searchParams;
  const reference = ref.toUpperCase();
  if (!REFERENCE_PATTERN.test(reference)) notFound();
  const sf = await findPublicStorefront(handle);
  if (!sf) notFound();
  if (!tokenOk(sf.organizationId, reference, k)) notFound();
  const order = await loadOrderView(sf.organizationId, reference);
  if (!order) notFound();
  return (
    <StorefrontShell name={sf.displayName} handle={sf.handle}>
      <h1 className="text-3xl font-extrabold tracking-tight text-ink">Your order with {sf.displayName}</h1>
      <OrderSummary order={order} />
    </StorefrontShell>
  );
}
