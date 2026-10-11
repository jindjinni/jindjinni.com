// Staff side of company storefronts: the storefront's settings and the "Website requests" list in Purchasing.
// Every function takes the organizationId of the SIGNED-IN person (from requireOrg) and filters by it; the public side is separate
// (storefront-public.ts). Nothing here deletes a request: it is hidden or declined instead, so the record stays.

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { purchasingAuditLog, purchasingCustomers, purchasingQuotations, storefronts, websiteRequests } from "@/db/schema";
import { newId } from "@/lib/ids";
import { getNextQuotationNumber } from "@/lib/queries";
import { canMoveTo, quotationNoteFor, splitName, type RequestStatus } from "@/lib/storefront-rules";

export type StorefrontRow = typeof storefronts.$inferSelect;
export type RequestRow = typeof websiteRequests.$inferSelect;

export async function getStorefront(organizationId: string): Promise<StorefrontRow | null> {
  const [row] = await db.select().from(storefronts).where(eq(storefronts.organizationId, organizationId)).limit(1);
  return row ?? null;
}

export type SaveResult = { ok: true } | { ok: false; error: string };

/** Creates or updates the company's storefront. A web address already used by another company is refused with a plain message. */
export async function saveStorefront(
  organizationId: string,
  v: { handle: string; displayName: string; welcomeText: string | null; sellOpen: boolean; buyOpen: boolean; ordersOpen: boolean; orderReviewOver: number | null; hidden: boolean },
): Promise<SaveResult> {
  const [clash] = await db.select({ organizationId: storefronts.organizationId }).from(storefronts).where(eq(storefronts.handle, v.handle)).limit(1);
  if (clash && clash.organizationId !== organizationId) return { ok: false, error: "That web address is already taken. Please choose another." };
  const now = new Date().toISOString();
  const hiddenAt = v.hidden ? now : null;
  const existing = await getStorefront(organizationId);
  try {
    if (existing) {
      await db
        .update(storefronts)
        .set({ handle: v.handle, displayName: v.displayName, welcomeText: v.welcomeText, sellOpen: v.sellOpen, buyOpen: v.buyOpen, ordersOpen: v.ordersOpen, orderReviewOver: v.orderReviewOver, hiddenAt: v.hidden ? existing.hiddenAt ?? now : null, updatedAt: now })
        .where(eq(storefronts.organizationId, organizationId));
    } else {
      await db.insert(storefronts).values({ id: newId("sfront"), organizationId, handle: v.handle, displayName: v.displayName, welcomeText: v.welcomeText, sellOpen: v.sellOpen, buyOpen: v.buyOpen, ordersOpen: v.ordersOpen, orderReviewOver: v.orderReviewOver, hiddenAt });
    }
  } catch (err) {
    if (String(err).toLowerCase().includes("unique")) return { ok: false, error: "That web address is already taken. Please choose another." };
    throw err;
  }
  return { ok: true };
}

export async function listWebsiteRequests(organizationId: string, includeHidden: boolean): Promise<RequestRow[]> {
  return db
    .select()
    .from(websiteRequests)
    .where(includeHidden ? eq(websiteRequests.organizationId, organizationId) : and(eq(websiteRequests.organizationId, organizationId), isNull(websiteRequests.hiddenAt)))
    .orderBy(desc(websiteRequests.createdAt))
    .limit(500);
}

