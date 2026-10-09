// Sales: loading and saving buyers, price sheets, quotations and invoices. The arithmetic is in sales-rules.ts and the
// stock itself belongs to Inventory (inventory-service.ts): Sales only asks it what is on hand and tells it what was sold.
//
// How an invoice moves stock:
//   DRAFT   holds its units (they are "reserved": still on hand, but not available to another draft)
//   SENT    takes the units out of Inventory, earliest expiration first (one SALE row per layer, with the invoice id)
//   VOID    puts every unit back (an ADJUSTMENT row per SALE row)

import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  organizations,
  purchasingCategories,
  purchasingProducts,
  salesBuyers,
  salesDocumentLines,
  salesDocuments,
  salesPayments,
  salesPriceItems,
  salesPriceSheets,
  salesProfiles,
} from "@/db/schema";
import { newId } from "@/lib/ids";
import { templateWithNotice } from "@/lib/document-template-service";
import { cleanRevisionNote, nextRevision } from "@/lib/document-template-rules";
import { addRevisionRecord } from "@/lib/document-revision-service";
import type { DocType } from "@/lib/operation-type";
import { brandFor } from "@/lib/receiving-serial-rules";
import { todayIn } from "@/lib/payment-due";
import { getPaymentTerms } from "@/lib/accounts-queries";
import { discardMovements, deductStockMany, getInventory, returnSale } from "@/lib/inventory-service";
import { expirySpan, normKey, productKeyOf } from "@/lib/inventory-rules";
import {
  afterPayment,
  buildReserved,
  buildStockMap,
  cleanText,
  computeTotals,
  dueDateFor,
  formatNumber,
  isOrderDoc,
  looksLikeEmail,
  lineAmount,
  matchProduct,
  round2,
  shortfalls,
  validateLines,
  type LineInput,
  type Reserved,
  type SalesKind,
  type SheetItem,
  type StockMap,
} from "@/lib/sales-rules";
import { buildSalesPdf, pdfFileName, type SalesPdfInput } from "@/lib/sales-pdf";

export type Org = { organizationId: string; userId: string };
export type SalesProfile = typeof salesProfiles.$inferSelect;
export type SalesBuyer = typeof salesBuyers.$inferSelect;
export type SalesDocument = typeof salesDocuments.$inferSelect;
export type SalesLine = typeof salesDocumentLines.$inferSelect;

const nz = (v: string | null | undefined) => {
  const s = (v ?? "").trim();
  return s ? s : null;
};

// ---- company profile ---------------------------------------------------------------------------------------------

export async function getSalesProfile(organizationId: string): Promise<SalesProfile | null> {
  const [row] = await db.select().from(salesProfiles).where(eq(salesProfiles.organizationId, organizationId)).limit(1);
  return row ?? null;
}

export async function ensureSalesProfile(organizationId: string): Promise<SalesProfile> {
  const have = await getSalesProfile(organizationId);
  if (have) return have;
  await db.insert(salesProfiles).values({ id: newId("sprof"), organizationId }).onConflictDoNothing();
  return (await getSalesProfile(organizationId))!;
}

export type FromIdentity = { name: string; address: string | null; phone: string | null; email: string | null; logoDataUrl: string | null; footer: string | null; defaultTerms: string; defaultNotes: string | null };

/** What an invoice says it is "from": the Sales profile where filled in, otherwise the company's name. */
export async function resolveFrom(organizationId: string, profile?: SalesProfile | null): Promise<FromIdentity> {
  const p = profile === undefined ? await getSalesProfile(organizationId) : profile;
  const [org] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  const logoOk = p?.showLogo !== false && p?.logoData && p?.logoContentType;
  return {
    name: nz(p?.companyName) ?? org?.name ?? "Our company",
    address: nz(p?.address),
    phone: nz(p?.phone),
    email: nz(p?.email),
    logoDataUrl: logoOk ? `data:${p!.logoContentType};base64,${p!.logoData}` : null,
    footer: nz(p?.footerText),
    defaultTerms: p?.defaultTerms || "Due on Receipt",
    defaultNotes: nz(p?.defaultNotes),
  };
}

/** Takes the next number for a quotation or an invoice (never one already in use, even if the counter was moved back). */
async function takeNumber(organizationId: string, kind: SalesKind): Promise<{ seq: number; number: string }> {
  await ensureSalesProfile(organizationId);
  for (let i = 0; i < 200; i++) {
    const col = kind === "INVOICE" ? salesProfiles.nextInvoiceNumber : kind === "PURCHASE_ORDER" ? salesProfiles.nextPurchaseOrderNumber : salesProfiles.nextQuotationNumber;
    const bump =
      kind === "INVOICE"
        ? { nextInvoiceNumber: sql`${salesProfiles.nextInvoiceNumber} + 1` }
        : kind === "PURCHASE_ORDER"
          ? { nextPurchaseOrderNumber: sql`coalesce(${salesProfiles.nextPurchaseOrderNumber}, 1001) + 1` }
          : { nextQuotationNumber: sql`${salesProfiles.nextQuotationNumber} + 1` };
    const [row] = await db.update(salesProfiles).set(bump).where(eq(salesProfiles.organizationId, organizationId)).returning({ next: col });
    const seq = (row?.next ?? 1) - 1;
    const [taken] = await db
      .select({ id: salesDocuments.id })
      .from(salesDocuments)
      .where(and(eq(salesDocuments.organizationId, organizationId), eq(salesDocuments.kind, kind), eq(salesDocuments.seq, seq)))
      .limit(1);
    if (!taken) return { seq, number: formatNumber(kind, seq) };
  }
  throw new Error("Couldn't find a free document number.");
}

// ---- buyers ------------------------------------------------------------------------------------------------------

export async function listBuyers(organizationId: string): Promise<SalesBuyer[]> {
  return db.select().from(salesBuyers).where(eq(salesBuyers.organizationId, organizationId)).orderBy(asc(salesBuyers.companyName));
}

