// Shipping: orders going out to buyers, their boxes (tracking numbers), photos and documents, and the ONE "your order has shipped"
// email per shipment. Every query starts from the signed-in company's id. Nothing is sent by itself: the email is composed for review
// and a person presses Send (or sets it aside with a reason). The exact text that went is kept on the shipment.

import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { salesDocuments, salesDocumentLines, shipmentBoxes, shipmentFiles, shipments, users } from "@/db/schema";
import { featureOn } from "@/lib/features";
import { newId } from "@/lib/ids";
import { sendDeptEmail } from "@/lib/mail-system";
import { todayFor } from "@/lib/receivable-service";
import { storage, STORAGE_NOT_CONNECTED } from "@/lib/receiving-storage";
import { sniffReceiptType } from "@/lib/purchasing-receipt-docs";
import { safeFilename } from "@/lib/chat-rules";
import { getDocument, renderPdf, resolveFrom, type Org } from "@/lib/sales-service";
import { getOrganization, hasShipFromAddress } from "@/lib/queries";
import { pickLabelRate, type ShippoAddress } from "@/lib/shippo";
import { noteShippoFailure, resolveShippo } from "@/lib/shippo-connection";
import { buyLabels, CARRIER_NAME, failureMessage, parseCarrier, parseLabelCount, type ShippoDeps } from "@/lib/shipping-labels";
import { addressProblems, checkParcel, cleanAddress, DEFAULT_PARCEL, parseUsAddress, type CleanAddress } from "@/lib/shipping-address-rules";
import { contactForSalesBuyer, createContact, getContact } from "@/lib/shipping-contacts";
import {
  canShipFrom, checkTracking, cleanTracking, docLabel, emailReadiness, guessCarrier, isCarrier, MANUAL_STATUSES, MAX_BOXES, MAX_FILE_BYTES, MAX_FILES, pickAttachments, shippedEmail, stageOf,
  type Stage,
} from "@/lib/shipping-rules";
import { boxesOf, rollUpShipment, startFollowing, syncShipmentTracking, type BoxRow } from "@/lib/shipping-tracking";

export type Shipment = typeof shipments.$inferSelect;
export type ShipFile = typeof shipmentFiles.$inferSelect;
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** The rollout switch for the Shipping department (Settings -> Feature rollout). */
export const shippingOn = (organizationId: string) => featureOn("shipping", organizationId);

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const textToHtml = (t: string) => `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1a1d21">${esc(t).replace(/\n/g, "<br>")}</div>`;

async function nameOf(userId: string): Promise<string | null> {
  const [u] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  return u?.name || u?.email || null;
}

// ---------------------------------------------------------------------------
// To Ship: orders ready to go with no shipment yet
// ---------------------------------------------------------------------------

export type ToShipItem = { documentId: string; kind: string; number: string; buyer: string; reference: string | null; status: string; docDate: string; lineCount: number };

export async function listToShip(organizationId: string): Promise<ToShipItem[]> {
  const docs = await db
    .select()
    .from(salesDocuments)
    .where(and(eq(salesDocuments.organizationId, organizationId), inArray(salesDocuments.kind, ["SALES_ORDER", "INVOICE"])))
    .orderBy(desc(salesDocuments.createdAt));
  const ready = docs.filter((d) => canShipFrom(d.kind, d.status));
  if (ready.length === 0) return [];
  const have = await db.select({ documentId: shipments.documentId, invoiceDocumentId: shipments.invoiceDocumentId }).from(shipments).where(eq(shipments.organizationId, organizationId));
  const shipped = new Set<string>();
  for (const s of have) {
    if (s.documentId) shipped.add(s.documentId);
    if (s.invoiceDocumentId) shipped.add(s.invoiceDocumentId);
  }
  const kindOf = new Map(docs.map((d) => [d.id, d.kind]));
  const out = ready.filter((d) => {
    if (shipped.has(d.id)) return false;
    // An order that became an invoice ships once: either is covered when the other has shipments.
    if (d.convertedToId && shipped.has(d.convertedToId)) return false;
    if (d.convertedFromId && shipped.has(d.convertedFromId)) return false;
    // An invoice made from a sales order is shipped through that order.
    if (d.kind === "INVOICE" && d.convertedFromId && kindOf.get(d.convertedFromId) === "SALES_ORDER") return false;
    return true;
  });
  if (out.length === 0) return [];
  const counts = await db
    .select({ documentId: salesDocumentLines.documentId, n: sql<number>`count(*)` })
    .from(salesDocumentLines)
    .where(inArray(salesDocumentLines.documentId, out.map((d) => d.id)))
    .groupBy(salesDocumentLines.documentId);
  const n = new Map(counts.map((c) => [c.documentId, Number(c.n)]));
  return out.map((d) => ({ documentId: d.id, kind: d.kind, number: d.number, buyer: d.buyerCompany ?? "", reference: d.reference, status: d.status, docDate: d.docDate, lineCount: n.get(d.id) ?? 0 }));
}

