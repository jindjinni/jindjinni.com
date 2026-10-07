"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { salesPriceSheets, salesProfiles } from "@/db/schema";
import { requireOrg, type CurrentOrg } from "@/lib/tenant";
import { logActivity } from "@/lib/hr-service";
import { canManageSalesSettings, canWriteSales } from "@/lib/permissions";
import { encodeLogoFile } from "@/lib/logo-validation";
import { sendOrgEmail } from "@/lib/email-connector";
import { findColumn, parseSpreadsheetFile } from "@/lib/spreadsheet-import";
import { buyersFromSheet } from "@/lib/sales-import";
import { cleanText, guessColumns, looksLikeEmail, readSheetRows, TERMS_OPTIONS } from "@/lib/sales-rules";
import {
  convertToInvoice,
  createBuyer,
  deleteDraft,
  deletePriceItem,
  duplicateDocument,
  ensureSalesProfile,
  getDocument,
  importBuyers,
  matchPriceItem,
  recordPayment,
  removePayment,
  saveDocument,
  savePriceSheet,
  sendDocument,
  setQuotationStatus,
  updateBuyer,
  updatePriceItem,
  voidDocument,
  type BuyerInput,
  type DocInput,
  type Mailer,
} from "@/lib/sales-service";

export type SalesResult = { ok: true; id?: string; message?: string } | { ok: false; error: string };
export type SalesFormState = { error?: string; message?: string } | undefined;

const NOT_ALLOWED = "Your role can look at Sales but can't change it.";

async function writer(): Promise<{ org: CurrentOrg } | { error: string }> {
  const org = await requireOrg();
  if (!canWriteSales(org.role)) return { error: NOT_ALLOWED };
  return { org };
}

async function manager(): Promise<{ org: CurrentOrg } | { error: string }> {
  const org = await requireOrg();
  if (!canManageSalesSettings(org.role)) return { error: "Only a Purchasing Manager, Admin or the Owner can change the company profile." };
  return { org };
}

const refresh = () => revalidatePath("/dashboard/sales", "layout");
const MAX_FILE = 5 * 1024 * 1024;

// ---- company profile (Settings) ----------------------------------------------------------------------------------

