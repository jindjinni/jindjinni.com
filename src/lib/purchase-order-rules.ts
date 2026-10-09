// Purchase orders: the rules, with no database. A distributor sends a purchase order to a wholesaler (its supplier) listing what it
// wants to buy: part number, NDC, name, size, quantity, unit and the price it will pay. These rules clean what was typed, add
// the money up in whole cents, number the orders, say which status can follow which, and warn when a supplier's license is
// out of date. Everything here is tested in scripts/purchase-order-rules.test.ts.

import { checkNdc } from "@/lib/industry-checks";

export const PO_STATUSES = ["DRAFT", "SENT", "CONFIRMED", "RECEIVED", "CANCELLED"] as const;
export type PoStatus = (typeof PO_STATUSES)[number];

export const PO_STATUS_LABEL: Record<PoStatus, string> = {
  DRAFT: "Draft",
  SENT: "Sent to supplier",
  CONFIRMED: "Confirmed by supplier",
  RECEIVED: "Received",
  CANCELLED: "Cancelled",
};

export const isPoStatus = (v: unknown): v is PoStatus => typeof v === "string" && (PO_STATUSES as readonly string[]).includes(v);

/** Which statuses an order may move to from where it is. Received and Cancelled are final. */
const NEXT: Record<PoStatus, PoStatus[]> = {
  DRAFT: ["SENT", "CANCELLED"],
  SENT: ["CONFIRMED", "RECEIVED", "DRAFT", "CANCELLED"],
  CONFIRMED: ["RECEIVED", "CANCELLED"],
  RECEIVED: [],
  CANCELLED: [],
};
export const canMoveTo = (from: PoStatus, to: PoStatus) => NEXT[from].includes(to);

/** An order's lines and details can be changed only while it is a draft. */
export const isEditable = (status: PoStatus) => status === "DRAFT";

export const PO_UNITS = ["EA", "BX", "CS", "PK", "CT"] as const;

/** Text printed at the bottom of a new order until the company writes its own (each new order starts from the last one used). */
export const DEFAULT_PO_TERMS =
  "Please confirm this purchase order by reply. Product must meet our dating requirements and may be refused if it does not. " +
  "This purchase order must be filled within 10 days or it may be cancelled. Send the pedigree and invoice with, or before, the shipment.";

export const round2 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
const cents = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100);

/** Quantity times price, in whole cents, so a long list never drifts by a penny. */
export const lineTotal = (quantity: number, unitCost: number) => cents(unitCost) * Math.trunc(quantity) / 100;

export type PoTotals = { subtotal: number; shipping: number; total: number; units: number };

export function computeTotals(lines: { quantity: number; unitCost: number }[], shipping: number): PoTotals {
  let c = 0;
  let units = 0;
  for (const l of lines) {
    c += cents(l.unitCost) * Math.trunc(l.quantity);
    units += Math.trunc(l.quantity);
  }
  const ship = Math.max(0, cents(shipping));
  return { subtotal: c / 100, shipping: ship / 100, total: (c + ship) / 100, units };
}

/** "PO-1001". Sequence numbers start at 1001 and are never reused. */
export const FIRST_PO_SEQ = 1001;
export const formatPoNumber = (seq: number) => `PO-${seq}`;
export function nextSeq(existing: number[]): number {
  return existing.length ? Math.max(FIRST_PO_SEQ - 1, ...existing) + 1 : FIRST_PO_SEQ;
}

export const cleanText = (v: unknown, max = 200): string => String(v ?? "").replace(/\r/g, "").trim().slice(0, max);
export const nullIfEmpty = (v: unknown, max = 200): string | null => cleanText(v, max) || null;

export const looksLikeEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

export type PoLineInput = {
  productId?: string | null;
  partNumber?: string | null;
  ndc?: string | null;
  name: string;
  size?: string | null;
  quantity: number | string;
  unit?: string | null;
  unitCost: number | string;
};

export type CleanLine = { productId: string | null; partNumber: string | null; ndc: string | null; name: string; size: string | null; quantity: number; unit: string; unitCost: number; total: number };

/**
 * An NDC is kept as typed when it is well formed; a ten-digit number without hyphens is ambiguous (three layouts), so it is kept
 * as typed too and never "corrected" by guessing. Returns the problem in plain words when it cannot be an NDC.
 */
export function cleanNdc(raw: unknown): { ok: true; ndc: string | null } | { ok: false; error: string } {
  const text = cleanText(raw, 20);
  if (!text) return { ok: true, ndc: null };
  const r = checkNdc(text);
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, ndc: r.formats.length === 1 ? r.formats[0].hyphenated : text.replace(/\s+/g, "") };
}

/** Cleans every line and says what is wrong with the first bad one ("Line 3: ..."). An order needs at least one line. */
export function cleanLines(inputs: PoLineInput[]): { ok: true; lines: CleanLine[] } | { ok: false; error: string } {
  const rows = inputs.filter((l) => cleanText(l.name) || cleanText(l.partNumber) || cleanText(l.ndc) || Number(l.unitCost) > 0);
  if (!rows.length) return { ok: false, error: "Add at least one item to the order." };
  const out: CleanLine[] = [];
  for (const [i, l] of rows.entries()) {
    const n = i + 1;
    const name = cleanText(l.name, 200);
    if (!name) return { ok: false, error: `Line ${n}: give the item a name.` };
    const quantity = Number(l.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1_000_000) return { ok: false, error: `Line ${n}: the quantity must be a whole number of 1 or more.` };
    const unitCost = Number(l.unitCost);
    if (!Number.isFinite(unitCost) || unitCost < 0 || unitCost > 10_000_000) return { ok: false, error: `Line ${n}: the price must be a number, 0 or more.` };
    const ndc = cleanNdc(l.ndc);
    if (!ndc.ok) return { ok: false, error: `Line ${n}: ${ndc.error}` };
    const unit = cleanText(l.unit, 8).toUpperCase() || "EA";
    out.push({
      productId: nullIfEmpty(l.productId, 80),
      partNumber: nullIfEmpty(l.partNumber, 60),
      ndc: ndc.ndc,
      name,
      size: nullIfEmpty(l.size, 60),
      quantity,
      unit,
      unitCost: round2(unitCost),
      total: lineTotal(quantity, round2(unitCost)),
    });
  }
  return { ok: true, lines: out };
}

/** A real calendar day written YYYY-MM-DD. */
export function isDay(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

export type LicenseState = "none" | "ok" | "soon" | "expired";

/** Is the supplier's license still good? "soon" means it runs out within 60 days. */
export function licenseState(expires: string | null | undefined, today: string): LicenseState {
  if (!expires || !isDay(expires)) return "none";
  if (expires < today) return "expired";
  const days = Math.round((Date.parse(`${expires}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  return days <= 60 ? "soon" : "ok";
}

export const LICENSE_WARNING: Record<LicenseState, string | null> = {
  none: null,
  ok: null,
  soon: "This supplier's license runs out within 60 days.",
  expired: "This supplier's license has expired. Check it before you send an order.",
};

/** 2026-10-06 -> 10/06/2026 (the way the orders we have seen print it). */
export function usDate(day: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day ?? "");
  return m ? `${m[2]}/${m[3]}/${m[1]}` : "";
}

export const money = (n: number) => "$" + (Number.isFinite(n) ? n : 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** A safe file name such as "PO-1001-Acme-Supply.pdf". */
export function poFileName(number: string, supplier: string): string {
  const who = supplier.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${number.replace(/[^A-Za-z0-9-]+/g, "")}${who ? `-${who}` : ""}.pdf`;
}