// ---------------------------------------------------------------------------
// Shipments list
// ---------------------------------------------------------------------------

export type ShipmentListItem = {
  id: string; documentId: string | null; seq: number; docKind: string; docNumber: string; reference: string | null; buyer: string; shipDate: string; status: string;
  emailStatus: string | null; stage: Stage; boxes: { carrier: string; trackingNumber: string; status: string }[];
};

export async function listShipments(organizationId: string): Promise<ShipmentListItem[]> {
  const rows = await db.select().from(shipments).where(eq(shipments.organizationId, organizationId)).orderBy(desc(shipments.createdAt));
  if (rows.length === 0) return [];
  const boxes = await db
    .select({ shipmentId: shipmentBoxes.shipmentId, carrier: shipmentBoxes.carrier, trackingNumber: shipmentBoxes.trackingNumber, status: shipmentBoxes.status, position: shipmentBoxes.position })
    .from(shipmentBoxes)
    .where(eq(shipmentBoxes.organizationId, organizationId))
    .orderBy(asc(shipmentBoxes.position), asc(shipmentBoxes.createdAt));
  const by = new Map<string, ShipmentListItem["boxes"]>();
  for (const b of boxes) (by.get(b.shipmentId) ?? by.set(b.shipmentId, []).get(b.shipmentId)!).push({ carrier: b.carrier, trackingNumber: b.trackingNumber, status: b.status });
  return rows.map((s) => {
    const bx = by.get(s.id) ?? [];
    return {
      id: s.id, documentId: s.documentId, seq: s.seq, docKind: s.docKind, docNumber: s.docNumber, reference: s.reference, buyer: s.buyerCompany ?? s.toCompany ?? s.toName ?? "", shipDate: s.shipDate, status: s.status,
      emailStatus: s.emailStatus, stage: stageOf({ status: s.status, boxCount: bx.length, emailStatus: s.emailStatus }), boxes: bx,
    };
  });
}

/** Shipments already made for one order (the Sales order page links to them). */
export async function shipmentsForDocument(organizationId: string, documentId: string): Promise<{ id: string; seq: number; status: string }[]> {
  return db
    .select({ id: shipments.id, seq: shipments.seq, status: shipments.status })
    .from(shipments)
    .where(and(eq(shipments.organizationId, organizationId), eq(shipments.documentId, documentId)))
    .orderBy(asc(shipments.seq));
}

// ---------------------------------------------------------------------------
// One shipment
// ---------------------------------------------------------------------------

export type ShipmentDetail = {
  shipment: Shipment;
  boxes: BoxRow[];
  files: ShipFile[];
  items: { name: string; quantity: number; ndc: string | null }[];
  sender: string;
  replyTo: string | null;
  invoiceNumber: string | null;
  stage: Stage;
  shipTo: CleanAddress;
  /** What is missing from the address before a label can be made (empty = ready). */
  addressProblem: string | null;
};

export async function getShipment(organizationId: string, id: string, opts: { sync?: boolean } = {}): Promise<ShipmentDetail | null> {
  const [s] = await db.select().from(shipments).where(and(eq(shipments.organizationId, organizationId), eq(shipments.id, id))).limit(1);
  if (!s) return null;
  const boxes = opts.sync ? await syncShipmentTracking(organizationId, id).catch(() => boxesOf(organizationId, id)) : await boxesOf(organizationId, id);
  const [fresh] = opts.sync ? await db.select().from(shipments).where(and(eq(shipments.organizationId, organizationId), eq(shipments.id, id))).limit(1) : [s];
  const ship = fresh ?? s;
  const files = await db.select().from(shipmentFiles).where(and(eq(shipmentFiles.organizationId, organizationId), eq(shipmentFiles.shipmentId, id))).orderBy(asc(shipmentFiles.createdAt));
  const doc = ship.documentId ? await getDocument(organizationId, ship.documentId) : null;
  const items = (doc?.lines ?? []).map((l) => ({ name: l.productName, quantity: l.quantity, ndc: l.ndc ?? null }));
  const from = await resolveFrom(organizationId);
  const shipTo = shipToOf(ship);
  let invoiceNumber: string | null = null;
  if (ship.invoiceDocumentId) {
    const [inv] = await db.select({ number: salesDocuments.number }).from(salesDocuments).where(and(eq(salesDocuments.organizationId, organizationId), eq(salesDocuments.id, ship.invoiceDocumentId))).limit(1);
    invoiceNumber = inv?.number ?? null;
  }
  return { shipment: ship, boxes, files, items, sender: from.name, replyTo: from.email, invoiceNumber, stage: stageOf({ status: ship.status, boxCount: boxes.length, emailStatus: ship.emailStatus }), shipTo, addressProblem: addressProblems(shipTo)[0] ?? null };
}