export async function getBuyer(organizationId: string, id: string): Promise<SalesBuyer | null> {
  const [row] = await db.select().from(salesBuyers).where(and(eq(salesBuyers.organizationId, organizationId), eq(salesBuyers.id, id))).limit(1);
  return row ?? null;
}

export type BuyerInput = {
  companyName: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  billingAddress?: string | null;
  shippingAddress?: string | null;
  paymentTerms?: string | null;
  taxInfo?: string | null;
  taxExempt?: boolean;
  defaultNotes?: string | null;
  active?: boolean;
};

const buyerValues = (i: BuyerInput) => ({
  companyName: cleanText(i.companyName, 120),
  contactName: nz(cleanText(i.contactName, 120)),
  email: nz(cleanText(i.email, 160)),
  phone: nz(cleanText(i.phone, 40)),
  billingAddress: nz(cleanText(i.billingAddress, 400)),
  shippingAddress: nz(cleanText(i.shippingAddress, 400)),
  paymentTerms: nz(cleanText(i.paymentTerms, 40)),
  taxInfo: nz(cleanText(i.taxInfo, 120)),
  taxExempt: !!i.taxExempt,
  defaultNotes: nz(cleanText(i.defaultNotes, 1000)),
  active: i.active !== false,
});

export async function createBuyer(org: Org, input: BuyerInput): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const v = buyerValues(input);
  if (!v.companyName) return { ok: false, error: "Enter the buyer's company name." };
  const dupe = (await listBuyers(org.organizationId)).find((b) => normKey(b.companyName) === normKey(v.companyName));
  if (dupe) return { ok: false, error: `${dupe.companyName} is already in your buyers.` };
  const id = newId("sbuyer");
  await db.insert(salesBuyers).values({ id, organizationId: org.organizationId, ...v });
  return { ok: true, id };
}

export async function updateBuyer(org: Org, id: string, input: BuyerInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const v = buyerValues(input);
  if (!v.companyName) return { ok: false, error: "Enter the buyer's company name." };
  const have = await getBuyer(org.organizationId, id);
  if (!have) return { ok: false, error: "That buyer wasn't found." };
  const dupe = (await listBuyers(org.organizationId)).find((b) => b.id !== id && normKey(b.companyName) === normKey(v.companyName));
  if (dupe) return { ok: false, error: `${dupe.companyName} is already in your buyers.` };
  await db.update(salesBuyers).set({ ...v, updatedAt: new Date().toISOString() }).where(and(eq(salesBuyers.organizationId, org.organizationId), eq(salesBuyers.id, id)));
  return { ok: true };
}

/** Adds the buyers in a spreadsheet (one row each); a buyer already there (same company name) is skipped, never changed. */
export async function importBuyers(org: Org, rows: BuyerInput[]): Promise<{ added: number; skipped: number; invalid: number }> {
  const existing = new Set((await listBuyers(org.organizationId)).map((b) => normKey(b.companyName)));
  const toAdd: (typeof salesBuyers.$inferInsert)[] = [];
  let skipped = 0;
  let invalid = 0;
  for (const r of rows) {
    const v = buyerValues(r);
    if (!v.companyName) {
      invalid += 1;
      continue;
    }
    const k = normKey(v.companyName);
    if (existing.has(k)) {
      skipped += 1;
      continue;
    }
    existing.add(k);
    toAdd.push({ id: newId("sbuyer"), organizationId: org.organizationId, ...v });
  }
  for (let i = 0; i < toAdd.length; i += 50) await db.insert(salesBuyers).values(toAdd.slice(i, i + 50));
  return { added: toAdd.length, skipped, invalid };
}

// ---- products (the catalog Sales sells from) ---------------------------------------------------------------------

export type SellableProduct = { id: string; key: string; name: string; brand: string; code: string | null };

export async function sellableProducts(organizationId: string): Promise<SellableProduct[]> {
  const rows = await db
    .select({ id: purchasingProducts.id, name: purchasingProducts.name, code: purchasingProducts.productCode, category: purchasingCategories.name })
    .from(purchasingProducts)
    .leftJoin(purchasingCategories, eq(purchasingCategories.id, purchasingProducts.categoryId))
    .where(and(eq(purchasingProducts.organizationId, organizationId), eq(purchasingProducts.active, true)))
    .orderBy(asc(purchasingProducts.name));
  return rows
    .filter((r) => !!r.name)
    .map((r) => ({ id: r.id, key: productKeyOf(r.id, r.name), name: r.name, brand: (r.category ?? brandFor(r.name) ?? "Other").trim() || "Other", code: r.code }));
}

// ---- price sheets ------------------------------------------------------------------------------------------------

export async function getPriceSheet(organizationId: string, buyerId: string) {
  const [row] = await db
    .select({ id: salesPriceSheets.id, fileName: salesPriceSheets.fileName, fileContentType: salesPriceSheets.fileContentType, createdAt: salesPriceSheets.createdAt, updatedAt: salesPriceSheets.updatedAt })
    .from(salesPriceSheets)
    .where(and(eq(salesPriceSheets.organizationId, organizationId), eq(salesPriceSheets.buyerId, buyerId)))
    .limit(1);
  return row ?? null;
}

export async function getPriceSheetFile(organizationId: string, buyerId: string) {
  const [row] = await db
    .select()
    .from(salesPriceSheets)
    .where(and(eq(salesPriceSheets.organizationId, organizationId), eq(salesPriceSheets.buyerId, buyerId)))
    .limit(1);
  return row ?? null;
}

export async function listPriceItems(organizationId: string, buyerId?: string) {
  const where = buyerId ? and(eq(salesPriceItems.organizationId, organizationId), eq(salesPriceItems.buyerId, buyerId)) : eq(salesPriceItems.organizationId, organizationId);
  return db.select().from(salesPriceItems).where(where).orderBy(asc(salesPriceItems.rawName));
}

/**
 * Replaces a buyer's price sheet: keeps the file as it came and the prices read from it, matching each name to a catalog
 * product where it can tell. The names it can't tell stay unmatched until a person picks the product.
 */
