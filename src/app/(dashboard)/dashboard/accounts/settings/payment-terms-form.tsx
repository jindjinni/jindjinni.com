"use client";

import { useMemo, useState, useTransition } from "react";
import { addClosureDay, removeClosureDay, savePaymentTerms } from "@/app/actions/accounts";
import { addBusinessDays, isBusinessDay, MAX_BUSINESS_DAYS, US_TIME_ZONES } from "@/lib/payment-due";
import { dayHeading } from "@/lib/accounts-rules";

type Initial = { businessDays: number; skipUsHolidays: boolean; timeZone: string };
type Closure = { id: string; day: string; label: string | null };

const field = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900";
const card = "rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900";

export function PaymentTermsForm({
  canEdit,
  initial,
  closures,
  today,
  holidays,
}: {
  canEdit: boolean;
  initial: Initial;
  closures: Closure[];
  today: string;
  holidays: { year: number; list: { day: string; name: string }[] }[];
}) {
  const [days, setDays] = useState(String(initial.businessDays));
  const [skip, setSkip] = useState(initial.skipUsHolidays);
  const [tz, setTz] = useState(initial.timeZone);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [newDay, setNewDay] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [closureError, setClosureError] = useState("");

  const n = Number(days);
  const valid = days.trim() !== "" && Number.isInteger(n) && n >= 0 && n <= MAX_BUSINESS_DAYS;
  const closureDays = useMemo(() => closures.map((c) => c.day), [closures]);
  const preview = valid ? addBusinessDays(today, n, { skipUsHolidays: skip, closureDays }) : "";
  const upcoming = closures.filter((c) => c.day >= today);
  const past = closures.filter((c) => c.day < today);

  function save() {
    setError("");
    setMessage("");
    startTransition(async () => {
      const res = await savePaymentTerms({ businessDays: n, skipUsHolidays: skip, timeZone: tz });
      if (res.error) setError(res.error);
      else setMessage("Saved. To Be Paid now uses these terms.");
    });
  }

  function addClosure() {
    setClosureError("");
    startTransition(async () => {
      const res = await addClosureDay(newDay, newLabel);
      if (res.error) setClosureError(res.error);
      else {
        setNewDay("");
        setNewLabel("");
      }
    });
  }

  function removeClosure(id: string) {
    setClosureError("");
    startTransition(async () => {
      const res = await removeClosureDay(id);
      if (res.error) setClosureError(res.error);
    });
  }

  return (
    <div className="mt-5 space-y-5">
      {!canEdit && (
        <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200" data-testid="pt-readonly">
          You can see the payment terms here. An owner or admin changes them.
        </p>
      )}

      <section className={card}>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">When a customer must be paid</h2>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-800 dark:text-slate-100">
          <span>We pay within</span>
          <label className="sr-only" htmlFor="pt-days">Business days to pay after delivery</label>
          <input id="pt-days" data-testid="pt-days" type="number" min={0} max={MAX_BUSINESS_DAYS} step={1} inputMode="numeric" disabled={!canEdit} className={`${field} w-20 tabular-nums`} value={days} onChange={(e) => setDays(e.target.value)} />
          <span>business days after the package is delivered.</span>
        </div>
        <p className="mt-2 text-xs text-slate-500">Business days skip Saturdays, Sundays and the days below. The day of delivery isn&apos;t counted: delivered on a Friday with 3 business days is due the next Wednesday.</p>

        <label className="mt-4 flex items-start gap-3 text-sm">
          <input id="pt-holidays" data-testid="pt-holidays" type="checkbox" disabled={!canEdit} className="mt-0.5 h-5 w-5 accent-emerald-700" checked={skip} onChange={(e) => setSkip(e.target.checked)} />
          <span>
            <span className="block font-medium text-slate-900 dark:text-slate-50">Skip US federal holidays</span>
            <span className="block text-xs text-slate-500">The days banks are closed (listed below) don&apos;t count as business days.</span>
          </span>
        </label>

        <div className="mt-4">
          <label htmlFor="pt-tz" className="mb-1 block text-sm font-medium">Company time zone</label>
          <select id="pt-tz" data-testid="pt-tz" disabled={!canEdit} className={field} value={tz} onChange={(e) => setTz(e.target.value)}>
            {US_TIME_ZONES.map((z) => (
              <option key={z.value} value={z.value}>{z.label}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">Decides which calendar day a delivery and &ldquo;today&rdquo; fall on.</p>
        </div>

        <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-100" data-testid="pt-preview">
          {valid ? (
            <>
              Example: a package delivered today ({dayHeading(today)}) is due <strong>{dayHeading(preview)}</strong>.
            </>
          ) : (
            <>Enter a whole number of business days from 0 to {MAX_BUSINESS_DAYS}.</>
          )}
        </p>

        {canEdit && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" data-testid="pt-save" disabled={pending || !valid} onClick={save} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
              {pending ? "Saving…" : "Save payment terms"}
            </button>
            {message && <span className="text-sm text-green-700 dark:text-green-400" role="status" data-testid="pt-message">{message}</span>}
            {error && <span className="text-sm text-red-700 dark:text-red-400" role="alert" data-testid="pt-error">{error}</span>}
          </div>
        )}
      </section>

      <section className={card}>
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">Days your company is closed</h2>
        <p className="mt-1 text-xs text-slate-500">Anything extra that shouldn&apos;t count toward the payment terms: a company holiday, an office shutdown. Weekends and US federal holidays are already handled.</p>
        {canEdit && (
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div>
              <label htmlFor="closure-add-day" className="mb-1 block text-xs font-medium">Date</label>
              <input id="closure-add-day" data-testid="closure-add-day" type="date" className={field} value={newDay} onChange={(e) => setNewDay(e.target.value)} />
            </div>
            <div className="min-w-[10rem] flex-1">
              <label htmlFor="closure-add-label" className="mb-1 block text-xs font-medium">What for (optional)</label>
              <input id="closure-add-label" data-testid="closure-add-label" maxLength={80} className={`${field} w-full`} placeholder="Day after Thanksgiving" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
            </div>
            <button type="button" data-testid="closure-add" disabled={pending || !newDay} onClick={addClosure} className="rounded-lg border border-emerald-700 px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-50 dark:text-emerald-300 dark:hover:bg-emerald-950">
              Add closed day
            </button>
          </div>
        )}
        {closureError && <p className="mt-2 text-sm text-red-700 dark:text-red-400" role="alert" data-testid="closure-error">{closureError}</p>}
        {closures.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500" data-testid="closure-none">No extra closed days.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800" data-testid="closure-list">
            {[...upcoming, ...past].map((c) => (
              <li key={c.id} data-testid="closure-row" className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                <span className="font-medium text-slate-900 dark:text-slate-50">{dayHeading(c.day)}</span>
                {c.label && <span className="text-slate-600 dark:text-slate-300">{c.label}</span>}
                {c.day < today && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] text-slate-700 dark:bg-slate-800 dark:text-slate-200">Past</span>}
                {!isBusinessDay(c.day, { skipUsHolidays: false, closureDays: [] }) && <span className="text-xs text-slate-500">(already a weekend)</span>}
                {canEdit && (
                  <button type="button" data-testid="closure-remove" disabled={pending} onClick={() => removeClosure(c.id)} className="ml-auto text-xs font-medium text-red-700 hover:underline disabled:opacity-50 dark:text-red-400">
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <details className={card} data-testid="holiday-list">
        <summary className="cursor-pointer text-sm font-semibold text-slate-900 dark:text-slate-50">US federal holidays {skip ? "skipped" : "(not skipped right now)"}</summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {holidays.map((h) => (
            <div key={h.year}>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{h.year}</p>
              <ul className="mt-1 space-y-0.5 text-sm text-slate-700 dark:text-slate-200">
                {h.list.map((x) => (
                  <li key={x.day} className={skip ? "" : "opacity-60"}>
                    <span className="tabular-nums">{dayHeading(x.day).replace(/, \d{4}$/, "")}</span> · {x.name}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">A holiday on a Saturday is observed the Friday before; on a Sunday, the Monday after.</p>
      </details>
    </div>
  );
}
