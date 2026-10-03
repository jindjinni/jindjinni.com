import { requireOrg } from "@/lib/tenant";
import { getBusinessProfile } from "@/lib/queries";
import { BusinessProfileForm } from "./business-profile-form";
import { LogoUploadForm } from "./logo-upload-form";

/**
 * Settings -> Business Profile. "Who the company is" -- stored once here
 * and reused everywhere a document needs company identity (today: the
 * quotation receipt). Viewing is open to anyone signed in (so an agent can
 * see, e.g., the business phone number); editing is gated in the server
 * actions to owner/admin.
 */
export default async function ProfilePage() {
  const org = await requireOrg();
  const profile = await getBusinessProfile(org.organizationId);
  const canEdit = org.role !== "staff";

  const logoDataUrl = profile?.logoData && profile.logoContentType
    ? `data:${profile.logoContentType};base64,${profile.logoData}`
    : null;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Business Profile</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Your company&rsquo;s official information -- reused on quotation receipts and every document the system generates,
        so you never have to re-enter it.
      </p>

      <div className="mt-6">
        <LogoUploadForm logoDataUrl={logoDataUrl} />
      </div>

      {canEdit ? (
        <BusinessProfileForm organizationName={org.organizationName} profile={profile} />
      ) : (
        <p className="mt-6 rounded-md bg-slate-100 px-4 py-3 text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          Only an Administrator or Master Admin can edit the Business Profile.
        </p>
      )}
    </div>
  );
}
