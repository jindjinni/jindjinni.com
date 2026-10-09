// The support center's database work. Two sides:
//  - the COMPANY side (a company's own Support page): every function takes the signed-in person's CurrentOrg and only ever
//    touches that company's tickets; a member sees only their own tickets, an owner/admin sees all of the company's.
//  - the PLATFORM side (Settings -> Support, platform owner only): the callers check isPlatformAdmin first.
// Internal notes (authorKind "note") are never returned to the company side.

import { and, asc, desc, eq, isNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import {
  businessProfiles,
  memberships,
  organizations,
  supportMessages,
  supportTickets,
  supportViewSessions,
  users,
} from "@/db/schema";
import { staffEmails } from "@/lib/mothership-staff";
import { ensureCompanyCode } from "@/lib/company-code";
import { sendEmail } from "@/lib/email";
import { newId } from "@/lib/ids";
import { isAdmin } from "@/lib/permissions";
import type { CurrentOrg } from "@/lib/tenant";
import { platformShippoSlugs } from "@/lib/shippo-connection";
import {
  BODY_MAX,
  EMAIL_BODY_MAX,
  VIEW_MINUTES,
  cleanSubject,
  consentActive,
  emailSubject,
  isCategory,
  isStatus,
  ticketLabel,
  ticketProblem,
  type TicketStatus,
} from "@/lib/support-rules";

export const INBOX_PAGE_SIZE = 25;

const nowIso = () => new Date().toISOString();
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const htmlBody = (s: string) => esc(s).replace(/\n/g, "<br>");
const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://jindjinni.com").replace(/\/$/, "");

// ---- Email -------------------------------------------------------------------------------------------------------------------
/** Where "a ticket needs us" emails go: SUPPORT_NOTIFY_EMAIL (comma list), else the whole mothership team (owner, co-owners, admins, customer support). */
export async function supportNotifyAddresses(): Promise<string[]> {
  const fromEnv = (process.env.SUPPORT_NOTIFY_EMAIL ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (fromEnv.length) return fromEnv;
  return staffEmails(platformShippoSlugs());
}

async function emailSupportTeam(ticket: { ticketNo: number; subject: string; id: string }, companyLine: string, who: string, body: string, isNew: boolean) {
  try {
    const to = await supportNotifyAddresses();
    const link = `${appUrl()}/dashboard/lamp/support/${ticket.id}`;
    const subject = `${isNew ? "New ticket" : "New reply on ticket"} ${emailSubject(ticket.ticketNo, ticket.subject)} - ${companyLine}`;
    const text = `${companyLine}\n${who} wrote:\n\n${body}\n\nOpen it: ${link}`;
    const html = `<p><strong>${esc(companyLine)}</strong><br>${esc(who)} wrote:</p><blockquote style="border-left:3px solid #ccc;margin:0;padding-left:12px">${htmlBody(body)}</blockquote><p><a href="${link}">Open the ticket</a></p>`;
    for (const t of to) await sendEmail({ to: t, subject, html, text });
  } catch (e) {
    console.error("[support] could not email the team:", e);
  }
}

async function emailCustomer(to: string | null, ticket: { ticketNo: number; subject: string; id: string }, intro: string, body: string) {
  if (!to) return;
  try {
    const subject = emailSubject(ticket.ticketNo, ticket.subject);
    const text = `${intro}\n\n${body}\n\n--\nYou can also read and answer in your account: ${appUrl()}/dashboard/support/${ticket.id}\nJust reply to this email to answer us; keep "[#${ticket.ticketNo}]" in the subject.`;
    const html = `<p>${esc(intro)}</p><blockquote style="border-left:3px solid #ccc;margin:0;padding-left:12px">${htmlBody(body)}</blockquote><p style="color:#555;font-size:13px">You can also read and answer in your account: <a href="${appUrl()}/dashboard/support/${ticket.id}">open ticket ${ticketLabel(ticket.ticketNo)}</a>. Or just reply to this email and keep <strong>[#${ticket.ticketNo}]</strong> in the subject.</p>`;
    await sendEmail({ to, subject, html, text });
  } catch (e) {
    console.error("[support] could not email the customer:", e);
  }
}

// ---- Shared pieces ----------------------------------------------------------------------------------------------------------
async function nextTicketNo(): Promise<number> {
  const [r] = await db.select({ m: sql<number>`coalesce(max(${supportTickets.ticketNo}), 1000)` }).from(supportTickets);
  return Number(r?.m ?? 1000) + 1;
}

export type TicketMessage = { id: string; authorKind: string; authorName: string | null; body: string; via: string; createdAt: string };

export type TicketRow = {
  id: string;
  ticketNo: number;
  organizationId: string | null;
  companyName: string | null;
  companyCode: string | null;
  subject: string;
  category: string | null;
  status: TicketStatus;
  priority: string;
  source: string;
  lastAuthorKind: string;
  lastMessageAt: string;
  createdAt: string;
  fromEmail: string | null;
  fromName: string | null;
  viewConsentUntil: string | null;
  viewConsentAt: string | null;
};

const ticketCols = {
  id: supportTickets.id,
  ticketNo: supportTickets.ticketNo,
  organizationId: supportTickets.organizationId,
  companyName: organizations.name,
  companyCode: organizations.companyCode,
  subject: supportTickets.subject,
  category: supportTickets.category,
  status: supportTickets.status,
  priority: supportTickets.priority,
  source: supportTickets.source,
  lastAuthorKind: supportTickets.lastAuthorKind,
  lastMessageAt: supportTickets.lastMessageAt,
  createdAt: supportTickets.createdAt,
  fromEmail: supportTickets.fromEmail,
  fromName: supportTickets.fromName,
  viewConsentUntil: supportTickets.viewConsentUntil,
  viewConsentAt: supportTickets.viewConsentAt,
};
const asRow = (r: Record<string, unknown>): TicketRow => ({ ...(r as unknown as TicketRow), status: isStatus(r.status) ? r.status : "open" });

async function insertTicket(a: {
  organizationId: string | null;
  createdByUserId: string | null;
  fromEmail: string | null;
  fromName: string | null;
  subject: string;
  category: string | null;
  source: "app" | "email";
  body: string;
  authorName: string | null;
  externalId?: string | null;
}): Promise<{ id: string; ticketNo: number }> {
  const id = newId("tkt");
  const now = nowIso();
  for (let attempt = 0; attempt < 5; attempt++) {
    const ticketNo = await nextTicketNo();
    try {
      await db.insert(supportTickets).values({
        id,
        ticketNo,
        organizationId: a.organizationId,
        createdByUserId: a.createdByUserId,
        fromEmail: a.fromEmail,
        fromName: a.fromName,
        subject: a.subject,
        category: a.category,
        status: "open",
        priority: "normal",
        source: a.source,
        lastAuthorKind: "company",
        lastMessageAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await db.insert(supportMessages).values({
        id: newId("msg"),
        ticketId: id,
        authorKind: "company",
        authorUserId: a.createdByUserId,
        authorName: a.authorName,
        body: a.body,
        via: a.source,
        externalId: a.externalId ?? null,
        createdAt: now,
      });
      return { id, ticketNo };
    } catch (e) {
      if (attempt === 4) throw e;
    }
  }
  throw new Error("unreachable");
}

// ---- COMPANY side ----------------------------------------------------------------------------------------------------------
async function personOf(userId: string): Promise<{ name: string | null; email: string }> {
  const [u] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  return { name: u?.name ?? null, email: u?.email ?? "" };
}

export async function companyLine(organizationId: string | null): Promise<string> {
  if (!organizationId) return "Unknown company (email from an address we don't recognise)";
  const [o] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  const code = await ensureCompanyCode(organizationId);
  return `${o?.name ?? "A company"} (${code})`;
}

export type NewTicketResult = { ok: true; id: string; ticketNo: number } | { ok: false; error: string };

/** A person sends a new ticket from their company's Support page. */
export async function createTicket(org: CurrentOrg, input: { subject: string; category: string; body: string; viewDays?: number | null }): Promise<NewTicketResult> {
  const problem = ticketProblem(input.subject, input.body);
  if (problem) return { ok: false, error: problem };
  const subject = cleanSubject(input.subject);
  const body = input.body.trim();
  const me = await personOf(org.userId);
  await ensureCompanyCode(org.organizationId);
  const { id, ticketNo } = await insertTicket({
    organizationId: org.organizationId,
    createdByUserId: org.userId,
    fromEmail: me.email,
    fromName: me.name,
    subject,
    category: isCategory(input.category) ? input.category : "Other",
    source: "app",
    body,
    authorName: me.name || me.email,
  });
  if (input.viewDays && isAdmin(org.role)) await grantViewConsent(org, id, input.viewDays);
  await emailSupportTeam({ id, ticketNo, subject }, await companyLine(org.organizationId), me.name || me.email, body, true);
  return { ok: true, id, ticketNo };
}

/** Tickets a person may see: their own, or all of the company's for an owner/admin. */
export async function listCompanyTickets(org: CurrentOrg, status?: TicketStatus | "all"): Promise<TicketRow[]> {
  const conds: SQL[] = [eq(supportTickets.organizationId, org.organizationId)];
  if (!isAdmin(org.role)) conds.push(eq(supportTickets.createdByUserId, org.userId));
  if (status && status !== "all") conds.push(eq(supportTickets.status, status));
  const rows = await db
    .select(ticketCols)
    .from(supportTickets)
    .leftJoin(organizations, eq(supportTickets.organizationId, organizations.id))
    .where(and(...conds))
    .orderBy(desc(supportTickets.lastMessageAt))
    .limit(200);
  return rows.map(asRow);
}

export async function getCompanyTicket(org: CurrentOrg, ticketId: string): Promise<{ ticket: TicketRow; messages: TicketMessage[] } | null> {
  const conds: SQL[] = [eq(supportTickets.id, ticketId), eq(supportTickets.organizationId, org.organizationId)];
  if (!isAdmin(org.role)) conds.push(eq(supportTickets.createdByUserId, org.userId));
  const [row] = await db.select(ticketCols).from(supportTickets).leftJoin(organizations, eq(supportTickets.organizationId, organizations.id)).where(and(...conds)).limit(1);
  if (!row) return null;
  const messages = await db
    .select({ id: supportMessages.id, authorKind: supportMessages.authorKind, authorName: supportMessages.authorName, body: supportMessages.body, via: supportMessages.via, createdAt: supportMessages.createdAt })
    .from(supportMessages)
    .where(and(eq(supportMessages.ticketId, ticketId), sql`${supportMessages.authorKind} <> 'note'`))
    .orderBy(asc(supportMessages.createdAt), asc(supportMessages.id));
  return { ticket: asRow(row), messages };
}

/** The company adds to its own ticket (this also reopens a solved one). */
export async function addCompanyMessage(org: CurrentOrg, ticketId: string, bodyRaw: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const body = bodyRaw.trim();
  if (!body) return { ok: false, error: "Write your message first." };
  if (body.length > BODY_MAX) return { ok: false, error: `That message is too long (the limit is ${BODY_MAX.toLocaleString("en-US")} letters).` };
  const found = await getCompanyTicket(org, ticketId);
  if (!found) return { ok: false, error: "We couldn't find that ticket." };
  const me = await personOf(org.userId);
  const now = nowIso();
  await db.insert(supportMessages).values({ id: newId("msg"), ticketId, authorKind: "company", authorUserId: org.userId, authorName: me.name || me.email, body, via: "app", createdAt: now });
  await db.update(supportTickets).set({ status: "open", lastAuthorKind: "company", lastMessageAt: now, updatedAt: now }).where(eq(supportTickets.id, ticketId));
  await emailSupportTeam({ id: ticketId, ticketNo: found.ticket.ticketNo, subject: found.ticket.subject }, await companyLine(org.organizationId), me.name || me.email, body, false);
  return { ok: true };
}

/** An owner/admin of the company says "support may look at our account (read-only)" for this ticket, for a limited time. */
export async function grantViewConsent(org: CurrentOrg, ticketId: string, days: number): Promise<{ ok: true; until: string } | { ok: false; error: string }> {
  if (!isAdmin(org.role)) return { ok: false, error: "Only an owner or admin can allow that." };
  if (![1, 3, 7].includes(days)) return { ok: false, error: "Choose 1, 3 or 7 days." };
  const found = await getCompanyTicket(org, ticketId);
  if (!found) return { ok: false, error: "We couldn't find that ticket." };
  const now = Date.now();
  const until = new Date(now + days * 24 * 3600 * 1000).toISOString();
  await db
    .update(supportTickets)
    .set({ viewConsentUntil: until, viewConsentByUserId: org.userId, viewConsentAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString() })
    .where(eq(supportTickets.id, ticketId));
  return { ok: true, until };
}

/** Takes the OK back. Any look in progress stops at once. */
export async function revokeViewConsent(org: CurrentOrg, ticketId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isAdmin(org.role)) return { ok: false, error: "Only an owner or admin can change that." };
  const found = await getCompanyTicket(org, ticketId);
  if (!found) return { ok: false, error: "We couldn't find that ticket." };
  const now = nowIso();
  await db.update(supportTickets).set({ viewConsentUntil: null, updatedAt: now }).where(eq(supportTickets.id, ticketId));
  await db.update(supportViewSessions).set({ endedAt: now }).where(and(eq(supportViewSessions.ticketId, ticketId), isNull(supportViewSessions.endedAt)));
  return { ok: true };
}

export type ViewLogEntry = { id: string; ticketNo: number | null; adminName: string | null; reason: string | null; startedAt: string; endedAt: string | null; expiresAt: string };

/** Every time support looked at this company's account -- the company can read this. */
export async function viewLogForCompany(organizationId: string, limit = 50): Promise<ViewLogEntry[]> {
  return db
    .select({ id: supportViewSessions.id, ticketNo: supportViewSessions.ticketNo, adminName: supportViewSessions.adminName, reason: supportViewSessions.reason, startedAt: supportViewSessions.startedAt, endedAt: supportViewSessions.endedAt, expiresAt: supportViewSessions.expiresAt })
    .from(supportViewSessions)
    .where(eq(supportViewSessions.organizationId, organizationId))
    .orderBy(desc(supportViewSessions.startedAt))
    .limit(limit);
}

// ---- PLATFORM side ---------------------------------------------------------------------------------------------------------
export type InboxFilter = "needs" | "waiting" | "solved" | "all";
export const INBOX_FILTERS: { key: InboxFilter; label: string }[] = [
  { key: "needs", label: "Needs us" },
  { key: "waiting", label: "Waiting on company" },
  { key: "solved", label: "Solved" },
  { key: "all", label: "All" },
];
export const parseInboxFilter = (raw: string | undefined): InboxFilter => (INBOX_FILTERS.some((f) => f.key === raw) ? (raw as InboxFilter) : "needs");

function inboxWhere(filter: InboxFilter, q: string): SQL | undefined {
  const parts: SQL[] = [];
  if (filter === "needs") parts.push(eq(supportTickets.status, "open"));
  if (filter === "waiting") parts.push(eq(supportTickets.status, "waiting"));
  if (filter === "solved") parts.push(eq(supportTickets.status, "solved"));
  const term = q.trim().slice(0, 80).toLowerCase();
  if (term) {
    const likeStr = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const digits = term.replace(/^#/, "");
    const alts: SQL[] = [
      sql`lower(${supportTickets.subject}) like ${likeStr} escape '\\'`,
      sql`lower(${organizations.name}) like ${likeStr} escape '\\'`,
      sql`lower(${organizations.companyCode}) like ${likeStr} escape '\\'`,
      sql`lower(${supportTickets.fromEmail}) like ${likeStr} escape '\\'`,
    ];
    if (/^\d{1,9}$/.test(digits)) alts.push(eq(supportTickets.ticketNo, Number(digits)));
    parts.push(or(...alts)!);
  }
  return parts.length ? and(...parts) : undefined;
}

export type InboxCounts = { needs: number; waiting: number; solved: number; all: number };

export async function inboxCounts(): Promise<InboxCounts> {
  const [r] = await db
    .select({
      needs: sql<number>`coalesce(sum(case when ${supportTickets.status} = 'open' then 1 else 0 end), 0)`,
      waiting: sql<number>`coalesce(sum(case when ${supportTickets.status} = 'waiting' then 1 else 0 end), 0)`,
      solved: sql<number>`coalesce(sum(case when ${supportTickets.status} = 'solved' then 1 else 0 end), 0)`,
      all: sql<number>`count(*)`,
    })
    .from(supportTickets);
  return { needs: Number(r?.needs ?? 0), waiting: Number(r?.waiting ?? 0), solved: Number(r?.solved ?? 0), all: Number(r?.all ?? 0) };
}

export type InboxPage = { rows: TicketRow[]; total: number; page: number; pages: number };

export async function listInbox(opts: { q?: string; filter?: InboxFilter; page?: number }): Promise<InboxPage> {
  const filter = opts.filter ?? "needs";
  const where = inboxWhere(filter, opts.q ?? "");
  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(supportTickets).leftJoin(organizations, eq(supportTickets.organizationId, organizations.id)).where(where);
  const total = Number(n ?? 0);
  const pages = Math.max(1, Math.ceil(total / INBOX_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.floor(opts.page ?? 1) || 1), pages);
  const rows = await db
    .select(ticketCols)
    .from(supportTickets)
    .leftJoin(organizations, eq(supportTickets.organizationId, organizations.id))
    .where(where)
    .orderBy(sql`case when ${supportTickets.priority} = 'high' and ${supportTickets.status} = 'open' then 0 else 1 end`, desc(supportTickets.lastMessageAt), supportTickets.id)
    .limit(INBOX_PAGE_SIZE)
    .offset((page - 1) * INBOX_PAGE_SIZE);
  return { rows: rows.map(asRow), total, page, pages };
}

/** A company's tickets, newest first (for its page in the Lamp tab). */
export async function ticketsOfCompany(organizationId: string, limit = 15): Promise<TicketRow[]> {
  const rows = await db
    .select(ticketCols)
    .from(supportTickets)
    .leftJoin(organizations, eq(supportTickets.organizationId, organizations.id))
    .where(eq(supportTickets.organizationId, organizationId))
    .orderBy(desc(supportTickets.lastMessageAt), supportTickets.id)
    .limit(limit);
  return rows.map(asRow);
}

export type CompanySummary = {
  id: string;
  name: string;
  slug: string;
  code: string;
  approvalStatus: string | null;
  approvalReason: string | null;
  billingPlan: string | null;
  paymentStatus: string | null;
  paymentGraceEndsAt: string | null;
  lastPaymentAt: string | null;
  trialStartsOn: string | null;
  firstBillableOn: string | null;
  cancelRequestedOn: string | null;
  serviceEndsOn: string | null;
  createdAt: string;
  ownerName: string | null;
  ownerEmail: string | null;
  businessEmail: string | null;
  businessPhone: string | null;
  contactName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  teamSize: number;
};

/** Everything the platform owner needs to know about the company that sent a ticket, in one place. */
export async function companySummary(organizationId: string): Promise<CompanySummary | null> {
  const code = await ensureCompanyCode(organizationId);
  const [o] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      approvalStatus: organizations.approvalStatus,
      approvalReason: organizations.approvalReason,
      billingPlan: organizations.billingPlan,
      paymentStatus: organizations.paymentStatus,
      paymentGraceEndsAt: organizations.paymentGraceEndsAt,
      lastPaymentAt: organizations.lastPaymentAt,
      trialStartsOn: organizations.trialStartsOn,
      firstBillableOn: organizations.firstBillableOn,
      cancelRequestedOn: organizations.cancelRequestedOn,
      serviceEndsOn: organizations.serviceEndsOn,
      createdAt: organizations.createdAt,
      businessEmail: businessProfiles.businessEmail,
      businessPhone: businessProfiles.businessPhone,
      contactFirst: businessProfiles.primaryContactFirstName,
      contactLast: businessProfiles.primaryContactLastName,
      contactEmail: businessProfiles.primaryContactEmail,
      contactPhone: businessProfiles.primaryContactPhone,
    })
    .from(organizations)
    .leftJoin(businessProfiles, eq(businessProfiles.organizationId, organizations.id))
    .where(eq(organizations.id, organizationId))
    .limit(1);
  if (!o) return null;
  const [owner] = await db
    .select({ name: users.name, email: users.email })
    .from(memberships)
    .innerJoin(users, eq(memberships.userId, users.id))
    .where(and(eq(memberships.organizationId, organizationId), eq(memberships.role, "owner"), isNull(memberships.deactivatedAt)))
    .orderBy(asc(memberships.createdAt))
    .limit(1);
  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(memberships).where(and(eq(memberships.organizationId, organizationId), isNull(memberships.deactivatedAt)));
  return {
    id: o.id,
    name: o.name,
    slug: o.slug,
    code,
    approvalStatus: o.approvalStatus,
    approvalReason: o.approvalReason,
    billingPlan: o.billingPlan,
    paymentStatus: o.paymentStatus,
    paymentGraceEndsAt: o.paymentGraceEndsAt,
    lastPaymentAt: o.lastPaymentAt,
    trialStartsOn: o.trialStartsOn,
    firstBillableOn: o.firstBillableOn,
    cancelRequestedOn: o.cancelRequestedOn,
    serviceEndsOn: o.serviceEndsOn,
    createdAt: o.createdAt,
    ownerName: owner?.name ?? null,
    ownerEmail: owner?.email ?? null,
    businessEmail: o.businessEmail,
    businessPhone: o.businessPhone,
    contactName: [o.contactFirst, o.contactLast].filter(Boolean).join(" "),
    contactEmail: o.contactEmail,
    contactPhone: o.contactPhone,
    teamSize: Number(n ?? 0),
  };
}

export async function getTicketForPlatform(ticketId: string): Promise<{ ticket: TicketRow; messages: (TicketMessage & { authorUserId: string | null })[]; summary: CompanySummary | null; previous: { id: string; ticketNo: number; subject: string; status: string }[] } | null> {
  const [row] = await db.select(ticketCols).from(supportTickets).leftJoin(organizations, eq(supportTickets.organizationId, organizations.id)).where(eq(supportTickets.id, ticketId)).limit(1);
  if (!row) return null;
  const ticket = asRow(row);
  const messages = await db
    .select({ id: supportMessages.id, authorKind: supportMessages.authorKind, authorName: supportMessages.authorName, body: supportMessages.body, via: supportMessages.via, createdAt: supportMessages.createdAt, authorUserId: supportMessages.authorUserId })
    .from(supportMessages)
    .where(eq(supportMessages.ticketId, ticketId))
    .orderBy(asc(supportMessages.createdAt), asc(supportMessages.id));
  const summary = ticket.organizationId ? await companySummary(ticket.organizationId) : null;
  const previous = ticket.organizationId
    ? await db
        .select({ id: supportTickets.id, ticketNo: supportTickets.ticketNo, subject: supportTickets.subject, status: supportTickets.status })
        .from(supportTickets)
        .where(and(eq(supportTickets.organizationId, ticket.organizationId), sql`${supportTickets.id} <> ${ticketId}`))
        .orderBy(desc(supportTickets.ticketNo))
        .limit(8)
    : [];
  return { ticket, messages, summary, previous };
}

/** Our reply: the company sees it, and the person who asked is emailed. Marks the ticket "waiting on company". */
export async function replyAsSupport(ticketId: string, adminUserId: string, bodyRaw: string, solve = false): Promise<{ ok: true } | { ok: false; error: string }> {
  const body = bodyRaw.trim();
  if (!body) return { ok: false, error: "Write your reply first." };
  if (body.length > BODY_MAX) return { ok: false, error: `That reply is too long (the limit is ${BODY_MAX.toLocaleString("en-US")} letters).` };
  const [t] = await db.select({ id: supportTickets.id, ticketNo: supportTickets.ticketNo, subject: supportTickets.subject, fromEmail: supportTickets.fromEmail }).from(supportTickets).where(eq(supportTickets.id, ticketId)).limit(1);
  if (!t) return { ok: false, error: "We couldn't find that ticket." };
  const me = await personOf(adminUserId);
  const now = nowIso();
  await db.insert(supportMessages).values({ id: newId("msg"), ticketId, authorKind: "support", authorUserId: adminUserId, authorName: "Jindjinni Support", body, via: "app", createdAt: now });
  await db.update(supportTickets).set({ status: solve ? "solved" : "waiting", lastAuthorKind: "support", lastMessageAt: now, updatedAt: now }).where(eq(supportTickets.id, ticketId));
  void me;
  await emailCustomer(t.fromEmail, t, "Jindjinni Support replied to your ticket:", body);
  return { ok: true };
}

export async function addInternalNote(ticketId: string, adminUserId: string, bodyRaw: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const body = bodyRaw.trim();
  if (!body) return { ok: false, error: "Write the note first." };
  if (body.length > BODY_MAX) return { ok: false, error: "That note is too long." };
  const [t] = await db.select({ id: supportTickets.id }).from(supportTickets).where(eq(supportTickets.id, ticketId)).limit(1);
  if (!t) return { ok: false, error: "We couldn't find that ticket." };
  const me = await personOf(adminUserId);
  await db.insert(supportMessages).values({ id: newId("msg"), ticketId, authorKind: "note", authorUserId: adminUserId, authorName: me.name || me.email, body, via: "app", createdAt: nowIso() });
  return { ok: true };
}

export async function setTicketStatus(ticketId: string, status: string, priority?: string): Promise<boolean> {
  if (!isStatus(status)) return false;
  const set: Record<string, unknown> = { status, updatedAt: nowIso() };
  if (priority === "normal" || priority === "high") set.priority = priority;
  const res = await db.update(supportTickets).set(set).where(eq(supportTickets.id, ticketId));
  return ((res as unknown as { rowsAffected?: number }).rowsAffected ?? 1) > 0;
}

// ---- "View as company" sessions ---------------------------------------------------------------------------------------------
export type StartViewResult = { ok: true; sessionId: string; expiresAt: string } | { ok: false; error: string };

/** Opens a 30-minute, read-only look at the ticket's company. Needs the company's OK on the ticket, still in date. */
export async function startViewSession(ticketId: string, admin: { userId: string; organizationId: string }, nowMs = Date.now()): Promise<StartViewResult> {
  const [t] = await db.select().from(supportTickets).where(eq(supportTickets.id, ticketId)).limit(1);
  if (!t || !t.organizationId) return { ok: false, error: "This ticket isn't linked to a company, so there is nothing to view." };
  if (t.organizationId === admin.organizationId) return { ok: false, error: "That is your own company." };
  if (t.status === "solved") return { ok: false, error: "This ticket is solved. Reopen it first." };
  if (!consentActive(t.viewConsentUntil, nowMs)) return { ok: false, error: "The company has not allowed this (or its permission has run out). Ask them to allow it on the ticket." };
  const me = await personOf(admin.userId);
  const now = new Date(nowMs).toISOString();
  // One look at a time per person.
  await db.update(supportViewSessions).set({ endedAt: now }).where(and(eq(supportViewSessions.adminUserId, admin.userId), isNull(supportViewSessions.endedAt)));
  const id = newId("view");
  const expiresAt = new Date(nowMs + VIEW_MINUTES * 60_000).toISOString();
  await db.insert(supportViewSessions).values({
    id,
    ticketId,
    ticketNo: t.ticketNo,
    organizationId: t.organizationId,
    adminUserId: admin.userId,
    adminName: me.name || "Jindjinni Support",
    reason: t.subject,
    startedAt: now,
    expiresAt,
  });
  await emailCustomer(
    t.fromEmail,
    { id: t.id, ticketNo: t.ticketNo, subject: t.subject },
    "As you allowed on your support ticket, Jindjinni Support is now looking at your account (read-only: nothing can be changed).",
    `The look lasts up to ${VIEW_MINUTES} minutes. You can see every time support looked at your account in Support > Support access log, and you can take your permission back on the ticket at any time.`,
  );
  return { ok: true, sessionId: id, expiresAt };
}

export async function endViewSession(sessionId: string): Promise<void> {
  await db.update(supportViewSessions).set({ endedAt: nowIso() }).where(and(eq(supportViewSessions.id, sessionId), isNull(supportViewSessions.endedAt)));
}

// ---- Tickets that arrive by email -------------------------------------------------------------------------------------------
export type InboundMail = { from: string; fromName?: string | null; subject: string; text: string; messageId?: string | null };

function fixAddress(raw: string): string {
  const m = /<([^>]+)>/.exec(raw);
  return (m ? m[1] : raw).trim().toLowerCase();
}

/**
 * One email that came in to support@. A reply to an existing ticket ("[#1042]" in the subject, from that company's people or the
 * original sender) is added to that ticket; anything else becomes a new ticket. The sender is matched to a person in the platform
 * and so to their company; an unknown sender still makes a ticket, marked "unknown company".
 */
export async function receiveSupportEmail(mail: InboundMail): Promise<{ ok: true; ticketId: string; ticketNo: number; created: boolean; duplicate?: boolean } | { ok: false; error: string }> {
  const email = fixAddress(mail.from);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "No usable sender address." };
  if (mail.messageId) {
    const [dup] = await db.select({ t: supportMessages.ticketId }).from(supportMessages).where(eq(supportMessages.externalId, mail.messageId)).limit(1);
    if (dup) {
      const [t] = await db.select({ ticketNo: supportTickets.ticketNo }).from(supportTickets).where(eq(supportTickets.id, dup.t)).limit(1);
      return { ok: true, ticketId: dup.t, ticketNo: t?.ticketNo ?? 0, created: false, duplicate: true };
    }
  }
  const { stripQuotedReply, ticketNoFromSubject } = await import("@/lib/support-rules");
  const body = (stripQuotedReply(mail.text) || mail.text).trim().slice(0, EMAIL_BODY_MAX);
  if (!body) return { ok: false, error: "The email had no text." };
  const subject = cleanSubject(mail.subject) || "(no subject)";

  const [user] = await db.select({ id: users.id, name: users.name }).from(users).where(sql`lower(${users.email}) = ${email}`).limit(1);
  let organizationId: string | null = null;
  if (user) {
    const [m] = await db
      .select({ orgId: memberships.organizationId })
      .from(memberships)
      .innerJoin(organizations, eq(memberships.organizationId, organizations.id))
      .where(and(eq(memberships.userId, user.id), isNull(memberships.deactivatedAt)))
      .limit(1);
    organizationId = m?.orgId ?? null;
  }
  const authorName = mail.fromName?.trim() || user?.name || email;

  const no = ticketNoFromSubject(mail.subject);
  if (no) {
    const [t] = await db.select().from(supportTickets).where(eq(supportTickets.ticketNo, no)).limit(1);
    // Only the ticket's own company (or its original sender) may add to it by email -- a stranger quoting a number does not.
    const allowed = t && ((t.organizationId && t.organizationId === organizationId) || (t.fromEmail && t.fromEmail.toLowerCase() === email));
    if (t && allowed) {
      const now = nowIso();
      await db.insert(supportMessages).values({ id: newId("msg"), ticketId: t.id, authorKind: "company", authorUserId: user?.id ?? null, authorName, body, via: "email", externalId: mail.messageId ?? null, createdAt: now });
      await db.update(supportTickets).set({ status: "open", lastAuthorKind: "company", lastMessageAt: now, updatedAt: now }).where(eq(supportTickets.id, t.id));
      await emailSupportTeam({ id: t.id, ticketNo: t.ticketNo, subject: t.subject }, await companyLine(t.organizationId), authorName, body, false);
      return { ok: true, ticketId: t.id, ticketNo: t.ticketNo, created: false };
    }
  }
  if (organizationId) await ensureCompanyCode(organizationId);
  const { id, ticketNo } = await insertTicket({ organizationId, createdByUserId: user?.id ?? null, fromEmail: email, fromName: authorName, subject, category: null, source: "email", body, authorName, externalId: mail.messageId ?? null });
  await emailSupportTeam({ id, ticketNo, subject }, await companyLine(organizationId), authorName, body, true);
  return { ok: true, ticketId: id, ticketNo, created: true };
}

