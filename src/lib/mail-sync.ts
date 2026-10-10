// Bringing a mailbox's incoming mail into its Inbox. Gmail and Microsoft are read with the company's own saved permission ("read
// my email"), never the platform's. Incoming mail is saved as plain text (see mail-parse.ts) and is never changed or removed in the
// company's real mailbox; we only read. Everything is scoped by the company, and a page view never calls this: the Refresh button,
// the Mail tab while it is open, and the daily background check do.

import { and, asc, eq, inArray, isNull, lte, or } from "drizzle-orm";
import { db } from "@/db/client";
import { mailAttachments, mailboxes, mailMessages } from "@/db/schema";
import { accessTokenFor, graphBase, googleMailApi, microsoftReadScopes, NeedsReconnect, RECONNECT_TEXT } from "@/lib/email-connector";
import { blockedFile, safeFileName, snippetOf } from "@/lib/mail-rules";
import { MAX_IN_BYTES, MAX_IN_FILES, parseGmailMessage, parseGraphMessage, type GmailMessage, type GraphMessage, type InAttachment, type ParsedMail } from "@/lib/mail-parse";
import { orgMaySend, type MailboxRow } from "@/lib/mailbox-service";

const nowIso = () => new Date().toISOString();
const newId = (p: string) => `${p}_${crypto.randomUUID().replace(/-/g, "")}`;

/** On the first check we bring in the last 30 days. */
export const FIRST_SYNC_DAYS = 30;
/** After a check we look back a little further than the last one, so a message that arrived while we were checking is never missed. */
const OVERLAP_MS = 10 * 60 * 1000;
/** New emails saved per check; if there are more, the next check carries on (nothing is skipped). */
export const MAX_NEW_PER_RUN = 40;
const MAX_LISTED = 2000;
/** The shortest gap between two checks of one mailbox: by the Refresh button, and by the automatic checks. */
export const MANUAL_GAP_MS = 8_000;
export const AUTO_GAP_MS = 50_000;

class ReadNotAllowed extends Error {}
class Slow extends Error {}

export type SyncResult = { ok: true; added: number; skipped?: "throttled" | "not_readable" } | { ok: false; error: string };

