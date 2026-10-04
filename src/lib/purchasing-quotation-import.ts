// Quotation Summary -> Import. Turns an uploaded sheet (the same nine columns
// as the old Airtable "OVERALL ORDERS" table) into a plan: which rows are new,
// which already exist and are skipped, which have a problem. Pure functions --
// nothing here touches the database, so it can be previewed safely and tested.

import { findColumn, type ParsedSheet } from "@/lib/spreadsheet-import";

export const IMPORT_TEMPLATE_HEADERS = [
  "Date",
  "Customer Reference Number",
  "Customer Name",
  "Customer Email",
  "Customer Phone Number",
  "Total Price",
  "Shipping Info",
  "Items Quoted for",
  "Order Tracking Number",
];

export const IMPORT_TEMPLATE_SAMPLE = [
  "09/10/2026",
  "A430807C",
  "Katrina Daniel",
  "katrina@example.com",
  "(555) 010-0123",
  "$765.00",
  "602 Chase Ave Apt C, Chase City, VA 23924",
  "Accu-Chek Guide x 10 boxes",
  "1Z999AA10123456784",
];

export const MAX_IMPORT_ROWS = 3000;

const COLUMN_ALIASES = {
  date: ["date", "quotation date", "order date", "quoted on"],
  reference: ["customer reference number", "reference number", "reference #", "reference", "order reference", "quotation number", "quotation #", "ref #", "ref"],
  name: ["customer name", "name", "full name"],
  email: ["customer email", "email", "email address"],
  phone: ["customer phone number", "customer phone", "phone number", "phone", "telephone"],
  total: ["total price", "total", "order total", "amount", "total amount"],
  shipping: ["shipping info", "shipping address", "address", "customer address"],
  items: ["items quoted for", "items quoted", "items", "products", "product list"],
  tracking: ["order tracking number", "tracking number", "tracking #", "tracking", "customer tracking number"],
} as const;
type ColumnKey = keyof typeof COLUMN_ALIASES;

export type ImportColumns = Record<ColumnKey, string | null>;

export function mapImportColumns(headers: string[]): { columns: ImportColumns; missing: string[] } {
  const columns = Object.fromEntries(
    (Object.keys(COLUMN_ALIASES) as ColumnKey[]).map((k) => [k, findColumn(headers, [...COLUMN_ALIASES[k]])]),
  ) as ImportColumns;
  const missing: string[] = [];
  if (!columns.reference) missing.push("Customer Reference Number");
  if (!columns.name) missing.push("Customer Name");
  if (!columns.total) missing.push("Total Price");
  return { columns, missing };
}

export type Carrier = "UPS" | "USPS" | "FedEx" | "Other";

/** Same idea as the Airtable "Detected Carrier" helper: guess the carrier from the shape of the tracking number. */
export function detectCarrier(tracking: string): Carrier {
  const t = tracking.replace(/\s+/g, "").toUpperCase();
  if (/^1Z[0-9A-Z]{16}$/.test(t)) return "UPS";
  if (/^(94|93|92|91|95)\d{18,24}$/.test(t) || /^[A-Z]{2}\d{9}US$/.test(t) || /^420\d{5}(94|93|92)\d{18,22}$/.test(t)) return "USPS";
  if (/^\d{12}$/.test(t) || /^\d{15}$/.test(t) || /^\d{20}$/.test(t) || /^96\d{20}$/.test(t)) return "FedEx";
  return "Other";
}

export function normalizeTracking(raw: string | undefined | null): string {
  return (raw ?? "").replace(/[\s ]+/g, "").toUpperCase();
}

/** "$1,060.00", "$\t765.00", "765" -> number; anything else -> null. */
export function parseMoney(raw: string | undefined | null): number | null {
  const cleaned = (raw ?? "").replace(/[$,\s ]/g, "");
  if (cleaned === "") return null;
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round((n + Number.EPSILON) * 100) / 100 : null;
}

