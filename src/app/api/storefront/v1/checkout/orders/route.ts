import type { NextRequest } from "next/server";
import { done, fail, preflight, readJson, runApi } from "@/lib/storefront-api-http";
import { cleanPayout } from "@/lib/bank-rules";
import { ORDER_KEY_RE, cleanCart, cleanCheckoutCustomer } from "@/lib/checkout-rules";
import { orderToApi } from "@/lib/website-checkout-api";
import { placeCheckoutOrder } from "@/lib/website-checkout";

export const dynamic = "force-dynamic";

/**
 * Places an order from the company's own website: the same automatic checkout as the hosted page (price from the company's list, quotation,
 * one free label within the company's limits, emails). SECRET KEY ONLY, because it carries the customer's bank details: those are checked,
 * stored encrypted, and never sent back, logged or emailed. Sending the same `orderKey` twice makes one order.
 */
export async function POST(req: NextRequest) {
  return runApi(req, "checkout-create", async (ctx) => {
    if (!ctx.sf.checkoutOpen) return fail("not_open", "This company is not taking orders through its website right now.");
    const read = await readJson(req);
    if (!read.ok) return read.res;
    const b = read.body;
    const key = String(b.orderKey ?? req.headers.get("idempotency-key") ?? "");
    if (!ORDER_KEY_RE.test(key)) return fail("invalid_request", "Send an orderKey (8 to 80 letters, numbers, - or _) that is new for each order, so a retry never makes a second order.");
    const cust = (b.customer && typeof b.customer === "object" ? b.customer : {}) as Record<string, unknown>;
    const customer = cleanCheckoutCustomer({
      businessName: cust.businessName, contactName: cust.contactName, email: cust.email, phone: cust.phone, street1: cust.street1, street2: cust.street2,
      city: cust.city, state: cust.state, zip: cust.zip, residential: cust.residential, notes: cust.notes,
    });
    if (!customer.ok) return fail("invalid_request", customer.error);
    const cart = cleanCart(b.items);
    if (!cart.ok) return fail("invalid_request", cart.error);
    const pay = (b.payout && typeof b.payout === "object" && !Array.isArray(b.payout) ? b.payout : null) as Record<string, unknown> | null;
    if (!pay) return fail("invalid_request", "payout must be an object with ownerName, routingNumber, accountNumber and accountType.");
    const payout = cleanPayout({ ownerName: pay.ownerName, routingNumber: pay.routingNumber, accountNumber: pay.accountNumber, accountType: pay.accountType });
    if (!payout.ok) return fail("invalid_request", payout.error);
    const expected = b.expectedTotal === undefined || b.expectedTotal === null ? null : Number(b.expectedTotal);
    if (expected !== null && !Number.isFinite(expected)) return fail("invalid_request", "expectedTotal must be a number.");
    const r = await placeCheckoutOrder(ctx.sf, { customer: customer.value, cart: cart.lines, payout: payout.value, orderKey: key, expectedTotal: expected, source: "API" });
    if (!r.ok) {
      if (r.code === "limit") return fail("daily_limit", r.error);
      if (r.code === "closed") return fail("not_open", r.error);
      if (r.code === "price_changed") return fail("invalid_request", r.error, { newTotal: r.newTotal, reason: "price_changed" });
      return fail("invalid_request", r.error);
    }
    return done(r.created ? 201 : 200, { ...orderToApi(r.order), created: r.created, emailed: r.emailed, statusPage: r.viewUrl, bankDetails: "received" });
  });
}

export const OPTIONS = preflight;
