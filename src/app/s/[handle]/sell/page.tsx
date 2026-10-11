import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { findPublicStorefront } from "@/lib/storefront-public";
import { StorefrontShell } from "../../storefront-shell";
import { SellForm } from "./sell-form";

export const metadata: Metadata = { title: "Sell to us", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function SellPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const sf = await findPublicStorefront(handle);
  if (!sf || !sf.sellOpen) notFound();
  return (
    <StorefrontShell name={sf.displayName} handle={sf.handle}>
      <h1 className="text-3xl font-extrabold tracking-tight text-ink">Sell to {sf.displayName}</h1>
      <p className="mt-2 text-base text-muted">Tell us what you have. We review every request and reply by email with a quotation. Nothing is bought until you accept it.</p>
      <SellForm handle={sf.handle} />
    </StorefrontShell>
  );
}