export async function savePriceSheet(
  org: Org,
  buyerId: string,
  file: { name: string; contentType: string; base64: string | null },
  items: SheetItem[],
): Promise<{ ok: true; matched: number; unmatched: number } | { ok: false; error: string }> {
  const buyer = await getBuyer(org.organizationId, buyerId);
  if (!buyer) return { ok: false, error: "That buyer wasn't found." };
  if (!items.length) return { ok: false, error: "No prices were found in that file." };
  if (items.length > 5000) return { ok: false, error: "That sheet has more than 5,000 prices. Split it and upload the parts." };
  const products = await sellableProducts(org.organizationId);
  const candidates = products.map((p) => ({ id: p.id, name: p.name }));
  const byId = new Map(products.map((p) => [p.id, p]));
  await db.delete(salesPriceItems).where(and(eq(salesPriceItems.organizationId, org.organizationId), eq(salesPriceItems.buyerId, buyerId)));
  await db.delete(salesPriceSheets).where(and(eq(salesPriceSheets.organizationId, org.organizationId), eq(salesPriceSheets.buyerId, buyerId)));
  const sheetId = newId("sheet");
  await db.insert(salesPriceSheets).values({ id: sheetId, organizationId: org.organizationId, buyerId, fileName: cleanText(file.name, 200) || "price-sheet", fileContentType: file.contentType, fileData: file.base64, uploadedByUserId: org.userId });
  let matched = 0;
  const rows = items.map((it) => {
    const m = matchProduct(it.rawName, candidates);
    if (m) matched += 1;
    const p = m ? byId.get(m.id) : null;
    return { id: newId("sprice"), organizationId: org.organizationId, buyerId, sheetId, rawName: cleanText(it.rawName, 200), productId: p?.id ?? null, productKey: p?.key ?? null, condition: cleanText(it.condition, 40) || "Mint", price: round2(it.price) };
  });
  for (let i = 0; i < rows.length; i += 100) await db.insert(salesPriceItems).values(rows.slice(i, i + 100));
  return { ok: true, matched, unmatched: rows.length - matched };
}

export async function matchPriceItem(org: Org, itemId: string, productId: string | null): Promise<{ ok: true } | { ok: false; error: string }> {
  let productKey: string | null = null;
  if (productId) {
    const p = (await sellableProducts(org.organizationId)).find((x) => x.id === productId);
    if (!p) return { ok: false, error: "That product wasn't found." };
    productKey = p.key;
  }
  const res = await db
    .update(salesPriceItems)
    .set({ productId, productKey, updatedAt: new Date().toISOString() })
    .where(and(eq(salesPriceItems.organizationId, org.organizationId), eq(salesPriceItems.id, itemId)))
    .returning({ id: salesPriceItems.id });
  return res.length ? { ok: true } : { ok: false, error: "That price wasn't found." };
}

export async function updatePriceItem(org: Org, itemId: string, price: number): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Number.isFinite(price) || price < 0 || price > 10_000_000) return { ok: false, error: "Enter a price of $0 or more." };
  const res = await db
    .update(salesPriceItems)
    .set({ price: round2(price), updatedAt: new Date().toISOString() })
    .where(and(eq(salesPriceItems.organizationId, org.organizationId), eq(salesPriceItems.id, itemId)))
    .returning({ id: salesPriceItems.id });
  return res.length ? { ok: true } : { ok: false, error: "That price wasn't found." };
}

export async function deletePriceItem(org: Org, itemId: string) {
  await db.delete(salesPriceItems).where(and(eq(salesPriceItems.organizationId, org.organizationId), eq(salesPriceItems.id, itemId)));
}

/** "buyerId" -> "productKey|condition" -> price, for filling a unit price when a buyer and a product are chosen. */
export async function buyerPriceMap(organizationId: string): Promise<Record<string, Record<string, number>>> {
  const items = await listPriceItems(organizationId);
  const out: Record<string, Record<string, number>> = {};
  for (const i of items) {
    if (!i.productKey) continue;
    (out[i.buyerId] ??= {})[`${i.productKey}|${normKey(i.condition)}`] = i.price;
  }
  return out;
}

// ---- documents ---------------------------------------------------------------------------------------------------

export type DocWithLines = { doc: SalesDocument; lines: SalesLine[]; payments: (typeof salesPayments.$inferSelect)[] };

export async function listDocuments(organizationId: string, kind: SalesKind) {
  return db
    .select()
    .from(salesDocuments)
    .where(and(eq(salesDocuments.organizationId, organizationId), eq(salesDocuments.kind, kind)))
    .orderBy(desc(salesDocuments.seq));
}

export async function getDocument(organizationId: string, id: string): Promise<DocWithLines | null> {
  const [doc] = await db.select().from(salesDocuments).where(and(eq(salesDocuments.organizationId, organizationId), eq(salesDocuments.id, id))).limit(1);
  if (!doc) return null;
  const [lines, payments] = await Promise.all([
    db.select().from(salesDocumentLines).where(eq(salesDocumentLines.documentId, id)).orderBy(asc(salesDocumentLines.position)),
    db.select().from(salesPayments).where(eq(salesPayments.documentId, id)).orderBy(asc(salesPayments.paidOn), asc(salesPayments.createdAt)),
  ]);
  return { doc, lines, payments };
}

/** Units that DRAFT invoices hold, not counting the invoice being edited. */
export async function reservedByDrafts(organizationId: string, excludeDocId?: string | null): Promise<Reserved> {
  const rows = await db
    .select({ id: salesDocuments.id, productKey: salesDocumentLines.productKey, condition: salesDocumentLines.condition, groupKey: salesDocumentLines.groupKey, quantity: salesDocumentLines.quantity })
    .from(salesDocumentLines)
    .innerJoin(salesDocuments, eq(salesDocuments.id, salesDocumentLines.documentId))
    .where(and(eq(salesDocuments.organizationId, organizationId), eq(salesDocuments.kind, "INVOICE"), eq(salesDocuments.status, "DRAFT")));
  return buildReserved(rows.filter((r) => r.id !== excludeDocId));
}

