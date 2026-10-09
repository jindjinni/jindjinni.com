"use client";

import { useState } from "react";
import { RequiredStar } from "@/components/required-marks";
import { OPERATION_FREE_NOTE, OPERATION_OPTIONS, OPERATION_QUESTION, type OperationType } from "@/lib/operation-type";

/**
 * "What type of operation do you run?" -- Wholesaler, Distributor or Both, as three big choices with a plain description each.
 * The answer is sent as the field `operationType`. Required on the sign-up page (red asterisk there); on the Settings page it is
 * the same choice with a Save button. The choice is held in state here, so React 19's form reset never clears it.
 *
 * `variant="auth"` is the sign-up look (green brand); `variant="app"` is the dashboard look.
 */
export function OperationTypeField({
  initial = null,
  variant = "auth",
  onChange,
}: {
  initial?: OperationType | null;
  variant?: "auth" | "app";
  onChange?: (v: OperationType) => void;
}) {
  const [value, setValue] = useState<OperationType | null>(initial);
  const auth = variant === "auth";
  const card = (on: boolean) =>
    auth
      ? `flex cursor-pointer gap-3 rounded-2xl border p-4 transition ${on ? "border-brand-deep bg-white shadow-[0_0_0_3px_rgb(31,209,107,0.25)]" : "border-line bg-white hover:border-ink"}`
      : `flex cursor-pointer gap-3 rounded-lg border p-4 transition ${on ? "border-slate-900 bg-slate-50 dark:border-slate-100 dark:bg-slate-800" : "border-slate-200 bg-white hover:border-slate-400 dark:border-slate-800 dark:bg-slate-900"}`;
  return (
    <fieldset className="flex flex-col gap-3 sm:col-span-2" data-testid="operation-type-field">
      <legend className={auth ? "mb-1 text-sm font-bold text-ink" : "mb-1 text-sm font-semibold text-slate-900 dark:text-slate-50"}>
        {OPERATION_QUESTION}
        <RequiredStar required />
      </legend>
      <div className="grid gap-3 sm:grid-cols-3">
        {OPERATION_OPTIONS.map((o, i) => (
          <label key={o.value} className={card(value === o.value)} data-testid={`operation-${o.value}`}>
            <input
              type="radio"
              name="operationType"
              value={o.value}
              checked={value === o.value}
              required={i === 0}
              onChange={() => {
                setValue(o.value);
                onChange?.(o.value);
              }}
              className="mt-1 h-4 w-4 shrink-0"
            />
            <span className="flex flex-col gap-1">
              <span className={auth ? "text-base font-extrabold text-ink" : "text-sm font-semibold text-slate-900 dark:text-slate-50"}>{o.label}</span>
              <span className={auth ? "text-sm text-muted" : "text-xs text-slate-600 dark:text-slate-300"}>{o.description}</span>
            </span>
          </label>
        ))}
      </div>
      <p className={auth ? "text-sm text-muted" : "text-xs text-slate-600 dark:text-slate-300"} data-testid="operation-free-note">{OPERATION_FREE_NOTE}</p>
    </fieldset>
  );
}
