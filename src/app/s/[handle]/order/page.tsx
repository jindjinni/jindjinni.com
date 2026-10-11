import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { randomBytes } from "node:crypto";
import { findPublicStorefront } from "@/lib/storefront-public";
import { currentBuyer } from "@/lib/storefront-buyers";
import { catalogFor, loadOrderBuyer, orderingOpen } from "@/lib/storefront-orders";
import { StorefrontShell } from "../../storefront-shell";
import { OrderForm } from "./order-form";

export const metadata: Metadata = { title: "Place an order", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

/** The signed-in pharmacy's own price list, each line In stock or Out of stock, with a quantity box. Everyone else is sent to sign in. */
export default async function OrderPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const sf = await findPublicStorefront(handle);
  if (!sf || !sf.buyOpen) notFound();
  const me = await currentBuyer(sf);
  if (!me) redirect(`/s/${sf.handle}/account`);
  if (!(await orderingOpen(sf))) {
    return (
      <StorefrontShell name={sf.displayName} handle={sf.handle}>
        <h1 className="text-3xl font-extrabold tracking-tight text-ink">Place an order</h1>
        <p className="mt-3 rounded-2xl border border-line p-5 text-base text-muted" data-testid="ord-closed">Online ordering is not open right now. Please contact {sf.displayName} to order.</p>
        <p className="mt-6 text-sm"><Link className="font-bold text-ink underline" href={`/s/${sf.handle}/account`}>Back to your account</Link></p>
      </StorefrontShell>
    );
  }
  const buyer = await loadOrderBuyer(sf, me.id);
  if (!buyer) redirect(`/s/${sf.handle}/account`);
  const items = await catalogFor(sf, buyer);
  return (
    <StorefrontShell name={sf.displayName} handle={sf.handle}>
      <h1 className="text-3xl font-extrabold tracking-tight text-ink">Place an order</h1>
      <p className="mt-2 text-base text-muted" data-testid="ord-intro">Your price list for {me.businessName}. Choose quantities, then place the order. <Link className="font-bold text-ink underline" href={`/s/${sf.handle}/orders`}>Your orders</Link></p>
      <OrderForm handle={sf.handle} items={items} formKey={randomBytes(18).toString("base64url")} />
    </StorefrontShell>
  );
}