export async function saveSalesProfile(_prev: SalesFormState, formData: FormData): Promise<SalesFormState> {
  const m = await manager();
  if ("error" in m) return m;
  const email = cleanText(formData.get("email"), 160);
  if (email && !looksLikeEmail(email)) return { error: "That email address doesn't look right." };
  const terms = cleanText(formData.get("defaultTerms"), 40);
  if (terms && !(TERMS_OPTIONS as readonly string[]).includes(terms)) return { error: "Choose one of the payment terms in the list." };
  const nextInvoice = Number(formData.get("nextInvoiceNumber"));
  const nextQuote = Number(formData.get("nextQuotationNumber"));
  if (!Number.isInteger(nextInvoice) || nextInvoice < 1 || nextInvoice > 99_999_999) return { error: "The next invoice number must be a whole number of 1 or more." };
  if (!Number.isInteger(nextQuote) || nextQuote < 1 || nextQuote > 99_999_999) return { error: "The next quotation number must be a whole number of 1 or more." };
  await ensureSalesProfile(m.org.organizationId);
  await db
    .update(salesProfiles)
    .set({
      companyName: cleanText(formData.get("companyName"), 120) || null,
      address: cleanText(formData.get("address"), 400) || null,
      email: email || null,
      phone: cleanText(formData.get("phone"), 40) || null,
      showLogo: formData.get("showLogo") === "on",
      defaultTerms: terms || "Due on Receipt",
      defaultNotes: cleanText(formData.get("defaultNotes"), 1000) || null,
      footerText: cleanText(formData.get("footerText"), 110) || null,
      nextInvoiceNumber: nextInvoice,
      nextQuotationNumber: nextQuote,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(salesProfiles.organizationId, m.org.organizationId));
  refresh();
  return { message: "Company profile saved." };
}

export async function uploadSalesLogo(_prev: SalesFormState, formData: FormData): Promise<SalesFormState> {
  const m = await manager();
  if ("error" in m) return m;
  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a PNG or JPG image to upload." };
  const encoded = await encodeLogoFile(file);
  if ("error" in encoded) return { error: encoded.error };
  await ensureSalesProfile(m.org.organizationId);
  await db.update(salesProfiles).set({ logoData: encoded.data, logoContentType: encoded.contentType, updatedAt: new Date().toISOString() }).where(eq(salesProfiles.organizationId, m.org.organizationId));
  refresh();
  return { message: "Logo saved." };
}

export async function removeSalesLogo(): Promise<SalesFormState> {
  const m = await manager();
  if ("error" in m) return m;
  await ensureSalesProfile(m.org.organizationId);
  await db.update(salesProfiles).set({ logoData: null, logoContentType: null, updatedAt: new Date().toISOString() }).where(eq(salesProfiles.organizationId, m.org.organizationId));
  refresh();
  return { message: "Logo removed." };
}

// ---- buyers ------------------------------------------------------------------------------------------------------

export async function saveBuyerAction(id: string | null, input: BuyerInput): Promise<SalesResult> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error };
  if (input.email && !looksLikeEmail(String(input.email))) return { ok: false, error: "That email address doesn't look right." };
  if (id) {
    const upd = await updateBuyer(w.org, id, input);
    if (!upd.ok) return upd;
    refresh();
    return { ok: true, id, message: "Buyer saved." };
  }
  const made = await createBuyer(w.org, input);
  if (!made.ok) return made;
  refresh();
  return { ok: true, id: made.id, message: "Buyer saved." };
}

export async function importBuyersAction(_prev: SalesFormState, formData: FormData): Promise<SalesFormState> {
  const w = await writer();
  if ("error" in w) return w;
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV or Excel file." };
  if (file.size > MAX_FILE) return { error: "That file is over 5MB." };
  let sheet;
  try {
    sheet = parseSpreadsheetFile(Buffer.from(await file.arrayBuffer()), file.name);
  } catch {
    return { error: "I couldn't read that file. Save it as .csv or .xlsx and try again." };
  }
  const read = buyersFromSheet(sheet);
  if (read.error) return { error: read.error };
  if (!read.buyers.length) return { error: "No buyers were found in that file." };
  if (read.buyers.length > 1000) return { error: "That file has more than 1,000 buyers. Split it into parts." };
  const res = await importBuyers(w.org, read.buyers);
  refresh();
  const parts = [`Added ${res.added} ${res.added === 1 ? "buyer" : "buyers"}`];
  if (res.skipped) parts.push(`${res.skipped} already in your list (left as they were)`);
  const noName = res.invalid + read.blank;
  if (noName) parts.push(`${noName} without a company name skipped`);
  return { message: parts.join(". ") + "." };
}

// ---- price sheets ------------------------------------------------------------------------------------------------

export type SheetPreview = { ok: true; headers: string[]; sample: Record<string, string>[]; rowCount: number; guess: { product: string | null; price: string | null; condition: string | null } } | { ok: false; error: string };

async function readSheetFile(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose the buyer's price sheet (Excel or CSV)." } as const;
  if (file.size > MAX_FILE) return { error: "That file is over 5MB." } as const;
  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    const sheet = parseSpreadsheetFile(buffer, file.name);
    if (!sheet.headers.length || !sheet.rows.length) return { error: "That file looks empty." } as const;
    return { file, buffer, sheet } as const;
  } catch {
    return { error: "I couldn't read that file. Save it as .csv or .xlsx and try again." } as const;
  }
}

