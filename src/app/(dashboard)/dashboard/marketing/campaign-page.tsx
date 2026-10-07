import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { audienceFor, campaignMessages, campaignProgress, getCampaign, getSettings, sentLast24h } from "@/lib/marketing-service";
import { DEFAULT_DAILY_LIMIT, type Audience, type Channel } from "@/lib/marketing-rules";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { CampaignEditor, type CampaignView } from "./campaign-editor";
import { CampaignResults } from "./campaign-results";

/** One campaign: the editor while it is a draft, the results once it has started sending. "new" opens a blank draft. */
export async function CampaignPage({ channel, id }: { channel: Channel; id: string }) {
  const org = await requireOrg();
  const settings = await getSettings(org.organizationId);
  const [me] = await db.select({ email: users.email }).from(users).where(eq(users.id, org.userId)).limit(1);
  const base = channel === "EMAIL" ? "/dashboard/marketing/email" : "/dashboard/marketing/text";

  let c = null;
  if (id !== "new") {
    c = await getCampaign(org.organizationId, id);
    if (!c || c.channel !== channel) notFound();
  }
  const view: CampaignView = {
    id: c?.id ?? null,
    channel,
    name: c?.name ?? "",
    subject: c?.subject ?? "",
    body: c?.body ?? "",
    audience: (c?.audience ?? "ALL") as Audience,
    status: c?.status ?? "DRAFT",
  };

  if (c && c.status !== "DRAFT") {
    const [progress, messages] = await Promise.all([campaignProgress(org.organizationId, c.id), campaignMessages(org.organizationId, c.id)]);
    return (
      <CampaignResults
        campaign={{ ...view, startedAt: c.startedAt, finishedAt: c.finishedAt }}
        progress={progress}
        messages={messages.map((m) => ({ id: m.id, to: m.toAddress, name: [m.firstName, m.lastName].filter(Boolean).join(" "), status: m.status, error: m.error }))}
        base={base}
      />
    );
  }

  const initial = await audienceFor(org.organizationId, channel, view.audience);
  const used = await sentLast24h(org.organizationId);
  return (
    <CampaignEditor
      campaign={view}
      base={base}
      textReady={false}
      addressOk={!!settings?.businessAddress}
      dailyLimit={settings?.dailyEmailLimit ?? DEFAULT_DAILY_LIMIT}
      sentToday={used}
      company={org.organizationName}
      senderName={settings?.senderName ?? ""}
      businessAddress={settings?.businessAddress ?? ""}
      footerText={settings?.footerText ?? ""}
      optOutLine={settings?.textOptOutLine ?? "Reply STOP to opt out."}
      myEmail={me?.email ?? ""}
      initialReach={initial.recipients.length}
    />
  );
}
