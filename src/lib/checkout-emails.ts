// The email a customer gets after the automatic checkout (and the same words when staff send a copy later): the quotation, the free
// shipping label and the tracking number. Pure (no database, no sending) so the exact words can be tested. It never contains bank details
// beyond "account ending 1234", which is the customer's own account.

import { money } from "@/lib/checkout-rules";
import type { Mail } from "@/lib/storefront-buyer-emails";

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export type CheckoutMailInput = {
  company: string;
  contactName: string;
  reference: string;
  quotationNumber: string;
  lines: { name: string; detail: string; quantity: number; unitPrice: number; lineTotal: number }[];
  itemsTotal: number;
  bonus: number;
  total: number;
  carrierName: string | null;
  trackingNumber: string | null;
  labelUrl: string | null;
  /** Staff are making the label; the customer will get another email with it. */
  labelPending: boolean;
  viewUrl: string;
  accountLast4: string | null;
  isCopy: boolean;
};

export function checkoutOrderEmail(i: CheckoutMailInput): Mail {
  const lines = i.lines.map((l) => `- ${l.quantity} x ${l.name}${l.detail ? ` (${l.detail})` : ""} at ${money(l.unitPrice)} = ${money(l.lineTotal)}`);
  const labelBlock = i.labelUrl
    ? [
        "Your free shipping label:",
        i.labelUrl,
        i.trackingNumber ? `${i.carrierName ?? "Carrier"} tracking number: ${i.trackingNumber}` : "",
        "Print the label, put it on the box, and drop it off with the carrier. You do not pay for shipping.",
      ]
    : i.labelPending
      ? ["Your shipping label: our team is preparing it and will email it to you shortly. You can also check this page for it:", i.viewUrl]
      : ["Your shipping label is not ready yet. Open this page to see it as soon as it is:", i.viewUrl];
  const text = [
    `Hi ${i.contactName},`,
    "",
    i.isCopy ? `Here is a copy of your order ${i.reference} with ${i.company}.` : `Thank you. ${i.company} received your order ${i.reference}.`,
    "",
    `Quotation ${i.quotationNumber}`,
    ...lines,
    i.bonus > 0 ? `Bonus: ${money(i.bonus)}` : "",
    `Estimated payout: ${money(i.total)}`,
    i.accountLast4 ? `We will pay it by direct deposit to your account ending ${i.accountLast4} after we receive and check your package.` : "We will pay it after we receive and check your package.",
    "The payout is final once we have received and checked what you sent. If anything differs from the order, we will contact you first.",
    "",
    ...labelBlock,
    "",
    `You can see this order any time at ${i.viewUrl}`,
    "",
    i.company,
  ].filter((l, idx, a) => l !== "" || (a[idx - 1] !== "" && idx !== 0)).join("\n");
  const html = text.split("\n").map((l) => `<p>${esc(l) || "&nbsp;"}</p>`).join("");
  return { subject: `${i.isCopy ? "Copy: " : ""}Your order ${i.reference} and shipping label`, text, html };
}
