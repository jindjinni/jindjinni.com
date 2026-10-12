"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { placeCheckoutOrderAction } from "@/app/actions/storefront-public";
import { AuthError, AuthField, authBtnPrimary } from "@/components/auth/auth-ui";
import { HumanCheck } from "@/components/human-check";
import { bonusFor, money } from "@/lib/checkout-rules";
import { priceBreakdown, roundCents } from "@/lib/purchasing-price";
import type { CheckoutCatalog, CheckoutProduct } from "@/lib/website-checkout";
import { OrderSummary } from "../order-summary";

type CartRow = { key: string; productId: string; expirationRangeId: string | null; conditionId: string | null; quantity: number };
const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().replace(/-/g, "") : String(Math.random()).slice(2) + Date.now());

function unitPriceOf(p: CheckoutProduct, expiryId: string | null, condId: string | null): number {
  const e = expiryId ? p.expiry.find((x) => x.id === expiryId)?.multiplier ?? 1 : 1;
  const c = condId ? p.conditions.find((x) => x.id === condId)?.multiplier ?? 1 : 1;
  return priceBreakdown(p.price, e, c).unitPrice;
}

export function CheckoutForm({ handle, catalog }: { handle: string; catalog: CheckoutCatalog }) {
  const [state, action, pending] = useActionState(placeCheckoutOrderAction.bind(null, handle), undefined);
  const [orderKey] = useState(newKey);
  const [cart, setCart] = useState<CartRow[]>([]);
  const [search, setSearch] = useState("");
  // The pick for each product row before it is added: { expiry, condition, qty }.
  const [pick, setPick] = useState<Record<string, { expiry: string; condition: string; qty: string }>>({});
  const [rowError, setRowError] = useState<string | null>(null);
  // Controlled, so everything typed is still there after an error. Bank numbers stay only in this page's memory.
  const [v, setV] = useState({ businessName: "", contactName: "", email: "", phone: "", street1: "", street2: "", city: "", state: "", zip: "", notes: "", ownerName: "", routingNumber: "", accountNumber: "", accountType: "checking" });
  const [residential, setResidential] = useState(false);
  const [confirmBank, setConfirmBank] = useState(false);
  const on = (k: keyof typeof v) => ({ name: k, value: v[k], onChange: (e: { target: { value: string } }) => setV((o) => ({ ...o, [k]: e.target.value })) });

  const byId = useMemo(() => new Map(catalog.products.map((p) => [p.id, p])), [catalog]);
  const shown = useMemo(() => {
    const t = search.trim().toLowerCase();
    const list = t ? catalog.products.filter((p) => `${p.name} ${p.code ?? ""} ${p.ndc ?? ""} ${p.category ?? ""}`.toLowerCase().includes(t)) : catalog.products;
    return list.slice(0, 40);
  }, [catalog, search]);

  const lines = cart.map((r) => {
    const p = byId.get(r.productId)!;
    const unit = unitPriceOf(p, r.expirationRangeId, r.conditionId);
    return { ...r, p, unit, total: roundCents(unit * r.quantity) };
  });
  const itemsTotal = roundCents(lines.reduce((s, l) => s + l.total, 0));
  const bonus = bonusFor(itemsTotal, catalog.bonusTiers);
  const total = roundCents(itemsTotal + bonus.bonus);

  function add(p: CheckoutProduct) {
    const pk = pick[p.id] ?? { expiry: "", condition: "", qty: "1" };
    const qty = Number(pk.qty);
    if (!Number.isInteger(qty) || qty < 1) return setRowError(`Enter how many "${p.name}" you are sending (a whole number).`);
    if (p.expiry.length > 0 && !pk.expiry) return setRowError(`Choose how long until "${p.name}" expires.`);
    if (p.conditions.length > 0 && !pk.condition) return setRowError(`Choose the condition of "${p.name}".`);
    setRowError(null);
    const expirationRangeId = p.expiry.length > 0 ? pk.expiry : null;
    const conditionId = p.conditions.length > 0 ? pk.condition : null;
    const key = `${p.id}|${expirationRangeId ?? ""}|${conditionId ?? ""}`;
    setCart((c) => {
      const hit = c.find((r) => r.key === key);
      return hit ? c.map((r) => (r.key === key ? { ...r, quantity: r.quantity + qty } : r)) : [...c, { key, productId: p.id, expirationRangeId, conditionId, quantity: qty }];
    });
    setPick((o) => ({ ...o, [p.id]: { ...pk, qty: "1" } }));
  }

  if (state?.placed) return <OrderSummary order={state.placed.order} emailed={state.placed.emailed} justPlaced />;

  const cartJson = JSON.stringify(cart.map((r) => ({ productId: r.productId, quantity: r.quantity, expirationRangeId: r.expirationRangeId, conditionId: r.conditionId })));
  const sel = "w-full rounded-lg border border-line bg-white px-2 py-2 text-sm text-ink";

  return (
    <form action={action} className="mt-8 flex flex-col gap-8" data-testid="co-form" autoComplete="off">
      <input type="hidden" name="cart" value={cartJson} />
      <input type="hidden" name="orderKey" value={orderKey} />
      <input type="hidden" name="expectedTotal" value={cart.length ? total.toFixed(2) : ""} />

      <section aria-labelledby="co-h1">
        <h2 id="co-h1" className="text-xl font-extrabold text-ink">1. What are you sending?</h2>
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by product name, NDC or brand" className="mt-3 w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm" aria-label="Search products" data-testid="co-search" />
        <ul className="mt-3 flex flex-col gap-2" data-testid="co-products">
          {shown.map((p) => {
            const pk = pick[p.id] ?? { expiry: "", condition: "", qty: "1" };
            const set = (patch: Partial<typeof pk>) => setPick((o) => ({ ...o, [p.id]: { ...pk, ...patch } }));
            const unit = unitPriceOf(p, p.expiry.length ? pk.expiry || null : null, p.conditions.length ? pk.condition || null : null);
            const ready = (!p.expiry.length || pk.expiry) && (!p.conditions.length || pk.condition);
            return (
              <li key={p.id} className="rounded-xl border border-line p-3" data-testid={`co-product-${p.id}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-bold text-ink">{p.name}{p.category ? <span className="ml-2 text-xs font-normal text-muted">{p.category}</span> : null}</p>
                  <p className="text-xs text-muted">{ready ? <>You get <span className="font-bold text-ink">{money(unit)}</span> each</> : <>Up to {money(p.price)} each</>}</p>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_90px_auto]">
                  {p.expiry.length > 0 ? (
                    <select value={pk.expiry} onChange={(e) => set({ expiry: e.target.value })} className={sel} aria-label={`Time until ${p.name} expires`} data-testid="co-expiry">
                      <option value="">Time until it expires...</option>
                      {p.expiry.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
                    </select>
                  ) : <span className="self-center text-xs text-muted">Does not expire</span>}
                  {p.conditions.length > 0 ? (
                    <select value={pk.condition} onChange={(e) => set({ condition: e.target.value })} className={sel} aria-label={`Condition of ${p.name}`} data-testid="co-condition">
                      <option value="">Condition...</option>
                      {p.conditions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  ) : <span />}
                  <input type="number" min={1} step={1} value={pk.qty} onChange={(e) => set({ qty: e.target.value })} className={sel} aria-label={`How many ${p.name}`} data-testid="co-qty" />
                  <button type="button" onClick={() => add(p)} className="rounded-full bg-ink px-4 py-2 text-sm font-bold text-white hover:opacity-90" data-testid="co-add">Add</button>
                </div>
              </li>
            );
          })}
          {shown.length === 0 && <li className="rounded-xl border border-line p-4 text-sm text-muted">No product matches that search. Try fewer letters, or contact us if you do not see what you have.</li>}
        </ul>
        {catalog.products.length > shown.length && !search && <p className="mt-2 text-xs text-muted">Showing the first {shown.length} products. Use the search to find others.</p>}
        {rowError && <p className="mt-3 text-sm font-semibold text-red-700" role="alert" data-testid="co-row-error">{rowError}</p>}
      </section>

      <section aria-labelledby="co-h2" className="rounded-2xl border border-line p-5" data-testid="co-cart">
        <h2 id="co-h2" className="text-xl font-extrabold text-ink">Your list</h2>
        {lines.length === 0 ? <p className="mt-2 text-sm text-muted" data-testid="co-empty">Nothing added yet.</p> : (
          <>
            <ul className="mt-3 flex flex-col divide-y divide-line/70">
              {lines.map((l) => (
                <li key={l.key} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm" data-testid="co-cart-line">
                  <span className="min-w-0 flex-1 text-ink">{l.p.name}<span className="block text-xs text-muted">{[l.p.expiry.find((e) => e.id === l.expirationRangeId)?.label, l.p.conditions.find((c) => c.id === l.conditionId)?.name].filter(Boolean).join(", ")}</span></span>
                  <span className="flex items-center gap-2">
                    <input type="number" min={1} step={1} value={l.quantity} onChange={(e) => { const q = Number(e.target.value); if (Number.isInteger(q) && q >= 1) setCart((c) => c.map((r) => (r.key === l.key ? { ...r, quantity: q } : r))); }} className="w-20 rounded-lg border border-line px-2 py-1 text-right text-sm" aria-label={`Quantity of ${l.p.name}`} />
                    <span className="w-24 text-right tabular-nums">{money(l.total)}</span>
                    <button type="button" onClick={() => setCart((c) => c.filter((r) => r.key !== l.key))} className="text-xs font-bold text-muted underline hover:text-ink">Remove</button>
                  </span>
                </li>
              ))}
            </ul>
            <dl className="mt-3 ml-auto flex max-w-xs flex-col gap-1 text-sm">
              {bonus.bonus > 0 && <div className="flex justify-between"><dt className="text-muted">Bonus</dt><dd className="tabular-nums" data-testid="co-bonus">{money(bonus.bonus)}</dd></div>}
              <div className="flex justify-between text-base font-extrabold text-ink"><dt>Estimated payout</dt><dd className="tabular-nums" data-testid="co-live-total">{money(total)}</dd></div>
            </dl>
            <p className="mt-2 text-xs text-muted">This is what we will pay after we receive and check your package. If something differs from what you listed, we contact you first.</p>
          </>
        )}
      </section>

      <section aria-labelledby="co-h3" className="flex flex-col gap-5">
        <h2 id="co-h3" className="text-xl font-extrabold text-ink">2. Where are you shipping from?</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <AuthField label="Business name" hint="Optional"><input {...on("businessName")} maxLength={120} autoComplete="organization" data-testid="co-business" /></AuthField>
          <AuthField label="Your name"><input {...on("contactName")} required maxLength={100} autoComplete="name" data-testid="co-contact" /></AuthField>
          <AuthField label="Email" hint="We send your quotation and label here"><input {...on("email")} type="email" required maxLength={200} autoComplete="email" data-testid="co-email" /></AuthField>
          <AuthField label="Phone" hint="The carrier needs it for your label"><input {...on("phone")} type="tel" required maxLength={40} autoComplete="tel" data-testid="co-phone" /></AuthField>
        </div>
        <fieldset className="grid gap-5 sm:grid-cols-6">
          <legend className="sr-only">Shipping address</legend>
          <div className="sm:col-span-6"><AuthField label="Street address"><input {...on("street1")} required maxLength={120} autoComplete="address-line1" data-testid="co-street1" /></AuthField></div>
          <div className="sm:col-span-6"><AuthField label="Suite, unit" hint="Optional"><input {...on("street2")} maxLength={120} autoComplete="address-line2" /></AuthField></div>
          <div className="sm:col-span-3"><AuthField label="City"><input {...on("city")} required maxLength={80} autoComplete="address-level2" data-testid="co-city" /></AuthField></div>
          <div className="sm:col-span-1"><AuthField label="State"><input {...on("state")} required maxLength={2} autoComplete="address-level1" placeholder="TX" data-testid="co-state" /></AuthField></div>
          <div className="sm:col-span-2"><AuthField label="ZIP"><input {...on("zip")} required maxLength={10} autoComplete="postal-code" inputMode="numeric" data-testid="co-zip" /></AuthField></div>
        </fieldset>
        <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" name="residential" checked={residential} onChange={(e) => setResidential(e.target.checked)} /> This is a home address</label>
        <AuthField label="Anything we should know?" hint="Optional"><textarea {...on("notes")} rows={2} maxLength={500} data-testid="co-notes" /></AuthField>
      </section>

      <section aria-labelledby="co-h4" className="flex flex-col gap-5">
        <h2 id="co-h4" className="text-xl font-extrabold text-ink">3. Where should we send your payment?</h2>
        <p className="-mt-2 text-sm text-muted">We pay by direct deposit only. Your bank details are encrypted and shown only to the few people at the company who pay orders.</p>
        <div className="grid gap-5 sm:grid-cols-2">
          <AuthField label="Account owner or business name"><input {...on("ownerName")} required maxLength={100} autoComplete="off" data-testid="co-owner" /></AuthField>
          <AuthField label="Account type">
            <select name="accountType" value={v.accountType} onChange={(e) => setV((o) => ({ ...o, accountType: e.target.value }))} data-testid="co-acct-type"><option value="checking">Checking</option><option value="savings">Savings</option></select>
          </AuthField>
          <AuthField label="Routing number" hint="9 digits"><input {...on("routingNumber")} required inputMode="numeric" maxLength={11} autoComplete="off" data-testid="co-routing" /></AuthField>
          <AuthField label="Account number"><input {...on("accountNumber")} required inputMode="numeric" maxLength={20} autoComplete="off" data-testid="co-account" /></AuthField>
        </div>
        <label className="flex items-start gap-2 text-sm text-ink"><input type="checkbox" name="confirmBank" checked={confirmBank} onChange={(e) => setConfirmBank(e.target.checked)} className="mt-1" data-testid="co-confirm" /> <span>I confirm these bank details are correct and belong to me or my business.</span></label>
      </section>

      <HumanCheck />
      {state?.error && <AuthError>{state.error}</AuthError>}
      <button type="submit" disabled={pending || cart.length === 0} className={authBtnPrimary} data-testid="co-submit">{pending ? "Placing your order..." : cart.length === 0 ? "Add something to your list first" : `Place order and get my free label (${money(total)})`}</button>
      <p className="text-center text-xs text-muted"><Link href={`/s/${handle}`} className="underline">Back to the page</Link></p>
    </form>
  );
}
