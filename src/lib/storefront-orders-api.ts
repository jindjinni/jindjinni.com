// The pharmacy-order calls of the website connection (/api/storefront/v1/pharmacies/...). Secret key only: the company's own website
// signs its pharmacies in itself and tells us which pharmacy (by the id from the lookup) is ordering. The pharmacy must be an approved,
// not-hidden account of THIS company's storefront, and ordering must be open; every price and stock level is still set here, not by the website.

import { fail, type ApiCtx, type ApiResult } from "@/lib/storefront-api-http";
import { loadOrderBuyer, orderingOpen, type OrderBuyer, type OrderView } from "@/lib/storefront-orders";
import { ORDER_REFERENCE_PATTERN } from "@/lib/storefront-order-rules";

/** The pharmacy a call is about, or the error to send back. Another company's pharmacy, a missing one and a suspended one all look the same. */
export async function pharmacyFor(ctx: ApiCtx, id: string): Promise<{ ok: true; buyer: OrderBuyer } | { ok: false; res: ApiResult }> {
  if (!(await orderingOpen(ctx.sf))) return { ok: false, res: fail("not_open", "This company is not taking online orders right now.") };
  if (!/^[A-Za-z0-9_-]{3,80}$/.test(id)) return { ok: false, res: fail("not_found", "No approved pharmacy with that id.") };
  const buyer = await loadOrderBuyer(ctx.sf, id);
  if (!buyer) return { ok: false, res: fail("not_found", "No approved pharmacy with that id.") };
  return { ok: true, buyer };
}

export const validReference = (raw: string) => ORDER_REFERENCE_PATTERN.test(raw.toUpperCase());

export const orderJson = (o: OrderView) => ({
  reference: o.reference,
  status: o.state,
  createdAt: o.createdAt,
  poNumber: o.poNumber,
  total: o.total,
  items: o.lines.map((l) => ({ name: l.name, condition: l.condition, quantity: l.quantity, unitPrice: l.unitPrice, lineTotal: l.lineTotal })),
});
