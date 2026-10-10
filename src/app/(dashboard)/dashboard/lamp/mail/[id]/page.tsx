import Link from "next/link";
import { notFound } from "next/navigation";
import { MailTime } from "@/components/mail/mail-time";
import { featureOn } from "@/lib/features";
import { DEPT_LABEL, mailPath } from "@/lib/mail-rules";
import { overviewMessage } from "@/lib/mail-overview";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { requireOrg } from "@/lib/tenant";

export const dynamic = "force-dynamic";

const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** One message from the overall inbox, as plain text. Opening it changes nothing (it is not marked read anywhere). */
export default async function LampMailMessagePage({ params }: { params: Promise<{ id: string }> }) {
  const org = await requireOrg({ real: true });
  if (!(await isPlatformAdmin(org)) || !(await featureOn("mailboxes", org.organizationId))) notFound();
  const { id } = await params;
  const m = await overviewMessage(org.organizationId, id);
  if (!m) notFound();
  const out = m.direction === "OUT";
  return (
    <article className="flex max-w-4xl flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900" data-testid="ov-message">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50" data-testid="ov-subject">{m.subject}</h2>
        <Link href="/dashboard/lamp/mail" className="text-sm text-slate-600 underline dark:text-slate-300">&larr; Overall inbox</Link>
      </div>
      <dl className="space-y-1 text-sm">
        <div className="flex gap-3"><dt className="w-20 shrink-0 text-slate-500">Mailbox</dt><dd>{DEPT_LABEL[m.dept]} · {m.boxName}{m.boxEmail ? ` (${m.boxEmail})` : ""}</dd></div>
        <div className="flex gap-3"><dt className="w-20 shrink-0 text-slate-500">From</dt><dd className="break-words">{[m.fromName, m.fromAddress && `<${m.fromAddress}>`].filter(Boolean).join(" ")}</dd></div>
        <div className="flex gap-3"><dt className="w-20 shrink-0 text-slate-500">To</dt><dd className="break-words">{m.to}</dd></div>
        {m.cc && <div className="flex gap-3"><dt className="w-20 shrink-0 text-slate-500">Cc</dt><dd className="break-words">{m.cc}</dd></div>}
        <div className="flex gap-3"><dt className="w-20 shrink-0 text-slate-500">{out ? "Sent" : "Received"}</dt><dd><MailTime iso={m.at} mode="full" /></dd></div>
        {m.sentByName && <div className="flex gap-3"><dt className="w-20 shrink-0 text-slate-500">By</dt><dd>{m.sentByName}{m.source === "SYSTEM" ? " (sent by the app)" : ""}</dd></div>}
      </dl>
      {m.files.length > 0 && (
        <p className="text-sm text-slate-600 dark:text-slate-300" data-testid="ov-files">
          Files: {m.files.map((f) => `${f.filename} (${kb(f.bytes)})`).join(", ")}. Open them from the {DEPT_LABEL[m.dept]} <Link href={mailPath(m.dept)} className="underline">Mail tab</Link>.
        </p>
      )}
      <pre className="whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-4 font-sans text-sm text-slate-900 dark:bg-slate-950 dark:text-slate-100" data-testid="ov-body">{m.body || "(no text)"}</pre>
    </article>
  );
}
