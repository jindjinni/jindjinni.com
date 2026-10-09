// Purchase orders (Purchasing): loading and saving suppliers and orders, the PDF, the email and the status steps. The rules are in
// purchase-order-rules.ts (maths, numbering, statuses). Every function takes the company from the signed-in person (never from the
// request), and every query is scoped to it, so one company can never read or change another's orders.

import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  businessProfiles,
  organizations,
  purchasingProducts,
  purchasingPurchaseOrderLines,
  purchasingPurchaseOrders,
  purchasingQuotationProfiles,
  purchasingSuppliers,
} from "@/db/schema";
import { newId } from "@/lib/ids";
import { featureOn } from "@/lib/features";
import { templateWithNotice } from "@/lib/document-template-service";
import { cleanRevisionNote, nextRevision } from "@/lib/document-template-rules";
import { addRevisionRecord } from "@/lib/document-revision-service";
import { parseOperationType } from "@/lib/operation-type";
import {
  DEFAULT_PO_TERMS,
  canMoveTo,
  cleanLines,
  cleanText,
  computeTotals,
  formatPoNumber,
  isDay,
  isEditable,
  isPoStatus,
  looksLikeEmail,
  nextSeq,
  nullIfEmpty,
  poFileName,
  type PoLineInput,
  type PoStatus,
} from "@/lib/purchase-order-rules";
import { buildPurchaseOrderPdf, type PoPdfInput } from "@/lib/purchase-order-pdf";
import { buildPoEmail, type PoEmailInput } from "@/lib/purchase-order-email";

export type Org = { organizationId: string; userId: string };
export type Supplier = typeof purchasingSuppliers.$inferSelect;
export type PurchaseOrder = typeof purchasingPurchaseOrders.$inferSelect;
export type PurchaseOrderLine = typeof purchasingPurchaseOrderLines.$inferSelect;
export type PoWithLines = { po: PurchaseOrder; lines: PurchaseOrderLine[] };

export const PO_FEATURE = "purchase-orders";

/**
 * Purchase orders (Purchasing and Sales), the document templates and revisions are on for a company when the "purchase-orders"
 * feature is switched on for it (Settings -> Feature rollout). Every company gets them -- what a company answered at sign-up
 * only decides which document comes first, never whether it has the document.
 */
export async function purchaseOrdersEnabled(organizationId: string): Promise<boolean> {
  return featureOn(PO_FEATURE, organizationId);
}

