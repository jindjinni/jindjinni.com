import { notFound, redirect } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { canViewMailDept, mailboxesOn } from "@/lib/mail-access";
import { mailPath, type MailDept } from "@/lib/mail-rules";
import { folderCounts, listMailboxes, openMessage, openOutbox } from "@/lib/mailbox-service";
import { MailChrome } from "@/components/mail/mail-chrome";
import { MessageView, OutboxView } from "@/components/mail/message-view";
import { MarkRead } from "@/components/mail/mark-read";

async function ctx(dept: MailDept) {
  const org = await requireOrg();
  if (!(await mailboxesOn(org.organizationId)) || !canViewMailDept(dept, org)) notFound();
  return org;
}

/** One message from the Inbox or Sent folder. */
export async function MessagePage({ dept, id }: { dept: MailDept; id: string }) {
  const org = await ctx(dept);
  const r = await openMessage(org, dept, id);
  if (!r) notFound();
  const [boxes, counts] = await Promise.all([listMailboxes(org, dept), folderCounts(org.organizationId, r.box.id)]);
  const unread = r.msg.direction === "IN" && !r.msg.readAt && !org.viewAs;
  return (
    <MailChrome dept={dept} boxes={boxes} current={r.box} counts={counts} folder={r.msg.direction === "IN" ? "inbox" : "sent"}>
      <MessageView dept={dept} box={r.box} msg={r.msg} files={r.files} thread={r.thread} />
      {unread && <MarkRead dept={dept} boxId={r.box.id} id={r.msg.id} />}
    </MailChrome>
  );
}

/** One draft, scheduled or failed email. */
export async function OutboxPage({ dept, id }: { dept: MailDept; id: string }) {
  const org = await ctx(dept);
  const r = await openOutbox(org, dept, id);
  if (!r) notFound();
  if (r.item.status === "SENT" && r.item.messageId) redirect(`${mailPath(dept)}/m/${r.item.messageId}`);
  if (r.item.status === "CANCELLED") notFound();
  const [boxes, counts] = await Promise.all([listMailboxes(org, dept), folderCounts(org.organizationId, r.box.id)]);
  return (
    <MailChrome dept={dept} boxes={boxes} current={r.box} counts={counts} folder={r.item.status === "DRAFT" ? "drafts" : "scheduled"}>
      <OutboxView dept={dept} box={r.box} item={r.item} files={r.files} />
    </MailChrome>
  );
}
