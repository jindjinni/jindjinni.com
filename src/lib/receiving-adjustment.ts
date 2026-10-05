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
  /** YYYY-MM-DD, when the receiver typed one for this row. */
  expirationDate?: string | null;
};

/** "2027-07-20" -> "07/20/2027" (how the printed quotation shows expiry dates); anything else is returned as is. */
export function expiryText(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  if (!t) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : t;
}

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
    const base = {
      quotedItemId: q.id,
      productId: q.productId,
      productName: q.name,
      productCode: q.code,
      originalQuantity: q.quantity,
      originalUnitPrice: q.unitPrice,
      originalLineTotal: q.lineTotal,
      unitPrice: q.unitPrice,
    };
    // Different conditions or expiry dates arrived for the same product: one line each, so each can be priced on its own.
    const kinds = new Set(counted.map((r) => `${r.condition || ""}|${r.expirationDate || ""}`));
    if (counted.length > 1 && kinds.size > 1) {
      for (const r of counted) {
        out.push({
          ...base,
          condition: r.condition || q.condition || null,
          expiryLabel: expiryText(r.expirationDate) ?? q.expiration,
          quantity: r.quantityReceived ?? 0,
          note: null,
        });
      }
      continue;
    }
    const quantity = counted.length > 0 ? counted.reduce((a, r) => a + (r.quantityReceived ?? 0), 0) : q.quantity;
    const conds = Array.from(new Set(rows.map((r) => r.condition).filter(Boolean)));
    const condition = conds.length === 1 && conds[0] !== "Mint" ? conds[0] : conds.length > 1 ? conds.join(" / ") : q.condition;
    out.push({
      ...base,
      condition: condition ?? null,
      expiryLabel: (counted.length === 1 ? expiryText(counted[0].expirationDate) : null) ?? q.expiration,
      quantity,
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

/** One sentence per changed product, for the "Adjustment Details" box and the reason printed on the quotation. */
export function describeChanges(
  lines: { productName: string; quotedItemId?: string | null; condition?: string | null; originalQuantity?: number | null; originalUnitPrice?: number | null; quantity: number; unitPrice: number }[],
): string {
  const parts: string[] = [];
  const groups = new Map<string, typeof lines>();
  lines.forEach((l, i) => {
    const key = l.quotedItemId ? `q:${l.quotedItemId}` : `n:${i}`;
    groups.set(key, [...(groups.get(key) ?? []), l]);
  });
  for (const group of groups.values()) {
    const first = group[0];
    const qty = group.reduce((acc, l) => acc + l.quantity, 0);
    if (first.originalQuantity == null) parts.push(`${first.productName}: not on the original quotation (${qty} received)`);
    else if (qty !== first.originalQuantity) parts.push(`${first.productName}: quoted ${first.originalQuantity}, received ${qty}`);
    else if (group.length === 1 && first.originalUnitPrice != null && roundMoney(first.unitPrice) !== roundMoney(first.originalUnitPrice)) parts.push(`${first.productName}: price changed from $${first.originalUnitPrice.toFixed(2)} to $${first.unitPrice.toFixed(2)}`);
    for (const l of group) {
      const c = (l.condition ?? "").trim();
      if (/damag|crush|torn|ripp|stain|opened|dent|scratch|expired|short|missing/i.test(c)) parts.push(`${l.quantity} ${c.toLowerCase()} - ${l.productName}`);
    }
  }
  return parts.join("; ");
}
