// An order as the company's website sees it over the connection. Prices, label and tracking only: no bank details, no staff notes,
// no flags (those are for the company's team).
import type { OrderView } from "@/lib/website-checkout";

export function orderToApi(o: OrderView) {
  const hasLabel = o.label.status === "GENERATED" && !!o.label.labelUrl;
  return {
    reference: o.reference,
    quotationNumber: o.quotationNumber,
    status: o.status === "RECEIVED" ? "received" : o.status === "CANCELLED" ? "cancelled" : "quotation_made",
    createdAt: o.createdAt,
    lines: o.lines,
    itemsTotal: o.itemsTotal,
    bonus: o.bonus,
    total: o.total,
    label: hasLabel ? { carrier: o.label.carrierName, trackingNumber: o.label.trackingNumber, trackingUrl: o.label.trackingUrl, labelUrl: o.label.labelUrl } : null,
    labelPending: !hasLabel,
    packageStatus: o.packageStatus,
    payoutAccount: o.accountLast4 ? `${o.accountType === "savings" ? "Savings" : "Checking"} account ending ${o.accountLast4}` : null,
  };
}
