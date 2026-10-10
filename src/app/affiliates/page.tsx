import type { Metadata } from "next";
import { AuthCard, AuthShell } from "@/components/auth/auth-ui";
import { AffiliateForm } from "./affiliate-form";

export const metadata: Metadata = { title: "Become an affiliate | jindjinni", description: "Refer companies to jindjinni and earn a one-time cut of each company's first payment." };

export default function AffiliatesPage() {
  return (
    <AuthShell headerLink={{ prompt: "Already have an account?", label: "Sign in", href: "/login" }}>
      <AuthCard className="max-w-2xl">
        <div className="p-7 sm:p-10" data-testid="affiliate-page">
          <h1 className="text-3xl font-extrabold tracking-tight text-ink">Become an affiliate</h1>
          <p className="mt-2 text-base text-muted">
            Know a wholesaler or distributor who would like to run their business in one place? Refer them and earn a cut of what they pay.
          </p>
          <ol className="mt-5 list-decimal space-y-2 pl-5 text-sm text-ink">
            <li>Tell us a little about yourself below.</li>
            <li>We review your request. If we approve it, we email you your own code and link and tell you your cut.</li>
            <li>When a company signs up through your link, or types your code in the Promo code box, and makes its first payment, you earn your cut. It is one time for each company you refer, not ongoing.</li>
          </ol>
          <AffiliateForm />
        </div>
      </AuthCard>
    </AuthShell>
  );
}
