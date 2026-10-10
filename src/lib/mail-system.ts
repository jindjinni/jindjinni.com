// The app's own emails (a quotation, a purchase order, a receiving notice, an audit answer) sent from the department's shared
// mailbox when it has one connected, with a copy kept in that mailbox's Sent folder (source SYSTEM, linked to the record that
// caused it). A department with no shared mailbox keeps working exactly as before (the company-wide connected email, then
// the platform's address as before). A department whose shared mailbox needs reconnecting fails loudly: it never quietly goes
// out from some other address.

import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { mailAttachments, mailboxes, mailMessages, organizations, users } from "@/db/schema";
import { NeedsReconnect, RECONNECT_TEXT, sendOrgEmail, sendWithCred, type SendArgs, type SendResult } from "@/lib/email-connector";
import { mailboxesOn } from "@/lib/mail-access";
import { snippetOf, MAX_MAIL_BYTES, type MailDept } from "@/lib/mail-rules";

const newId = (p: string) => `${p}_${crypto.randomUUID().replace(/-/g, "")}`;

export type SystemMailInfo = {
  dept: MailDept;
  /** What the email is about, so the Sent folder can link back: e.g. "sales_document", "purchase_order", "receiving_package", "audit". */
  relatedKind: string;
  relatedId: string | null;
  /** Who pressed Send. */
  by?: { userId: string; name: string | null } | null;
};

export type DeptSender = { state: "MAILBOX"; id: string; accountEmail: string } | { state: "RECONNECT" } | { state: "NONE" };

/** The shared mailbox a department's own emails go out from: the oldest connected, visible shared one. */
export async function deptSenderFor(organizationId: string, dept: MailDept): Promise<DeptSender> {
  if (!(await mailboxesOn(organizationId))) return { state: "NONE" };
  const rows = await db
    .select({ id: mailboxes.id, status: mailboxes.status, provider: mailboxes.provider, accountEmail: mailboxes.accountEmail, cred: mailboxes.credentialEnc })
    .from(mailboxes)
    .where(and(eq(mailboxes.organizationId, organizationId), eq(mailboxes.department, dept), eq(mailboxes.kind, "SHARED"), isNull(mailboxes.hiddenAt)))
    .orderBy(asc(mailboxes.createdAt));
  const connected = rows.filter((r) => r.provider && r.cred && r.accountEmail);
  const active = connected.find((r) => r.status === "ACTIVE");
  if (active) return { state: "MAILBOX", id: active.id, accountEmail: active.accountEmail! };
  if (connected.length) return { state: "RECONNECT" };
  return { state: "NONE" };
}

const typeOf = (name: string) =>
  ({ pdf: "application/pdf", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", csv: "text/csv", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg" } as Record<string, string>)[name.toLowerCase().split(".").pop() ?? ""] ?? "application/octet-stream";

/**
 * Sends one of the app's own emails for a department. Same arguments and answer as `sendOrgEmail`; `from` is the mailbox's address
 * when it went out from a department mailbox.
 */
export async function sendDeptEmail(organizationId: string, info: SystemMailInfo, args: SendArgs): Promise<SendResult> {
  const sender = await deptSenderFor(organizationId, info.dept);
  if (sender.state === "NONE") return sendOrgEmail(organizationId, args);
  if (sender.state === "RECONNECT") return { ok: false, error: RECONNECT_TEXT.replace("in Email Settings", "in the department's Mailbox settings") };

  const [box] = await db.select().from(mailboxes).where(and(eq(mailboxes.id, sender.id), eq(mailboxes.organizationId, organizationId))).limit(1);
  if (!box || !box.provider || !box.credentialEnc || !box.accountEmail) return { ok: false, error: RECONNECT_TEXT.replace("in Email Settings", "in the department's Mailbox settings") };
  const [org] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  const fromName = args.fromName?.trim() || org?.name || null;

  try {
    await sendWithCred({ provider: box.provider, accountEmail: box.accountEmail, credentialEnc: box.credentialEnc }, { ...args, fromName }, async (enc) => {
      await db.update(mailboxes).set({ credentialEnc: enc }).where(and(eq(mailboxes.id, box.id), eq(mailboxes.organizationId, organizationId)));
    });
  } catch (e) {
    if (e instanceof NeedsReconnect) {
      await db.update(mailboxes).set({ status: "NEEDS_RECONNECT", lastError: e.message }).where(and(eq(mailboxes.id, box.id), eq(mailboxes.organizationId, organizationId)));
      return { ok: false, error: RECONNECT_TEXT.replace("in Email Settings", "in the department's Mailbox settings") };
    }
    const msg = e instanceof Error ? e.message : "The email couldn't be sent.";
    await db.update(mailboxes).set({ lastError: msg }).where(and(eq(mailboxes.id, box.id), eq(mailboxes.organizationId, organizationId)));
    console.error("[mail-system] send failed:", msg);
    return { ok: false, error: msg };
  }

  // Out. Keep a copy in the Sent folder; a problem keeping it never undoes or hides the send.
  const at = new Date().toISOString();
  try {
    const messageId = newId("mmsg");
    let byName = info.by?.name ?? null;
    if (!byName && info.by?.userId) {
      const [u] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, info.by.userId)).limit(1);
      byName = u?.name || u?.email || null;
    }
    const files = args.attachments ?? [];
    await db.insert(mailMessages).values({
      id: messageId, organizationId, mailboxId: box.id, direction: "OUT", fromName, fromAddress: box.accountEmail,
      toAddresses: args.to, ccAddresses: args.cc?.length ? args.cc.join(", ") : null, subject: args.subject.slice(0, 300), snippet: snippetOf(args.text),
      bodyText: args.text, hasAttachments: files.length > 0, at, readAt: at, sentByUserId: info.by?.userId ?? null, sentByName: byName,
      source: "SYSTEM", relatedKind: info.relatedKind, relatedId: info.relatedId,
    });
    let total = 0;
    for (const f of files) {
      total += f.content.length;
      if (total > MAX_MAIL_BYTES) break; // the document itself stays on its own record; the Sent copy keeps what fits
      await db.insert(mailAttachments).values({ id: newId("matt"), organizationId, mailboxId: box.id, messageId, filename: f.filename, contentType: typeOf(f.filename), bytes: f.content.length, dataB64: f.content.toString("base64") });
    }
    await db.update(mailboxes).set({ lastUsedAt: at, lastError: null }).where(and(eq(mailboxes.id, box.id), eq(mailboxes.organizationId, organizationId)));
  } catch (e) {
    console.error("[mail-system] sent, but saving the Sent copy failed:", e);
  }
  return { ok: true, from: box.accountEmail };
}