/** Step 1 of loading a price sheet: read the file and suggest which columns are the product, the price and the condition. */
export async function previewPriceSheetAction(formData: FormData): Promise<SheetPreview> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error };
  const r = await readSheetFile(formData);
  if ("error" in r) return { ok: false, error: r.error ?? "" };
  return { ok: true, headers: r.sheet.headers.filter(Boolean), sample: r.sheet.rows.slice(0, 5), rowCount: r.sheet.rows.length, guess: guessColumns(r.sheet.headers) };
}

/** Step 2: save the file as it came and the prices read from the chosen columns. */
export async function importPriceSheetAction(formData: FormData): Promise<SalesResult> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error };
  const buyerId = String(formData.get("buyerId") ?? "");
  const productCol = String(formData.get("productCol") ?? "");
  const priceCol = String(formData.get("priceCol") ?? "");
  const conditionCol = String(formData.get("conditionCol") ?? "");
  const r = await readSheetFile(formData);
  if ("error" in r) return { ok: false, error: r.error ?? "" };
  if (!findColumn(r.sheet.headers, [productCol]) || !findColumn(r.sheet.headers, [priceCol])) return { ok: false, error: "Choose which column has the product names and which has the prices." };
  const read = readSheetRows(r.sheet.rows, { product: productCol, price: priceCol, condition: conditionCol && findColumn(r.sheet.headers, [conditionCol]) ? conditionCol : null });
  const res = await savePriceSheet(w.org, buyerId, { name: r.file.name, contentType: r.file.type || "application/octet-stream", base64: r.buffer.toString("base64") }, read.items);
  if (!res.ok) return res;
  refresh();
  const skipped = read.skipped ? ` ${read.skipped} rows without a price were skipped.` : "";
  return { ok: true, message: `Loaded ${res.matched + res.unmatched} prices: ${res.matched} matched to your products, ${res.unmatched} need a match.${skipped}` };
}

export async function matchPriceItemAction(itemId: string, productId: string | null): Promise<SalesResult> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error };
  const res = await matchPriceItem(w.org, itemId, productId || null);
  if (!res.ok) return res;
  refresh();
  return { ok: true };
}

export async function updatePriceItemAction(itemId: string, price: number): Promise<SalesResult> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error };
  const res = await updatePriceItem(w.org, itemId, Number(price));
  if (!res.ok) return res;
  refresh();
  return { ok: true };
}

export async function deletePriceItemAction(itemId: string): Promise<SalesResult> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error };
  await deletePriceItem(w.org, itemId);
  refresh();
  return { ok: true };
}

export async function removePriceSheetAction(buyerId: string): Promise<SalesResult> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error };
  // Deleting the sheet row removes its prices with it (they belong to the sheet).
  await db.delete(salesPriceSheets).where(and(eq(salesPriceSheets.organizationId, w.org.organizationId), eq(salesPriceSheets.buyerId, buyerId)));
  refresh();
  return { ok: true, message: "Price sheet removed." };
}

// ---- quotations and invoices -------------------------------------------------------------------------------------

export async function saveDocumentAction(input: DocInput): Promise<SalesResult> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error };
  if (input.kind !== "QUOTATION" && input.kind !== "INVOICE") return { ok: false, error: "Something went wrong. Reload the page and try again." };
  const res = await saveDocument(w.org, { ...input, lines: Array.isArray(input.lines) ? input.lines.map((l) => ({ ...l, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) })) : [] });
  if (!res.ok) return res;
  refresh();
  return { ok: true, id: res.id, message: "Saved." };
}

const mailer: (org: CurrentOrg) => Mailer = (org) => async (a) => {
  const r = await sendOrgEmail(org.organizationId, { to: a.to, subject: a.subject, text: a.text, html: a.html, fromName: a.fromName, replyTo: a.replyTo, attachments: [{ filename: a.fileName, content: Buffer.from(a.pdf) }] });
  return r.ok ? { ok: true } : { ok: false, error: r.error };
};

