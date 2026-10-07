// Exact, rule-based checks Jin uses instead of guessing: NDC numbers, GTIN/UPC barcodes, GS1 barcode text (lot, serial,
// expiry) and lot/serial formats the platform owner has recorded for a brand. Pure functions: no database, no network.
//
// What they can and cannot say: a check can show that a number is badly formed, that a check digit is wrong, or that it
// does NOT fit a recorded format. A pass only means "well formed". It never means a product is genuine, safe or
// unexpired-in-the-real-world, and the wording of every result says so.

// ---------------------------------------------------------------- NDC

export type NdcFormat = { pattern: "4-4-2" | "5-3-2" | "5-4-1" | "5-4-2"; hyphenated: string; eleven: string };
export type NdcResult =
  | { ok: true; kind: "10-digit" | "11-digit" | "ambiguous"; formats: NdcFormat[]; notes: string[] }
  | { ok: false; error: string };

const digitsOnly = (s: string) => /^\d+$/.test(s);

/** Reads an NDC (National Drug Code), with or without hyphens, and shows the usual 10- and 11-digit spellings. */
export function checkNdc(raw: string): NdcResult {
  const text = raw.trim().replace(/^ndc[\s:#-]*/i, "").trim();
  if (!text) return { ok: false, error: "No number was given." };
  if (!/^[\d\s-]+$/.test(text)) return { ok: false, error: "An NDC has only digits and hyphens." };
  const notes = [
    "The labeler (first part) is assigned by the FDA and the product and package parts by the labeler, so a well-formed NDC does not prove the product is real or that the package is genuine.",
  ];
  if (/[-\s]/.test(text)) {
    const parts = text.split(/[-\s]+/).filter(Boolean);
    const shape = parts.map((p) => p.length).join("-");
    if (parts.length !== 3 || !parts.every(digitsOnly)) return { ok: false, error: "With hyphens, an NDC has three parts of digits, for example 12345-678-90 or 12345-6789-0." };
    if (shape === "4-4-2") return { ok: true, kind: "10-digit", formats: [{ pattern: "4-4-2", hyphenated: parts.join("-"), eleven: `0${parts[0]}-${parts[1]}-${parts[2]}` }], notes };
    if (shape === "5-3-2") return { ok: true, kind: "10-digit", formats: [{ pattern: "5-3-2", hyphenated: parts.join("-"), eleven: `${parts[0]}-0${parts[1]}-${parts[2]}` }], notes };
    if (shape === "5-4-1") return { ok: true, kind: "10-digit", formats: [{ pattern: "5-4-1", hyphenated: parts.join("-"), eleven: `${parts[0]}-${parts[1]}-0${parts[2]}` }], notes };
    if (shape === "5-4-2") return { ok: true, kind: "11-digit", formats: [{ pattern: "5-4-2", hyphenated: parts.join("-"), eleven: parts.join("-") }], notes };
    return { ok: false, error: `The parts are ${shape.replace(/-/g, ", ")} digits long. An NDC is 4-4-2, 5-3-2, 5-4-1 (10 digits) or 5-4-2 (11 digits).` };
  }
  if (!digitsOnly(text)) return { ok: false, error: "An NDC has only digits and hyphens." };
  if (text.length === 11) return { ok: true, kind: "11-digit", formats: [{ pattern: "5-4-2", hyphenated: `${text.slice(0, 5)}-${text.slice(5, 9)}-${text.slice(9)}`, eleven: `${text.slice(0, 5)}-${text.slice(5, 9)}-${text.slice(9)}` }], notes: [...notes, "Without hyphens an 11-digit number is read as the usual 5-4-2 billing format."] };
  if (text.length === 10) {
    const t = text;
    return {
      ok: true,
      kind: "ambiguous",
      formats: [
        { pattern: "4-4-2", hyphenated: `${t.slice(0, 4)}-${t.slice(4, 8)}-${t.slice(8)}`, eleven: `0${t.slice(0, 4)}-${t.slice(4, 8)}-${t.slice(8)}` },
        { pattern: "5-3-2", hyphenated: `${t.slice(0, 5)}-${t.slice(5, 8)}-${t.slice(8)}`, eleven: `${t.slice(0, 5)}-0${t.slice(5, 8)}-${t.slice(8)}` },
        { pattern: "5-4-1", hyphenated: `${t.slice(0, 5)}-${t.slice(5, 9)}-${t.slice(9)}`, eleven: `${t.slice(0, 5)}-${t.slice(5, 9)}-0${t.slice(9)}` },
      ],
      notes: [...notes, "Ten digits without hyphens could be any of three layouts. Look at the printed hyphens on the package, or look the labeler up, to know which one it is."],
    };
  }
  if (text.length === 12) return { ok: false, error: "That is 12 digits, which is the length of a UPC barcode, not an NDC. Try the barcode check instead." };
  return { ok: false, error: `That is ${text.length} digits. An NDC has 10 or 11 digits.` };
}

// ---------------------------------------------------------------- GTIN / GS1

export type GtinResult = { ok: true; length: number; gtin14: string; checkDigit: number } | { ok: false; error: string; expectedCheckDigit?: number };

/** The GS1 check digit for the digits before it. */
function gs1CheckDigit(body: string): number {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const d = Number(body[body.length - 1 - i]);
    sum += d * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

/** Checks a GTIN (UPC-A 12, EAN-13, GTIN-14 or EAN-8): right length and a correct check digit. */
export function checkGtin(raw: string): GtinResult {
  const t = raw.replace(/[\s-]/g, "");
  if (!digitsOnly(t)) return { ok: false, error: "A barcode number has only digits." };
  if (![8, 12, 13, 14].includes(t.length)) return { ok: false, error: `That is ${t.length} digits. Barcode numbers are 8, 12, 13 or 14 digits.` };
  const expected = gs1CheckDigit(t.slice(0, -1));
  if (expected !== Number(t.slice(-1))) return { ok: false, error: `The last digit should be ${expected} for this number. A wrong check digit usually means a typing or scanning mistake, or a made-up number.`, expectedCheckDigit: expected };
  return { ok: true, length: t.length, gtin14: t.padStart(14, "0"), checkDigit: expected };
}

export type Gs1Field = { ai: string; name: string; value: string; note?: string };
export type Gs1Result = { ok: true; fields: Gs1Field[]; warnings: string[]; expiry: string | null; gtin: string | null; lot: string | null; serial: string | null } | { ok: false; error: string };

const AI_NAMES: Record<string, string> = { "01": "GTIN", "10": "Lot / batch", "11": "Production date", "15": "Best before", "17": "Expiration date", "21": "Serial number" };
const FIXED_LEN: Record<string, number> = { "01": 14, "11": 6, "15": 6, "17": 6 };
const GS = "\u001d";

/** YYMMDD from a GS1 barcode to an ISO date. A day of 00 means the last day of that month. Returns null when impossible. */
export function gs1Date(yymmdd: string): string | null {
  if (!/^\d{6}$/.test(yymmdd)) return null;
  const yy = Number(yymmdd.slice(0, 2));
  const mm = Number(yymmdd.slice(2, 4));
  let dd = Number(yymmdd.slice(4, 6));
  if (mm < 1 || mm > 12) return null;
  const year = 2000 + yy;
  const last = new Date(Date.UTC(year, mm, 0)).getUTCDate();
  if (dd === 0) dd = last;
  if (dd > last) return null;
  return `${year}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

/** Reads the text of a GS1 barcode (a medical-device or drug label barcode): "(01)...(17)...(10)...(21)..." or the raw scan. */
export function parseGs1(raw: string): Gs1Result {
  const text = raw.trim();
  if (!text) return { ok: false, error: "No barcode text was given." };
  const pairs: [string, string][] = [];
  const warnings: string[] = [];
  if (text.includes("(")) {
    const re = /\((\d{2,4})\)([^(]*)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) pairs.push([m[1], m[2].trim()]);
    if (pairs.length === 0 || text.split("(")[0].trim() !== "" || pairs.some(([, v]) => v === "")) return { ok: false, error: "I couldn't read that as barcode text. It should look like (01)00812345678901(17)271231(10)LOT123." };
  } else {
    let i = 0;
    while (i < text.length) {
      const ai = text.slice(i, i + 2);
      i += 2;
      if (FIXED_LEN[ai]) {
        pairs.push([ai, text.slice(i, i + FIXED_LEN[ai])]);
        i += FIXED_LEN[ai];
      } else if (ai === "10" || ai === "21") {
        const end = text.indexOf(GS, i);
        const stop = end === -1 ? text.length : end;
        pairs.push([ai, text.slice(i, stop)]);
        i = end === -1 ? text.length : end + 1;
        if (end === -1 && i >= text.length && pairs.length > 0) warnings.push("Without separators, a lot or serial number is assumed to run to the end of the text.");
      } else {
        return { ok: false, error: `I don't recognise the code "${ai}" in that text. Paste it with the parentheses, like (01)...(17)...(10)..., if you can.` };
      }
    }
  }
  const fields: Gs1Field[] = [];
  let expiry: string | null = null;
  let gtin: string | null = null;
  let lot: string | null = null;
  let serial: string | null = null;
  for (const [ai, value] of pairs) {
    const f: Gs1Field = { ai, name: AI_NAMES[ai] ?? `Code ${ai}`, value };
    if (ai === "01") {
      gtin = value;
      const g = checkGtin(value);
      f.note = g.ok ? "check digit is correct" : g.error;
      if (!g.ok) warnings.push(`GTIN: ${g.error}`);
    } else if (ai === "17" || ai === "15" || ai === "11") {
      const d = gs1Date(value);
      f.note = d ? `= ${d}${value.endsWith("00") ? " (end of that month)" : ""}` : "not a real date";
      if (!d) warnings.push(`${f.name}: ${value} is not a real date.`);
      if (ai === "17" && d) expiry = d;
    } else if (ai === "10") {
      lot = value;
      if (value.length > 20) warnings.push("A lot number is at most 20 characters; this is longer.");
    } else if (ai === "21") {
      serial = value;
      if (value.length > 20) warnings.push("A serial number is at most 20 characters; this is longer.");
    }
    fields.push(f);
  }
  return { ok: true, fields, warnings, expiry, gtin, lot, serial };
}