async function getJson<T>(url: string, token: string, extra: Record<string, string> = {}): Promise<T> {
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}`, accept: "application/json", ...extra } });
  if (res.status === 401) throw new NeedsReconnect("The provider refused the saved permission.");
  if (res.status === 403) {
    const detail = await res.text().catch(() => "");
    if (/rateLimit|quota|too many/i.test(detail)) throw new Slow("The email provider asked us to slow down. It will be tried again shortly.");
    throw new ReadNotAllowed("The provider says reading this mailbox isn't allowed.");
  }
  if (res.status === 429) throw new Slow("The email provider asked us to slow down. It will be tried again shortly.");
  if (!res.ok) throw new Error("The email provider couldn't be reached. It will be tried again shortly.");
  return (await res.json()) as T;
}

type Fetched = { parsed: ParsedMail; files: InAttachment[] };

// ----- Gmail ---------------------------------------------------------------------------------------------------------

async function listGmail(token: string, afterMs: number, isSeen: (ids: string[]) => Promise<Set<string>>): Promise<{ newest: string[]; truncated: boolean }> {
  const api = googleMailApi();
  const q = encodeURIComponent(`in:inbox after:${Math.floor(afterMs / 1000)}`);
  const unseen: string[] = [];
  let pageToken = "";
  let listed = 0;
  for (;;) {
    const j = await getJson<{ messages?: { id: string }[]; nextPageToken?: string }>(`${api}/messages?q=${q}&maxResults=100${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`, token);
    const ids = (j.messages ?? []).map((m) => m.id);
    listed += ids.length;
    const seen = await isSeen(ids);
    for (const id of ids) if (!seen.has(id)) unseen.push(id);
    if (!j.nextPageToken) return { newest: unseen, truncated: false };
    if (listed >= MAX_LISTED) return { newest: unseen, truncated: true };
    pageToken = j.nextPageToken;
  }
}

async function fetchGmail(token: string, id: string): Promise<Fetched | null> {
  const api = googleMailApi();
  const m = await getJson<GmailMessage>(`${api}/messages/${encodeURIComponent(id)}?format=full`, token);
  const parsed = parseGmailMessage(m);
  return parsed ? { parsed, files: parsed.files } : null;
}

async function gmailFile(token: string, msgId: string, f: InAttachment): Promise<Buffer | null> {
  if (!f.id) return null;
  const j = await getJson<{ data?: string }>(`${googleMailApi()}/messages/${encodeURIComponent(msgId)}/attachments/${encodeURIComponent(f.id)}`, token);
  return j.data ? Buffer.from(j.data, "base64url") : null;
}

// ----- Microsoft -----------------------------------------------------------------------------------------------------

const GRAPH_SELECT = "id,conversationId,internetMessageId,subject,from,toRecipients,ccRecipients,receivedDateTime,body,bodyPreview,hasAttachments,isRead";

async function listGraph(token: string, afterIso: string, isSeen: (ids: string[]) => Promise<Set<string>>): Promise<{ messages: GraphMessage[]; truncated: boolean }> {
  const first = `${graphBase()}/me/mailFolders/inbox/messages?$filter=${encodeURIComponent(`receivedDateTime ge ${afterIso}`)}&$orderby=${encodeURIComponent("receivedDateTime desc")}&$top=50&$select=${GRAPH_SELECT}`;
  let url: string | null = first;
  const out: GraphMessage[] = [];
  let listed = 0;
  while (url) {
    // Microsoft hands back the text of the email (not the HTML) when asked.
    const j: { value?: GraphMessage[]; "@odata.nextLink"?: string } = await getJson(url, token, { prefer: 'outlook.body-content-type="text"' });
    const page = j.value ?? [];
    listed += page.length;
    const seen = await isSeen(page.map((m) => m.id));
    for (const m of page) if (!seen.has(m.id)) out.push(m);
    url = j["@odata.nextLink"] ?? null;
    if (url && listed >= MAX_LISTED) return { messages: out, truncated: true };
  }
  return { messages: out, truncated: false };
}

type GraphFile = { "@odata.type"?: string; id: string; name?: string; contentType?: string; size?: number; isInline?: boolean; contentBytes?: string };
async function graphFiles(token: string, msgId: string): Promise<{ files: InAttachment[]; data: Map<string, Buffer> }> {
  const j = await getJson<{ value?: GraphFile[] }>(`${graphBase()}/me/messages/${encodeURIComponent(msgId)}/attachments`, token);
  const files: InAttachment[] = [];
  const data = new Map<string, Buffer>();
  for (const a of j.value ?? []) {
    if (a["@odata.type"] && !/fileAttachment/i.test(a["@odata.type"])) continue;
    if (a.isInline) continue;
    files.push({ id: a.id, filename: a.name || "attachment", contentType: a.contentType ?? null, size: a.size ?? 0, inline: false });
    if (a.contentBytes) data.set(a.id, Buffer.from(a.contentBytes, "base64"));
  }
  return { files, data };
}

// ----- Saving ----------------------------------------------------------------------------------------------------------

/** Keeps the files we are willing to store (not executables, within the count and size limits) and notes the rest in the text. */
function chooseFiles(files: InAttachment[]): { keep: InAttachment[]; notes: string[] } {
  const keep: InAttachment[] = [];
  const notes: string[] = [];
  let bytes = 0;
  for (const f of files) {
    const name = safeFileName(f.filename);
    if (blockedFile(name)) notes.push(`${name} (a program file, not saved for safety)`);
    else if (keep.length >= MAX_IN_FILES) notes.push(`${name} (too many files on one email)`);
    else if (f.size > MAX_IN_BYTES || bytes + f.size > MAX_IN_BYTES) notes.push(`${name} (too large to save here)`);
    else { keep.push(f); bytes += f.size; }
  }
  return { keep, notes };
}

async function saveMessage(organizationId: string, box: MailboxRow, p: ParsedMail, files: { f: InAttachment; data: Buffer }[], notes: string[]): Promise<boolean> {
  const id = newId("mmsg");
  const stamp = nowIso();
  const text = notes.length ? `${p.bodyText}\n\n[Files on this email that are not saved here: ${notes.join("; ")}. Open the original in your email account to get them.]`.trim() : p.bodyText;
  const ins = await db
    .insert(mailMessages)
    .values({
      id, organizationId, mailboxId: box.id, direction: "IN", providerMessageId: p.providerId, threadKey: p.threadKey, rfcMessageId: p.rfcMessageId,
      fromName: p.fromName, fromAddress: p.fromAddress, toAddresses: p.to, ccAddresses: p.cc || null, subject: p.subject, snippet: snippetOf(text), bodyText: text,
      hasAttachments: p.hasFiles, at: p.at, readAt: p.unread ? null : stamp, source: "SYNC",
    })
    .onConflictDoNothing();
  if (!ins.rowsAffected) return false;
  for (const { f, data } of files) {
    await db.insert(mailAttachments).values({ id: newId("matt"), organizationId, mailboxId: box.id, messageId: id, filename: safeFileName(f.filename), contentType: f.contentType, bytes: data.length, dataB64: data.toString("base64") });
  }
  return true;
}

// ----- One mailbox -----------------------------------------------------------------------------------------------------

/**
 * Checks one mailbox for new mail and saves it. `minGapMs` keeps two people (or a person and the background check) from asking the
 * provider at the same moment. A mailbox that can't be read, or isn't connected, is skipped without an error.
 */
export async function syncMailbox(organizationId: string, mailboxId: string, opts: { minGapMs?: number; nowMs?: number } = {}): Promise<SyncResult> {
  const nowMs = opts.nowMs ?? Date.now();
  const [box] = await db.select().from(mailboxes).where(and(eq(mailboxes.id, mailboxId), eq(mailboxes.organizationId, organizationId))).limit(1);
  if (!box) return { ok: false, error: "That mailbox wasn't found." };
  if (box.hiddenAt || box.status !== "ACTIVE" || !box.canRead || !box.credentialEnc || !box.accountEmail || (box.provider !== "GOOGLE" && box.provider !== "MICROSOFT")) return { ok: true, added: 0, skipped: "not_readable" };

  // Claim the check: only one asker per gap gets to talk to the provider.
  const gap = opts.minGapMs ?? AUTO_GAP_MS;
  const claim = await db
    .update(mailboxes)
    .set({ lastSyncAt: new Date(nowMs).toISOString() })
    .where(and(eq(mailboxes.id, box.id), eq(mailboxes.organizationId, organizationId), or(isNull(mailboxes.lastSyncAt), lte(mailboxes.lastSyncAt, new Date(nowMs - gap).toISOString()))));
  if (!claim.rowsAffected) return { ok: true, added: 0, skipped: "throttled" };

  const setBox = (v: Partial<MailboxRow>) => db.update(mailboxes).set(v).where(and(eq(mailboxes.id, box.id), eq(mailboxes.organizationId, organizationId)));
  const isSeen = async (ids: string[]) => {
    const seen = new Set<string>();
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      const rows = await db.select({ p: mailMessages.providerMessageId }).from(mailMessages).where(and(eq(mailMessages.mailboxId, box.id), eq(mailMessages.organizationId, organizationId), inArray(mailMessages.providerMessageId, chunk)));
      for (const r of rows) if (r.p) seen.add(r.p);
    }
    return seen;
  };

  try {
    const cred = { provider: box.provider, accountEmail: box.accountEmail, credentialEnc: box.credentialEnc };
    const persist = async (enc: string) => { await setBox({ credentialEnc: enc }); };
    const token = await accessTokenFor(cred, persist, box.provider === "MICROSOFT" ? microsoftReadScopes() : undefined);
    const afterMs = box.syncCursor && !Number.isNaN(Date.parse(box.syncCursor)) ? Date.parse(box.syncCursor) : nowMs - FIRST_SYNC_DAYS * 24 * 3600 * 1000;
    let added = 0;
    let more = false;

    if (box.provider === "GOOGLE") {
      const { newest, truncated } = await listGmail(token, afterMs, isSeen);
      more = newest.length > MAX_NEW_PER_RUN || truncated;
      for (const id of newest.slice(0, MAX_NEW_PER_RUN)) {
        const f = await fetchGmail(token, id);
        if (!f) continue;
        const { keep, notes } = chooseFiles(f.files);
        const data: { f: InAttachment; data: Buffer }[] = [];
        for (const file of keep) {
          const bytes = await gmailFile(token, id, file);
          if (bytes && bytes.length <= MAX_IN_BYTES) data.push({ f: file, data: bytes });
          else notes.push(`${safeFileName(file.filename)} (couldn't be fetched)`);
        }
        if (await saveMessage(organizationId, box, f.parsed, data, notes)) added++;
      }
    } else {
      const { messages, truncated } = await listGraph(token, new Date(afterMs).toISOString(), isSeen);
      more = messages.length > MAX_NEW_PER_RUN || truncated;
      for (const m of messages.slice(0, MAX_NEW_PER_RUN)) {
        const parsed = parseGraphMessage(m);
        if (!parsed) continue;
        let data: { f: InAttachment; data: Buffer }[] = [];
        let notes: string[] = [];
        if (parsed.hasFiles) {
          const g = await graphFiles(token, m.id);
          const c = chooseFiles(g.files);
          notes = c.notes;
          data = c.keep.flatMap((file) => { const b = g.data.get(file.id); return b ? [{ f: file, data: b }] : []; });
        }
        if (await saveMessage(organizationId, box, parsed, data, notes)) added++;
      }
    }

    // Move the bookmark forward only when everything found has been saved.
    await setBox({ lastSyncError: null, ...(more ? {} : { syncCursor: new Date(nowMs - OVERLAP_MS).toISOString() }) });
    return { ok: true, added };
  } catch (e) {
    if (e instanceof NeedsReconnect) {
      await setBox({ status: "NEEDS_RECONNECT", lastError: e.message, lastSyncError: RECONNECT_TEXT.replace("in Email Settings", "in Mailbox settings") });
      return { ok: false, error: RECONNECT_TEXT.replace("in Email Settings", "in Mailbox settings") };
    }
    if (e instanceof ReadNotAllowed) {
      const msg = "Reading this mailbox isn't allowed on the connected account. Reconnect it and tick the permission to read email, or keep using it for sending only.";
      await setBox({ canRead: false, lastSyncError: msg });
      return { ok: false, error: msg };
    }
    const msg = e instanceof Slow ? e.message : "The Inbox couldn't be checked just now. It will try again.";
    await setBox({ lastSyncError: msg });
    console.error("[mail-sync] failed:", e instanceof Error ? e.message : e);
    return { ok: false, error: msg };
  }
}