/** Refresh every box of a shipment from the carrier now (the Refresh button). */
export async function refreshShipment(org: Org, shipmentId: string): Promise<Result> {
  const s = await own(org.organizationId, shipmentId);
  if (!s) return { ok: false, error: "That shipment wasn't found." };
  await syncShipmentTracking(org.organizationId, shipmentId, { force: true });
  return { ok: true };
}

export function shipToOf(s: Shipment): CleanAddress {
  return cleanAddress({ name: s.toName ?? s.buyerContact ?? s.buyerCompany, company: s.toCompany ?? s.buyerCompany, street1: s.toStreet1, street2: s.toStreet2, city: s.toCity, state: s.toState, zip: s.toZip, country: s.toCountry, phone: s.toPhone, email: s.buyerEmail });
}

async function own(organizationId: string, id: string): Promise<Shipment | null> {
  const [s] = await db.select().from(shipments).where(and(eq(shipments.organizationId, organizationId), eq(shipments.id, id))).limit(1);
  return s ?? null;
}

// ---------------------------------------------------------------------------
// Making and changing a shipment
// ---------------------------------------------------------------------------

/** The address a sales order ships to: the buyer's saved Shipping profile when there is one, otherwise the order's own shipping address text. */
async function shipToForDocument(org: Org, doc: NonNullable<Awaited<ReturnType<typeof getDocument>>>["doc"]) {
  const contact = doc.buyerId ? await contactForSalesBuyer(org, doc.buyerId) : null;
  const parsed = parseUsAddress(doc.buyerShippingAddress);
  const usable = contact && contact.street1 && contact.city && contact.state && contact.zip;
  return {
    contactId: contact?.id ?? null,
    toName: contact?.name ?? doc.buyerContact ?? doc.buyerCompany ?? null,
    toCompany: contact?.company ?? doc.buyerCompany ?? null,
    toStreet1: usable ? contact.street1 : parsed?.street1 ?? null,
    toStreet2: usable ? contact.street2 : parsed?.street2 ?? null,
    toCity: usable ? contact.city : parsed?.city ?? null,
    toState: usable ? contact.state : parsed?.state ?? null,
    toZip: usable ? contact.zip : parsed?.zip ?? null,
    toCountry: contact?.country ?? "US",
    toPhone: contact?.phone ?? doc.buyerPhone ?? null,
    toResidential: contact?.isResidential ?? false,
  };
}

export async function createShipment(org: Org, documentId: string): Promise<Result<{ id: string }>> {
  const d = await getDocument(org.organizationId, documentId);
  if (!d) return { ok: false, error: "That order wasn't found." };
  if (!canShipFrom(d.doc.kind, d.doc.status)) return { ok: false, error: "Only an order or invoice that has been sent to the buyer can be shipped." };
  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(shipments).where(and(eq(shipments.organizationId, org.organizationId), eq(shipments.documentId, documentId)));
  const id = newId("ship");
  const invoiceDocumentId = d.doc.kind === "INVOICE" ? d.doc.id : d.doc.convertedToId ?? null;
  await db.insert(shipments).values({
    id, organizationId: org.organizationId, documentId, seq: Number(n) + 1, docKind: d.doc.kind, docNumber: d.doc.number, reference: d.doc.reference ?? null, invoiceDocumentId,
    buyerCompany: d.doc.buyerCompany ?? null, buyerContact: d.doc.buyerContact ?? null, buyerEmail: d.doc.buyerEmail ?? null, shipDate: await todayFor(org.organizationId), createdByUserId: org.userId,
    ...(await shipToForDocument(org, d.doc)),
  });
  return { ok: true, id };
}

/** A shipment with no sales order: a return to a seller or a supplier, or anything else going out. It ships to a saved address profile. */
export async function createOtherShipment(org: Org, input: { contactId: string; kind: string; reason?: string | null }): Promise<Result<{ id: string }>> {
  const c = await getContact(org.organizationId, String(input.contactId ?? ""));
  if (!c || c.hiddenAt) return { ok: false, error: "Choose an address profile to ship to." };
  const kind = input.kind === "RETURN" ? "RETURN" : "OTHER";
  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(shipments).where(and(eq(shipments.organizationId, org.organizationId), eq(shipments.contactId, c.id), eq(shipments.docKind, kind)));
  const id = newId("ship");
  await db.insert(shipments).values({
    id, organizationId: org.organizationId, documentId: null, seq: Number(n) + 1, docKind: kind, docNumber: "", reason: (input.reason ?? "").trim().slice(0, 200) || null,
    buyerCompany: c.company ?? c.name, buyerContact: c.name, buyerEmail: c.email, shipDate: await todayFor(org.organizationId), createdByUserId: org.userId,
    contactId: c.id, toName: c.name, toCompany: c.company, toStreet1: c.street1, toStreet2: c.street2, toCity: c.city, toState: c.state, toZip: c.zip, toCountry: c.country, toPhone: c.phone, toResidential: c.isResidential,
  });
  return { ok: true, id };
}