/** Live stock and what drafts hold, as of today: everything the editor needs to show "in stock" beside each item. */
export async function salesStockContext(organizationId: string, excludeDocId?: string | null): Promise<{ stock: StockMap; reserved: Reserved; today: string }> {
  const [inv, reserved] = await Promise.all([getInventory(organizationId), reservedByDrafts(organizationId, excludeDocId)]);
  return { stock: buildStockMap(inv.lines), reserved, today: inv.today };
}

export type DocInput = {
  id?: string | null;
  kind: SalesKind;
  buyerId: string | null;
  buyerCompany: string;
  buyerContact?: string | null;
  buyerBillingAddress?: string | null;
  buyerShippingAddress?: string | null;
  buyerEmail?: string | null;
  buyerPhone?: string | null;
  docDate: string;
  dueDate?: string | null;
  terms?: string | null;
  reference?: string | null;
  discount?: number;
  shipping?: number;
  tax?: number;
  otherCharges?: number;
  customerNotes?: string | null;
  internalNotes?: string | null;
  lines: LineInput[];
};

const isDayText = (v: string | null | undefined) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const money0 = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : NaN;
};

type Prepared = { header: ReturnType<typeof buildHeader>; lineRows: (docId: string) => (typeof salesDocumentLines.$inferInsert)[] };

function buildHeader(input: DocInput, company: string, dueDate: string, terms: string | null, from: FromIdentity, totals: { subtotal: number; total: number }, nums: { discount: number; shipping: number; tax: number; otherCharges: number }) {
  return {
    buyerId: input.buyerId,
    buyerCompany: company,
    buyerContact: nz(cleanText(input.buyerContact, 120)),
    buyerBillingAddress: nz(cleanText(input.buyerBillingAddress, 400)),
    buyerShippingAddress: nz(cleanText(input.buyerShippingAddress, 400)),
    buyerEmail: nz(cleanText(input.buyerEmail, 160)),
    buyerPhone: nz(cleanText(input.buyerPhone, 40)),
    fromName: from.name,
    fromAddress: from.address,
    fromEmail: from.email,
    fromPhone: from.phone,
    docDate: input.docDate,
    dueDate,
    terms,
    reference: nz(cleanText(input.reference, 120)),
    discount: nums.discount,
    shipping: nums.shipping,
    tax: nums.tax,
    otherCharges: nums.otherCharges,
    subtotal: totals.subtotal,
    total: totals.total,
    customerNotes: nz(cleanText(input.customerNotes, 2000)),
    internalNotes: nz(cleanText(input.internalNotes, 2000)),
  };
}

/** Checks a document as typed and works out its totals and rows. Nothing is trusted from the browser. */
async function prepareDocument(org: Org, input: DocInput): Promise<({ ok: true } & Prepared) | { ok: false; error: string }> {
  const company = cleanText(input.buyerCompany, 120);
  if (!company) return { ok: false, error: "Choose a buyer, or type the company name." };
  if (!isDayText(input.docDate)) return { ok: false, error: "Enter the date." };
  const bad = validateLines(input.lines);
  if (bad) return { ok: false, error: bad };
  const nums = [input.discount, input.shipping, input.tax, input.otherCharges].map(money0);
  if (nums.some((n) => Number.isNaN(n) || n < 0 || n > 10_000_000)) return { ok: false, error: "Discount, shipping, tax and other charges must be $0 or more." };
  const [discount, shipping, tax, otherCharges] = nums.map(round2);
  const totals = computeTotals({ lines: input.lines, discount, shipping, tax, otherCharges });
  if (totals.total < 0) return { ok: false, error: "The discount is bigger than the order." };

  const terms = nz(cleanText(input.terms, 40));
  const dueDate = isDayText(input.dueDate) ? (input.dueDate as string) : dueDateFor(input.docDate, terms);
  const from = await resolveFrom(org.organizationId);
  const header = buildHeader(input, company, dueDate, terms, from, totals, { discount, shipping, tax, otherCharges });
  const lineRows = (docId: string) =>
    input.lines.map((l, position) => ({
      id: newId("sline"),
      organizationId: org.organizationId,
      documentId: docId,
      position,
      productId: l.productId,
      productKey: l.productKey,
      productName: cleanText(l.productName, 200),
      condition: cleanText(l.condition, 40),
      groupKey: l.groupKey || null,
      groupLabel: nz(cleanText(l.groupLabel, 60)),
      quantity: l.quantity,
      unitPrice: round2(l.unitPrice),
      note: nz(cleanText(l.note, 200)),
      ndc: nz(cleanText(l.ndc, 40)),
    }));
  return { ok: true, header, lineRows };
}

/** Creates or updates a DRAFT quotation, purchase order or invoice. Totals are always worked out here, never trusted from the browser. */
export async function saveDocument(org: Org, input: DocInput): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const prep = await prepareDocument(org, input);
  if (!prep.ok) return prep;
  const { header, lineRows } = prep;

  if (input.id) {
    const have = await getDocument(org.organizationId, input.id);
    if (!have || have.doc.kind !== input.kind) return { ok: false, error: "That document wasn't found." };
    if (have.doc.status !== "DRAFT") return { ok: false, error: "Only a draft can be changed. Make a copy, or send a revision, to change a sent one." };
    await db.update(salesDocuments).set({ ...header, updatedAt: new Date().toISOString() }).where(eq(salesDocuments.id, input.id));
    await db.delete(salesDocumentLines).where(eq(salesDocumentLines.documentId, input.id));
    await db.insert(salesDocumentLines).values(lineRows(input.id));
    return { ok: true, id: input.id };
  }
  const { seq, number } = await takeNumber(org.organizationId, input.kind);
  const id = newId(input.kind === "INVOICE" ? "sinv" : input.kind === "PURCHASE_ORDER" ? "spo" : "squo");
  await db.insert(salesDocuments).values({ id, organizationId: org.organizationId, kind: input.kind, seq, number, status: "DRAFT", createdByUserId: org.userId, ...header });
  await db.insert(salesDocumentLines).values(lineRows(id));
  return { ok: true, id };
}

