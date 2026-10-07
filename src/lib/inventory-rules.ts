// Inventory rules. Pure: nothing here reads or writes the database, so the page, the tests and the Sales department
// (which takes units out) all use the same arithmetic.
//
// Stock is a pile of LAYERS: one layer per product + condition + exact expiration date (+ lot). A layer comes from
// Receiving (accepted units only: no recalls, no counterfeit holds, nothing going back), from a manual add, or is a
// negative movement (a sale). The Stock screen shows LINES: layers of the same product and condition whose expiration
// dates fall in the same group ("7+ months") are one line. Groups follow the real dates, so they are worked out fresh
// on the day you look (today is passed in).

import { brandLabel, groupByBrand, type BrandBlock } from "@/lib/receiving-brand";

export type LayerSource = "RECEIVED" | "MANUAL" | "SALE" | "ADJUSTMENT";

export type StockLayer = {
  source: LayerSource;
  /** Unique id of the thing it came from (a receiving line, a movement). */
  refId: string;
  productKey: string;
  productId: string | null;
  productName: string;
  brand: string | null;
  condition: string;
  /** YYYY-MM-DD, or null when the product has no expiration date. */
  expiry: string | null;
  lot: string | null;
  /** Signed. */
  quantity: number;
  /** Dollars per unit; null when unknown. */
  unitCost: number | null;
  /** The day it happened (YYYY-MM-DD) and where it came from, for the history lists. */
  day: string;
  orderNumber?: string | null;
  customer?: string | null;
  packageId?: string | null;
  sourceItemId?: string | null;
  note?: string | null;
};

export type ExpiryRange = { label: string; minMonths: number | null; maxMonths: number | null };

/** Used when a company has set up no month ranges of its own. */
export const FALLBACK_RANGES: ExpiryRange[] = [
  { label: "7+ months", minMonths: 7, maxMonths: null },
  { label: "4-6 months", minMonths: 4, maxMonths: 6 },
  { label: "Under 4 months", minMonths: 0, maxMonths: 3 },
];

export type ExpiryGroup = { key: string; label: string; /** Sort position: lower comes first (longest-dated first, then no date last-but-one, Expired last). */ rank: number };

const clean = (v: string | null | undefined) => (v ?? "").trim();
export const normKey = (v: string | null | undefined) => clean(v).toLowerCase().replace(/\s+/g, " ");

/** A stable key for a product: the catalog id when there is one, otherwise its normalised name. */
export const productKeyOf = (productId: string | null | undefined, name: string) => (productId ? productId : `name:${normKey(name)}`);

/** YYYY-MM-DD from a stored date; a month-only date ("2027-05") means the last day of that month. */
export function normalizeExpiry(v: string | null | undefined): string | null {
  const s = clean(v);
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{4})-(\d{2})$/.exec(s);
  if (m) {
    const last = new Date(Date.UTC(+m[1], +m[2], 0)).getUTCDate();
    return `${m[1]}-${m[2]}-${String(last).padStart(2, "0")}`;
  }
  return null;
}

/** Whole months from `today` to `expiry` (negative once it has passed). Both YYYY-MM-DD. */
export function monthsRemaining(today: string, expiry: string): number {
  const [y1, m1, d1] = today.split("-").map(Number);
  const [y2, m2, d2] = expiry.split("-").map(Number);
  let months = (y2 - y1) * 12 + (m2 - m1);
  if (d2 < d1) months -= 1;
  return months;
}

/**
 * Which expiration group a date belongs to today. The groups are the company's own Month Ranges ("7+ months");
 * a date already past is "Expired"; a layer with no date is "No expiration date".
 */
