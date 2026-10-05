// Test data for the platform owner's "Load 100 test orders" tool: fictional customers (every name starts with
// TEST), random fake tracking numbers, and the recall numbers used to try the recall checks. Everything here is
// deterministic by order number, so loading twice gives the same orders (and never duplicates).
//
// The recall numbers come from the manufacturers' / FDA's public recall notices (partial lists for Omnipod 5 --
// Insulet directs people to its own lot checker for the full list). Dexcom publishes no serial list for the G7
// receivers, so those are tested through the "official lookup" path instead.

export const TEST_ORDER_COUNT = 100;
export const TEST_PREFIX = "TEST";

/** Small seeded random numbers, so each order is always the same. */
export function seeded(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const FIRST = [
  "Maria", "James", "Linda", "Robert", "Patricia", "Michael", "Barbara", "William", "Elizabeth", "David", "Jennifer", "Richard",
  "Susan", "Joseph", "Karen", "Thomas", "Nancy", "Charles", "Lisa", "Daniel", "Betty", "Matthew", "Sandra", "Anthony", "Ashley",
  "Mark", "Emily", "Paul", "Donna", "Steven", "Carol", "Andrew", "Michelle", "Kenneth", "Amanda", "Joshua", "Melissa", "Kevin",
  "Deborah", "Brian", "Stephanie", "George", "Rebecca", "Edward", "Laura", "Ronald", "Sharon", "Timothy", "Cynthia", "Jason",
];
const LAST = [
  "Alvarez", "Brooks", "Chen", "Dawson", "Edwards", "Foster", "Garcia", "Hughes", "Iverson", "Jackson", "Kim", "Lopez", "Mitchell",
  "Nguyen", "Ortiz", "Patel", "Quinn", "Rivera", "Sanders", "Turner", "Underwood", "Vasquez", "Walker", "Xu", "Young", "Zimmerman",
  "Abbott", "Bennett", "Carter", "Diaz", "Ellis", "Fisher", "Grant", "Hayes", "Ingram", "Jenkins", "Keller", "Lawson", "Morgan",
  "Nelson", "Owens", "Powell", "Reed", "Stone", "Torres", "Underhill", "Vaughn", "Watson", "Yates", "Zhang",
];
const STREETS = [
  "Maple Ave", "Oak Street", "Cedar Lane", "Pine Road", "Elm Drive", "Lakeview Blvd", "Sunset Way", "Highland Ave", "Park Place",
  "River Road", "Willow Court", "Birch Street", "Chestnut Ave", "Magnolia Drive", "Hillcrest Road", "Meadow Lane", "Forest Ave",
  "Church Street", "Mill Road", "Spring Street",
];
const PLACES: [string, string, string][] = [
  ["Miami", "FL", "33101"], ["Orlando", "FL", "32801"], ["Tampa", "FL", "33602"], ["Atlanta", "GA", "30303"], ["Savannah", "GA", "31401"],
  ["Houston", "TX", "77002"], ["Dallas", "TX", "75201"], ["Austin", "TX", "78701"], ["Phoenix", "AZ", "85003"], ["Tucson", "AZ", "85701"],
  ["Los Angeles", "CA", "90012"], ["San Diego", "CA", "92101"], ["Sacramento", "CA", "95814"], ["Denver", "CO", "80202"],
  ["Chicago", "IL", "60601"], ["Springfield", "IL", "62701"], ["Detroit", "MI", "48226"], ["Columbus", "OH", "43215"],
  ["Cleveland", "OH", "44114"], ["Pittsburgh", "PA", "15222"], ["Philadelphia", "PA", "19103"], ["Newark", "NJ", "07102"],
  ["New York", "NY", "10007"], ["Buffalo", "NY", "14202"], ["Boston", "MA", "02108"], ["Charlotte", "NC", "28202"],
  ["Raleigh", "NC", "27601"], ["Nashville", "TN", "37203"], ["Memphis", "TN", "38103"], ["Louisville", "KY", "40202"],
  ["Indianapolis", "IN", "46204"], ["Milwaukee", "WI", "53202"], ["Minneapolis", "MN", "55401"], ["Kansas City", "MO", "64106"],
  ["St. Louis", "MO", "63101"], ["Seattle", "WA", "98104"], ["Portland", "OR", "97204"], ["Las Vegas", "NV", "89101"],
  ["Salt Lake City", "UT", "84101"], ["Baltimore", "MD", "21202"],
];

const pad = (n: number, w: number) => String(n).padStart(w, "0");

export type TestCustomer = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  street1: string;
  street2: string;
  city: string;
  state: string;
  zip: string;
  residential: boolean;
  reference: string;
};

