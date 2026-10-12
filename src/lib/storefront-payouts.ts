// Staff side of the direct-deposit details a seller sent with a website request. Every function takes the organizationId of the SIGNED-IN
// person and filters by it. The page lists only the last 4 digits; the full details are decrypted only in revealPayout, which the action
// allows for owners, admins and Accounts, and which writes who looked and when (never the numbers) to the audit trail.

import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import { purchasingAuditLog, receivingPackages, websiteRequestPayouts, websiteRequests } from "@/db/schema";
import { decryptBank } from "@/lib/bank-crypto";
import { payoutFromJson, type Payout } from "@/lib/bank-rules";
import { newId } from "@/lib/ids";

export type PayoutSummary = { accountLast4: string; accountType: string; erasedAt: string | null };

export async function payoutSummaries(organizationId: string, requestIds: string[]): Promise<Map<string, PayoutSummary>> {
  const out = new Map<string, PayoutSummary>();
  if (requestIds.length === 0) return out;
  const rows = await db
    .select({ requestId: websiteRequestPayouts.requestId, accountLast4: websiteRequestPayouts.accountLast4, accountType: websiteRequestPayouts.accountType, erasedAt: websiteRequestPayouts.erasedAt })
    .from(websiteRequestPayouts)
    .where(and(eq(websiteRequestPayouts.organizationId, organizationId), inArray(websiteRequestPayouts.requestId, requestIds)));
  for (const r of rows) out.set(r.requestId, { accountLast4: r.accountLast4, accountType: r.accountType, erasedAt: r.erasedAt });
  return out;
}

async function audit(organizationId: string, userId: string, requestId: string, field: string, note: string) {
  // The note says who/what, never a number (the last 4 digits are already shown on the page).
  await db.insert(purchasingAuditLog).values({ id: newId("paudit"), organizationId, userId, recordType: "website_request", recordId: requestId, fieldName: field, previousValue: null, newValue: null, note });
}

export type RevealResult = { ok: true; details: Payout } | { ok: false; error: string };

/** Decrypts one request's details for a person who is allowed to see them, and records that they looked. */
export async function revealPayout(organizationId: string, userId: string, requestId: string): Promise<RevealResult> {
  const [row] = await db
    .select()
    .from(websiteRequestPayouts)
    .where(and(eq(websiteRequestPayouts.requestId, requestId), eq(websiteRequestPayouts.organizationId, organizationId)))
    .limit(1);
  if (!row) return { ok: false, error: "No bank details were sent with this request." };
  if (!row.payloadEnc || row.erasedAt) return { ok: false, error: "These bank details were erased." };
  const plain = decryptBank(row.payloadEnc, `${organizationId}|${requestId}`);
  const details = plain ? payoutFromJson(plain) : null;
  if (!details) {
    console.error("[storefront-payouts] could not read stored bank details for request", requestId);
    return { ok: false, error: "These bank details can't be read (the encryption key may have changed). Ask the seller to send them again." };
  }
  await audit(organizationId, userId, requestId, "bank_details_revealed", `Looked at the bank details (account ending ${row.accountLast4})`);
  return { ok: true, details };
}

/** Erases the encrypted details once they are no longer needed (after the seller is paid). The last 4 digits and the dates stay. */
export async function erasePayout(organizationId: string, userId: string, requestId: string): Promise<{ ok: boolean; error?: string }> {
  const now = new Date().toISOString();
  const res = await db
    .update(websiteRequestPayouts)
    .set({ payloadEnc: null, erasedAt: now, erasedByUserId: userId, updatedAt: now })
    .where(and(eq(websiteRequestPayouts.requestId, requestId), eq(websiteRequestPayouts.organizationId, organizationId), isNotNull(websiteRequestPayouts.payloadEnc)));
  if (res.rowsAffected === 0) return { ok: false, error: "No bank details to erase on this request." };
  await audit(organizationId, userId, requestId, "bank_details_erased", "Erased the stored bank details");
  return { ok: true };
}

/**
 * The seller's direct-deposit summary for a shipment, when the order came from the website (so Accounts can see where to pay it).
 * Joined through the shipment's quotation and filtered by company; only the last 4 digits ever leave here.
 */
export async function payoutForShipment(organizationId: string, packageId: string): Promise<{ requestId: string; reference: string; summary: PayoutSummary } | null> {
  const [row] = await db
    .select({ requestId: websiteRequests.id, reference: websiteRequests.reference })
    .from(receivingPackages)
    .innerJoin(websiteRequests, and(eq(websiteRequests.quotationId, receivingPackages.quotationId), eq(websiteRequests.organizationId, receivingPackages.organizationId)))
    .where(and(eq(receivingPackages.id, packageId), eq(receivingPackages.organizationId, organizationId)))
    .limit(1);
  if (!row) return null;
  const summary = (await payoutSummaries(organizationId, [row.requestId])).get(row.requestId);
  return summary ? { ...row, summary } : null;
}
