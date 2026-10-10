// Department mailboxes: creating them, connecting them, composing, drafts, scheduled emails, and the lists the Mail tab shows.
// Everything is scoped by the company (organizationId) and checked against mail-access.ts. Nothing here ever sends from the
// platform's own account: a mailbox sends through the company's own connected Google, Microsoft or other account, or not at all.

import { and, asc, desc, eq, inArray, isNull, like, lte, ne, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { mailAttachments, mailboxes, mailMessages, mailOutbox, organizations, users } from "@/db/schema";
import { NeedsReconnect, RECONNECT_TEXT, sendWithCred } from "@/lib/email-connector";
import { decryptToken, encryptToken } from "@/lib/email-connector-crypto";
import { bodyToHtml } from "@/lib/audit-email";
import {
  afterFailure, checkCompose, checkSchedule, cleanMailboxName, DEPT_LABEL, MAX_ATTEMPTS, MAX_MAIL_BYTES, safeFileName, snippetOf, STUCK_AFTER_MS,
  type ComposeInput, type Folder, type MailDept, type MailKind,
} from "@/lib/mail-rules";
import { canAddMailbox, mailboxesOn, mailRights, type MailRights } from "@/lib/mail-access";
import { isHeldBack, type CurrentOrg } from "@/lib/tenant";

export type MailboxRow = typeof mailboxes.$inferSelect;
export type OutboxRow = typeof mailOutbox.$inferSelect;
export type MessageRow = typeof mailMessages.$inferSelect;

const nowIso = () => new Date().toISOString();
const newId = (p: string) => `${p}_${crypto.randomUUID().replace(/-/g, "")}`;
export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export type MailboxView = {
  id: string;
  department: MailDept;
  kind: MailKind;
  name: string;
  ownerUserId: string | null;
  ownerName: string | null;
  provider: "GOOGLE" | "MICROSOFT" | "SMTP" | null;
  accountEmail: string | null;
  status: "NOT_CONNECTED" | "ACTIVE" | "NEEDS_RECONNECT";
  canRead: boolean;
  lastError: string | null;
  hidden: boolean;
  connectedAt: string | null;
  lastUsedAt: string | null;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  rights: MailRights;
};

type OrgCtx = Pick<CurrentOrg, "userId" | "organizationId" | "organizationName" | "role" | "access" | "viewAs">;

async function viewOf(org: OrgCtx, dept: MailDept, row: MailboxRow, ownerName: string | null): Promise<MailboxView> {
  return {
    id: row.id,
    department: dept,
    kind: row.kind === "PERSONAL" ? "PERSONAL" : "SHARED",
    name: row.name,
    ownerUserId: row.ownerUserId,
    ownerName,
    provider: row.provider === "GOOGLE" || row.provider === "MICROSOFT" || row.provider === "SMTP" ? row.provider : null,
    accountEmail: row.accountEmail,
    status: row.status === "ACTIVE" || row.status === "NEEDS_RECONNECT" ? row.status : "NOT_CONNECTED",
    canRead: row.canRead,
    lastError: row.lastError,
    hidden: !!row.hiddenAt,
    connectedAt: row.connectedAt,
    lastUsedAt: row.lastUsedAt,
    lastSyncAt: row.lastSyncAt,
    lastSyncError: row.lastSyncError,
    rights: mailRights(row, org, dept),
  };
}

/** The mailboxes this person can see in a department: the shared ones, their own personal ones, and (for an admin, in settings) everybody's to manage. */
export async function listMailboxes(org: OrgCtx, dept: MailDept, opts: { forSettings?: boolean } = {}): Promise<MailboxView[]> {
  const rows = await db
    .select({ box: mailboxes, ownerName: users.name, ownerEmail: users.email })
    .from(mailboxes)
    .leftJoin(users, eq(users.id, mailboxes.ownerUserId))
    .where(and(eq(mailboxes.organizationId, org.organizationId), eq(mailboxes.department, dept)))
    .orderBy(desc(mailboxes.kind), asc(mailboxes.createdAt)); // shared mailboxes first
  const out: MailboxView[] = [];
  for (const r of rows) {
    const v = await viewOf(org, dept, r.box, r.ownerName || r.ownerEmail || null);
    if (!(v.rights.read || (opts.forSettings && v.rights.manage))) continue;
    if (v.hidden && !opts.forSettings) continue;
    out.push(v);
  }
  return out;
}

/** One mailbox, only when it is in this company and this person may do something with it. */
export async function getMailbox(org: OrgCtx, dept: MailDept, id: string): Promise<{ box: MailboxRow; view: MailboxView } | null> {
  if (!id) return null;
  const [r] = await db
    .select({ box: mailboxes, ownerName: users.name, ownerEmail: users.email })
    .from(mailboxes)
    .leftJoin(users, eq(users.id, mailboxes.ownerUserId))
    .where(and(eq(mailboxes.id, id), eq(mailboxes.organizationId, org.organizationId), eq(mailboxes.department, dept)))
    .limit(1);
  if (!r) return null;
  const view = await viewOf(org, dept, r.box, r.ownerName || r.ownerEmail || null);
  if (!view.rights.read && !view.rights.manage) return null;
  return { box: r.box, view };
}

export const MAX_SHARED_PER_DEPT = 10;

export async function createMailbox(org: OrgCtx, input: { dept: MailDept; kind: MailKind; name?: string }): Promise<Result<{ id: string }>> {
  if (!canAddMailbox(input.kind, input.dept, org)) return { ok: false, error: input.kind === "SHARED" ? "Only an owner or admin can add a shared mailbox." : "You can't add a mailbox here." };
  const existing = await db.select({ kind: mailboxes.kind, owner: mailboxes.ownerUserId, hidden: mailboxes.hiddenAt }).from(mailboxes).where(and(eq(mailboxes.organizationId, org.organizationId), eq(mailboxes.department, input.dept)));
  let name = cleanMailboxName(input.name);
  if (input.kind === "SHARED") {
    if (existing.filter((e) => e.kind === "SHARED" && !e.hidden).length >= MAX_SHARED_PER_DEPT) return { ok: false, error: `A department can have up to ${MAX_SHARED_PER_DEPT} shared mailboxes.` };
    if (!name) name = DEPT_LABEL[input.dept];
  } else {
    if (existing.some((e) => e.kind === "PERSONAL" && e.owner === org.userId && !e.hidden)) return { ok: false, error: "You already have a personal mailbox in this department." };
    if (!name) {
      const [u] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, org.userId)).limit(1);
      const first = (u?.name || u?.email || "My").split(/[\s@]/)[0];
      name = cleanMailboxName(`${first}'s mailbox`);
    }
  }
  const id = newId("mbx");
  await db.insert(mailboxes).values({ id, organizationId: org.organizationId, department: input.dept, kind: input.kind, name, ownerUserId: input.kind === "PERSONAL" ? org.userId : null, createdByUserId: org.userId });
  return { ok: true, id };
}

