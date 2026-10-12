"use client";

import { useActionState, useState } from "react";
import { saveStorefrontAction } from "@/app/actions/storefront";

type Initial = { handle: string; displayName: string; welcomeText: string; sellOpen: boolean; buyOpen: boolean; ordersOpen: boolean; orderReviewOver: string; hidden: boolean; checkoutOpen: boolean; checkoutFlagOver: string; checkoutLabelMax: string; checkoutLabelsPerDay: string; checkoutOrdersPerCustomer: string };

export function StorefrontForm({ initial, base, suggestion }: { initial: Initial; base: string; suggestion: string }) {
  const [state, action, pending] = useActionState(saveStorefrontAction, undefined);
  const [handle, setHandle] = useState(initial.handle || suggestion);
  const field = "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900";
  return (
    <form action={action} className="mt-6 flex max-w-xl flex-col gap-5" data-testid="sf-settings-form">
      <label className="text-sm font-medium text-slate-800 dark:text-slate-100">Name visitors see
        <input name="displayName" required maxLength={80} defaultValue={initial.displayName} className={field} data-testid="sfs-name" />
      </label>
      <label className="text-sm font-medium text-slate-800 dark:text-slate-100">Web address
        <input name="handle" required maxLength={40} value={handle} onChange={(e) => setHandle(e.target.value)} className={field} data-testid="sfs-handle" />
        <span className="mt-1 block break-all text-xs font-normal text-slate-500">Your page: <span className="font-mono" data-testid="sfs-preview">{base}/s/{handle || "your-name"}</span></span>
      </label>
      <label className="text-sm font-medium text-slate-800 dark:text-slate-100">Welcome words <span className="font-normal text-slate-400">(optional)</span>
        <textarea name="welcomeText" rows={3} maxLength={600} defaultValue={initial.welcomeText} className={field} data-testid="sfs-welcome" />
      </label>
      <label className="flex items-start gap-2 text-sm text-slate-800 dark:text-slate-100">
        <input type="checkbox" name="sellOpen" defaultChecked={initial.sellOpen} className="mt-1" data-testid="sfs-sell" />
        <span><span className="font-medium">Open the &ldquo;Sell to us&rdquo; page.</span><br /><span className="text-slate-500">Sellers can send you a list of what they have. It lands in Purchasing &rarr; Website orders (typed lists).</span></span>
      </label>
      <fieldset className="flex flex-col gap-4 rounded-lg border border-slate-200 p-4 dark:border-slate-700" data-testid="sfs-checkout-box">
        <legend className="px-1 text-sm font-semibold text-slate-800 dark:text-slate-100">Automatic checkout: &ldquo;Sell us your supplies&rdquo;</legend>
        <label className="flex items-start gap-2 text-sm text-slate-800 dark:text-slate-100">
          <input type="checkbox" name="checkoutOpen" defaultChecked={initial.checkoutOpen} className="mt-1" data-testid="sfs-checkout" />
          <span><span className="font-medium">Let customers sell to you with no staff help.</span><br /><span className="text-slate-500">A customer picks products, sees what you will pay (from your own price list), gives a shipping address and a bank account to be paid into, and submits. A quotation is made, one free shipping label is bought from your carrier account, and both are emailed. Each order shows in Purchasing &rarr; Website orders. Needs your carrier (Shippo) connected in Settings.</span></span>
        </label>
        <p className="text-xs text-slate-500">Limits (leave a box empty to use the standard setting). Orders that go past a limit are still saved; they are flagged for your team instead of getting an automatic label.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-800 dark:text-slate-100">Flag orders over <span className="font-normal text-slate-400">(dollars, standard $2,000)</span>
            <input name="checkoutFlagOver" inputMode="decimal" maxLength={12} defaultValue={initial.checkoutFlagOver} className={field} data-testid="sfs-flag-over" />
          </label>
          <label className="text-sm font-medium text-slate-800 dark:text-slate-100">No automatic label over <span className="font-normal text-slate-400">(dollars, standard $10,000)</span>
            <input name="checkoutLabelMax" inputMode="decimal" maxLength={12} defaultValue={initial.checkoutLabelMax} className={field} data-testid="sfs-label-max" />
          </label>
          <label className="text-sm font-medium text-slate-800 dark:text-slate-100">Labels bought per day <span className="font-normal text-slate-400">(standard 40)</span>
            <input name="checkoutLabelsPerDay" inputMode="numeric" maxLength={5} defaultValue={initial.checkoutLabelsPerDay} className={field} data-testid="sfs-labels-day" />
          </label>
          <label className="text-sm font-medium text-slate-800 dark:text-slate-100">Orders per customer per day <span className="font-normal text-slate-400">(standard 3)</span>
            <input name="checkoutOrdersPerCustomer" inputMode="numeric" maxLength={4} defaultValue={initial.checkoutOrdersPerCustomer} className={field} data-testid="sfs-orders-customer" />
          </label>
        </div>
      </fieldset>
      <label className="flex items-start gap-2 text-sm text-slate-800 dark:text-slate-100">
        <input type="checkbox" name="buyOpen" defaultChecked={initial.buyOpen} className="mt-1" data-testid="sfs-buy" />
        <span><span className="font-medium">Let pharmacies apply for an account.</span><br /><span className="text-slate-500">A pharmacy sends its license details; your team approves it in Sales &rarr; Web accounts. Only approved pharmacies can sign in.</span></span>
      </label>
      <label className="flex items-start gap-2 text-sm text-slate-800 dark:text-slate-100">
        <input type="checkbox" name="ordersOpen" defaultChecked={initial.ordersOpen} className="mt-1" data-testid="sfs-orders" />
        <span><span className="font-medium">Let approved pharmacies place orders.</span><br /><span className="text-slate-500">They see only their own price list, with &ldquo;In stock&rdquo; or &ldquo;Out of stock&rdquo; (never counts), and orders are confirmed automatically. Each order lands in Sales &rarr; Sales orders marked &ldquo;From the website&rdquo; and holds its stock until you invoice it. Needs Sales orders turned on.</span></span>
      </label>
      <label className="text-sm font-medium text-slate-800 dark:text-slate-100">Hold orders over this amount for review <span className="font-normal text-slate-400">(optional, in dollars)</span>
        <input name="orderReviewOver" inputMode="decimal" maxLength={12} defaultValue={initial.orderReviewOver} placeholder="Leave empty to confirm every order automatically" className={field} data-testid="sfs-review" />
        <span className="mt-1 block text-xs font-normal text-slate-500">A larger order is still received and holds its stock, but waits for your team to accept or decline it in Sales orders.</span>
      </label>
      <label className="flex items-start gap-2 text-sm text-slate-800 dark:text-slate-100">
        <input type="checkbox" name="hidden" defaultChecked={initial.hidden} className="mt-1" data-testid="sfs-hidden" />
        <span><span className="font-medium">Hide my whole page for now.</span><br /><span className="text-slate-500">Visitors see &ldquo;not found&rdquo;. Nothing is deleted; untick to bring it back.</span></span>
      </label>
      {state?.error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:text-red-200" role="alert" data-testid="sfs-error">{state.error}</p>}
      {state?.saved && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" role="status" data-testid="sfs-saved">Saved.</p>}
      <div><button disabled={pending} className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60" data-testid="sfs-save">{pending ? "Saving..." : "Save"}</button></div>
    </form>
  );
}
