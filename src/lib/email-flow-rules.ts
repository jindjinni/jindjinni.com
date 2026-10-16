// "How our emails work": the plain-language map of every email the wholesale flow sends. Pure data, so the page and the tests read the same
// words. If an email is added or its sender changes, change it here too (CLAUDE.md says so).

import type { MailDept } from "@/lib/mail-rules";

export type FlowEmail = {
  id: string;
  /** Where in the wholesale chain it happens (the step number is the order things happen in). */
  when: string;
  title: string;
  to: string;
  /** The department whose mailbox sends it (the order of "who it comes from" below applies). */
  dept: MailDept;
  /** What starts it: automatic, or a person presses Send. */
  trigger: string;
  /** Used instead of `trigger` when the company has the automatic payment email on (feature `auto-payment-email`). */
  triggerAuto?: string;
  what: string;
  /** Where its wording is changed (a link label and an href), or null when the wording is built in. */
  edit: { label: string; href: string; adminOnly?: boolean } | null;
};

/** Who an email comes from, in the order the app tries. */
export const SENDER_ORDER: { title: string; text: string; where: { label: string; href: string } | null }[] = [
  { title: "The department's own mailbox", text: "If the department has its own email address connected (for example purchasing@yourcompany.com), the email goes out from it and a copy is kept in that mailbox's Sent folder.", where: { label: "Settings → Company emails", href: "/dashboard/settings/emails" } },
  { title: "Your company mailbox", text: "If the department has none, the company-wide mailbox you connected is used.", where: { label: "Settings → Connectors", href: "/dashboard/settings/connectors" } },
  { title: "The platform's address", text: "If neither is connected, the email still goes out, from the platform's shared address with your company's name on it. Replies go to the reply-to address in Customer Service → Email Settings.", where: { label: "Customer Service → Email Settings", href: "/dashboard/customer-service/email-settings" } },
];

/** A department whose own mailbox needs signing in again does NOT quietly fall back: the email stops with a clear message until it is reconnected. */
export const RECONNECT_NOTE = "If a department's mailbox needs to be signed in again, its emails stop and say so. They never quietly go out from a different address.";

export const WHOLESALE_EMAILS: FlowEmail[] = [
  {
    id: "quotation",
    when: "A customer sells you supplies",
    title: "Your quotation and free shipping label",
    to: "The customer",
    dept: "purchasing",
    trigger: "Automatic when the order is placed on your website. You can send a copy again from Purchasing → Website orders.",
    what: "The quotation (PDF attached), what each item is worth, and the free label. The label always goes from the customer to your receiving address.",
    edit: { label: "Receiving address: Purchasing → Shipping settings", href: "/dashboard/purchasing/shipping-settings" },
  },
  {
    id: "delivered",
    when: "The package is on its way and arrives",
    title: "No email: the package is followed for you",
    to: "Nobody",
    dept: "receiving",
    trigger: "Shippo follows the tracking number. When the carrier says delivered, the order shows in Receiving → Delivered Today.",
    what: "Nothing is sent to the customer at this point. Your team checks the package in, runs the recall check and sends the order to Accounts.",
    edit: null,
  },
  {
    id: "paid",
    when: "Accounts pays the customer (direct deposit)",
    title: "Your package was received and processed (you have been paid)",
    to: "The customer",
    dept: "receiving",
    trigger: "A person presses Send in Customer Service → To Be Emailed after Accounts marks the order Paid. Nothing is sent by itself.",
    triggerAuto: "Automatic: the moment Accounts marks the order Paid, if the customer has an email on the order and nothing is missing. If something is missing, the order waits in Customer Service → To Be Emailed and says why, and a person presses Send. An Owner or Admin can turn the automatic send off in Customer Service → Email Settings.",
    what: "Tells the customer the final amount and that it was paid, with the payment receipt attached. There are five wordings: Standard, Packaging notice, Adjustment, Adjustment + packaging, and a stand-alone Packaging warning. Receiving's answers pick which one fits.",
    edit: { label: "Customer Service → Email Settings", href: "/dashboard/customer-service/email-settings", adminOnly: true },
  },
  {
    id: "shipped",
    when: "You send something out",
    title: "A shipment is on its way",
    to: "The customer (return), supplier or distributor",
    dept: "shipping",
    trigger: "A person reviews the email on the shipment page and presses Send. Your company is always the sender of these shipments.",
    what: "The tracking numbers with links, what is in the box (no prices), and any photos or documents you ticked.",
    edit: { label: "Shipping address: Shipping → Shipping settings", href: "/dashboard/settings/business" },
  },
  {
    id: "po",
    when: "You order from a supplier",
    title: "Purchase order",
    to: "The supplier",
    dept: "purchasing",
    trigger: "A person presses Send on the purchase order.",
    what: "The purchase order as a PDF and written out in the email. A revision can be sent with a note saying what is wrong.",
    edit: { label: "Purchasing → Document Templates", href: "/dashboard/purchasing/templates" },
  },
];

/** Emails that are not part of the wholesale chain but come from the platform itself. */
export const PLATFORM_EMAILS: { title: string; text: string }[] = [
  { title: "Sign-up and sign-in", text: "The code that confirms a new email address, password resets and team invitations come from the platform's address, not a department mailbox." },
  { title: "Chat and support", text: "Replies from the platform's support team arrive from the platform's address." },
];
