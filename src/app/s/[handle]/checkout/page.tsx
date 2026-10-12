import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { findPublicStorefront } from "@/lib/storefront-public";
import { loadCheckoutCatalog } from "@/lib/website-checkout";
import { StorefrontShell } from "../../storefront-shell";
import { CheckoutForm } from "./checkout-form";

export const metadata: Metadata = { title: "Sell us your supplies", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function CheckoutPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const sf = await findPublicStorefront(handle);
  if (!sf || !sf.checkoutOpen) notFound();
  const catalog = await loadCheckoutCatalog(sf.organizationId);
  return (
    <StorefrontShell name={sf.displayName} handle={sf.handle}>
      <h1 className="text-3xl font-extrabold tracking-tight text-ink">Sell your supplies to {sf.displayName}</h1>
      <p className="mt-2 text-base text-muted">Choose what you are sending and see what we will pay. Then give us your shipping address and bank account for the deposit. You get your quotation and a free shipping label right away.</p>
      <CheckoutForm handle={sf.handle} catalog={catalog} />
    </StorefrontShell>
  );
}
