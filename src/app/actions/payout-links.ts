"use server";

// Staff side of the customer payment-details links. Every action: signed in, not "view as", flag on for this company, and the right role
// (making / cancelling / emailing a link = whoever works in Purchasing; seeing or erasing the numbers = owner, admins and Accounts only).
// Nothing returned from here contains a number except revealPayoutLinkAction, which records who looked.

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { purchasingQuotations } from "@/db/schema";
import { requireOrg, type CurrentOrg } from "@/lib/tenant";
import { canRevealBankDetails, canWritePurchasing } from "@/lib/permissions";
import { featureOn } from "@/lib/features";
import { sendDeptEmail } from "@/lib/mail-system";
import { cancelLink, erasePaymentDetails, linkAddressFor, linkSummaryForQuotation, makeLink, noteEmailed, receiptCompanyName, revealLinkDetails } from "@/lib/payout-link-service";
import { cleanReason, linkEmailContent, type PayoutDetails } from "@/lib/payout-link-rules";

type Gate = { org: CurrentOrg } | { error: string };

async function gate(kind: "purchasing" | "bank"): Promise<Gate> {
  const org = await requireOrg();
  if (org.viewAs) return { error: "Viewing a company is read-only." };
  if (!(await featureOn("payout-links", org.organizationId))) return { error: "Payment-details links aren't switched on for this company yet." };
  if (kind === "purchasing" && !canWritePurchasing(org.role, org.access)) return { error: "Only Purchasing can send payment-details links." };
  if (kind === "bank" && !canRevealBankDetails(org.role, org.access)) return { error: "Your role can't see payment details. Ask an owner, an admin or Accounts." };
  return { org };
}

const refresh = (quotationId: string) => {
  revalidatePath(`/dashboard/purchasing/quotations/${quotationId}`);
  revalidatePath("/dashboard/accounts", "layout");
};

export type LinkActionResult = { error?: string; url?: string; message?: string };

export async function makePayoutLinkAction(quotationId: string, reason: string, reasonNote: string, replaceReceived = false): Promise<LinkActionResult> {
  const g = await gate("purchasing");
  if ("error" in g) return { error: g.error };
  const why = cleanReason(reason, reasonNote);
  if (!why.ok) return { error: why.error };
  const r = await makeLink(g.org.organizationId, g.org.userId, quotationId, { replaceReceived, reason: why.reason, reasonNote: why.note });
  if (!r.ok) return { error: r.error };
  refresh(quotationId);
  return { url: r.url };
}

/** The address of the waiting link, so staff can copy it again. */
export async function copyPayoutLinkAction(quotationId: string): Promise<LinkActionResult> {
  const g = await gate("purchasing");
  if ("error" in g) return { error: g.error };
  const s = await linkSummaryForQuotation(g.org.organizationId, quotationId);
  const url = s && s.state === "waiting" ? await linkAddressFor(g.org.organizationId, s.id) : null;
  return url ? { url } : { error: "There is no waiting link to copy. Make a new one." };
}

export async function cancelPayoutLinkAction(quotationId: string): Promise<LinkActionResult> {
  const g = await gate("purchasing");
  if ("error" in g) return { error: g.error };
  const r = await cancelLink(g.org.organizationId, g.org.userId, quotationId);
  if (!r.ok) return { error: r.error };
  refresh(quotationId);
  return { message: "The link was cancelled." };
}

export type EmailPreview = { error?: string; to?: string; subject?: string; text?: string };

/** The email as it will go out, for the person to read before pressing Send. Nothing is sent here. */
export async function previewPayoutLinkEmailAction(quotationId: string): Promise<EmailPreview> {
  const g = await gate("purchasing");
  if ("error" in g) return { error: g.error };
  const c = await composeEmail(g.org.organizationId, quotationId);
  return "error" in c ? { error: c.error } : { to: c.to, subject: c.mail.subject, text: c.mail.text };
}

async function composeEmail(organizationId: string, quotationId: string) {
  const s = await linkSummaryForQuotation(organizationId, quotationId);
  if (!s || s.state !== "waiting") return { error: "Make a link first (or make a new one if it ran out)." };
  const url = await linkAddressFor(organizationId, s.id);
  if (!url) return { error: "The link can't be read. Make a new one." };
  const [q] = await db
    .select({ number: purchasingQuotations.quotationNumber, name: purchasingQuotations.customerNameSnapshot, email: purchasingQuotations.customerEmailSnapshot })
    .from(purchasingQuotations)
    .where(and(eq(purchasingQuotations.id, quotationId), eq(purchasingQuotations.organizationId, organizationId)))
    .limit(1);
  if (!q) return { error: "That order wasn't found." };
  return { linkId: s.id, to: q.email ?? "", mail: linkEmailContent({ companyName: await receiptCompanyName(organizationId), quotationNumber: q.number, customerName: q.name, url, reason: s.reason }) };
}

/** Sends it. Only runs when a person presses Send. The wording is built again on the server; only the address can be changed. */
export async function sendPayoutLinkEmailAction(quotationId: string, to: string): Promise<LinkActionResult> {
  const g = await gate("purchasing");
  if ("error" in g) return { error: g.error };
  const address = String(to ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(address)) return { error: "Enter a valid email address to send it to." };
  const c = await composeEmail(g.org.organizationId, quotationId);
  if ("error" in c) return { error: c.error };
  const sent = await sendDeptEmail(
    g.org.organizationId,
    { dept: "purchasing", relatedKind: "payout_link", relatedId: quotationId, by: { userId: g.org.userId, name: null } },
    { to: address, subject: c.mail.subject, text: c.mail.text, html: c.mail.html },
  );
  if (!sent.ok) return { error: sent.error };
  await noteEmailed(g.org.organizationId, g.org.userId, quotationId, c.linkId, address);
  refresh(quotationId);
  return { message: `Sent to ${address}.` };
}

export type RevealPayoutView = { error?: string; details?: PayoutDetails };

/** Shows the full details to one person who is allowed, once, and records that they looked. Nothing is kept on the page afterwards. */
export async function revealPayoutLinkAction(quotationId: string): Promise<RevealPayoutView> {
  const g = await gate("bank");
  if ("error" in g) return { error: g.error };
  const r = await revealLinkDetails(g.org.organizationId, g.org.userId, quotationId);
  return r.ok ? { details: r.details } : { error: r.error };
}

export async function erasePayoutLinkAction(quotationId: string): Promise<{ error?: string; erased?: boolean }> {
  const g = await gate("bank");
  if ("error" in g) return { error: g.error };
  const r = await erasePaymentDetails(g.org.organizationId, g.org.userId, quotationId, "erased by a person");
  refresh(quotationId);
  return r.ok ? { erased: true } : { error: r.error };
}
