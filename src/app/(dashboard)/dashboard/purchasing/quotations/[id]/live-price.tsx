"use client";

// The live price shown while a quotation line is being added or edited. It uses the same formula as the server
// (src/lib/purchasing-price.ts): Standard price x Expiry % x Condition %. The server works the price out again when the
// line is saved, so what is saved is always the server's figure; this just shows it early.

import { useState } from "react";
import { pct, priceBreakdown, roundCents, type PriceBreakdown } from "@/lib/purchasing-price";

export const money = (n: number) => `$${n.toFixed(2)}`;

/**
 * Holds the manual price for one line. The price is "automatic" until the agent types a different one; changing the
 * product, condition, expiry or custom payout puts it back to automatic (a stale manual price after changing the
 * condition would be the wrong price to quote).
 */
export function useManualPrice(initial: string | null = null) {
  const [manual, setManual] = useState<string | null>(initial);
  return { manual, setManual, reset: () => setManual(null) };
}

export function LivePrice({
  b,
  quantity,
  manual,
  onManual,
  canOverride,
  notAccepting,
  missing,
  idPrefix,
}: {
  /** null while there is not enough chosen to work out a price (no product yet). */
  b: PriceBreakdown | null;
  quantity: number;
  manual: string | null;
  onManual: (v: string | null) => void;
  canOverride: boolean;
  /** The product's standard price is $0: it is not being accepted. */
  notAccepting: boolean;
  /** Plain-language things still to choose ("a condition"), shown instead of a total. */
  missing: string[];
  idPrefix: string;
}) {
  if (!b) {
    return (
      <div className="w-full rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500 dark:bg-slate-800/50 dark:text-slate-400" id={`${idPrefix}-price`}>
        Choose a product and its standard price appears here, then the condition and expiry adjust it.
      </div>
    );
  }
  const manualNum = manual !== null && manual.trim() !== "" ? Number(manual) : null;
  const manualValid = manualNum !== null && !Number.isNaN(manualNum) && manualNum >= 0;
  const isOverride = manualValid && roundCents(manualNum) !== b.unitPrice;
  const unit = isOverride ? roundCents(manualNum) : b.unitPrice;
  const qty = Number.isFinite(quantity) && quantity > 0 ? quantity : 0;

  return (
    <div className="w-full rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-50" id={`${idPrefix}-price`}>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 tabular-nums">
        <span>
          Standard price <strong>{money(b.standardPrice)}</strong>
        </span>
        <span aria-hidden>×</span>
        <span>
          Expiry <strong>{pct(b.expiryMultiplier)}</strong>
        </span>
        <span aria-hidden>×</span>
        <span>
          Condition <strong>{pct(b.conditionMultiplier)}</strong>
        </span>
        <span aria-hidden>=</span>
        <span>
          Automatic price <strong data-testid={`${idPrefix}-auto`}>{money(b.unitPrice)}</strong> each
        </span>
      </p>
      {missing.length > 0 && <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">Not chosen yet: {missing.join(", ")} (counted as 100% for now).</p>}
      {notAccepting && (
        <p className="mt-1 text-xs font-medium text-red-700 dark:text-red-300">
          This product&apos;s standard price is $0, so it is not being accepted. {canOverride ? "You can still quote it by typing a price below." : "A manager can quote it with a manual price."}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-slate-600 dark:text-slate-300">
          Price each ($){canOverride ? "" : " (automatic)"}
          <input
            id={`${idPrefix}-unit`}
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            readOnly={!canOverride}
            value={manual ?? b.unitPrice.toFixed(2)}
            onChange={(e) => onManual(e.target.value)}
            className="w-32 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm tabular-nums outline-none focus:border-emerald-600 read-only:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:read-only:bg-slate-800/50"
          />
        </label>
        {isOverride && canOverride && <input type="hidden" name="overrideUnitPrice" value={String(unit)} />}
        {isOverride && canOverride && (
          <button type="button" className="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-white dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800" onClick={() => onManual(null)}>
            Back to automatic {money(b.unitPrice)}
          </button>
        )}
        <p className="pb-2 text-sm tabular-nums">
          {qty > 0 ? (
            <>
              {qty} × {money(unit)} = <strong data-testid={`${idPrefix}-total`}>{money(roundCents(unit * qty))}</strong>
            </>
          ) : (
            "Enter a quantity"
          )}
          {isOverride && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">Manual price</span>}
        </p>
      </div>
    </div>
  );
}

export { priceBreakdown };
