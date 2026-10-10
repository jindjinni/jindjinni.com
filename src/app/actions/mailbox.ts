"use server";

// Department mailboxes: every button on the Mail tab. The server decides who may do what (mail-access.ts); a platform person
// looking through "View as company" can never change anything. Failures come back as plain sentences.

import { redirect } from "next/navigation";
import { requireOrg, type CurrentOrg } from "@/lib/tenant";
import { mailboxesOn } from "@/lib/mail-access";
import { canViewMailDept } from "@/lib/mail-access";
import { isMailDept, mailPath, type MailDept } from "@/lib/mail-rules";
import { syncDue, syncMailbox, MANUAL_GAP_MS, AUTO_GAP_MS } from "@/lib/mail-sync";
import { createMailbox, disconnectMailbox, discardOutbox, dispatchDue, getMailbox, listMailboxes, markAllRead, markMessageRead, markMessageUnread, renameMailbox, saveAndMaybeSend, saveMailboxConnection, sendMailboxTest, sendOutboxNow, setMailboxHidden, unscheduleOutbox, type NewFile, type Plan } from "@/lib/mailbox-service";
import { isEmail } from "@/lib/audit-email";
import { checkSmtpTarget, detectMail, verifySmtp, type Detected } from "@/lib/email-smtp";

export type MailState = { ok?: boolean; error?: string; notice?: string; draftId?: string };

async function gate(deptRaw: unknown): Promise<{ org: CurrentOrg; dept: MailDept } | { error: string }> {
  const org = await requireOrg();
  if (!isMailDept(deptRaw)) return { error: "That department has no mailbox." };
  if (!(await mailboxesOn(org.organizationId))) return { error: "Mailboxes aren't switched on for your company yet." };
  return { org, dept: deptRaw };
}
const str = (f: FormData, k: string) => String(f.get(k) ?? "");

export async function createMailboxAction(_prev: MailState, formData: FormData): Promise<MailState> {
  const g = await gate(formData.get("dept"));
  if ("error" in g) return g;
  const kind = str(formData, "kind") === "PERSONAL" ? "PERSONAL" : "SHARED";
  const r = await createMailbox(g.org, { dept: g.dept, kind, name: str(formData, "name") });
  if (!r.ok) return { error: r.error };
  redirect(`${mailPath(g.dept)}/settings?box=${r.id}&created=1`);
}

export async function renameMailboxAction(deptRaw: string, id: string, name: string): Promise<MailState> {
  const g = await gate(deptRaw);
  if ("error" in g) return g;
  const r = await renameMailbox(g.org, g.dept, id, name);
  return r.ok ? { ok: true, notice: "Renamed." } : { error: r.error };
}

export async function hideMailboxAction(deptRaw: string, id: string, hidden: boolean): Promise<MailState> {
  const g = await gate(deptRaw);
  if ("error" in g) return g;
  const r = await setMailboxHidden(g.org, g.dept, id, hidden);
  return r.ok ? { ok: true, notice: hidden ? "Hidden. Nothing was deleted; you can bring it back." : "Brought back." } : { error: r.error };
}

export async function disconnectMailboxAction(deptRaw: string, id: string): Promise<MailState> {
  const g = await gate(deptRaw);
  if ("error" in g) return g;
  const r = await disconnectMailbox(g.org, g.dept, id);
  return r.ok ? { ok: true, notice: "Disconnected. The mail already in this mailbox stays." } : { error: r.error };
}

export async function detectMailboxAction(deptRaw: string, id: string, email: string): Promise<{ error?: string; detected?: Detected }> {
  const g = await gate(deptRaw);
  if ("error" in g) return { error: g.error };
  const box = await getMailbox(g.org, g.dept, id);
  if (!box || !box.view.rights.connect) return { error: "You can't connect this mailbox." };
  const e = String(email ?? "").trim().toLowerCase();
  if (!isEmail(e)) return { error: "Enter the full email address, like purchasing@yourcompany.com." };
  return { detected: await detectMail(e) };
}

