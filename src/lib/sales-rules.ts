// Sales rules. Pure: nothing here reads or writes the database, so the screens, the tests and the server actions all use
// the same arithmetic (totals, due dates, what is still available to sell, reading a buyer's price sheet, who pays most).

import { addDays, isDay } from "@/lib/payment-due";
import { groupByBrand } from "@/lib/receiving-brand";
import { normKey, type StockLine } from "@/lib/inventory-rules";

// ---- numbers and money ------------------------------------------------------------------------------------------

const cents = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100);
export const round2 = (n: number) => cents(n) / 100;
export const lineAmount = (quantity: number, unitPrice: number) => round2(quantity * unitPrice);

export type TotalsInput = {
  lines: { quantity: number; unitPrice: number }[];
  discount?: number;
  shipping?: number;
  tax?: number;
  otherCharges?: number;
};

/** Subtotal of the lines, then minus the discount and plus shipping, tax and other charges. */
export function computeTotals(i: TotalsInput): { subtotal: number; total: number } {
  const sub = i.lines.reduce((n, l) => n + cents(lineAmount(l.quantity, l.unitPrice)), 0);
  const total = sub - cents(i.discount ?? 0) + cents(i.shipping ?? 0) + cents(i.tax ?? 0) + cents(i.otherCharges ?? 0);
  return { subtotal: sub / 100, total: total / 100 };
}

export const MONEY = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

// ---- terms, due date, numbers ------------------------------------------------------------------------------------

export const TERMS_OPTIONS = ["Due on Receipt", "Net 7", "Net 15", "Net 30", "Net 45", "Net 60", "Prepaid"] as const;

/** Days from the invoice date to the due date: "Net 15" is 15; "Due on Receipt" and "Prepaid" are 0. */
export function termsDays(terms: string | null | undefined): number {
  const m = /^net\s*(\d{1,3})$/i.exec((terms ?? "").trim());
  return m ? Number(m[1]) : 0;
}

export function dueDateFor(docDate: string, terms: string | null | undefined): string {
  return isDay(docDate) ? addDays(docDate, termsDays(terms)) : docDate;
}

export type SalesKind = "QUOTATION" | "INVOICE" | "PURCHASE_ORDER" | "SALES_ORDER";

/** Quotations are numbered Q-1001, invoices 1001, the purchase orders we receive RPO-1001 (the buyer's own number is kept in Reference) and our sales orders SO-1001. */
export function formatNumber(kind: SalesKind, seq: number): string {
  return kind === "QUOTATION" ? `Q-${seq}` : kind === "PURCHASE_ORDER" ? `RPO-${seq}` : kind === "SALES_ORDER" ? `SO-${seq}` : String(seq);
}

/** Quotations, purchase orders and sales orders are "offers/orders" that can be sent, accepted or declined and made into an invoice (a sales order's next step only). Invoices are different (stock, payments). */
export const isOrderDoc = (kind: string) => kind === "QUOTATION" || kind === "PURCHASE_ORDER" || kind === "SALES_ORDER";

export const KIND_LABEL: Record<SalesKind, string> = { QUOTATION: "Quotation", INVOICE: "Invoice", PURCHASE_ORDER: "Purchase order", SALES_ORDER: "Sales order" };

/** The lower-case word for a kind, for sentences ("this sales order"). */
export const kindWord = (kind: string) => (KIND_LABEL[kind as SalesKind] ?? "document").toLowerCase();

/** Purchase orders and sales orders list the NDC of each item and carry the buyer's own PO number. */
export const hasNdcColumn = (kind: string) => kind === "PURCHASE_ORDER" || kind === "SALES_ORDER";

/** Statuses in which a sales order is still open and keeps its units set aside. Made into an invoice, void and declined release them. */
export const SO_HOLDING_STATUSES = ["DRAFT", "SENT", "ACCEPTED"] as const;

/** Where a sales order can come from: a quotation or a received purchase order that was sent or accepted, never declined, void or already made into something. */
export function canMakeSalesOrder(from: { kind: string; status: string }): { ok: true } | { ok: false; error: string } {
  if (from.kind !== "QUOTATION" && from.kind !== "PURCHASE_ORDER") return { ok: false, error: "A sales order is made from a quotation or a received purchase order." };
  if (from.status === "CONVERTED") return { ok: false, error: `This ${kindWord(from.kind)} was already made into another document.` };
  if (from.status === "VOID" || from.status === "DECLINED") return { ok: false, error: `A void or declined ${kindWord(from.kind)} can't be made into a sales order.` };
  if (from.status !== "SENT" && from.status !== "ACCEPTED") return { ok: false, error: `Send the ${kindWord(from.kind)} first.` };
  return { ok: true };
}

export type SalesStatus = "DRAFT" | "SENT" | "PARTIALLY_PAID" | "PAID" | "ACCEPTED" | "DECLINED" | "CONVERTED" | "VOID";

