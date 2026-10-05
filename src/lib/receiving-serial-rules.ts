// Step 6 scanner rules: what a scan means and which signs of a counterfeit or bad label to look for.
// Pure functions only (no database), so they can be tested on their own and used in the browser and on the server.
//
// What this can and cannot do, plainly: manufacturers (Dexcom, Abbott, Insulet ...) do not publish the list of serial
// numbers they have made, so the app can never CONFIRM a serial is real. It can catch the common signs of a fake or
// re-boxed product: the same serial twice (in this shipment or any earlier one), a serial that is made up or the wrong
// shape for the brand, a product code (GTIN) that fails its own check digit, and lots / serials on a recall list.

import { normalizeNumber, parseGs1, type Gs1 } from "@/lib/receiving-recall";

// ---- brands and product kinds ------------------------------------------------------

export type BrandRule = {
  brand: string;
  /** Lower-case words in a product name that mean this brand. */
  keywords: string[];
};

/** The brands the company buys today. A product name that matches none of these still works; it just gets the general checks. */
export const BRAND_RULES: BrandRule[] = [
  { brand: "Dexcom", keywords: ["dexcom", "g6", "g7", "stelo"] },
  { brand: "FreeStyle (Abbott)", keywords: ["freestyle", "free style", "libre", "abbott"] },
  { brand: "Omnipod (Insulet)", keywords: ["omnipod", "insulet"] },
  { brand: "Medtronic", keywords: ["medtronic", "minimed", "guardian", "simplera", "enlite"] },
  { brand: "Accu-Chek (Roche)", keywords: ["accu-chek", "accu chek", "accuchek", "roche", "guide me", "guide link", "aviva", "fastclix"] },
  { brand: "OneTouch (LifeScan)", keywords: ["onetouch", "one touch", "lifescan", "verio", "delica"] },
  { brand: "Contour (Ascensia)", keywords: ["contour", "ascensia", "bayer"] },
  { brand: "Tandem", keywords: ["tandem", "t:slim", "tslim", "mobi", "t slim"] },
  { brand: "BD", keywords: ["bd ", "becton", "ultra-fine", "ultrafine", "nano pen"] },
  { brand: "True Metrix (Trividia)", keywords: ["true metrix", "truemetrix", "trividia", "truetrack", "true track"] },
];

export function brandFor(productName: string): string | null {
  const n = ` ${productName.toLowerCase()} `;
  for (const b of BRAND_RULES) if (b.keywords.some((k) => n.includes(k))) return b.brand;
  return null;
}

/** What kind of product this is, from its name. Decides whether a serial number is normally on the label. */
export type ProductKind = "SERIALIZED" | "LOT_ONLY" | "UNKNOWN";

const SERIAL_WORDS = ["sensor", "receiver", "transmitter", "meter", "monitor", "reader", "controller", "pump", "pen "];
const LOT_WORDS = ["strip", "lancet", "needle", "syringe", "cartridge", "reservoir", "pod", "infusion", "set", "solution", "control", "swab", "tape", "adhesive", "patch", "overpatch"];

export function productKind(productName: string): ProductKind {
  const n = ` ${productName.toLowerCase()} `;
  // Test strips are named after meters ("Contour Next strips"), so the lot-only words win over the serial words.
  if (LOT_WORDS.some((w) => new RegExp(`\\b${w}s?\\b`).test(n))) return "LOT_ONLY";
  if (SERIAL_WORDS.some((w) => n.includes(w))) return "SERIALIZED";
  return "UNKNOWN";
}

// ---- flags ---------------------------------------------------------------------------

export const SERIAL_FLAGS = [
  "DUPLICATE_SHIPMENT",
  "DUPLICATE_PRIOR",
  "BAD_FORMAT",
  "PLACEHOLDER",
  "BAD_GTIN",
  "RECALLED",
  "NO_SERIAL",
  "MIXED_GTIN",
  "EXPIRED",
] as const;
export type SerialFlag = (typeof SERIAL_FLAGS)[number];

export const FLAG_LABELS: Record<SerialFlag, string> = {
  DUPLICATE_SHIPMENT: "Same serial twice in this shipment",
  DUPLICATE_PRIOR: "Serial received before",
  BAD_FORMAT: "Serial looks wrong for this brand",
  PLACEHOLDER: "Serial looks made up",
  BAD_GTIN: "Product code (GTIN) is not valid",
  RECALLED: "On a recall list",
  NO_SERIAL: "No serial number on this scan",
  MIXED_GTIN: "Different product code than the earlier scan",
  EXPIRED: "Expired",
};

