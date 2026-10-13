import { isAdmin } from "@/lib/permissions";
import { requireOrg } from "@/lib/tenant";
import { db } from "@/db/client";
import { businessProfiles, organizations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { updateBusinessSettings } from "@/app/actions/settings";
import { BusinessSettingsForm } from "./business-settings-form";

/**
 * The "ship from" identity used on every label this org generates. Nothing
 * here is optional once you want to actually press "Generate shipping
 * label" -- USPS in particular rejects a label purchase if the sender is
 * missing phone/email, so the form below asks for all of it up front.
 */
export default async function BusinessSettingsPage() {
  const org = await requireOrg();
  if (!isAdmin(org.role)) {
    return (
      <div>
        <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">
          Business settings
        </h2>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          This page is limited to owners and admins.
        </p>
      </div>
    );
  }

  const [row] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, org.organizationId))
    .limit(1);

  // A company that has not filled this in yet starts from its business profile (shown, never saved until the owner presses Save).
  const [profile] = await db.select().from(businessProfiles).where(eq(businessProfiles.organizationId, org.organizationId)).limit(1);
  const empty = !row?.shipFromStreet1;
  const useShipping = profile && profile.shippingSameAsBusiness === false;
  const contact = [profile?.primaryContactFirstName, profile?.primaryContactLastName].filter(Boolean).join(" ");
  const prefilled = empty && !!profile?.businessAddressStreet1;
  const shown =
    row && prefilled && profile
      ? {
          ...row,
          shipFromName: row.shipFromName ?? (contact || row.name),
          shipFromCompany: row.shipFromCompany ?? (profile.dbaName || row.name),
          shipFromStreet1: useShipping ? profile.shippingAddressStreet1 : profile.businessAddressStreet1,
          shipFromStreet2: useShipping ? profile.shippingAddressStreet2 : profile.businessAddressStreet2,
          shipFromCity: useShipping ? profile.shippingAddressCity : profile.businessAddressCity,
          shipFromState: useShipping ? profile.shippingAddressState : profile.businessAddressState,
          shipFromZip: useShipping ? profile.shippingAddressZip : profile.businessAddressZip,
          shipFromPhone: row.shipFromPhone ?? profile.businessPhone,
          shipFromEmail: row.shipFromEmail ?? profile.businessEmail,
        }
      : row;

  return (
    <div>
      <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">
        Shipping &amp; labels
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
        This is your company&apos;s address and contact. When a customer sells to you (Purchasing), the label goes <strong>from the customer</strong>{" "}
        <strong>to this address</strong>. When you ship an order out (Shipping), the label goes from this address. Fill it in once here.
      </p>
      {prefilled && (
        <p className="mt-3 max-w-2xl rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
          We filled this in from your business profile. Check it, then press Save.
        </p>
      )}

      <BusinessSettingsForm action={updateBusinessSettings} org={shown} />
    </div>
  );
}