async function manageable(org: OrgCtx, dept: MailDept, id: string): Promise<{ box: MailboxRow; view: MailboxView } | null> {
  const g = await getMailbox(org, dept, id);
  return g && g.view.rights.manage ? g : null;
}

export async function renameMailbox(org: OrgCtx, dept: MailDept, id: string, name: string): Promise<Result> {
  const g = await manageable(org, dept, id);
  if (!g) return { ok: false, error: "You can't change this mailbox." };
  const n = cleanMailboxName(name);
  if (!n) return { ok: false, error: "Give the mailbox a name." };
  await db.update(mailboxes).set({ name: n }).where(and(eq(mailboxes.id, id), eq(mailboxes.organizationId, org.organizationId)));
  return { ok: true };
}

/** Hides (or brings back) a mailbox. Nothing is deleted, and a mailbox with emails waiting to go out can't be hidden. */
export async function setMailboxHidden(org: OrgCtx, dept: MailDept, id: string, hidden: boolean): Promise<Result> {
  const g = await manageable(org, dept, id);
  if (!g) return { ok: false, error: "You can't change this mailbox." };
  if (hidden) {
    const [w] = await db.select({ n: sql<number>`count(*)` }).from(mailOutbox).where(and(eq(mailOutbox.mailboxId, id), eq(mailOutbox.organizationId, org.organizationId), inArray(mailOutbox.status, ["SCHEDULED", "SENDING"])));
    if (Number(w?.n ?? 0) > 0) return { ok: false, error: "This mailbox still has scheduled emails. Open Scheduled and move them back to drafts (or let them go out) first." };
  }
  await db.update(mailboxes).set({ hiddenAt: hidden ? nowIso() : null }).where(and(eq(mailboxes.id, id), eq(mailboxes.organizationId, org.organizationId)));
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------------------------------
// Connecting
// ---------------------------------------------------------------------------------------------------------------------

/** Saves the company's own account on a mailbox (after Google/Microsoft sign-in, or the other-mailbox form). */
export async function saveMailboxConnection(
  organizationId: string,
  mailboxId: string,
  userId: string,
  c: { provider: "GOOGLE" | "MICROSOFT" | "SMTP"; email: string; secret: string; canRead: boolean },
): Promise<Result> {
  const email = c.email.toLowerCase();
  const [same] = await db
    .select({ id: mailboxes.id, name: mailboxes.name })
    .from(mailboxes)
    .where(and(eq(mailboxes.organizationId, organizationId), eq(mailboxes.accountEmail, email), ne(mailboxes.id, mailboxId), isNull(mailboxes.hiddenAt)))
    .limit(1);
  if (same) return { ok: false, error: `${email} is already connected to the mailbox "${same.name}". Disconnect it there first, or use a different address.` };
  const r = await db
    .update(mailboxes)
    .set({ provider: c.provider, accountEmail: email, credentialEnc: encryptToken(c.secret), status: "ACTIVE", canRead: c.canRead, lastError: null, connectedByUserId: userId, connectedAt: nowIso(), lastUsedAt: null, syncCursor: null, lastSyncAt: null, lastSyncError: null })
    .where(and(eq(mailboxes.id, mailboxId), eq(mailboxes.organizationId, organizationId)));
  if (!r.rowsAffected) return { ok: false, error: "That mailbox no longer exists." };
  return { ok: true };
}

const googleRevokeUrl = () => (!process.env.VERCEL && process.env.GOOGLE_TEST_BASE ? `${process.env.GOOGLE_TEST_BASE}/revoke` : "https://oauth2.googleapis.com/revoke");

/** Disconnects the account from a mailbox (Google is told to forget the permission). The messages already in the mailbox stay. */
export async function disconnectMailbox(org: OrgCtx, dept: MailDept, id: string): Promise<Result> {
  const g = await manageable(org, dept, id);
  if (!g) return { ok: false, error: "You can't change this mailbox." };
  const { box } = g;
  await db
    .update(mailboxes)
    .set({ provider: null, accountEmail: null, credentialEnc: null, status: "NOT_CONNECTED", canRead: false, lastError: null, syncCursor: null, lastSyncError: null })
    .where(and(eq(mailboxes.id, id), eq(mailboxes.organizationId, org.organizationId)));
  if (box.provider === "GOOGLE" && box.credentialEnc) {
    const token = decryptToken(box.credentialEnc);
    if (token) {
      try {
        await fetch(googleRevokeUrl(), { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }) });
      } catch {
        // The permission can also be removed from the Google account's security page.
      }
    }
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------------------------------------------------

export type NewFile = { name: string; type: string; data: Buffer };
export type FileInfo = { id: string; filename: string; bytes: number; contentType: string | null };

async function filesOf(organizationId: string, where: { outboxId?: string; messageId?: string }): Promise<FileInfo[]> {
  const cond = where.outboxId ? eq(mailAttachments.outboxId, where.outboxId) : where.messageId ? eq(mailAttachments.messageId, where.messageId) : undefined;
  if (!cond) return [];
  const rows = await db.select({ id: mailAttachments.id, filename: mailAttachments.filename, bytes: mailAttachments.bytes, contentType: mailAttachments.contentType }).from(mailAttachments).where(and(eq(mailAttachments.organizationId, organizationId), cond)).orderBy(asc(mailAttachments.createdAt));
  return rows;
}

// ---------------------------------------------------------------------------------------------------------------------
// Drafts, sending and scheduling
// ---------------------------------------------------------------------------------------------------------------------

const EDITABLE = ["DRAFT", "SCHEDULED", "FAILED"] as const;

export type Plan = { mode: "draft" } | { mode: "now" } | { mode: "later"; date: string; time: string; zone: string };
export type SaveInput = ComposeInput & { outboxId?: string | null; files: NewFile[]; removeIds: string[]; /** The received email this one answers. */ replyToMessageId?: string | null };
export type SaveOk = { ok: true; outboxId: string; sent: boolean; scheduledFor: string | null };
export type SaveFail = { ok: false; error: string; outboxId?: string };

/**
 * One entry point for the compose form's three buttons. "draft" keeps it as typed (half-finished is fine), "later" checks everything
 * and schedules it, "now" checks everything and sends it. The text is saved first, so a failed send never loses what was typed.
 */
export async function saveAndMaybeSend(org: OrgCtx, dept: MailDept, mailboxId: string, input: SaveInput, plan: Plan, nowMs = Date.now()): Promise<SaveOk | SaveFail> {
  const g = await getMailbox(org, dept, mailboxId);
  if (!g || !g.view.rights.send) return { ok: false, error: "You can't send from this mailbox." };

  let current: OutboxRow | null = null;
  if (input.outboxId) {
    const [row] = await db.select().from(mailOutbox).where(and(eq(mailOutbox.id, input.outboxId), eq(mailOutbox.organizationId, org.organizationId), eq(mailOutbox.mailboxId, mailboxId))).limit(1);
    if (!row || !(EDITABLE as readonly string[]).includes(row.status)) return { ok: false, error: row?.status === "SENT" ? "That email was already sent." : "That email can't be changed any more." };
    current = row;
  }

  // The files that will be on the email: the ones already there (minus the ones taken off) and the new ones.
  const have = current ? (await filesOf(org.organizationId, { outboxId: current.id })).filter((f) => !input.removeIds.includes(f.id)) : [];
  const fileList = [...have.map((f) => ({ name: f.filename, bytes: f.bytes })), ...input.files.map((f) => ({ name: f.name, bytes: f.data.length }))];

  let status: OutboxRow["status"] = "DRAFT";
  let scheduledFor: string | null = null;
  let scheduleZone: string | null = null;
  if (plan.mode !== "draft") {
    const chk = checkCompose(input, fileList);
    if (!chk.ok) return { ok: false, error: chk.errors[0] };
    if (plan.mode === "later") {
      const s = checkSchedule(plan.date, plan.time, plan.zone, nowMs);
      if (!s.ok) return { ok: false, error: s.error };
      status = "SCHEDULED";
      scheduledFor = s.iso;
      scheduleZone = s.zone;
    }
  } else {
    // A draft only has to be safe to store.
    if (fileList.length > 8 || fileList.reduce((n, f) => n + f.bytes, 0) > MAX_MAIL_BYTES) return { ok: false, error: "The files are too large for one email (8 MB together, at most 8 files)." };
  }

  const fields = {
    toAddresses: String(input.to ?? "").slice(0, 2000),
    ccAddresses: String(input.cc ?? "").slice(0, 2000),
    bccAddresses: String(input.bcc ?? "").slice(0, 2000),
    subject: String(input.subject ?? "").replace(/[\r\n]+/g, " ").slice(0, 300),
    bodyText: String(input.body ?? "").slice(0, 60_000),
    status,
    scheduledFor,
    scheduleZone,
    attempts: 0,
    lastError: null as string | null,
    updatedAt: nowIso(),
  };
  let outboxId = current?.id ?? "";
  if (current) {
    const r = await db.update(mailOutbox).set(fields).where(and(eq(mailOutbox.id, current.id), eq(mailOutbox.organizationId, org.organizationId), inArray(mailOutbox.status, [...EDITABLE])));
    if (!r.rowsAffected) return { ok: false, error: "That email is being sent right now, or was just sent." };
  } else {
    outboxId = newId("mout");
    const [me] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, org.userId)).limit(1);
    // A reply must answer an email in this very mailbox.
    let replyTo: string | null = null;
    if (input.replyToMessageId) {
      const [parent] = await db.select({ id: mailMessages.id }).from(mailMessages).where(and(eq(mailMessages.id, input.replyToMessageId), eq(mailMessages.organizationId, org.organizationId), eq(mailMessages.mailboxId, mailboxId))).limit(1);
      replyTo = parent?.id ?? null;
    }
    await db.insert(mailOutbox).values({ id: outboxId, organizationId: org.organizationId, mailboxId, ...fields, replyToMessageId: replyTo, createdByUserId: org.userId, createdByName: me?.name || me?.email || null });
  }
  if (input.removeIds.length) {
    await db.delete(mailAttachments).where(and(eq(mailAttachments.organizationId, org.organizationId), eq(mailAttachments.outboxId, outboxId), inArray(mailAttachments.id, input.removeIds)));
  }
  for (const f of input.files) {
    await db.insert(mailAttachments).values({ id: newId("matt"), organizationId: org.organizationId, mailboxId, outboxId, filename: safeFileName(f.name), contentType: f.type || null, bytes: f.data.length, dataB64: f.data.toString("base64") });
  }

  if (plan.mode !== "now") return { ok: true, outboxId, sent: false, scheduledFor };
  const d = await deliver(org.organizationId, outboxId, { userId: org.userId, name: null }, nowMs);
  if (!d.ok) return { ok: false, error: d.error, outboxId };
  return { ok: true, outboxId, sent: true, scheduledFor: null };
}