/** The company's sign-up answer, for the order of the tabs. Null = not answered. */
export async function operationTypeOf(organizationId: string) {
  const [org] = await db.select({ t: organizations.operationType }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  return parseOperationType(org?.t);
}

// ---- the company as the sender -----------------------------------------------------------------------------------

export type Identity = {
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  logoDataUrl: string | null;
  shipTo: { name: string; address: string | null };
  billTo: { name: string; address: string | null };
};

/** Street lines, then "City, ST ZIP", then the country when it is not the US. */
export function joinAddress(p: { street1?: string | null; street2?: string | null; city?: string | null; state?: string | null; zip?: string | null; country?: string | null }): string | null {
  const cityLine = [[p.city, p.state].filter(Boolean).join(", "), p.zip].filter(Boolean).join(" ");
  const country = p.country && p.country.toUpperCase() !== "US" ? p.country : p.country ? "USA" : null;
  const text = [p.street1, p.street2, cityLine, country].map((s) => (s ?? "").trim()).filter(Boolean).join("\n");
  return text || null;
}

export async function companyIdentity(organizationId: string): Promise<Identity> {
  const [org] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  const [bp] = await db.select().from(businessProfiles).where(eq(businessProfiles.organizationId, organizationId)).limit(1);
  const [qp] = await db.select().from(purchasingQuotationProfiles).where(eq(purchasingQuotationProfiles.organizationId, organizationId)).limit(1);
  const name = cleanText(qp?.displayName, 120) || org?.name || "Our company";
  const billing = joinAddress({ street1: bp?.businessAddressStreet1, street2: bp?.businessAddressStreet2, city: bp?.businessAddressCity, state: bp?.businessAddressState, zip: bp?.businessAddressZip, country: bp?.businessAddressCountry });
  const shipping = bp?.shippingAddressStreet1
    ? joinAddress({ street1: bp.shippingAddressStreet1, street2: bp.shippingAddressStreet2, city: bp.shippingAddressCity, state: bp.shippingAddressState, zip: bp.shippingAddressZip, country: bp.shippingAddressCountry })
    : billing;
  // The Purchasing quotation logo wins when the company set one there, otherwise the business profile's logo.
  const useQp = qp?.logoData && qp.logoContentType && qp.showLogo !== false;
  const useBp = !useQp && bp?.logoData && bp.logoContentType && bp.docShowLogo !== false;
  const logoDataUrl = useQp ? `data:${qp!.logoContentType};base64,${qp!.logoData}` : useBp ? `data:${bp!.logoContentType};base64,${bp!.logoData}` : null;
  return {
    name,
    address: billing,
    phone: bp?.businessPhone ?? null,
    email: bp?.businessEmail ?? null,
    logoDataUrl,
    shipTo: { name, address: shipping },
    billTo: { name, address: billing },
  };
}

// ---- suppliers ---------------------------------------------------------------------------------------------------

export async function listSuppliers(organizationId: string, opts: { includeArchived?: boolean } = {}): Promise<Supplier[]> {
  const rows = await db.select().from(purchasingSuppliers).where(eq(purchasingSuppliers.organizationId, organizationId)).orderBy(asc(purchasingSuppliers.name));
  return opts.includeArchived ? rows : rows.filter((r) => !r.archivedAt);
}

export async function getSupplier(organizationId: string, id: string): Promise<Supplier | null> {
  const [row] = await db.select().from(purchasingSuppliers).where(and(eq(purchasingSuppliers.organizationId, organizationId), eq(purchasingSuppliers.id, id))).limit(1);
  return row ?? null;
}

export type SupplierInput = {
  id?: string | null;
  name: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  licenseNumber?: string | null;
  licenseExpires?: string | null;
  notes?: string | null;
};

export async function saveSupplier(org: Org, input: SupplierInput): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const name = cleanText(input.name, 160);
  if (!name) return { ok: false, error: "Give the supplier a name." };
  const email = nullIfEmpty(input.email, 160);
  if (email && !looksLikeEmail(email)) return { ok: false, error: "That email address doesn't look right." };
  const expires = nullIfEmpty(input.licenseExpires, 10);
  if (expires && !isDay(expires)) return { ok: false, error: "The license expiration must be a real date." };
  const values = {
    name,
    contactName: nullIfEmpty(input.contactName, 120),
    email,
    phone: nullIfEmpty(input.phone, 40),
    address: nullIfEmpty(input.address, 400),
    licenseNumber: nullIfEmpty(input.licenseNumber, 60),
    licenseExpires: expires,
    notes: nullIfEmpty(input.notes, 600),
  };
  const now = new Date().toISOString();
  if (input.id) {
    const have = await getSupplier(org.organizationId, input.id);
    if (!have) return { ok: false, error: "That supplier wasn't found." };
    await db.update(purchasingSuppliers).set({ ...values, updatedAt: now }).where(and(eq(purchasingSuppliers.id, input.id), eq(purchasingSuppliers.organizationId, org.organizationId)));
    return { ok: true, id: input.id };
  }
  const id = newId("psup");
  await db.insert(purchasingSuppliers).values({ id, organizationId: org.organizationId, ...values });
  return { ok: true, id };
}

export async function setSupplierArchived(org: Org, id: string, archived: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const have = await getSupplier(org.organizationId, id);
  if (!have) return { ok: false, error: "That supplier wasn't found." };
  await db.update(purchasingSuppliers).set({ archivedAt: archived ? new Date().toISOString() : null, updatedAt: new Date().toISOString() }).where(and(eq(purchasingSuppliers.id, id), eq(purchasingSuppliers.organizationId, org.organizationId)));
  return { ok: true };
}

// ---- products to pick from ---------------------------------------------------------------------------------------

export type CatalogItem = { id: string; name: string; ndc: string; partNumber: string };

/** The company's active products (name, NDC, product code) for the "pick from your catalog" box on an order line. */
export async function catalogItems(organizationId: string): Promise<CatalogItem[]> {
  const rows = await db
    .select({ id: purchasingProducts.id, name: purchasingProducts.name, ndc: purchasingProducts.ndc, code: purchasingProducts.productCode })
    .from(purchasingProducts)
    .where(and(eq(purchasingProducts.organizationId, organizationId), eq(purchasingProducts.active, true)))
    .orderBy(asc(purchasingProducts.name));
  return rows.map((r) => ({ id: r.id, name: r.name, ndc: r.ndc ?? "", partNumber: r.code ?? r.ndc ?? "" }));
}