export function expiryGroupFor(expiry: string | null, today: string, ranges: ExpiryRange[]): ExpiryGroup {
  if (!expiry) return { key: "none", label: "No expiration date", rank: -1 };
  if (expiry < today) return { key: "expired", label: "Expired", rank: 1_000_000 };
  const list = ranges.length ? ranges : FALLBACK_RANGES;
  const m = monthsRemaining(today, expiry);
  let best: ExpiryRange | null = null;
  for (const r of list) {
    const okMin = r.minMonths == null || m >= r.minMonths;
    const okMax = r.maxMonths == null || m <= r.maxMonths;
    if (okMin && okMax && (!best || (r.minMonths ?? -1) > (best.minMonths ?? -1))) best = r;
  }
  if (best) return { key: `r:${normKey(best.label)}`, label: best.label, rank: 1000 - (best.minMonths ?? 0) };
  // A gap between the company's ranges: say so honestly instead of hiding the stock.
  return { key: "gap", label: "Other dates", rank: 900_000 };
}

export type Estimate = { low: number | null; high: number | null };
/** Estimates are looked up by product + condition. */
export const estimateKey = (productKey: string, condition: string) => `${productKey}|${normKey(condition)}`;

export type StockLot = { lot: string | null; expiry: string | null; quantity: number };

export type StockLine = {
  key: string;
  productKey: string;
  productId: string | null;
  productName: string;
  brand: string;
  condition: string;
  group: ExpiryGroup;
  quantity: number;
  /** What the stock cost (quantity with a known unit cost x that cost). */
  costValue: number;
  /** Units whose cost is known (so the page can say "cost known for 40 of 50"). */
  costKnownUnits: number;
  /** Earliest and latest actual expiration date in the line. */
  expiryFrom: string | null;
  expiryTo: string | null;
  lots: StockLot[];
  estimate: Estimate | null;
  estLow: number | null;
  estHigh: number | null;
  /** Source ids of the layers behind it (for the detail page). */
  layers: StockLayer[];
};

const cents = (n: number) => Math.round(n * 100);
const money = (n: number) => cents(n) / 100;

/** Adds up all the layers into lines. Lines with nothing left are dropped (unless `keepEmpty`); an oversold line (below zero) is kept so it is seen. */
export function buildLines(layers: StockLayer[], today: string, ranges: ExpiryRange[], estimates: Map<string, Estimate>, opts: { keepEmpty?: boolean } = {}): StockLine[] {
  const lines = new Map<string, StockLine & { _lots: Map<string, StockLot> }>();
  for (const l of layers) {
    const group = expiryGroupFor(l.expiry, today, ranges);
    const cond = clean(l.condition) || "Unspecified";
    const key = `${l.productKey}|${normKey(cond)}|${group.key}`;
    let line = lines.get(key);
    if (!line) {
      const est = estimates.get(estimateKey(l.productKey, cond)) ?? null;
      line = {
        key,
        productKey: l.productKey,
        productId: l.productId,
        productName: clean(l.productName),
        brand: brandLabel(l.brand),
        condition: cond,
        group,
        quantity: 0,
        costValue: 0,
        costKnownUnits: 0,
        expiryFrom: null,
        expiryTo: null,
        lots: [],
        estimate: est,
        estLow: null,
        estHigh: null,
        layers: [],
        _lots: new Map(),
      };
      lines.set(key, line);
    }
    line.quantity += l.quantity;
    if (l.unitCost != null) {
      line.costValue += cents(l.unitCost * l.quantity);
      line.costKnownUnits += l.quantity;
    }
    if (l.expiry) {
      if (!line.expiryFrom || l.expiry < line.expiryFrom) line.expiryFrom = l.expiry;
      if (!line.expiryTo || l.expiry > line.expiryTo) line.expiryTo = l.expiry;
    }
    const lotKey = `${normKey(l.lot)}|${l.expiry ?? ""}`;
    const lot = line._lots.get(lotKey) ?? { lot: clean(l.lot) || null, expiry: l.expiry, quantity: 0 };
    lot.quantity += l.quantity;
    line._lots.set(lotKey, lot);
    line.layers.push(l);
  }
  const out: StockLine[] = [];
  for (const raw of lines.values()) {
    const { _lots, ...line } = raw;
    if (!opts.keepEmpty && line.quantity === 0) continue;
    line.costValue = money(line.costValue / 100);
    line.lots = [..._lots.values()].filter((x) => x.quantity !== 0).sort((a, b) => (a.expiry ?? "9999").localeCompare(b.expiry ?? "9999") || (a.lot ?? "").localeCompare(b.lot ?? ""));
    if (line.estimate && line.quantity > 0) {
      line.estLow = line.estimate.low == null ? null : money(line.estimate.low * line.quantity);
      line.estHigh = line.estimate.high == null ? null : money(line.estimate.high * line.quantity);
    }
    out.push(line);
  }
  return out.sort(compareLines);
}

