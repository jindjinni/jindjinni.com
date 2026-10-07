"use server";

// Customer Service: the only place the customer is emailed about a paid order. Nothing is sent automatically --
// an agent opens the order, checks the email (payment receipt, any adjustment and its documents) and presses Send.

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { receivingEmailTemplates, receivingPackages, receivingSettings, users } from "@/db/schema";
import { requireOrg, type CurrentOrg } from "@/lib/tenant";
import { canSendCustomerEmails, isAdmin } from "@/lib/permissions";
import { deliverCustomerEmail, auditReceiving } from "@/lib/receiving-service";
import { getEmailDraft } from "@/lib/customer-service-queries";
import { isEmailAddress } from "@/lib/customer-service-rules";
import { isTemplateKey, validateTemplate } from "@/lib/email-templates";
import { removeConnection, saveConnection, sendOrgEmail } from "@/lib/email-connector";
import { checkSmtpTarget, detectMail, verifySmtp, type Detected } from "@/lib/email-smtp";
import { textToHtml } from "@/lib/receiving-emails";
import { getReceivingSettings } from "@/lib/receiving-queries";

export type CsActionState = { ok?: boolean; error?: string; notice?: string };

const NOTE_MAX = 4000;

async function requireAgent(): Promise<CurrentOrg> {
  const org = await requireOrg();
  if (!canSendCustomerEmails(org.role)) throw new Error("Your role can't send customer emails.");
  return org;
}

async function ownPackage(organizationId: string, packageId: string) {
  const [p] = await db
    .select()
    .from(receivingPackages)
    .where(and(eq(receivingPackages.id, packageId), eq(receivingPackages.organizationId, organizationId)))
    .limit(1);
  return p ?? null;
}

function refresh(packageId: string) {
  revalidatePath("/dashboard/customer-service", "layout");
  revalidatePath("/dashboard/receiving", "layout");
  revalidatePath(`/dashboard/customer-service/order/${packageId}`);
}

/**
 * The note to the customer is the only part of the email an agent can change; the approved wording around it stays fixed.
 * Once the email has gone out the note is part of what was sent, so it can't be changed any more.
 */
export async function saveCustomerNote(packageId: string, note: string): Promise<CsActionState> {
  const org = await requireAgent();
  const p = await ownPackage(org.organizationId, packageId);
  if (!p) return { error: "That order wasn't found." };
  if (p.customerNotifiedAt) return { error: "This email was already sent, so its note can't be changed." };
  const clean = String(note ?? "").replace(/\r\n/g, "\n").trim().slice(0, NOTE_MAX);
  if ((p.customerEmailNote ?? "") === clean) return { ok: true };
  await db
    .update(receivingPackages)
    .set({ customerEmailNote: clean || null, updatedAt: sql`(current_timestamp)` })
    .where(eq(receivingPackages.id, packageId));
  await auditReceiving(org, p.quotationId, "customer-service", "Note to the customer edited before sending");
  refresh(packageId);
  return { ok: true };
}

/**
 * Sends the payment email: the payment receipt, plus the adjustment and its documents when there is one.
 * `resend` must be true to send again after it already went out.
 */
export async function sendPaymentEmail(packageId: string, resend = false): Promise<CsActionState> {
  const org = await requireAgent();
  const draft = await getEmailDraft(org, packageId);
  if (!draft) return { error: "That order wasn't found." };
  if (draft.alreadyEmailed && !resend) return { error: "This customer was already emailed. Use Resend if you need to send it again." };
  if (!draft.ready) return { error: `Not ready to send: ${draft.blockers[0]}` };
  const r = await deliverCustomerEmail(org, packageId, "STATUS");
  if (!r.ok) return { error: r.error };
  refresh(packageId);
  return {
    ok: true,
    notice: r.skipped ? `Email sent. ${r.skipped} attachment(s) were too large or unavailable and were left off.` : "Email sent to the customer.",
  };
}