/** Changes where a shipment goes. `apply` copies a saved profile; `address` is typed by hand (and can be saved as a new profile). */
export async function setShipTo(
  org: Org,
  shipmentId: string,
  input: { contactId?: string | null; address?: Partial<Record<"name" | "company" | "street1" | "street2" | "city" | "state" | "zip" | "phone" | "email", string | null>> & { isResidential?: boolean }; saveAs?: string | null },
): Promise<Result<{ contactId: string | null }>> {
  const s = await own(org.organizationId, shipmentId);
  if (!s) return { ok: false, error: "That shipment wasn't found." };
  if (s.emailStatus === "SENT" || s.emailStatus === "SKIPPED" || s.emailStatus === "SENDING") return { ok: false, error: "This shipment was already handled, so the address can't be changed." };
  let contactId = s.contactId;
  let a: CleanAddress;
  let residential = s.toResidential;
  if (input.contactId) {
    const c = await getContact(org.organizationId, input.contactId);
    if (!c) return { ok: false, error: "That address profile wasn't found." };
    contactId = c.id;
    residential = c.isResidential;
    a = cleanAddress({ name: c.name, company: c.company, street1: c.street1, street2: c.street2, city: c.city, state: c.state, zip: c.zip, country: c.country, phone: c.phone, email: c.email });
  } else if (input.address) {
    a = cleanAddress(input.address);
    residential = !!input.address.isResidential;
    if (input.saveAs && (a.name || a.company)) {
      const made = await createContact(org, { kind: input.saveAs, ...a, isResidential: residential });
      if (!made.ok) return made;
      contactId = made.id;
    }
  } else return { ok: false, error: "Choose or type an address." };
  await db
    .update(shipments)
    .set({
      contactId, toName: a.name || null, toCompany: a.company, toStreet1: a.street1 || null, toStreet2: a.street2, toCity: a.city || null, toState: a.state || null, toZip: a.zip || null,
      toPhone: a.phone, toResidential: residential, ...(a.email ? { buyerEmail: a.email } : {}), updatedAt: sql`(current_timestamp)`,
    })
    .where(and(eq(shipments.id, shipmentId), eq(shipments.organizationId, org.organizationId)));
  return { ok: true, contactId };
}

export async function updateShipment(org: Org, shipmentId: string, patch: { shipDate?: string; buyerEmail?: string; buyerContact?: string; note?: string }): Promise<Result> {
  const s = await own(org.organizationId, shipmentId);
  if (!s) return { ok: false, error: "That shipment wasn't found." };
  if (s.emailStatus === "SENT" || s.emailStatus === "SKIPPED" || s.emailStatus === "SENDING") return { ok: false, error: "This shipment was already handled, so it can't be changed." };
  const set: Partial<typeof shipments.$inferInsert> = {};
  if (patch.shipDate !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(patch.shipDate)) return { ok: false, error: "Choose a valid ship date." };
    set.shipDate = patch.shipDate;
  }
  if (patch.buyerEmail !== undefined) set.buyerEmail = patch.buyerEmail.trim().slice(0, 200) || null;
  if (patch.buyerContact !== undefined) set.buyerContact = patch.buyerContact.trim().slice(0, 120) || null;
  if (patch.note !== undefined) set.note = patch.note.trim().slice(0, 1000) || null;
  if (Object.keys(set).length === 0) return { ok: true };
  await db.update(shipments).set({ ...set, updatedAt: sql`(current_timestamp)` }).where(and(eq(shipments.id, shipmentId), eq(shipments.organizationId, org.organizationId)));
  return { ok: true };
}

// ---- boxes ----

export async function addBox(org: Org, shipmentId: string, input: { trackingNumber: string; carrier?: string | null }): Promise<Result<{ id: string; carrier: string }>> {
  const s = await own(org.organizationId, shipmentId);
  if (!s) return { ok: false, error: "That shipment wasn't found." };
  const t = checkTracking(input.trackingNumber);
  if (!t.ok) return { ok: false, error: t.error };
  const carrier = isCarrier(input.carrier) ? input.carrier : guessCarrier(t.number) ?? "Other";
  const existing = await db.select({ n: shipmentBoxes.trackingNumber, p: shipmentBoxes.position }).from(shipmentBoxes).where(and(eq(shipmentBoxes.organizationId, org.organizationId), eq(shipmentBoxes.shipmentId, shipmentId)));
  if (existing.length >= MAX_BOXES) return { ok: false, error: `A shipment can have up to ${MAX_BOXES} boxes.` };
  if (existing.some((e) => e.n === t.number)) return { ok: false, error: "That tracking number is already on this shipment." };
  const id = newId("sbox");
  await db.insert(shipmentBoxes).values({ id, organizationId: org.organizationId, shipmentId, position: existing.reduce((m, e) => Math.max(m, e.p + 1), 0), carrier, trackingNumber: t.number });
  await rollUpShipment(org.organizationId, shipmentId);
  await startFollowing(org.organizationId, shipmentId);
  return { ok: true, id, carrier };
}