/**
 * Checks the mailboxes of one company, or of every company, that are due: connected, readable, not hidden, least recently checked
 * first. Used by the daily background check (all companies, only those allowed to run) and by the open Mail tab (one department's
 * mailboxes the person can read).
 */
export async function syncDue(opts: { organizationId?: string; mailboxIds?: string[]; limit?: number; minGapMs?: number; nowMs?: number } = {}): Promise<{ checked: number; added: number; failed: number }> {
  const nowMs = opts.nowMs ?? Date.now();
  const gap = opts.minGapMs ?? AUTO_GAP_MS;
  const rows = await db
    .select({ id: mailboxes.id, organizationId: mailboxes.organizationId })
    .from(mailboxes)
    .where(
      and(
        eq(mailboxes.status, "ACTIVE"),
        eq(mailboxes.canRead, true),
        isNull(mailboxes.hiddenAt),
        inArray(mailboxes.provider, ["GOOGLE", "MICROSOFT"]),
        or(isNull(mailboxes.lastSyncAt), lte(mailboxes.lastSyncAt, new Date(nowMs - gap).toISOString())),
        opts.organizationId ? eq(mailboxes.organizationId, opts.organizationId) : undefined,
        opts.mailboxIds ? (opts.mailboxIds.length ? inArray(mailboxes.id, opts.mailboxIds) : eq(mailboxes.id, "-")) : undefined,
      ),
    )
    .orderBy(asc(mailboxes.lastSyncAt))
    .limit(opts.limit ?? 10);
  const may = new Map<string, boolean>();
  let checked = 0;
  let added = 0;
  let failed = 0;
  for (const r of rows) {
    if (!may.has(r.organizationId)) may.set(r.organizationId, await orgMaySend(r.organizationId));
    if (!may.get(r.organizationId)) continue;
    const res = await syncMailbox(r.organizationId, r.id, { minGapMs: gap, nowMs });
    if (!res.ok) failed++;
    else if (!res.skipped) { checked++; added += res.added; }
  }
  return { checked, added, failed };
}