/** Connects a mailbox hosted somewhere other than Google or Microsoft by its address and password. Sending works; reading its Inbox isn't available for these yet. */
export async function connectMailboxSmtpAction(deptRaw: string, id: string, email: string, password: string, host: string, port: number): Promise<MailState> {
  const g = await gate(deptRaw);
  if ("error" in g) return g;
  const box = await getMailbox(g.org, g.dept, id);
  if (!box || !box.view.rights.connect) return { error: "You can't connect this mailbox." };
  const e = String(email ?? "").trim().toLowerCase();
  const h = String(host ?? "").trim().toLowerCase();
  const pw = String(password ?? "");
  const pt = Number(port);
  if (!isEmail(e)) return { error: "Enter the full email address, like purchasing@yourcompany.com." };
  if (!pw || pw.length > 200) return { error: "Enter the mailbox's password (or app password)." };
  if (!h) return { error: "Enter the mail server name (like smtp.yourhost.com)." };
  if (!Number.isInteger(pt)) return { error: "Enter the mail server's port." };
  const target = await checkSmtpTarget(h, pt);
  if (target) return { error: target };
  const login = await verifySmtp({ host: h, port: pt, user: e, pass: pw });
  if (login) return { error: login };
  const r = await saveMailboxConnection(g.org.organizationId, id, g.org.userId, { provider: "SMTP", email: e, secret: JSON.stringify({ host: h, port: pt, user: e, pass: pw }), canRead: false });
  return r.ok ? { ok: true, notice: "Connected. This mailbox can send. Reading its Inbox here isn't available for this kind of mailbox yet." } : { error: r.error };
}

export async function testMailboxAction(deptRaw: string, id: string): Promise<MailState> {
  const g = await gate(deptRaw);
  if ("error" in g) return g;
  const r = await sendMailboxTest(g.org, g.dept, id);
  return r.ok ? { ok: true, notice: `A test email was sent to ${r.to}. Check that inbox.` } : { error: r.error };
}

// ---------------------------------------------------------------------------------------------------------------------
// Compose
// ---------------------------------------------------------------------------------------------------------------------

/** The compose form's three buttons: Save draft, Send, and Send later (schedule). */
export async function composeAction(_prev: MailState, formData: FormData): Promise<MailState> {
  const g = await gate(formData.get("dept"));
  if ("error" in g) return g;
  const boxId = str(formData, "mailbox");
  const intent = str(formData, "intent");
  const files: NewFile[] = [];
  for (const f of formData.getAll("files")) {
    if (typeof f === "string" || !f.name || f.size === 0) continue;
    files.push({ name: f.name, type: f.type, data: Buffer.from(await f.arrayBuffer()) });
  }
  const plan: Plan =
    intent === "draft" ? { mode: "draft" } : str(formData, "when") === "later" ? { mode: "later", date: str(formData, "date"), time: str(formData, "time"), zone: str(formData, "zone") } : { mode: "now" };
  const r = await saveAndMaybeSend(
    g.org,
    g.dept,
    boxId,
    { to: str(formData, "to"), cc: str(formData, "cc"), bcc: str(formData, "bcc"), subject: str(formData, "subject"), body: str(formData, "body"), outboxId: str(formData, "draft") || null, files, removeIds: formData.getAll("remove").map(String), replyToMessageId: str(formData, "replyTo") || null },
    plan,
  );
  if (!r.ok) return { error: r.error, draftId: r.outboxId };
  const folder = r.sent ? "sent" : plan.mode === "draft" ? "drafts" : "scheduled";
  redirect(`${mailPath(g.dept)}?box=${boxId}&folder=${folder}&done=${r.sent ? "sent" : plan.mode === "draft" ? "saved" : "scheduled"}`);
}

export async function sendNowAction(deptRaw: string, boxId: string, outboxId: string): Promise<MailState> {
  const g = await gate(deptRaw);
  if ("error" in g) return g;
  const r = await sendOutboxNow(g.org, g.dept, boxId, outboxId);
  return r.ok ? { ok: true, notice: "Sent." } : { error: r.error };
}

