// Customer payment-details links -- the database side. Rules and wording are in payout-link-rules.ts.
// Every staff function takes the organizationId of the SIGNED-IN person and filters by it. The public page finds a row only by the HASH of the
// link's token; the company, order and customer come from that row, never from anything the visitor sends. The details are stored encrypted
// (bank-crypto.ts, bound to company + link) and are decrypted only in revealLinkDetails, for people allowed to see them, with an audit row that
// never contains a number. Nothing here logs or returns payloadEnc.

import { and, desc, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { organizations, purchasingAuditLog, purchasingQuotations, quotationPayoutLinks, receivingPackages } from "@/db/schema";
import { decryptBank, encryptBank } from "@/lib/bank-crypto";
import { newId } from "@/lib/ids";
import { featureOn } from "@/lib/features";
import { isHeldBack } from "@/lib/tenant";
import { operationHeld } from "@/lib/second-business-rules";
import { appUrl } from "@/lib/password-reset";
import {
  customerLinkState, detailsFromJson, detailsToJson, hashLinkToken, linkUrl, looksLikeLinkToken, newLinkToken, staffLinkState,
  type CustomerLinkState, type PayoutDetails, type StaffLinkState,
} from "@/lib/payout-link-rules";

const aadFor = (organizationId: string, linkId: string) => `${organizationId}|plink|${linkId}`;
const tokAad = (organizationId: string, linkId: string) => `${organizationId}|plink-token|${linkId}`;

async function audit(organizationId: string, userId: string | null, quotationId: string, field: string, note: string) {
  // The note says who/what, never a number.
  await db.insert(purchasingAuditLog).values({ id: newId("paudit"), organizationId, userId, recordType: "quotation", recordId: quotationId, fieldName: field, previousValue: null, newValue: null, note });
}

export type LinkSummary = {
  id: string; state: StaffLinkState; reason: string | null; reasonNote: string | null; method: string | null; accountLast4: string | null; accountType: string | null;
  expiresAt: string; submittedAt: string | null; emailedTo: string | null; emailedAt: string | null; erasedAt: string | null; createdAt: string;
};

/** The newest link of one order, with no numbers in it. */
export async function linkSummaryForQuotation(organizationId: string, quotationId: string): Promise<LinkSummary | null> {
  const [r] = await db
    .select()
    .from(quotationPayoutLinks)
    .where(and(eq(quotationPayoutLinks.organizationId, organizationId), eq(quotationPayoutLinks.quotationId, quotationId)))
    .orderBy(desc(quotationPayoutLinks.createdAt), desc(quotationPayoutLinks.id))
    .limit(1);
  if (!r) return null;
  return {
    id: r.id, state: staffLinkState(r, Date.now()), reason: r.reason, reasonNote: r.reasonNote, method: r.method, accountLast4: r.accountLast4, accountType: r.accountType, expiresAt: r.expiresAt,
    submittedAt: r.submittedAt, emailedTo: r.emailedTo, emailedAt: r.emailedAt, erasedAt: r.erasedAt, createdAt: r.createdAt,
  };
}

/** The address to copy, for a link that is still waiting (the token is kept encrypted so staff can copy it again). */
export async function linkAddressFor(organizationId: string, linkId: string): Promise<string | null> {
  const [r] = await db
    .select()
    .from(quotationPayoutLinks)
    .where(and(eq(quotationPayoutLinks.id, linkId), eq(quotationPayoutLinks.organizationId, organizationId)))
    .limit(1);
  if (!r || r.status !== "OPEN" || !r.tokenEnc || Date.parse(r.expiresAt) <= Date.now()) return null;
  const token = decryptBank(r.tokenEnc, tokAad(organizationId, r.id));
  return token && looksLikeLinkToken(token) ? linkUrl(appUrl(), token) : null;
}

export type MakeLinkResult = { ok: true; linkId: string; url: string } | { ok: false; error: string };

/**
 * Makes a new link for an order. A new link ends the older waiting one. If the customer already sent details that are still stored, they are
 * kept unless `replaceReceived` is true (then they are erased and the new link replaces them).
 */
export async function makeLink(organizationId: string, userId: string, quotationId: string, opts: { replaceReceived?: boolean; reason: string; reasonNote?: string | null }): Promise<MakeLinkResult> {
  const [q] = await db
    .select({ id: purchasingQuotations.id, number: purchasingQuotations.quotationNumber })
    .from(purchasingQuotations)
    .where(and(eq(purchasingQuotations.id, quotationId), eq(purchasingQuotations.organizationId, organizationId)))
    .limit(1);
  if (!q) return { ok: false, error: "That order wasn't found." };
  if (await orderIsPaid(organizationId, quotationId)) return { ok: false, error: "This order is already paid, so it doesn't need payment details." };

  const received = await db
    .select({ id: quotationPayoutLinks.id })
    .from(quotationPayoutLinks)
    .where(and(eq(quotationPayoutLinks.organizationId, organizationId), eq(quotationPayoutLinks.quotationId, quotationId), eq(quotationPayoutLinks.status, "SUBMITTED"), isNull(quotationPayoutLinks.erasedAt)));
  if (received.length && !opts.replaceReceived) return { ok: false, error: "The customer already sent payment details for this order. Choose \"Ask for new details\" if you want them to send them again." };

  const now = new Date().toISOString();
  // end every older link of this order (the details of a replaced one are erased)
  await db
    .update(quotationPayoutLinks)
    .set({ status: "CANCELLED", cancelledAt: now, tokenEnc: null, payloadEnc: null, erasedAt: sql`coalesce(erased_at, ${now})`, erasedByUserId: userId, erasedReason: "replaced by a new link", updatedAt: now })
    .where(and(eq(quotationPayoutLinks.organizationId, organizationId), eq(quotationPayoutLinks.quotationId, quotationId), ne(quotationPayoutLinks.status, "CANCELLED")));

  const id = newId("plink");
  const t = newLinkToken(Date.now());
  await db.insert(quotationPayoutLinks).values({
    id, organizationId, quotationId, tokenHash: t.tokenHash, tokenEnc: encryptBank(t.token, tokAad(organizationId, id)), status: "OPEN", expiresAt: t.expiresAt, createdByUserId: userId, reason: opts.reason, reasonNote: opts.reasonNote ?? null,
  });
  await audit(organizationId, userId, quotationId, "payment_link_made", `Made a payment-details link for ${q.number} (${opts.reason}${opts.reasonNote ? ": " + opts.reasonNote : ""})${received.length ? " (the earlier details were erased)" : ""}`);
  return { ok: true, linkId: id, url: linkUrl(appUrl(), t.token) };
}

/** Ends the waiting link (the customer's page then says it is closed). Details already sent are kept unless erased separately. */
export async function cancelLink(organizationId: string, userId: string, quotationId: string): Promise<{ ok: boolean; error?: string }> {
  const now = new Date().toISOString();
  const res = await db
    .update(quotationPayoutLinks)
    .set({ status: "CANCELLED", cancelledAt: now, tokenEnc: null, updatedAt: now })
    .where(and(eq(quotationPayoutLinks.organizationId, organizationId), eq(quotationPayoutLinks.quotationId, quotationId), eq(quotationPayoutLinks.status, "OPEN")));
  if (res.rowsAffected === 0) return { ok: false, error: "There is no waiting link to cancel." };
  await audit(organizationId, userId, quotationId, "payment_link_cancelled", "Cancelled the payment-details link");
  return { ok: true };
}

export async function noteEmailed(organizationId: string, userId: string, quotationId: string, linkId: string, to: string) {
  const now = new Date().toISOString();
  await db
    .update(quotationPayoutLinks)
    .set({ emailedTo: to, emailedAt: now, updatedAt: now })
    .where(and(eq(quotationPayoutLinks.id, linkId), eq(quotationPayoutLinks.organizationId, organizationId)));
  await audit(organizationId, userId, quotationId, "payment_link_emailed", `Emailed the payment-details link to ${to}`);
}

async function orderIsPaid(organizationId: string, quotationId: string): Promise<boolean> {
  const [p] = await db
    .select({ id: receivingPackages.id })
    .from(receivingPackages)
    .where(and(eq(receivingPackages.organizationId, organizationId), eq(receivingPackages.quotationId, quotationId), eq(receivingPackages.accountsStatus, "PAID")))
    .limit(1);
  return !!p;
}

// ---- what the customer's page sees ----------------------------------------------------------------------------------------------------

export type PublicLink = {
  id: string; state: CustomerLinkState; companyName: string; quotationNumber: string; customerName: string;
  receivedLine: string | null; expiresAt: string;
};

/** Looks the link up by its token's hash. Returns null for anything that is not a real link. */
export async function publicLinkByToken(token: string): Promise<PublicLink | null> {
  if (!looksLikeLinkToken(token)) return null;
  const [r] = await db
    .select({
      link: quotationPayoutLinks,
      companyName: organizations.name,
      parent: organizations.parentOrganizationId,
      closedAt: organizations.closedAt,
      approval: organizations.approvalStatus,
      number: purchasingQuotations.quotationNumber,
      customer: purchasingQuotations.customerNameSnapshot,
    })
    .from(quotationPayoutLinks)
    .innerJoin(organizations, eq(organizations.id, quotationPayoutLinks.organizationId))
    .innerJoin(purchasingQuotations, and(eq(purchasingQuotations.id, quotationPayoutLinks.quotationId), eq(purchasingQuotations.organizationId, quotationPayoutLinks.organizationId)))
    .where(eq(quotationPayoutLinks.tokenHash, hashLinkToken(token)))
    .limit(1);
  if (!r) return null;
  // A company that is closed, suspended, banned or not approved (or whose main company is), or that has the feature switched off, stops its
  // links working at once: the customer sees the same "isn't valid" page as for a made-up link, and nothing about the company.
  if (r.closedAt) return null;
  if (r.parent) {
    const [main] = await db.select({ closedAt: organizations.closedAt, approval: organizations.approvalStatus }).from(organizations).where(eq(organizations.id, r.parent)).limit(1);
    if (!main || main.closedAt || isHeldBack(main.approval) || operationHeld(r.parent, r.approval)) return null;
  } else if (isHeldBack(r.approval)) return null;
  if (!(await featureOn("payout-links", r.link.organizationId))) return null;
  const paid = await orderIsPaid(r.link.organizationId, r.link.quotationId);
  const state = customerLinkState(r.link, paid, Date.now());
  return {
    id: r.link.id, state, companyName: r.companyName, quotationNumber: r.number, customerName: r.customer, expiresAt: r.link.expiresAt,
    receivedLine: r.link.status === "SUBMITTED" && r.link.accountLast4 ? `${r.link.accountType === "savings" ? "Savings" : "Checking"} account ending ${r.link.accountLast4}` : null,
  };
}

export type SubmitResult = { ok: true } | { ok: false; error: string };

/**
 * Saves what the customer typed, encrypted. A link works ONE time: only an OPEN link can be written to, and the conditional update (status
 * must still be OPEN) makes a second submit, a cancelled / erased / expired link impossible even if two requests race.
 * A correction needs a new link from Purchasing ("Ask for new details").
 */
export async function submitLinkDetails(token: string, details: PayoutDetails): Promise<SubmitResult> {
  const pub = await publicLinkByToken(token);
  if (!pub) return { ok: false, error: "This link isn't valid." };
  if (pub.state === "expired") return { ok: false, error: "This link has expired. Please ask us for a new one." };
  if (pub.state === "received") return { ok: false, error: "We already received your details through this link. It can only be used once. If something needs fixing, please contact us and we will send you a new link." };
  if (pub.state === "closed") return { ok: false, error: "This link is closed. If you still need to send your details, please ask us for a new link." };
  if (pub.state === "invalid") return { ok: false, error: "This link isn't valid." };

  const [row] = await db.select().from(quotationPayoutLinks).where(eq(quotationPayoutLinks.id, pub.id)).limit(1);
  if (!row) return { ok: false, error: "This link isn't valid." };
  const now = new Date().toISOString();
  const res = await db
    .update(quotationPayoutLinks)
    .set({
      status: "SUBMITTED", method: details.method, payloadEnc: encryptBank(detailsToJson(details), aadFor(row.organizationId, row.id)),
      accountLast4: details.accountNumber.slice(-4), accountType: details.accountType, submittedAt: now, updatedAt: now,
    })
    .where(and(eq(quotationPayoutLinks.id, row.id), eq(quotationPayoutLinks.status, "OPEN"), isNull(quotationPayoutLinks.erasedAt), sql`${quotationPayoutLinks.expiresAt} > ${now}`));
  if (res.rowsAffected === 0) return { ok: false, error: "This link is closed. If you still need to send your details, please ask us for a new link." };
  await audit(row.organizationId, null, row.quotationId, "payment_details_received", `The customer sent payment details (${details.method}, account ending ${details.accountNumber.slice(-4)})`);
  return { ok: true };
}

// ---- staff: look at, erase -----------------------------------------------------------------------------------------------------------

export type RevealLinkResult = { ok: true; details: PayoutDetails } | { ok: false; error: string };

/** Decrypts the details for a person who is allowed to see them (the caller checks), and records that they looked. */
export async function revealLinkDetails(organizationId: string, userId: string, quotationId: string): Promise<RevealLinkResult> {
  const [row] = await db
    .select()
    .from(quotationPayoutLinks)
    .where(and(eq(quotationPayoutLinks.organizationId, organizationId), eq(quotationPayoutLinks.quotationId, quotationId), eq(quotationPayoutLinks.status, "SUBMITTED")))
    .orderBy(desc(quotationPayoutLinks.createdAt))
    .limit(1);
  if (!row) return { ok: false, error: "The customer hasn't sent payment details for this order." };
  if (!row.payloadEnc || row.erasedAt) return { ok: false, error: "These payment details were erased." };
  const plain = decryptBank(row.payloadEnc, aadFor(organizationId, row.id));
  const details = plain ? detailsFromJson(plain) : null;
  if (!details) {
    console.error("[payout-links] could not read stored details for link", row.id);
    return { ok: false, error: "These details can't be read (the encryption key may have changed). Ask the customer to send them again." };
  }
  await audit(organizationId, userId, quotationId, "payment_details_revealed", `Looked at the customer's payment details (account ending ${row.accountLast4})`);
  return { ok: true, details };
}

/** Erases the encrypted details (after paying). The last 4 digits and the dates stay. `userId` null = the system (order marked Paid). */
export async function erasePaymentDetails(organizationId: string, userId: string | null, quotationId: string, reason: string): Promise<{ ok: boolean; error?: string }> {
  const now = new Date().toISOString();
  const res = await db
    .update(quotationPayoutLinks)
    .set({ payloadEnc: null, tokenEnc: null, erasedAt: now, erasedByUserId: userId, erasedReason: reason, updatedAt: now })
    .where(and(eq(quotationPayoutLinks.organizationId, organizationId), eq(quotationPayoutLinks.quotationId, quotationId), isNotNull(quotationPayoutLinks.payloadEnc)));
  if (res.rowsAffected === 0) return { ok: false, error: "There are no stored payment details to erase on this order." };
  await audit(organizationId, userId, quotationId, "payment_details_erased", `Erased the stored payment details (${reason})`);
  return { ok: true };
}

/** For the Accounts page: the newest received details of an order, summary only. */
export async function receivedSummaryForQuotation(organizationId: string, quotationId: string): Promise<LinkSummary | null> {
  const s = await linkSummaryForQuotation(organizationId, quotationId);
  return s && (s.state === "received" || s.state === "erased") && s.submittedAt ? s : null;
}

/** For the Accounts order page (a shipment): the customer's received payment details of its quotation, summary only. */
export async function receivedSummaryForPackage(organizationId: string, packageId: string): Promise<(LinkSummary & { quotationId: string }) | null> {
  const [p] = await db
    .select({ quotationId: receivingPackages.quotationId })
    .from(receivingPackages)
    .where(and(eq(receivingPackages.id, packageId), eq(receivingPackages.organizationId, organizationId)))
    .limit(1);
  if (!p?.quotationId) return null;
  const s = await receivedSummaryForQuotation(organizationId, p.quotationId);
  return s ? { ...s, quotationId: p.quotationId } : null;
}

/** The customer's payment details are not needed once the order is Paid: erase them (last 4 digits and dates stay). Never blocks the payment. */
export async function eraseDetailsWhenPaid(organizationId: string, quotationId: string | null | undefined): Promise<void> {
  if (!quotationId) return;
  try {
    await erasePaymentDetails(organizationId, null, quotationId, "the order was marked Paid");
  } catch (err) {
    console.error("[payout-links] could not erase on Paid:", err instanceof Error ? err.message : "error");
  }
}

export type PaidBefore = { paidOrders: number; lastPaidDay: string | null; otherOrders: number };

/** Has this customer been paid before? Looks at the customer's OTHER orders in the same company (paid shipments), so Purchasing knows whether to ask. */
export async function paidBeforeFor(organizationId: string, quotationId: string): Promise<PaidBefore> {
  const [q] = await db
    .select({ customerId: purchasingQuotations.customerId })
    .from(purchasingQuotations)
    .where(and(eq(purchasingQuotations.id, quotationId), eq(purchasingQuotations.organizationId, organizationId)))
    .limit(1);
  if (!q) return { paidOrders: 0, lastPaidDay: null, otherOrders: 0 };
  const others = await db
    .select({ id: purchasingQuotations.id })
    .from(purchasingQuotations)
    .where(and(eq(purchasingQuotations.organizationId, organizationId), eq(purchasingQuotations.customerId, q.customerId), ne(purchasingQuotations.id, quotationId)));
  if (others.length === 0) return { paidOrders: 0, lastPaidDay: null, otherOrders: 0 };
  const paid = await db
    .select({ paidAt: receivingPackages.paidAt })
    .from(receivingPackages)
    .where(and(eq(receivingPackages.organizationId, organizationId), eq(receivingPackages.accountsStatus, "PAID"), inArray(receivingPackages.quotationId, others.map((o) => o.id))))
    .orderBy(desc(receivingPackages.paidAt));
  return { paidOrders: paid.length, lastPaidDay: paid[0]?.paidAt ? String(paid[0].paidAt).slice(0, 10) : null, otherOrders: others.length };
}