export const STATUS_LABEL: Record<SalesStatus | "PAST_DUE", string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  PARTIALLY_PAID: "Partly paid",
  PAID: "Paid",
  ACCEPTED: "Accepted",
  DECLINED: "Declined",
  CONVERTED: "Made into an invoice",
  VOID: "Void",
  PAST_DUE: "Past due",
};

/** An invoice that was sent, still owes money, and whose due date has passed. */
export function isPastDue(doc: { kind: string; status: string; dueDate: string | null; total: number; amountPaid: number }, today: string): boolean {
  if (doc.kind !== "INVOICE") return false;
  if (doc.status !== "SENT" && doc.status !== "PARTIALLY_PAID") return false;
  if (!doc.dueDate || !isDay(doc.dueDate)) return false;
  return doc.dueDate < today && cents(doc.total) > cents(doc.amountPaid);
}

export const balanceOf = (doc: { total: number; amountPaid: number }) => Math.max(0, round2(doc.total - doc.amountPaid));

/** What the status chip says: "Past due" wins over Sent / Partly paid. */
export function shownStatus(doc: { kind: string; status: string; dueDate: string | null; total: number; amountPaid: number }, today: string): SalesStatus | "PAST_DUE" {
  return isPastDue(doc, today) ? "PAST_DUE" : (doc.status as SalesStatus);
}

/** What a payment of `amount` does to the invoice: the new amount paid and status. */
export function afterPayment(doc: { total: number; amountPaid: number }, amount: number): { amountPaid: number; status: "PARTIALLY_PAID" | "PAID" } {
  const paid = round2(doc.amountPaid + amount);
  return { amountPaid: paid, status: cents(paid) >= cents(doc.total) ? "PAID" : "PARTIALLY_PAID" };
}

// ---- stock beside each item --------------------------------------------------------------------------------------

export type StockGroup = { key: string; label: string; onHand: number; from: string | null; to: string | null };
export type StockCondition = { condition: string; onHand: number; groups: StockGroup[] };
/** product key -> condition key -> what is on hand (only quantities above zero). Plain data, so it can go to the browser. */
export type StockMap = Record<string, { productName: string; brand: string; conditions: Record<string, StockCondition> }>;

export function buildStockMap(lines: StockLine[]): StockMap {
  const out: StockMap = {};
  for (const l of lines) {
    if (l.quantity <= 0) continue;
    const p = (out[l.productKey] ??= { productName: l.productName, brand: l.brand, conditions: {} });
    const ck = normKey(l.condition);
    const c = (p.conditions[ck] ??= { condition: l.condition, onHand: 0, groups: [] });
    c.onHand += l.quantity;
    c.groups.push({ key: l.group.key, label: l.group.label, onHand: l.quantity, from: l.expiryFrom, to: l.expiryTo });
  }
  return out;
}

/** Units that DRAFT invoices are holding: "productKey|condition|groupKey" (groupKey empty = any group) -> units. */
export type Reserved = Record<string, number>;

export const reserveKey = (productKey: string, condition: string, groupKey?: string | null) => `${productKey}|${normKey(condition)}|${groupKey ?? ""}`;

export function buildReserved(lines: { productKey: string; condition: string; groupKey: string | null; quantity: number }[]): Reserved {
  const out: Reserved = {};
  for (const l of lines) {
    const k = reserveKey(l.productKey, l.condition, l.groupKey);
    out[k] = (out[k] ?? 0) + l.quantity;
  }
  return out;
}

export type Availability = { onHand: number; held: number; available: number };

/**
 * What can still be sold of a product in a condition (optionally from one expiration group): what is on hand, minus what
 * other drafts are holding. A draft that asked for "any group" holds units from the product's whole pile.
 */
export function availability(stock: StockMap, reserved: Reserved, productKey: string, condition: string, groupKey?: string | null): Availability {
  const cond = stock[productKey]?.conditions[normKey(condition)];
  const prefix = `${productKey}|${normKey(condition)}|`;
  let heldAll = 0;
  let heldGroup = 0;
  for (const [k, n] of Object.entries(reserved)) {
    if (!k.startsWith(prefix)) continue;
    heldAll += n;
    if (groupKey && k === `${prefix}${groupKey}`) heldGroup += n;
  }
  const total = cond?.onHand ?? 0;
  if (!groupKey) return { onHand: total, held: heldAll, available: Math.max(0, total - heldAll) };
  const g = cond?.groups.find((x) => x.key === groupKey)?.onHand ?? 0;
  return { onHand: g, held: heldGroup, available: Math.max(0, Math.min(g - heldGroup, total - heldAll)) };
}

export type LineCheck = { index: number; productName: string; wanted: number; available: number };

