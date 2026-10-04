import { requireOrg } from "@/lib/tenant";
import { getPurchasingExpirationRanges } from "@/lib/queries";
import { createPurchasingExpirationRange } from "@/app/actions/purchasing";
import { MonthRangeRow } from "./month-range-row";

const inputClass =
  "rounded-md border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800";

export default async function PurchasingExpirationRangesPage() {
  const org = await requireOrg();
  const ranges = await getPurchasingExpirationRanges(org.organizationId, { includeInactive: true });
  const canEdit = org.role !== "staff";

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Month Range</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            How much of a product&rsquo;s standard price applies based on how many months are left before it expires. This default applies to every product at that range unless a product has its own override set on its product page.
          </p>
        </div>
      </div>

      {canEdit && (
        <form
          action={createPurchasingExpirationRange}
          className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
        >
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Expiration Option</span>
            <input name="label" required placeholder="e.g. 7-9 months" className={`w-40 ${inputClass}`} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Price Multiplier (×)</span>
            <input name="defaultMultiplier" type="number" step="0.01" min="0" defaultValue="1" className={`w-24 ${inputClass}`} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Range Start</span>
            <input name="minMonths" type="number" className={`w-24 ${inputClass}`} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Range End (Months)</span>
            <input name="maxMonths" type="number" className={`w-28 ${inputClass}`} />
          </label>
          <button type="submit" className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800">
            + Add Month Range
          </button>
          <p className="w-full text-xs text-slate-400">Leave Range End empty for a single month value (e.g. &ldquo;12+ months&rdquo;).</p>
        </form>
      )}

      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3 font-medium">#</th>
              <th className="px-4 py-3 font-medium">Expiration Option</th>
              <th className="px-4 py-3 font-medium">Price Multiplier</th>
              <th className="px-4 py-3 font-medium">Range Start</th>
              <th className="px-4 py-3 font-medium">Range End (Months)</th>
              <th className="px-4 py-3 font-medium">Status</th>
              {canEdit && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody>
            {ranges.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  No month ranges yet -- add one above.
                </td>
              </tr>
            )}
            {ranges.map((r, i) =>
              canEdit ? (
                <MonthRangeRow key={r.id} range={r} rowNumber={i + 1} />
              ) : (
                <tr key={r.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{i + 1}</td>
                  <td className="px-4 py-3 text-slate-900 dark:text-slate-50">{r.label}</td>
                  <td className="px-4 py-3 tabular-nums text-slate-900 dark:text-slate-50">{r.defaultMultiplier.toFixed(2)}×</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{r.minMonths ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{r.maxMonths ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{r.active ? "Active" : "Inactive"}</td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
