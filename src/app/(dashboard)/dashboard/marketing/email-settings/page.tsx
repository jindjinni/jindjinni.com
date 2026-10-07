import { requireOrg } from "@/lib/tenant";
import { ensureSettings } from "@/lib/marketing-service";
import { SettingsForm } from "../settings-form";

export const dynamic = "force-dynamic";

export default async function EmailSettingsPage() {
  const org = await requireOrg();
  const s = await ensureSettings(org.organizationId);
  return (
    <SettingsForm
      kind="email"
      orgName={org.organizationName}
      values={{ senderName: s.senderName ?? "", replyTo: s.replyTo ?? "", businessAddress: s.businessAddress ?? "", footerText: s.footerText ?? "", dailyEmailLimit: String(s.dailyEmailLimit), textFromNumber: s.textFromNumber ?? "", textOptOutLine: s.textOptOutLine }}
    />
  );
}
