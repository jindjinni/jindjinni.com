import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { isAdmin } from "@/lib/permissions";
import { getEmailTemplates, getReceivingSettings } from "@/lib/receiving-queries";
import { TEMPLATE_DEFS } from "@/lib/email-templates";
import { EmailSettingsForm } from "./email-settings-form";
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
  const fromEmail = process.env.RESEND_FROM_EMAIL || "";
  const hasKey = !!process.env.RESEND_API_KEY;
  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Email Settings</h1>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Who customer emails come from, and the copies and links that go with them.</p>
      {(!hasKey || !fromEmail) && (
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100" data-testid="cs-sender-warning">
          {!hasKey
            ? "The email service isn't connected yet (no Resend key on the server), so emails can't be sent."
            : "No sending address is set on the server yet. Until your company's domain is verified in Resend, emails go out from a test address that real customers can't receive."}
        </p>
      )}
      <div className="max-w-2xl">
        <EmailSettingsForm initial={initial} companyName={org.organizationName} />
      </div>
      <EmailTemplatesEditor rows={rows} company={initial.fromName.trim() || org.organizationName} websiteUrl={initial.quoteLinkUrl} guideUrl={initial.packagingGuideUrl} />
    </div>
  );
}