/** Condition order the receiving form uses (Mint first), then anything else A to Z. */
export const CONDITION_ORDER = ["Mint", "Dinged", "Minor Damage", "Damaged", "Stained", "Torn", "Crushed", "Opened", "Unsealed", "Other"];
const condRank = (c: string) => {
  const i = CONDITION_ORDER.findIndex((x) => x.toLowerCase() === c.toLowerCase());
  return i < 0 ? 500 : i;
};

export function compareLines(a: StockLine, b: StockLine): number {
  return (
    a.brand.localeCompare(b.brand) ||
    a.productName.localeCompare(b.productName) ||
    condRank(a.condition) - condRank(b.condition) ||
    a.condition.localeCompare(b.condition) ||
    a.group.rank - b.group.rank
  );
}

export type ProductBlock = {
  key: string;
  productKey: string;
  productName: string;
  quantity: number;
  costValue: number;
  estLow: number | null;
  estHigh: number | null;
  lines: StockLine[];
};
export type BrandStock = {
  key: string;
  brand: string;
  quantity: number;
  costValue: number;
  estLow: number | null;
  estHigh: number | null;
  products: ProductBlock[];
};

const sumOrNull = (vals: (number | null)[]) => {
  const have = vals.filter((v): v is number => v != null);
  return have.length ? money(have.reduce((n, v) => n + cents(v), 0) / 100) : null;
};

/** Brand -> product -> line, with totals at every level. Brands A to Z ("Other" last), products A to Z. */
export function groupStock(lines: StockLine[]): BrandStock[] {
  return groupByBrand(lines, (l) => l.brand).map((b: BrandBlock<StockLine>) => {
    const byProduct = new Map<string, ProductBlock>();
    for (const l of b.rows) {
      let p = byProduct.get(l.productKey);
      if (!p) byProduct.set(l.productKey, (p = { key: l.productKey, productKey: l.productKey, productName: l.productName, quantity: 0, costValue: 0, estLow: null, estHigh: null, lines: [] }));
      p.lines.push(l);
    }
    const products = [...byProduct.values()]
      .map((p) => ({
        ...p,
        quantity: p.lines.reduce((n, l) => n + l.quantity, 0),
        costValue: money(p.lines.reduce((n, l) => n + cents(l.costValue), 0) / 100),
        estLow: sumOrNull(p.lines.map((l) => l.estLow)),
        estHigh: sumOrNull(p.lines.map((l) => l.estHigh)),
      }))
      .sort((a, c) => a.productName.localeCompare(c.productName));
    return {
      key: b.key,
      brand: b.brand,
      quantity: products.reduce((n, p) => n + p.quantity, 0),
      costValue: money(products.reduce((n, p) => n + cents(p.costValue), 0) / 100),
      estLow: sumOrNull(products.map((p) => p.estLow)),
      estHigh: sumOrNull(products.map((p) => p.estHigh)),
      products,
    };
  });
}

export function totalsOf(lines: StockLine[]) {
  return {
    units: lines.reduce((n, l) => n + l.quantity, 0),
    lines: lines.length,
    products: new Set(lines.map((l) => l.productKey)).size,
    costValue: money(lines.reduce((n, l) => n + cents(l.costValue), 0) / 100),
    estLow: sumOrNull(lines.map((l) => l.estLow)),
    estHigh: sumOrNull(lines.map((l) => l.estHigh)),
    oversold: lines.filter((l) => l.quantity < 0).length,
  };
}