/** "expired 3 months ago" / "expires in 5 months" for an ISO date. */
export function describeExpiry(iso: string, today: string): string {
  const days = Math.round((Date.parse(iso + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 86_400_000);
  if (days < 0) return `expired ${-days} day${days === -1 ? "" : "s"} ago (${iso})`;
  if (days === 0) return `expires today (${iso})`;
  const months = Math.floor(days / 30);
  return months >= 2 ? `expires in about ${months} months (${iso})` : `expires in ${days} day${days === 1 ? "" : "s"} (${iso})`;
}

// ---------------------------------------------------------------- recorded lot / serial formats

/**
 * A format written in plain symbols so nobody needs to know regular expressions:
 *   9 = one digit, A = one letter, X = one letter or digit, anything else (like - or /) must appear as typed.
 * Example: "A9999999" or "99A9A999-9". Several formats can be given, one per line or separated by |.
 */
export function parseFormats(text: string): string[] {
  return text
    .split(/[\n|]/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

export function validateFormat(f: string): string | null {
  if (f.length < 3 || f.length > 40) return `"${f}" should be 3 to 40 characters long.`;
  if (!/^[A-Z0-9\-/._]+$/.test(f)) return `"${f}" can use only 9, A, X and the symbols - / . _`;
  if (!/[9AX]/.test(f)) return `"${f}" needs at least one 9, A or X.`;
  return null;
}

export function matchesFormat(value: string, format: string): boolean {
  const v = value.trim().toUpperCase();
  if (v.length !== format.length) return false;
  for (let i = 0; i < format.length; i++) {
    const f = format[i];
    const c = v[i];
    if (f === "9") {
      if (!/[0-9]/.test(c)) return false;
    } else if (f === "A") {
      if (!/[A-Z]/.test(c)) return false;
    } else if (f === "X") {
      if (!/[A-Z0-9]/.test(c)) return false;
    } else if (f !== c) return false;
  }
  return true;
}

/** The ways a typed or spoken code might be meant: as given, and with spaces removed ("A B 1 2 3" said aloud). */
export function codeVariants(raw: string): string[] {
  const base = raw.trim().replace(/\b(dash|hyphen)\b/gi, "-").replace(/\s*-\s*/g, "-");
  const tight = base.replace(/\s+/g, "");
  return [...new Set([base.toUpperCase(), tight.toUpperCase()].filter(Boolean))];
}

export type FormatEntry = { title: string; brand: string | null; kind: "lot" | "serial"; formats: string[]; verifiedOn: string | null };

export type LotSerialResult = {
  valueChecked: string[];
  /** Entries whose recorded format the value fits. */
  fits: { title: string; format: string; verifiedOn: string | null }[];
  /** How many recorded formats were tried, so "no match" can be put in context. */
  triedFormats: number;
  verdict: "fits_recorded_format" | "does_not_fit_recorded_formats" | "no_recorded_formats";
};

/** Compares a lot or serial number to the formats recorded for the brand. A fit is not proof of anything; a miss is only a prompt to look closer. */
export function checkLotOrSerial(raw: string, entries: FormatEntry[]): LotSerialResult {
  const variants = codeVariants(raw);
  const fits: LotSerialResult["fits"] = [];
  let tried = 0;
  for (const e of entries) {
    for (const f of e.formats) {
      tried++;
      if (variants.some((v) => matchesFormat(v, f))) fits.push({ title: e.title, format: f, verifiedOn: e.verifiedOn });
    }
  }
  return { valueChecked: variants, fits, triedFormats: tried, verdict: tried === 0 ? "no_recorded_formats" : fits.length ? "fits_recorded_format" : "does_not_fit_recorded_formats" };
}