// ---- orders ------------------------------------------------------------------------------------------------------

export async function listPurchaseOrders(organizationId: string): Promise<PurchaseOrder[]> {
  return db.select().from(purchasingPurchaseOrders).where(eq(purchasingPurchaseOrders.organizationId, organizationId)).orderBy(desc(purchasingPurchaseOrders.seq));
}

/** How many items each order has, for the list. */
export async function lineCounts(organizationId: string): Promise<Record<string, number>> {
  const rows = await db.select({ id: purchasingPurchaseOrderLines.purchaseOrderId }).from(purchasingPurchaseOrderLines).where(eq(purchasingPurchaseOrderLines.organizationId, organizationId));
  const out: Record<string, number> = {};
  for (const r of rows) out[r.id] = (out[r.id] ?? 0) + 1;
  return out;
}

export async function getPurchaseOrder(organizationId: string, id: string): Promise<PoWithLines | null> {
  const [po] = await db.select().from(purchasingPurchaseOrders).where(and(eq(purchasingPurchaseOrders.organizationId, organizationId), eq(purchasingPurchaseOrders.id, id))).limit(1);
  if (!po) return null;
  const lines = await db.select().from(purchasingPurchaseOrderLines).where(and(eq(purchasingPurchaseOrderLines.organizationId, organizationId), eq(purchasingPurchaseOrderLines.purchaseOrderId, id))).orderBy(asc(purchasingPurchaseOrderLines.position));
  return { po, lines };
}

/** What a new order starts with: ship-to and bill-to from the company profile, the terms from the last order (or the standard wording). */
export async function newOrderDefaults(organizationId: string) {
  const ident = await companyIdentity(organizationId);
  const [last] = await db.select({ terms: purchasingPurchaseOrders.terms }).from(purchasingPurchaseOrders).where(eq(purchasingPurchaseOrders.organizationId, organizationId)).orderBy(desc(purchasingPurchaseOrders.seq)).limit(1);
  // The company's own Purchase Order template wording (Settings -> Document Templates) comes first, then the last order's, then ours.
  const { template } = await templateWithNotice(organizationId, "purchasing", "PURCHASE_ORDER");
  return { shipTo: ident.shipTo, billTo: ident.billTo, terms: template.termsText?.trim() ? template.termsText : last?.terms?.trim() ? last.terms : DEFAULT_PO_TERMS };
}

export type PoInput = {
  id?: string | null;
  supplierId?: string | null;
  supplierName: string;
  supplierAddress?: string | null;
  supplierEmail?: string | null;
  supplierLicense?: string | null;
  supplierLicenseExpires?: string | null;
  issueDate: string;
  shipToName?: string | null;
  shipToAddress?: string | null;
  billToName?: string | null;
  billToAddress?: string | null;
  reference?: string | null;
  comments?: string | null;
  terms?: string | null;
  shipping?: number | string | null;
  lines: PoLineInput[];
};

type PoPrepared = {
  ok: true;
  header: Omit<typeof purchasingPurchaseOrders.$inferInsert, "id" | "organizationId" | "seq" | "poNumber">;
  lineRows: (poId: string) => (typeof purchasingPurchaseOrderLines.$inferInsert)[];
  from: Identity;
};