/** Moves a scheduled (or failed) email back to drafts so it can be edited, or sends it right now. */
export async function unscheduleOutbox(org: OrgCtx, dept: MailDept, mailboxId: string, outboxId: string): Promise<Result> {
  const g = await getMailbox(org, dept, mailboxId);
  if (!g || !g.view.rights.send) return { ok: false, error: "You can't change this mailbox's emails." };
  const r = await db
    .update(mailOutbox)
    .set({ status: "DRAFT", scheduledFor: null, scheduleZone: null, attempts: 0, updatedAt: nowIso() })
    .where(and(eq(mailOutbox.id, outboxId), eq(mailOutbox.organizationId, org.organizationId), eq(mailOutbox.mailboxId, mailboxId), inArray(mailOutbox.status, ["SCHEDULED", "FAILED"])));
  return r.rowsAffected ? { ok: true } : { ok: false, error: "That email already went out, or is going out right now." };
}

export async function sendOutboxNow(org: OrgCtx, dept: MailDept, mailboxId: string, outboxId: string): Promise<Result> {
  const g = await getMailbox(org, dept, mailboxId);
  if (!g || !g.view.rights.send) return { ok: false, error: "You can't send from this mailbox." };
  const [row] = await db.select().from(mailOutbox).where(and(eq(mailOutbox.id, outboxId), eq(mailOutbox.organizationId, org.organizationId), eq(mailOutbox.mailboxId, mailboxId))).limit(1);
  if (!row) return { ok: false, error: "That email wasn't found." };
  const files = await filesOf(org.organizationId, { outboxId });
  const chk = checkCompose({ to: row.toAddresses, cc: row.ccAddresses, bcc: row.bccAddresses, subject: row.subject, body: row.bodyText }, files.map((f) => ({ name: f.filename, bytes: f.bytes })));
  if (!chk.ok) return { ok: false, error: chk.errors[0] };
  const d = await deliver(org.organizationId, outboxId, { userId: org.userId, name: null }, Date.now());
  return d.ok ? { ok: true } : { ok: false, error: d.error };
}

