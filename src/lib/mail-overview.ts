// The platform owner's overall inbox: what came into and went out of the PLATFORM'S OWN company's department mailboxes, read only.
// It is built around one company id that the page takes from the signed-in owner's own session (never from the address), only
// shared department mailboxes are included (a person's personal mailbox stays theirs alone), and nothing here changes anything.
// Another company's mail can't be reached: every query starts from that one organizationId.

import { and, desc, eq, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { mailAttachments, mailboxes, mailMessages } from "@/db/schema";
import { isMailDept, MAX_SUBJECT, type MailDept } from "@/lib/mail-rules";

export const OVERVIEW_PAGE = 30;

export type OverviewFilter = { dept: MailDept | "all"; dir: "all" | "IN" | "OUT"; q: string; page: number };

export function parseOverviewFilter(sp: { dept?: string; dir?: string; q?: string; page?: string }): OverviewFilter {
  return {
    dept: isMailDept(sp.dept) ? sp.dept : "all",
    dir: sp.dir === "IN" || sp.dir === "OUT" ? sp.dir : "all",
    q: String(sp.q ?? "").trim().slice(0, 80),
    page: Math.max(1, Math.min(500, Math.floor(Number(sp.page)) || 1)),
  };
}

export type OverviewRow = {
  id: string;
  dept: MailDept;
  boxName: string;
  direction: "IN" | "OUT";
  who: string;
  subject: string;
  snippet: string;
  at: string;
  source: string;
  hasFiles: boolean;
};

const likeEsc = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

function scope(organizationId: string, f: OverviewFilter): SQL {
  const parts: SQL[] = [eq(mailMessages.organizationId, organizationId), eq(mailboxes.organizationId, organizationId), eq(mailboxes.kind, "SHARED")];
  if (f.dept !== "all") parts.push(eq(mailboxes.department, f.dept));
  if (f.dir !== "all") parts.push(eq(mailMessages.direction, f.dir));
  if (f.q) {
    const pat = `%${likeEsc(f.q)}%`;
    parts.push(or(sql`${mailMessages.subject} like ${pat} escape '\\'`, sql`${mailMessages.fromAddress} like ${pat} escape '\\'`, sql`${mailMessages.toAddresses} like ${pat} escape '\\'`, sql`${mailMessages.fromName} like ${pat} escape '\\'`)!);
  }
  return and(...parts)!;
}

export async function overviewList(organizationId: string, f: OverviewFilter): Promise<{ rows: OverviewRow[]; total: number }> {
  const where = scope(organizationId, f);
  const [t] = await db.select({ n: sql<number>`count(*)` }).from(mailMessages).innerJoin(mailboxes, eq(mailboxes.id, mailMessages.mailboxId)).where(where);
  const rows = await db
    .select({ m: mailMessages, dept: mailboxes.department, boxName: mailboxes.name })
    .from(mailMessages)
    .innerJoin(mailboxes, eq(mailboxes.id, mailMessages.mailboxId))
    .where(where)
    .orderBy(desc(mailMessages.at), desc(mailMessages.id))
    .limit(OVERVIEW_PAGE)
    .offset((f.page - 1) * OVERVIEW_PAGE);
  return {
    total: Number(t?.n ?? 0),
    rows: rows.map((r) => ({
      id: r.m.id,
      dept: isMailDept(r.dept) ? r.dept : "sales",
      boxName: r.boxName,
      direction: r.m.direction === "OUT" ? "OUT" : "IN",
      who: r.m.direction === "OUT" ? `To ${r.m.toAddresses ?? ""}` : r.m.fromName || r.m.fromAddress || "(unknown)",
      subject: (r.m.subject || "(no subject)").slice(0, MAX_SUBJECT),
      snippet: r.m.snippet ?? "",
      at: r.m.at,
      source: r.m.source,
      hasFiles: r.m.hasAttachments,
    })),
  };
}

/** Per department: how many came in and how many went out (all time), for the summary line. */
export async function overviewCounts(organizationId: string): Promise<Record<string, { in: number; out: number }>> {
  const rows = await db
    .select({ dept: mailboxes.department, dir: mailMessages.direction, n: sql<number>`count(*)` })
    .from(mailMessages)
    .innerJoin(mailboxes, eq(mailboxes.id, mailMessages.mailboxId))
    .where(and(eq(mailMessages.organizationId, organizationId), eq(mailboxes.organizationId, organizationId), eq(mailboxes.kind, "SHARED")))
    .groupBy(mailboxes.department, mailMessages.direction);
  const out: Record<string, { in: number; out: number }> = {};
  for (const r of rows) {
    const c = (out[r.dept] ??= { in: 0, out: 0 });
    if (r.dir === "OUT") c.out = Number(r.n);
    else c.in = Number(r.n);
  }
  return out;
}

export type OverviewMessage = {
  id: string;
  dept: MailDept;
  boxName: string;
  boxEmail: string | null;
  direction: "IN" | "OUT";
  fromName: string | null;
  fromAddress: string | null;
  to: string | null;
  cc: string | null;
  subject: string;
  body: string;
  at: string;
  source: string;
  sentByName: string | null;
  files: { filename: string; bytes: number }[];
};

/** One message, only when it is in a shared mailbox of this company. */
export async function overviewMessage(organizationId: string, id: string): Promise<OverviewMessage | null> {
  if (!id) return null;
  const [r] = await db
    .select({ m: mailMessages, dept: mailboxes.department, boxName: mailboxes.name, boxEmail: mailboxes.accountEmail })
    .from(mailMessages)
    .innerJoin(mailboxes, eq(mailboxes.id, mailMessages.mailboxId))
    .where(and(eq(mailMessages.id, id), eq(mailMessages.organizationId, organizationId), eq(mailboxes.organizationId, organizationId), eq(mailboxes.kind, "SHARED")))
    .limit(1);
  if (!r) return null;
  const files = await db.select({ filename: mailAttachments.filename, bytes: mailAttachments.bytes }).from(mailAttachments).where(and(eq(mailAttachments.messageId, id), eq(mailAttachments.organizationId, organizationId)));
  return {
    id: r.m.id,
    dept: isMailDept(r.dept) ? r.dept : "sales",
    boxName: r.boxName,
    boxEmail: r.boxEmail,
    direction: r.m.direction === "OUT" ? "OUT" : "IN",
    fromName: r.m.fromName,
    fromAddress: r.m.fromAddress,
    to: r.m.toAddresses,
    cc: r.m.ccAddresses,
    subject: r.m.subject || "(no subject)",
    body: r.m.bodyText ?? "",
    at: r.m.at,
    source: r.m.source,
    sentByName: r.m.sentByName,
    files,
  };
}
