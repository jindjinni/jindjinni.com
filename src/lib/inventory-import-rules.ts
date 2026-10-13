// Inventory -> Import Stock: reading a spreadsheet of what a company holds today (its opening stock) into stock lines.
// Pure: no database. The page shows what it read BEFORE anything is saved, the server reads the file again and re-checks
// every row when the person confirms, and a row with a problem is never saved by guessing.

import { createHash } from "node:crypto";
import { findColumn, type ParsedSheet } from "@/lib/spreadsheet-import";
import { matchProduct } from "@/lib/sales-rules";
import { normKey } from "@/lib/inventory-rules";

export const MAX_IMPORT_ROWS = 2000;
export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;

/** The columns we look for, with the headings people usually give them. */
export const STOCK_COLUMNS = {
  product: ["product", "product name", "item", "item name", "name", "description"],
  brand: ["brand", "category", "manufacturer"],
  condition: ["condition", "grade"],
  quantity: ["quantity", "qty", "units", "count", "on hand", "quantity on hand", "qty on hand"],
  expiration: ["expiration", "expiration date", "expiry", "expiry date", "exp", "exp date", "expires"],
  lot: ["lot", "lot number", "lot #", "lot no", "lot no."],
  cost: ["cost", "unit cost", "cost per unit", "cost each", "price paid", "paid per unit"],
  estLow: ["estimated low", "est low", "est. low", "estimated lowest price", "lowest price", "low"],
  estHigh: ["estimated high", "est high", "est. high", "estimated highest price", "highest price", "high"],
} as const;
export type StockField = keyof typeof STOCK_COLUMNS;
export type StockColumnMap = Record<StockField, string | null>;
export const STOCK_FIELDS = Object.keys(STOCK_COLUMNS) as StockField[];
export const FIELD_LABEL: Record<StockField, string> = {
  product: "Product", brand: "Brand", condition: "Condition", quantity: "Quantity", expiration: "Expiration date", lot: "Lot number", cost: "Cost per unit", estLow: "Estimated lowest price", estHigh: "Estimated highest price",
};

export function guessStockColumns(headers: string[]): StockColumnMap {
  const out = {} as StockColumnMap;
  for (const f of STOCK_FIELDS) out[f] = findColumn(headers, [...STOCK_COLUMNS[f]]);
  return out;
}

/** A map the person chose: keeps only headings that really are in the file. */
export function cleanColumnMap(headers: string[], chosen: Partial<Record<StockField, string | null | undefined>>): StockColumnMap {
  const out = {} as StockColumnMap;
  for (const f of STOCK_FIELDS) {
    const c = String(chosen[f] ?? "").trim();
    out[f] = c && headers.includes(c) ? c : null;
  }
  return out;
}

const clean = (v: unknown) => String(v ?? "").trim();

// ---- cells -------------------------------------------------------------------------------------------------------

export function parseQuantity(raw: string): { value: number | null; error?: string } {
  const s = clean(raw).replace(/[,\s]/g, "");
  if (!s) return { value: null, error: "the quantity is empty" };
  if (/^\d+(\.0+)?$/.test(s)) {
    const n = Math.round(Number(s));
    if (n < 1) return { value: null, error: "the quantity must be 1 or more" };
    if (n > 1_000_000) return { value: null, error: "the quantity is over 1,000,000" };
    return { value: n };
  }
  return { value: null, error: `the quantity "${clean(raw).slice(0, 20)}" isn't a whole number` };
}