/** Throws away a draft (it is kept out of sight, never deleted). */
export async function discardOutbox(org: OrgCtx, dept: MailDept, mailboxId: string, outboxId: string): Promise<Result> {
  const g = await getMailbox(org, dept, mailboxId);
  if (!g || !g.view.rights.send) return { ok: false, error: "You can't change this mailbox's emails." };
  const r = await db
    .update(mailOutbox)
    .set({ status: "CANCELLED", scheduledFor: null, updatedAt: nowIso() })
    .where(and(eq(mailOutbox.id, outboxId), eq(mailOutbox.organizationId, org.organizationId), eq(mailOutbox.mailboxId, mailboxId), inArray(mailOutbox.status, [...EDITABLE])));
  return r.rowsAffected ? { ok: true } : { ok: false, error: "That email can't be discarded any more." };
}

type Actor = { userId: string; name: string | null } | null;

/** May this company send mail right now (approved, not closed, not suspended)? */
export async function orgMaySend(organizationId: string): Promise<boolean> {
  const [o] = await db.select({ closedAt: organizations.closedAt, status: organizations.approvalStatus, parent: organizations.parentOrganizationId, ends: organizations.serviceEndsOn }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  if (!o || o.closedAt || isHeldBack(o.status)) return false;
  if (o.parent) {
    const [m] = await db.select({ closedAt: organizations.closedAt, status: organizations.approvalStatus }).from(organizations).where(eq(organizations.id, o.parent)).limit(1);
    if (!m || m.closedAt || isHeldBack(m.status)) return false;
  }
  return true;
}

/**
 * Sends one email from its mailbox. The row is claimed first (SENDING) so two checks at the same moment can never send it twice.
 * A manual send that fails goes back to the draft with the reason; a scheduled one is tried again a few minutes later, up to three
 * times, then shown as failed. A mailbox that needs reconnecting is not retried (it would only fail again).
 */
export async function deliver(organizationId: string, outboxId: string, actor: Actor, nowMs: number): Promise<Result<{ messageId: string }>> {
  const [row] = await db.select().from(mailOutbox).where(and(eq(mailOutbox.id, outboxId), eq(mailOutbox.organizationId, organizationId))).limit(1);
  if (!row) return { ok: false, error: "That email wasn't found." };
  const wasScheduled = row.status === "SCHEDULED";
  const claim = await db
    .update(mailOutbox)
    .set({ status: "SENDING", updatedAt: new Date(nowMs).toISOString() })
    .where(and(eq(mailOutbox.id, outboxId), eq(mailOutbox.organizationId, organizationId), inArray(mailOutbox.status, [...EDITABLE])));
  if (!claim.rowsAffected) return { ok: false, error: "That email is already being sent, or was already sent." };

  const putBack = async (error: string, status: OutboxRow["status"], extra: Partial<OutboxRow> = {}) => {
    await db.update(mailOutbox).set({ status, lastError: error, updatedAt: nowIso(), ...extra }).where(and(eq(mailOutbox.id, outboxId), eq(mailOutbox.organizationId, organizationId)));
    return { ok: false as const, error };
  };
  const manualBack: OutboxRow["status"] = wasScheduled ? "FAILED" : "DRAFT";

  const [box] = await db.select().from(mailboxes).where(and(eq(mailboxes.id, row.mailboxId), eq(mailboxes.organizationId, organizationId))).limit(1);
  if (!box || !box.credentialEnc || !box.accountEmail || !box.provider) return putBack("This mailbox isn't connected yet. Connect the company's email in Mailbox settings, then send it again.", manualBack);
  if (box.status !== "ACTIVE") return putBack(RECONNECT_TEXT.replace("in Email Settings", "in Mailbox settings"), manualBack);

  const chk = checkCompose({ to: row.toAddresses, cc: row.ccAddresses, bcc: row.bccAddresses, subject: row.subject, body: row.bodyText });
  const files = await db.select().from(mailAttachments).where(and(eq(mailAttachments.organizationId, organizationId), eq(mailAttachments.outboxId, outboxId)));
  if (!chk.ok) return putBack(chk.errors[0], manualBack);

  const [orgRow] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  let fromName = orgRow?.name ?? null;
  if (box.kind === "PERSONAL" && box.ownerUserId) {
    const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, box.ownerUserId)).limit(1);
    if (u?.name) fromName = u.name;
  }
  const att = files.map((f) => ({ filename: f.filename, content: Buffer.from(f.dataB64, "base64") }));
  // A reply keeps the conversation together: it names the email it answers, and goes in the same Gmail conversation.
  let parent: { threadKey: string | null; rfcMessageId: string | null } | null = null;
  if (row.replyToMessageId) {
    const [pm] = await db.select({ threadKey: mailMessages.threadKey, rfcMessageId: mailMessages.rfcMessageId }).from(mailMessages).where(and(eq(mailMessages.id, row.replyToMessageId), eq(mailMessages.organizationId, organizationId), eq(mailMessages.mailboxId, box.id))).limit(1);
    parent = pm ?? null;
  }
  try {
    await sendWithCred(
      { provider: box.provider, accountEmail: box.accountEmail, credentialEnc: box.credentialEnc },
      { to: chk.to.join(", "), cc: chk.cc, bcc: chk.bcc, subject: chk.subject, text: row.bodyText, html: bodyToHtml(row.bodyText), fromName, attachments: att, inReplyTo: parent?.rfcMessageId ?? null, threadId: box.provider === "GOOGLE" && parent?.threadKey?.startsWith("g:") ? parent.threadKey.slice(2) : null },
      async (enc) => {
        await db.update(mailboxes).set({ credentialEnc: enc }).where(and(eq(mailboxes.id, box.id), eq(mailboxes.organizationId, organizationId)));
      },
    );
  } catch (e) {
    if (e instanceof NeedsReconnect) {
      await db.update(mailboxes).set({ status: "NEEDS_RECONNECT", lastError: e.message }).where(and(eq(mailboxes.id, box.id), eq(mailboxes.organizationId, organizationId)));
      return putBack(RECONNECT_TEXT.replace("in Email Settings", "in Mailbox settings"), manualBack);
    }
    const msg = e instanceof Error ? e.message : "The email couldn't be sent.";
    await db.update(mailboxes).set({ lastError: msg }).where(and(eq(mailboxes.id, box.id), eq(mailboxes.organizationId, organizationId)));
    console.error("[mailbox] send failed:", msg);
    if (wasScheduled) {
      const attempts = row.attempts + 1;
      const next = afterFailure(attempts, nowMs);
      return putBack(msg, next.status, { attempts, scheduledFor: next.retryAt ?? row.scheduledFor });
    }
    return putBack(msg, "DRAFT");
  }

  // Sent. Keep a copy in the Sent folder, with its files, and close the outbox row.
  const at = new Date(nowMs).toISOString();
  const messageId = newId("mmsg");
  await db.insert(mailMessages).values({
    id: messageId, organizationId, mailboxId: box.id, direction: "OUT", fromName, fromAddress: box.accountEmail, toAddresses: chk.to.join(", "), ccAddresses: chk.cc.join(", ") || null,
    threadKey: parent?.threadKey ?? null, subject: chk.subject, snippet: snippetOf(row.bodyText), bodyText: row.bodyText, hasAttachments: files.length > 0, at, readAt: at,
    sentByUserId: actor?.userId ?? row.createdByUserId, sentByName: actor?.name ?? row.createdByName, source: "COMPOSE",
  });
  await db.update(mailAttachments).set({ messageId }).where(and(eq(mailAttachments.organizationId, organizationId), eq(mailAttachments.outboxId, outboxId)));
  await db.update(mailOutbox).set({ status: "SENT", messageId, sentAt: at, lastError: null, updatedAt: at }).where(and(eq(mailOutbox.id, outboxId), eq(mailOutbox.organizationId, organizationId)));
  await db.update(mailboxes).set({ lastUsedAt: at, lastError: null }).where(and(eq(mailboxes.id, box.id), eq(mailboxes.organizationId, organizationId)));
  return { ok: true, messageId };
}

