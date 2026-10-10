import Link from "next/link";
import { card, ghostBtn } from "@/components/sales-ui";
import { MailTime } from "@/components/mail/mail-time";
import { OutboxButtons } from "@/components/mail/item-actions";
import { mailPath, type MailDept } from "@/lib/mail-rules";
import type { FileInfo, MailboxView, MessageRow, OutboxRow } from "@/lib/mailbox-service";

const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function Files({ dept, files }: { dept: MailDept; files: FileInfo[] }) {
  if (!files.length) return null;
  return (
    <ul className="flex flex-wrap gap-2" data-testid="mail-files">
      {files.map((f) => (
        <li key={f.id}>
          <a href={`/api/mail/attachment/${f.id}?dept=${dept}`} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:border-emerald-500 dark:border-slate-700 dark:bg-slate-900" data-testid="mail-file">
            <span aria-hidden>📎</span>
            {f.filename}
            <span className="text-xs text-slate-500">{kb(f.bytes)}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3 text-sm">
      <dt className="w-14 shrink-0 text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="min-w-0 break-words text-slate-900 dark:text-slate-100">{value}</dd>
    </div>
  );
}

/** A message in the Inbox or Sent folder: who, when, the text (shown as plain text only) and any files. */
export function MessageView({ dept, box, msg, files }: { dept: MailDept; box: MailboxView; msg: MessageRow; files: FileInfo[] }) {
  const out = msg.direction === "OUT";
  return (
    <article className={`${card} space-y-4`} data-testid="message-view">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50" data-testid="message-subject">
          {msg.subject || "(no subject)"}
        </h2>
        <Link href={`${mailPath(dept)}?box=${box.id}&folder=${out ? "sent" : "inbox"}`} className={ghostBtn}>
          Back to {out ? "Sent" : "Inbox"}
        </Link>
      </div>
      <dl className="space-y-1">
        <Row label="From" value={[msg.fromName, msg.fromAddress && `<${msg.fromAddress}>`].filter(Boolean).join(" ")} />
        <Row label="To" value={msg.toAddresses} />
        {msg.ccAddresses && <Row label="Cc" value={msg.ccAddresses} />}
        <Row label={out ? "Sent" : "Received"} value={<MailTime iso={msg.at} mode="full" />} />
        {msg.sentByName && <Row label="By" value={`${msg.sentByName}${msg.source === "SYSTEM" ? " (sent by the app)" : ""}`} />}
      </dl>
      <Files dept={dept} files={files} />
      <pre className="whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-4 font-sans text-sm text-slate-900 dark:bg-slate-950 dark:text-slate-100" data-testid="message-body">
        {msg.bodyText || "(no text)"}
      </pre>
    </article>
  );
}

/** A draft, a scheduled email or one that failed: what it says, when it goes out, and what can be done with it. */
export function OutboxView({ dept, box, item, files }: { dept: MailDept; box: MailboxView; item: OutboxRow; files: FileInfo[] }) {
  const folder = item.status === "DRAFT" ? "drafts" : "scheduled";
  return (
    <article className={`${card} space-y-4`} data-testid="outbox-view" data-status={item.status}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">{item.subject || "(no subject)"}</h2>
        <Link href={`${mailPath(dept)}?box=${box.id}&folder=${folder}`} className={ghostBtn}>
          Back to {folder === "drafts" ? "Drafts" : "Scheduled"}
        </Link>
      </div>
      {item.status === "SCHEDULED" && (
        <p className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-950 dark:bg-sky-950/40 dark:text-sky-100" data-testid="schedule-note">
          Goes out <strong><MailTime iso={item.scheduledFor} mode="full" /></strong>
          {item.attempts > 0 ? ` (the last try failed${item.lastError ? `: ${item.lastError}` : ""}; trying again)` : ""}.
        </p>
      )}
      {item.status === "SENDING" && <p className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-950 dark:bg-sky-950/40 dark:text-sky-100">Sending right now…</p>}
      {item.status === "FAILED" && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900 dark:bg-red-950/40 dark:text-red-100" role="alert" data-testid="failed-note">
          This email wasn&apos;t sent. {item.lastError}
        </p>
      )}
      {item.status === "DRAFT" && item.lastError && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">The last try to send it didn&apos;t work: {item.lastError}</p>
      )}
      <dl className="space-y-1">
        <Row label="From" value={box.accountEmail ?? `${box.name} (not connected yet)`} />
        <Row label="To" value={item.toAddresses || "—"} />
        {item.ccAddresses && <Row label="Cc" value={item.ccAddresses} />}
        {item.bccAddresses && <Row label="Bcc" value={item.bccAddresses} />}
      </dl>
      <Files dept={dept} files={files} />
      <pre className="whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-4 font-sans text-sm text-slate-900 dark:bg-slate-950 dark:text-slate-100">{item.bodyText || "(no text yet)"}</pre>
      {box.rights.send && item.status !== "SENDING" && (
        <div className="flex flex-wrap items-start gap-2">
          <Link href={`${mailPath(dept)}/compose?box=${box.id}&draft=${item.id}`} className={ghostBtn} data-testid="edit-outbox">
            {item.status === "SCHEDULED" ? "Edit or change the time" : "Edit"}
          </Link>
          <OutboxButtons dept={dept} boxId={box.id} id={item.id} status={item.status} canSend={box.rights.send} />
        </div>
      )}
    </article>
  );
}