const asInputLines = (lines: SalesLine[]): LineInput[] =>
  lines.map((l) => ({ productId: l.productId, productKey: l.productKey, productName: l.productName, condition: l.condition, groupKey: l.groupKey, groupLabel: l.groupLabel, quantity: l.quantity, unitPrice: l.unitPrice, note: l.note, ndc: l.ndc }));

/** A new DRAFT of the same kind with the same buyer and items (to change a sent document, or repeat an order). */
export async function duplicateDocument(org: Org, id: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const have = await getDocument(org.organizationId, id);
  if (!have) return { ok: false, error: "That document wasn't found." };
  const d = have.doc;
  const today = todayIn((await getPaymentTerms(org.organizationId)).timeZone);
  return saveDocument(org, {
    kind: d.kind,
    buyerId: d.buyerId,
    buyerCompany: d.buyerCompany ?? "",
    buyerContact: d.buyerContact,
    buyerBillingAddress: d.buyerBillingAddress,
    buyerShippingAddress: d.buyerShippingAddress,
    buyerEmail: d.buyerEmail,
    buyerPhone: d.buyerPhone,
    docDate: today,
    dueDate: null,
    terms: d.terms,
    reference: d.reference,
    discount: d.discount,
    shipping: d.shipping,
    tax: d.tax,
    otherCharges: d.otherCharges,
    customerNotes: d.customerNotes,
    internalNotes: d.internalNotes,
    lines: asInputLines(have.lines),
  });
}

/** Makes a DRAFT invoice from a quotation or a received purchase order (same buyer and items); the original is marked as made into an invoice. */
export async function convertToInvoice(org: Org, quotationId: string): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const have = await getDocument(org.organizationId, quotationId);
  if (!have || !isOrderDoc(have.doc.kind)) return { ok: false, error: "That quotation or purchase order wasn't found." };
  const d = have.doc;
  const word = d.kind === "PURCHASE_ORDER" ? "purchase order" : "quotation";
  if (d.status === "CONVERTED") return { ok: false, error: `This ${word} is already an invoice.` };
  if (d.status === "VOID" || d.status === "DECLINED") return { ok: false, error: `A void or declined ${word} can't be made into an invoice.` };
  const [terms, from] = await Promise.all([getPaymentTerms(org.organizationId), resolveFrom(org.organizationId)]);
  const today = todayIn(terms.timeZone);
  const invTerms = nz(d.terms) ?? from.defaultTerms;
  const res = await saveDocument(org, {
    kind: "INVOICE",
    buyerId: d.buyerId,
    buyerCompany: d.buyerCompany ?? "",
    buyerContact: d.buyerContact,
    buyerBillingAddress: d.buyerBillingAddress,
    buyerShippingAddress: d.buyerShippingAddress,
    buyerEmail: d.buyerEmail,
    buyerPhone: d.buyerPhone,
    docDate: today,
    dueDate: null,
    terms: invTerms,
    reference: d.kind === "PURCHASE_ORDER" ? `From purchase order ${d.reference ? d.reference : d.number}` : d.number ? `From quotation ${d.number}` : d.reference,
    discount: d.discount,
    shipping: d.shipping,
    tax: d.tax,
    otherCharges: d.otherCharges,
    customerNotes: d.customerNotes,
    internalNotes: d.internalNotes,
    lines: asInputLines(have.lines),
  });
  if (!res.ok) return res;
  await db.update(salesDocuments).set({ convertedFromId: quotationId }).where(eq(salesDocuments.id, res.id));
  await db.update(salesDocuments).set({ status: "CONVERTED", convertedToId: res.id, updatedAt: new Date().toISOString() }).where(eq(salesDocuments.id, quotationId));
  return res;
}

export async function deleteDraft(org: Org, id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const have = await getDocument(org.organizationId, id);
  if (!have) return { ok: false, error: "That document wasn't found." };
  if (have.doc.status !== "DRAFT") return { ok: false, error: "Only a draft can be deleted. Void a sent one instead." };
  await db.delete(salesDocuments).where(eq(salesDocuments.id, id));
  return { ok: true };
}

export async function setQuotationStatus(org: Org, id: string, status: "ACCEPTED" | "DECLINED"): Promise<{ ok: true } | { ok: false; error: string }> {
  const have = await getDocument(org.organizationId, id);
  if (!have || !isOrderDoc(have.doc.kind)) return { ok: false, error: "That quotation or purchase order wasn't found." };
  if (have.doc.status !== "SENT" && have.doc.status !== "ACCEPTED" && have.doc.status !== "DECLINED") return { ok: false, error: `Send the ${have.doc.kind === "PURCHASE_ORDER" ? "purchase order" : "quotation"} first.` };
  await db.update(salesDocuments).set({ status, updatedAt: new Date().toISOString() }).where(eq(salesDocuments.id, id));
  return { ok: true };
}

// ---- the PDF -----------------------------------------------------------------------------------------------------

