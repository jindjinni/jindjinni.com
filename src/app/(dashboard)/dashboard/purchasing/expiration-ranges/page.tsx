import { requireOrg } from "@/lib/tenant";
import { getPurchasingExpirationRanges } from "@/lib/queries";
import { createPurchasingExpirationRange, updatePurchasingExpirationRange } from "@/app/actions/purchasing";

const inputClass =
  "rounded-md border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800";

export default async function PurchasingExpirationRangesPage() {
  const org = await requireOrg();
  const ranges = await getPurchasingExpirationRanges(org.organizationId, { includeInactive: true });
  const canEdit = org.role !== "staff";

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Expiration ranges</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        The expiry buckets a quoted line picks from (e.g. &ldquo;7-9 months&rdquo;) -- each product&rsquo;s price multiplier is keyed to one of these, set on the product&rsquo;s page.
      </p>

      {canEdit && (
        <form
          action={createPurchasingExpirationRange}
          className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
        >
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Label</span>
            <input name="label" required placeholder="e.g. 7-9 months" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Min months</span>
            <input name="minMonths" type="number" className={`w-24 ${inputClass}`} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Max months</span>
            <input name="maxMonths" type="number" className={`w-24 ${inputClass}`} />
          </label>
          <button type="submit" className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800">
            Add range
          </button>
        </form>
      )}

      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3 font-medium">Label</th>
              <th className="px-4 py-3 font-medium">Min months</th>
              <th className="px-4 py-3 font-medium">Max months</th>
              <th className="px-4 py-3 font-medium">Active</th>
            </tr>
          </thead>
          <tbody>
            {ranges.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                {canEdit ? (
                  <td colSpan={4} className="px-4 py-2">
                    <form action={updatePurchasingExpirationRange.bind(null, r.id)} className="flex items-center gap-3">
                      <input name="label" defaultValue={r.label} className={inputClass} />
                      <input name="minMonths" type="number" defaultValue={r.minMonths ?? ""} className={`w-24 ${inputClass}`} />
                      <input name="maxMonths" type="number" defaultValue={r.maxMonths ?? ""} className={`w-24 ${inputClass}`} />
                      <label className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400">
                        <input type="checkbox" name="active" defaultChecked={r.active} /> Active
                      </label>
                      <button type="submit" className="text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400">
                        Save
                      </button>
                    </form>
                  </td>
                ) : (
                  <>
                    <td className="px-4 py-3 text-slate-900 dark:text-slate-50">{r.label}</td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{r.minMonths ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{r.maxMonths ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{r.active ? "Yes" : "No"}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