export async function removeBox(org: Org, boxId: string): Promise<Result> {
  const [b] = await db.select().from(shipmentBoxes).where(and(eq(shipmentBoxes.id, boxId), eq(shipmentBoxes.organizationId, org.organizationId))).limit(1);
  if (!b) return { ok: false, error: "That box wasn't found." };
  const s = await own(org.organizationId, b.shipmentId);
  if (s?.emailStatus === "SENT" || s?.emailStatus === "SKIPPED" || s?.emailStatus === "SENDING") return { ok: false, error: "The buyer was already told about these boxes, so one can't be removed." };
  await db.delete(shipmentBoxes).where(and(eq(shipmentBoxes.id, boxId), eq(shipmentBoxes.organizationId, org.organizationId)));
  await rollUpShipment(org.organizationId, b.shipmentId);
  return { ok: true };
}

/** A person sets a box's status by hand (when live tracking isn't connected, or the carrier is wrong). It stays until they follow it again. */
export async function setBoxStatusManual(org: Org, boxId: string, status: string): Promise<Result> {
  if (!MANUAL_STATUSES.includes(status)) return { ok: false, error: "Choose a status from the list." };
  const [b] = await db.select().from(shipmentBoxes).where(and(eq(shipmentBoxes.id, boxId), eq(shipmentBoxes.organizationId, org.organizationId))).limit(1);
  if (!b) return { ok: false, error: "That box wasn't found." };
  const now = new Date().toISOString();
  await db
    .update(shipmentBoxes)
    .set({ status, followAuto: false, statusAt: now, deliveredAt: status === "Delivered" ? now : null, statusDetails: "Set by hand", lastError: null, updatedAt: sql`(current_timestamp)` })
    .where(and(eq(shipmentBoxes.id, boxId), eq(shipmentBoxes.organizationId, org.organizationId)));
  await rollUpShipment(org.organizationId, b.shipmentId);
  return { ok: true };
}

/** Hand the box back to the carrier's news. */
export async function followBoxAuto(org: Org, boxId: string): Promise<Result> {
  const [b] = await db.select().from(shipmentBoxes).where(and(eq(shipmentBoxes.id, boxId), eq(shipmentBoxes.organizationId, org.organizationId))).limit(1);
  if (!b) return { ok: false, error: "That box wasn't found." };
  await db.update(shipmentBoxes).set({ followAuto: true, updatedAt: sql`(current_timestamp)` }).where(and(eq(shipmentBoxes.id, boxId), eq(shipmentBoxes.organizationId, org.organizationId)));
  await startFollowing(org.organizationId, b.shipmentId);
  return { ok: true };
}

// ---- labels ----

export type LabelInput = { service?: unknown; count?: unknown; parcel?: { lengthIn: unknown; widthIn: unknown; heightIn: unknown; weightLb: unknown } };

/**
 * Buys shipping labels for a shipment through the company's OWN Shippo account (UPS Ground or USPS Priority Mail, as in Purchasing).
 * Each label is one box with its own tracking number, which is followed like any typed tracking number. A label that was paid for is
 * always saved, even if another one in the same batch failed. From = the company's receiving/ship-from address; to = the shipment's address.
 */
