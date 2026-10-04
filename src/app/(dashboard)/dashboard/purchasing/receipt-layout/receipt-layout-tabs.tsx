"use client";

import { useActionState, useRef, useState } from "react";
import { updatePurchasingReceiptSettings } from "@/app/actions/purchasing";
import type { ResolvedPurchasingReceiptSettings } from "@/lib/queries";

type ActionState = { error?: string } | undefined;

const TABS = [
  { key: "banner", label: "Banner & Shipping" },
  { key: "disclaimer", label: "Disclaimer" },
  { key: "condition", label: "Mint Condition" },
  { key: "payment", label: "Payment Terms" },
  { key: "footer", label: "Footer" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800";

/**
 * Each tab is its own <form> that only names the fields it owns --
 * updatePurchasingReceiptSettings() only touches fields present in the
 * submitted FormData, so switching tabs never risks clobbering another
 * tab's values. A blank field + Save clears that column back to null,
 * which the receipt resolves as the built-in default text.
 */
export function ReceiptLayoutTabs({
  current,
  businessDisplayName,
}: {
  current: ResolvedPurchasingReceiptSettings;
  businessDisplayName: string;
}) {
  const [tab, setTab] = useState<TabKey>("banner");

  return (
    <div className="mt-6">
      <div className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={
              tab === t.key
                ? "rounded-t-md border border-b-0 border-slate-200 bg-white px-4 py-2 text-sm font-medium text-emerald-700 dark:border-slate-800 dark:bg-slate-900 dark:text-emerald-400"
                : "rounded-t-md px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="rounded-b-xl rounded-tr-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        {tab === "banner" && (
          <TabForm>
            <Field label="Limited-time-offer banner" name="bannerText" defaultValue={current.bannerText} />
            <Field
              label="Free-shipping line suffix"
              name="shippingSuffix"
              defaultValue={current.shippingSuffix}
              help={`Shown as "Total will be $(grand total) …" -- whatever you put here fills in the rest of that sentence.`}
            />
          </TabForm>
        )}

        {tab === "disclaimer" && (
          <TabForm>
            <Field
              label="Opening line"
              name="disclaimerIntro"
              defaultValue={current.disclaimerIntro}
              textarea
              help={`Use {business} anywhere you want your business name inserted (currently "${businessDisplayName}").`}
            />
            <Field label="Return policy line" name="disclaimerReturnPolicy" defaultValue={current.disclaimerReturnPolicy} textarea />
            <Field
              label="Damage / loss summary"
              name="disclaimerDamageSummary"
              defaultValue={current.disclaimerDamageSummary}
              textarea
              help="The condensed sentence covering hidden damage, packaging damage, and lost packages."
            />
          </TabForm>
        )}

        {tab === "condition" && (
          <TabForm>
            <Field label="Heading" name="conditionHeading" defaultValue={current.conditionHeading} />
            <Field
              label="Bullet points"
              name="conditionBullets"
              defaultValue={current.conditionBullets}
              textarea
              rows={5}
              help="One bullet per line. The last line prints in bold, matching the current receipt."
            />
          </TabForm>
        )}

        {tab === "payment" && (
          <TabForm>
            <Field label="Payment-timing line" name="paymentTimingText" defaultValue={current.paymentTimingText} textarea />
            <Field label="Exclusions line" name="paymentTimingSubtext" defaultValue={current.paymentTimingSubtext} />
          </TabForm>
        )}

        {tab === "footer" && (
          <TabForm>
            <Field label="Thank-you line" name="footerThankYou" defaultValue={current.footerThankYou} textarea />
          </TabForm>
        )}
      </div>
    </div>
  );
}

function TabForm({ children }: { children: React.ReactNode }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(updatePurchasingReceiptSettings, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      {children}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="self-start rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
        >
          {pending ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            const form = formRef.current;
            if (!form) return;
            form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input[name], textarea[name]").forEach((el) => {
              el.value = "";
            });
            form.requestSubmit();
          }}
          className="self-start rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:border-red-300 hover:text-red-600 dark:border-slate-700 dark:text-slate-300"
        >
          Reset to default
        </button>
        {state?.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  defaultValue,
  help,
  textarea,
  rows = 3,
}: {
  label: string;
  name: string;
  defaultValue: string;
  help?: string;
  textarea?: boolean;
  rows?: number;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-slate-700 dark:text-slate-300">{label}</span>
      {textarea ? (
        <textarea name={name} defaultValue={defaultValue} rows={rows} className={inputClass} />
      ) : (
        <input name={name} defaultValue={defaultValue} className={inputClass} />
      )}
      {help && <span className="text-xs text-slate-400">{help}</span>}
    </label>
  );
}
