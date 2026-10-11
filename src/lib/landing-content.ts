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
    line: "Turn a seller's offer into a clear quote, fast.",
    points: [
      "Quotations built from your own price list",
      "A free shipping label, if you choose to offer one",
      "Every package followed until it lands",
    ],
  },
  {
    dept: "Receiving",
    icon: "receiving",
    line: "Know what is really in the box.",
    points: [
      "Every package checked against its quote",
      "Anything that looks wrong is held, never waved through",
      "Corrections put to the seller in writing",
    ],
  },
  {
    dept: "Accounts",
    icon: "accounts",
    line: "Pay sellers for what you accepted, and collect from distributors.",
    points: [
      "See what is ready to pay and what is overdue",
      "See what your distributors owe you",
      "A report when the month closes",
    ],
  },
  {
    dept: "Customer Service",
    icon: "support",
    line: "One calm place for everything you tell customers.",
    points: [
      "Messages are written for review and sent only when a person says so",
      "A record of what went out",
      "Nobody is told twice",
    ],
  },
  {
    dept: "Inventory",
    icon: "inventory",
    line: "Only what you can really sell counts as stock.",
    points: [
      "Live stock by product, condition and expiry",
      "Held items stay out of sellable stock",
      "A history of everything in and out",
    ],
  },
  {
    dept: "Sales",
    icon: "tag",
    line: "Sell on to distributors from stock you really hold.",
    points: [
      "Orders in, invoices out, one record",
      "Compare prices before you commit",
    ],
  },
  {
    dept: "Shipping",
    icon: "distribution",
    line: "Ship what you sold and watch it arrive.",
    points: [
      "Labels from your own shipping account",
      "Tracking in one place",
      "A shipped notice to your buyer, reviewed first",
    ],
  },
  {
    dept: "Marketing, HR and Chat",
    icon: "chat",
    line: "Run the team around the work.",
    points: [
      "Reach your contacts by email and text",
      "Time and attendance, kept simple",
      "Company chat, with a room for every department",
    ],
  },
];

const distributionDepts: DeptBlock[] = [
  {
    dept: "Purchasing",
    icon: "purchasing",
    line: "Buy from wholesalers with purchase orders.",
    points: [
      "Purchase orders to each supplier, with every change on the record",
      "Supplier list and product catalog in one place",
      "Shipments followed until they arrive",
    ],
  },
  {
    dept: "Receiving",
    icon: "receiving",
    line: "Check what arrives against the order before you pay.",
    points: [
      "Every delivery checked against its order",
      "Doubtful or recalled items are held, never waved through",
      "Trace any lot back to whoever sent it",
    ],
  },
  {
    dept: "Accounts",
    icon: "accounts",
    line: "Know what you owe and what you are owed.",
    points: [
      "Supplier Bills approved before they are paid",
      "What pharmacies owe you, and what is overdue",
      "Audit Center: answer pharmacy, PBM and regulatory audits from your own invoices",
    ],
  },
  {
    dept: "Customer Service",
    icon: "support",
    line: "Keep pharmacies informed, once and in writing.",
    points: [
      "Notices written for review and sent only when a person says so",
      "A record of every message sent",
    ],
  },
  {
    dept: "Inventory",
    icon: "inventory",
    line: "Stock you can stand behind.",
    points: [
      "Live stock by product, condition and expiry",
      "Held items stay out of sellable stock",
      "A history of everything in and out",
    ],
  },
  {
    dept: "Sales",
    icon: "tag",
    line: "Sell to pharmacies and other retail outlets.",
    points: [
      "Orders in, invoices out, one record",
      "A record for every buyer",
      "Sell only from the stock you hold",
    ],
  },
  {
    dept: "Shipping",
    icon: "distribution",
    line: "Get orders out with a clear record.",
    points: [
      "Shipments, boxes and returns in one place",
      "Labels from your own shipping account",
      "A reviewed shipped notice for each shipment",
    ],
  },
  {
    dept: "Marketing, HR and Chat",
    icon: "chat",
    line: "Run the team around the work.",
    points: [
      "Reach your contacts by email and text",
      "Time and attendance, kept simple",
      "Company chat, with a room for every department",
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
    { title: "Quote the seller", body: "A quotation built from your own price list, with a free shipping label if you offer one." },
    { title: "Check every package", body: "Receiving opens it against the quotation, and anything that looks wrong is held for a person to decide." },
    { title: "Pay the seller", body: "Accounts pays what you accepted and keeps the records tidy." },
    { title: "Sell on to distributors", body: "What you collect goes into your own stock, and you sell it on with an invoice." },
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
    title: "Recall lists checked as items come in",
    body: "Your admin loads each product's recall lists, and every number is checked against them. A match marks the item for return at once.",
  },
  {
    icon: "check",
    title: "A shipment can't be submitted until the recall check is done",
    body: "Each product needs its recall check recorded before the shipment can be closed. Where there is no list, your team checks the maker's own page and records the answer.",
  },
  {
    icon: "shield",
    title: "Suspicious serial numbers are held, not waved through",
    body: "Repeated, made-up or wrongly formed numbers put the item on hold until a senior person reviews it.",
  },
  {
    icon: "inventory",
    title: "Held items never become sellable stock",
    body: "Recalled, suspect or returning items stay out of live stock, and Sales sells only from live stock.",
  },
  {
    icon: "megaphone",
    title: "A new recall list re-checks everything you already received",
    body: "When a new list is loaded, everything you have ever received is compared with it, and you get the matches.",
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
