import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { canManageSalesSettings } from "@/lib/permissions";
import { ensureSalesProfile, resolveFrom } from "@/lib/sales-service";
import { CompanyProfileForm } from "./company-profile-form";

export const dynamic = "force-dynamic";

// Company Profile: who the quotations and invoices come from (name, address, email, phone, logo), the default payment
// terms and notes, and where the numbering starts. It is Sales' own profile, separate from the Business Profile.
export default async function CompanyProfilePage() {
  const org = await requireOrg();
  if (!canManageSalesSettings(org.role)) notFound();
  const profile = await ensureSalesProfile(org.organizationId);
  const from = await resolveFrom(org.organizationId, profile);
  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Company Profile</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
        The company your quotations and invoices come from. This is what prints at the top of every PDF and what the buyer sees in the email. Changing it never changes an invoice that was already made.
      </p>
      <CompanyProfileForm
        initial={{
          companyName: profile.companyName ?? "",
          address: profile.address ?? "",
          email: profile.email ?? "",
          phone: profile.phone ?? "",
          showLogo: profile.showLogo,
          defaultTerms: profile.defaultTerms,
          defaultNotes: profile.defaultNotes ?? "",
          footerText: profile.footerText ?? "",
          nextInvoiceNumber: profile.nextInvoiceNumber,
          nextQuotationNumber: profile.nextQuotationNumber,
        }}
        logo={profile.logoData && profile.logoContentType ? `data:${profile.logoContentType};base64,${profile.logoData}` : null}
        fallbackName={org.organizationName}
        previewName={from.name}
      />
    </div>
  );
}
