// The words on the public pages that explain how jindjinni works for a Wholesale company, a Distribution company, or both.
// Written once, as data, so the home page, the three explainer pages and the tests all read the same text.
//
// Every claim here must be something the software does today (see the notes beside each block). Keep it that way:
//  - never say a product is genuine, safe, recall-free or "guaranteed" caught: the checks flag, and a person decides;
//  - never put a price in the words (prices come from the price book, `currentBook()`);
//  - say what a side hides or adds exactly as `operation-tabs-rules.ts` does.
// `scripts/landing-content.test.ts` checks the shape and the banned words.

import type { IconName } from "@/components/landing/icons";

export type OperationSlug = "wholesale" | "distribution" | "both";

export type DeptBlock = {
  /** Department name as it appears in the menu. */
  dept: string;
  icon: IconName;
  /** One plain sentence: what this department does for this side. */
  line: string;
  points: string[];
};

export type OperationContent = {
  slug: OperationSlug;
  name: string;
  /** Short label for cards and nav. */
  label: string;
  tagline: string;
  intro: string;
  /** Who this side is for, in one sentence. */
  forWhom: string;
  /** The day, step by step (the same story the Operations settings page tells). */
  day: string[];
  depts: DeptBlock[];
  /** Three or four lines for the home page card. */
  cardPoints: string[];
};

const wholesaleDepts: DeptBlock[] = [
  {
    dept: "Purchasing",
    icon: "purchasing",
    line: "Source supplies directly from sellers with automatic quotations and a free shipping label.",
    points: [
      "Quotations priced from your own product list, with condition, expiration, product multiplier and bonus-tier rules applied for you",
      "A free prepaid shipping label on a quotation, bought from your own shipping account",
      "Customer list, product catalog, quotation receipt layout and document templates in your own wording",
      "Shipment tracking that follows every package until it arrives",
      "A quick recall look-up before you quote",
    ],
  },
  {
    dept: "Receiving",
    icon: "receiving",
    line: "Open every package against its quotation and record what was really inside.",
    points: [
      "Photos taken right in the intake form, with lot and serial numbers read from them and confirmed by your receiver",
      "Recall, repeated-number and made-up-number checks on every item, with holds you can trace",
      "Order adjustments: a corrected quotation sent as a clear PDF when the contents differ",
      "Lot & Serial Tracker: see which customer sent every lot and serial number",
    ],
  },
  {
    dept: "Accounts",
    icon: "accounts",
    line: "Pay sellers for what you accepted, and collect from distributors.",
    points: [
      "To Be Paid and Paid Orders: only what is ready, due or overdue, with payment records kept organized",
      "To Be Collected: what your distributors owe you, with payments recorded against invoices",
      "Monthly Report for the month-end",
    ],
  },
  {
    dept: "Customer Service",
    icon: "support",
    line: "Tell customers what happened to their order, from one controlled place.",
    points: [
      "Payment and adjustment emails written for review, sent only when a person presses Send",
      "A record of every email sent, with its exact wording",
      "Payments Received, so nobody is told twice",
    ],
  },
  {
    dept: "Inventory",
    icon: "inventory",
    line: "Stock that only counts items you can actually sell.",
    points: [
      "Live stock by product, condition and expiration date",
      "Recalled items, suspect items and items going back are kept out of sellable stock",
      "Stock History for every item in and out, and Estimated Prices for what you hold",
    ],
  },
  {
    dept: "Sales",
    icon: "tag",
    line: "Sell on to distributors from the stock you really hold.",
    points: [
      "Receive a distributor's purchase order, turn it into a sales order, then send the invoice",
      "Quotations and invoices from the same product and stock data, with buyer records and price comparison",
      "Sending an invoice is what takes items out of stock; a draft never does",
    ],
  },
  {
    dept: "Shipping",
    icon: "distribution",
    line: "Ship what you sold, with labels and tracking.",
    points: [
      "Several shipments per order and several boxes per shipment",
      "UPS Ground or USPS Priority Mail labels from your own shipping account, or a tracking number typed by hand",
      "One shipped email per shipment, reviewed before it goes out, with items and no prices",
    ],
  },
  {
    dept: "Marketing, HR and Chat",
    icon: "chat",
    line: "Run the team around the work.",
    points: [
      "Contact lists plus email and text campaigns, with opt-outs respected automatically",
      "Clock in and out, time sheets and an activity log",
      "Company chat with a room for each department, and private messages",
    ],
  },
];

