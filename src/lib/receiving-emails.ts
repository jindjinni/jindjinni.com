// The customer emails Receiving sends. Pure: given the shipment facts it returns
// the subject, plain text and HTML. Wording is the approved wording from the
// old Airtable automations; company-specific bits (name, links) come in via ctx.

import { formatMoney, type EmailTemplateKey } from "@/lib/receiving-rules";

export type EmailContext = {
  companyName: string;
  customerName: string;
  /** "REF-260928-9247 — 1ZVJ..." (reference # and tracking #, as shown in the subject). */
  orderLabel: string;
  orderTotal: number;
  /** Staff-entered corrected payout, or null. */
  adjustedOrderTotal: number | null;
  /** Staff-entered dollar change shown to the customer (e.g. -30), or null to work it out from the totals. */
  adjustmentAmount: number | null;
  /** The agent's own words for the customer ("Notes for Customer Email"). */
  customerNote: string | null;
  /** Fallback explanation when no customer note was written. */
  adjustmentDetails: string | null;
  quoteLinkUrl: string | null;
  packagingGuideUrl: string | null;
};

export type BuiltEmail = { subject: string; text: string; html: string; attachKinds: ("PAYMENT_CONFIRMATION" | "REVISED_INVOICE" | "CUSTOMER_NOTE")[] };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Plain text -> simple HTML: escaped, line breaks kept, [label](url) and **bold** supported. */
export function textToHtml(text: string): string {
  const body = esc(text)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>\n");
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#111">${body}</div>`;
}
/** Markdown-ish text -> plain text (links become "label: url"). */
function plain(text: string): string {
  return text.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1: $2").replace(/\*\*([^*]+)\*\*/g, "$1");
}

export function adjustmentAmountFor(ctx: Pick<EmailContext, "orderTotal" | "adjustedOrderTotal" | "adjustmentAmount">): number | null {
  if (ctx.adjustmentAmount != null) return ctx.adjustmentAmount;
  if (ctx.adjustedOrderTotal != null) return Math.round((ctx.adjustedOrderTotal - ctx.orderTotal) * 100) / 100;
  return null;
}