export async function pdfInputFor(organizationId: string, d: DocWithLines): Promise<SalesPdfInput> {
  const from = await resolveFrom(organizationId);
  // The company's Sales template for this kind of document (invoices have none): name, logo, title, wording, footer and the standing notice.
  const tpl = isOrderDoc(d.doc.kind) ? await templateWithNotice(organizationId, "sales", d.doc.kind as DocType) : null;
  const t = tpl?.template ?? null;
  return {
    kind: d.doc.kind,
    title: t?.titleText ?? null,
    intro: t?.introText ?? null,
    notice: tpl?.notice ?? null,
    revision: d.doc.revision ?? 0,
    revisionNote: d.doc.revisionNote,
    number: d.doc.number,
    status: d.doc.status,
    docDate: d.doc.docDate,
    dueDate: d.doc.dueDate,
    terms: d.doc.terms,
    reference: d.doc.reference,
    // The company as it was when the document was made, with today's logo.
    from: {
      name: t?.displayName ?? d.doc.fromName ?? from.name,
      address: d.doc.fromAddress ?? from.address,
      phone: d.doc.fromPhone ?? from.phone,
      email: d.doc.fromEmail ?? from.email,
      logoDataUrl: t ? (t.showLogo ? (t.logoDataUrl ?? from.logoDataUrl) : null) : from.logoDataUrl,
    },
    buyer: { company: d.doc.buyerCompany ?? "", contact: d.doc.buyerContact, billing: d.doc.buyerBillingAddress, shipping: d.doc.buyerShippingAddress, email: d.doc.buyerEmail, phone: d.doc.buyerPhone },
    lines: d.lines.map((l) => ({ productName: l.productName, expiryText: l.expiryText ?? (l.groupLabel ?? null), condition: l.condition, quantity: l.quantity, unitPrice: l.unitPrice, amount: lineAmount(l.quantity, l.unitPrice), ndc: l.ndc })),
    subtotal: d.doc.subtotal,
    discount: d.doc.discount,
    shipping: d.doc.shipping,
    tax: d.doc.tax,
    otherCharges: d.doc.otherCharges,
    total: d.doc.total,
    amountPaid: d.doc.amountPaid,
    notes: d.doc.customerNotes,
    footer: t?.footerText ?? from.footer,
  };
}

export async function renderPdf(organizationId: string, id: string): Promise<{ bytes: Uint8Array; fileName: string } | null> {
  const d = await getDocument(organizationId, id);
  if (!d) return null;
  const bytes = await buildSalesPdf(await pdfInputFor(organizationId, d));
  return { bytes, fileName: pdfFileName(d.doc.kind, d.doc.number, d.doc.buyerCompany ?? "", d.doc.revision) };
}

// ---- the email ---------------------------------------------------------------------------------------------------

const escHtml = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/\n/g, "<br>");

/**
 * The email that goes with a quotation, purchase order or invoice: the PDF attached, the words the sender typed (or a plain
 * hello), and -- above them -- what changed in this revision and the company's standing notice when they apply.
 */
export async function composeMail(organizationId: string, d: DocWithLines, message?: string | null) {
  const doc = d.doc;
  const from = await resolveFrom(organizationId);
  const input = await pdfInputFor(organizationId, d);
  const pdf = await buildSalesPdf(input);
  const kindWord = doc.kind === "INVOICE" ? "Invoice" : doc.kind === "PURCHASE_ORDER" ? "Purchase order" : "Quotation";
  const rev = doc.revision && doc.revision > 0 ? Math.floor(doc.revision) : 0;
  const name = input.from.name;
  const subject = rev ? `REVISED ${kindWord} ${doc.number} Rev ${rev} from ${name}` : `${kindWord} ${doc.number} from ${name}`;
  const hello = `Hello${doc.buyerContact ? ` ${doc.buyerContact}` : ""},`;
  const main =
    nz(message) ??
    (rev ? `${hello}\n\nWe have revised ${kindWord.toLowerCase()} ${doc.number}. The new version is attached.\n\nThank you,\n${name}` : `${hello}\n\n${kindWord} ${doc.number} is attached.\n\nThank you,\n${name}`);
  const parts: { label: string; text: string }[] = [];
  if (rev && doc.revisionNote?.trim()) parts.push({ label: `Revision ${rev} - what changed`, text: doc.revisionNote.trim() });
  if (input.notice?.trim()) parts.push({ label: "Please note", text: input.notice.trim() });
  const text = [...parts.map((p) => `${p.label.toUpperCase()}: ${p.text}`), main].join("\n\n");
  const box = (p: { label: string; text: string }) =>
    `<div style="margin:0 0 14px;padding:10px 12px;background:${p.label.startsWith("Revision") ? "#fdeeee" : "#fff8dc"};border:1px solid ${p.label.startsWith("Revision") ? "#b91c1c" : "#d9a521"};"><div style="font-size:11px;font-weight:bold;letter-spacing:.5px;text-transform:uppercase;">${escHtml(p.label)}</div><div style="margin-top:4px;">${escHtml(p.text)}</div></div>`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1a1d21">${parts.map(box).join("")}${escHtml(main)}</div>`;
  return { subject, text, html, fromName: name, replyTo: from.email, fileName: pdfFileName(doc.kind, doc.number, doc.buyerCompany ?? "", rev), pdf };
}

// ---- sending (and taking stock out) ------------------------------------------------------------------------------

export type SendOutcome = { ok: true; emailedTo: string | null; units: number } | { ok: false; error: string };

/** Emails the PDF. Injected so tests and the server action can use the real mailer or a stand-in. */
export type Mailer = (args: { to: string; subject: string; text: string; html: string; fromName: string; replyTo: string | null; fileName: string; pdf: Uint8Array }) => Promise<{ ok: true } | { ok: false; error: string }>;

/**
 * Sends a quotation or an invoice. An invoice's units come out of Inventory first (all or nothing); if the email then
 * fails, they are put back untouched and the invoice stays a draft, so the stock never shows a sale that wasn't sent.
 * `mailer` null means "mark as sent without emailing" (the PDF was handed over another way).
 */