const distributionDepts: DeptBlock[] = [
  {
    dept: "Purchasing",
    icon: "purchasing",
    line: "Buy from wholesalers with purchase orders.",
    points: [
      "A purchase order to each supplier, corrected by a numbered revision (never edited after it is sent), with the earlier version kept",
      "Supplier list and product catalog; each order keeps its own copy of the supplier and addresses",
      "Document templates with your logo, wording and one standing notice per document type",
      "Shipment tracking for what is on its way",
    ],
  },
  {
    dept: "Receiving",
    icon: "receiving",
    line: "Check what arrives against the order before you pay.",
    points: [
      "Package and product photos, with lot and serial numbers read and confirmed by your receiver",
      "Recall lists checked on every scan and every save; a shipment can't be submitted until each product's recall check is recorded",
      "Repeated, made-up and wrong-shaped serial numbers flagged, with a hold only an Owner or Admin can release",
      "Lot & Serial Tracker: see which lots and serial numbers came from which sender, so a recalled lot can be traced back",
    ],
  },
  {
    dept: "Accounts",
    icon: "accounts",
    line: "Know what you owe suppliers and what pharmacies owe you.",
    points: [
      "Supplier Bills: made automatically when a purchase order is received, and approved before any payment can be recorded",
      "To Be Collected: payments recorded against each invoice, with what is due or overdue",
      "Audit Center: answer pharmacy, PBM and State or Federal audits from the invoices you issued, with a review checklist before anything is emailed and every file kept exactly as sent",
    ],
  },
  {
    dept: "Customer Service",
    icon: "support",
    line: "Keep pharmacies informed, once and in writing.",
    points: [
      "Payment notices written for review and sent only when a person presses Send",
      "A record of every email sent",
    ],
  },
  {
    dept: "Inventory",
    icon: "inventory",
    line: "Stock you can stand behind.",
    points: [
      "Live stock by product, condition and expiration date, built from what Receiving accepted",
      "Recalled, suspect and returning items stay out of sellable stock",
      "Stock History and Estimated Prices",
    ],
  },
  {
    dept: "Sales",
    icon: "tag",
    line: "Sell to pharmacies and other retail outlets.",
    points: [
      "A pharmacy's purchase order becomes a sales order, then your invoice",
      "Buyer records for every pharmacy, and price comparison",
      "Invoices draw only from stock you hold; sending one takes the items out",
    ],
  },
  {
    dept: "Shipping",
    icon: "distribution",
    line: "Get orders out with labels, tracking and a clear record.",
    points: [
      "Shipments, boxes and returns in one place",
      "Labels from your own shipping account, or tracking typed by hand",
      "A reviewed shipped email per shipment, with items and NDCs but no prices",
    ],
  },
  {
    dept: "Marketing, HR and Chat",
    icon: "chat",
    line: "Run the team around the work.",
    points: [
      "Contact lists plus email and text campaigns, with opt-outs respected automatically",
      "Clock in and out, time sheets and an activity log",
      "Company chat with a room for each department, and private messages",
    ],
  },
];

export const WHOLESALE: OperationContent = {
  slug: "wholesale",
  name: "Wholesale",
  label: "Wholesale",
  tagline: "Source directly. Check every package. Sell on to distributors.",
  intro:
    "For companies that source supplies directly from sellers, such as unused test strips, pumps and sensors, and sell them on to distributors. Everything from the first quotation to the last payment lives in one record.",
  forWhom: "You quote sellers, receive their packages and sell what you collect to distributors.",
  day: [
    "A seller offers supplies: you send a quotation, with a free shipping label if you offer one.",
    "The package arrives. Receiving checks it and records what was really inside.",
    "If something differs, you send a corrected (adjustment) quotation. Then Accounts pays the seller.",
    "You sell on to distributors: they send you a purchase order, you send them an invoice.",
  ],
  depts: wholesaleDepts,
  cardPoints: [
    "Direct sourcing from sellers, with automatic quotations and a free shipping label",
    "Every package checked against its quotation, with recall and counterfeit holds",
    "Pay sellers once an order is accepted",
    "Sell on to distributors from stock you actually hold",
  ],
};