export async function makeLabels(org: Org, shipmentId: string, input: LabelInput, depsOverride?: ShippoDeps): Promise<Result<{ made: number; message: string }>> {
  const s = await own(org.organizationId, shipmentId);
  if (!s) return { ok: false, error: "That shipment wasn't found." };
  const carrier = parseCarrier(input.service);
  const count = parseLabelCount(input.count);
  if ("error" in count) return { ok: false, error: count.error };
  const parcel = checkParcel(input.parcel ?? DEFAULT_PARCEL);
  if (!parcel.ok) return parcel;
  const to = shipToOf(s);
  const problem = addressProblems(to)[0];
  if (problem) return { ok: false, error: `The address isn't complete. ${problem}` };
  const existing = await db.select({ n: shipmentBoxes.trackingNumber, p: shipmentBoxes.position }).from(shipmentBoxes).where(and(eq(shipmentBoxes.organizationId, org.organizationId), eq(shipmentBoxes.shipmentId, shipmentId)));
  if (existing.length + count.count > MAX_BOXES) return { ok: false, error: `A shipment can have up to ${MAX_BOXES} boxes.` };

  const orgRow = await getOrganization(org.organizationId);
  if (!hasShipFromAddress(orgRow)) return { ok: false, error: "Add your business's ship-from address (with a phone and an email) in Settings → Business before making a label." };
  let deps = depsOverride;
  if (!deps) {
    const shippo = await resolveShippo(org.organizationId);
    if (!shippo.ok) return { ok: false, error: shippo.message };
    const note = async (e: unknown) => {
      await noteShippoFailure(org.organizationId, e);
      return Promise.reject(e);
    };
    deps = {
      createShipment: (p) => shippo.client.createShipment(p).catch(note),
      pickRate: pickLabelRate,
      createTransaction: (rateId) => shippo.client.createTransaction(rateId).catch(note),
    };
  }
  const addressFrom: ShippoAddress = {
    name: orgRow!.shipFromName!, company: orgRow!.shipFromCompany, street1: orgRow!.shipFromStreet1!, street2: orgRow!.shipFromStreet2, city: orgRow!.shipFromCity!, state: orgRow!.shipFromState!,
    zip: orgRow!.shipFromZip!, country: orgRow!.shipFromCountry, phone: orgRow!.shipFromPhone, email: orgRow!.shipFromEmail, isResidential: false,
  };
  const addressTo: ShippoAddress = {
    name: to.name || to.company || "Receiving", company: to.company, street1: to.street1, street2: to.street2, city: to.city, state: to.state, zip: to.zip, country: to.country,
    phone: to.phone || s.toPhone || undefined, email: to.email || undefined, isResidential: s.toResidential,
  };
  const { labels, errors } = await buyLabels(deps, carrier, count.count, { addressFrom, addressTo, addressReturn: addressFrom, parcel: parcel.parcel });

  // A paid label is never lost: save every one that was bought before reporting anything that failed.
  let made = 0;
  let pos = existing.reduce((m, e) => Math.max(m, e.p + 1), 0);
  const taken = new Set(existing.map((e) => e.n));
  for (const l of labels) {
    const tn = cleanTracking(l.trackingNumber ?? "");
    if (!tn || taken.has(tn)) {
      errors.push("A label was bought but Shippo gave no new tracking number for it. Open your Shippo account to find it.");
      continue;
    }
    taken.add(tn);
    await db.insert(shipmentBoxes).values({
      id: newId("sbox"), organizationId: org.organizationId, shipmentId, position: pos++, carrier: carrier === "UPS_GROUND" ? "UPS" : "USPS", trackingNumber: tn,
      labelUrl: l.labelUrl, labelService: CARRIER_NAME[carrier], labelCost: l.cost ?? null, labelTransactionId: l.transactionId, parcel: JSON.stringify(parcel.parcel),
    });
    made++;
  }
  if (made > 0) {
    await rollUpShipment(org.organizationId, shipmentId);
    await startFollowing(org.organizationId, shipmentId);
  }
  if (errors.length > 0) {
    const text = failureMessage(count.count, made, errors);
    return made > 0 ? { ok: true, made, message: text } : { ok: false, error: text };
  }
  return { ok: true, made, message: `${made} ${made === 1 ? "label" : "labels"} made. ${made === 1 ? "It is" : "They are"} in the boxes below.` };
}

// ---- photos and documents ----

export async function addFile(org: Org, shipmentId: string, input: { kind: string; filename: string; bytes: Uint8Array }): Promise<Result<{ id: string }>> {
  const s = await own(org.organizationId, shipmentId);
  if (!s) return { ok: false, error: "That shipment wasn't found." };
  if (s.emailStatus === "SENT" || s.emailStatus === "SKIPPED" || s.emailStatus === "SENDING") return { ok: false, error: "This shipment was already handled, so files can't be added." };
  if (!storage.configured()) return { ok: false, error: STORAGE_NOT_CONNECTED };
  if (input.bytes.length === 0) return { ok: false, error: "Choose a photo or PDF to add." };
  if (input.bytes.length > MAX_FILE_BYTES) return { ok: false, error: "That file is over 4 MB. Choose a smaller one." };
  const type = sniffReceiptType(input.bytes);
  if (!type) return { ok: false, error: "Add a photo (JPG, PNG, WebP or GIF) or a PDF." };
  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(shipmentFiles).where(and(eq(shipmentFiles.organizationId, org.organizationId), eq(shipmentFiles.shipmentId, shipmentId)));
  if (Number(n) >= MAX_FILES) return { ok: false, error: `A shipment can have up to ${MAX_FILES} files.` };
  const kind = input.kind === "LABEL" || input.kind === "ORDER_DOC" ? input.kind : "OTHER";
  const id = newId("sfile");
  let filename = safeFilename(input.filename || `file.${type.ext}`);
  if (!/\.[A-Za-z0-9]{2,4}$/.test(filename)) filename = `${filename}.${type.ext}`;
  const storagePath = `shipping/${org.organizationId}/${shipmentId}/${id}.${type.ext}`;
  try {
    await storage.save(storagePath, input.bytes, type.mime);
  } catch {
    return { ok: false, error: "The file couldn't be saved to storage. Try again." };
  }
  await db.insert(shipmentFiles).values({ id, organizationId: org.organizationId, shipmentId, kind, filename, contentType: type.mime, sizeBytes: input.bytes.length, storagePath, attach: true, uploadedByUserId: org.userId });
  return { ok: true, id };
}

