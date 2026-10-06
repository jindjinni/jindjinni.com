// Lot and serial numbers as lists: reading a comma-separated list the receiver typed, and picking lot / serial candidates
// out of the text a photo reader found. Pure functions (no database, no browser), so they run in the browser, on the
// server and in tests.
//
// A photo reader never gives certainty: it can misread an 8 as a B. Everything that comes from a photo is only a
// CANDIDATE. The receiver confirms or fixes each number before it is saved, and every saved number is then checked
// for repeats and against the recall lists on the server.

import { normalizeNumber, parseGs1 } from "@/lib/receiving-recall";

export const MAX_NUMBERS = 500;
export const MAX_NUMBER_LENGTH = 60;
/** How many numbers one save call handles. The screen sends a long list in several calls so none of them times out. */
export const BATCH_CHUNK = 20;

export type NumberEntry = { lot?: string; serial?: string; gtin?: string; expiry?: string };

/**
 * Splits what the receiver typed or pasted into separate numbers. Commas, semicolons and line breaks separate numbers;
 * a space does NOT (some lots are printed with spaces, "PH1U 0103 2521"). Blank pieces are dropped and a number that
 * appears twice is kept once (compared without spaces or dashes, ignoring case).
 */
export function splitNumberList(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of String(text ?? "").split(/[,;\n\r\t|]+/)) {
    const v = raw.trim().replace(/\s+/g, " ").slice(0, MAX_NUMBER_LENGTH);
    if (!v) continue;
    const key = normalizeNumber(v);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(v);
    if (out.length >= MAX_NUMBERS) break;
  }
  return out;
}

/** Joins numbers back into the comma-separated form shown on screen. */
export function joinNumberList(values: string[]): string {
  return values.join(", ");
}

/** Adds numbers to a typed list without repeating any that are already there. */
export function mergeNumberLists(existing: string, extra: string[]): string {
  return joinNumberList(splitNumberList([existing, ...extra].filter(Boolean).join(",")));
}

export type PhotoCandidates = {
  lots: string[];
  serials: string[];
  /** Number-like text with no "LOT" or "SN" label next to it: the receiver decides whether it is a lot, a serial or nothing. */
  unsure: string[];
  /** Serial -> lot, for units whose own barcode carried both. */
  pairs: Record<string, string>;
  /** Product codes (GTIN) read from barcodes. */
  gtins: string[];
  /** Expiry dates read from barcodes, serial or lot -> YYYY-MM-DD. */
  expiries: Record<string, string>;
};

const NOT_A_NUMBER = /^(?:LOT|SN|SERIAL|NUMBER|BATCH|EXPIRES?|EXPIRATION|MANUFACTURED|STERILE|DEXCOM|FREESTYLE|OMNIPOD|ABBOTT|INSULET|SENSOR|RECEIVER|TRANSMITTER)$/;

function clean(token: string): string {
  return token.replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/g, "").replace(/-{2,}/g, "-");
}

function plausible(token: string, minLen: number): boolean {
  if (token.length < minLen || token.length > MAX_NUMBER_LENGTH) return false;
  if (!/\d/.test(token)) return false; // every real lot / serial has at least one digit
  if (NOT_A_NUMBER.test(token)) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(token)) return false; // a date
  return true;
}

/** Reads one decoded barcode. A GS1 code gives lot, serial, product code and expiry together; a plain code is one unsure number. */
export function candidateFromBarcode(text: string): { entry: NumberEntry } | { plain: string } | null {
  const t = String(text ?? "").trim();
  if (!t) return null;
  const g = parseGs1(t);
  if (g && (g.lot || g.serial)) return { entry: { lot: g.lot, serial: g.serial, gtin: g.gtin, expiry: g.expiry } };
  if (g && g.gtin) return { entry: { gtin: g.gtin } };
  const plain = clean(t.toUpperCase().replace(/\s+/g, ""));
  return plain ? { plain } : null;
}

/**
 * Picks lot and serial candidates out of everything a photo reader found: decoded barcodes (exact) and printed text
 * (approximate). Printed text is read for "LOT 12345", "SN 98765", "S/N", "Serial No." and the GS1 printed forms
 * "(10)" and "(21)".
 */