/** The Wholesale sourcing model, told once and shown on the home page, /wholesale and /both. Describes only what the software does today. */
export const DIRECT_SOURCING = {
  eyebrow: "Direct sourcing",
  title: "Source supplies directly from sellers, then sell on to distributors.",
  body:
    "Direct sourcing means you deal with the seller yourself, with no middleman in between. A seller offers supplies, you quote a price from your own list, the package comes to you, and your team checks it before anything is paid.",
  steps: [
    { title: "Quote the seller", body: "A quotation priced from your own product list, with condition, expiration and bonus rules applied for you, and a free prepaid shipping label if you offer one." },
    { title: "Check every package", body: "Receiving opens it against the quotation, photographs it and runs recall and counterfeit checks, so a person can hold anything that looks wrong." },
    { title: "Pay the seller", body: "Accounts pays only what you accepted, and keeps the payment records organized." },
    { title: "Sell on to distributors", body: "What you collect goes into your own stock, and you sell it on with sales orders and invoices." },
  ],
};

export const DISTRIBUTION: OperationContent = {
  slug: "distribution",
  name: "Distribution",
  label: "Distribution",
  tagline: "Buy from wholesalers. Sell to pharmacies. Be ready for an audit.",
  intro:
    "For companies that buy from wholesalers with purchase orders and sell to pharmacies and other retail outlets. Orders, bills, stock and audit answers all come from the same record.",
  forWhom: "You send purchase orders to suppliers and invoice pharmacies and other retail outlets.",
  day: [
    "A wholesaler sends you an invoice (a price offer) for what you want.",
    "You send them back a purchase order. If something is wrong, you send a revision.",
    "The goods arrive and Receiving checks them against the order.",
    "You sell to pharmacies and other retail outlets: they send you a purchase order, you send them an invoice.",
  ],
  depts: distributionDepts,
  cardPoints: [
    "Purchase orders with numbered revisions, never silent edits",
    "Receiving checks every delivery against the order, with recall and counterfeit holds",
    "Supplier Bills approved before payment is recorded",
    "Audit Center for pharmacy, PBM and regulatory audits",
  ],
};

export const BOTH: OperationContent = {
  slug: "both",
  name: "Both together",
  label: "Both",
  tagline: "Run Wholesale and Distribution under one sign-in, each completely separate.",
  intro:
    "Some companies source directly from sellers and also distribute to pharmacies. Run both in one place: each side has its own customers, suppliers, products, orders, stock and payments, and your people switch between them with a click.",
  forWhom: "You do both, whether as one company or as two separate LLCs.",
  day: [
    "Pick the side you are working in. Each side only shows the tabs that fit how it works.",
    "Staff can be assigned to one side or the other, so people only see their own.",
    "Owners and Admins of both sides get an Overall status page with totals only, never the other side's records.",
  ],
  depts: [],
  cardPoints: [
    "Two separate workspaces, one sign-in",
    "One LLC or two: each with its own business details and approval when they differ",
    "Overall status for owners and admins, totals only",
    "Staff assigned to one side or the other",
  ],
};

/** The questions "Both" answers, in plain words. */
export const BOTH_POINTS: { title: string; body: string }[] = [
  {
    title: "Completely separate records",
    body: "Wholesale and Distribution are separate workspaces. Customers, suppliers, products, orders, stock and payments of one side never mix with the other.",
  },
  {
    title: "One company or two LLCs",
    body: "If the two sides are different LLCs, each gives its own EIN, state file number and proof document and is approved on its own. The other side keeps working meanwhile.",
  },
  {
    title: "Overall status, totals only",
    body: "Owners and Admins of both sides can open one read-only page that shows totals from each side, and nothing underneath.",
  },
  {
    title: "The right people on the right side",
    body: "Assign each person to Wholesale or Distribution. Roles still decide which departments they can open.",
  },
  {
    title: "Only the tabs that fit",
    body: "Wholesale hides Purchase Orders and Suppliers. Distribution hides Quotations, Customers and the quotation setup tabs. Owners and Admins can show every tab if they want.",
  },
  {
    title: "Price shown on the home page",
    body: "Running both costs a set percentage more than running one operation. The current price is always the one on our pricing section.",
  },
];