/**
 * The lines that ask for more than is available. A document's own lines also count against each other (two lines of
 * the same product and condition share one pile), so they are checked one after the other.
 */
export function shortfalls(
  stock: StockMap,
  reservedByOthers: Reserved,
  lines: { productKey: string; productName: string; condition: string; groupKey: string | null; quantity: number }[],
): LineCheck[] {
  const out: LineCheck[] = [];
  const running: Reserved = { ...reservedByOthers };
  lines.forEach((l, index) => {
    const a = availability(stock, running, l.productKey, l.condition, l.groupKey);
    if (l.quantity > a.available) out.push({ index, productName: l.productName, wanted: l.quantity, available: a.available });
    const k = reserveKey(l.productKey, l.condition, l.groupKey);
    running[k] = (running[k] ?? 0) + l.quantity;
  });
  return out;
}

// ---- document lines ----------------------------------------------------------------------------------------------

export type LineInput = {
  productId: string | null;
  productKey: string;
  productName: string;
  condition: string;
  groupKey: string | null;
  groupLabel: string | null;
  quantity: number;
  unitPrice: number;
  note?: string | null;
  /** NDC, printed on purchase orders. */
  ndc?: string | null;
};

/** The first thing wrong with a set of lines, or null. Quotations and invoices follow the same rules. */
export function validateLines(lines: LineInput[]): string | null {
  if (!lines.length) return "Add at least one item.";
  if (lines.length > 200) return "A document can have up to 200 items.";
  for (const [i, l] of lines.entries()) {
    const at = `Item ${i + 1}`;
    if (!l.productKey || !l.productName.trim()) return `${at}: choose a product.`;
    if (!l.condition.trim()) return `${at}: choose a condition.`;
    if (!Number.isInteger(l.quantity) || l.quantity <= 0 || l.quantity > 1_000_000) return `${at}: enter a quantity of 1 or more.`;
    if (!Number.isFinite(l.unitPrice) || l.unitPrice < 0 || l.unitPrice > 10_000_000) return `${at}: enter a price of $0 or more.`;
  }
  return null;
}

// ---- a buyer's price sheet ---------------------------------------------------------------------------------------

/** "$1,250.50", "1250.5", "(12.00)" -> a number; null when it isn't one. */
export function parseMoney(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = v.trim();
  if (!s) return null;
  const neg = /^\(.*\)$/.test(s);
  const n = Number(s.replace(/[^0-9.\-]/g, ""));
  if (!/\d/.test(s) || !Number.isFinite(n)) return null;
  return neg ? -Math.abs(n) : n;
}

const PRODUCT_HEADERS = ["product", "product name", "item", "item name", "name", "description", "product description", "sku description", "ndc description"];
const PRICE_HEADERS = ["price", "buy price", "buying price", "our price", "offer", "offer price", "we pay", "paying", "pay", "unit price", "rate", "price per unit", "price each", "each"];
const CONDITION_HEADERS = ["condition", "grade"];

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** The columns most likely to hold the product name, the price and (if any) the condition. */
export function guessColumns(headers: string[]): { product: string | null; price: string | null; condition: string | null } {
  const find = (names: string[]) => {
    for (const n of names) {
      const h = headers.find((x) => norm(x) === n);
      if (h) return h;
    }
    for (const n of names) {
      const h = headers.find((x) => norm(x).includes(n));
      if (h) return h;
    }
    return null;
  };
  const product = find(PRODUCT_HEADERS) ?? headers[0] ?? null;
  const price = find(PRICE_HEADERS) ?? headers.find((h) => h !== product && /\$|price|pay|offer|rate/i.test(h)) ?? null;
  const condition = find(CONDITION_HEADERS);
  return { product, price: price && price !== product ? price : null, condition: condition && condition !== product && condition !== price ? condition : null };
}

export type SheetItem = { rawName: string; price: number; condition: string };

/** Turns the parsed rows into price items, skipping blank names and prices that aren't numbers. */
export function readSheetRows(rows: Record<string, string>[], cols: { product: string; price: string; condition?: string | null }, defaultCondition = "Mint"): { items: SheetItem[]; skipped: number } {
  const items: SheetItem[] = [];
  let skipped = 0;
  for (const r of rows) {
    const name = (r[cols.product] ?? "").trim();
    const price = parseMoney(r[cols.price]);
    if (!name) continue;
    if (price == null || price < 0) {
      skipped += 1;
      continue;
    }
    const cond = cols.condition ? (r[cols.condition] ?? "").trim() : "";
    items.push({ rawName: name, price, condition: cond || defaultCondition });
  }
  return { items, skipped };
}

/** Lower case, letters and digits only, single spaces: "Dexcom G7 (STP-AT-012)" and "dexcom g7  stp at 012" match. */
export const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const tokens = (s: string) => new Set(normName(s).split(" ").filter(Boolean));

export type MatchCandidate = { id: string; name: string };

