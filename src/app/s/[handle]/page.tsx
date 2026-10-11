import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { findPublicStorefront } from "@/lib/storefront-public";
import { StorefrontShell } from "../storefront-shell";

export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

/** A company's public home page. A wrong, hidden or switched-off address is the same plain "not found". */
export default async function StorefrontHome({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const sf = await findPublicStorefront(handle);
  if (!sf) notFound();
  return (
    <StorefrontShell name={sf.displayName} handle={sf.handle}>
      <h1 className="text-3xl font-extrabold tracking-tight text-ink">{sf.displayName}</h1>
      {sf.welcomeText && <p className="mt-3 whitespace-pre-line text-base text-muted" data-testid="sf-welcome">{sf.welcomeText}</p>}
      <div className="mt-8 grid gap-4">
        {sf.sellOpen ? (
          <Link href={`/s/${sf.handle}/sell`} className="rounded-2xl border border-line p-6 transition hover:border-ink" data-testid="sf-sell-link">
            <h2 className="text-xl font-extrabold text-ink">Sell to us</h2>
            <p className="mt-1 text-sm text-muted">Have supplies to sell? Tell us what you have and we will send you a quotation.</p>
          </Link>
        ) : null}
        {sf.buyOpen && (
          <div className="rounded-2xl border border-line p-6" data-testid="sf-buy-card">
            <h2 className="text-xl font-extrabold text-ink">Pharmacies</h2>
            <p className="mt-1 text-sm text-muted">Licensed pharmacies can apply for an account with {sf.displayName}.</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link href={`/s/${sf.handle}/apply`} className="rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-ink hover:bg-brand-hover" data-testid="sf-apply-link">Apply for an account</Link>
              <Link href={`/s/${sf.handle}/account`} className="rounded-full border border-line px-5 py-2.5 text-sm font-bold text-ink hover:border-ink" data-testid="sf-account-link">Sign in</Link>
            </div>
          </div>
        )}
        {!sf.sellOpen && !sf.buyOpen && (
          <p className="rounded-2xl border border-line p-6 text-sm text-muted" data-testid="sf-nothing">Nothing is open on this page right now. Please check back soon.</p>
        )}
      </div>
    </StorefrontShell>
  );
}
