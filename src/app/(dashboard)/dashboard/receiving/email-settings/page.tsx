import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { isAdmin } from "@/lib/permissions";
import { getReceivingSettings } from "@/lib/receiving-queries";
import { EmailSettingsForm } from "./email-settings-form";

export const dynamic = "force-dynamic";

export default async function EmailSettingsPage() {
  const org = await requireOrg();
  if (!isAdmin(org.role)) notFound();
  const s = await getReceivingSettings(org.organizationId);
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-8">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Email Settings</h1>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
        Controls the emails Receiving sends to customers once a package is processed and paid. They stay off until you turn them on here.
      </p>
      <EmailSettingsForm initial={s} companyName={org.organizationName} />
    </div>
  );
}
