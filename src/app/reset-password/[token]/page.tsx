import type { Metadata } from "next";
import Link from "next/link";
import { lookupResetToken } from "@/lib/password-reset";
import { AuthCard, AuthShell, authBtnPrimary } from "@/components/auth/auth-ui";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

const problems = {
  invalid: { title: "This link isn't valid", body: "Check that you copied the whole link from the email, or ask for a new one." },
  used: { title: "This link was already used", body: "Each link works once. If you still can't sign in, ask for a new one." },
  expired: { title: "This link has expired", body: "Links work for an hour. Ask for a new one and use it right away." },
} as const;

export default async function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await lookupResetToken(token);

  if (found.status !== "valid") {
    const p = problems[found.status];
    return (
      <AuthShell>
        <AuthCard className="max-w-xl p-7 sm:p-10">
          <h1 className="text-3xl font-extrabold tracking-tight text-ink" data-testid="reset-problem">{p.title}</h1>
          <p className="mt-3 text-base text-muted">{p.body}</p>
          <Link href="/forgot-password" className={`${authBtnPrimary} mt-8 inline-flex`}>
            Get a new link
          </Link>
        </AuthCard>
      </AuthShell>
    );
  }
  return <ResetForm token={token} />;
}