/** Order number 1..100 -> a fictional customer. The name always starts with TEST. */
export function customerFor(i: number): TestCustomer {
  const r = seeded(i * 7 + 3);
  const [city, state, zip] = PLACES[Math.floor(r() * PLACES.length)];
  const first = FIRST[Math.floor(r() * FIRST.length)];
  const last = LAST[Math.floor(r() * LAST.length)];
  return {
    firstName: `${TEST_PREFIX} - ${first}`,
    lastName: last,
    email: `test.order${pad(i, 3)}@example.com`,
    phone: `(555) 01${pad(Math.floor(r() * 100), 2)}-${pad(i, 4)}`,
    street1: `${100 + Math.floor(r() * 8900)} ${STREETS[Math.floor(r() * STREETS.length)]}`,
    street2: r() < 0.25 ? `Apt ${1 + Math.floor(r() * 40)}` : "",
    city,
    state,
    zip,
    residential: r() < 0.7,
    reference: `${TEST_PREFIX}-${pad(i, 4)}`,
  };
}

/** A made-up tracking number in the shape of UPS / USPS / FedEx numbers. These are NOT real shipments. */
export function trackingFor(i: number): { carrier: "UPS" | "USPS" | "FedEx"; number: string } {
  const r = seeded(i * 13 + 5);
  const digits = (n: number) => Array.from({ length: n }, () => Math.floor(r() * 10)).join("");
  const alnum = (n: number) => Array.from({ length: n }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789"[Math.floor(r() * 34)]).join("");
  const pick = i % 3;
  if (pick === 0) return { carrier: "UPS", number: `1Z${alnum(16)}` };
  if (pick === 1) return { carrier: "USPS", number: `9400${digits(18)}` };
  return { carrier: "FedEx", number: digits(12) };
}

// ---- recall numbers ----------------------------------------------------------------------------------------------

/** Omnipod 5 lots named in the FDA recall record and Insulet's notice (a partial list; Insulet's checker has the rest). */
export const OMNIPOD_RECALLED_LOTS = [
  "PH1U01032521", "PH1U01102521", "PH1U12102421", "PH1U12172421", "PH1U11212421", "PH1U11252421",
  "PH1U11222421", "PH1U12092421", "PH1U09112421", "PH1U11262421", "PR1U01132621",
];
/** Lots that are NOT on the partial list above -- used to see the "not on the list we have" answer. */
export const OMNIPOD_OTHER_LOTS = ["PH1U03042699", "PH1U04152688", "PR1U02202677", "PH1U05302655"];

/** FreeStyle Libre 3 recalls: three lots (2024) and the Libre 3 / Libre 3 Plus lot lists from Abbott's notice. */
export const LIBRE3_RECALLED_LOTS = [
  "T60001948", "T60001966", "T60001969",
  "T60003054", "T60003085", "T60003088", "T60003089", "T60003092", "T60003099", "T60003113", "T60003136", "T60003159", "T60003160",
  "T60003271", "T60003284", "T60003374", "T60003375", "T60003391", "T60003564", "T60003426", "T60003628", "T60003434", "T60003646",
  "T60003507", "T60003534", "T60003546", "T60003547",
  "T60002984", "T60002994", "T60002995", "T60002996", "T60003007", "T60003009", "T60003010", "T60003138", "T60003243", "T60003255",
  "T60003348", "T60003352", "T60003366", "T60003369", "T60003377", "T60003378", "T60003379", "T60003384", "T60003398", "T60003400",
  "T60003404", "T60003446", "T60003449", "T60003454", "T60003455", "T60003460", "T60003470", "T60003471", "T60003473", "T60003478",
  "T60003479", "T60003480", "T60003481", "T60003488", "T60003490", "T60003491", "T60003492", "T60003494", "T60003496", "T60003497",
  "T60003498", "T60003518", "T60003542", "T60003543", "T60003544", "T60003550", "T60003552", "T60003560", "T60003562", "T60003563",
  "T60003567", "T60003568", "T60003570", "T60003573", "T60003575", "T60003576", "T60003585", "T60003589", "T60003592", "T60003596",
  "T60003601", "T60003611", "T60003617", "T60003618", "T60003619", "T60003631", "T60003639", "T60003641", "T60003683",
];
export const LIBRE3_OTHER_LOTS = ["T60009911", "T60008877", "T60004455", "T60007012"];

// ---- the 100 orders ----------------------------------------------------------------------------------------------

export type ProductPool = "STRIPS" | "SENSORS" | "OMNIPOD" | "LIBRE3" | "RECEIVER" | "MISC";
export type TestKind =
  | "PURCHASING_ONLY" // quoted, not received yet
  | "OPEN" // receiving started, not submitted
  | "CLEAN_PAID" // received exactly as quoted, paid by Accounts
  | "CLEAN_UNPAID" // received exactly as quoted, waiting to be paid
  | "SHORT_DRAFT" // fewer arrived; adjustment quotation started
  | "SHORT_FINAL" // fewer arrived; adjustment quotation finalised
  | "EXTRA" // a product that was not quoted arrived
  | "DAMAGED" // damaged box and a damaged product
  | "OMNIPOD_RECALL" // pod lots on the recall list
  | "LIBRE_RECALL" // Libre 3 lots on the recall list
  | "RECEIVER_LOOKUP" // Dexcom G7 receivers checked on Dexcom's page
  | "PACKAGING"; // packaging not acceptable

export type LineSpec = { pool: ProductPool; quantity: number };
export type Scenario = {
  index: number;
  kind: TestKind;
  lines: LineSpec[];
  /** Manual deduction on the quotation, if any. */
  deduction: { amount: number; reason: string } | null;
  /** Lot / serial number tried in the Purchasing quick check before quoting (recall orders). */
  quickCheck: string | null;
  /** For RECEIVER_LOOKUP: did Dexcom's page say the receiver is affected? */
  receiverAffected: boolean;
  /** For recall orders: use a recalled lot on the first line (true) or a lot that is not on the list (false). */
  recalledLot: boolean;
};

const ORDER_KINDS: TestKind[] = [
  ...Array<TestKind>(25).fill("PURCHASING_ONLY"), // 1-25
  ...Array<TestKind>(10).fill("OPEN"), // 26-35
  ...Array<TestKind>(10).fill("CLEAN_PAID"), // 36-45
  ...Array<TestKind>(10).fill("CLEAN_UNPAID"), // 46-55
  ...Array<TestKind>(5).fill("SHORT_DRAFT"), // 56-60
  ...Array<TestKind>(5).fill("SHORT_FINAL"), // 61-65
  ...Array<TestKind>(6).fill("EXTRA"), // 66-71
  ...Array<TestKind>(6).fill("DAMAGED"), // 72-77
  ...Array<TestKind>(8).fill("OMNIPOD_RECALL"), // 78-85
  ...Array<TestKind>(5).fill("LIBRE_RECALL"), // 86-90
  ...Array<TestKind>(4).fill("RECEIVER_LOOKUP"), // 91-94
  ...Array<TestKind>(6).fill("PACKAGING"), // 95-100
];

const BASIC_POOLS: ProductPool[] = ["STRIPS", "SENSORS", "MISC", "STRIPS", "OMNIPOD", "LIBRE3"];

export function scenarioFor(i: number): Scenario {
  const kind = ORDER_KINDS[i - 1] ?? "PURCHASING_ONLY";
  const r = seeded(i * 31 + 11);
  const qty = () => 1 + Math.floor(r() * 24);
  const lineCount = 1 + Math.floor(r() * 3); // 1-3 lines
  const lines: LineSpec[] = [];
  const mainPool: ProductPool =
    kind === "OMNIPOD_RECALL" ? "OMNIPOD" : kind === "LIBRE_RECALL" ? "LIBRE3" : kind === "RECEIVER_LOOKUP" ? "RECEIVER" : BASIC_POOLS[Math.floor(r() * BASIC_POOLS.length)];
  lines.push({ pool: mainPool, quantity: kind === "RECEIVER_LOOKUP" ? 1 + Math.floor(r() * 3) : qty() });
  const extraPools: ProductPool[] = ["STRIPS", "SENSORS", "MISC", "STRIPS"];
  for (let n = 1; n < lineCount; n++) lines.push({ pool: extraPools[Math.floor(r() * extraPools.length)], quantity: qty() });

  const withDeduction = i % 7 === 0;
  // Purchasing-only orders 1-12 are the "try the recall check before quoting" group.
  let quickCheck: string | null = null;
  let recalledLot = false;
  if (kind === "OMNIPOD_RECALL" || kind === "LIBRE_RECALL") {
    recalledLot = i % 4 !== 0; // most hit, some are clear
    const recalled = kind === "OMNIPOD_RECALL" ? OMNIPOD_RECALLED_LOTS : LIBRE3_RECALLED_LOTS;
    const other = kind === "OMNIPOD_RECALL" ? OMNIPOD_OTHER_LOTS : LIBRE3_OTHER_LOTS;
    quickCheck = recalledLot ? recalled[Math.floor(r() * recalled.length)] : other[Math.floor(r() * other.length)];
  }
  if (kind === "PURCHASING_ONLY" && i <= 12) {
    recalledLot = i % 2 === 1;
    const omni = i <= 6;
    lines[0] = { pool: omni ? "OMNIPOD" : "LIBRE3", quantity: lines[0].quantity };
    const recalled = omni ? OMNIPOD_RECALLED_LOTS : LIBRE3_RECALLED_LOTS;
    const other = omni ? OMNIPOD_OTHER_LOTS : LIBRE3_OTHER_LOTS;
    quickCheck = recalledLot ? recalled[Math.floor(r() * recalled.length)] : other[Math.floor(r() * other.length)];
  }
  return {
    index: i,
    kind,
    lines,
    deduction: withDeduction ? { amount: 5 + (i % 5) * 5, reason: "TEST: condition below what was described" } : null,
    quickCheck,
    receiverAffected: i % 2 === 1,
    recalledLot,
  };
}

/** Name patterns for the product pools (matched against the company's own product names). */
export const POOL_PATTERNS: Record<ProductPool, RegExp> = {
  STRIPS: /^(OneTouch Ultra|OneTouch Verio|Contour|Accu-Chek (Guide|Aviva Plus|Smartview)|True Metrix|Freestyle (Lite|Regular|Precision)).*\d+ct/i,
  SENSORS: /(Dexcom G7 (10|15) Day Sensor|Freestyle Libre (2|14 Day) Sensor|Dexcom G6 Sensors)/i,
  OMNIPOD: /^Omnipod(?!.*dash)/i,
  LIBRE3: /^(Freestyle |FreeStyle )?Libre 3 (Sensor|Plus)/i,
  RECEIVER: /G7 Receiver/i,
  MISC: /(BD Pen Needles|Medtronic (Quickset|Mio|Reservoirs)|T-slim|Autosoft)/i,
};

/** A steady test price for a product the company has not priced yet ($0), so quotes show real totals. */
export function testPriceFor(name: string): number {
  let h = 0;
  for (let n = 0; n < name.length; n++) h = (Math.imul(h, 31) + name.charCodeAt(n)) >>> 0;
  return 10 + (h % 8500) / 100; // $10.00 - $94.99
}
