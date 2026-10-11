// The PUBLIC layer of company storefronts: the only code that lets someone who is not signed in reach a company's records.
//
// Why it is separate: everywhere else in the app the company comes from the signed-in person (requireOrg). A visitor has no
// company, so here it is found from the storefront's public handle and passed along explicitly. Two rules keep this safe:
//   1. Nothing a visitor types ever chooses the company, a price, a quantity or a status. The company comes from the handle.
//   2. This file reads and writes only what the public page needs: the storefront's display fields, and one new website request.
// A company's storefront is invisible (the same "not found" as a wrong address) unless the feature is on for that company, the
// storefront is not hidden, the company is not closed, and neither it nor its operation is held back (pending, suspended...).

import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { organizations, storefronts, websiteRequests } from "@/db/schema";
import { featureOn } from "@/lib/features";
import { newId } from "@/lib/ids";
import { isHeldBack } from "@/lib/tenant";
import { operationHeld } from "@/lib/second-business-rules";
import { MAX_REQUESTS_PER_DAY, makeReference, normalizeHandle, type SellRequest } from "@/lib/storefront-rules";

export type PublicStorefront = {
  storefrontId: string;
  organizationId: string;
  handle: string;
  displayName: string;
  welcomeText: string | null;
  sellOpen: boolean;
  buyOpen: boolean;
};

/** The storefront at this public address, or null for anything that should look like "no such page". */
export async function findPublicStorefront(rawHandle: string): Promise<PublicStorefront | null> {
  const handle = normalizeHandle(rawHandle);
  if (!handle || handle !== rawHandle) return null; // only the exact, clean handle opens a page
  const [row] = await db
    .select({
      id: storefronts.id,
      organizationId: storefronts.organizationId,
      handle: storefronts.handle,
      displayName: storefronts.displayName,
      welcomeText: storefronts.welcomeText,
      sellOpen: storefronts.sellOpen,
      buyOpen: storefronts.buyOpen,
      parent: organizations.parentOrganizationId,
      closedAt: organizations.closedAt,
      approval: organizations.approvalStatus,
    })
    .from(storefronts)
    .innerJoin(organizations, eq(storefronts.organizationId, organizations.id))
    .where(and(eq(storefronts.handle, handle), isNull(storefronts.hiddenAt)))
    .limit(1);
  if (!row || row.closedAt) return null;
  if (row.parent) {
    // An operation follows its company: closed or held back there closes this door too.
    const [main] = await db.select({ closedAt: organizations.closedAt, approval: organizations.approvalStatus }).from(organizations).where(eq(organizations.id, row.parent)).limit(1);
    if (!main || main.closedAt || isHeldBack(main.approval) || operationHeld(row.parent, row.approval)) return null;
  } else if (isHeldBack(row.approval)) {
    return null;
  }
  if (!(await featureOn("storefronts", row.organizationId))) return null;
  return { storefrontId: row.id, organizationId: row.organizationId, handle: row.handle, displayName: row.displayName, welcomeText: row.welcomeText, sellOpen: row.sellOpen, buyOpen: !!row.buyOpen };
}

export type SubmitResult = { ok: true; reference: string } | { ok: false; error: string };

/**
 * Saves a seller's request for the storefront's company. `request` has already been checked and cleaned (cleanSellRequest).
 * A flood is turned away (a daily limit per storefront), and sending the very same request twice within a day returns the first
 * reference instead of a second record.
 */
export async function submitSellRequest(sf: PublicStorefront, request: SellRequest): Promise<SubmitResult> {
  if (!sf.sellOpen) return { ok: false, error: "This company is not taking offers through its website right now." };
  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 19).replace("T", " ");

  const [count] = await db
    .select({ n: sql<number>`count(*)` })
    .from(websiteRequests)
    .where(and(eq(websiteRequests.organizationId, sf.organizationId), gt(websiteRequests.createdAt, dayAgo)));
  if (Number(count?.n ?? 0) >= MAX_REQUESTS_PER_DAY) return { ok: false, error: "This company has received a lot of requests today. Please try again tomorrow, or contact them directly." };

  const [same] = await db
    .select({ reference: websiteRequests.reference })
    .from(websiteRequests)
    .where(and(eq(websiteRequests.organizationId, sf.organizationId), eq(websiteRequests.email, request.email), eq(websiteRequests.itemsText, request.itemsText), gt(websiteRequests.createdAt, dayAgo)))
    .limit(1);
  if (same) return { ok: true, reference: same.reference };

  // A reference clash is vanishingly rare; the unique index would refuse it, so try a few times.
  for (let attempt = 0; attempt < 5; attempt++) {
    const reference = makeReference();
    try {
      await db.insert(websiteRequests).values({
        id: newId("wreq"),
        organizationId: sf.organizationId,
        storefrontId: sf.storefrontId,
        reference,
        status: "NEW",
        businessName: request.businessName,
        contactName: request.contactName,
        email: request.email,
        phone: request.phone,
        street1: request.street1,
        street2: request.street2,
        city: request.city,
        state: request.state,
        zip: request.zip,
        itemsText: request.itemsText,
        notes: request.notes,
      });
      return { ok: true, reference };
    } catch (err) {
      if (!String(err).toLowerCase().includes("unique")) throw err;
    }
  }
  return { ok: false, error: "Something went wrong. Please try again in a minute." };
}
