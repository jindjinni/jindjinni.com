import { requireOrg } from "@/lib/tenant";
import { getPurchasingBonusTiers } from "@/lib/queries";
import { createPurchasingBonusTier, updatePurchasingBonusTier } from "@/app/actions/purchasing";

const inputClass =
  "rounded-md border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800";

export default async function PurchasingBonusTiersPage() {
  const org = await requireOrg();
  const tiers = await getPurchasingBonusTiers(org.organizationId, { includeInactive: true });
  const canEdit = org.role !== "staff";

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Bonus tiers</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Automatic bonus added once a quotation&rsquo;s items total crosses a threshold -- separate from, and additive to, a quotation&rsquo;s manual deduction. The highest threshold the total reaches wins.
      </p>

      {canEdit && (
        <form
          action={createPurchasingBonusTier}
          className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
        >
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Threshold ($)</span>
            <input name="thresholdAmount" type="number" step="0.01" min="0" required className={`w-28 ${inputClass}`} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Bonus ($)</span>
            <input name="bonusAmount" type="number" step="0.01" min="0" required className={`w-28 ${inputClass}`} />
          </label>
          <button type="submit" className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800">
            Add tier
          </button>
        </form>
      )}

      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3 font-medium">Threshold</th>
              <th className="px-4 py-3 font-medium">Bonus</th>
              <th className="px-4 py-3 font-medium">Active</th>
            </tr>
          </thead>
          <tbody>
            {tiers.map((t) => (
              <tr key={t.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                {canEdit ? (
                  <td colSpan={3} className="px-4 py-2">
                    <form action={updatePurchasingBonusTier.bind(null, t.id)} className="flex items-center gap-3">
                      <span className="text-slate-500">$</span>
                      <input
                        name="thresholdAmount"
                        type="number"
                        step="0.01"
                        min="0"
                        defaultValue={t.thresholdAmount}
                        className={`w-28 ${inputClass}`}
                      />
                      <span className="text-slate-500">→ $</span>
                      <input
                        name="bonusAmount"
                        type="number"
                        step="0.01"
                        min="0"
                        defaultValue={t.bonusAmount}
                        className={`w-28 ${inputClass}`}
                      />
                      <label className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400">
                        <input type="checkbox" name="active" defaultChecked={t.active} /> Active
                      </label>
                      <button type="submit" className="text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400">
                        Save
                      </button>
                    </form>
                  </td>
                ) : (
                  <>
                    <td className="px-4 py-3 text-slate-900 dark:text-slate-50">${t.thresholdAmount.toFixed(2)}+</td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">${t.bonusAmount.toFixed(2)}</td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{t.active ? "Yes" : "No"}</td>
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
