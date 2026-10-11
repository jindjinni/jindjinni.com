import type { Metadata } from "next";
import { AffiliateProgramSection, Eyebrow, SiteFooter, SiteHeader } from "@/components/landing/site-shell";
import { affiliateExample } from "@/lib/affiliate-program";
import { usd } from "@/lib/billing-config";
import { currentBook } from "@/lib/pricing-service";
import { affiliateCut, monthlyPrice } from "@/lib/pricing-rules";
import { AffiliateForm } from "./affiliate-form";

export const metadata: Metadata = {
  title: "Become an affiliate | jindjinni",
  description: "Refer a company to jindjinni and earn a one-time payout of 50% of one month's subscription once they have been billed for 3 months.",
};

// The example comes from the price book the Lamp sets, never from this file.
export const revalidate = 60;

export default async function AffiliatesPage() {
  const book = await currentBook();
  const monthly = monthlyPrice(book, 1);
  return (
    <div className="min-h-full overflow-x-clip bg-white text-ink" data-testid="affiliate-page">
      <SiteHeader />
      <main>
        <AffiliateProgramSection asPage exampleText={affiliateExample(monthly, affiliateCut(monthly), usd)} />
        <section id="apply" className="scroll-mt-20 bg-slate-50 py-16 sm:py-24">
          <div className="mx-auto max-w-2xl px-4 sm:px-6">
            <Eyebrow>Apply</Eyebrow>
            <h2 className="mt-3 text-balance text-3xl font-extrabold tracking-tight sm:text-4xl">Tell us a little about yourself.</h2>
            <p className="mt-3 text-base text-muted">We review every request and email you our answer. If we approve it, the email has your code and your link.</p>
            <div className="auth-theme mt-6 rounded-[28px] border border-line bg-white p-6 shadow-[0_30px_80px_-40px_rgba(12,31,52,0.35)] sm:p-8">
              <AffiliateForm />
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