/** A price in dollars: "$12.50", "12,50" is not guessed. Empty means "not given". */
export function parseMoney(raw: string, what: string): { value: number | null; error?: string } {
  const s = clean(raw).replace(/[$,\s]/g, "");
  if (!s) return { value: null };
  if (!/^\d+(\.\d+)?$/.test(s)) return { value: null, error: `${what} "${clean(raw).slice(0, 20)}" isn't a price` };
  const n = Number(s);
  if (!Number.isFinite(n) || n > 10_000_000) return { value: null, error: `${what} is too large` };
  return { value: Math.round(n * 10000) / 10000 };
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const monthNumber = (w: string): number | null => MONTHS[w.slice(0, 4).toLowerCase()] ?? MONTHS[w.slice(0, 3).toLowerCase()] ?? null;
const pad = (n: number) => String(n).padStart(2, "0");
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const realDate = (y: number, m: number, d: number) => y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= lastDay(y, m);
const year = (s: string) => (s.length === 2 ? 2000 + Number(s) : Number(s));

/**
 * An expiration date in the shapes people really type: 2027-05-31, 2027-05, 5/31/2027, 5/31/27, 05/2027, 05/27 (month and year),
 * May 2027, May 31, 2027, 31 May 2027, or an Excel date number. A month without a day means the last day of that month.
 * Empty is fine (no expiration date). Anything else is an error, never a guess.
 */
export function parseStockDate(raw: string): { date: string | null; error?: string } {
  const s = clean(raw);
  if (!s) return { date: null };
  const bad = { date: null, error: `the expiration date "${s.slice(0, 24)}" isn't a date (use 2027-05-31 or 05/2027)` };
  let m: RegExpExecArray | null;
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(s))) return realDate(+m[1], +m[2], +m[3]) ? { date: `${m[1]}-${pad(+m[2])}-${pad(+m[3])}` } : bad;
  if ((m = /^(\d{4})[-/](\d{1,2})$/.exec(s))) return realDate(+m[1], +m[2], 1) ? { date: `${m[1]}-${pad(+m[2])}-${pad(lastDay(+m[1], +m[2]))}` } : bad;
  if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s))) {
    const y = year(m[3]);
    return realDate(y, +m[1], +m[2]) ? { date: `${y}-${pad(+m[1])}-${pad(+m[2])}` } : bad;
  }
  if ((m = /^(\d{1,2})[/.-](\d{4}|\d{2})$/.exec(s))) {
    const y = year(m[2]);
    return realDate(y, +m[1], 1) ? { date: `${y}-${pad(+m[1])}-${pad(lastDay(y, +m[1]))}` } : bad;
  }
  if ((m = /^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(s))) {
    const mo = monthNumber(m[1]);
    return mo && realDate(+m[3], mo, +m[2]) ? { date: `${m[3]}-${pad(mo)}-${pad(+m[2])}` } : bad;
  }
  if ((m = /^(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})$/.exec(s))) {
    const mo = monthNumber(m[2]);
    return mo && realDate(+m[3], mo, +m[1]) ? { date: `${m[3]}-${pad(mo)}-${pad(+m[1])}` } : bad;
  }
  if ((m = /^([A-Za-z]{3,9})\.?,?\s+(\d{4})$/.exec(s))) {
    const mo = monthNumber(m[1]);
    return mo && realDate(+m[2], mo, 1) ? { date: `${m[2]}-${pad(mo)}-${pad(lastDay(+m[2], mo))}` } : bad;
  }
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    // Excel's day number (1900 system): 25569 is 1970-01-01.
    const n = Math.floor(Number(s));
    if (n >= 36526 && n <= 73415) {
      const d = new Date(Date.UTC(1970, 0, 1) + (n - 25569) * 86400000);
      return { date: d.toISOString().slice(0, 10) };
    }
  }
  return bad;
}

// ---- rows --------------------------------------------------------------------------------------------------------

export type ImportProduct = { id: string; name: string; brand: string; noExpiration: boolean };

export type ImportRow = {
  /** The row's number in the spreadsheet (the heading row is 1). */
  rowNo: number;
  rawProduct: string;
  productId: string | null;
  productName: string | null;
  brand: string | null;
  noExpiration: boolean;
  condition: string;
  quantity: number | null;
  expiry: string | null;
  lot: string | null;
  unitCost: number | null;
  estLow: number | null;
  estHigh: number | null;
  /** Things that stop this row being saved. */
  problems: string[];
  /** Things worth knowing that do not stop it (an assumed condition, a date already past). */
  notes: string[];
  /** ok: can be saved. match: only the product has to be chosen. problem: fix the file or leave the row out. */
  status: "ok" | "match" | "problem";
};

export type ReadOptions = {
  today: string;
  conditions: string[];
  /** Used when the file has no Condition column, or a cell in it is empty. */
  defaultCondition: string;
  /** Products the person chose by hand for rows we could not match: spreadsheet row number -> product id. */
  matches?: Record<string, string>;
};

export type ReadResult = {
  rows: ImportRow[];
  map: StockColumnMap;
  error?: string;
  counts: { ok: number; match: number; problem: number; units: number; blank: number };
};