/** The flags that mean "stop and review this one" (a likely fake, or a recalled product). The rest are things to look at. */
export const STOP_FLAGS: readonly SerialFlag[] = ["DUPLICATE_SHIPMENT", "DUPLICATE_PRIOR", "BAD_FORMAT", "PLACEHOLDER", "BAD_GTIN", "RECALLED", "EXPIRED"];
/** Of the stop flags, the ones that point at a counterfeit rather than a recall or an expiry date. */
export const COUNTERFEIT_FLAGS: readonly SerialFlag[] = ["DUPLICATE_SHIPMENT", "DUPLICATE_PRIOR", "BAD_FORMAT", "PLACEHOLDER", "BAD_GTIN"];

export function flagsToString(flags: SerialFlag[]): string {
  return flags.length ? [...new Set(flags)].join(",") : "OK";
}
export function flagsFromString(s: string | null | undefined): SerialFlag[] {
  if (!s || s === "OK") return [];
  return s.split(",").filter((f): f is SerialFlag => (SERIAL_FLAGS as readonly string[]).includes(f));
}
export type Severity = "ok" | "warn" | "stop";
export function severityOf(flags: SerialFlag[]): Severity {
  if (flags.some((f) => STOP_FLAGS.includes(f))) return "stop";
  return flags.length ? "warn" : "ok";
}
export const isCounterfeitSuspect = (flags: SerialFlag[]) => flags.some((f) => COUNTERFEIT_FLAGS.includes(f));

// ---- reading a scan ------------------------------------------------------------------

/** True when the digits are a valid GTIN (8, 12, 13 or 14 digits) -- the last digit is a check digit that fake labels often get wrong. */
export function gtinValid(gtin: string): boolean {
  if (!/^\d+$/.test(gtin) || ![8, 12, 13, 14].includes(gtin.length)) return false;
  const digits = gtin.split("").map(Number);
  const check = digits.pop()!;
  let sum = 0;
  digits.reverse().forEach((d, i) => {
    sum += d * (i % 2 === 0 ? 3 : 1);
  });
  return (10 - (sum % 10)) % 10 === check;
}

export type ScanKind = "AUTO" | "SERIAL" | "LOT";

export type ParsedScan = {
  gtin?: string;
  lot?: string;
  serial?: string;
  /** YYYY-MM-DD */
  expiry?: string;
  /** True when the text was a GS1 barcode (with AI codes), false when it was a plain code or typed number. */
  gs1: boolean;
};

/**
 * Turns what the scanner / camera / keyboard gave into lot, serial, GTIN and expiry.
 * A GS1 barcode (the DataMatrix / Code 128 on medical packaging) carries all four. A plain code is one number: a bare
 * 12-14 digit code with a valid check digit is a product code (GTIN); anything else is a serial or a lot, decided by
 * the Serial / Lot choice on the screen, or in Auto mode by the kind of product.
 */
export function parseScan(text: string, opts: { kind?: ScanKind; productName?: string } = {}): ParsedScan | null {
  const t = text.trim();
  if (!t) return null;
  const g: Gs1 | null = parseGs1(t);
  if (g) return { ...g, gs1: true };
  const plain = t.split(/[\s,;|]+/).filter(Boolean);
  if (plain.length === 0) return null;
  const token = plain.length === 1 ? plain[0] : plain.join("");
  const norm = normalizeNumber(token);
  if (!norm) return null;
  if (/^\d{12,14}$/.test(norm) && gtinValid(norm) && (opts.kind ?? "AUTO") === "AUTO") return { gtin: norm, gs1: false };
  const kind = opts.kind ?? "AUTO";
  if (kind === "LOT") return { lot: norm, gs1: false };
  if (kind === "SERIAL") return { serial: token.trim(), gs1: false };
  return productKind(opts.productName ?? "") === "SERIALIZED" ? { serial: token.trim(), gs1: false } : { lot: norm, gs1: false };
}

// ---- checks that need no database ----------------------------------------------------

