// Buys and saves the free shipping labels for a quotation (the customer ships TO the company). One place, used by the Purchasing page's
// "Generate shipping label" button AND by the automatic website checkout, so both buy, save, track and guard labels the same way.
// Labels are always bought from THIS company's own Shippo account (resolveShippo); never another company's, never the platform's.
// No signed-in person is needed here: the caller has already decided who may ask (staff action, or the company's own storefront).

import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { purchasingQuotationLabels, purchasingQuotations } from "@/db/schema";
import { newId } from "@/lib/ids";
import { getOrganization, getPurchasingCustomer, getQuotationLabels, hasCustomerAddress, hasShipFromAddress } from "@/lib/queries";
import { pickLabelRate, type ShippoAddress } from "@/lib/shippo";
import { noteShippoFailure, resolveShippo } from "@/lib/shippo-connection";
import { buyLabels, failureMessage, type LabelCarrier } from "@/lib/shipping-labels";
import { startTracking } from "@/lib/tracking-service";

export type QuotationRow = typeof purchasingQuotations.$inferSelect;
export type Parcel = { lengthIn: number; widthIn: number; heightIn: number; weightLb: number };

/** Most labels one order may ever have (staff can still make more by hand up to this; the automatic checkout stops far earlier). */
export const MAX_LABELS_TOTAL = 20;

export type BuyLabelsResult = { bought: number; error?: string; remaining?: number };

