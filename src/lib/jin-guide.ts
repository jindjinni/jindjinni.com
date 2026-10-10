// What Jin knows about the platform itself, written for the person asking: only the departments, tabs and settings that
// person can actually open. Built from the real menus (DEPARTMENT_MENUS) plus a one-line plain description of each tab,
// so the guide cannot drift away from the app or tell someone about a page they are not allowed into.

import { DEPARTMENT_MENUS, menuIdsFor, type MenuDept } from "@/lib/sidebar-menu";
import { departmentsFor, isAdmin, ROLE_LABELS, settingsSectionsFor, type Access, type Role } from "@/lib/permissions";

const WHAT: Record<MenuDept, Record<string, string>> = {
  purchasing: {
    dashboard: "Counts of customers, products and open quotations, with shortcuts.",
    "purchase-orders": "Make a purchase order for a wholesaler you buy from (part numbers and NDCs, quantities, net cost), save it as a draft, send it as a PDF and as an email with the order written out, and follow it from Sent to Confirmed to Received. A sent order can be corrected with \"Send a revision\" and a note saying what is wrong.",
    suppliers: "The wholesalers you buy from, saved once with their email, address and license number and expiry, ready to pick on every purchase order.",
    templates: "How your Quotation and Purchase Order documents look: logo, name, title and wording, plus one standing notice (for example \"out of office for a week\") that prints on every one while it is switched on (manager only).",
    quotations: "Create a quotation for a customer, choose products and conditions, see its status (Quoted, Confirmed, Received, Cancelled), print or send the receipt, and track the package.",
    customers: "The people you buy from: contact details, shipping address and every quotation made for them.",
    products: "The list of products you buy, with their category and pricing.",
    categories: "Groups for your products.",
    conditions: "The conditions a product can be bought in (for example sealed, open).",
    "month-range": "The expiration ranges that decide the price tier of a product.",
    "product-multipliers": "Price multipliers per product.",
    "bonus-tiers": "Bonus percentages for bigger quotations.",
    "quotation-profile": "The numbering and details printed on your quotations.",
    "receipt-layout": "How the quotation receipt looks.",
    "shipment-tracking": "How packages are followed after the label is bought.",
    connectors: "Plug in your own Shippo account to buy UPS and USPS labels (owner or admin only).",
  },
  receiving: {
    "all-shipments": "The board of every shipment by stage: Uncategorized, Need to Be Reviewed, Need Adjusted Quotation, Need to Be Returned, Need to Be Paid, Paid.",
    "delivered-today": "Packages the carrier delivered today.",
    intake: "The form a receiver fills in when a package is opened: photos, items, lot and serial numbers, quantities and condition.",
    "received-items": "Every item that was received, grouped by brand.",
    daily: "What was received each day.",
    tracker: "Search any lot or serial number and see where it came from, with recall warnings.",
    products: "The product list as Receiving sees it.",
    adjustments: "Orders whose price needs to be adjusted after the package was checked.",
    connectors: "Your company mailbox and AI key status (owner or admin only).",
  },
  accounts: {
    "to-be-paid": "Orders Receiving sent to Accounts that still need to be paid, soonest due first.",
    "paid-orders": "Orders already marked Paid, with their payment receipts.",
    "monthly-report": "A monthly report of what was paid.",
    "payment-terms": "How many business days you take to pay, holidays and closure days.",
  },
  "customer-service": {
    "to-be-emailed": "Paid orders waiting for their confirmation email to the customer.",
    emailed: "The emails that were already sent.",
    "email-settings": "The wording of the customer emails.",
    connectors: "Your company mailbox (owner or admin only).",
  },
  inventory: {
    stock: "What you have in stock now, by brand, product and condition, with expiry groups and cost.",
    "manual-add": "Add stock by hand.",
    movements: "The history of every stock change.",
    "estimated-prices": "Your estimated resale price per product and condition.",
  },
  sales: {
    quotations: "Quotations to your buyers; a sent one can be corrected with \"Send a revision\" and a note.",
    "purchase-orders": "Purchase orders your buyers send you: log the buyer's PO number and the NDC of each item, send a confirmation, correct it with \"Send a revision\" and a note, and turn it into an invoice.",
    invoices: "Invoices to your buyers.",
    buyers: "The companies you sell to.",
    "price-comparison": "Compare your price with what buyers offer.",
    "company-profile": "Your company details printed on sales documents.",
    templates: "How your Sales quotations and purchase orders look: logo, name, title and wording, plus one standing notice that prints on every one while it is switched on.",
    connectors: "Your company mailbox (owner or admin only).",
  },
  shipping: {
    "to-ship": "Orders that are ready to go out and have no shipment yet; press Start shipment on one.",
    shipments: "Every shipment with its boxes, tracking numbers, photos and status (In Transit, Out for Delivery, Delivered), and the shipped email you review and send.",
    "new-shipment": "Send a return or anything else that has no sales order: pick an address, make the label, track it.",
    addresses: "Saved addresses for your pharmacies, wholesale buyers, sellers and suppliers; bring them over from Sales and Purchasing with one button.",
    mail: "The Shipping mailbox the shipped emails go out from.",
    connectors: "Your Shippo account that buys the labels and follows the tracking numbers (owner or admin only).",
  },
  hr: {
    staff: "Who is clocked in today.",
    activity: "The activity log of the team.",
    "time-sheets": "Time sheets per person.",
  },
  marketing: {
    contacts: "Your marketing contact list.",
    "email-campaigns": "Email campaigns to your contacts.",
    "text-campaigns": "Text campaigns (texting is not available yet).",
    "email-settings": "Sender and footer for campaign emails.",
    "text-settings": "Text campaign settings.",
    connectors: "Your company mailbox (owner or admin only).",
  },
};