/** M/D/YYYY, MM/DD/YYYY, M-D-YY, or YYYY-MM-DD -> "YYYY-MM-DD", or null if it isn't a real date. */
export function parseImportDate(raw: string | undefined | null): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  let y: number, m: number, d: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/.exec(s);
  if (match) {
    y = +match[1]; m = +match[2]; d = +match[3];
  } else if ((match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/.exec(s))) {
    m = +match[1]; d = +match[2]; y = +match[3];
    if (match[3].length === 2) y += 2000;
  } else {
    return null;
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export type ParsedAddress = { street1: string; city: string; state: string; zip: string; parsed: boolean };

/** "602 Chase Ave Apt C, CHASE CITY, VA 23924" (or "Palm Coast FL, 32164-6748") -> street / city / state / ZIP, parsed from the right. */
export function parseShippingAddress(raw: string | undefined | null): ParsedAddress {
  const s = (raw ?? "").replace(/\s+/g, " ").trim();
  const empty: ParsedAddress = { street1: s, city: "", state: "", zip: "", parsed: false };
  if (!s) return empty;
  const m = /^(.*?)[,\s]+([A-Za-z]{2})[,\s]+(\d{5}(?:-\d{4})?)$/.exec(s);
  if (!m) return empty;
  const rest = m[1].replace(/[,\s]+$/, "");
  const comma = rest.lastIndexOf(",");
  if (comma === -1) return empty;
  const street1 = rest.slice(0, comma).trim();
  const city = rest.slice(comma + 1).trim();
  if (!street1 || !city) return empty;
  return { street1, city, state: m[2].toUpperCase(), zip: m[3], parsed: true };
}

export function splitName(full: string): { firstName: string; lastName: string } {
  const t = full.replace(/\s+/g, " ").trim();
  const i = t.indexOf(" ");
  return i === -1 ? { firstName: t, lastName: "" } : { firstName: t.slice(0, i), lastName: t.slice(i + 1) };
}

export function formatPhone(raw: string | undefined | null): string {
  const t = (raw ?? "").trim().replace(/\.0+$/, "");
  const digits = t.replace(/\D/g, "");
  if (/^\d{10}$/.test(t) || (digits.length === 10 && /^[\d\s()+.-]+$/.test(t) && !/[()]/.test(t) && !/-/.test(t))) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return t;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ImportRow = {
  rowNumber: number;
  reference: string;
  date: string;
  name: string;
  email: string | null;
  phone: string | null;
  total: number;
  shippingRaw: string;
  address: ParsedAddress;
  itemsText: string;
  tracking: string;
  carrier: Carrier | null;
  warnings: string[];
};

export type ImportPlanEntry =
  | { status: "new"; row: ImportRow }
  | { status: "duplicate"; rowNumber: number; reference: string; reason: string }
  | { status: "error"; rowNumber: number; reference: string; reason: string };

export type ImportExisting = {
  /** lower-cased quotation numbers already in this company's Quotation Summary */
  references: Set<string>;
  /** normalised tracking numbers already in this company's Quotation Summary */
  trackingNumbers: Set<string>;
};

export type ImportPlan =
  | { ok: false; error: string }
  | { ok: true; entries: ImportPlanEntry[]; counts: { total: number; new: number; duplicate: number; error: number } };

export function planQuotationImport(sheet: ParsedSheet, existing: ImportExisting, todayIso: string): ImportPlan {
  if (sheet.rows.length === 0) return { ok: false, error: "That file doesn't have any data rows." };
  if (sheet.rows.length > MAX_IMPORT_ROWS) {
    return { ok: false, error: `That file has ${sheet.rows.length} rows. Import up to ${MAX_IMPORT_ROWS} at a time -- split it into smaller files.` };
  }
  const { columns, missing } = mapImportColumns(sheet.headers);
  if (missing.length > 0) {
    return {
      ok: false,
      error: `Couldn't find the ${missing.join(", ")} column${missing.length > 1 ? "s" : ""}. Found: ${sheet.headers.join(", ") || "(no headers)"}. Download the template to see the expected columns.`,
    };
  }
  const get = (row: Record<string, string>, key: ColumnKey) => (columns[key] ? (row[columns[key]!] ?? "") : "");

  const seenRefs = new Set<string>();
  const seenTracking = new Set<string>();
  const entries: ImportPlanEntry[] = [];

  sheet.rows.forEach((raw, i) => {
    const rowNumber = i + 2; // header is row 1
    const reference = get(raw, "reference").replace(/\s+/g, " ").trim();
    const name = get(raw, "name").replace(/\s+/g, " ").trim();
    const totalRaw = get(raw, "total");

    // Completely empty line -> ignore quietly.
    if (!reference && !name && !totalRaw.trim() && !get(raw, "tracking").trim()) return;

    if (!reference) return void entries.push({ status: "error", rowNumber, reference: "", reason: "Missing Customer Reference Number." });
    if (reference.length > 60) return void entries.push({ status: "error", rowNumber, reference, reason: "Reference number is too long (60 characters max)." });
    if (!name) return void entries.push({ status: "error", rowNumber, reference, reason: "Missing Customer Name." });
    const total = parseMoney(totalRaw);
    if (total === null) return void entries.push({ status: "error", rowNumber, reference, reason: `Total Price "${totalRaw.trim()}" isn't a valid amount.` });
    if (total < 0) return void entries.push({ status: "error", rowNumber, reference, reason: "Total Price can't be negative." });

    const tracking = normalizeTracking(get(raw, "tracking"));
    const refKey = reference.toLowerCase();
    if (existing.references.has(refKey)) {
      return void entries.push({ status: "duplicate", rowNumber, reference, reason: "Reference number is already in the Quotation Summary." });
    }
    if (seenRefs.has(refKey)) {
      return void entries.push({ status: "duplicate", rowNumber, reference, reason: "Reference number appears more than once in this file." });
    }
    if (tracking && existing.trackingNumbers.has(tracking)) {
      return void entries.push({ status: "duplicate", rowNumber, reference, reason: "Tracking number is already on another quotation." });
    }
    if (tracking && seenTracking.has(tracking)) {
      return void entries.push({ status: "duplicate", rowNumber, reference, reason: "Tracking number appears more than once in this file." });
    }

    const warnings: string[] = [];
    const dateRaw = get(raw, "date");
    let date = parseImportDate(dateRaw);
    if (!date) {
      date = todayIso;
      warnings.push(dateRaw.trim() ? `Date "${dateRaw.trim()}" wasn't recognised, so today's date was used.` : "No date, so today's date was used.");
    }
    let email: string | null = get(raw, "email").trim().toLowerCase() || null;
    if (email && !EMAIL_RE.test(email)) {
      warnings.push(`Email "${email}" doesn't look valid, so it was left blank.`);
      email = null;
    }
    const phone = formatPhone(get(raw, "phone")) || null;
    const shippingRaw = get(raw, "shipping").replace(/\s+/g, " ").trim();
    const address = parseShippingAddress(shippingRaw);
    if (!shippingRaw) warnings.push("No shipping address.");
    else if (!address.parsed) warnings.push("Shipping address couldn't be split into street/city/state/ZIP; it's kept as written.");

    seenRefs.add(refKey);
    if (tracking) seenTracking.add(tracking);
    entries.push({
      status: "new",
      row: {
        rowNumber,
        reference,
        date,
        name,
        email,
        phone,
        total,
        shippingRaw,
        address,
        itemsText: get(raw, "items").replace(/\r/g, "").trim(),
        tracking,
        carrier: tracking ? detectCarrier(tracking) : null,
        warnings,
      },
    });
  });

  const counts = {
    total: entries.length,
    new: entries.filter((e) => e.status === "new").length,
    duplicate: entries.filter((e) => e.status === "duplicate").length,
    error: entries.filter((e) => e.status === "error").length,
  };
  if (counts.total === 0) return { ok: false, error: "That file doesn't have any usable rows." };
  return { ok: true, entries, counts };
}