/** The separate, manual packaging requirements warning (for packages that arrived in unacceptable packaging). */
export async function sendPackagingWarningEmail(packageId: string): Promise<CsActionState> {
  const org = await requireAgent();
  const p = await ownPackage(org.organizationId, packageId);
  if (!p) return { error: "That order wasn't found." };
  const r = await deliverCustomerEmail(org, packageId, "WARNING");
  if (!r.ok) return { error: r.error };
  refresh(packageId);
  return { ok: true, notice: "Packaging warning sent to the customer." };
}

const EMAIL_LIST_MAX = 5;

/** Email Settings (admin only): on/off switch, sender name, reply-to, hidden copies, and the two links used in the emails. */
export async function saveEmailSettings(formData: FormData): Promise<CsActionState> {
  const org = await requireOrg();
  if (!isAdmin(org.role)) return { error: "Only an owner or admin can change Email Settings." };
  const t = (raw: FormDataEntryValue | null, max: number) => {
    const v = typeof raw === "string" ? raw.trim().slice(0, max) : "";
    return v || null;
  };
  const replyTo = t(formData.get("replyTo"), 200);
  if (replyTo && !isEmailAddress(replyTo)) return { error: "Reply-to must be a valid email address." };
  const bccList = (t(formData.get("bccEmails"), 500) ?? "").split(/[,;\s]+/).filter(Boolean);
  if (bccList.some((e) => !isEmailAddress(e))) return { error: "One of the hidden-copy (BCC) addresses isn't valid." };
  if (bccList.length > EMAIL_LIST_MAX) return { error: `Add up to ${EMAIL_LIST_MAX} hidden-copy (BCC) addresses.` };
  const url = (raw: FormDataEntryValue | null): string | null | "bad" => {
    const v = t(raw, 500);
    if (!v) return null;
    return /^https:\/\/[^\s]+$/i.test(v) ? v : "bad";
  };
  const quote = url(formData.get("quoteLinkUrl"));
  const guide = url(formData.get("packagingGuideUrl"));
  if (quote === "bad" || guide === "bad") return { error: "Links must start with https://" };
  const emailsEnabled = formData.get("emailsEnabled") === "on" || formData.get("emailsEnabled") === "true";
  if (emailsEnabled && !quote) return { error: "Add your website link before turning emails on. Every email tells customers where to submit new orders." };

  const values = {
    emailsEnabled,
    fromName: t(formData.get("fromName"), 80),
    replyTo,
    bccEmails: bccList.length ? bccList.join(", ") : null,
    quoteLinkUrl: quote,
    packagingGuideUrl: guide,
  };
  await db
    .insert(receivingSettings)
    .values({ organizationId: org.organizationId, ...values })
    .onConflictDoUpdate({ target: receivingSettings.organizationId, set: { ...values, updatedAt: sql`(current_timestamp)` } });
  revalidatePath("/dashboard/customer-service", "layout");
  revalidatePath("/dashboard/receiving", "layout");
  return { ok: true };
}

/** Saves the edited wording of one email template (admin only). The same checks run here as in the editor. */
export async function saveEmailTemplate(key: string, subject: string, body: string): Promise<CsActionState> {
  const org = await requireOrg();
  if (!isAdmin(org.role)) return { error: "Only an owner or admin can edit the email templates." };
  if (!isTemplateKey(key)) return { error: "Unknown template." };
  const text = { subject: String(subject ?? ""), body: String(body ?? "").replace(/\r\n/g, "\n") };
  const errors = validateTemplate(key, text);
  if (errors.length) return { error: errors[0] };
  const values = { subject: text.subject.trim(), body: text.body.trim() };
  await db
    .insert(receivingEmailTemplates)
    .values({ organizationId: org.organizationId, templateKey: key, ...values, updatedByUserId: org.userId })
    .onConflictDoUpdate({
      target: [receivingEmailTemplates.organizationId, receivingEmailTemplates.templateKey],
      set: { ...values, updatedByUserId: org.userId, updatedAt: sql`(current_timestamp)` },
    });
  revalidatePath("/dashboard/customer-service", "layout");
  return { ok: true };
}