// ---- taking stock out (Sales) -----------------------------------------------------------------------------------

export type Take = { productKey: string; productId: string | null; productName: string; brand: string | null; condition: string; expiry: string | null; lot: string | null; quantity: number; /** The average cost of the units in that layer, so taking them out takes their cost out too. */ unitCost: number | null };

export type AllocateOk = { ok: true; takes: Take[] };
export type AllocateFail = { ok: false; available: number; wanted: number };

/**
 * Chooses which layers to take `quantity` units from for one sale of a product in one condition, optionally only from
 * one expiration group. Earliest expiration goes first (so older stock leaves before newer); layers with no date go last.
 * Pure: returns the negative movements to record, or says how many are really there.
 */
export function allocateTake(
  layers: StockLayer[],
  want: { productKey: string; condition: string; groupKey?: string | null; quantity: number },
  today: string,
  ranges: ExpiryRange[],
): AllocateOk | AllocateFail {
  const wantedCond = normKey(want.condition);
  // Net quantity per exact layer (product + condition + date + lot).
  const net = new Map<string, Take & { _cost: number; _units: number }>();
  for (const l of layers) {
    if (l.productKey !== want.productKey || normKey(l.condition) !== wantedCond) continue;
    if (want.groupKey && expiryGroupFor(l.expiry, today, ranges).key !== want.groupKey) continue;
    const k = `${l.expiry ?? ""}|${normKey(l.lot)}`;
    const t = net.get(k) ?? { productKey: l.productKey, productId: l.productId, productName: l.productName, brand: l.brand, condition: l.condition, expiry: l.expiry, lot: l.lot, quantity: 0, unitCost: null, _cost: 0, _units: 0 };
    t.quantity += l.quantity;
    // Cost of what is left: every layer that carries a cost counts, including the negative ones that took cost out.
    if (l.unitCost != null) {
      t._cost += l.unitCost * l.quantity;
      t._units += l.quantity;
    }
    net.set(k, t);
  }
  const pool = [...net.values()]
    .map((t) => {
      const { _cost, _units, ...rest } = t;
      return { ...rest, unitCost: _units > 0 ? Math.round((_cost / _units) * 10000) / 10000 : null };
    }).filter((t) => t.quantity > 0).sort((a, b) => (a.expiry ?? "9999-99-99").localeCompare(b.expiry ?? "9999-99-99") || (a.lot ?? "").localeCompare(b.lot ?? ""));
  const available = pool.reduce((n, t) => n + t.quantity, 0);
  if (!Number.isInteger(want.quantity) || want.quantity <= 0 || available < want.quantity) return { ok: false, available, wanted: want.quantity };
  let left = want.quantity;
  const takes: Take[] = [];
  for (const t of pool) {
    if (left <= 0) break;
    const n = Math.min(left, t.quantity);
    takes.push({ ...t, quantity: n });
    left -= n;
  }
  return { ok: true, takes };
}

// ---- display helpers ---------------------------------------------------------------------------------------------

export const MONEY = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** "$1,200.00 - $1,500.00", "$1,200.00" when both ends match, or "" when there is no estimate. */
export function rangeLabel(low: number | null, high: number | null): string {
  if (low == null && high == null) return "";
  if (low != null && high != null && cents(low) !== cents(high)) return `${MONEY.format(low)} - ${MONEY.format(high)}`;
  return MONEY.format((low ?? high) as number);
}

/** "Oct 2026" for a YYYY-MM-DD date. */
export function monthYear(day: string | null): string {
  if (!day) return "";
  const [y, m, d] = day.split("-").map(Number);
  if (!y || !m || !d) return day;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

/** The actual dates behind a line: "Mar 2027" or "Mar 2027 - Jun 2027". */
export function expirySpan(from: string | null, to: string | null): string {
  if (!from) return "";
  const a = monthYear(from);
  const b = monthYear(to);
  return !to || a === b ? a : `${a} - ${b}`;
}
