import { requireOrg } from "@/lib/tenant";
import { db } from "@/db/client";
import { organizations } from "@/db/schema";
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
  if (org.role === "staff") {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">
          Business settings
        </h1>
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

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">
        Business settings
      </h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        This is the return address and contact info printed as the sender on
        every shipping label the app generates for a seller -- fill it in
        once here instead of every time.
      </p>

      <BusinessSettingsForm action={updateBusinessSettings} org={row} />
    </div>
  );
}
