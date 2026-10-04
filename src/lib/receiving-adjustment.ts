// Adjustment quotations: the pure rules (totals, pre-filling from the original quotation and what was
// received, validation). No database in here, so the form and the server share the same arithmetic.

export const roundMoney = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type AdjLine = {
  id?: string | null;
  quotedItemId?: string | null;
  productId?: string | null;
  productName: string;
  productCode?: string | null;
  condition?: string | null;
  expiryLabel?: string | null;
  originalQuantity?: number | null;
  originalUnitPrice?: number | null;
  originalLineTotal?: number | null;
  quantity: number;
  unitPrice: number;
  note?: string | null;
};

export function lineTotalOf(quantity: number, unitPrice: number): number {
  return roundMoney(quantity * unitPrice);
}

export function adjustmentTotals(lines: { quantity: number; unitPrice: number }[], bonus: number, deduction: number) {
  const itemsTotal = roundMoney(lines.reduce((a, l) => a + lineTotalOf(l.quantity, l.unitPrice), 0));
  const adjustedTotal = Math.max(0, roundMoney(itemsTotal + bonus - deduction));
  return { itemsTotal, adjustedTotal };
}

/** What the customer is told changed: adjusted total minus original total (negative = we pay less). */
export function adjustmentDifference(originalTotal: number, adjustedTotal: number): number {
  return roundMoney(adjustedTotal - originalTotal);
}

export type QuotedForPrefill = {
  id: string;
  productId: string | null;
  name: string;
  code: string | null;
  condition: string | null;
  expiration: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};
export type ReceivedForPrefill = {
  quotedItemId: string | null;
  productId: string | null;
  productName: string;
  itemSource: string;
  wasReceived: string;
  quantityReceived: number | null;
  condition: string;
};

/**
 * Starting point for a new adjustment: every line of the original quotation, with the quantity (and condition)
 * actually received where the receiver has entered it, plus anything extra that arrived (priced at $0 until set).
 * The agent can edit every figure afterwards.
 */
export function prefillAdjustmentLines(quoted: QuotedForPrefill[], received: ReceivedForPrefill[]): AdjLine[] {
  const out: AdjLine[] = [];
  for (const q of quoted) {
    const rows = received.filter((r) => r.quotedItemId === q.id);
    const counted = rows.filter((r) => r.quantityReceived != null);
    const quantity = counted.length > 0 ? counted.reduce((a, r) => a + (r.quantityReceived ?? 0), 0) : q.quantity;
    const conds = Array.from(new Set(rows.map((r) => r.condition).filter(Boolean)));
    const condition = conds.length === 1 && conds[0] !== "Mint" ? conds[0] : conds.length > 1 ? conds.join(" / ") : q.condition;
    out.push({
      quotedItemId: q.id,
      productId: q.productId,
      productName: q.name,
      productCode: q.code,
      condition: condition ?? null,
      expiryLabel: q.expiration,
      originalQuantity: q.quantity,
      originalUnitPrice: q.unitPrice,
      originalLineTotal: q.lineTotal,
      quantity,
      unitPrice: q.unitPrice,
      note: quantity !== q.quantity ? `Quoted ${q.quantity}, received ${quantity}` : null,
    });
  }
  for (const r of received) {
    if (r.itemSource !== "EXTRA" || (r.quantityReceived ?? 0) <= 0) continue;
    out.push({
      productId: r.productId,
      productName: r.productName,
      condition: r.condition || null,
      quantity: r.quantityReceived ?? 0,
      unitPrice: 0,
      note: "Not on the original quotation",
    });
  }
  return out;
}

export type AdjValidation = { ok: true } | { ok: false; error: string };

export function validateAdjustmentLines(lines: AdjLine[]): AdjValidation {
  if (lines.length > 100) return { ok: false, error: "An adjustment can have up to 100 lines." };
  for (const [i, l] of lines.entries()) {
    const label = l.productName?.trim() || `Line ${i + 1}`;
    if (!l.productName?.trim()) return { ok: false, error: `Line ${i + 1} needs a product name.` };
    if (!Number.isInteger(l.quantity) || l.quantity < 0 || l.quantity > 1_000_000) return { ok: false, error: `${label}: quantity must be a whole number, 0 or more.` };
    if (!Number.isFinite(l.unitPrice) || l.unitPrice < 0 || l.unitPrice > 1_000_000) return { ok: false, error: `${label}: unit price must be a dollar amount, 0 or more.` };
  }
  return { ok: true };
}

/** One sentence per changed line, for the "Adjustment Details" box. */
export function describeChanges(lines: AdjLine[]): string {
  const parts: string[] = [];
  for (const l of lines) {
    if (l.originalQuantity == null) parts.push(`${l.productName}: not on the original quotation (${l.quantity} received)`);
    else if (l.quantity !== l.originalQuantity) parts.push(`${l.productName}: quoted ${l.originalQuantity}, received ${l.quantity}`);
    else if (l.originalUnitPrice != null && roundMoney(l.unitPrice) !== roundMoney(l.originalUnitPrice)) parts.push(`${l.productName}: price changed from $${l.originalUnitPrice.toFixed(2)} to $${l.unitPrice.toFixed(2)}`);
  }
  return parts.join("; ");
}
