import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { findPublicStorefront } from "@/lib/storefront-public";
import { currentBuyer } from "@/lib/storefront-buyers";
import { listOrders } from "@/lib/storefront-orders";
import { ORDER_STATE_LABEL } from "@/lib/storefront-order-rules";
import { StorefrontShell } from "../../storefront-shell";

export const metadata: Metadata = { title: "Your orders", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

export default async function OrdersPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const sf = await findPublicStorefront(handle);
  if (!sf || !sf.buyOpen) notFound();
  const me = await currentBuyer(sf);
  if (!me) redirect(`/s/${sf.handle}/account`);
  const orders = await listOrders(sf, me.id);
  return (
    <StorefrontShell name={sf.displayName} handle={sf.handle}>
      <h1 className="text-3xl font-extrabold tracking-tight text-ink">Your orders</h1>
      <p className="mt-2 text-base text-muted"><Link className="font-bold text-ink underline" href={`/s/${sf.handle}/order`}>Place a new order</Link> · <Link className="font-bold text-ink underline" href={`/s/${sf.handle}/account`}>Your account</Link></p>
      {orders.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-line p-5 text-base text-muted" data-testid="ords-empty">You have not placed an order yet.</p>
      ) : (
        <ul className="mt-6 divide-y divide-line rounded-2xl border border-line" data-testid="ords-list">
          {orders.map((o) => (
            <li key={o.reference}>
              <Link href={`/s/${sf.handle}/orders/${o.reference}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-stone-50" data-testid="ords-row">
                <span className="font-bold text-ink">{o.reference}</span>
                <span className="text-sm text-muted">{o.createdAt.slice(0, 10)}{o.poNumber ? ` · PO ${o.poNumber}` : ""}</span>
                <span className="ml-auto text-sm font-semibold text-ink">{ORDER_STATE_LABEL[o.state]}</span>
                <span className="text-base font-bold text-ink">{money(o.total)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </StorefrontShell>
  );
}