export async function removeFile(org: Org, fileId: string): Promise<Result> {
  const [f] = await db.select().from(shipmentFiles).where(and(eq(shipmentFiles.id, fileId), eq(shipmentFiles.organizationId, org.organizationId))).limit(1);
  if (!f) return { ok: false, error: "That file wasn't found." };
  const s = await own(org.organizationId, f.shipmentId);
  if (s?.emailStatus === "SENT" || s?.emailStatus === "SKIPPED" || s?.emailStatus === "SENDING") return { ok: false, error: "This shipment was already handled, so files stay as they are." };
  await db.delete(shipmentFiles).where(and(eq(shipmentFiles.id, fileId), eq(shipmentFiles.organizationId, org.organizationId)));
  try {
    await storage.remove(f.storagePath);
  } catch {
    // The row is gone; a leftover blob is harmless and is cleaned when the company is removed.
  }
  return { ok: true };
}

export async function setFileAttach(org: Org, fileId: string, attach: boolean): Promise<Result> {
  const [f] = await db.select().from(shipmentFiles).where(and(eq(shipmentFiles.id, fileId), eq(shipmentFiles.organizationId, org.organizationId))).limit(1);
  if (!f) return { ok: false, error: "That file wasn't found." };
  const s = await own(org.organizationId, f.shipmentId);
  if (s?.emailStatus === "SENT" || s?.emailStatus === "SKIPPED" || s?.emailStatus === "SENDING") return { ok: false, error: "This shipment was already handled." };
  await db.update(shipmentFiles).set({ attach, updatedAt: sql`(current_timestamp)` }).where(and(eq(shipmentFiles.id, fileId), eq(shipmentFiles.organizationId, org.organizationId)));
  return { ok: true };
}

/** For the download route: the file row, company-checked. */
export async function getFileForOrg(organizationId: string, fileId: string): Promise<ShipFile | null> {
  const [f] = await db.select().from(shipmentFiles).where(and(eq(shipmentFiles.id, fileId), eq(shipmentFiles.organizationId, organizationId))).limit(1);
  return f ?? null;
}

// ---------------------------------------------------------------------------
// The shipped email
// ---------------------------------------------------------------------------

export type EmailOptions = { to?: string; note?: string; attachOrder?: boolean; attachInvoice?: boolean };

/** The exact email as it would go now (the same words the preview shows). */
export function composeFromDetail(d: ShipmentDetail, opts: EmailOptions = {}) {
  const s = d.shipment;
  const names: string[] = [];
  const pick = pickAttachments(d.files, 0);
  for (const f of d.files) if (pick.use.includes(f.id)) names.push(f.filename);
  if (opts.attachOrder && s.documentId) names.push("Order.pdf");
  if (opts.attachInvoice && s.invoiceDocumentId) names.push("Invoice.pdf");
  const mail = shippedEmail({
    company: s.buyerCompany ?? "", contact: s.buyerContact, docKind: s.docKind, docNumber: s.docNumber, reference: s.reference, shipDate: s.shipDate, reason: s.reason,
    boxes: d.boxes.map((b) => ({ carrier: b.carrier, trackingNumber: b.trackingNumber })), items: d.items, attachmentNames: names, note: opts.note ?? "", senderName: d.sender,
  });
  return { ...mail, left: pick.left };
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks);
}

type Send = (args: Parameters<typeof sendDeptEmail>[2]) => Promise<{ ok: true } | { ok: false; error: string }>;

/**
 * Emails the buyer that the order shipped. The shipment is claimed first (email_status NULL -> SENDING in one statement), so two
 * people pressing Send can never both send. If the email doesn't go out, the claim is released and nothing is recorded.
 */