export async function sendDocument(org: Org, id: string, opts: { mailer: Mailer | null; to?: string | null; message?: string | null }): Promise<SendOutcome> {
  const have = await getDocument(org.organizationId, id);
  if (!have) return { ok: false, error: "That document wasn't found." };
  const { doc, lines } = have;
  const isInvoice = doc.kind === "INVOICE";
  const kindWord = isInvoice ? "Invoice" : doc.kind === "PURCHASE_ORDER" ? "Purchase order" : "Quotation";
  if (isInvoice ? doc.status !== "DRAFT" : doc.status !== "DRAFT" && doc.status !== "SENT") return { ok: false, error: isInvoice ? "This invoice has already been sent." : `This ${kindWord.toLowerCase()} can't be sent again.` };
  const to = nz(opts.to) ?? nz(doc.buyerEmail);
  if (opts.mailer && !to) return { ok: false, error: "Add the buyer's email address to send it." };

  const inputs = lines.map((l) => ({ productKey: l.productKey, condition: l.condition, groupKey: l.groupKey, quantity: l.quantity, refType: "sales_invoice", refId: doc.id, note: `Invoice ${doc.number} to ${doc.buyerCompany ?? ""}`.trim() }));
  let movementIds: string[] = [];
  const expiryTexts: (string | null)[] = [];
  if (isInvoice) {
    // Units that other drafts are holding are not available to this invoice; this invoice's own hold is released (excluded).
    const ctx = await salesStockContext(org.organizationId, doc.id);
    const short = shortfalls(ctx.stock, ctx.reserved, lines);
    if (short.length) {
      const s = short[0];
      return { ok: false, error: `${s.productName}: only ${s.available} available, ${s.wanted} on this invoice.` };
    }
    const taken = await deductStockMany(org, inputs);
    if (!taken.ok) {
      const l = lines[taken.index];
      return { ok: false, error: `${l?.productName ?? "An item"}: ${taken.error}` };
    }
    movementIds = taken.results.flatMap((r) => r.movementIds);
    for (const r of taken.results) {
      const dates = r.takes.map((t) => t.expiry).filter((x): x is string => !!x).sort();
      expiryTexts.push(dates.length ? expirySpan(dates[0], dates[dates.length - 1]) : null);
    }
  } else if (doc.kind === "PURCHASE_ORDER") {
    // A purchase order we received names what the buyer wants; there is no stock expiry to print on it.
    for (let i = 0; i < lines.length; i++) expiryTexts.push(null);
  } else {
    const preview = await deductStockMany(org, inputs, { dryRun: true });
    for (const [i] of lines.entries()) {
      const r = preview.ok ? preview.results[i] : null;
      const dates = (r?.takes ?? []).map((t) => t.expiry).filter((x): x is string => !!x).sort();
      expiryTexts.push(dates.length ? expirySpan(dates[0], dates[dates.length - 1]) : null);
    }
  }

  const now = new Date().toISOString();
  // Write the expiration text first, so the PDF that goes out shows it.
  for (const [i, l] of lines.entries()) await db.update(salesDocumentLines).set({ expiryText: expiryTexts[i] ?? l.expiryText }).where(eq(salesDocumentLines.id, l.id));

  if (opts.mailer && to) {
    try {
      const fresh = (await getDocument(org.organizationId, id))!;
      const mail = await composeMail(org.organizationId, fresh, opts.message);
      const sent = await opts.mailer({ to, ...mail });
      if (!sent.ok) {
        if (movementIds.length) await discardMovements(org.organizationId, movementIds);
        return { ok: false, error: `The email wasn't sent, so nothing was changed. ${sent.error}` };
      }
    } catch (e) {
      if (movementIds.length) await discardMovements(org.organizationId, movementIds);
      return { ok: false, error: `The email wasn't sent, so nothing was changed. ${e instanceof Error ? e.message : ""}`.trim() };
    }
  }

  await db
    .update(salesDocuments)
    .set({ status: "SENT", sentAt: now, emailedTo: opts.mailer ? to : doc.emailedTo, inventoryPosted: isInvoice, updatedAt: now })
    .where(eq(salesDocuments.id, id));
  return { ok: true, emailedTo: opts.mailer ? to : null, units: isInvoice ? lines.reduce((n, l) => n + l.quantity, 0) : 0 };
}

// ---- revisions ---------------------------------------------------------------------------------------------------

export type ReviseOutcome = { ok: true; revision: number; emailedTo: string | null } | { ok: false; error: string };

/**
 * Sends a revision of a SENT (or accepted) quotation or purchase order: a required note saying what changed or what is wrong,
 * optionally with the items changed too. The other company gets the new PDF marked "Revision n" with the note in a box, and
 * an email in the same words. The email goes first: if it is refused nothing is changed. The version before the change is kept.
 */
export async function reviseDocument(
  org: Org,
  id: string,
  opts: { note: unknown; edits?: Omit<DocInput, "kind" | "id"> | null; mailer: Mailer | null; to?: string | null; message?: string | null },
): Promise<ReviseOutcome> {
  const noted = cleanRevisionNote(opts.note);
  if (!noted.ok) return noted;
  const have = await getDocument(org.organizationId, id);
  if (!have || !isOrderDoc(have.doc.kind)) return { ok: false, error: "That quotation or purchase order wasn't found." };
  const word = have.doc.kind === "PURCHASE_ORDER" ? "purchase order" : "quotation";
  if (have.doc.status === "DRAFT") return { ok: false, error: `This ${word} hasn't been sent yet. Just edit it and send it.` };
  if (have.doc.status !== "SENT" && have.doc.status !== "ACCEPTED") return { ok: false, error: `Only a sent ${word} can be revised.` };

  const now = new Date().toISOString();
  const revision = nextRevision(have.doc.revision);
  let nextDoc: SalesDocument = { ...have.doc, revision, revisionNote: noted.note, revisedAt: now, status: "SENT", updatedAt: now };
  let nextLines: SalesLine[] = have.lines;
  let rows: ReturnType<Prepared["lineRows"]> | null = null;
  if (opts.edits) {
    const prep = await prepareDocument(org, { ...opts.edits, kind: have.doc.kind, id });
    if (!prep.ok) return prep;
    nextDoc = { ...nextDoc, ...prep.header };
    rows = prep.lineRows(id);
    nextLines = rows.map((r) => ({ ...r, productId: r.productId ?? null, groupKey: r.groupKey ?? null, groupLabel: r.groupLabel ?? null, condition: r.condition ?? "Mint", expiryText: null, note: r.note ?? null, ndc: r.ndc ?? null, unitPrice: r.unitPrice ?? 0, createdAt: now, updatedAt: now })) as SalesLine[];
  }

  const to = nz(opts.to) ?? nz(nextDoc.buyerEmail);
  if (opts.mailer) {
    if (!to) return { ok: false, error: "Add the buyer's email address to send the revision." };
    if (!looksLikeEmail(to)) return { ok: false, error: "That email address doesn't look right." };
    try {
      const mail = await composeMail(org.organizationId, { doc: nextDoc, lines: nextLines, payments: [] }, opts.message);
      const sent = await opts.mailer({ to, ...mail });
      if (!sent.ok) return { ok: false, error: `The email wasn't sent, so nothing was changed. ${sent.error}` };
    } catch (e) {
      return { ok: false, error: `The email wasn't sent, so nothing was changed. ${e instanceof Error ? e.message : ""}`.trim() };
    }
  }

  await addRevisionRecord({ organizationId: org.organizationId, userId: org.userId, source: "sales_doc", documentId: id, revision, note: noted.note, before: { doc: have.doc, lines: have.lines }, emailedTo: opts.mailer ? to : null });
  const { id: _id, organizationId: _o, kind: _k, seq: _s, number: _n, createdAt: _c, ...changes } = nextDoc;
  void [_id, _o, _k, _s, _n, _c];
  await db.update(salesDocuments).set({ ...changes, sentAt: now, emailedTo: opts.mailer ? to : have.doc.emailedTo }).where(and(eq(salesDocuments.id, id), eq(salesDocuments.organizationId, org.organizationId)));
  if (rows) {
    await db.delete(salesDocumentLines).where(eq(salesDocumentLines.documentId, id));
    await db.insert(salesDocumentLines).values(rows);
  }
  return { ok: true, revision, emailedTo: opts.mailer ? to : null };
}