async function preparePo(org: Org, input: PoInput): Promise<PoPrepared | { ok: false; error: string }> {
  const supplierName = cleanText(input.supplierName, 160);
  if (!supplierName) return { ok: false, error: "Choose or type the supplier this order is going to." };
  const supplierEmail = nullIfEmpty(input.supplierEmail, 160);
  if (supplierEmail && !looksLikeEmail(supplierEmail)) return { ok: false, error: "The supplier's email address doesn't look right." };
  if (!isDay(input.issueDate)) return { ok: false, error: "Enter the issue date of the order." };
  const expires = nullIfEmpty(input.supplierLicenseExpires, 10);
  if (expires && !isDay(expires)) return { ok: false, error: "The supplier's license expiration must be a real date." };
  const ship = Number(input.shipping ?? 0) || 0;
  if (ship < 0 || ship > 10_000_000) return { ok: false, error: "Shipping must be 0 or more." };
  const cleaned = cleanLines(Array.isArray(input.lines) ? input.lines : []);
  if (!cleaned.ok) return cleaned;

  // The supplier link counts only when the supplier belongs to this company.
  let supplierId: string | null = null;
  if (input.supplierId) {
    const sup = await getSupplier(org.organizationId, input.supplierId);
    if (!sup) return { ok: false, error: "That supplier wasn't found." };
    supplierId = sup.id;
  }
  const totals = computeTotals(cleaned.lines, ship);
  const from = await companyIdentity(org.organizationId);
  const header = {
    supplierId,
    supplierName,
    supplierAddress: nullIfEmpty(input.supplierAddress, 400),
    supplierEmail,
    supplierLicense: nullIfEmpty(input.supplierLicense, 60),
    supplierLicenseExpires: expires,
    issueDate: input.issueDate,
    shipToName: nullIfEmpty(input.shipToName, 160),
    shipToAddress: nullIfEmpty(input.shipToAddress, 400),
    billToName: nullIfEmpty(input.billToName, 160),
    billToAddress: nullIfEmpty(input.billToAddress, 400),
    reference: nullIfEmpty(input.reference, 300),
    comments: nullIfEmpty(input.comments, 1000),
    terms: nullIfEmpty(input.terms, 2000),
    subtotal: totals.subtotal,
    shipping: totals.shipping,
    total: totals.total,
  };
  const lineRows = (poId: string) =>
    cleaned.lines.map((l, i) => ({ id: newId("pol"), organizationId: org.organizationId, purchaseOrderId: poId, position: i, productId: l.productId, partNumber: l.partNumber, ndc: l.ndc, name: l.name, size: l.size, quantity: l.quantity, unit: l.unit, unitCost: l.unitCost, total: l.total }));
  return { ok: true, header, lineRows, from };
}

export async function savePurchaseOrder(org: Org, input: PoInput): Promise<{ ok: true; id: string; number: string } | { ok: false; error: string }> {
  const prep = await preparePo(org, input);
  if (!prep.ok) return prep;
  const { header, lineRows, from } = prep;
  const now = new Date().toISOString();

  if (input.id) {
    const have = await getPurchaseOrder(org.organizationId, input.id);
    if (!have) return { ok: false, error: "That purchase order wasn't found." };
    if (!isEditable(have.po.status as PoStatus)) return { ok: false, error: "Only a draft can be changed. Move it back to a draft first." };
    await db.batch([
      db.update(purchasingPurchaseOrders).set({ ...header, fromName: from.name, fromAddress: from.address, fromPhone: from.phone, fromEmail: from.email, updatedAt: now }).where(and(eq(purchasingPurchaseOrders.id, have.po.id), eq(purchasingPurchaseOrders.organizationId, org.organizationId))),
      db.delete(purchasingPurchaseOrderLines).where(and(eq(purchasingPurchaseOrderLines.purchaseOrderId, have.po.id), eq(purchasingPurchaseOrderLines.organizationId, org.organizationId))),
      db.insert(purchasingPurchaseOrderLines).values(lineRows(have.po.id)),
    ]);
    return { ok: true, id: have.po.id, number: have.po.poNumber };
  }

  // A new order takes the next free number. If two people save at the same moment the unique index stops the second, which tries the next number.
  for (let attempt = 0; attempt < 6; attempt++) {
    const seqs = (await db.select({ seq: purchasingPurchaseOrders.seq }).from(purchasingPurchaseOrders).where(eq(purchasingPurchaseOrders.organizationId, org.organizationId))).map((r) => r.seq);
    const seq = nextSeq(seqs);
    const id = newId("po");
    try {
      await db.batch([
        db.insert(purchasingPurchaseOrders).values({ id, organizationId: org.organizationId, seq, poNumber: formatPoNumber(seq), status: "DRAFT", ...header, fromName: from.name, fromAddress: from.address, fromPhone: from.phone, fromEmail: from.email, createdByUserId: org.userId }),
        db.insert(purchasingPurchaseOrderLines).values(lineRows(id)),
      ]);
      return { ok: true, id, number: formatPoNumber(seq) };
    } catch (e) {
      if (attempt === 5) return { ok: false, error: "The order couldn't be saved. Try again." };
      void e;
    }
  }
  return { ok: false, error: "The order couldn't be saved. Try again." };
}