export async function buyAndSaveLabels(p: {
  organizationId: string;
  quotation: QuotationRow;
  labelCarrier: LabelCarrier;
  labelCount: number;
  parcel: Parcel;
  maxTotal?: number;
}): Promise<BuyLabelsResult> {
  const { organizationId, quotation, labelCarrier, labelCount, parcel } = p;
  const quotationId = quotation.id;

  // Persist the chosen carrier/dimensions regardless of what happens next, so a retry starts from the same choices.
  await db
    .update(purchasingQuotations)
    .set({ labelCarrier, parcelLengthIn: parcel.lengthIn, parcelWidthIn: parcel.widthIn, parcelHeightIn: parcel.heightIn, parcelWeightLb: parcel.weightLb })
    .where(and(eq(purchasingQuotations.id, quotationId), eq(purchasingQuotations.organizationId, organizationId)));

  const existing = await getQuotationLabels(organizationId, quotationId);
  const cap = p.maxTotal ?? MAX_LABELS_TOTAL;
  if (existing.length + labelCount > cap) {
    return { bought: 0, error: `This order already has ${existing.length} label${existing.length === 1 ? "" : "s"}; no more than ${cap} are allowed on one order.` };
  }

  // Only an order with no label yet shows a "failed" state; one that already has saved labels keeps showing them.
  async function recordFailure(message: string): Promise<BuyLabelsResult> {
    if (existing.length === 0) {
      await db
        .update(purchasingQuotations)
        .set({ labelStatus: "ERROR", labelError: message })
        .where(and(eq(purchasingQuotations.id, quotationId), eq(purchasingQuotations.organizationId, organizationId)));
    }
    return { bought: 0, error: message };
  }

  const shippo = await resolveShippo(organizationId);
  if (!shippo.ok) return recordFailure(shippo.message);

  const orgRow = await getOrganization(organizationId);
  if (!hasShipFromAddress(orgRow)) return { bought: 0, error: "Add your company's address in Settings → Shipping & labels before generating a label." };

  const customer = await getPurchasingCustomer(organizationId, quotation.customerId);
  if (!customer || !hasCustomerAddress(customer)) {
    return { bought: 0, error: "This customer doesn't have a shipping address on file yet -- that's the address they'll ship from. Add it on the customer's page, then generate the label." };
  }

  // The customer ships the package to us, so they're the origin and we are the destination (never the other way around).
  const addressFrom: ShippoAddress = {
    name: `${customer.firstName}${customer.lastName ? ` ${customer.lastName}` : ""}`,
    street1: customer.addressStreet1!,
    street2: customer.addressStreet2,
    city: customer.addressCity!,
    state: customer.addressState!,
    zip: customer.addressZip!,
    country: customer.addressCountry,
    phone: customer.phone,
    email: customer.email,
    isResidential: customer.isResidential,
  };
  const addressTo: ShippoAddress = {
    name: orgRow!.shipFromName!,
    company: orgRow!.shipFromCompany,
    street1: orgRow!.shipFromStreet1!,
    street2: orgRow!.shipFromStreet2,
    city: orgRow!.shipFromCity!,
    state: orgRow!.shipFromState!,
    zip: orgRow!.shipFromZip!,
    country: orgRow!.shipFromCountry,
    phone: orgRow!.shipFromPhone,
    email: orgRow!.shipFromEmail,
    isResidential: false,
  };

  const { labels, errors } = await buyLabels(
    {
      createShipment: (params) => shippo.client.createShipment(params).catch(async (e) => (await noteShippoFailure(organizationId, e), Promise.reject(e))),
      pickRate: pickLabelRate,
      createTransaction: (rateId) => shippo.client.createTransaction(rateId).catch(async (e) => (await noteShippoFailure(organizationId, e), Promise.reject(e))),
    },
    labelCarrier,
    labelCount,
    // An undeliverable package always goes back to the customer.
    { addressFrom, addressTo, addressReturn: addressFrom, parcel },
  );

  // Save whatever was bought first: a paid label is never lost, even when another one in the same batch failed.
  if (labels.length > 0) {
    let copiedLegacy = false;
    if (existing.length === 0 && quotation.labelStatus === "GENERATED" && quotation.labelUrl) {
      await db.insert(purchasingQuotationLabels).values({
        id: newId("plabel"), organizationId, quotationId, labelNumber: 1, carrier: quotation.labelCarrier,
        shippoShipmentId: quotation.shippoShipmentId, shippoRateId: quotation.shippoRateId, shippoTransactionId: quotation.shippoTransactionId,
        labelUrl: quotation.labelUrl, trackingNumber: quotation.labelTrackingNumber, trackingUrl: quotation.labelTrackingUrl,
      });
      copiedLegacy = true;
    }
    const firstNumber = copiedLegacy ? 2 : existing.reduce((max, l) => Math.max(max, l.labelNumber), 0) + 1;
    await db.insert(purchasingQuotationLabels).values(
      labels.map((l, i) => ({
        id: newId("plabel"), organizationId, quotationId, labelNumber: firstNumber + i, carrier: labelCarrier,
        shippoShipmentId: l.shipmentId, shippoRateId: l.rateId, shippoTransactionId: l.transactionId,
        labelUrl: l.labelUrl, trackingNumber: l.trackingNumber, trackingUrl: l.trackingUrl, labelCost: l.cost ?? null,
      })),
    );

    // The single-label columns on the quotation mirror the FIRST label, so the Quotation Summary's Tracking # keeps working.
    if (firstNumber === 1) {
      const first = labels[0];
      await db
        .update(purchasingQuotations)
        .set({
          labelStatus: "GENERATED", shippoShipmentId: first.shipmentId, shippoRateId: first.rateId, shippoTransactionId: first.transactionId,
          labelUrl: first.labelUrl, labelTrackingNumber: first.trackingNumber, labelTrackingUrl: first.trackingUrl, labelError: null,
          labelGeneratedAt: new Date().toISOString(), carrier: labelCarrier === "UPS_GROUND" ? "UPS" : "USPS",
          trackingNumber: first.trackingNumber ?? quotation.trackingNumber,
        })
        .where(and(eq(purchasingQuotations.id, quotationId), eq(purchasingQuotations.organizationId, organizationId)));
    } else {
      await db.update(purchasingQuotations).set({ labelError: null }).where(and(eq(purchasingQuotations.id, quotationId), eq(purchasingQuotations.organizationId, organizationId)));
    }
    // Start following the new packages right away (best effort: the label is already bought and saved).
    await startTracking(organizationId, quotationId).catch((e) => console.error("[labels] start tracking failed:", e));
  }

  if (errors.length > 0) {
    let message = failureMessage(labelCount, labels.length, errors);
    if (/phone/i.test(message) && !customer.phone) {
      message += " (This customer has no phone number on file yet -- try USPS Priority Mail, or add their phone on their profile and generate the label again.)";
    }
    if (labels.length === 0) return recordFailure(message);
    return { bought: labels.length, error: message, remaining: labelCount - labels.length };
  }
  return { bought: labels.length };
}