/** How many requests are waiting (New and not hidden), for the tab and the page heading. */
export async function newRequestCount(organizationId: string): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)` })
    .from(websiteRequests)
    .where(and(eq(websiteRequests.organizationId, organizationId), eq(websiteRequests.status, "NEW"), isNull(websiteRequests.hiddenAt)));
  return Number(r?.n ?? 0);
}

async function audit(organizationId: string, userId: string, requestId: string, field: string, from: string | null, to: string | null, note?: string) {
  await db.insert(purchasingAuditLog).values({ id: newId("paudit"), organizationId, userId, recordType: "website_request", recordId: requestId, fieldName: field, previousValue: from, newValue: to, note: note ?? null });
}

export type MoveResult = { ok: true } | { ok: false; error: string };

/** Declines a New request, or reopens a declined one. The change is claimed with one conditional update, so two clicks can't both win. */
export async function moveRequest(organizationId: string, userId: string, requestId: string, to: "DECLINED" | "NEW"): Promise<MoveResult> {
  const [row] = await db.select().from(websiteRequests).where(and(eq(websiteRequests.id, requestId), eq(websiteRequests.organizationId, organizationId))).limit(1);
  if (!row) return { ok: false, error: "Request not found." };
  if (!canMoveTo(row.status as RequestStatus, to)) return { ok: false, error: "This request has already been handled." };
  const now = new Date().toISOString();
  const res = await db
    .update(websiteRequests)
    .set({ status: to, handledByUserId: userId, handledAt: now, updatedAt: now })
    .where(and(eq(websiteRequests.id, requestId), eq(websiteRequests.organizationId, organizationId), eq(websiteRequests.status, row.status)));
  if (res.rowsAffected === 0) return { ok: false, error: "This request has already been handled." };
  await audit(organizationId, userId, requestId, "status", row.status, to);
  return { ok: true };
}

export async function setRequestHidden(organizationId: string, userId: string, requestId: string, hidden: boolean): Promise<MoveResult> {
  const now = new Date().toISOString();
  const res = await db
    .update(websiteRequests)
    .set({ hiddenAt: hidden ? now : null, updatedAt: now })
    .where(and(eq(websiteRequests.id, requestId), eq(websiteRequests.organizationId, organizationId)));
  if (res.rowsAffected === 0) return { ok: false, error: "Request not found." };
  await audit(organizationId, userId, requestId, "hidden", hidden ? "no" : "yes", hidden ? "yes" : "no");
  return { ok: true };
}

export type QuoteResult = { ok: true; quotationId: string } | { ok: false; error: string };

/**
 * Turns a New request into a draft quotation for the seller. The request is claimed first (New -> Quotation made, one conditional
 * update) so a double click can't make two quotations; if making the quotation fails, the claim is put back. An existing customer
 * with the same email is reused, otherwise a customer is made from the request. The quotation starts empty with the seller's list
 * in its notes: staff then add the lines and prices as they do for any quotation.
 */
export async function makeQuotationFromRequest(organizationId: string, userId: string, requestId: string): Promise<QuoteResult> {
  const [row] = await db.select().from(websiteRequests).where(and(eq(websiteRequests.id, requestId), eq(websiteRequests.organizationId, organizationId))).limit(1);
  if (!row) return { ok: false, error: "Request not found." };
  if (row.status !== "NEW") return { ok: false, error: "This request has already been handled." };

  const now = new Date().toISOString();
  const claim = await db
    .update(websiteRequests)
    .set({ status: "QUOTED", handledByUserId: userId, handledAt: now, updatedAt: now })
    .where(and(eq(websiteRequests.id, requestId), eq(websiteRequests.organizationId, organizationId), eq(websiteRequests.status, "NEW")));
  if (claim.rowsAffected === 0) return { ok: false, error: "This request has already been handled." };

  try {
    const [found] = await db
      .select({ id: purchasingCustomers.id, firstName: purchasingCustomers.firstName, lastName: purchasingCustomers.lastName, email: purchasingCustomers.email, phone: purchasingCustomers.phone })
      .from(purchasingCustomers)
      .where(and(eq(purchasingCustomers.organizationId, organizationId), sql`lower(${purchasingCustomers.email}) = ${row.email}`, isNull(purchasingCustomers.archivedAt)))
      .limit(1);

    let customerId: string;
    let name: string;
    let phone: string | null;
    if (found) {
      customerId = found.id;
      name = [found.firstName, found.lastName].filter(Boolean).join(" ");
      phone = found.phone;
    } else {
      const { firstName, lastName } = splitName(row.contactName);
      customerId = newId("pcust");
      await db.insert(purchasingCustomers).values({
        id: customerId,
        organizationId,
        firstName,
        lastName,
        email: row.email,
        phone: row.phone,
        addressStreet1: row.street1,
        addressStreet2: row.street2,
        addressCity: row.city,
        addressState: row.state,
        addressZip: row.zip,
        addressCountry: "US",
        isResidential: false,
        notes: `${row.businessName} (from the website, ${row.reference})`,
      });
      name = row.contactName;
      phone = row.phone;
    }

    const quotationId = newId("pquote");
    await db.insert(purchasingQuotations).values({
      id: quotationId,
      organizationId,
      quotationNumber: await getNextQuotationNumber(organizationId),
      customerId,
      customerNameSnapshot: name,
      customerEmailSnapshot: row.email,
      customerPhoneSnapshot: phone,
      quotationDate: new Date().toISOString().slice(0, 10),
      source: "WEBSITE",
      notes: quotationNoteFor(row),
      createdByUserId: userId,
    });
    await db.update(websiteRequests).set({ quotationId }).where(and(eq(websiteRequests.id, requestId), eq(websiteRequests.organizationId, organizationId)));
    await audit(organizationId, userId, requestId, "status", "NEW", "QUOTED", `quotation ${quotationId}`);
    return { ok: true, quotationId };
  } catch (err) {
    console.error("[storefront] making a quotation failed:", err);
    await db
      .update(websiteRequests)
      .set({ status: "NEW", handledAt: null, handledByUserId: null })
      .where(and(eq(websiteRequests.id, requestId), eq(websiteRequests.organizationId, organizationId)));
    return { ok: false, error: "Something went wrong making the quotation. The request is still New; please try again." };
  }
}
