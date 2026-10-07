// Marketing: contacts, opt-outs, campaigns and sending. Customers from Purchasing are read live, never copied; uploaded
// and typed-in contacts live in marketing_contacts. An opt-out is kept by address, so it holds for a customer, an uploaded
// contact or both. Everything is scoped to one company. Email sends a batch at a time and can be resumed; text campaigns
// are saved as drafts only until a text provider is connected.
import { and, asc, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { marketingCampaigns, marketingContacts, marketingMessages, marketingOptouts, marketingSettings, organizations, purchasingCustomers } from "@/db/schema";
import { newId } from "@/lib/ids";
import {
  BATCH_SIZE,
  buildEmail,
  cleanText,
  DEFAULT_DAILY_LIMIT,
  emailProblem,
  isAudience,
  MAX_DAILY_LIMIT,
  MAX_EMAIL_BODY,
  MAX_SUBJECT,
  MAX_TEXT_BODY,
  normEmail,
  normPhone,
  resolveAudience,
  type Audience,
  type AudienceResult,
  type Channel,
  type Person,
  type SheetContact,
} from "@/lib/marketing-rules";
import { makeUnsubscribeToken, readUnsubscribeToken, unsubscribeUrl } from "@/lib/marketing-token";

export type Org = { organizationId: string; userId: string };
export type Settings = typeof marketingSettings.$inferSelect;
export type Campaign = typeof marketingCampaigns.$inferSelect;
export type Contact = typeof marketingContacts.$inferSelect;
export type Mailer = (a: { to: string; subject: string; text: string; html: string; fromName: string; replyTo: string | null }) => Promise<{ ok: true } | { ok: false; error: string }>;
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const nz = (v: unknown, max: number): string | null => cleanText(v, max) || null;

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function getSettings(organizationId: string): Promise<Settings | null> {
  const [row] = await db.select().from(marketingSettings).where(eq(marketingSettings.organizationId, organizationId)).limit(1);
  return row ?? null;
}

export async function ensureSettings(organizationId: string): Promise<Settings> {
  const have = await getSettings(organizationId);
  if (have) return have;
  await db.insert(marketingSettings).values({ id: newId("mks"), organizationId }).onConflictDoNothing();
  return (await getSettings(organizationId))!;
}

export type SettingsInput = { senderName?: string | null; replyTo?: string | null; businessAddress?: string | null; footerText?: string | null; dailyEmailLimit?: number; textFromNumber?: string | null; textOptOutLine?: string | null };

export async function saveSettings(org: Org, input: SettingsInput): Promise<Result> {
  await ensureSettings(org.organizationId);
  const replyTo = nz(input.replyTo, 160);
  if (replyTo && !normEmail(replyTo)) return { ok: false, error: "That reply-to email address doesn't look right." };
  const limit = Math.floor(Number(input.dailyEmailLimit ?? DEFAULT_DAILY_LIMIT));
  if (!Number.isFinite(limit) || limit < 1 || limit > MAX_DAILY_LIMIT) return { ok: false, error: `The daily email limit must be between 1 and ${MAX_DAILY_LIMIT}.` };
  const from = nz(input.textFromNumber, 30);
  if (from && !normPhone(from)) return { ok: false, error: "That text number doesn't look right. Use a full phone number, like (334) 555-0100." };
  await db
    .update(marketingSettings)
    .set({
      senderName: nz(input.senderName, 100),
      replyTo: replyTo ? normEmail(replyTo) : null,
      businessAddress: String(input.businessAddress ?? "").split(/\r?\n/).map((l) => cleanText(l, 120)).filter(Boolean).slice(0, 4).join("\n") || null,
      footerText: nz(input.footerText, 300),
      dailyEmailLimit: limit,
      textFromNumber: from ? normPhone(from) : null,
      textOptOutLine: nz(input.textOptOutLine, 120) ?? "Reply STOP to opt out.",
      updatedAt: sql`(current_timestamp)`,
    })
    .where(eq(marketingSettings.organizationId, org.organizationId));
  return { ok: true };
}

// ---------------------------------------------------------------------------
// People: customers (live) and contacts
// ---------------------------------------------------------------------------

export async function listPeople(organizationId: string): Promise<Person[]> {
  const customers = await db
    .select({ id: purchasingCustomers.id, first: purchasingCustomers.firstName, last: purchasingCustomers.lastName, email: purchasingCustomers.email, phone: purchasingCustomers.phone })
    .from(purchasingCustomers)
    .where(and(eq(purchasingCustomers.organizationId, organizationId), isNull(purchasingCustomers.archivedAt), eq(purchasingCustomers.active, true)))
    .orderBy(asc(purchasingCustomers.firstName));
  const contacts = await db.select().from(marketingContacts).where(eq(marketingContacts.organizationId, organizationId)).orderBy(asc(marketingContacts.firstName));
  return [
    ...customers.map((c) => ({ key: c.id, source: "CUSTOMER" as const, firstName: c.first, lastName: c.last, email: c.email, phone: c.phone })),
    ...contacts.map((c) => ({ key: c.id, source: "CONTACT" as const, firstName: c.firstName, lastName: c.lastName, email: c.email, phone: c.phone, company: c.company })),
  ];
}

export async function optoutKeys(organizationId: string, channel: Channel): Promise<Set<string>> {
  const rows = await db.select({ k: marketingOptouts.addressKey }).from(marketingOptouts).where(and(eq(marketingOptouts.organizationId, organizationId), eq(marketingOptouts.channel, channel)));
  return new Set(rows.map((r) => r.k));
}

export async function audienceFor(organizationId: string, channel: Channel, audience: Audience): Promise<AudienceResult> {
  return resolveAudience(channel, audience, await listPeople(organizationId), await optoutKeys(organizationId, channel));
}

export async function setOptout(org: Org, channel: Channel, address: string, on: boolean, via = "staff"): Promise<Result> {
  const key = channel === "EMAIL" ? normEmail(address) : normPhone(address);
  if (!key) return { ok: false, error: "That address isn't valid." };
  if (on) await db.insert(marketingOptouts).values({ id: newId("mko"), organizationId: org.organizationId, channel, addressKey: key, via }).onConflictDoNothing();
  else await db.delete(marketingOptouts).where(and(eq(marketingOptouts.organizationId, org.organizationId), eq(marketingOptouts.channel, channel), eq(marketingOptouts.addressKey, key)));
  return { ok: true };
}

export type ContactInput = { firstName: string; lastName?: string | null; email?: string | null; phone?: string | null; company?: string | null; notes?: string | null };

async function existingKeys(organizationId: string): Promise<{ emails: Set<string>; phones: Set<string> }> {
  const rows = await db.select({ e: marketingContacts.email, p: marketingContacts.phone }).from(marketingContacts).where(eq(marketingContacts.organizationId, organizationId));
  return { emails: new Set(rows.map((r) => normEmail(r.e)).filter((x): x is string => !!x)), phones: new Set(rows.map((r) => normPhone(r.p)).filter((x): x is string => !!x)) };
}

export async function addContact(org: Org, input: ContactInput): Promise<Result<{ id: string }>> {
  const email = nz(input.email, 254);
  const phone = nz(input.phone, 40);
  const e = email ? normEmail(email) : null;
  const p = phone ? normPhone(phone) : null;
  if (email && !e) return { ok: false, error: "That email address doesn't look right." };
  if (phone && !p) return { ok: false, error: "That phone number doesn't look right. Use 10 digits, like (334) 555-0100." };
  if (!e && !p) return { ok: false, error: "Add an email address or a phone number." };
  const first = cleanText(input.firstName, 80) || (e ? e.split("@")[0] : "");
  if (!first) return { ok: false, error: "Add a name." };
  const have = await existingKeys(org.organizationId);
  if (e && have.emails.has(e)) return { ok: false, error: "That email address is already in your contacts." };
  if (p && have.phones.has(p)) return { ok: false, error: "That phone number is already in your contacts." };
  const id = newId("mkc");
  await db.insert(marketingContacts).values({ id, organizationId: org.organizationId, firstName: first, lastName: nz(input.lastName, 80), email: e, phone: p, company: nz(input.company, 120), notes: nz(input.notes, 500), source: "MANUAL", createdByUserId: org.userId });
  return { ok: true, id };
}

/** Adds uploaded contacts, skipping anyone whose email or phone is already a contact. Customers aren't touched. */
export async function importContacts(org: Org, contacts: SheetContact[]): Promise<{ added: number; existing: number }> {
  const have = await existingKeys(org.organizationId);
  let added = 0;
  let existing = 0;
  const rows: (typeof marketingContacts.$inferInsert)[] = [];
  for (const c of contacts) {
    if ((c.email && have.emails.has(c.email)) || (!c.email && c.phone && have.phones.has(c.phone))) {
      existing++;
      continue;
    }
    if (c.email) have.emails.add(c.email);
    if (c.phone) have.phones.add(c.phone);
    rows.push({ id: newId("mkc"), organizationId: org.organizationId, firstName: c.firstName, lastName: c.lastName, email: c.email, phone: c.phone, company: c.company, source: "UPLOAD", createdByUserId: org.userId });
    added++;
  }
  for (let i = 0; i < rows.length; i += 100) await db.insert(marketingContacts).values(rows.slice(i, i + 100));
  return { added, existing };
}

export async function deleteContact(org: Org, id: string): Promise<Result> {
  const gone = await db.delete(marketingContacts).where(and(eq(marketingContacts.id, id), eq(marketingContacts.organizationId, org.organizationId))).returning({ id: marketingContacts.id });
  return gone.length ? { ok: true } : { ok: false, error: "That contact wasn't found." };
}

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

export async function listCampaigns(organizationId: string, channel: Channel) {
  const rows = await db.select().from(marketingCampaigns).where(and(eq(marketingCampaigns.organizationId, organizationId), eq(marketingCampaigns.channel, channel))).orderBy(desc(marketingCampaigns.createdAt));
  const counts = rows.length
    ? await db
        .select({ campaignId: marketingMessages.campaignId, status: marketingMessages.status, n: sql<number>`count(*)` })
        .from(marketingMessages)
        .where(and(eq(marketingMessages.organizationId, organizationId), inArray(marketingMessages.campaignId, rows.map((r) => r.id))))
        .groupBy(marketingMessages.campaignId, marketingMessages.status)
    : [];
  return rows.map((c) => {
    const mine = counts.filter((x) => x.campaignId === c.id);
    const n = (s: string) => Number(mine.find((x) => x.status === s)?.n ?? 0);
    return { campaign: c, sent: n("SENT"), failed: n("FAILED"), skipped: n("SKIPPED"), pending: n("PENDING") };
  });
}

export async function getCampaign(organizationId: string, id: string): Promise<Campaign | null> {
  const [row] = await db.select().from(marketingCampaigns).where(and(eq(marketingCampaigns.id, id), eq(marketingCampaigns.organizationId, organizationId))).limit(1);
  return row ?? null;
}

export type CampaignInput = { id?: string | null; channel: Channel; name: string; subject?: string | null; body: string; audience: string };

/** Creates or updates a DRAFT. A campaign that has started sending is never edited. */
export async function saveCampaign(org: Org, input: CampaignInput): Promise<Result<{ id: string }>> {
  const name = cleanText(input.name, 100);
  if (!name) return { ok: false, error: "Give the campaign a name." };
  if (!isAudience(input.audience)) return { ok: false, error: "Choose who it goes to." };
  const channel: Channel = input.channel === "TEXT" ? "TEXT" : "EMAIL";
  const body = String(input.body ?? "").replace(/\r\n/g, "\n");
  if (channel === "EMAIL") {
    if (body.length > MAX_EMAIL_BODY) return { ok: false, error: `The message is too long (up to ${MAX_EMAIL_BODY.toLocaleString("en-US")} characters).` };
    if (cleanText(input.subject, 400).length > MAX_SUBJECT) return { ok: false, error: `The subject is too long (up to ${MAX_SUBJECT} characters).` };
  } else if (body.length > MAX_TEXT_BODY) return { ok: false, error: `A text can be up to ${MAX_TEXT_BODY} characters.` };
  const values = { name, subject: channel === "EMAIL" ? nz(input.subject, MAX_SUBJECT) : null, body, audience: input.audience as Audience };
  if (input.id) {
    const have = await getCampaign(org.organizationId, input.id);
    if (!have) return { ok: false, error: "That campaign wasn't found." };
    if (have.status !== "DRAFT") return { ok: false, error: "This campaign has already started sending, so it can't be changed." };
    await db.update(marketingCampaigns).set({ ...values, updatedAt: sql`(current_timestamp)` }).where(eq(marketingCampaigns.id, have.id));
    return { ok: true, id: have.id };
  }
  const id = newId("mkp");
  await db.insert(marketingCampaigns).values({ id, organizationId: org.organizationId, channel, ...values, createdByUserId: org.userId });
  return { ok: true, id };
}

export async function deleteCampaign(org: Org, id: string): Promise<Result> {
  const have = await getCampaign(org.organizationId, id);
  if (!have) return { ok: false, error: "That campaign wasn't found." };
  if (have.status !== "DRAFT") return { ok: false, error: "Only a campaign that hasn't been sent can be deleted." };
  await db.delete(marketingCampaigns).where(eq(marketingCampaigns.id, id));
  return { ok: true };
}

export async function campaignMessages(organizationId: string, campaignId: string) {
  return db.select().from(marketingMessages).where(and(eq(marketingMessages.organizationId, organizationId), eq(marketingMessages.campaignId, campaignId))).orderBy(asc(marketingMessages.status), asc(marketingMessages.toAddress));
}

export async function sentLast24h(organizationId: string, nowIso = new Date().toISOString()): Promise<number> {
  const since = new Date(Date.parse(nowIso) - 86400000).toISOString();
  const [r] = await db
    .select({ n: sql<number>`count(*)` })
    .from(marketingMessages)
    .where(and(eq(marketingMessages.organizationId, organizationId), eq(marketingMessages.channel, "EMAIL"), eq(marketingMessages.status, "SENT"), gte(marketingMessages.sentAt, since)));
  return Number(r?.n ?? 0);
}

async function companyName(organizationId: string): Promise<string> {
  const [o] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  return o?.name ?? "";
}

/** What a campaign would look like to one person, for the preview and for the test email. */
export async function previewEmail(organizationId: string, c: { subject: string | null; body: string }, person: { firstName: string; lastName?: string | null }, origin: string) {
  const [settings, company] = await Promise.all([getSettings(organizationId), companyName(organizationId)]);
  return buildEmail({
    subject: c.subject ?? "",
    body: c.body,
    person,
    company,
    settings: { senderName: settings?.senderName ?? null, businessAddress: settings?.businessAddress ?? null, footerText: settings?.footerText ?? null },
    unsubscribeUrl: unsubscribeUrl(origin, makeUnsubscribeToken(organizationId, "EMAIL", "preview@example.com")),
  });
}

/** Sends the campaign to one address (the sender's own) so it can be looked at in a real inbox first. Nothing is recorded. */
export async function sendTest(org: Org, id: string, to: string, mailer: Mailer, origin: string): Promise<Result> {
  const c = await getCampaign(org.organizationId, id);
  if (!c || c.channel !== "EMAIL") return { ok: false, error: "That campaign wasn't found." };
  const addr = normEmail(to);
  if (!addr) return { ok: false, error: "That email address doesn't look right." };
  const [settings, company] = await Promise.all([getSettings(org.organizationId), companyName(org.organizationId)]);
  const mail = buildEmail({
    subject: c.subject ?? "",
    body: c.body,
    person: { firstName: "Alex", lastName: "Sample" },
    company,
    settings: { senderName: settings?.senderName ?? null, businessAddress: settings?.businessAddress ?? null, footerText: settings?.footerText ?? null },
    unsubscribeUrl: unsubscribeUrl(origin, makeUnsubscribeToken(org.organizationId, "EMAIL", addr)),
  });
  const r = await mailer({ to: addr, subject: `[Test] ${mail.subject}`, text: mail.text, html: mail.html, fromName: settings?.senderName || company, replyTo: settings?.replyTo ?? null });
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

export type SendProgress = { sent: number; failed: number; skipped: number; pending: number; done: boolean };

async function progress(organizationId: string, campaignId: string): Promise<SendProgress> {
  const rows = await db
    .select({ status: marketingMessages.status, n: sql<number>`count(*)` })
    .from(marketingMessages)
    .where(and(eq(marketingMessages.organizationId, organizationId), eq(marketingMessages.campaignId, campaignId)))
    .groupBy(marketingMessages.status);
  const n = (s: string) => Number(rows.find((r) => r.status === s)?.n ?? 0);
  return { sent: n("SENT"), failed: n("FAILED"), skipped: n("SKIPPED"), pending: n("PENDING"), done: n("PENDING") === 0 };
}

export const campaignProgress = progress;

/**
 * Starts an email campaign (the first call fixes who it goes to) or carries on with it, sending one batch of up to
 * BATCH_SIZE. Call again until `done`. Someone who unsubscribed since it started is skipped. Three failures in a row
 * pause it with the reason; pressing send again resumes.
 */
export async function sendBatch(org: Org, id: string, mailer: Mailer, origin: string, nowIso = new Date().toISOString()): Promise<Result<SendProgress>> {
  const c = await getCampaign(org.organizationId, id);
  if (!c) return { ok: false, error: "That campaign wasn't found." };
  if (c.channel !== "EMAIL") return { ok: false, error: "Text campaigns can't be sent yet. Connect a text provider first." };
  if (c.status === "SENT" || c.status === "CANCELLED") return { ok: false, error: "This campaign has already finished." };
  const settings = await getSettings(org.organizationId);

  if (c.status === "DRAFT") {
    const aud = await audienceFor(org.organizationId, "EMAIL", c.audience);
    const used = await sentLast24h(org.organizationId, nowIso);
    const why = emailProblem(c, settings, aud.recipients.length, used, settings?.dailyEmailLimit ?? DEFAULT_DAILY_LIMIT);
    if (why) return { ok: false, error: why };
    // Only one request gets to start it; a second click falls through and just continues.
    const won = await db
      .update(marketingCampaigns)
      .set({ status: "SENDING", startedAt: nowIso, sentByUserId: org.userId, updatedAt: sql`(current_timestamp)` })
      .where(and(eq(marketingCampaigns.id, c.id), eq(marketingCampaigns.status, "DRAFT")))
      .returning({ id: marketingCampaigns.id });
    if (won.length) {
      const rows = aud.recipients.map((r) => ({ id: newId("mkm"), organizationId: org.organizationId, campaignId: c.id, channel: "EMAIL" as const, toAddress: r.to, firstName: r.firstName, lastName: r.lastName, source: r.source }));
      for (let i = 0; i < rows.length; i += 100) await db.insert(marketingMessages).values(rows.slice(i, i + 100));
    }
  }

  const company = await companyName(org.organizationId);
  const optouts = await optoutKeys(org.organizationId, "EMAIL");
  const batch = await db
    .select()
    .from(marketingMessages)
    .where(and(eq(marketingMessages.campaignId, c.id), eq(marketingMessages.organizationId, org.organizationId), eq(marketingMessages.status, "PENDING")))
    .orderBy(asc(marketingMessages.toAddress))
    .limit(BATCH_SIZE);
  let streak = 0;
  let lastError = "";
  for (const m of batch) {
    if (optouts.has(m.toAddress)) {
      await db.update(marketingMessages).set({ status: "SKIPPED", error: "Unsubscribed" }).where(eq(marketingMessages.id, m.id));
      continue;
    }
    const mail = buildEmail({
      subject: c.subject ?? "",
      body: c.body,
      person: { firstName: m.firstName, lastName: m.lastName },
      company,
      settings: { senderName: settings?.senderName ?? null, businessAddress: settings?.businessAddress ?? null, footerText: settings?.footerText ?? null },
      unsubscribeUrl: unsubscribeUrl(origin, makeUnsubscribeToken(org.organizationId, "EMAIL", m.toAddress)),
    });
    let r: { ok: true } | { ok: false; error: string };
    try {
      r = await mailer({ to: m.toAddress, subject: mail.subject, text: mail.text, html: mail.html, fromName: settings?.senderName || company, replyTo: settings?.replyTo ?? null });
    } catch (e) {
      r = { ok: false, error: e instanceof Error ? e.message : "The email couldn't be sent." };
    }
    if (r.ok) {
      streak = 0;
      await db.update(marketingMessages).set({ status: "SENT", sentAt: new Date().toISOString(), error: null }).where(eq(marketingMessages.id, m.id));
    } else {
      streak++;
      lastError = r.error;
      await db.update(marketingMessages).set({ status: "FAILED", error: r.error.slice(0, 300) }).where(eq(marketingMessages.id, m.id));
      if (streak >= 3) break;
    }
  }
  const p = await progress(org.organizationId, c.id);
  if (streak >= 3) return { ok: false, error: `Sending paused after 3 emails in a row failed: ${lastError} Fix that, then press Resume.` };
  if (p.done) await db.update(marketingCampaigns).set({ status: "SENT", finishedAt: new Date().toISOString(), updatedAt: sql`(current_timestamp)` }).where(eq(marketingCampaigns.id, c.id));
  return { ok: true, ...p };
}

/** Stops a campaign part-way: what is still waiting is skipped, and nothing more goes out. */
export async function cancelSending(org: Org, id: string): Promise<Result> {
  const c = await getCampaign(org.organizationId, id);
  if (!c) return { ok: false, error: "That campaign wasn't found." };
  if (c.status !== "SENDING") return { ok: false, error: "This campaign isn't sending." };
  await db.update(marketingMessages).set({ status: "SKIPPED", error: "Stopped before it was sent" }).where(and(eq(marketingMessages.campaignId, id), eq(marketingMessages.status, "PENDING")));
  await db.update(marketingCampaigns).set({ status: "CANCELLED", finishedAt: new Date().toISOString(), updatedAt: sql`(current_timestamp)` }).where(eq(marketingCampaigns.id, id));
  return { ok: true };
}

// ---------------------------------------------------------------------------
// The unsubscribe link (no sign-in)
// ---------------------------------------------------------------------------

export async function lookupUnsubscribe(token: string): Promise<{ organizationName: string; channel: Channel; address: string; already: boolean } | null> {
  const t = readUnsubscribeToken(token);
  if (!t) return null;
  const [org] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, t.organizationId)).limit(1);
  if (!org) return null;
  const [have] = await db.select({ id: marketingOptouts.id }).from(marketingOptouts).where(and(eq(marketingOptouts.organizationId, t.organizationId), eq(marketingOptouts.channel, t.channel), eq(marketingOptouts.addressKey, t.addressKey))).limit(1);
  return { organizationName: org.name, channel: t.channel, address: t.addressKey, already: !!have };
}

export async function unsubscribeByToken(token: string): Promise<{ ok: boolean }> {
  const t = readUnsubscribeToken(token);
  if (!t) return { ok: false };
  const [org] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, t.organizationId)).limit(1);
  if (!org) return { ok: false };
  await db.insert(marketingOptouts).values({ id: newId("mko"), organizationId: t.organizationId, channel: t.channel, addressKey: t.addressKey, via: "link" }).onConflictDoNothing();
  return { ok: true };
}