/** Sends the PDF by email (or just marks it sent). An invoice also takes its units out of Inventory. */
export async function sendDocumentAction(id: string, opts: { email: boolean; to?: string; message?: string }): Promise<SalesResult> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error };
  const to = cleanText(opts?.to, 160);
  if (opts?.email && to && !looksLikeEmail(to)) return { ok: false, error: "That email address doesn't look right." };
  const before = await getDocument(w.org.organizationId, id);
  const res = await sendDocument(w.org, id, { mailer: opts?.email ? mailer(w.org) : null, to: to || null, message: opts?.message ? String(opts.message).slice(0, 2000) : null });
  if (!res.ok) return res;
  if (before) {
    const isInvoice = before.doc.kind === "INVOICE";
    await logActivity(w.org, isInvoice ? "INVOICE_SENT" : "QUOTE_SENT", `${isInvoice ? "Sent invoice" : "Sent quotation"} ${before.doc.number} to ${before.doc.buyerCompany ?? "a buyer"}`, { type: "sales_document", id });
  }
  revalidatePath("/dashboard/inventory", "layout");
  refresh();
  const what = res.units ? ` ${res.units} ${res.units === 1 ? "unit" : "units"} came out of Inventory.` : "";
  return { ok: true, message: (res.emailedTo ? `Sent to ${res.emailedTo}.` : "Marked as sent.") + what };
}

export async function voidDocumentAction(id: string): Promise<SalesResult> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error };
  const res = await voidDocument(w.org, id);
  if (!res.ok) return res;
  revalidatePath("/dashboard/inventory", "layout");
  refresh();
  return { ok: true, message: res.returned ? `Voided. ${res.returned} ${res.returned === 1 ? "unit was" : "units were"} put back into Inventory.` : "Voided." };
}

export async function duplicateDocumentAction(id: string): Promise<SalesResult> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error };
  const res = await duplicateDocument(w.org, id);
  if (!res.ok) return res;
  refresh();
  return { ok: true, id: res.id, message: "A new draft was made." };
}

export async function convertToInvoiceAction(id: string): Promise<SalesResult> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error };
  const res = await convertToInvoice(w.org, id);
  if (!res.ok) return res;
  refresh();
  return { ok: true, id: res.id, message: "Invoice draft made." };
}

export async function deleteDraftAction(id: string): Promise<SalesResult> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error };
  const res = await deleteDraft(w.org, id);
  if (!res.ok) return res;
  refresh();
  return { ok: true, message: "Draft deleted." };
}

export async function quotationStatusAction(id: string, status: "ACCEPTED" | "DECLINED"): Promise<SalesResult> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error };
  if (status !== "ACCEPTED" && status !== "DECLINED") return { ok: false, error: "Something went wrong." };
  const res = await setQuotationStatus(w.org, id, status);
  if (!res.ok) return res;
  refresh();
  return { ok: true };
}

export async function recordPaymentAction(id: string, p: { amount: number; paidOn: string; method?: string; note?: string }): Promise<SalesResult> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error };
  const res = await recordPayment(w.org, id, { amount: Number(p.amount), paidOn: String(p.paidOn ?? ""), method: p.method, note: p.note });
  if (!res.ok) return res;
  const doc = await getDocument(w.org.organizationId, id);
  await logActivity(w.org, "PAYMENT_RECORDED", `Recorded a $${Number(p.amount).toFixed(2)} payment on invoice ${doc?.doc.number ?? ""}`.trim(), { type: "sales_document", id });
  refresh();
  return { ok: true, message: res.status === "PAID" ? "Paid in full." : "Payment recorded." };
}

export async function removePaymentAction(paymentId: string): Promise<SalesResult> {
  const w = await writer();
  if ("error" in w) return { ok: false, error: w.error };
  const res = await removePayment(w.org, paymentId);
  if (!res.ok) return res;
  refresh();
  return { ok: true };
}
