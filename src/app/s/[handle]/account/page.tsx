import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { findPublicStorefront } from "@/lib/storefront-public";
import { currentBuyer } from "@/lib/storefront-buyers";
import { buyerSignOutAction } from "@/app/actions/storefront-buyers";
import { orderingOpen } from "@/lib/storefront-orders";
import { StorefrontShell } from "../../storefront-shell";
import { LinkForm } from "./link-form";

export const metadata: Metadata = { title: "Your account", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

/** Signed out: the email box. Signed in (and still approved): the pharmacy's own page. Open ordering, then your past orders. */
export default async function AccountPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const sf = await findPublicStorefront(handle);
  if (!sf || !sf.buyOpen) notFound();
  const me = await currentBuyer(sf);
  if (!me) {
    return (
      <StorefrontShell name={sf.displayName} handle={sf.handle}>
        <h1 className="text-3xl font-extrabold tracking-tight text-ink">Pharmacy sign in</h1>
        <p className="mt-2 text-base text-muted">Approved pharmacies only. Type the email you applied with and we will email you a one-time sign-in link. There is no password.</p>
        <LinkForm handle={sf.handle} />
        <p className="mt-6 text-sm text-muted">No account yet? <a className="font-bold text-ink underline" href={`/s/${sf.handle}/apply`} data-testid="acc-apply-link">Apply for one</a>.</p>
      </StorefrontShell>
    );
  }
  return (
    <StorefrontShell name={sf.displayName} handle={sf.handle}>
      <div data-testid="acc-signed-in">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink">Welcome, {me.contactName}</h1>
        <p className="mt-2 text-base text-muted" data-testid="acc-pharmacy">{me.businessName} has an approved account with {sf.displayName}.</p>
        {(await orderingOpen(sf)) ? (
          <div className="mt-6 flex flex-wrap gap-3">
            <a className="rounded-full bg-ink px-6 py-3 text-base font-bold text-white" href={`/s/${sf.handle}/order`} data-testid="acc-order">Place an order</a>
            <a className="rounded-full border border-line bg-white px-6 py-3 text-base font-bold text-ink hover:border-ink" href={`/s/${sf.handle}/orders`} data-testid="acc-orders">Your orders</a>
          </div>
        ) : (
          <p className="mt-6 rounded-2xl border border-line p-5 text-sm text-muted" data-testid="acc-closed">Online ordering is not open right now. Please contact {sf.displayName} to order.</p>
        )}
        <form action={buyerSignOutAction.bind(null, sf.handle)} className="mt-8">
          <button className="rounded-full border border-line bg-white px-4 py-2 text-sm font-bold text-ink hover:border-ink" data-testid="acc-signout">Sign out</button>
        </form>
      </div>
    </StorefrontShell>
  );
}
