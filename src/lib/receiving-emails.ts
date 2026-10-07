// The customer emails Receiving sends. Pure: given the shipment facts it returns
// the subject, plain text and HTML. Wording is the approved wording from the
// old Airtable automations; company-specific bits (name, links) come in via ctx.

import { formatMoney, type EmailTemplateKey } from "@/lib/receiving-rules";
import { renderTemplate, TEMPLATE_BY_KEY, type TemplateText } from "@/lib/email-templates";

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

export function buildCustomerEmail(key: EmailTemplateKey, ctx: EmailContext, override?: TemplateText | null): BuiltEmail {
  const def = TEMPLATE_BY_KEY[key];
  const adj = adjustmentAmountFor(ctx);
  const why = ctx.customerNote?.trim() || ctx.adjustmentDetails?.trim() || "";
  const { subject, text } = renderTemplate(override ?? { subject: def.defaultSubject, body: def.defaultBody }, {
    customerName: ctx.customerName,
    company: ctx.companyName,
    order: ctx.orderLabel,
    originalAmount: formatMoney(ctx.orderTotal),
    adjustment: adj == null ? "No dollar change" : formatMoney(adj),
    finalAmount: formatMoney(ctx.adjustedOrderTotal ?? ctx.orderTotal),
    adjustmentDetails: why,
    note: ctx.customerNote?.trim() ?? "",
    websiteUrl: ctx.quoteLinkUrl,
    packagingGuideUrl: ctx.packagingGuideUrl,
  });
  return { subject, text: plain(text), html: textToHtml(text), attachKinds: def.attachKinds };
}

/** The manual "packaging requirements" warning (sent on its own, e.g. before payment). */
export function buildPackagingWarning(
  ctx: Pick<EmailContext, "companyName" | "customerName" | "orderLabel" | "packagingGuideUrl"> & { quoteLinkUrl?: string | null },
  override?: TemplateText | null,
): BuiltEmail {
  const def = TEMPLATE_BY_KEY.PACKAGING_WARNING;
  const { subject, text } = renderTemplate(override ?? { subject: def.defaultSubject, body: def.defaultBody }, {
    customerName: ctx.customerName,
    company: ctx.companyName,
    order: ctx.orderLabel,
    originalAmount: "",
    adjustment: "",
    finalAmount: "",
    adjustmentDetails: "",
    note: "",
    websiteUrl: ctx.quoteLinkUrl ?? null,
    packagingGuideUrl: ctx.packagingGuideUrl,
  });
  return { subject, text: plain(text), html: textToHtml(text), attachKinds: [] };
}