export function buildCustomerEmail(key: EmailTemplateKey, ctx: EmailContext): BuiltEmail {
  const company = ctx.companyName;
  const COMPANY = company.toUpperCase();
  const final = formatMoney(ctx.adjustedOrderTotal ?? ctx.orderTotal);
  const quote = ctx.quoteLinkUrl ? `\n\nReady to send more supplies? [Get a quote anytime on our website](${ctx.quoteLinkUrl}).` : "";
  const note = ctx.customerNote?.trim() ? `\n\nAdditional Note: ${ctx.customerNote.trim()}` : "";
  const why = ctx.customerNote?.trim() || ctx.adjustmentDetails?.trim() || "";
  const adj = adjustmentAmountFor(ctx);
  const adjLine = adj == null ? "No dollar change" : formatMoney(adj);
  const funds = "You should see the funds reflected in your account within 1 to 3 business days, depending on your bank's processing schedule.";

  let subject: string;
  let body: string;
  let attachKinds: BuiltEmail["attachKinds"];

  switch (key) {
    case "STANDARD":
      subject = `${company} – Order Received & Processed | Order #: ${ctx.orderLabel}`;
      body = `Good day,\n\nYour package has been received, inspected, and processed successfully. Everything was received as expected, and no adjustments were necessary.\n\nFinal Payment Amount: ${final}\nPayment Status: Paid\n\n${funds}\n\nPlease see your payment confirmation attached or provided above.\n\nThank you again for choosing ${COMPANY}. We appreciate your business!${quote}${note}\n\nBest regards,\nReceiving & Accounts Team\n${COMPANY}`;
      attachKinds = ["PAYMENT_CONFIRMATION", "CUSTOMER_NOTE"];
      break;
    case "STANDARD_PACKAGING_NOTICE":
      subject = `${company} – Order Received & Processed: Packaging Notice | Order #: ${ctx.orderLabel}`;
      body = `Good day,\n\nYour package has been received and processed, and your supplies were accepted with no product adjustments required.\n\nFinal Payment Amount: ${final}\nPayment Status: Paid\n\n${funds}\n\nPlease see your payment confirmation attached to this email for your records.\n\nHowever, your shipment did not meet our packaging requirements.\n\nPlease remember that all supplies should be properly bubble wrapped, double boxed, secured, and shipped using sturdy boxes.\n\nFortunately, your supplies arrived in acceptable condition this time. However, supplies that arrive damaged due to improper packaging may be subject to up to a 50% deduction.\n\nPlease follow all packaging instructions on future shipments.\n\nThank you!${quote}${note}\n\nBest regards,\nReceiving Team\n${COMPANY}`;
      attachKinds = ["PAYMENT_CONFIRMATION", "CUSTOMER_NOTE"];
      break;
    case "ADJUSTMENT_PACKAGING":
      subject = `${company} – Order Received & Processed: Packaging & Adjustment Notice | Order #: ${ctx.orderLabel}`;
      body = `Good day,\n\nYour package has been received and processed.\n\nDuring inspection, we found that your shipment did not meet our packaging requirements, and some of the supplies were also received with damage or condition issues.\n\nBecause the supplies were not received in the condition originally quoted, an adjustment was required.\n\nAdjustment Details: ${why}\n\nOriginal Quotation: ${formatMoney(ctx.orderTotal)}\nAdjustment: ${adjLine}\nFinal Payment Amount: ${final}\n\n${funds}\n\nPlease see the updated quotation, inspection details, and adjustment photos, along with your payment confirmation, attached to this email.\n\nMoving forward, please properly bubble wrap and double box your supplies using sturdy boxes. Also, please disclose any dents, dings, stains, tears, or other damage before shipping so we can price your supplies correctly.\n\nDamaged supplies may be subject to up to a 50% deduction.\n\nThank you for your understanding.${quote}\n\nBest regards,\nReceiving & Accounts Team\n${COMPANY}`;
      attachKinds = ["PAYMENT_CONFIRMATION", "REVISED_INVOICE", "CUSTOMER_NOTE"];
      break;
    case "ADJUSTMENT_ONLY":
      subject = `${company} – Order Received & Processed: Adjustment Notice | Order #: ${ctx.orderLabel}`;
      body = `Good day,\n\nYour package has been received and processed. Your packaging was acceptable; however, during inspection, we found a difference between the original quotation and the supplies actually received.\n\nAdjustment Details: ${why}\n\nPlease see the updated quotation reflecting the supplies and condition actually received, along with your payment confirmation and adjustment photos, attached to this email.\n\nOriginal Quotation: ${formatMoney(ctx.orderTotal)}\nAdjustment: ${adjLine}\nFinal Payment Amount: ${final}\n\n${funds}\n\nFor future shipments, please make sure the quantity, product information, and condition entered during quotation accurately match what you are sending.\n\nThank you again!${quote}\n\nBest regards,\nReceiving & Accounts Team\n${COMPANY}`;
      attachKinds = ["PAYMENT_CONFIRMATION", "REVISED_INVOICE", "CUSTOMER_NOTE"];
      break;
  }
  return { subject, text: plain(body), html: textToHtml(body), attachKinds };
}

/** The manual "packaging requirements" warning (sent on its own, e.g. before payment). */
export function buildPackagingWarning(ctx: Pick<EmailContext, "companyName" | "customerName" | "orderLabel" | "packagingGuideUrl">): BuiltEmail {
  const guide = ctx.packagingGuideUrl ? `\n\nYou can review our packaging guidance anytime on [our website](${ctx.packagingGuideUrl}).` : "";
  const body = `Good day ${ctx.customerName},\n\nYour package for order ${ctx.orderLabel} was received and processed. However, we noticed it was not packaged according to our requirements.\n\nDouble boxing, bubble wrap, and a sturdy outer box are **mandatory** when shipping supplies to us. Any future shipments that arrive damaged due to improper packaging may be subject to a deduction of **up to 50% of the quoted value** for the damaged items.\n\nPlease make sure future shipments are properly bubble wrapped, double boxed, and shipped in sturdy boxes to prevent damage in transit. If you're unable to meet these packaging requirements, we may not be the right fit for your shipping needs.${guide}\n\nThank you for your understanding.\n\n— ${ctx.companyName} Team`;
  return {
    subject: `Important: Packaging Requirements — Order ${ctx.orderLabel} — ${ctx.companyName}`,
    text: plain(body),
    html: textToHtml(body),
    attachKinds: [],
  };
}