/** Voids a quotation or an unpaid invoice. A sent invoice's units go back into Inventory. */
export async function voidDocument(org: Org, id: string): Promise<{ ok: true; returned: number } | { ok: false; error: string }> {
  const have = await getDocument(org.organizationId, id);
  if (!have) return { ok: false, error: "That document wasn't found." };
  const d = have.doc;
  if (d.status === "VOID") return { ok: false, error: "It is already void." };
  if (isOrderDoc(d.kind) && d.status === "CONVERTED") return { ok: false, error: `This ${d.kind === "PURCHASE_ORDER" ? "purchase order" : "quotation"} became an invoice. Void the invoice instead.` };
  if (d.kind === "INVOICE" && d.amountPaid > 0) return { ok: false, error: "This invoice has payments recorded. Remove them first, then void it." };
  let returned = 0;
  if (d.kind === "INVOICE" && d.inventoryPosted) returned = await returnSale(org, "sales_invoice", d.id, `Invoice ${d.number} voided`);
  await db.update(salesDocuments).set({ status: "VOID", inventoryPosted: false, updatedAt: new Date().toISOString() }).where(eq(salesDocuments.id, id));
  return { ok: true, returned };
}

// ---- payments ----------------------------------------------------------------------------------------------------

export async function recordPayment(org: Org, id: string, p: { amount: number; paidOn: string; method?: string | null; note?: string | null }): Promise<{ ok: true; status: string } | { ok: false; error: string }> {
  const have = await getDocument(org.organizationId, id);
  if (!have || have.doc.kind !== "INVOICE") return { ok: false, error: "That invoice wasn't found." };
  const d = have.doc;
  if (d.status !== "SENT" && d.status !== "PARTIALLY_PAID") return { ok: false, error: d.status === "DRAFT" ? "Send the invoice before recording a payment." : "This invoice can't take a payment." };
  const amount = round2(p.amount);
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Enter the amount that was paid." };
  const owed = round2(d.total - d.amountPaid);
  if (amount > owed + 0.004) return { ok: false, error: `That is more than the $${owed.toFixed(2)} still owed.` };
  if (!isDayText(p.paidOn)) return { ok: false, error: "Enter the day it was paid." };
  const next = afterPayment(d, amount);
  await db.insert(salesPayments).values({ id: newId("spay"), organizationId: org.organizationId, documentId: id, amount, paidOn: p.paidOn, method: nz(cleanText(p.method, 40)), note: nz(cleanText(p.note, 200)), createdByUserId: org.userId });
  await db
    .update(salesDocuments)
    .set({ amountPaid: next.amountPaid, status: next.status, paidAt: next.status === "PAID" ? p.paidOn : null, updatedAt: new Date().toISOString() })
    .where(eq(salesDocuments.id, id));
  return { ok: true, status: next.status };
}

export async function removePayment(org: Org, paymentId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const [pay] = await db.select().from(salesPayments).where(and(eq(salesPayments.organizationId, org.organizationId), eq(salesPayments.id, paymentId))).limit(1);
  if (!pay) return { ok: false, error: "That payment wasn't found." };
  const have = await getDocument(org.organizationId, pay.documentId);
  if (!have) return { ok: false, error: "That invoice wasn't found." };
  if (have.doc.status === "VOID") return { ok: false, error: "This invoice is void." };
  await db.delete(salesPayments).where(eq(salesPayments.id, paymentId));
  const paid = round2(have.payments.filter((p) => p.id !== paymentId).reduce((n, p) => n + p.amount, 0));
  const status = paid <= 0 ? "SENT" : paid >= have.doc.total ? "PAID" : "PARTIALLY_PAID";
  await db.update(salesDocuments).set({ amountPaid: paid, status, paidAt: status === "PAID" ? have.doc.paidAt : null, updatedAt: new Date().toISOString() }).where(eq(salesDocuments.id, have.doc.id));
  return { ok: true };
}

// ---- who has which draft hold (for the sidebar tiles and checks) ------------------------------------------------

export async function documentCounts(organizationId: string) {
  const rows = await db
    .select({ kind: salesDocuments.kind, status: salesDocuments.status, n: sql<number>`count(*)` })
    .from(salesDocuments)
    .where(eq(salesDocuments.organizationId, organizationId))
    .groupBy(salesDocuments.kind, salesDocuments.status);
  return rows;
}