export async function duplicatePurchaseOrder(org: Org, id: string, today: string): Promise<{ ok: true; id: string; number: string } | { ok: false; error: string }> {
  const have = await getPurchaseOrder(org.organizationId, id);
  if (!have) return { ok: false, error: "That purchase order wasn't found." };
  const { po, lines } = have;
  return savePurchaseOrder(org, {
    supplierId: po.supplierId,
    supplierName: po.supplierName,
    supplierAddress: po.supplierAddress,
    supplierEmail: po.supplierEmail,
    supplierLicense: po.supplierLicense,
    supplierLicenseExpires: po.supplierLicenseExpires,
    issueDate: today,
    shipToName: po.shipToName,
    shipToAddress: po.shipToAddress,
    billToName: po.billToName,
    billToAddress: po.billToAddress,
    reference: po.reference,
    comments: po.comments,
    terms: po.terms,
    shipping: po.shipping,
    lines: lines.map((l) => ({ productId: l.productId, partNumber: l.partNumber, ndc: l.ndc, name: l.name, size: l.size, quantity: l.quantity, unit: l.unit, unitCost: l.unitCost })),
  });
}

export async function deleteDraft(org: Org, id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const have = await getPurchaseOrder(org.organizationId, id);
  if (!have) return { ok: false, error: "That purchase order wasn't found." };
  if (have.po.status !== "DRAFT") return { ok: false, error: "Only a draft can be deleted. Cancel a sent order instead." };
  await db.delete(purchasingPurchaseOrders).where(and(eq(purchasingPurchaseOrders.id, id), eq(purchasingPurchaseOrders.organizationId, org.organizationId)));
  return { ok: true };
}

/** Moves an order along (Sent -> Confirmed -> Received, back to a draft, or Cancelled), only along the allowed steps. */
export async function setStatus(org: Org, id: string, to: string): Promise<{ ok: true; status: PoStatus } | { ok: false; error: string }> {
  if (!isPoStatus(to)) return { ok: false, error: "Something went wrong. Reload the page and try again." };
  const have = await getPurchaseOrder(org.organizationId, id);
  if (!have) return { ok: false, error: "That purchase order wasn't found." };
  const from = have.po.status as PoStatus;
  if (!canMoveTo(from, to)) return { ok: false, error: "That step isn't available for this order right now." };
  await db.update(purchasingPurchaseOrders).set({ status: to, updatedAt: new Date().toISOString() }).where(and(eq(purchasingPurchaseOrders.id, id), eq(purchasingPurchaseOrders.organizationId, org.organizationId)));
  return { ok: true, status: to };
}

// ---- the PDF and the email ---------------------------------------------------------------------------------------

export async function pdfInputFor(organizationId: string, d: PoWithLines): Promise<PoPdfInput> {
  const [ident, { template, notice }] = await Promise.all([companyIdentity(organizationId), templateWithNotice(organizationId, "purchasing", "PURCHASE_ORDER")]);
  const { po, lines } = d;
  return {
    number: po.poNumber,
    status: po.status,
    issueDate: po.issueDate,
    // The company as it was when the order was made; the template's name and logo win when the company set them there.
    from: {
      name: template.displayName ?? po.fromName ?? ident.name,
      address: po.fromAddress ?? ident.address,
      phone: po.fromPhone ?? ident.phone,
      email: po.fromEmail ?? ident.email,
      logoDataUrl: template.showLogo ? (template.logoDataUrl ?? ident.logoDataUrl) : null,
    },
    title: template.titleText,
    intro: template.introText,
    footer: template.footerText,
    notice,
    revision: po.revision ?? 0,
    revisionNote: po.revisionNote,
    supplier: { name: po.supplierName, address: po.supplierAddress, email: po.supplierEmail, license: po.supplierLicense, licenseExpires: po.supplierLicenseExpires },
    shipTo: { name: po.shipToName, address: po.shipToAddress },
    billTo: { name: po.billToName, address: po.billToAddress },
    reference: po.reference,
    comments: po.comments,
    terms: po.terms,
    lines: lines.map((l) => ({ partNumber: l.partNumber, ndc: l.ndc, name: l.name, size: l.size, quantity: l.quantity, unit: l.unit, unitCost: l.unitCost, total: l.total })),
    subtotal: po.subtotal,
    shipping: po.shipping,
    total: po.total,
  };
}

export async function renderPdf(organizationId: string, id: string): Promise<{ bytes: Uint8Array; fileName: string } | null> {
  const d = await getPurchaseOrder(organizationId, id);
  if (!d) return null;
  const bytes = await buildPurchaseOrderPdf(await pdfInputFor(organizationId, d));
  return { bytes, fileName: poFileName(d.po.poNumber, d.po.supplierName, d.po.revision) };
}

