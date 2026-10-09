// A sample PDF built with the company's saved template, so it can see the logo, wording and standing notice before any real
// document goes out. Sample names and numbers only -- nothing here is read from, or written to, a real order.

import type { DocType } from "@/lib/operation-type";
import type { TemplateDepartment } from "@/lib/document-template-rules";
import { buildPurchaseOrderPdf } from "@/lib/purchase-order-pdf";
import { pdfInputFor as poPdfInputFor, type PoWithLines, type PurchaseOrder, type PurchaseOrderLine } from "@/lib/purchase-order-service";
import { buildSalesPdf } from "@/lib/sales-pdf";
import { pdfInputFor as salesPdfInputFor, type DocWithLines, type SalesDocument, type SalesLine } from "@/lib/sales-service";
import { buildReceiptPdf } from "@/lib/purchasing-receipt-pdf";
import { getBusinessProfile, getQuotationProfile, getPurchasingReceiptSettings, resolveBusinessDocumentIdentity, resolvePurchasingReceiptSettings, renderReceiptCopy } from "@/lib/queries";
import { templateWithNotice } from "@/lib/document-template-service";
import { db } from "@/db/client";
import { organizations } from "@/db/schema";
import { eq } from "drizzle-orm";

const NOW = "2026-01-01T00:00:00.000Z";

export async function previewPdf(organizationId: string, department: TemplateDepartment, docType: DocType): Promise<{ bytes: Uint8Array; fileName: string }> {
  const today = new Date().toISOString().slice(0, 10);

  if (department === "purchasing" && docType === "PURCHASE_ORDER") {
    const po = {
      id: "sample", organizationId, seq: 1001, poNumber: "PO-1001", status: "SENT", supplierId: null, supplierName: "Sample Wholesale Supply", supplierAddress: "100 Example Street\nSampletown, ST 00000", supplierEmail: "orders@example.com",
      supplierLicense: "WL-000000", supplierLicenseExpires: null, issueDate: today, shipToName: null, shipToAddress: null, billToName: null, billToAddress: null,
      reference: "SAMPLE - not a real order", comments: "This is a preview of your template.", terms: null, fromName: null, fromAddress: null, fromPhone: null, fromEmail: null,
      subtotal: 150, shipping: 0, total: 150, sentAt: null, emailedTo: null, revision: 0, revisionNote: null, revisedAt: null, createdByUserId: null, createdAt: NOW, updatedAt: NOW,
    } as PurchaseOrder;
    const lines = [
      { id: "l1", organizationId, purchaseOrderId: "sample", position: 0, productId: null, partNumber: "SAMPLE-1", ndc: "00000-0000-00", name: "Sample test strips", size: "50 ct", quantity: 10, unit: "BX", unitCost: 15, total: 150 },
    ] as PurchaseOrderLine[];
    const d: PoWithLines = { po, lines };
    const input = await poPdfInputFor(organizationId, d);
    if (!input.shipTo.name) input.shipTo = { name: input.from.name, address: input.from.address };
    if (!input.billTo.name) input.billTo = { name: input.from.name, address: input.from.address };
    if (!input.terms) input.terms = "Your terms appear here. You can write them in the template.";
    return { bytes: await buildPurchaseOrderPdf(input), fileName: "Purchase-order-template-preview.pdf" };
  }

  if (department === "sales") {
    const kind = docType === "PURCHASE_ORDER" ? "PURCHASE_ORDER" : "QUOTATION";
    const doc = {
      id: "sample", organizationId, kind, seq: 1001, number: kind === "PURCHASE_ORDER" ? "RPO-1001" : "Q-1001", status: "SENT", buyerId: null, buyerCompany: "Sample Pharmacy", buyerContact: "Sample Buyer",
      buyerBillingAddress: "200 Example Avenue\nSampletown, ST 00000", buyerShippingAddress: null, buyerEmail: "buyer@example.com", buyerPhone: null,
      fromName: null, fromAddress: null, fromEmail: null, fromPhone: null, docDate: today, dueDate: today, terms: null, reference: kind === "PURCHASE_ORDER" ? "PO-4471" : "SAMPLE",
      discount: 0, shipping: 0, tax: 0, otherCharges: 0, subtotal: 150, total: 150, amountPaid: 0, paidAt: null, sentAt: null, emailedTo: null,
      customerNotes: "This is a preview of your template.", internalNotes: null, convertedFromId: null, convertedToId: null, revision: 0, revisionNote: null, revisedAt: null,
      inventoryPosted: false, createdByUserId: null, createdAt: NOW, updatedAt: NOW,
    } as unknown as SalesDocument;
    const lines = [
      { id: "l1", organizationId, documentId: "sample", position: 0, productId: null, productKey: "sample", productName: "Sample test strips 50 ct", condition: "Mint", groupKey: null, groupLabel: null, quantity: 10, unitPrice: 15, expiryText: "Jan 2028", note: null, ndc: "00000-0000-00", createdAt: NOW, updatedAt: NOW },
    ] as unknown as SalesLine[];
    const d: DocWithLines = { doc, lines, payments: [] };
    const input = await salesPdfInputFor(organizationId, d);
    return { bytes: await buildSalesPdf(input), fileName: `${kind === "PURCHASE_ORDER" ? "Purchase-order" : "Quotation"}-template-preview.pdf` };
  }

  // Purchasing quotation: the receipt the person selling to us receives. Only the standing notice is set in Document Templates.
  const [profile, quotationProfile, settingsRow, [org], { notice }] = await Promise.all([
    getBusinessProfile(organizationId),
    getQuotationProfile(organizationId),
    getPurchasingReceiptSettings(organizationId),
    db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, organizationId)).limit(1),
    templateWithNotice(organizationId, "purchasing", "QUOTATION"),
  ]);
  const business = resolveBusinessDocumentIdentity(org?.name ?? "Our company", profile, quotationProfile);
  const copy = renderReceiptCopy(resolvePurchasingReceiptSettings(settingsRow), business.displayName);
  const bytes = await buildReceiptPdf({
    businessName: business.displayName,
    logoDataUrl: business.showLogo ? business.logoDataUrl : null,
    quotationDate: today,
    customerName: "Sample Customer",
    items: [{ productName: "Sample test strips 50 ct", productCode: "00000-0000-00", condition: "Mint", expiryLabel: "6+ months", expiryOnwards: null, quantity: 10, unitPrice: 15, lineTotal: 150 }],
    itemsTotal: 150,
    bonusAmount: 0,
    bonusTierLabel: null,
    deductionAmount: 0,
    grandTotal: 150,
    notice,
    copy: {
      bannerText: copy.bannerText,
      shippingSuffix: copy.shippingSuffix,
      disclaimerIntro: copy.disclaimerIntro,
      disclaimerReturnPolicy: copy.disclaimerReturnPolicy,
      disclaimerDamageSummary: copy.disclaimerDamageSummary,
      conditionHeading: copy.conditionHeading,
      conditionBullets: copy.conditionBullets,
      paymentTimingText: copy.paymentTimingText,
      paymentTimingSubtext: copy.paymentTimingSubtext,
      footerThankYou: copy.footerThankYou,
    },
  });
  return { bytes, fileName: "Quotation-receipt-template-preview.pdf" };
}
