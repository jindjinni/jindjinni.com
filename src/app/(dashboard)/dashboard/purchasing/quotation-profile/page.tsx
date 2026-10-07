import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { isPurchasingManager } from "@/lib/permissions";
import { getBusinessProfile, getQuotationProfile, resolveBusinessDocumentIdentity } from "@/lib/queries";
import { QuotationProfileForm } from "./quotation-profile-form";

export const dynamic = "force-dynamic";

// Quotation Profile (Settings): the company name and logo printed at the top of quotations. Purchasing's own, separate
// from the main Business Profile, because the company may buy under a different name or brand.
export default async function QuotationProfilePage() {
  const org = await requireOrg();
  if (!isPurchasingManager(org.role)) notFound();
  const [own, main] = await Promise.all([getQuotationProfile(org.organizationId), getBusinessProfile(org.organizationId)]);
  const fallback = resolveBusinessDocumentIdentity(org.organizationName, main);
  const mainLogo = fallback.logoDataUrl;
  const ownLogo = own?.logoData && own.logoContentType ? `data:${own.logoContentType};base64,${own.logoData}` : null;
  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Quotation Profile</h1>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        The company name and logo printed at the top of every quotation. This is Purchasing&apos;s own profile, separate from the main Business Profile, so you can buy under a different name or brand. Quotations never print an address.
      </p>
      <QuotationProfileForm
        initial={{ displayName: own?.displayName ?? "", showLogo: own?.showLogo ?? true }}
        ownLogo={ownLogo}
        fallbackName={fallback.displayName}
        fallbackLogo={mainLogo}
      />
    </div>
  );
}