export async function unscheduleAction(deptRaw: string, boxId: string, outboxId: string): Promise<MailState> {
  const g = await gate(deptRaw);
  if ("error" in g) return g;
  const r = await unscheduleOutbox(g.org, g.dept, boxId, outboxId);
  return r.ok ? { ok: true, notice: "Moved back to Drafts." } : { error: r.error };
}

export async function discardAction(deptRaw: string, boxId: string, outboxId: string): Promise<MailState> {
  const g = await gate(deptRaw);
  if ("error" in g) return g;
  const r = await discardOutbox(g.org, g.dept, boxId, outboxId);
  return r.ok ? { ok: true, notice: "Discarded." } : { error: r.error };
}

/**
 * The Mail tab calls this every minute while it is open: it sends this company's scheduled emails that have come due, and checks the
 * department's mailboxes this person can read for new mail (a mailbox is never asked more often than about once a minute).
 */
export async function tickMailAction(deptRaw?: string): Promise<{ sent: number; received: number }> {
  const org = await requireOrg();
  if (org.viewAs) return { sent: 0, received: 0 };
  if (!(await mailboxesOn(org.organizationId))) return { sent: 0, received: 0 };
  const r = await dispatchDue({ organizationId: org.organizationId, limit: 10 });
  let received = 0;
  if (isMailDept(deptRaw) && canViewMailDept(deptRaw, org)) {
    const ids = (await listMailboxes(org, deptRaw)).filter((b) => b.rights.read && b.status === "ACTIVE" && b.canRead && b.provider !== "SMTP").map((b) => b.id);
    if (ids.length) received = (await syncDue({ organizationId: org.organizationId, mailboxIds: ids, limit: 3, minGapMs: AUTO_GAP_MS })).added;
  }
  return { sent: r.sent, received };
}

/** The Refresh button: checks one mailbox for new mail right now. */
export async function refreshMailboxAction(deptRaw: string, boxId: string): Promise<MailState & { added?: number }> {
  const g = await gate(deptRaw);
  if ("error" in g) return g;
  if (g.org.viewAs) return { error: "Looking through View as company is read-only." };
  const box = await getMailbox(g.org, g.dept, boxId);
  if (!box || !box.view.rights.read) return { error: "You can't open this mailbox." };
  if (box.view.status !== "ACTIVE") return { error: box.view.status === "NEEDS_RECONNECT" ? "Reconnect this mailbox first." : "Connect this mailbox first." };
  if (box.view.provider === "SMTP" || !box.view.canRead) return { error: "Reading mail isn't available for this mailbox." };
  const r = await syncMailbox(g.org.organizationId, boxId, { minGapMs: MANUAL_GAP_MS });
  if (!r.ok) return { error: r.error };
  if (r.skipped === "throttled") return { ok: true, added: 0, notice: "Just checked a moment ago. Nothing new." };
  return { ok: true, added: r.added, notice: r.added ? `${r.added} new ${r.added === 1 ? "email" : "emails"}.` : "Nothing new." };
}

export async function markUnreadAction(deptRaw: string, boxId: string, messageId: string): Promise<MailState> {
  const g = await gate(deptRaw);
  if ("error" in g) return g;
  const r = await markMessageUnread(g.org, g.dept, boxId, messageId);
  return r.ok ? { ok: true, notice: "Marked as unread." } : { error: r.error };
}

export async function markAllReadAction(deptRaw: string, boxId: string): Promise<MailState> {
  const g = await gate(deptRaw);
  if ("error" in g) return g;
  const r = await markAllRead(g.org, g.dept, boxId);
  return r.ok ? { ok: true, notice: r.n ? `${r.n} marked as read.` : "Everything was already read." } : { error: r.error };
}

/** Called by the message page when it opens: marks a received message as read (a page view itself never changes anything). */
export async function markReadAction(deptRaw: string, boxId: string, messageId: string): Promise<void> {
  const g = await gate(deptRaw);
  if ("error" in g) return;
  await markMessageRead(g.org, g.dept, boxId, messageId);
}
