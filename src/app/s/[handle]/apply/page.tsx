import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { findPublicStorefront } from "@/lib/storefront-public";
import { StorefrontShell } from "../../storefront-shell";
import { ApplyForm } from "./apply-form";

export const metadata: Metadata = { title: "Apply for an account", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function ApplyPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const sf = await findPublicStorefront(handle);
  if (!sf || !sf.buyOpen) notFound();
  return (
    <StorefrontShell name={sf.displayName} handle={sf.handle}>
      <h1 className="text-3xl font-extrabold tracking-tight text-ink">Apply for an account</h1>
      <p className="mt-2 text-base text-muted">For licensed pharmacies. {sf.displayName} reviews every application and checks your license before approving. If you are approved, we email you a link to sign in.</p>
      <ApplyForm handle={sf.handle} />
    </StorefrontShell>
  );
}