/**
 * Sends every scheduled email that is due (for one company when `organizationId` is given, else for all of them). Called by the
 * background check and by the Mail tab while someone has it open. Emails of a company that is closed or on hold wait.
 */
export async function dispatchDue(opts: { organizationId?: string; nowMs?: number; limit?: number } = {}): Promise<{ sent: number; failed: number; waiting: number }> {
  const nowMs = opts.nowMs ?? Date.now();
  const now = new Date(nowMs).toISOString();
  const scope = opts.organizationId ? eq(mailOutbox.organizationId, opts.organizationId) : undefined;
  // Something stuck "sending" for a long time was interrupted. Show it as failed rather than risk sending it twice.
  await db
    .update(mailOutbox)
    .set({ status: "FAILED", lastError: "This was interrupted while sending. Check the mailbox's Sent folder in your email account before sending it again.", updatedAt: now })
    .where(and(eq(mailOutbox.status, "SENDING"), lte(mailOutbox.updatedAt, new Date(nowMs - STUCK_AFTER_MS).toISOString()), scope));
  const due = await db
    .select({ id: mailOutbox.id, organizationId: mailOutbox.organizationId })
    .from(mailOutbox)
    .where(and(eq(mailOutbox.status, "SCHEDULED"), lte(mailOutbox.scheduledFor, now), scope))
    .orderBy(asc(mailOutbox.scheduledFor))
    .limit(opts.limit ?? 25);
  const may = new Map<string, boolean>();
  let sent = 0;
  let failed = 0;
  let waiting = 0;
  for (const d of due) {
    if (!may.has(d.organizationId)) may.set(d.organizationId, await orgMaySend(d.organizationId));
    if (!may.get(d.organizationId)) { waiting++; continue; }
    const r = await deliver(d.organizationId, d.id, null, nowMs);
    if (r.ok) sent++;
    else failed++;
  }
  return { sent, failed, waiting };
}