export async function sendShippedEmail(org: Org, shipmentId: string, opts: EmailOptions, send?: Send): Promise<Result<{ to: string }>> {
  const d = await getShipment(org.organizationId, shipmentId);
  if (!d) return { ok: false, error: "That shipment wasn't found." };
  const to = (opts.to ?? d.shipment.buyerEmail ?? "").trim();
  const ready = emailReadiness({ to, boxCount: d.boxes.length, emailStatus: d.shipment.emailStatus });
  if (!ready.ready) return { ok: false, error: ready.blockers[0] };
  const note = (opts.note ?? "").trim().slice(0, 1000);
  const claim = await db
    .update(shipments)
    .set({ emailStatus: "SENDING", updatedAt: sql`(current_timestamp)` })
    .where(and(eq(shipments.id, shipmentId), eq(shipments.organizationId, org.organizationId), isNull(shipments.emailStatus)));
  if (claim.rowsAffected !== 1) return { ok: false, error: "This shipment was already handled." };
  const release = () => db.update(shipments).set({ emailStatus: null }).where(and(eq(shipments.id, shipmentId), eq(shipments.organizationId, org.organizationId)));

  try {
    const pick = pickAttachments(d.files, 0);
    const attachments: { filename: string; content: Buffer }[] = [];
    let bytes = 0;
    for (const f of d.files) {
      if (!pick.use.includes(f.id)) continue;
      const got = await storage.read(f.storagePath);
      if (!got) throw new Error(`The file ${f.filename} couldn't be read from storage.`);
      const buf = await readAll(got.stream);
      bytes += buf.length;
      attachments.push({ filename: f.filename, content: buf });
    }
    const pdfs: { id: string; label: string }[] = [];
    if (opts.attachOrder && d.shipment.documentId) pdfs.push({ id: d.shipment.documentId, label: "order" });
    if (opts.attachInvoice && d.shipment.invoiceDocumentId && d.shipment.invoiceDocumentId !== d.shipment.documentId) pdfs.push({ id: d.shipment.invoiceDocumentId, label: "invoice" });
    for (const p of pdfs) {
      const pdf = await renderPdf(org.organizationId, p.id);
      if (!pdf) throw new Error(`The ${p.label} PDF couldn't be made.`);
      attachments.push({ filename: pdf.fileName, content: Buffer.from(pdf.bytes) });
      bytes += pdf.bytes.length;
    }
    if (attachments.length > 8 || bytes > 8 * 1024 * 1024) throw new Error("There are too many or too large attachments for one email. Untick some files and try again.");

    // The words use the real PDF names.
    const names = attachments.map((a) => a.filename);
    const from = await resolveFrom(org.organizationId);
    const s = d.shipment;
    const mail = shippedEmail({
      company: s.buyerCompany ?? "", contact: s.buyerContact, docKind: s.docKind, docNumber: s.docNumber, reference: s.reference, shipDate: s.shipDate,
      boxes: d.boxes.map((b) => ({ carrier: b.carrier, trackingNumber: b.trackingNumber })), items: d.items, attachmentNames: names, note, senderName: from.name, reason: s.reason,
    });
    const args = { to, subject: mail.subject, text: mail.text, html: textToHtml(mail.text), fromName: from.name, replyTo: from.email, attachments };
    let result: { ok: true } | { ok: false; error: string };
    try {
      result = send ? await send(args) : await sendDeptEmail(org.organizationId, { dept: "shipping", relatedKind: "shipment", relatedId: shipmentId, by: { userId: org.userId, name: null } }, args).then((r) => (r.ok ? { ok: true as const } : { ok: false as const, error: r.error }));
    } catch (e) {
      result = { ok: false, error: e instanceof Error ? e.message : "The email couldn't be sent." };
    }
    if (!result.ok) {
      await release();
      return { ok: false, error: `The email wasn't sent, so nothing was recorded. ${result.error}`.trim() };
    }
    await db
      .update(shipments)
      .set({
        emailStatus: "SENT", emailTo: to, emailSubject: mail.subject, emailBody: mail.text, emailAttachments: names.length ? JSON.stringify(names) : null, emailNote: note || null,
        emailByUserId: org.userId, emailByName: await nameOf(org.userId), emailAt: new Date().toISOString(), buyerEmail: s.buyerEmail || to, updatedAt: sql`(current_timestamp)`,
      })
      .where(and(eq(shipments.id, shipmentId), eq(shipments.organizationId, org.organizationId)));
    return { ok: true, to };
  } catch (e) {
    await release();
    return { ok: false, error: `The email wasn't sent, so nothing was recorded. ${e instanceof Error ? e.message : ""}`.trim() };
  }
}

/** "No email needed": keeps the shipment out of Ready to send, with who decided and why. */
export async function skipShippedEmail(org: Org, shipmentId: string, reason?: string | null): Promise<Result> {
  const claim = await db
    .update(shipments)
    .set({
      emailStatus: "SKIPPED", emailNote: (reason ?? "").trim().slice(0, 300) || null, emailByUserId: org.userId, emailByName: await nameOf(org.userId), emailAt: new Date().toISOString(), updatedAt: sql`(current_timestamp)`,
    })
    .where(and(eq(shipments.id, shipmentId), eq(shipments.organizationId, org.organizationId), isNull(shipments.emailStatus)));
  if (claim.rowsAffected !== 1) {
    const s = await own(org.organizationId, shipmentId);
    return { ok: false, error: s ? "This shipment was already handled." : "That shipment wasn't found." };
  }
  return { ok: true };
}
