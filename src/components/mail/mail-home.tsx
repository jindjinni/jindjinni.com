import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { canAddMailbox, canViewMailDept, mailboxesOn } from "@/lib/mail-access";
import { DEPT_LABEL, DEPT_MAIL_BLURB, isFolder, mailPath, type Folder, type MailDept } from "@/lib/mail-rules";
import { folderCounts, listFolder, listMailboxes, PAGE_SIZE } from "@/lib/mailbox-service";
import { card, ghostBtn } from "@/components/sales-ui";
import { MailChrome } from "@/components/mail/mail-chrome";
import { FolderList } from "@/components/mail/folder-list";
import { CreateMailboxForm } from "@/components/mail/create-mailbox-form";
import { MailTick } from "@/components/mail/mail-tick";
import { InboxBar } from "@/components/mail/inbox-bar";

export type MailSearch = { box?: string; folder?: string; q?: string; page?: string; done?: string };

const DONE: Record<string, string> = { sent: "Email sent.", saved: "Draft saved.", scheduled: "Scheduled. It will go out at the time you picked." };

/** The Mail tab's home for one department: the mailbox picker, the folders, and the list of what is in the open folder. */
export async function MailHome({ dept, sp }: { dept: MailDept; sp: MailSearch }) {
  const org = await requireOrg();
  if (!(await mailboxesOn(org.organizationId)) || !canViewMailDept(dept, org)) notFound();
  const boxes = await listMailboxes(org, dept);
  const canShared = canAddMailbox("SHARED", dept, org);
  const canPersonal = canAddMailbox("PERSONAL", dept, org) && !boxes.some((b) => b.kind === "PERSONAL" && b.ownerUserId === org.userId);

  if (!boxes.length) {
    return (
      <MailChrome dept={dept} boxes={[]} current={null}>
        <section className={`${card} max-w-2xl space-y-4`} data-testid="mail-empty">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">The {DEPT_LABEL[dept]} mailbox isn&apos;t set up yet</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{DEPT_MAIL_BLURB[dept]}</p>
          </div>
          {canShared ? (
            <div className="space-y-2">
              <p className="text-sm text-slate-700 dark:text-slate-300">Add the department&apos;s shared mailbox, then connect your company&apos;s own email address to it. You&apos;ll be walked through it.</p>
              <CreateMailboxForm dept={dept} kind="SHARED" defaultName={DEPT_LABEL[dept]} button={`Set up the ${DEPT_LABEL[dept]} mailbox`} />
            </div>
          ) : (
            <p className="text-sm text-slate-700 dark:text-slate-300">An owner or admin sets up the department&apos;s shared mailbox. Until then you can add a mailbox of your own.</p>
          )}
          {canPersonal && (
            <div className="space-y-2 border-t border-slate-200 pt-4 dark:border-slate-800">
              <p className="text-sm text-slate-700 dark:text-slate-300">Or add a personal mailbox, only you can read it.</p>
              <CreateMailboxForm dept={dept} kind="PERSONAL" button="Add my mailbox" />
            </div>
          )}
        </section>
      </MailChrome>
    );
  }

  const current = boxes.find((b) => b.id === sp.box) ?? boxes[0];
  const folder: Folder = isFolder(sp.folder) ? sp.folder : "inbox";
  const page = Math.max(1, Number(sp.page) || 1);
  const [counts, list] = await Promise.all([folderCounts(org.organizationId, current.id), listFolder(org.organizationId, current.id, folder, { q: sp.q, page })]);
  const base = mailPath(dept);
  const readable = current.status === "ACTIVE" && current.canRead && current.provider !== "SMTP" && current.rights.read && !org.viewAs;
  const pages = Math.max(1, Math.ceil(list.total / PAGE_SIZE));
  const qs = (p: number) => `${base}?box=${current.id}&folder=${folder}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ""}${p > 1 ? `&page=${p}` : ""}`;

  return (
    <MailChrome dept={dept} boxes={boxes} current={current} counts={counts} folder={folder} canAddPersonal={canPersonal}>
      <div className="space-y-3">
        {sp.done && DONE[sp.done] && (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100" role="status" data-testid="mail-flash">
            {DONE[sp.done]}
          </p>
        )}
        {current.status !== "ACTIVE" && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100" data-testid="mailbox-not-connected">
            {current.status === "NEEDS_RECONNECT" ? "This mailbox lost its connection and needs to be reconnected before it can send." : "This mailbox isn't connected to an email address yet, so it can't send."}{" "}
            {current.rights.connect ? (
              <Link href={`${base}/settings?box=${current.id}`} className="font-semibold underline">
                Connect it
              </Link>
            ) : (
              <span>{current.kind === "PERSONAL" ? "Only its owner can connect it." : "An owner or admin can connect it."}</span>
            )}
          </div>
        )}
        {folder === "inbox" && current.status === "ACTIVE" && current.provider === "SMTP" && (
          <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-800 dark:bg-slate-800 dark:text-slate-100" data-testid="inbox-send-only">
            This mailbox can send email, but its Inbox can&apos;t be read here yet (it is connected with a password, not Google or Microsoft). Read its incoming mail in your email program.
          </p>
        )}
        {folder === "inbox" && current.status === "ACTIVE" && current.provider !== "SMTP" && !current.canRead && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:bg-amber-950/40 dark:text-amber-100" data-testid="inbox-no-read">
            This mailbox was connected for sending only, so incoming mail isn&apos;t shown.{" "}
            {current.rights.connect ? (
              <Link href={`${base}/settings?box=${current.id}`} className="font-semibold underline">
                Reconnect it and allow reading
              </Link>
            ) : (
              <span>{current.kind === "PERSONAL" ? "Only its owner can reconnect it." : "An owner or admin can reconnect it."}</span>
            )}
          </p>
        )}
        {folder === "inbox" && readable && <InboxBar dept={dept} boxId={current.id} lastSyncAt={current.lastSyncAt} lastSyncError={current.lastSyncError} canRefresh unread={counts.inboxUnread} />}
        <form action={base} className="flex flex-wrap gap-2" role="search">
          <input type="hidden" name="box" value={current.id} />
          <input type="hidden" name="folder" value={folder} />
          <label htmlFor="mail-search" className="sr-only">
            Search this folder
          </label>
          <input id="mail-search" name="q" defaultValue={sp.q ?? ""} placeholder="Search this folder" className="w-full max-w-sm rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm dark:border-slate-700 dark:bg-slate-900" data-testid="mail-search" />
          <button className={ghostBtn}>Search</button>
          {sp.q && (
            <Link href={`${base}?box=${current.id}&folder=${folder}`} className={ghostBtn}>
              Clear
            </Link>
          )}
        </form>
        <FolderList dept={dept} boxId={current.id} folder={folder} rows={list.rows} />
        {pages > 1 && (
          <div className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-400">
            <span>
              Page {list.page} of {pages} · {list.total} emails
            </span>
            <span className="flex gap-2">
              {list.page > 1 && (
                <Link href={qs(list.page - 1)} className={ghostBtn}>
                  Newer
                </Link>
              )}
              {list.page < pages && (
                <Link href={qs(list.page + 1)} className={ghostBtn}>
                  Older
                </Link>
              )}
            </span>
          </div>
        )}
      </div>
      {current.rights.read && !org.viewAs && <MailTick dept={dept} />}
    </MailChrome>
  );
}