export async function emailFor(organizationId: string, d: PoWithLines, message?: string | null) {
  const p = await pdfInputFor(organizationId, d);
  const input: PoEmailInput = {
    number: p.number,
    issueDate: p.issueDate,
    from: p.from,
    supplier: { name: p.supplier.name },
    shipTo: p.shipTo,
    billTo: p.billTo,
    reference: p.reference,
    comments: p.comments,
    terms: p.terms,
    lines: p.lines,
    subtotal: p.subtotal,
    shipping: p.shipping,
    total: p.total,
    message: message ?? null,
    title: p.title,
    intro: p.intro,
    footer: p.footer,
    notice: p.notice,
    revision: p.revision,
    revisionNote: p.revisionNote,
  };
  return buildPoEmail(input);
}

/** Sends the order by email (the order written out in the body, the PDF attached). Injected so tests can use a stand-in. */
export type Mailer = (args: { to: string; subject: string; text: string; html: string; fromName: string; replyTo: string | null; fileName: string; pdf: Uint8Array }) => Promise<{ ok: true } | { ok: false; error: string }>;

export type SendOutcome = { ok: true; emailedTo: string | null } | { ok: false; error: string };

/**
 * Sends a draft (or sends a sent order again). The email goes first; only when it was accepted is the order marked Sent, so a
 * failed email leaves the draft exactly as it was. `mailer` null means "mark as sent without emailing" (it was sent another way).
 */
export async function sendPurchaseOrder(org: Org, id: string, opts: { mailer: Mailer | null; to?: string | null; message?: string | null }): Promise<SendOutcome> {
  const have = await getPurchaseOrder(org.organizationId, id);
  if (!have) return { ok: false, error: "That purchase order wasn't found." };
  const status = have.po.status as PoStatus;
  if (status !== "DRAFT" && status !== "SENT") return { ok: false, error: "This order can't be sent again." };
  if (!have.lines.length) return { ok: false, error: "Add at least one item before sending." };
  const to = nullIfEmpty(opts.to, 160) ?? have.po.supplierEmail;
  if (opts.mailer) {
    if (!to) return { ok: false, error: "Add the supplier's email address to send it." };
    if (!looksLikeEmail(to)) return { ok: false, error: "That email address doesn't look right." };
    try {
      const mail = await emailFor(org.organizationId, have, nullIfEmpty(opts.message, 2000));
      const pdf = await buildPurchaseOrderPdf(await pdfInputFor(org.organizationId, have));
      const ident = await companyIdentity(org.organizationId);
      const sent = await opts.mailer({ to, subject: mail.subject, text: mail.text, html: mail.html, fromName: have.po.fromName ?? ident.name, replyTo: have.po.fromEmail ?? ident.email, fileName: poFileName(have.po.poNumber, have.po.supplierName, have.po.revision), pdf });
      if (!sent.ok) return { ok: false, error: `The email wasn't sent, so nothing was changed. ${sent.error}` };
    } catch (e) {
      return { ok: false, error: `The email wasn't sent, so nothing was changed. ${e instanceof Error ? e.message : ""}`.trim() };
    }
  }
  const now = new Date().toISOString();
  await db
    .update(purchasingPurchaseOrders)
    .set({ status: "SENT", sentAt: now, emailedTo: opts.mailer ? to : have.po.emailedTo, updatedAt: now })
    .where(and(eq(purchasingPurchaseOrders.id, id), eq(purchasingPurchaseOrders.organizationId, org.organizationId)));
  return { ok: true, emailedTo: opts.mailer ? to : null };
}

// ---- revisions ---------------------------------------------------------------------------------------------------

export type ReviseOutcome = { ok: true; revision: number; emailedTo: string | null } | { ok: false; error: string };

/**
 * Sends a revision of an order the supplier already has (Sent or Confirmed): a required note saying what changed or what is
 * wrong ("you sent 15 boxes, we ordered 20"), optionally with the items changed too. The supplier gets the PDF marked "Revision n"
 * with the note in a box, and an email in the same words. The email goes first; if it is refused nothing is changed. The
 * version before the change is kept in the revision history.
 */