const GENERAL = [
  "Home (/dashboard): a welcome page with the latest industry news and recalls for the brands the company buys. The news is a built-in feature; nobody needs to connect anything for it.",
  "Chat (/dashboard/chat): the company's internal messaging. Rooms follow the departments a person works in.",
  "The clock at the top: people clock in and out there; the hours show in HR → Time Sheets.",
  "Settings (/dashboard/settings): My account (name and password), Business profile, Appearance (color theme) for everyone; more for admins.",
  "Anything that costs money or carries the company's identity (shipping labels, the company mailbox, an AI such as Claude or ChatGPT, texts) is connected by the company itself under Connectors, never the platform's.",
];

/** The guide for one signed-in person, as plain text for Jin's instructions. */
export function guideFor(role: Role, access: Access, opts: { hidden?: string[] } = {}): string {
  const lines: string[] = [];
  lines.push(`The person asking is a ${ROLE_LABELS[role] ?? role}.`);
  const depts = departmentsFor(role, access) as MenuDept[];
  if (depts.length === 0) lines.push("They can open no departments, only Home, Chat and Settings.");
  for (const d of depts) {
    const menu = DEPARTMENT_MENUS[d];
    const ids = menuIdsFor(d, { connectors: isAdmin(role) });
    lines.push(`\n${menu.title} (${menu.items[0].href.split("/").slice(0, 3).join("/")}):`);
    for (const item of menu.items) {
      if (!ids.includes(item.id) || opts.hidden?.includes(item.id)) continue;
      lines.push(`- ${item.label}${item.setup ? " (Settings)" : ""}: ${WHAT[d][item.id] ?? ""} Link: ${item.href}`);
    }
  }
  lines.push("\nSettings pages this person can open:");
  for (const s of settingsSectionsFor(role)) lines.push(`- ${s.label}: ${s.blurb} Link: ${s.href}`);
  lines.push("\nEverywhere:");
  for (const g of GENERAL) lines.push(`- ${g}`);
  return lines.join("\n");
}
