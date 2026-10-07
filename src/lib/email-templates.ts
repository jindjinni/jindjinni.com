// The customer email templates: the approved wording (from the old Airtable automations) written with {placeholders},
// plus the rules for editing them. Pure, so the Email Settings screen can show a live preview and the server can check
// every change with the same code. A company's edited wording is stored per template (receiving_email_templates);
// until it edits one, the original wording below is used.

import type { EmailTemplateKey } from "@/lib/receiving-rules";

export type TemplateKey = EmailTemplateKey | "PACKAGING_WARNING";
export type AttachKind = "PAYMENT_CONFIRMATION" | "REVISED_INVOICE" | "CUSTOMER_NOTE";
export type TemplateText = { subject: string; body: string };

/** What each {placeholder} stands for (shown next to the editor). */
export const PLACEHOLDERS: { name: string; means: string }[] = [
  { name: "customerName", means: "The customer's name" },
  { name: "company", means: "Your company name, as written (USA Test Strips Center)" },
  { name: "COMPANY", means: "Your company name in capitals" },
  { name: "order", means: "The order reference and tracking number" },
  { name: "originalAmount", means: "The amount originally quoted" },
  { name: "adjustment", means: "The dollar change from the adjustment" },
  { name: "finalAmount", means: "The final payment amount" },
  { name: "adjustmentDetails", means: "What the adjustment is for (the agent's note, or the details Receiving wrote)" },
  { name: "note", means: "The agent's note to the customer. The whole paragraph is left out when there is no note" },
  { name: "website", means: "A link to your website, where customers submit new orders" },
  { name: "packagingGuide", means: "A link to your packaging guide. The paragraph is left out when no guide link is set" },
];
const PLACEHOLDER_NAMES = new Set(PLACEHOLDERS.map((p) => p.name));

const FUNDS = "You should see the funds reflected in your account within 1 to 3 business days, depending on your bank's processing schedule.";
const WEBSITE = "Ready to send more supplies? You can submit a new order anytime on {website}.";
const NOTE = "Additional Note: {note}";

export type TemplateDef = {
  key: TemplateKey;
  label: string;
  /** Plain-language description of when this one is used. */
  usedWhen: string;
  /** Sent automatically by Receiving's answers (true) or only when an agent chooses to (false). */
  automatic: boolean;
  defaultSubject: string;
  defaultBody: string;
  attachKinds: AttachKind[];
  /** Placeholders that must stay in the wording (the payment amount, a place for the note, the website link). */
  required: { any: string[]; label: string }[];
};

const PAYMENT_REQUIRED: TemplateDef["required"] = [
  { any: ["finalAmount"], label: "{finalAmount}" },
  { any: ["note", "adjustmentDetails"], label: "{note} (the agent's note)" },
  { any: ["website"], label: "{website}" },
];

