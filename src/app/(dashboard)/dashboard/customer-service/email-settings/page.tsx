import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { isAdmin } from "@/lib/permissions";
import { getEmailTemplates, getReceivingSettings } from "@/lib/receiving-queries";
import { TEMPLATE_DEFS } from "@/lib/email-templates";
import { EmailSettingsForm } from "./email-settings-form";
import { getConnection } from "@/lib/email-connector";
import { EmailTemplatesEditor, type TemplateRow } from "./email-templates-editor";

export const dynamic = "force-dynamic";

// Email Settings (Setup): only an owner or admin changes who customer emails come from and whether they are on.
export default async function EmailSettingsPage() {
  const org = await requireOrg();
  if (!isAdmin(org.role)) notFound();
  const [initial, stored] = await Promise.all([getReceivingSettings(org.organizationId), getEmailTemplates(org.organizationId)]);
  const rows: TemplateRow[] = TEMPLATE_DEFS.map((d) => ({
    key: d.key,
    label: d.label,
    usedWhen: d.usedWhen,
    automatic: d.automatic,
    subject: stored[d.key]?.subject ?? d.defaultSubject,
    body: stored[d.key]?.body ?? d.defaultBody,
    edited: !!stored[d.key],
    defaultSubject: d.defaultSubject,
    defaultBody: d.defaultBody,
    attachKinds: d.attachKinds,
  }));
  const conn = await getConnection(org.organizationId);
  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Email Settings</h1>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Who customer emails come from, and the copies and links that go with them.</p>
      <p className="mt-4 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300" data-testid="cs-mailbox-link">
        {conn
          ? <>Customer emails are sent from <strong>{conn.accountEmail}</strong>{conn.status !== "ACTIVE" ? ", but that sign-in needs to be renewed" : ""}. </>
          : <>Your company mailbox isn&apos;t connected yet, so customer emails go out from the platform&apos;s shared address. </>}
        <Link href="/dashboard/settings/connectors" className="font-medium text-emerald-700 underline dark:text-emerald-400">Manage the mailbox in Settings → Connectors</Link>.
      </p>
      <div className="max-w-2xl">
        <EmailSettingsForm initial={initial} companyName={org.organizationName} />
      </div>
      <EmailTemplatesEditor rows={rows} company={initial.fromName.trim() || org.organizationName} websiteUrl={initial.quoteLinkUrl} guideUrl={initial.packagingGuideUrl} />
    </div>
  );
}
