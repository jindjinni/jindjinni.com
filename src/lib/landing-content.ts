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
    line: "From a seller's offer to a clear quote.",
    points: [
      "Quotations from your own price list",
      "Free shipping labels, if you offer them",
      "A private, one-time link for a seller to share their payment details",
    ],
  },
  {
    dept: "Receiving",
    icon: "receiving",
    line: "Know what is in the box.",
    points: [
      "Every package checked",
      "Doubtful items held",
    ],
  },
  {
    dept: "Accounts",
    icon: "accounts",
    line: "Pay sellers. Collect from distributors.",
    points: [
      "What to pay, and what you are owed",
      "A seller's bank details are encrypted, shown only to Accounts, and erased once you pay",
      "Monthly reports",
    ],
  },
  {
    dept: "Customer Service",
    icon: "support",
    line: "Keep customers informed.",
    points: [
      "Reviewed before it is sent",
      "Every message on record",
    ],
  },
  {
    dept: "Inventory",
    icon: "inventory",
    line: "Know what you can sell.",
    points: [
      "Live stock",
      "A full history",
    ],
  },
  {
    dept: "Sales",
    icon: "tag",
    line: "Sell on to distributors.",
    points: [
      "Orders in, invoices out",
      "One record",
    ],
  },
  {
    dept: "Shipping",
    icon: "distribution",
    line: "Ship it and follow it.",
    points: [
      "Labels and tracking",
      "One notice to your buyer",
    ],
  },
  {
    dept: "Marketing, HR and Chat",
    icon: "chat",
    line: "Run the team around the work.",
    points: [
      "Email and text campaigns",
      "Time and attendance",
      "Company chat",
    ],
  },
];

const distributionDepts: DeptBlock[] = [
  {
    dept: "Purchasing",
    icon: "purchasing",
    line: "Buy from wholesalers.",
    points: [
      "Purchase orders, with every change on record",
      "Suppliers in one place",
    ],
  },
  {
    dept: "Receiving",
    icon: "receiving",
    line: "Check every delivery.",
    points: [
      "Checked against the order",
      "Doubtful items held",
    ],
  },
  {
    dept: "Accounts",
    icon: "accounts",
    line: "Know what you owe and what you are owed.",
    points: [
      "Supplier Bills approved before payment",
      "Audit Center for pharmacy, PBM and regulatory audits",
    ],
  },
  {
    dept: "Customer Service",
    icon: "support",
    line: "Keep pharmacies informed.",
    points: [
      "Reviewed before it is sent",
      "Every message on record",
    ],
  },
  {
    dept: "Inventory",
    icon: "inventory",
    line: "Know what you can sell.",
    points: [
      "Live stock",
      "A full history",
    ],
  },
  {
    dept: "Sales",
    icon: "tag",
    line: "Sell to pharmacies and other retail outlets.",
    points: [
      "Orders in, invoices out",
      "One record",
    ],
  },
  {
    dept: "Shipping",
    icon: "distribution",
    line: "Ship it and follow it.",
    points: [
      "Labels and tracking",
      "One notice to your buyer",
    ],
  },
  {
    dept: "Marketing, HR and Chat",
    icon: "chat",
    line: "Run the team around the work.",
    points: [
      "Email and text campaigns",
      "Time and attendance",
      "Company chat",
    ],
  },
];

export const WHOLESALE: OperationContent = {
  slug: "wholesale",
  name: "Wholesale",
  label: "Wholesale",
  tagline: "Source directly. Check every package. Sell on to distributors.",
  intro:
    "For companies that source supplies directly from sellers, such as unused test strips, pumps and sensors, and sell them on to distributors. One record, from the first quotation to the last payment.",
  forWhom: "You quote sellers, receive their packages and sell what you collect to distributors.",
  day: [
    "A seller offers supplies, and you send a quotation.",
    "The package arrives and is checked.",
    "If something differs, you send a correction, then pay the seller.",
    "You sell on to distributors.",
  ],
  depts: wholesaleDepts,
  cardPoints: [
    "Direct sourcing from sellers",
    "Every package checked",
    "Pay sellers once an order is accepted",
    "Sell on to distributors",
  ],
};

/** The Wholesale sourcing model, told once and shown on the home page, /wholesale and /both. Describes only what the software does today. */
export const DIRECT_SOURCING = {
  eyebrow: "Direct sourcing",
  title: "Source supplies directly from sellers, then sell on to distributors.",
  body: "Direct sourcing means you deal with the seller yourself, with no middleman in between.",
  steps: [
    { title: "Quote the seller", body: "Send a quotation, with a free shipping label if you like." },
    { title: "Check every package", body: "Anything that looks wrong is held for a person to decide." },
    { title: "Pay the seller", body: "Pay what you accepted, to the account the seller gave you through a private, one-time link." },
    { title: "Sell on to distributors", body: "Sell what you collect, with an invoice." },
  ],
};

export const DISTRIBUTION: OperationContent = {
  slug: "distribution",
  name: "Distribution",
  label: "Distribution",
  tagline: "Buy from wholesalers. Sell to pharmacies. Be ready for an audit.",
  intro:
    "For companies that buy from wholesalers and sell to pharmacies and other retail outlets. Orders, bills, stock and audit answers come from one record.",
  forWhom: "You send purchase orders to suppliers and invoice pharmacies and other retail outlets.",
  day: [
    "A wholesaler sends you an invoice.",
    "You send back a purchase order.",
    "The goods arrive and are checked.",
    "You sell to pharmacies and other retail outlets.",
  ],
  depts: distributionDepts,
  cardPoints: [
    "Purchase orders, with changes on record",
    "Every delivery checked",
    "Bills approved before payment",
    "Audit Center for audits",
  ],
};

