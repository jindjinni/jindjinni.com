import Link from "next/link";
import { card, ghostBtn, primaryBtn } from "@/components/sales-ui";
import { DEPT_LABEL, FOLDER_LABEL, FOLDERS, mailPath, type Folder, type MailDept } from "@/lib/mail-rules";
import type { FolderCounts, MailboxView } from "@/lib/mailbox-service";

const DOT: Record<MailboxView["status"], string> = { ACTIVE: "bg-emerald-500", NEEDS_RECONNECT: "bg-red-500", NOT_CONNECTED: "bg-amber-500" };
const DOT_LABEL: Record<MailboxView["status"], string> = { ACTIVE: "Connected", NEEDS_RECONNECT: "Needs reconnecting", NOT_CONNECTED: "Not connected yet" };

/** The frame every Mail page shares: title, "Write an email", the mailbox picker, and (when a mailbox is open) its folders. */
export function MailChrome({
  dept, boxes, current, counts, folder, children, canAddPersonal,
}: {
  dept: MailDept;
  boxes: MailboxView[];
  current: MailboxView | null;
  counts?: FolderCounts | null;
  folder?: Folder | null;
  children: React.ReactNode;
  canAddPersonal?: boolean;
}) {
  const base = mailPath(dept);
  const settings = current ? `${base}/settings?box=${current.id}` : `${base}/settings`;
  return (
    <div className="max-w-6xl space-y-4" data-testid="mail">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Mail</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{DEPT_LABEL[dept]} department · incoming and outgoing email, drafts and scheduled emails.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {current?.rights.send && (
            <Link href={`${base}/compose?box=${current.id}`} className={primaryBtn} data-testid="write-email">
              Write an email
            </Link>
          )}
          <Link href={settings} className={ghostBtn} data-testid="mailbox-settings-link">
            Mailbox settings
          </Link>
        </div>
      </header>

      {(boxes.length > 1 || (boxes.length === 1 && canAddPersonal)) && (
        <nav aria-label="Mailboxes" className="flex flex-wrap gap-2" data-testid="mailbox-picker">
          {boxes.map((b) => (
            <Link
              key={b.id}
              href={`${base}?box=${b.id}`}
              className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${current?.id === b.id ? "border-emerald-600 bg-emerald-50 font-semibold text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-100" : "border-slate-300 bg-white text-slate-800 hover:border-emerald-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"}`}
              data-testid={`mailbox-pill-${b.id}`}
            >
              <span className={`h-2 w-2 rounded-full ${DOT[b.status]}`} title={DOT_LABEL[b.status]} aria-label={DOT_LABEL[b.status]} />
              {b.name}
              {b.kind === "PERSONAL" && <span className="rounded bg-slate-100 px-1.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">Personal</span>}
            </Link>
          ))}
        </nav>
      )}

      {current ? (
        <div className="grid gap-4 md:grid-cols-[13rem_1fr]">
          <nav aria-label="Folders" className={`${card} h-fit space-y-1 p-2`} data-testid="mail-folders">
            <p className="truncate px-2 pt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{current.accountEmail ?? current.name}</p>
            {FOLDERS.map((f) => {
              const n = counts ? (f === "inbox" ? counts.inboxUnread : f === "drafts" ? counts.drafts : f === "scheduled" ? counts.scheduled + counts.failed : 0) : 0;
              const bad = f === "scheduled" && !!counts && counts.failed > 0;
              return (
                <Link
                  key={f}
                  href={`${base}?box=${current.id}&folder=${f}`}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${folder === f ? "bg-emerald-100 font-semibold text-emerald-950 dark:bg-emerald-950/50 dark:text-emerald-100" : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"}`}
                  data-testid={`folder-${f}`}
                >
                  <span>{FOLDER_LABEL[f]}</span>
                  {n > 0 && (
                    <span className={`rounded-full px-2 text-xs font-semibold ${bad ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200" : "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100"}`} data-testid={`count-${f}`}>
                      {n}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
          <div className="min-w-0">{children}</div>
        </div>
      ) : (
        children
      )}
    </div>
  );
}
