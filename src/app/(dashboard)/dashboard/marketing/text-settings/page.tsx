import { requireOrg } from "@/lib/tenant";
import { ensureSettings } from "@/lib/marketing-service";
import { SettingsForm } from "../settings-form";

export const dynamic = "force-dynamic";

export default async function TextSettingsPage() {
  const org = await requireOrg();
  const s = await ensureSettings(org.organizationId);
  return (
    <SettingsForm
      kind="text"
      orgName={org.organizationName}
      values={{ senderName: s.senderName ?? "", replyTo: s.replyTo ?? "", businessAddress: s.businessAddress ?? "", footerText: s.footerText ?? "", dailyEmailLimit: String(s.dailyEmailLimit), textFromNumber: s.textFromNumber ?? "", textOptOutLine: s.textOptOutLine }}
    />
  );
}