export const MAX_SEND_ATTEMPTS = MAX_ATTEMPTS;

// ---------------------------------------------------------------------------------------------------------------------
// What the Mail tab shows
// ---------------------------------------------------------------------------------------------------------------------

export type FolderCounts = { inbox: number; inboxUnread: number; sent: number; drafts: number; scheduled: number; failed: number };

export async function folderCounts(organizationId: string, mailboxId: string): Promise<FolderCounts> {
  const [m] = await db
    .select({
      inbox: sql<number>`coalesce(sum(case when ${mailMessages.direction} = 'IN' then 1 else 0 end), 0)`,
      unread: sql<number>`coalesce(sum(case when ${mailMessages.direction} = 'IN' and ${mailMessages.readAt} is null then 1 else 0 end), 0)`,
      sent: sql<number>`coalesce(sum(case when ${mailMessages.direction} = 'OUT' then 1 else 0 end), 0)`,
    })
    .from(mailMessages)
    .where(and(eq(mailMessages.organizationId, organizationId), eq(mailMessages.mailboxId, mailboxId)));
  const [o] = await db
    .select({
      drafts: sql<number>`coalesce(sum(case when ${mailOutbox.status} = 'DRAFT' then 1 else 0 end), 0)`,
      scheduled: sql<number>`coalesce(sum(case when ${mailOutbox.status} in ('SCHEDULED','SENDING') then 1 else 0 end), 0)`,
      failed: sql<number>`coalesce(sum(case when ${mailOutbox.status} = 'FAILED' then 1 else 0 end), 0)`,
    })
    .from(mailOutbox)
    .where(and(eq(mailOutbox.organizationId, organizationId), eq(mailOutbox.mailboxId, mailboxId)));
  return { inbox: Number(m?.inbox ?? 0), inboxUnread: Number(m?.unread ?? 0), sent: Number(m?.sent ?? 0), drafts: Number(o?.drafts ?? 0), scheduled: Number(o?.scheduled ?? 0), failed: Number(o?.failed ?? 0) };
}

export type ListRow = {
  kind: "message" | "outbox";
  id: string;
  subject: string;
  who: string;
  snippet: string;
  at: string;
  unread: boolean;
  hasFiles: boolean;
  status: string | null;
  zone: string | null;
  error: string | null;
  retrying: boolean;
  /** Inbox only: how many received emails are in this conversation. */
  count: number;
};

export const PAGE_SIZE = 30;
const cleanQ = (q: string | undefined) => (q ?? "").replace(/[%_\\]/g, " ").trim().slice(0, 80);

/** The Inbox: one line per conversation (its newest received email), unread if any of it is unread. */
async function listInbox(organizationId: string, mailboxId: string, q: string, page: number): Promise<{ rows: ListRow[]; total: number; page: number }> {
  const offset = (page - 1) * PAGE_SIZE;
  const needle = q ? `%${q}%` : null;
  const search = needle ? sql` and (subject like ${needle} or from_address like ${needle} or from_name like ${needle} or to_addresses like ${needle} or snippet like ${needle})` : sql``;
  const hit = sql`select * from mail_messages where organization_id = ${organizationId} and mailbox_id = ${mailboxId} and direction = 'IN'${search}`;
  const t = (await db.all(sql`select count(distinct coalesce(thread_key, id)) as n from (${hit})`)) as { n: number }[];
  const rows = (await db.all(sql`
    select id, subject, from_name, from_address, snippet, at, read_at, has_attachments, n, unread_n from (
      select *, row_number() over (partition by coalesce(thread_key, id) order by at desc, id desc) as rn,
        count(*) over (partition by coalesce(thread_key, id)) as n,
        sum(case when read_at is null then 1 else 0 end) over (partition by coalesce(thread_key, id)) as unread_n
      from (${hit})
    ) where rn = 1 order by at desc, id desc limit ${PAGE_SIZE} offset ${offset}`)) as { id: string; subject: string; from_name: string | null; from_address: string | null; snippet: string | null; at: string; has_attachments: number | boolean; n: number; unread_n: number }[];
  return {
    total: Number(t[0]?.n ?? 0),
    page,
    rows: rows.map((m) => ({
      kind: "message" as const, id: m.id, subject: m.subject, who: m.from_name || m.from_address || "", snippet: m.snippet ?? "", at: m.at,
      unread: Number(m.unread_n) > 0, hasFiles: !!Number(m.has_attachments), status: null, zone: null, error: null, retrying: false, count: Number(m.n),
    })),
  };
}

