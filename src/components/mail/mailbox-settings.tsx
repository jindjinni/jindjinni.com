import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { canAddMailbox, canViewMailDept, mailboxesOn } from "@/lib/mail-access";
import { OAUTH } from "@/lib/email-connector";
import { DEPT_LABEL, mailPath, type MailDept } from "@/lib/mail-rules";
import { listMailboxes } from "@/lib/mailbox-service";
import { card, ghostBtn } from "@/components/sales-ui";
import { CreateMailboxForm } from "@/components/mail/create-mailbox-form";
import { MailboxCard, type ProviderLink } from "@/components/mail/mailbox-card";

export type SettingsSearch = { box?: string; created?: string; connected?: string; no_read?: string; connect_error?: string };

const ERRORS: Record<string, string> = {
  denied: "The sign-in was cancelled, so nothing was connected.",
  state: "That sign-in expired or came from a different session. Please try again.",
  missing_permission: "The permission to send email wasn't approved. Try again and leave the “send email” box ticked.",
  no_refresh: "The provider didn't give us lasting permission. Try again, and choose the account once more when asked.",
  no_email: "We couldn't read the email address from that account. Try again.",
  exchange: "The provider didn't accept the sign-in. Please try again in a minute.",
  not_configured: "Connecting this kind of mailbox isn't switched on for this platform yet.",
  duplicate: "That email address is already connected to another mailbox in your company. Disconnect it there first, or use a different address.",
};

/** Mailbox settings for a department: every mailbox you can manage, how to connect each, and adding new ones. */
export async function MailboxSettings({ dept, sp }: { dept: MailDept; sp: SettingsSearch }) {
  const org = await requireOrg();
  if (!(await mailboxesOn(org.organizationId)) || !canViewMailDept(dept, org)) notFound();
  const boxes = await listMailboxes(org, dept, { forSettings: true });
  const canShared = canAddMailbox("SHARED", dept, org);
  const hasPersonal = boxes.some((b) => b.kind === "PERSONAL" && b.ownerUserId === org.userId && !b.hidden);
  const canPersonal = canAddMailbox("PERSONAL", dept, org) && !hasPersonal;
  const providers: ProviderLink[] = [
    { key: "GOOGLE", label: "Gmail or Google Workspace", sub: "Includes company addresses hosted by Google", configured: OAUTH.GOOGLE.configured(), href: "/api/email-connect/google/start" },
    { key: "MICROSOFT", label: "Outlook or Microsoft 365", sub: "Includes company addresses hosted by Microsoft", configured: OAUTH.MICROSOFT.configured(), href: "/api/email-connect/microsoft/start" },
  ];
  return (
    <div className="max-w-3xl space-y-5" data-testid="mailbox-settings">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">Mailbox settings</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {DEPT_LABEL[dept]} department. Each mailbox is plugged into {org.organizationName}&apos;s own email account and used for {org.organizationName} only.
          </p>
        </div>
        <Link href={mailPath(dept)} className={ghostBtn}>
          Back to Mail
        </Link>
      </header>
      {sp.created === "1" && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100" role="status" data-testid="created-note">
          Mailbox added. Now connect an email address to it below.
        </p>
      )}
      {boxes.length === 0 && <p className={`${card} text-sm text-slate-700 dark:text-slate-300`}>No mailboxes yet. Add one below.</p>}
      {boxes.map((b) => (
        <MailboxCard
          key={b.id}
          dept={dept}
          deptLabel={DEPT_LABEL[dept]}
          orgName={org.organizationName}
          providers={providers}
          open={sp.box === b.id}
          flash={sp.box === b.id ? { connected: sp.connected === "1", noRead: sp.no_read === "1", error: sp.connect_error ? ERRORS[sp.connect_error] ?? "That didn't work. Please try again." : undefined } : undefined}
          box={{
            id: b.id, name: b.name, kind: b.kind, ownerName: b.ownerName, status: b.status, provider: b.provider, accountEmail: b.accountEmail, canRead: b.canRead,
            lastError: b.lastError, hidden: b.hidden, rights: b.rights,
          }}
        />
      ))}
      {canShared && (
        <section className={`${card} space-y-2`}>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Add another shared mailbox</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">For example a second address the department uses. Everyone who works in {DEPT_LABEL[dept]} can use it.</p>
          <CreateMailboxForm dept={dept} kind="SHARED" button="Add shared mailbox" />
        </section>
      )}
      {canPersonal && (
        <section className={`${card} space-y-2`}>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Add a mailbox of your own</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">Connect your own work address. Only you can read it; an admin can switch it off but never reads it.</p>
          <CreateMailboxForm dept={dept} kind="PERSONAL" button="Add my mailbox" />
        </section>
      )}
    </div>
  );
}
