"use server";

// Customer Service: the only place the customer is emailed about a paid order. Nothing is sent automatically --
// an agent opens the order, checks the email (payment receipt, any adjustment and its documents) and presses Send.

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { receivingEmailTemplates, receivingPackages, receivingSettings } from "@/db/schema";
import { requireOrg, type CurrentOrg } from "@/lib/tenant";
import { canSendCustomerEmails, isAdmin } from "@/lib/permissions";
import { deliverCustomerEmail, auditReceiving } from "@/lib/receiving-service";
import { getEmailDraft } from "@/lib/customer-service-queries";
import { isEmailAddress } from "@/lib/customer-service-rules";
import { isTemplateKey, validateTemplate } from "@/lib/email-templates";

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