export const BOTH: OperationContent = {
  slug: "both",
  name: "Both together",
  label: "Both",
  tagline: "Run Wholesale and Distribution under one sign-in, each completely separate.",
  intro:
    "Some companies source directly from sellers and also distribute to pharmacies. Run both in one place, each side kept completely separate.",
  forWhom: "You do both, whether as one company or as two separate LLCs.",
  day: [
    "Pick the side you are working in.",
    "Assign each person to one side or the other.",
    "Owners and Admins see overall totals, never the other side's records.",
  ],
  depts: [],
  cardPoints: [
    "Two separate workspaces, one sign-in",
    "One LLC or two",
    "Overall totals for owners and admins",
    "Staff assigned to a side",
  ],
};

/** The questions "Both" answers, in plain words. */
export const BOTH_POINTS: { title: string; body: string }[] = [
  {
    title: "Completely separate records",
    body: "Wholesale and Distribution are separate workspaces. Nothing mixes between the two.",
  },
  {
    title: "One company or two LLCs",
    body: "If the two sides are different LLCs, each is approved on its own.",
  },
  {
    title: "Overall status, totals only",
    body: "Owners and Admins of both sides can see totals from each side, and nothing underneath.",
  },
  {
    title: "The right people on the right side",
    body: "Assign each person to Wholesale or Distribution.",
  },
];

export const OPERATIONS: Record<OperationSlug, OperationContent> = { wholesale: WHOLESALE, distribution: DISTRIBUTION, both: BOTH };

// ---------------------------------------------------------------------------------------------------------------------
// Who it is for, and the recall / counterfeit checks (home page and the three pages).

export type Audience = { icon: IconName; title: string; body: string };

export const AUDIENCES: Audience[] = [
  {
    icon: "home",
    title: "Small and family businesses",
    body: "Still running on pen and paper? Start with a layout made for your industry. There is nothing to design and nothing to set up from scratch.",
  },
  {
    icon: "building",
    title: "Owners who want everything in one place",
    body: "Stop switching between tools. One record for the whole company.",
  },
  {
    icon: "shield",
    title: "Medical supply companies that can't afford a bad item",
    body: "One bad lot can cost you a customer or a license. In the medical supply layout, jindjinni checks every item and holds anything that looks wrong.",
  },
  {
    icon: "receiving",
    title: "Medical wholesalers who source directly",
    body: "Packages from strangers are where problems start. Every one is checked before you pay the seller.",
  },
  {
    icon: "distribution",
    title: "Medical distributors who sell to pharmacies",
    body: "Pharmacies, PBMs and regulators ask questions. Keep the answers in one place.",
  },
  {
    icon: "team",
    title: "Growing teams of up to 100 people",
    body: "Give each person only the access their job needs.",
  },
];

export type Check = { icon: IconName; title: string; body: string };

/** Kept general on purpose: what the checks are for, never how they work. */
export const SAFETY_CHECKS: Check[] = [
  {
    icon: "bell",
    title: "Recall checks on what comes in",
    body: "Items are checked against your recall lists as they arrive.",
  },
  {
    icon: "shield",
    title: "Suspicious items are held",
    body: "Anything that looks wrong waits for a person to decide.",
  },
  {
    icon: "inventory",
    title: "Held items are never sold",
    body: "Held items stay out of the stock you can sell.",
  },
  {
    icon: "home",
    title: "Industry news on your home screen",
    body: "Recall news for the brands you buy, where you will see it.",
  },
];

export const SAFETY_LIMITS =
  "These checks flag and hold; they can't prove anything is real. A clean result never means a product is genuine, safe, unexpired or recall-free, and the recall lists are the ones your company loads. Your people make the final call, and Jin, our built-in assistant, never says otherwise.";

/** Words that must never appear in marketing copy (checked by scripts/landing-content.test.ts). */
export const BANNED_WORDS = ["guarantee", "100%", "never miss", "catch every", "foolproof", "risk-free", "risk free", "bulletproof"];

export const HOW_SECTION = {
  eyebrow: "Medical supplies, available now",
  title: "Pick your side. See exactly what you get.",
  body: "Medical supply companies work in different ways, so each sees only what fits. Choose yours, or see how running both works.",
};

// ---------------------------------------------------------------------------------------------------------------------
// Choose your industry (home page). Only medical supplies is open today; the second card says so plainly and names no other industry,
// because none is promised until it ships.

export type Industry = { name: string; status: string; live: boolean; body: string; href?: string; cta?: string };

export const INDUSTRIES = {
  eyebrow: "Choose your industry",
  title: "Software that fits the way your business really runs.",
  body: "Every business buys, sells, stores and tracks something. Pick your industry and jindjinni sets up the departments, steps and checks that industry actually uses, so you start with a working layout instead of a blank page.",
  steps: [
    { title: "Choose your industry", body: "Tell us what kind of business you run." },
    { title: "Get a layout built for it", body: "Your departments, menus and steps are ready on day one." },
    { title: "Run your day in one place", body: "Enter it once, and everyone on your team sees it." },
  ],
  cards: [
    {
      name: "Medical supplies",
      status: "Available now",
      live: true,
      body: "Buy, check, store and sell medical supplies, as a Wholesale company, a Distribution company or both. Recall and counterfeit checks are built in.",
      href: "#how",
      cta: "See the medical supply layouts",
    },
    {
      name: "More industries",
      status: "Coming soon",
      live: false,
      body: "We are building layouts for other businesses that buy, sell and store goods. Each one will start with the departments that industry uses.",
    },
  ] satisfies Industry[],
};
