import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { isAdmin } from "@/lib/permissions";
import { getReceivingFormConfig } from "@/lib/receiving-form-config-store";
import { FormSettings } from "./form-settings";

export const dynamic = "force-dynamic";

export default async function ReceivingFormSettingsPage() {
  const org = await requireOrg();
  if (!isAdmin(org.role)) redirect("/dashboard/receiving");
  const cfg = await getReceivingFormConfig(org.organizationId);
  return (
    <div className="px-6 py-8">
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Receiving form settings</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
        Make the Receiving Intake Form fit how your company works. Hiding a photo type or a question only takes it off the form: photos and answers already saved stay in each shipment,
        and nothing is deleted. The product lines, quantities, lot and expiration numbers, recall checks and the Accounts steps always stay.
      </p>
      <FormSettings initial={cfg} />
    </div>
  );
}