export async function revisePurchaseOrder(
  org: Org,
  id: string,
  opts: { note: unknown; edits?: PoInput | null; mailer: Mailer | null; to?: string | null; message?: string | null },
): Promise<ReviseOutcome> {
  const noted = cleanRevisionNote(opts.note);
  if (!noted.ok) return noted;
  const have = await getPurchaseOrder(org.organizationId, id);
  if (!have) return { ok: false, error: "That purchase order wasn't found." };
  if (have.po.status === "DRAFT") return { ok: false, error: "This order hasn't been sent yet. Just edit it and send it." };
  if (have.po.status !== "SENT" && have.po.status !== "CONFIRMED") return { ok: false, error: "Only an order the supplier already has (Sent or Confirmed) can be revised." };

  const now = new Date().toISOString();
  const revision = nextRevision(have.po.revision);
  let nextPo: PurchaseOrder = { ...have.po, revision, revisionNote: noted.note, revisedAt: now, status: "SENT", updatedAt: now };
  let nextLines: PurchaseOrderLine[] = have.lines;
  let rows: (typeof purchasingPurchaseOrderLines.$inferInsert)[] | null = null;
  if (opts.edits) {
    const prep = await preparePo(org, { ...opts.edits, id });
    if (!prep.ok) return prep;
    nextPo = { ...nextPo, ...(prep.header as Partial<PurchaseOrder>) };
    rows = prep.lineRows(id);
    nextLines = rows.map((r) => ({ ...r, productId: r.productId ?? null, partNumber: r.partNumber ?? null, ndc: r.ndc ?? null, size: r.size ?? null, createdAt: now, updatedAt: now })) as PurchaseOrderLine[];
  }
  const next: PoWithLines = { po: nextPo, lines: nextLines };

  const to = nullIfEmpty(opts.to, 160) ?? nextPo.supplierEmail;
  if (opts.mailer) {
    if (!to) return { ok: false, error: "Add the supplier's email address to send the revision." };
    if (!looksLikeEmail(to)) return { ok: false, error: "That email address doesn't look right." };
    try {
      const mail = await emailFor(org.organizationId, next, nullIfEmpty(opts.message, 2000));
      const pdf = await buildPurchaseOrderPdf(await pdfInputFor(org.organizationId, next));
      const ident = await companyIdentity(org.organizationId);
      const sent = await opts.mailer({ to, subject: mail.subject, text: mail.text, html: mail.html, fromName: nextPo.fromName ?? ident.name, replyTo: nextPo.fromEmail ?? ident.email, fileName: poFileName(nextPo.poNumber, nextPo.supplierName, revision), pdf });
      if (!sent.ok) return { ok: false, error: `The email wasn't sent, so nothing was changed. ${sent.error}` };
    } catch (e) {
      return { ok: false, error: `The email wasn't sent, so nothing was changed. ${e instanceof Error ? e.message : ""}`.trim() };
    }
  }

  await addRevisionRecord({ organizationId: org.organizationId, userId: org.userId, source: "purchasing_po", documentId: id, revision, note: noted.note, before: have, emailedTo: opts.mailer ? to : null });
  const { id: _id, organizationId: _o, seq: _s, poNumber: _n, createdAt: _c, ...changes } = nextPo;
  void [_id, _o, _s, _n, _c];
  const update = db
    .update(purchasingPurchaseOrders)
    .set({ ...changes, sentAt: now, emailedTo: opts.mailer ? to : have.po.emailedTo })
    .where(and(eq(purchasingPurchaseOrders.id, id), eq(purchasingPurchaseOrders.organizationId, org.organizationId)));
  if (rows) {
    await db.batch([
      update,
      db.delete(purchasingPurchaseOrderLines).where(and(eq(purchasingPurchaseOrderLines.purchaseOrderId, id), eq(purchasingPurchaseOrderLines.organizationId, org.organizationId))),
      db.insert(purchasingPurchaseOrderLines).values(rows),
    ]);
  } else {
    await update;
  }
  return { ok: true, revision, emailedTo: opts.mailer ? to : null };
}

export async function orderCounts(organizationId: string): Promise<Record<PoStatus, number>> {
  const rows = await db.select({ status: purchasingPurchaseOrders.status }).from(purchasingPurchaseOrders).where(eq(purchasingPurchaseOrders.organizationId, organizationId));
  const out: Record<PoStatus, number> = { DRAFT: 0, SENT: 0, CONFIRMED: 0, RECEIVED: 0, CANCELLED: 0 };
  for (const r of rows) if (isPoStatus(r.status)) out[r.status]++;
  return out;
}
