import type { Metadata } from "next";
import Link from "next/link";
import { lookupLoginToken } from "@/lib/affiliate-portal";
import { AuthCard, AuthShell, authBtnPrimary } from "@/components/auth/auth-ui";
import { SigninButton } from "./signin-button";

export const metadata: Metadata = { title: "Affiliate sign in", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

const problems = {
  invalid: { title: "This link isn't valid", body: "Check that you copied the whole link from the email, or ask for a new one." },
  used: { title: "This link was already used", body: "Each link works once. Ask for a new one." },
  expired: { title: "This link has expired", body: "Links work for 30 minutes. Ask for a new one and use it right away." },
} as const;

/** The page the emailed link opens. It only checks the link and shows a button; pressing it signs the person in (so an email scanner opening the link can't use it up). */
export default async function AffiliateSigninPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await lookupLoginToken(token);
  if (found.status !== "valid") {
    const p = problems[found.status];
    return (
      <AuthShell>
        <AuthCard className="max-w-xl p-7 sm:p-10">
          <h1 className="text-3xl font-extrabold tracking-tight text-ink" data-testid="aff-link-problem">{p.title}</h1>
          <p className="mt-3 text-base text-muted">{p.body}</p>
          <Link href="/affiliate" className={`${authBtnPrimary} mt-8 inline-flex`}>Get a new link</Link>
        </AuthCard>
      </AuthShell>
    );
  }
  return (
    <AuthShell>
      <AuthCard className="max-w-xl p-7 sm:p-10">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink">Sign in to your affiliate portal</h1>
        <p className="mt-3 text-base text-muted">Press the button to sign in. This link works once.</p>
        <SigninButton token={token} />
      </AuthCard>
    </AuthShell>
  );
}
