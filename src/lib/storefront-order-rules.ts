// Pharmacy orders on a company's storefront or own website: the pure rules (no database), so they can be tested.
//
// In plain words: an approved pharmacy sees only the products on ITS OWN price sheet, at ITS OWN prices, with "In stock" or "Out of stock"
// (never a count). It chooses quantities and places the order. Nothing the pharmacy (or a website acting for it) sends can set a price, a
// stock level, a status or the company: it sends only which price-sheet line and how many, and a key that makes a double click harmless.

export const ORDER_LIMITS = {
  maxLines: 100,
  maxQuantity: 100_000,
  poMax: 60,
  notesMax: 500,
  /** Orders one pharmacy may place per day (a runaway script, or a mistake repeated, stops here). */
  perBuyerPerDay: 30,
} as const;

export const ORDER_KEY_PATTERN = /^[A-Za-z0-9_-]{8,80}$/;
export const ORDER_REFERENCE_PATTERN = /^ORD-[A-HJ-NP-Z2-9]{6}$/;

const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
/** A short code both sides can quote, like ORD-7KQ2MX. `rand` gives numbers in [0,1) so it can be tested. */
export function makeOrderReference(rand: () => number = Math.random): string {
  let out = "";
  for (let i = 0; i < 6; i++) out += REF_ALPHABET[Math.floor(rand() * REF_ALPHABET.length)];
  return `ORD-${out}`;
}

const oneLine = (v: unknown, max: number) => String(v ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, max);
const multiLine = (v: unknown, max: number) => String(v ?? "").replace(/\r/g, "").replace(/[^\S\n]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max);

export type OrderLineWanted = { itemId: string; quantity: number };
export type OrderRequest = { key: string; lines: OrderLineWanted[]; poNumber: string | null; notes: string | null };

/**
 * The order as a page or a website sends it, checked. The same price-sheet line twice is added together. Only whole numbers of 1 or more
 * count. Anything unexpected is refused with a plain message rather than guessed at.
 */
export function cleanOrderRequest(raw: { key: unknown; lines: unknown; poNumber?: unknown; notes?: unknown }): { ok: true; value: OrderRequest } | { ok: false; error: string } {
  const key = String(raw.key ?? "");
  if (!ORDER_KEY_PATTERN.test(key)) return { ok: false, error: "This order form is out of date. Reload the page and try again." };
  if (!Array.isArray(raw.lines)) return { ok: false, error: "Send the items as a list." };
  if (raw.lines.length > ORDER_LIMITS.maxLines * 2) return { ok: false, error: `An order can have up to ${ORDER_LIMITS.maxLines} different items.` };
  const merged = new Map<string, number>();
  for (let i = 0; i < raw.lines.length; i++) {
    const l = raw.lines[i] as Record<string, unknown> | null;
    if (!l || typeof l !== "object") return { ok: false, error: `Item ${i + 1} is not valid.` };
    const itemId = String(l.itemId ?? l.id ?? "");
    if (!/^[A-Za-z0-9_-]{3,80}$/.test(itemId)) return { ok: false, error: `Item ${i + 1} is not valid.` };
    const q = typeof l.quantity === "string" && /^\d+$/.test(l.quantity.trim()) ? Number(l.quantity.trim()) : l.quantity;
    if (typeof q !== "number" || !Number.isInteger(q) || q < 1 || q > ORDER_LIMITS.maxQuantity) return { ok: false, error: `Item ${i + 1} needs a whole-number quantity of 1 or more.` };
    merged.set(itemId, (merged.get(itemId) ?? 0) + q);
  }
  if (merged.size === 0) return { ok: false, error: "Choose at least one item to order." };
  if (merged.size > ORDER_LIMITS.maxLines) return { ok: false, error: `An order can have up to ${ORDER_LIMITS.maxLines} different items.` };
  for (const q of merged.values()) if (q > ORDER_LIMITS.maxQuantity) return { ok: false, error: "That quantity is too large." };
  return {
    ok: true,
    value: {
      key,
      lines: [...merged.entries()].map(([itemId, quantity]) => ({ itemId, quantity })),
      poNumber: oneLine(raw.poNumber, ORDER_LIMITS.poMax) || null,
      notes: multiLine(raw.notes, ORDER_LIMITS.notesMax) || null,
    },
  };
}

/** The hosted order form: fields named q_<price line id> hold the quantity; blank or 0 means "not ordering this". */
export function linesFromForm(entries: Iterable<[string, unknown]>): { itemId: string; quantity: unknown }[] {
  const out: { itemId: string; quantity: unknown }[] = [];
  for (const [name, value] of entries) {
    if (!name.startsWith("q_")) continue;
    const v = String(value ?? "").trim();
    if (v === "" || v === "0") continue;
    out.push({ itemId: name.slice(2), quantity: v });
  }
  return out;
}

export type OrderOutcome = "CONFIRMED" | "REVIEW";

/** Confirmed on the spot, unless the company set a review amount and this order is above it. Every line was already checked in stock and priced from the sheet. */
export function outcomeFor(total: number, reviewOver: number | null | undefined): OrderOutcome {
  if (reviewOver != null && Number.isFinite(reviewOver) && reviewOver > 0 && total > reviewOver) return "REVIEW";
  return "CONFIRMED";
}

/** The review amount a company typed (blank = none). */
export function cleanReviewOver(raw: unknown): { ok: true; value: number | null } | { ok: false; error: string } {
  const t = String(raw ?? "").replace(/[$,\s]/g, "");
  if (t === "") return { ok: true, value: null };
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0 || n > 100_000_000) return { ok: false, error: "Enter the amount as a number above $0, or leave it empty to confirm every order automatically." };
  return { ok: true, value: Math.round(n * 100) / 100 };
}

export const stockWord = (inStock: boolean) => (inStock ? "In stock" : "Out of stock");

/** Where an order stands, in the words a pharmacy or website sees, worked out from the Sales order behind it. */
export type OrderState = "confirmed" | "in_review" | "invoiced" | "cancelled";
export function orderStateOf(docStatus: string): OrderState {
  if (docStatus === "ACCEPTED") return "confirmed";
  if (docStatus === "CONVERTED" || docStatus === "PAID" || docStatus === "PARTIALLY_PAID") return "invoiced";
  if (docStatus === "VOID" || docStatus === "DECLINED") return "cancelled";
  return "in_review"; // DRAFT or SENT: staff have not confirmed it yet
}
export const ORDER_STATE_LABEL: Record<OrderState, string> = {
  confirmed: "Confirmed",
  in_review: "Received, being reviewed",
  invoiced: "Invoiced",
  cancelled: "Cancelled",
};
