import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { findPublicStorefront } from "@/lib/storefront-public";
import { lookupBuyerToken } from "@/lib/storefront-buyers";
import { authBtnPrimary } from "@/components/auth/auth-ui";
import { StorefrontShell } from "../../../storefront-shell";
import { SigninButton } from "./signin-button";

export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

const problems = {
  invalid: { title: "This link isn't valid", body: "Check that you copied the whole link from the email, or ask for a new one." },
  used: { title: "This link was already used", body: "Each link works once. Ask for a new one." },
  expired: { title: "This link has expired", body: "Links work for 30 minutes. Ask for a new one and use it right away." },
} as const;

/** The page the emailed link opens. It only checks the link and shows a button; pressing it signs the person in (so an email scanner opening the link can't use it up). */
export default async function BuyerSigninPage({ params }: { params: Promise<{ handle: string; token: string }> }) {
  const { handle, token } = await params;
  const sf = await findPublicStorefront(handle);
  if (!sf || !sf.buyOpen) notFound();
  const found = await lookupBuyerToken(sf, token);
  if (found.status !== "valid") {
    const p = problems[found.status];
    return (
      <StorefrontShell name={sf.displayName} handle={sf.handle}>
        <h1 className="text-3xl font-extrabold tracking-tight text-ink" data-testid="buyer-link-problem">{p.title}</h1>
        <p className="mt-3 text-base text-muted">{p.body}</p>
        <Link href={`/s/${sf.handle}/account`} className={`${authBtnPrimary} mt-8 !w-auto`}>Get a new link</Link>
      </StorefrontShell>
    );
  }
  return (
    <StorefrontShell name={sf.displayName} handle={sf.handle}>
      <h1 className="text-3xl font-extrabold tracking-tight text-ink">Sign in to {sf.displayName}</h1>
      <p className="mt-3 text-base text-muted">Press the button to sign in. This link works once.</p>
      <SigninButton handle={sf.handle} token={token} />
    </StorefrontShell>
  );
}