export const OPERATIONS: Record<OperationSlug, OperationContent> = { wholesale: WHOLESALE, distribution: DISTRIBUTION, both: BOTH };

// ---------------------------------------------------------------------------------------------------------------------
// Who it is for, and the recall / counterfeit checks (home page and the three pages).

export type Audience = { icon: IconName; title: string; body: string };

export const AUDIENCES: Audience[] = [
  {
    icon: "building",
    title: "Owners who want everything in one place",
    body: "Stop switching between spreadsheets, mailboxes, label sites and accounting. One record for the whole company, and a home screen that shows what needs you today.",
  },
  {
    icon: "shield",
    title: "Companies that can't afford a recalled or counterfeit item",
    body: "If you buy and sell medical supplies, one bad lot can cost you a customer or a license. jindjinni checks every item as it arrives and holds anything that looks wrong.",
  },
  {
    icon: "receiving",
    title: "Wholesalers who source directly",
    body: "Packages from sellers you have never met are where problems start. Every one is opened against its quotation, photographed and checked before you pay the seller.",
  },
  {
    icon: "distribution",
    title: "Distributors who sell to pharmacies",
    body: "Pharmacies, PBMs and regulators ask questions. Keep orders, invoices, lot numbers and audit answers in one place so you can answer quickly.",
  },
  {
    icon: "team",
    title: "Growing teams of up to 100 people",
    body: "Give each person the departments their job needs and nothing more. Turn access off the moment someone leaves.",
  },
];

export type Check = { icon: IconName; title: string; body: string };

/** Each line is something the software does today (receiving-recall*.ts, receiving-serial-rules.ts, inventory-service.ts). */
export const SAFETY_CHECKS: Check[] = [
  {
    icon: "bell",
    title: "Recall lists checked on every scan and every save",
    body: "Your admin loads each product's recall lot and serial lists. Every number is checked against them, including look-alike characters such as O and 0, and an exact hit marks the item for return at once.",
  },
  {
    icon: "check",
    title: "A shipment can't be submitted until the recall check is done",
    body: "Each product needs its recall check recorded before the shipment can be closed. Where no list exists, your team looks the number up on the maker's own page and records the answer.",
  },
  {
    icon: "shield",
    title: "Suspicious serial numbers are held, not waved through",
    body: "Repeated numbers anywhere in your history (both units are flagged), made-up numbers, bad barcode check digits and wrong formats where the maker's format is known all put the item on hold. Only an Owner or Admin can release it.",
  },
  {
    icon: "inventory",
    title: "Held items never become sellable stock",
    body: "Items from Receiving that are recalled, suspect or going back are kept out of Inventory's live stock, and Sales sells only from live stock.",
  },
  {
    icon: "megaphone",
    title: "A new recall list re-checks everything you already received",
    body: "When your admin loads a new list, every lot and serial number you ever received is compared with it, and you get the items and order numbers that match. Lot & Serial Tracker shows who sent each lot.",
  },
  {
    icon: "home",
    title: "Industry watch on your home screen",
    body: "FDA recall records and announcements from the makers of the brands you buy appear under Needs your attention, marked Official FDA record or From the maker.",
  },
];

export const SAFETY_LIMITS =
  "These checks flag and hold; they can't prove anything is real. A clean result never means a product is genuine, safe, unexpired or recall-free, and the recall lists are the ones your company loads. Your people make the final call, and Jin, our built-in assistant, never says otherwise.";

/** Words that must never appear in marketing copy (checked by scripts/landing-content.test.ts). */
export const BANNED_WORDS = ["guarantee", "100%", "never miss", "catch every", "foolproof", "risk-free", "risk free", "bulletproof"];

export const HOW_SECTION = {
  eyebrow: "How you work",
  title: "Pick your side. See exactly what you get.",
  body: "Wholesale and Distribution work differently, so jindjinni shows each one only the tabs that fit. Choose yours to see every department, or see how running both works.",
};