export function readStockRows(sheet: ParsedSheet, mapIn: StockColumnMap, products: ImportProduct[], opts: ReadOptions): ReadResult {
  const map = cleanColumnMap(sheet.headers, mapIn);
  const counts = { ok: 0, match: 0, problem: 0, units: 0, blank: 0 };
  const fail = (error: string): ReadResult => ({ rows: [], map, error, counts });
  if (!map.product) return fail("I couldn't find the Product column. Choose which column has the product names.");
  if (!map.quantity) return fail("I couldn't find the Quantity column. Choose which column has how many units you have.");
  if (!sheet.rows.length) return fail("That file has a heading row but no stock lines.");
  if (sheet.rows.length > MAX_IMPORT_ROWS) return fail(`That file has more than ${MAX_IMPORT_ROWS.toLocaleString("en-US")} lines. Split it and import the parts one at a time.`);
  const byId = new Map(products.map((p) => [p.id, p]));
  const candidates = products.map((p) => ({ id: p.id, name: p.name }));
  const canon = (c: string) => opts.conditions.find((x) => normKey(x) === normKey(c)) ?? null;
  const rows: ImportRow[] = [];
  sheet.rows.forEach((r, i) => {
    const cell = (f: StockField) => (map[f] ? clean(r[map[f] as string]) : "");
    const rowNo = i + 2;
    if (!STOCK_FIELDS.some((f) => cell(f))) {
      counts.blank += 1;
      return;
    }
    const problems: string[] = [];
    const notes: string[] = [];
    const rawProduct = cell("product");
    // product
    let product: ImportProduct | null = null;
    const chosen = opts.matches?.[String(rowNo)];
    if (chosen) {
      product = byId.get(chosen) ?? null;
      if (!product) problems.push("the product you chose isn't in your catalog any more");
    } else if (!rawProduct) {
      problems.push("the product is empty");
    } else {
      const brand = cell("brand");
      const inBrand = brand ? products.filter((p) => normKey(p.brand) === normKey(brand)) : [];
      const m = (inBrand.length ? matchProduct(rawProduct, inBrand.map((p) => ({ id: p.id, name: p.name }))) : null) ?? matchProduct(rawProduct, candidates);
      product = m ? (byId.get(m.id) ?? null) : null;
    }
    // condition
    let condition = opts.defaultCondition;
    const rawCond = cell("condition");
    if (rawCond) {
      const c = canon(rawCond);
      if (c) condition = c;
      else problems.push(`"${rawCond.slice(0, 24)}" isn't a condition we use (${opts.conditions.join(", ")})`);
    } else if (map.condition) notes.push(`no condition given, ${opts.defaultCondition} assumed`);
    // quantity, expiry, lot, prices
    const q = parseQuantity(cell("quantity"));
    if (q.error) problems.push(q.error);
    const e = parseStockDate(cell("expiration"));
    if (e.error) problems.push(e.error);
    let expiry = e.date;
    if (product?.noExpiration && expiry) {
      notes.push("this product never expires, so the date was ignored");
      expiry = null;
    }
    if (expiry && expiry < opts.today) notes.push("this expiration date has already passed");
    if (product && !product.noExpiration && !expiry && !e.error) notes.push("no expiration date");
    const lot = cell("lot").slice(0, 60) || null;
    const cost = parseMoney(cell("cost"), "the cost");
    const low = parseMoney(cell("estLow"), "the lowest estimated price");
    const high = parseMoney(cell("estHigh"), "the highest estimated price");
    for (const p of [cost, low, high]) if (p.error) problems.push(p.error);
    if (low.value != null && high.value != null && low.value > high.value) problems.push("the lowest estimated price is higher than the highest");
    const status: ImportRow["status"] = problems.length ? "problem" : !product ? "match" : "ok";
    if (status === "ok") {
      counts.ok += 1;
      counts.units += q.value ?? 0;
    } else if (status === "match") counts.match += 1;
    else counts.problem += 1;
    rows.push({
      rowNo, rawProduct, productId: product?.id ?? null, productName: product?.name ?? null, brand: product?.brand ?? null, noExpiration: !!product?.noExpiration,
      condition, quantity: q.value, expiry, lot, unitCost: cost.value, estLow: low.value, estHigh: high.value, problems, notes, status,
    });
  });
  if (!rows.length) return fail("I couldn't find any stock lines in that file.");
  return { rows, map, counts };
}

// ---- the file and its fingerprint ------------------------------------------------------------------------------

/** The same file always gives the same fingerprint, so importing it twice can be refused (it would double the stock). */
export const importFingerprint = (bytes: Buffer): string => "imp_" + createHash("sha256").update(bytes).digest("hex").slice(0, 32);
export const IMPORT_REF_TYPE = "stock_import";

/** The CSV a person can fill in: a heading row, then example lines using real catalog names. */
export function templateCsv(productNames: string[]): string {
  const head = ["Product", "Condition", "Quantity", "Expiration date", "Lot number", "Cost per unit", "Estimated lowest price", "Estimated highest price"];
  const names = productNames.length ? productNames.slice(0, 2) : ["Example product A", "Example product B"];
  const lines = [head, [names[0], "Mint", "50", "2027-08-31", "LOT123", "12.50", "14.00", "16.00"], [names[1] ?? names[0], "Dinged", "10", "2027-02", "", "", "", ""]];
  return lines.map((l) => l.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\r\n") + "\r\n";
}