/** Puts one template back to the original wording (admin only). */
export async function resetEmailTemplate(key: string): Promise<CsActionState> {
  const org = await requireOrg();
  if (!isAdmin(org.role)) return { error: "Only an owner or admin can edit the email templates." };
  if (!isTemplateKey(key)) return { error: "Unknown template." };
  await db.delete(receivingEmailTemplates).where(and(eq(receivingEmailTemplates.organizationId, org.organizationId), eq(receivingEmailTemplates.templateKey, key)));
  revalidatePath("/dashboard/customer-service", "layout");
  return { ok: true };
}

/** Disconnects the company's own mailbox (admin only). Customer emails go back to the platform's sending address. */
export async function disconnectEmail(): Promise<CsActionState> {
  const org = await requireOrg();
  if (!isAdmin(org.role)) return { error: "Only an owner or admin can change the connected email." };
  await removeConnection(org.organizationId);
  revalidatePath("/dashboard/customer-service", "layout");
  return { ok: true };
}

/** Sends a short test message to the signed-in admin, through the same sender customers' emails use. */
export async function sendTestEmail(): Promise<CsActionState> {
  const org = await requireOrg();
  if (!isAdmin(org.role)) return { error: "Only an owner or admin can send a test email." };
  const [me] = await db.select({ email: users.email }).from(users).where(eq(users.id, org.userId)).limit(1);
  if (!me?.email) return { error: "Your account has no email address to send the test to." };
  const settings = await getReceivingSettings(org.organizationId);
  const company = settings.fromName.trim() || org.organizationName;
  const text = `This is a test from ${company}.\n\nIf you are reading this, customer emails can be sent from this address. Customers will see it as the sender.`;
  const r = await sendOrgEmail(org.organizationId, {
    to: me.email,
    subject: `Test email from ${company}`,
    text,
    html: textToHtml(text),
    fromName: settings.fromName.trim() || null,
    replyTo: settings.replyTo.trim() || null,
  });
  revalidatePath("/dashboard/customer-service", "layout");
  if (!r.ok) return { error: r.error };
  return { ok: true, notice: `Test email sent to ${me.email}${r.from ? ` from ${r.from}` : " from the platform's address"}.` };
}

/** Looks at an address (payables@theircompany.com) and says which way to connect it, and the mail server to try for "other". */
export async function detectMailbox(email: string): Promise<{ error?: string; detected?: Detected }> {
  const org = await requireOrg();
  if (!isAdmin(org.role)) return { error: "Only an owner or admin can connect an email." };
  const e = String(email ?? "").trim().toLowerCase();
  if (!isEmailAddress(e)) return { error: "Enter the full email address, like payables@yourcompany.com." };
  return { detected: await detectMail(e) };
}

/** Connects any other mailbox by its address and password (an app password where the host needs one). The login is tested first. */
export async function connectSmtp(email: string, password: string, host: string, port: number): Promise<CsActionState> {
  const org = await requireOrg();
  if (!isAdmin(org.role)) return { error: "Only an owner or admin can connect an email." };
  const e = String(email ?? "").trim().toLowerCase();
  const h = String(host ?? "").trim().toLowerCase();
  const pw = String(password ?? "");
  const pt = Number(port);
  if (!isEmailAddress(e)) return { error: "Enter the full email address, like payables@yourcompany.com." };
  if (!pw || pw.length > 200) return { error: "Enter the mailbox's password (or app password)." };
  if (!h) return { error: "Enter the mail server name (like smtp.yourhost.com)." };
  if (!Number.isInteger(pt)) return { error: "Enter the mail server's port." };
  const target = await checkSmtpTarget(h, pt);
  if (target) return { error: target };
  const login = await verifySmtp({ host: h, port: pt, user: e, pass: pw });
  if (login) return { error: login };
  await saveConnection(org.organizationId, org.userId, "SMTP", e, JSON.stringify({ host: h, port: pt, user: e, pass: pw }));
  revalidatePath("/dashboard/customer-service", "layout");
  return { ok: true, notice: "Connected. Customer emails will now be sent from this address." };
}