export async function listFolder(organizationId: string, mailboxId: string, folder: Folder, opts: { q?: string; page?: number } = {}): Promise<{ rows: ListRow[]; total: number; page: number }> {
  const q = cleanQ(opts.q);
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const offset = (page - 1) * PAGE_SIZE;
  if (folder === "inbox") return listInbox(organizationId, mailboxId, q, page);
  if (folder === "sent") {
    const dir = "OUT";
    const base = and(eq(mailMessages.organizationId, organizationId), eq(mailMessages.mailboxId, mailboxId), eq(mailMessages.direction, dir));
    const search = q ? or(like(mailMessages.subject, `%${q}%`), like(mailMessages.fromAddress, `%${q}%`), like(mailMessages.fromName, `%${q}%`), like(mailMessages.toAddresses, `%${q}%`), like(mailMessages.snippet, `%${q}%`)) : undefined;
    const where = search ? and(base, search) : base;
    const [t] = await db.select({ n: sql<number>`count(*)` }).from(mailMessages).where(where);
    const rows = await db.select().from(mailMessages).where(where).orderBy(desc(mailMessages.at)).limit(PAGE_SIZE).offset(offset);
    return {
      total: Number(t?.n ?? 0),
      page,
      rows: rows.map((m) => ({
        kind: "message" as const, id: m.id, subject: m.subject, who: `To: ${m.toAddresses ?? ""}`, snippet: m.snippet ?? "", at: m.at,
        unread: false, hasFiles: m.hasAttachments, status: null, zone: null, error: null, retrying: false, count: 1,
      })),
    };
  }
  const statuses = folder === "drafts" ? ["DRAFT"] : ["SCHEDULED", "SENDING", "FAILED"];
  const base = and(eq(mailOutbox.organizationId, organizationId), eq(mailOutbox.mailboxId, mailboxId), inArray(mailOutbox.status, statuses));
  const search = q ? or(like(mailOutbox.subject, `%${q}%`), like(mailOutbox.toAddresses, `%${q}%`), like(mailOutbox.bodyText, `%${q}%`)) : undefined;
  const where = search ? and(base, search) : base;
  const [t] = await db.select({ n: sql<number>`count(*)` }).from(mailOutbox).where(where);
  const rows = await db.select().from(mailOutbox).where(where).orderBy(folder === "drafts" ? desc(mailOutbox.updatedAt) : asc(mailOutbox.scheduledFor)).limit(PAGE_SIZE).offset(offset);
  const ids = rows.map((r) => r.id);
  const withFiles = new Set<string>();
  if (ids.length) {
    const f = await db.select({ outboxId: mailAttachments.outboxId }).from(mailAttachments).where(and(eq(mailAttachments.organizationId, organizationId), inArray(mailAttachments.outboxId, ids)));
    for (const x of f) if (x.outboxId) withFiles.add(x.outboxId);
  }
  return {
    total: Number(t?.n ?? 0),
    page,
    rows: rows.map((r) => ({
      kind: "outbox" as const, id: r.id, subject: r.subject, who: r.toAddresses ? `To: ${r.toAddresses}` : "(no one yet)", snippet: snippetOf(r.bodyText), at: (folder === "drafts" ? r.updatedAt : r.scheduledFor) || r.updatedAt,
      unread: false, hasFiles: withFiles.has(r.id), status: r.status, zone: r.scheduleZone, error: r.lastError, retrying: r.status === "SCHEDULED" && r.attempts > 0, count: 1,
    })),
  };
}

export async function getMessage(organizationId: string, mailboxId: string, id: string): Promise<{ msg: MessageRow; files: FileInfo[] } | null> {
  const [msg] = await db.select().from(mailMessages).where(and(eq(mailMessages.id, id), eq(mailMessages.organizationId, organizationId), eq(mailMessages.mailboxId, mailboxId))).limit(1);
  if (!msg) return null;
  return { msg, files: await filesOf(organizationId, { messageId: id }) };
}

export async function getOutboxItem(organizationId: string, mailboxId: string, id: string): Promise<{ item: OutboxRow; files: FileInfo[] } | null> {
  const [item] = await db.select().from(mailOutbox).where(and(eq(mailOutbox.id, id), eq(mailOutbox.organizationId, organizationId), eq(mailOutbox.mailboxId, mailboxId))).limit(1);
  if (!item) return null;
  return { item, files: await filesOf(organizationId, { outboxId: id }) };
}

/** A message by its id, only when it is in this company and the person may read its mailbox (the Mail pages' address carries just the message id). */
export async function openMessage(org: OrgCtx, dept: MailDept, id: string): Promise<{ box: MailboxView; msg: MessageRow; files: FileInfo[]; thread: ThreadItem[] } | null> {
  const [m] = await db.select().from(mailMessages).where(and(eq(mailMessages.id, id), eq(mailMessages.organizationId, org.organizationId))).limit(1);
  if (!m) return null;
  const g = await getMailbox(org, dept, m.mailboxId);
  if (!g || !g.view.rights.read) return null;
  return { box: g.view, msg: m, files: await filesOf(org.organizationId, { messageId: id }), thread: await threadOf(org.organizationId, m.mailboxId, m) };
}

export async function openOutbox(org: OrgCtx, dept: MailDept, id: string): Promise<{ box: MailboxView; item: OutboxRow; files: FileInfo[] } | null> {
  const [o] = await db.select().from(mailOutbox).where(and(eq(mailOutbox.id, id), eq(mailOutbox.organizationId, org.organizationId))).limit(1);
  if (!o) return null;
  const g = await getMailbox(org, dept, o.mailboxId);
  if (!g || !g.view.rights.read) return null;
  return { box: g.view, item: o, files: await filesOf(org.organizationId, { outboxId: id }) };
}

export type ThreadItem = { msg: MessageRow; files: FileInfo[] };

/** The whole conversation a received (or sent) email belongs to, oldest first: what we received and what we replied. */
export async function threadOf(organizationId: string, mailboxId: string, msg: MessageRow): Promise<ThreadItem[]> {
  if (!msg.threadKey) return [{ msg, files: await filesOf(organizationId, { messageId: msg.id }) }];
  const rows = await db.select().from(mailMessages).where(and(eq(mailMessages.organizationId, organizationId), eq(mailMessages.mailboxId, mailboxId), eq(mailMessages.threadKey, msg.threadKey))).orderBy(asc(mailMessages.at), asc(mailMessages.id)).limit(50);
  const out: ThreadItem[] = [];
  for (const m of rows) out.push({ msg: m, files: await filesOf(organizationId, { messageId: m.id }) });
  return out;
}

/** Opening a conversation marks everything received in it as read. */
export async function markMessageRead(org: OrgCtx, dept: MailDept, mailboxId: string, id: string): Promise<void> {
  if (org.viewAs) return;
  const g = await getMailbox(org, dept, mailboxId);
  if (!g || !g.view.rights.read) return;
  const [m] = await db.select({ threadKey: mailMessages.threadKey }).from(mailMessages).where(and(eq(mailMessages.id, id), eq(mailMessages.organizationId, org.organizationId), eq(mailMessages.mailboxId, mailboxId))).limit(1);
  if (!m) return;
  const same = m.threadKey ? or(eq(mailMessages.id, id), eq(mailMessages.threadKey, m.threadKey)) : eq(mailMessages.id, id);
  await db.update(mailMessages).set({ readAt: nowIso() }).where(and(same, eq(mailMessages.organizationId, org.organizationId), eq(mailMessages.mailboxId, mailboxId), eq(mailMessages.direction, "IN"), isNull(mailMessages.readAt)));
}