/** Serials that are obviously typed in, not printed: all one character, a run of 1234.., or a word like TEST / NONE. */
export function looksMadeUp(serialNorm: string): boolean {
  if (serialNorm.length < 4) return true;
  if (/^(.)\1+$/.test(serialNorm)) return true;
  if (/^(TEST|NONE|NULL|NA|NOSERIAL|UNKNOWN|SAMPLE|DEMO|XXXX|TBD|TEMP)/.test(serialNorm) && !/\d{4}/.test(serialNorm.replace(/^[A-Z]+/, ""))) return true;
  const run = serialNorm.replace(/[^0-9]/g, "");
  if (run.length === serialNorm.length && run.length >= 5) {
    const up = "01234567890123456789";
    const down = "98765432109876543210";
    if (up.includes(run) || down.includes(run)) return true;
  }
  return false;
}

export type BrandFormatResult = { ok: true } | { ok: false; why: string };

/**
 * Format rules for serials we are sure of. Today that is the FreeStyle Libre 3 sensor serial printed on the kit
 * (9 characters, never starting with T, no B, I, O or S -- the same description the Abbott lookup gives). Everything
 * else only gets the general checks, because a wrong "format rule" would reject real product.
 */
export function brandSerialFormat(productName: string, serialNorm: string): BrandFormatResult {
  const n = productName.toLowerCase();
  if (/libre\s*3/.test(n)) {
    if (serialNorm.length !== 9) return { ok: false, why: `Libre 3 sensor serials have 9 characters; this has ${serialNorm.length}.` };
    if (serialNorm.startsWith("T")) return { ok: false, why: "Libre 3 sensor serials never start with T." };
    if (/[BIOS]/.test(serialNorm)) return { ok: false, why: "Libre 3 sensor serials never contain B, I, O or S." };
  }
  return { ok: true };
}

export type ScanContext = {
  productName: string;
  /** GTINs already scanned on this same row. */
  rowGtins?: string[];
  /** The date to compare expiry with, YYYY-MM-DD. */
  today: string;
};

/** The flags that can be worked out from the scan alone. Duplicate and recall flags need the database and are added by the server. */
export function inspectScan(p: ParsedScan, ctx: ScanContext): { flags: SerialFlag[]; notes: string[] } {
  const flags: SerialFlag[] = [];
  const notes: string[] = [];
  if (p.gtin && !gtinValid(p.gtin)) {
    flags.push("BAD_GTIN");
    notes.push(`The product code ${p.gtin} fails its own check digit, so the label was not printed by the manufacturer's system.`);
  }
  if (p.gtin && ctx.rowGtins && ctx.rowGtins.length > 0 && !ctx.rowGtins.includes(p.gtin)) {
    flags.push("MIXED_GTIN");
    notes.push(`Product code ${p.gtin} is different from the one scanned earlier on this product (${ctx.rowGtins[0]}). Check these are the same product.`);
  }
  if (p.serial) {
    const sn = normalizeNumber(p.serial);
    if (looksMadeUp(sn)) {
      flags.push("PLACEHOLDER");
      notes.push(`Serial ${p.serial} looks typed in, not printed (all the same character, counting up, or a placeholder word).`);
    } else {
      const f = brandSerialFormat(ctx.productName, sn);
      if (!f.ok) {
        flags.push("BAD_FORMAT");
        notes.push(f.why);
      }
    }
  } else if (productKind(ctx.productName) === "SERIALIZED" && (p.lot || p.gtin) && p.gs1) {
    flags.push("NO_SERIAL");
    notes.push("This product normally has a serial number, but the barcode has none. Scan or photograph the serial on the label.");
  }
  if (p.expiry && p.expiry < ctx.today) {
    flags.push("EXPIRED");
    notes.push(`Expired ${p.expiry}.`);
  }
  return { flags, notes };
}

/**
 * Which row a scan belongs to when the agent has not picked one: the row that already has this product code, then the row
 * with this lot number. Returns null when nothing matches (the selected row is used).
 */
export function rowForScan(
  p: ParsedScan,
  rows: { id: string; lotNumber: string; lots: { lotNumber: string }[] }[],
  gtinsByRow: Record<string, string[]>,
): string | null {
  if (p.gtin) {
    const hit = rows.find((r) => (gtinsByRow[r.id] ?? []).includes(p.gtin!));
    if (hit) return hit.id;
  }
  if (p.lot) {
    const lot = normalizeNumber(p.lot);
    const hit = rows.find((r) => normalizeNumber(r.lotNumber) === lot || r.lots.some((l) => normalizeNumber(l.lotNumber) === lot));
    if (hit) return hit.id;
  }
  return null;
}