export const TEMPLATE_DEFS: TemplateDef[] = [
  {
    key: "STANDARD",
    label: "Standard",
    usedWhen: "Everything was good: the package and the supplies were fine, and no adjustment was needed.",
    automatic: true,
    defaultSubject: "{company} – Order Received & Processed | Order #: {order}",
    defaultBody: [
      "Good day,",
      "Your package has been received, inspected, and processed successfully. Everything was received as expected, and no adjustments were necessary.",
      "Final Payment Amount: {finalAmount}\nPayment Status: Paid",
      FUNDS,
      "Please see your payment confirmation attached or provided above.",
      "Thank you again for choosing {COMPANY}. We appreciate your business!",
      NOTE,
      WEBSITE,
      "Best regards,\nReceiving & Accounts Team\n{COMPANY}",
    ].join("\n\n"),
    attachKinds: ["PAYMENT_CONFIRMATION", "CUSTOMER_NOTE"],
    required: PAYMENT_REQUIRED,
  },
  {
    key: "STANDARD_PACKAGING_NOTICE",
    label: "Packaging notice",
    usedWhen: "The packaging was not acceptable, but the supplies inside were fine and no adjustment was needed.",
    automatic: true,
    defaultSubject: "{company} – Order Received & Processed: Packaging Notice | Order #: {order}",
    defaultBody: [
      "Good day,",
      "Your package has been received and processed, and your supplies were accepted with no product adjustments required.",
      "Final Payment Amount: {finalAmount}\nPayment Status: Paid",
      FUNDS,
      "Please see your payment confirmation attached to this email for your records.",
      "However, your shipment did not meet our packaging requirements.",
      "Please remember that all supplies should be properly bubble wrapped, double boxed, secured, and shipped using sturdy boxes.",
      "Fortunately, your supplies arrived in acceptable condition this time. However, supplies that arrive damaged due to improper packaging may be subject to up to a 50% deduction.",
      "Please follow all packaging instructions on future shipments.",
      "Thank you!",
      WEBSITE,
      NOTE,
      "Best regards,\nReceiving Team\n{COMPANY}",
    ].join("\n\n"),
    attachKinds: ["PAYMENT_CONFIRMATION", "CUSTOMER_NOTE"],
    required: PAYMENT_REQUIRED,
  },
  {
    key: "ADJUSTMENT_ONLY",
    label: "Adjustment",
    usedWhen: "An adjustment was needed (Receiving chose \"Adjustment needed\"), and the packaging was fine.",
    automatic: true,
    defaultSubject: "{company} – Order Received & Processed: Adjustment Notice | Order #: {order}",
    defaultBody: [
      "Good day,",
      "Your package has been received and processed. Your packaging was acceptable; however, during inspection, we found a difference between the original quotation and the supplies actually received.",
      "Adjustment Details: {adjustmentDetails}",
      "Please see the updated quotation reflecting the supplies and condition actually received, along with your payment confirmation and adjustment photos, attached to this email.",
      "Original Quotation: {originalAmount}\nAdjustment: {adjustment}\nFinal Payment Amount: {finalAmount}",
      FUNDS,
      "For future shipments, please make sure the quantity, product information, and condition entered during quotation accurately match what you are sending.",
      "Thank you again!",
      WEBSITE,
      "Best regards,\nReceiving & Accounts Team\n{COMPANY}",
    ].join("\n\n"),
    attachKinds: ["PAYMENT_CONFIRMATION", "REVISED_INVOICE", "CUSTOMER_NOTE"],
    required: PAYMENT_REQUIRED,
  },
  {
    key: "ADJUSTMENT_PACKAGING",
    label: "Adjustment + packaging",
    usedWhen: "The packaging was not acceptable and an adjustment was needed too.",
    automatic: true,
    defaultSubject: "{company} – Order Received & Processed: Packaging & Adjustment Notice | Order #: {order}",
    defaultBody: [
      "Good day,",
      "Your package has been received and processed.",
      "During inspection, we found that your shipment did not meet our packaging requirements, and some of the supplies were also received with damage or condition issues.",
      "Because the supplies were not received in the condition originally quoted, an adjustment was required.",
      "Adjustment Details: {adjustmentDetails}",
      "Original Quotation: {originalAmount}\nAdjustment: {adjustment}\nFinal Payment Amount: {finalAmount}",
      FUNDS,
      "Please see the updated quotation, inspection details, and adjustment photos, along with your payment confirmation, attached to this email.",
      "Moving forward, please properly bubble wrap and double box your supplies using sturdy boxes. Also, please disclose any dents, dings, stains, tears, or other damage before shipping so we can price your supplies correctly.",
      "Damaged supplies may be subject to up to a 50% deduction.",
      "Thank you for your understanding.",
      WEBSITE,
      "Best regards,\nReceiving & Accounts Team\n{COMPANY}",
    ].join("\n\n"),
    attachKinds: ["PAYMENT_CONFIRMATION", "REVISED_INVOICE", "CUSTOMER_NOTE"],
    required: PAYMENT_REQUIRED,
  },
  {
    key: "PACKAGING_WARNING",
    label: "Packaging warning",
    usedWhen: "Sent on its own, only when an agent presses \"Send a packaging warning\" on an order whose packaging was not acceptable.",
    automatic: false,
    defaultSubject: "Important: Packaging Requirements — Order {order} — {company}",
    defaultBody: [
      "Good day {customerName},",
      "Your package for order {order} was received and processed. However, we noticed it was not packaged according to our requirements.",
      "Double boxing, bubble wrap, and a sturdy outer box are **mandatory** when shipping supplies to us. Any future shipments that arrive damaged due to improper packaging may be subject to a deduction of **up to 50% of the quoted value** for the damaged items.",
      "Please make sure future shipments are properly bubble wrapped, double boxed, and shipped in sturdy boxes to prevent damage in transit. If you're unable to meet these packaging requirements, we may not be the right fit for your shipping needs.",
      "You can review our packaging guidance anytime on {packagingGuide}.",
      WEBSITE,
      "Thank you for your understanding.",
      "— {company} Team",
    ].join("\n\n"),
    attachKinds: [],
    required: [{ any: ["website"], label: "{website}" }],
  },
];