/**
 * Finds the catalog product a sheet's name means. Exact name first; then the one product whose name contains the other;
 * then the one clearly closest by shared words. When it can't tell (two equally good), it returns null and a person picks.
 */
export function matchProduct(rawName: string, products: MatchCandidate[]): MatchCandidate | null {
  const n = normName(rawName);
  if (!n) return null;
  const exact = products.filter((p) => normName(p.name) === n);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;
  const contain = products.filter((p) => {
    const pn = normName(p.name);
    return pn.includes(n) || n.includes(pn);
  });
  if (contain.length === 1) return contain[0];
  const a = tokens(rawName);
  const scored = products
    .map((p) => {
      const b = tokens(p.name);
      let both = 0;
      for (const t of a) if (b.has(t)) both += 1;
      const union = a.size + b.size - both;
      return { p, score: union ? both / union : 0 };
    })
    .sort((x, y) => y.score - x.score);
  const [best, next] = scored;
  if (best && best.score >= 0.8 && (!next || next.score < best.score - 0.1)) return best.p;
  return null;
}

// ---- price comparison --------------------------------------------------------------------------------------------

export type ComparePrice = { buyerId: string; productKey: string; condition: string; price: number };
export type CompareProduct = { productKey: string; productName: string; brand: string };

export type CompareRow = {
  productKey: string;
  productName: string;
  brand: string;
  /** Units on hand in the chosen condition (0 when none). */
  onHand: number;
  prices: Record<string, number>;
  best: { buyerId: string; price: number } | null;
  /** Everyone who pays the best price (a tie). */
  bestBuyerIds: string[];
  /** How much more the best buyer pays than the next one; null when only one buyer has a price. */
  lead: number | null;
  /** What all the units on hand bring in at the best price. */
  value: number;
};

export type CompareBlock = { key: string; brand: string; rows: CompareRow[]; onHand: number; value: number };

export function buildComparison(args: {
  products: CompareProduct[];
  prices: ComparePrice[];
  /** "productKey|condition" -> units on hand */
  onHand: Map<string, number>;
  condition: string;
  onlyInStock: boolean;
  search?: string;
}): { blocks: CompareBlock[]; rows: CompareRow[] } {
  const cond = normKey(args.condition);
  const byProduct = new Map<string, Record<string, number>>();
  for (const p of args.prices) {
    if (normKey(p.condition) !== cond) continue;
    const m = byProduct.get(p.productKey) ?? {};
    m[p.buyerId] = p.price;
    byProduct.set(p.productKey, m);
  }
  const q = (args.search ?? "").trim().toLowerCase();
  const rows: CompareRow[] = [];
  for (const p of args.products) {
    const prices = byProduct.get(p.productKey) ?? {};
    const onHand = args.onHand.get(`${p.productKey}|${cond}`) ?? 0;
    const entries = Object.entries(prices);
    if (args.onlyInStock && onHand <= 0) continue;
    if (!args.onlyInStock && !entries.length && onHand <= 0) continue;
    if (q && !p.productName.toLowerCase().includes(q) && !p.brand.toLowerCase().includes(q)) continue;
    const top = entries.length ? Math.max(...entries.map(([, v]) => cents(v))) : null;
    const bestBuyerIds = top == null ? [] : entries.filter(([, v]) => cents(v) === top).map(([id]) => id);
    const rest = entries.filter(([, v]) => cents(v) !== top).map(([, v]) => cents(v));
    const second = rest.length ? Math.max(...rest) : null;
    rows.push({
      productKey: p.productKey,
      productName: p.productName,
      brand: p.brand,
      onHand,
      prices,
      best: top == null ? null : { buyerId: bestBuyerIds[0], price: top / 100 },
      bestBuyerIds,
      lead: top != null && second != null ? (top - second) / 100 : null,
      value: top == null ? 0 : round2((top / 100) * Math.max(onHand, 0)),
    });
  }
  const blocks: CompareBlock[] = groupByBrand(rows, (r) => r.brand).map((b) => ({
    key: b.key,
    brand: b.brand,
    rows: [...b.rows].sort((x, y) => x.productName.localeCompare(y.productName)),
    onHand: b.rows.reduce((n, r) => n + r.onHand, 0),
    value: round2(b.rows.reduce((n, r) => n + r.value, 0)),
  }));
  return { blocks, rows };
}

/** Which buyer pays the most for the most products, for the summary tiles. */
export function winCounts(rows: CompareRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) for (const id of r.bestBuyerIds) out[id] = (out[id] ?? 0) + 1;
  return out;
}

// ---- small helpers -----------------------------------------------------------------------------------------------

/** Tidy typed text: control characters out, spaces tidied, cut to `max`. */
export function cleanText(v: unknown, max: number): string {
  return String(v ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f<>]/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim()
    .slice(0, max);
}

export const looksLikeEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
