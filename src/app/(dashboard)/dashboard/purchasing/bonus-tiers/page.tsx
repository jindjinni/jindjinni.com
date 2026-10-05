import { isPurchasingManager } from "@/lib/permissions";
import { requireOrg } from "@/lib/tenant";
import { getPurchasingBonusTiers } from "@/lib/queries";
import { createPurchasingBonusTier } from "@/app/actions/purchasing";
import { BonusTierRow } from "./bonus-tier-row";

const inputClass =
  "rounded-md border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800";

export default async function PurchasingBonusTiersPage() {
  const org = await requireOrg();
  const tiers = await getPurchasingBonusTiers(org.organizationId, { includeInactive: true });
  const canEdit = isPurchasingManager(org.role);

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Bonus Management</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Automatic bonus added once a quotation&rsquo;s items total crosses a threshold -- separate from, and additive to, a quotation&rsquo;s manual deduction. The highest threshold the total reaches wins.
          </p>
        </div>
      </div>

      {canEdit && (
        <form
          action={createPurchasingBonusTier}
          className="mt-6 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white shadow-sm p-6 dark:border-slate-800 dark:bg-slate-900"
        >
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Threshold ($)</span>
            <input name="thresholdAmount" type="number" step="0.01" min="0" required className={`w-28 ${inputClass}`} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Bonus ($)</span>
            <input name="bonusAmount" type="number" step="0.01" min="0" required className={`w-28 ${inputClass}`} />
          </label>
          <label className="flex min-w-[14rem] flex-1 flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Description</span>
            <input name="description" placeholder="e.g. Get $20 bonus for orders over $2000+" className={inputClass} />
          </label>
          <button type="submit" className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800">
            + Add Bonus
          </button>
        </form>
      )}

      <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3 font-medium">#</th>
              <th className="px-4 py-3 font-medium">Threshold</th>
              <th className="px-4 py-3 font-medium">Bonus</th>
              <th className="px-4 py-3 font-medium">Description</th>
              <th className="px-4 py-3 font-medium">Status</th>
              {canEdit && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody>
            {tiers.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  No bonus tiers yet -- add one above.
                </td>
              </tr>
            )}
            {tiers.map((t, i) =>
              canEdit ? (
                <BonusTierRow key={t.id} tier={t} rowNumber={i + 1} />
              ) : (
                <tr key={t.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{i + 1}</td>
                  <td className="px-4 py-3 text-slate-900 dark:text-slate-50">${t.thresholdAmount.toFixed(2)}</td>
                  <td className="px-4 py-3 text-slate-900 dark:text-slate-50">${t.bonusAmount.toFixed(2)}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{t.description || "—"}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{t.active ? "Active" : "Inactive"}</td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
