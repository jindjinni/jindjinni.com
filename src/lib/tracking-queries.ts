// What the Receiving "Delivered Today" tab reads: packages Shippo says were delivered, newest first, with the
// customer, the quotation and (when there is one) the receiving record. Every query is limited to the signed-in company.

import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db/client";
import { purchasingCustomers, purchasingQuotations, purchasingTracking, receivingPackages } from "@/db/schema";
import { dayInZone } from "@/lib/payment-due";

export type DeliveredRow = {
  id: string;
  quotationId: string;
  quotationNumber: string;
  customerName: string;
  trackingNumber: string;
  carrier: string;
  /** "YYYY-MM-DD HH:MM:SS" UTC. */
  deliveredAt: string;
  /** The delivered day on the company's own calendar. */
  day: string;
  location: string | null;
  /** Where the receiving record stands: none yet, started, or finished. */
  receiving: "NONE" | "IN_PROGRESS" | "DONE";
  packageId: string | null;
};

/** Packages delivered in the last `days` days (default 8), newest first. */
export async function getDeliveredPackages(organizationId: string, timeZone: string, days = 8): Promise<DeliveredRow[]> {
  const since = new Date(Date.now() - (days + 1) * 86_400_000).toISOString().slice(0, 19).replace("T", " ");
  const rows = await db
    .select({
      id: purchasingTracking.id,
      quotationId: purchasingTracking.quotationId,
      quotationNumber: purchasingQuotations.quotationNumber,
      nameSnap: purchasingQuotations.customerNameSnapshot,
      firstName: purchasingCustomers.firstName,
      lastName: purchasingCustomers.lastName,
      trackingNumber: purchasingTracking.trackingNumber,
      carrier: purchasingTracking.carrier,
      deliveredAt: purchasingTracking.deliveredAt,
      statusAt: purchasingTracking.statusAt,
      location: purchasingTracking.location,
      packageId: receivingPackages.id,
      packageStatus: receivingPackages.status,
    })
    .from(purchasingTracking)
    .innerJoin(purchasingQuotations, eq(purchasingQuotations.id, purchasingTracking.quotationId))
    .leftJoin(purchasingCustomers, eq(purchasingCustomers.id, purchasingQuotations.customerId))
    .leftJoin(receivingPackages, eq(receivingPackages.quotationId, purchasingTracking.quotationId))
    .where(and(eq(purchasingTracking.organizationId, organizationId), eq(purchasingTracking.status, "Delivered"), gte(purchasingTracking.deliveredAt, since)))
    .orderBy(desc(purchasingTracking.deliveredAt))
    .limit(1000);
  const out: DeliveredRow[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.id)) continue; // a quotation with two receiving records would otherwise list the box twice
    seen.add(r.id);
    const at = r.deliveredAt ?? r.statusAt ?? "";
    out.push({
      id: r.id,
      quotationId: r.quotationId,
      quotationNumber: r.quotationNumber,
      customerName: r.firstName ? [r.firstName, r.lastName].filter(Boolean).join(" ") : r.nameSnap,
      trackingNumber: r.trackingNumber,
      carrier: r.carrier,
      deliveredAt: at,
      day: dayInZone(at, timeZone),
      location: r.location,
      receiving: !r.packageId ? "NONE" : r.packageStatus === "IN_PROGRESS" ? "IN_PROGRESS" : "DONE",
      packageId: r.packageId,
    });
  }
  return out;
}
