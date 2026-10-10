import Link from "next/link";
import { MailTime } from "@/components/mail/mail-time";
import { mailPath, type Folder, type MailDept } from "@/lib/mail-rules";
import type { ListRow } from "@/lib/mailbox-service";

const EMPTY: Record<Folder, string> = {
  inbox: "Nothing in the Inbox yet.",
  sent: "Nothing has been sent from this mailbox yet.",
  drafts: "No drafts. A draft you save while writing an email shows up here.",
  scheduled: "No scheduled emails. Pick “Send later” when writing an email to line one up.",
};

/** The messages in a folder, newest first (scheduled ones by the time they go out). Each row opens the message. */
export function FolderList({ dept, boxId, folder, rows }: { dept: MailDept; boxId: string; folder: Folder; rows: ListRow[] }) {
  if (!rows.length) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400" data-testid="folder-empty">
        {EMPTY[folder]}
      </p>
    );
  }
  const base = mailPath(dept);
  return (
    <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900" data-testid="folder-list">
      {rows.map((r) => {
        const href = r.kind === "message" ? `${base}/m/${r.id}` : `${base}/o/${r.id}`;
        return (
          <li key={`${r.kind}-${r.id}`}>
            <Link href={href} className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/60" data-testid="mail-row" data-box={boxId} data-unread={r.unread ? "1" : "0"}>
              <div className="min-w-0 flex-1">
                <p className={`truncate text-sm ${r.unread ? "font-bold text-slate-900 dark:text-slate-50" : "text-slate-800 dark:text-slate-200"}`}>
                  {r.who}
                  {r.count > 1 && <span className="ml-2 rounded-full bg-slate-200 px-2 text-xs font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-100" data-testid="thread-count" title="Emails in this conversation">{r.count}</span>}
                </p>
                <p className={`truncate text-sm ${r.unread ? "font-semibold text-slate-900 dark:text-slate-50" : "text-slate-900 dark:text-slate-100"}`}>{r.subject || "(no subject)"}</p>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">{r.snippet}</p>
                {r.status === "FAILED" && <p className="mt-1 text-xs font-medium text-red-700 dark:text-red-400">Not sent: {r.error}</p>}
                {r.retrying && <p className="mt-1 text-xs font-medium text-amber-800 dark:text-amber-300">The last try failed; it will try again shortly.</p>}
              </div>
              <div className="shrink-0 text-right text-xs text-slate-500 dark:text-slate-400">
                <p>
                  {folder === "scheduled" && r.status !== "FAILED" ? "Goes out " : ""}
                  <MailTime iso={r.at} mode={folder === "scheduled" ? "full" : "short"} />
                </p>
                {r.hasFiles && <p aria-label="Has attachments">📎</p>}
                {r.status === "FAILED" && <p className="font-semibold text-red-700 dark:text-red-400">Failed</p>}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
