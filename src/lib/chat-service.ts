// Chat: the company's internal messaging. Rooms are worked out from roles (Everyone, one per department) or from the two
// people in a private message, so nothing here stores a room. Everything is scoped to one company, and every read and write
// re-checks that the person may use the room. Files go to the same private store as Receiving photos.
import { and, asc, desc, eq, gte, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { chatAttachments, chatMessages, chatPresence, chatReads, memberships, users } from "@/db/schema";
import { newId } from "@/lib/ids";
import { ROLE_LABELS, isAdmin } from "@/lib/permissions";
import { storage } from "@/lib/receiving-storage";
import {
  EVERYONE,
  MAX_ATTACH_BYTES,
  MAX_MESSAGE,
  PAGE_SIZE,
  RATE_WINDOW_MS,
  SEEN_WRITE_MS,
  attachmentType,
  canUseRoom,
  cleanBody,
  cleanNote,
  displayName,
  dmKey,
  dmPartner,
  groupRoomsFor,
  isChatStatus,
  messageProblem,
  parseRoom,
  presenceOf,
  previewOf,
  rateLimited,
  safeFilename,
  type ChatMessageDto,
  type ChatPersonDto,
  type ChatStatus,
} from "@/lib/chat-rules";

export type Ctx = { organizationId: string; userId: string; role: string };
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export const FILES_NOT_CONNECTED = "Sending files isn't connected yet. An admin needs to connect the file storage in Vercel (the same one Receiving photos use). Messages work meanwhile.";

const iso = (nowMs: number) => new Date(nowMs).toISOString();

// ---------------------------------------------------------------------------
// People and status
// ---------------------------------------------------------------------------

/** Marks this person as seen just now (only writes when the last stamp is getting old). */
export async function touchPresence(ctx: Ctx, nowMs: number): Promise<void> {
  const [row] = await db
    .select({ id: chatPresence.id, lastSeenAt: chatPresence.lastSeenAt })
    .from(chatPresence)
    .where(and(eq(chatPresence.organizationId, ctx.organizationId), eq(chatPresence.userId, ctx.userId)))
    .limit(1);
  if (!row) {
    await db.insert(chatPresence).values({ id: newId("cpr"), organizationId: ctx.organizationId, userId: ctx.userId, status: "AVAILABLE", lastSeenAt: iso(nowMs) }).onConflictDoNothing();
    return;
  }
  const seen = row.lastSeenAt ? Date.parse(row.lastSeenAt) : NaN;
  if (!Number.isFinite(seen) || nowMs - seen >= SEEN_WRITE_MS) {
    await db.update(chatPresence).set({ lastSeenAt: iso(nowMs) }).where(eq(chatPresence.id, row.id));
  }
}

/** Everyone who works for the company (access switched on), with their status. */
export async function listPeople(ctx: Ctx, nowMs: number): Promise<ChatPersonDto[]> {
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: memberships.role,
      status: chatPresence.status,
      note: chatPresence.statusNote,
      lastSeenAt: chatPresence.lastSeenAt,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .leftJoin(chatPresence, and(eq(chatPresence.userId, memberships.userId), eq(chatPresence.organizationId, memberships.organizationId)))
    .where(and(eq(memberships.organizationId, ctx.organizationId), isNull(memberships.deactivatedAt)));
  return rows.map((r) => {
    const p = presenceOf(r.status as ChatStatus | null, r.lastSeenAt, nowMs);
    // A person who isn't in the app right now still shows the status they chose, but their note only matters if they set one.
    return { id: r.id, name: displayName(r.name, r.email), roleLabel: ROLE_LABELS[r.role as keyof typeof ROLE_LABELS] ?? r.role, state: p.state, active: p.active, note: r.note ?? null, isMe: r.id === ctx.userId };
  });
}

export async function setMyStatus(ctx: Ctx, status: unknown, note: unknown, nowMs: number): Promise<Result> {
  if (!isChatStatus(status)) return { ok: false, error: "Choose a status from the list." };
  const clean = cleanNote(note);
  const at = iso(nowMs);
  await touchPresence(ctx, nowMs);
  await db
    .update(chatPresence)
    .set({ status, statusNote: clean, statusSetAt: at, lastSeenAt: at })
    .where(and(eq(chatPresence.organizationId, ctx.organizationId), eq(chatPresence.userId, ctx.userId)));
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Rooms and access
// ---------------------------------------------------------------------------

/** Whether this person may use the room right now. A private message also needs the other person to work for the company. */
export async function roomAccess(ctx: Ctx, room: unknown): Promise<Result<{ room: string }>> {
  if (!canUseRoom(room, ctx.userId, ctx.role)) return { ok: false, error: "That chat isn't available to you." };
  const key = room as string;
  const partner = dmPartner(key, ctx.userId);
  if (partner) {
    const [m] = await db
      .select({ id: memberships.id })
      .from(memberships)
      .where(and(eq(memberships.organizationId, ctx.organizationId), eq(memberships.userId, partner), isNull(memberships.deactivatedAt)))
      .limit(1);
    if (!m) return { ok: false, error: "That person isn't in your company anymore." };
  }
  return { ok: true, room: key };
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

type MessageRow = typeof chatMessages.$inferSelect;

async function toDtos(ctx: Ctx, rows: MessageRow[]): Promise<ChatMessageDto[]> {
  if (rows.length === 0) return [];
  const senderIds = [...new Set(rows.map((r) => r.senderUserId))];
  const names = new Map<string, string>();
  for (const u of await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, senderIds))) names.set(u.id, displayName(u.name, u.email));
  const attIds = [...new Set(rows.map((r) => r.attachmentId).filter((x): x is string => !!x))];
  const atts = new Map<string, typeof chatAttachments.$inferSelect>();
  if (attIds.length) for (const a of await db.select().from(chatAttachments).where(and(eq(chatAttachments.organizationId, ctx.organizationId), inArray(chatAttachments.id, attIds)))) atts.set(a.id, a);
  return rows.map((r) => {
    const a = r.attachmentId && !r.deletedAt ? atts.get(r.attachmentId) : undefined;
    return {
      seq: r.seq,
      room: r.roomKey,
      senderId: r.senderUserId,
      senderName: names.get(r.senderUserId) ?? "Someone",
      body: r.deletedAt ? "" : r.body,
      createdAt: r.createdAt,
      changedAt: r.changedAt,
      edited: !!r.editedAt && !r.deletedAt,
      deleted: !!r.deletedAt,
      attachment: a ? { id: a.id, filename: a.filename, contentType: a.contentType, size: a.sizeBytes, isImage: a.contentType.startsWith("image/") } : null,
    };
  });
}

/**
 * Messages in a room. With nothing else: the latest page. `before`: the page before that message number (scrolling up).
 * `since`: everything created, edited or deleted at or after that moment (the live refresh).
 */
export async function fetchMessages(ctx: Ctx, input: { room: unknown; since?: string | null; before?: number | null; limit?: number }): Promise<Result<{ messages: ChatMessageDto[]; hasMore: boolean }>> {
  const access = await roomAccess(ctx, input.room);
  if (!access.ok) return access;
  const room = access.room;
  const scope = and(eq(chatMessages.organizationId, ctx.organizationId), eq(chatMessages.roomKey, room));
  const limit = Math.min(Math.max(Math.trunc(input.limit ?? PAGE_SIZE) || PAGE_SIZE, 1), 200);

  if (input.since) {
    const rows = await db.select().from(chatMessages).where(and(scope, gte(chatMessages.changedAt, input.since))).orderBy(asc(chatMessages.seq)).limit(200);
    return { ok: true, messages: await toDtos(ctx, rows), hasMore: false };
  }
  const rows = await db
    .select()
    .from(chatMessages)
    .where(input.before && Number.isFinite(input.before) ? and(scope, lt(chatMessages.seq, input.before)) : scope)
    .orderBy(desc(chatMessages.seq))
    .limit(limit + 1);
  const hasMore = rows.length > limit;
  return { ok: true, messages: await toDtos(ctx, rows.slice(0, limit).reverse()), hasMore };
}

export type SendInput = { room: unknown; body: unknown; file?: { name: string; bytes: Uint8Array } | null };

export async function sendMessage(ctx: Ctx, input: SendInput, nowMs: number): Promise<Result<{ message: ChatMessageDto }>> {
  const access = await roomAccess(ctx, input.room);
  if (!access.ok) return access;
  const room = access.room;
  const body = cleanBody(input.body);
  const problem = messageProblem(body, !!input.file);
  if (problem) return { ok: false, error: problem };

  const [recent] = await db
    .select({ n: sql<number>`count(*)` })
    .from(chatMessages)
    .where(and(eq(chatMessages.organizationId, ctx.organizationId), eq(chatMessages.senderUserId, ctx.userId), gte(chatMessages.createdAt, iso(nowMs - RATE_WINDOW_MS))));
  if (rateLimited(Number(recent?.n ?? 0))) return { ok: false, error: "You're sending messages very quickly. Wait a few seconds and try again." };

  let attachmentId: string | null = null;
  let storagePath: string | null = null;
  if (input.file) {
    if (!storage.configured()) return { ok: false, error: FILES_NOT_CONNECTED };
    if (input.file.bytes.length === 0) return { ok: false, error: "That file is empty." };
    if (input.file.bytes.length > MAX_ATTACH_BYTES) return { ok: false, error: "That file is over 4 MB. Choose a smaller one." };
    const filename = safeFilename(input.file.name);
    const type = attachmentType(filename, input.file.bytes);
    if (!type) return { ok: false, error: "That kind of file can't be sent. Use a photo, PDF, text, CSV, Word or Excel file." };
    attachmentId = newId("cat");
    storagePath = `chat/${ctx.organizationId}/${attachmentId}-${filename.replace(/ /g, "_")}`;
    try {
      await storage.save(storagePath, input.file.bytes, type.mime);
    } catch {
      return { ok: false, error: "The file couldn't be saved to storage. Try again." };
    }
    try {
      await db.insert(chatAttachments).values({ id: attachmentId, organizationId: ctx.organizationId, roomKey: room, uploadedByUserId: ctx.userId, filename, contentType: type.mime, sizeBytes: input.file.bytes.length, storagePath, createdAt: iso(nowMs) });
    } catch {
      await storage.remove(storagePath).catch(() => {});
      return { ok: false, error: "The file couldn't be saved. Try again." };
    }
  }

  const at = iso(nowMs);
  const r = parseRoom(room);
  const recipient = r && r.kind === "dm" ? (r.a === ctx.userId ? r.b : r.a) : null;
  let row: MessageRow;
  try {
    [row] = await db
      .insert(chatMessages)
      .values({ organizationId: ctx.organizationId, roomKey: room, senderUserId: ctx.userId, recipientUserId: recipient, body, attachmentId, createdAt: at, changedAt: at })
      .returning();
  } catch {
    if (attachmentId && storagePath) {
      await storage.remove(storagePath).catch(() => {});
      await db.delete(chatAttachments).where(eq(chatAttachments.id, attachmentId)).catch(() => {});
    }
    return { ok: false, error: "The message couldn't be sent. Try again." };
  }
  await markRead(ctx, room, row.seq);
  await touchPresence(ctx, nowMs);
  const [dto] = await toDtos(ctx, [row]);
  return { ok: true, message: dto };
}

async function ownMessage(ctx: Ctx, seq: unknown): Promise<MessageRow | null> {
  const n = Number(seq);
  if (!Number.isInteger(n) || n < 1) return null;
  const [row] = await db.select().from(chatMessages).where(and(eq(chatMessages.organizationId, ctx.organizationId), eq(chatMessages.seq, n))).limit(1);
  return row ?? null;
}

export async function editMessage(ctx: Ctx, seq: unknown, rawBody: unknown, nowMs: number): Promise<Result<{ message: ChatMessageDto }>> {
  const row = await ownMessage(ctx, seq);
  if (!row || row.senderUserId !== ctx.userId) return { ok: false, error: "You can only edit your own messages." };
  if (row.deletedAt) return { ok: false, error: "That message was deleted." };
  const access = await roomAccess(ctx, row.roomKey);
  if (!access.ok) return access;
  const body = cleanBody(rawBody);
  const problem = messageProblem(body, !!row.attachmentId);
  if (problem) return { ok: false, error: problem };
  if (body === row.body) return { ok: true, message: (await toDtos(ctx, [row]))[0] };
  const at = iso(nowMs);
  const [updated] = await db.update(chatMessages).set({ body, editedAt: at, changedAt: at }).where(eq(chatMessages.seq, row.seq)).returning();
  return { ok: true, message: (await toDtos(ctx, [updated]))[0] };
}

/** Your own message, or (for Admin and the Owner) anyone's message in a group room. Private messages can only be deleted by their writer. */
export async function deleteMessage(ctx: Ctx, seq: unknown, nowMs: number): Promise<Result<{ message: ChatMessageDto }>> {
  const row = await ownMessage(ctx, seq);
  if (!row) return { ok: false, error: "That message wasn't found." };
  const isDm = !!parseRoom(row.roomKey) && parseRoom(row.roomKey)!.kind === "dm";
  const mine = row.senderUserId === ctx.userId;
  if (!mine && !(isAdmin(ctx.role) && !isDm)) return { ok: false, error: "You can only delete your own messages." };
  const access = await roomAccess(ctx, row.roomKey);
  if (!access.ok) return access;
  if (row.deletedAt) return { ok: true, message: (await toDtos(ctx, [row]))[0] };
  const at = iso(nowMs);
  const [updated] = await db
    .update(chatMessages)
    .set({ body: "", deletedAt: at, deletedByUserId: ctx.userId, changedAt: at })
    .where(eq(chatMessages.seq, row.seq))
    .returning();
  if (row.attachmentId) {
    const [a] = await db.select().from(chatAttachments).where(and(eq(chatAttachments.organizationId, ctx.organizationId), eq(chatAttachments.id, row.attachmentId))).limit(1);
    if (a) {
      await storage.remove(a.storagePath).catch(() => {});
      await db.delete(chatAttachments).where(eq(chatAttachments.id, a.id));
    }
  }
  return { ok: true, message: (await toDtos(ctx, [updated]))[0] };
}

// ---------------------------------------------------------------------------
// Reading and unread
// ---------------------------------------------------------------------------

/** Remembers how far this person has read in a room (only ever moves forward). */
export async function markRead(ctx: Ctx, room: string, upToSeq: number): Promise<void> {
  await db
    .insert(chatReads)
    .values({ id: newId("crd"), organizationId: ctx.organizationId, userId: ctx.userId, roomKey: room, lastReadSeq: upToSeq })
    .onConflictDoUpdate({
      target: [chatReads.organizationId, chatReads.userId, chatReads.roomKey],
      set: { lastReadSeq: sql`max(${chatReads.lastReadSeq}, ${upToSeq})` },
    });
}

export async function latestSeq(ctx: Ctx, room: string): Promise<number> {
  const [r] = await db
    .select({ m: sql<number | null>`max(${chatMessages.seq})` })
    .from(chatMessages)
    .where(and(eq(chatMessages.organizationId, ctx.organizationId), eq(chatMessages.roomKey, room)));
  return Number(r?.m ?? 0);
}

function unreadWhere(ctx: Ctx) {
  const groupKeys = groupRoomsFor(ctx.role).map((r) => r.key);
  return and(
    eq(chatMessages.organizationId, ctx.organizationId),
    ne(chatMessages.senderUserId, ctx.userId),
    isNull(chatMessages.deletedAt),
    sql`${chatMessages.seq} > coalesce(${chatReads.lastReadSeq}, 0)`,
    or(inArray(chatMessages.roomKey, groupKeys), eq(chatMessages.recipientUserId, ctx.userId)),
  );
}

/** How many unread messages in each room this person can use (their own messages never count). */
export async function unreadByRoom(ctx: Ctx): Promise<Record<string, number>> {
  const rows = await db
    .select({ room: chatMessages.roomKey, n: sql<number>`count(*)` })
    .from(chatMessages)
    .leftJoin(chatReads, and(eq(chatReads.organizationId, chatMessages.organizationId), eq(chatReads.userId, ctx.userId), eq(chatReads.roomKey, chatMessages.roomKey)))
    .where(unreadWhere(ctx))
    .groupBy(chatMessages.roomKey);
  const out: Record<string, number> = {};
  for (const r of rows) out[r.room] = Number(r.n);
  return out;
}

/** The newest unread message, for the alert ("Ana in Accounts: ..."). */
async function newestUnread(ctx: Ctx): Promise<{ seq: number; room: string; from: string; preview: string } | null> {
  const [row] = await db
    .select({ m: chatMessages })
    .from(chatMessages)
    .leftJoin(chatReads, and(eq(chatReads.organizationId, chatMessages.organizationId), eq(chatReads.userId, ctx.userId), eq(chatReads.roomKey, chatMessages.roomKey)))
    .where(unreadWhere(ctx))
    .orderBy(desc(chatMessages.seq))
    .limit(1);
  if (!row) return null;
  const [dto] = await toDtos(ctx, [row.m]);
  return { seq: dto.seq, room: dto.room, from: dto.senderName, preview: previewOf(dto) };
}

/** What the top bar needs on every page: unread counts and the newest unread message. Also counts as "seen". */
export async function summary(ctx: Ctx, nowMs: number): Promise<{ unread: Record<string, number>; total: number; latest: { seq: number; room: string; from: string; preview: string } | null }> {
  await touchPresence(ctx, nowMs);
  const unread = await unreadByRoom(ctx);
  const total = Object.values(unread).reduce((s, n) => s + n, 0);
  return { unread, total, latest: total > 0 ? await newestUnread(ctx) : null };
}

/** One live refresh of an open chat: new and changed messages, who is around, and the unread counts (this room counts as read). */
export async function pollRoom(ctx: Ctx, input: { room: unknown; since?: string | null; visible: boolean }, nowMs: number) {
  const msgs = await fetchMessages(ctx, { room: input.room, since: input.since ?? null });
  if (!msgs.ok) return msgs;
  await touchPresence(ctx, nowMs);
  if (input.visible) await markRead(ctx, input.room as string, await latestSeq(ctx, input.room as string));
  const [unread, people] = await Promise.all([unreadByRoom(ctx), listPeople(ctx, nowMs)]);
  const total = Object.values(unread).reduce((s, n) => s + n, 0);
  return { ok: true as const, messages: msgs.messages, people, unread, total, latest: total > 0 ? await newestUnread(ctx) : null };
}

export async function attachmentForViewer(ctx: Ctx, id: string) {
  const [a] = await db.select().from(chatAttachments).where(and(eq(chatAttachments.organizationId, ctx.organizationId), eq(chatAttachments.id, id))).limit(1);
  if (!a) return null;
  const access = await roomAccess(ctx, a.roomKey);
  return access.ok ? a : null;
}

export { EVERYONE, MAX_MESSAGE, dmKey };