/** Puts a conversation back to unread so it stands out again. */
export async function markMessageUnread(org: OrgCtx, dept: MailDept, mailboxId: string, id: string): Promise<Result> {
  if (org.viewAs) return { ok: false, error: "Looking through View as company is read-only." };
  const g = await getMailbox(org, dept, mailboxId);
  if (!g || !g.view.rights.read) return { ok: false, error: "You can't open this mailbox." };
  const r = await db.update(mailMessages).set({ readAt: null }).where(and(eq(mailMessages.id, id), eq(mailMessages.organizationId, org.organizationId), eq(mailMessages.mailboxId, mailboxId), eq(mailMessages.direction, "IN")));
  return r.rowsAffected ? { ok: true } : { ok: false, error: "That email wasn't found." };
}

/** Marks everything in the Inbox as read. */
export async function markAllRead(org: OrgCtx, dept: MailDept, mailboxId: string): Promise<Result<{ n: number }>> {
  if (org.viewAs) return { ok: false, error: "Looking through View as company is read-only." };
  const g = await getMailbox(org, dept, mailboxId);
  if (!g || !g.view.rights.read) return { ok: false, error: "You can't open this mailbox." };
  const r = await db.update(mailMessages).set({ readAt: nowIso() }).where(and(eq(mailMessages.organizationId, org.organizationId), eq(mailMessages.mailboxId, mailboxId), eq(mailMessages.direction, "IN"), isNull(mailMessages.readAt)));
  return { ok: true, n: r.rowsAffected };
}

/** A file on a draft or a message, with its contents, only when the person may read that mailbox. */
export async function getAttachmentFor(org: OrgCtx, dept: MailDept, attachmentId: string): Promise<{ filename: string; contentType: string; data: Buffer } | null> {
  const [a] = await db.select().from(mailAttachments).where(and(eq(mailAttachments.id, attachmentId), eq(mailAttachments.organizationId, org.organizationId))).limit(1);
  if (!a) return null;
  const g = await getMailbox(org, dept, a.mailboxId);
  if (!g || !g.view.rights.read) return null;
  return { filename: a.filename, contentType: a.contentType || "application/octet-stream", data: Buffer.from(a.dataB64, "base64") };
}

/** How many unread messages a person has across the mailboxes they can read in a department (for the menu badge). */
export async function unreadFor(org: OrgCtx, dept: MailDept): Promise<number> {
  const boxes = await listMailboxes(org, dept);
  const ids = boxes.filter((b) => b.rights.read).map((b) => b.id);
  if (!ids.length) return 0;
  const [r] = await db.select({ n: sql<number>`count(*)` }).from(mailMessages).where(and(eq(mailMessages.organizationId, org.organizationId), inArray(mailMessages.mailboxId, ids), eq(mailMessages.direction, "IN"), isNull(mailMessages.readAt)));
  return Number(r?.n ?? 0);
}

/** The unread count for a department's Mail tab in the sidebar: `{ mail: n }`, or nothing while the rollout switch is off or nothing is unread. */
export async function mailBadges(org: OrgCtx, dept: MailDept): Promise<Record<string, number>> {
  if (!(await mailboxesOn(org.organizationId))) return {};
  const n = await unreadFor(org, dept);
  return n > 0 ? { mail: n } : {};
}

/** "Check connection": sends a short test email from the mailbox to the signed-in person's own address (nothing is stored). */
export async function sendMailboxTest(org: OrgCtx, dept: MailDept, id: string): Promise<Result<{ to: string }>> {
  const g = await getMailbox(org, dept, id);
  if (!g || !(g.view.rights.connect || g.view.rights.send)) return { ok: false, error: "You can't use this mailbox." };
  const { box } = g;
  if (!box.credentialEnc || !box.accountEmail || !box.provider) return { ok: false, error: "Connect the mailbox first." };
  if (box.status !== "ACTIVE") return { ok: false, error: RECONNECT_TEXT.replace("in Email Settings", "in Mailbox settings") };
  const [me] = await db.select({ email: users.email }).from(users).where(eq(users.id, org.userId)).limit(1);
  if (!me?.email) return { ok: false, error: "Your account has no email address to send the test to." };
  const text = `This is a test from the "${box.name}" mailbox in ${org.organizationName}. If you can read it, sending works.`;
  try {
    await sendWithCred({ provider: box.provider, accountEmail: box.accountEmail, credentialEnc: box.credentialEnc }, { to: me.email, subject: `Test email from ${box.name}`, text, html: bodyToHtml(text), fromName: org.organizationName }, async (enc) => {
      await db.update(mailboxes).set({ credentialEnc: enc }).where(and(eq(mailboxes.id, box.id), eq(mailboxes.organizationId, org.organizationId)));
    });
  } catch (e) {
    if (e instanceof NeedsReconnect) {
      await db.update(mailboxes).set({ status: "NEEDS_RECONNECT", lastError: e.message }).where(and(eq(mailboxes.id, box.id), eq(mailboxes.organizationId, org.organizationId)));
      return { ok: false, error: RECONNECT_TEXT.replace("in Email Settings", "in Mailbox settings") };
    }
    return { ok: false, error: e instanceof Error ? e.message : "The test email couldn't be sent." };
  }
  await db.update(mailboxes).set({ lastUsedAt: nowIso(), lastError: null }).where(and(eq(mailboxes.id, box.id), eq(mailboxes.organizationId, org.organizationId)));
  return { ok: true, to: me.email };
}