export const TEMPLATE_BY_KEY = Object.fromEntries(TEMPLATE_DEFS.map((d) => [d.key, d])) as Record<TemplateKey, TemplateDef>;
export const isTemplateKey = (v: unknown): v is TemplateKey => typeof v === "string" && v in TEMPLATE_BY_KEY;

export const SUBJECT_MAX = 200;
export const BODY_MAX = 8000;

const used = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);

/** The reasons an edited template can't be saved, in plain words. Empty = fine. */
export function validateTemplate(key: TemplateKey, t: TemplateText): string[] {
  const def = TEMPLATE_BY_KEY[key];
  const errors: string[] = [];
  const subject = t.subject.trim();
  const body = t.body.trim();
  if (!subject) errors.push("The subject can't be empty.");
  if (/[\r\n]/.test(t.subject)) errors.push("The subject must be a single line.");
  if (subject.length > SUBJECT_MAX) errors.push(`The subject is too long (up to ${SUBJECT_MAX} characters).`);
  if (!body) errors.push("The email text can't be empty.");
  if (body.length > BODY_MAX) errors.push(`The email text is too long (up to ${BODY_MAX} characters).`);
  const all = [...used(t.subject), ...used(t.body)];
  const unknown = [...new Set(all.filter((n) => !PLACEHOLDER_NAMES.has(n)))];
  if (unknown.length) errors.push(`These placeholders don't exist: ${unknown.map((n) => `{${n}}`).join(", ")}. Check the spelling against the list.`);
  const inBody = new Set(used(t.body));
  for (const r of def.required) {
    if (!r.any.some((n) => inBody.has(n))) errors.push(`The email text must keep ${r.label}${r.any.includes("website") ? " (every email tells customers where to submit new orders)" : ""}.`);
  }
  return errors;
}

export type TemplateValues = {
  customerName: string;
  company: string;
  order: string;
  originalAmount: string;
  adjustment: string;
  finalAmount: string;
  adjustmentDetails: string;
  note: string;
  websiteUrl: string | null;
  packagingGuideUrl: string | null;
};

function valuesFor(v: TemplateValues): Record<string, string> {
  return {
    customerName: v.customerName,
    company: v.company,
    COMPANY: v.company.toUpperCase(),
    order: v.order,
    originalAmount: v.originalAmount,
    adjustment: v.adjustment,
    finalAmount: v.finalAmount,
    adjustmentDetails: v.adjustmentDetails,
    note: v.note,
    website: v.websiteUrl ? `[our website](${v.websiteUrl})` : "our website",
    packagingGuide: v.packagingGuideUrl ? `[our packaging guide](${v.packagingGuideUrl})` : "",
  };
}

// A paragraph that names one of these is dropped when its value is empty (no note, no guide link).
const DROP_WHEN_EMPTY = ["note", "packagingGuide"];

/** Fills in the placeholders. Paragraphs about a missing note or guide link disappear instead of leaving a blank. */
export function renderTemplate(t: TemplateText, v: TemplateValues): { subject: string; text: string } {
  const vals = valuesFor(v);
  const fill = (s: string) => s.replace(/\{(\w+)\}/g, (m, n: string) => (n in vals ? vals[n] : m));
  const paragraphs = t.body
    .replace(/\r\n/g, "\n")
    .trim()
    .split(/\n{2,}/)
    .filter((p) => !DROP_WHEN_EMPTY.some((n) => p.includes(`{${n}}`) && !vals[n].trim()))
    .map((p) => fill(p).trim())
    .filter(Boolean);
  return { subject: fill(t.subject).replace(/\s+/g, " ").trim(), text: paragraphs.join("\n\n") };
}

/** The sample facts shown in the Email Settings preview. */
export const SAMPLE_VALUES: TemplateValues = {
  customerName: "Jordan Smith",
  company: "Your Company",
  order: "REF-260101-0001 — 1Z999AA10123456784",
  originalAmount: "$500.00",
  adjustment: "-$68.30",
  finalAmount: "$431.70",
  adjustmentDetails: "Two boxes were received with crushed corners.",
  note: "Thank you for being a loyal customer.",
  websiteUrl: "https://example.com",
  packagingGuideUrl: "https://example.com/packaging",
};
