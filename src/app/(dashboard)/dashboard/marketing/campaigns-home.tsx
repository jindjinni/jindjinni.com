import Link from "next/link";
import { requireOrg } from "@/lib/tenant";
import { audienceFor, getSettings, listCampaigns } from "@/lib/marketing-service";
import { AUDIENCE_LABELS, smsInfo, type Channel } from "@/lib/marketing-rules";
import { card, ghostBtn, primaryBtn } from "@/components/sales-ui";

const STATUS_TONE: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  SENDING: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300",
  SENT: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  CANCELLED: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};
const STATUS_WORD: Record<string, string> = { DRAFT: "Draft", SENDING: "Sending", SENT: "Sent", CANCELLED: "Stopped" };
const GROUPS = [
  { key: "SENDING", title: "Sending now" },
  { key: "DRAFT", title: "Drafts" },
  { key: "SENT", title: "Sent" },
  { key: "CANCELLED", title: "Stopped" },
] as const;

/** Campaign list for one channel: closed groups by status (drafts, sending, sent), each line showing audience and results. */
export async function CampaignsHome({ channel }: { channel: Channel }) {
  const org = await requireOrg();
  const base = channel === "EMAIL" ? "/dashboard/marketing/email" : "/dashboard/marketing/text";
  const [rows, settings, reach] = await Promise.all([listCampaigns(org.organizationId, channel), getSettings(org.organizationId), audienceFor(org.organizationId, channel, "ALL")]);
  const word = channel === "EMAIL" ? "email" : "text";
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">{channel === "EMAIL" ? "Email campaigns" : "Text campaigns"}</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {channel === "EMAIL" ? "Write a message once and send it to a group. Every email carries your address and an unsubscribe link." : "Write text blasts and keep them as drafts. Sending turns on when a text provider is connected."}
          </p>
        </div>
        <Link href={`${base}/new`} className={primaryBtn} data-testid="mk-new">New {word} campaign</Link>
      </div>
      {channel === "TEXT" && (
        <p className="rounded-xl border border-yellow-300 bg-yellow-50 p-4 text-sm text-yellow-900 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-200" data-testid="mk-text-notice">
          Text messaging isn&apos;t connected yet, so campaigns here can be written and saved but not sent. When you are ready, connect a provider in <Link className="underline" href="/dashboard/marketing/text-settings">Text Settings</Link>.
        </p>
      )}
      {channel === "EMAIL" && !settings?.businessAddress && (
        <p className="rounded-xl border border-yellow-300 bg-yellow-50 p-4 text-sm text-yellow-900 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-200" data-testid="mk-address-notice">
          Add your business mailing address in <Link className="underline" href="/dashboard/marketing/email-settings">Email Settings</Link> before sending. Email law requires it on every marketing email.
        </p>
      )}
      <p className="text-sm text-slate-600 dark:text-slate-400" data-testid="mk-reach">{reach.recipients.length} {reach.recipients.length === 1 ? "person" : "people"} can get a {word} campaign right now.</p>
      {rows.length === 0 && <p className={`${card} text-sm text-slate-600 dark:text-slate-400`} data-testid="mk-none">No {word} campaigns yet.</p>}
      <div className="space-y-3" data-testid="mk-campaign-groups">
        {GROUPS.map((g) => {
          const list = rows.filter((r) => r.campaign.status === g.key);
          if (!list.length) return null;
          return (
            <details key={g.key} className={`${card} !p-0`} data-testid="mk-campaign-group" data-status={g.key}>
              <summary className="flex cursor-pointer flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                <span className="font-semibold text-slate-900 dark:text-slate-50">{g.title}</span>
                <span className="text-sm text-slate-600 dark:text-slate-400">{list.length} {list.length === 1 ? "campaign" : "campaigns"}</span>
                {g.key === "SENT" && <span className="text-sm text-slate-600 dark:text-slate-400">{list.reduce((n, r) => n + r.sent, 0)} {word}s delivered</span>}
              </summary>
              <ul className="divide-y divide-slate-100 border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800">
                {list.map(({ campaign: c, sent, failed, skipped, pending }) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3" data-testid="mk-campaign" data-id={c.id}>
                    <Link href={`${base}/${c.id}`} className="min-w-0 flex-1 font-medium text-slate-900 underline dark:text-slate-50" data-testid="mk-campaign-link">{c.name}</Link>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_TONE[c.status]}`}>{STATUS_WORD[c.status]}</span>
                    <span className="text-xs text-slate-500">{AUDIENCE_LABELS[c.audience].split(" (")[0]}</span>
                    {channel === "TEXT" && c.body && <span className="text-xs text-slate-500">{smsInfo(c.body).segments} {smsInfo(c.body).segments === 1 ? "segment" : "segments"}</span>}
                    {c.status !== "DRAFT" && (
                      <span className="text-xs text-slate-600 dark:text-slate-400">{sent} sent{failed ? `, ${failed} failed` : ""}{skipped ? `, ${skipped} skipped` : ""}{pending ? `, ${pending} waiting` : ""}</span>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          );
        })}
      </div>
      <Link href="/dashboard/marketing" className={ghostBtn}>Back to Contacts</Link>
    </div>
  );
}