export function extractCandidates(input: { barcodes?: string[]; text?: string }): PhotoCandidates {
  const lots = new Map<string, string>();
  const serials = new Map<string, string>();
  const unsure = new Map<string, string>();
  const gtins = new Set<string>();
  const pairs: Record<string, string> = {};
  const expiries: Record<string, string> = {};
  const addTo = (m: Map<string, string>, v: string) => {
    const key = normalizeNumber(v);
    if (key && !m.has(key)) m.set(key, v);
  };

  for (const code of input.barcodes ?? []) {
    const c = candidateFromBarcode(code);
    if (!c) continue;
    if ("plain" in c) {
      if (plausible(c.plain, 5)) addTo(unsure, c.plain);
      continue;
    }
    const { lot, serial, gtin, expiry } = c.entry;
    if (gtin) gtins.add(gtin);
    if (lot) addTo(lots, lot);
    if (serial) addTo(serials, serial);
    if (serial && lot) pairs[normalizeNumber(serial)] = lot;
    if (expiry) expiries[normalizeNumber(serial || lot || "")] = expiry;
  }

  // Printed text: upper case, one space between words, OCR's stray symbols removed.
  const text = String(input.text ?? "")
    .toUpperCase()
    .replace(/[|_~`'"“”‘’]/g, " ")
    .replace(/[ \t]+/g, " ");

  const gs1Lot = /\(\s*10\s*\)\s*([A-Z0-9-]{1,20})/g;
  const gs1Serial = /\(\s*21\s*\)\s*([A-Z0-9-]{1,20})/g;
  const lotLabel = /(?:\bLOT(?:\s*(?:NO|NUMBER|NUM|#))?|\bBATCH(?:\s*(?:NO|NUMBER|#))?|\bL\/N)\s*[:.#-]?\s*([A-Z0-9][A-Z0-9-]{3,24})/g;
  const serialLabel = /(?:\bSN|\bS\/N|\bSERIAL(?:\s*(?:NO|NUMBER|NUM|#))?)\s*[:.#-]?\s*([A-Z0-9][A-Z0-9-]{4,24})/g;

  const taken = new Set<string>();
  const run = (re: RegExp, into: Map<string, string>, minLen: number) => {
    for (const m of text.matchAll(re)) {
      const v = clean(m[1]);
      if (!plausible(v, minLen)) continue;
      addTo(into, v);
      taken.add(normalizeNumber(v));
    }
  };
  run(gs1Lot, lots, 3);
  run(gs1Serial, serials, 5);
  run(lotLabel, lots, 4);
  run(serialLabel, serials, 5);

  // Anything else that looks like a long number with letters / digits mixed in.
  for (const m of text.matchAll(/[A-Z0-9][A-Z0-9-]{6,28}[A-Z0-9]/g)) {
    const v = clean(m[0]);
    const key = normalizeNumber(v);
    if (!plausible(v, 7) || taken.has(key) || lots.has(key) || serials.has(key) || unsure.has(key)) continue;
    if ((v.match(/\d/g) ?? []).length < 3) continue;
    unsure.set(key, v);
    if (unsure.size >= 80) break;
  }

  // A number found both as a barcode and as a labelled / unlabelled text must not be offered twice.
  for (const k of [...unsure.keys()]) if (lots.has(k) || serials.has(k)) unsure.delete(k);

  return {
    lots: [...lots.values()].slice(0, MAX_NUMBERS),
    serials: [...serials.values()].slice(0, MAX_NUMBERS),
    unsure: [...unsure.values()],
    pairs,
    gtins: [...gtins],
    expiries,
  };
}

/**
 * Turns the confirmed lot list and serial list into the units to save. A serial whose barcode also carried a lot keeps
 * that lot (so the unit shows both); every other serial is saved by itself, and every lot that no serial used is saved
 * as a lot on its own.
 */
export function buildEntries(lots: string[], serials: string[], pairs: Record<string, string> = {}, expiries: Record<string, string> = {}): NumberEntry[] {
  const out: NumberEntry[] = [];
  const usedLots = new Set<string>();
  for (const s of serials) {
    const key = normalizeNumber(s);
    const lot = pairs[key];
    const e: NumberEntry = { serial: s };
    if (lot && lots.some((l) => normalizeNumber(l) === normalizeNumber(lot))) {
      e.lot = lot;
      usedLots.add(normalizeNumber(lot));
    }
    if (expiries[key]) e.expiry = expiries[key];
    out.push(e);
  }
  for (const l of lots) {
    const key = normalizeNumber(l);
    if (usedLots.has(key)) continue;
    const e: NumberEntry = { lot: l };
    if (expiries[key]) e.expiry = expiries[key];
    out.push(e);
  }
  return out;
}
