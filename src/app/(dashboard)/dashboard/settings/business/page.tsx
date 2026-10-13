import { isAdmin } from "@/lib/permissions";
import { requireOrg } from "@/lib/tenant";
import { ShipFromSettings } from "@/components/ship-from-settings";

/**
 * Settings → Shipping & labels: the address every Shipping-department label is sent FROM (we are the sender).
 * USPS rejects a label with no sender phone or email, so the form asks for all of it.
 */
export default async function BusinessSettingsPage() {
  const org = await requireOrg();
  if (!isAdmin(org.role)) {
    return (
      <div>
        <h2 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Business settings</h2>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">This page is limited to owners and admins.</p>
      </div>
    );
  }
  return <ShipFromSettings organizationId={org.organizationId} />;
}
