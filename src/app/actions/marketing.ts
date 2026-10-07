"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireOrg } from "@/lib/tenant";
import { canViewMarketing } from "@/lib/permissions";
import { sendOrgEmail } from "@/lib/email-connector";
import { parseSpreadsheetFile } from "@/lib/spreadsheet-import";
import { contactsFromSheet, isAudience, normEmail, type Channel } from "@/lib/marketing-rules";
import {
  addContact,
  audienceFor,
  campaignProgress,
  cancelSending,
  deleteCampaign,
  deleteContact,
  getCampaign,
  importContacts,
  saveCampaign,
  saveSettings,
  sendBatch,
  sendTest,
  setOptout,
  type Mailer,
  type SendProgress,
  type SettingsInput,
} from "@/lib/marketing-service";

export type MarketingResult = { ok: true; message?: string; id?: string } | { ok: false; error: string };

async function writer(): Promise<{ error: string } | { org: { organizationId: string; userId: string } }> {
  const org = await requireOrg();
  if (!canViewMarketing(org.role)) return { error: "Only an Admin, the Owner or a Purchasing Manager can use Marketing." };
  return { org: { organizationId: org.organizationId, userId: org.userId } };
}

async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

const mailerFor = (organizationId: string): Mailer => async (a) => {
  const r = await sendOrgEmail(organizationId, { to: a.to, subject: a.subject, text: a.text, html: a.html, fromName: a.fromName, replyTo: a.replyTo });
  return r.ok ? { ok: true } : { ok: false, error: r.error };
};

const refresh = () => revalidatePath("/dashboard/marketing", "layout");

export async function saveSettingsAction(input: SettingsInput): Promise<MarketingResult> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error };
  const r = await saveSettings(w.org, input ?? {});
  if (!r.ok) return r;
  refresh();
  return { ok: true, message: "Saved." };
}

export async function addContactAction(input: { firstName: string; lastName?: string; email?: string; phone?: string; company?: string }): Promise<MarketingResult> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error };
  const r = await addContact(w.org, input ?? { firstName: "" });
  if (!r.ok) return r;
  refresh();
  return { ok: true, id: r.id, message: "Contact added." };
}

export async function deleteContactAction(id: string): Promise<MarketingResult> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error };
  const r = await deleteContact(w.org, String(id));
  if (!r.ok) return r;
  refresh();
  return { ok: true };
}

/** Marks an address as unsubscribed (or takes it back) for one channel. Applies to customers and contacts alike. */
export async function setOptoutAction(channel: string, address: string, on: boolean): Promise<MarketingResult> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error };
  const r = await setOptout(w.org, channel === "TEXT" ? "TEXT" : "EMAIL", String(address), !!on);
  if (!r.ok) return r;
  refresh();
  return { ok: true };
}

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export async function importContactsAction(formData: FormData): Promise<MarketingResult> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a CSV or Excel file first." };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: "That file is over 5 MB. Split it into smaller files." };
  let sheet;
  try {
    sheet = parseSpreadsheetFile(Buffer.from(await file.arrayBuffer()), file.name);
  } catch {
    return { ok: false, error: "That file couldn't be read. Save it as .csv or .xlsx and try again." };
  }
  const read = contactsFromSheet(sheet.headers, sheet.rows);
  if (!read.contacts.length) return { ok: false, error: "No contacts were found. The file needs a column for email or phone (and ideally first name and last name)." };
  const r = await importContacts(w.org, read.contacts);
  refresh();
  const bits = [`${r.added} added`];
  if (r.existing) bits.push(`${r.existing} already in your contacts`);
  if (read.duplicate) bits.push(`${read.duplicate} repeated in the file`);
  if (read.skipped) bits.push(`${read.skipped} rows skipped (no usable email or phone)`);
  if (read.badEmail) bits.push(`${read.badEmail} emails ignored as not valid`);
  if (read.badPhone) bits.push(`${read.badPhone} phone numbers ignored as not valid`);
  return { ok: true, message: bits.join(", ") + "." };
}

export async function saveCampaignAction(input: { id?: string | null; channel: string; name: string; subject?: string; body: string; audience: string }): Promise<MarketingResult> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error };
  const r = await saveCampaign(w.org, { ...input, channel: input?.channel === "TEXT" ? "TEXT" : "EMAIL" });
  if (!r.ok) return r;
  refresh();
  return { ok: true, id: r.id, message: "Saved." };
}

export async function deleteCampaignAction(id: string): Promise<MarketingResult> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error };
  const r = await deleteCampaign(w.org, String(id));
  if (!r.ok) return r;
  refresh();
  return { ok: true };
}

/** How many people a choice of group would reach, shown beside the Audience menu. */
export async function previewAudienceAction(channel: string, audience: string): Promise<{ ok: true; reach: number; noAddress: number; optedOut: number; duplicates: number; cut: number } | { ok: false; error: string }> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error };
  if (!isAudience(audience)) return { ok: false, error: "Choose who it goes to." };
  const ch: Channel = channel === "TEXT" ? "TEXT" : "EMAIL";
  const a = await audienceFor(w.org.organizationId, ch, audience);
  return { ok: true, reach: a.recipients.length, noAddress: a.noAddress, optedOut: a.optedOut, duplicates: a.duplicates, cut: a.cut };
}

export async function sendTestAction(id: string, to: string): Promise<MarketingResult> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error };
  const addr = normEmail(to);
  if (!addr) return { ok: false, error: "That email address doesn't look right." };
  const r = await sendTest(w.org, String(id), addr, mailerFor(w.org.organizationId), await origin());
  return r.ok ? { ok: true, message: `A test was sent to ${addr}.` } : r;
}

/** Sends one batch (and starts the campaign on the first call). The page calls it again until `done`. */
export async function sendBatchAction(id: string): Promise<{ ok: true; progress: SendProgress } | { ok: false; error: string }> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error };
  const r = await sendBatch(w.org, String(id), mailerFor(w.org.organizationId), await origin());
  if (!r.ok) {
    refresh();
    return r;
  }
  if (r.done) refresh();
  return { ok: true, progress: { sent: r.sent, failed: r.failed, skipped: r.skipped, pending: r.pending, done: r.done } };
}

export async function cancelSendingAction(id: string): Promise<MarketingResult> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error };
  const r = await cancelSending(w.org, String(id));
  if (!r.ok) return r;
  refresh();
  return { ok: true };
}

export async function campaignProgressAction(id: string): Promise<SendProgress | null> {
  const w = await writer();
  if ("error" in w) return null;
  const c = await getCampaign(w.org.organizationId, String(id));
  return c ? campaignProgress(w.org.organizationId, c.id) : null;
}

