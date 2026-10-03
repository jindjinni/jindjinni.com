import { requireOrg } from "@/lib/tenant";
import { getPurchasingConditions } from "@/lib/queries";
import { createPurchasingCondition, updatePurchasingCondition } from "@/app/actions/purchasing";

const inputClass =
  "rounded-md border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800";

export default async function PurchasingConditionsPage() {
  const org = await requireOrg();
  const conditions = await getPurchasingConditions(org.organizationId, { includeInactive: true });
  const canEdit = org.role !== "staff";

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Conditions</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Purchasing&rsquo;s own grading scale. An optional multiplier (default 1.0) applies on top of a line&rsquo;s expiration-range price if your pricing uses condition-based adjustments.
      </p>

      {canEdit && (
        <form
          action={createPurchasingCondition}
          className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
        >
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Condition name</span>
            <input name="name" required placeholder="e.g. Mint" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Multiplier</span>
            <input name="multiplier" type="number" step="0.01" min="0" defaultValue={1} className={`w-24 ${inputClass}`} />
          </label>
          <button type="submit" className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800">
            Add condition
          </button>
        </form>
      )}

      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Multiplier</th>
              <th className="px-4 py-3 font-medium">Active</th>
            </tr>
          </thead>
          <tbody>
            {conditions.map((c) => (
              <tr key={c.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                {canEdit ? (
                  <td colSpan={3} className="px-4 py-2">
                    <form action={updatePurchasingCondition.bind(null, c.id)} className="flex items-center gap-3">
                      <input name="name" defaultValue={c.name} className={inputClass} />
                      <input
                        name="multiplier"
                        type="number"
                        step="0.01"
                        min="0"
                        defaultValue={c.multiplier}
                        className={`w-24 ${inputClass}`}
                      />
                      <label className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400">
                        <input type="checkbox" name="active" defaultChecked={c.active} /> Active
                      </label>
                      <button type="submit" className="text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400">
                        Save
                      </button>
                    </form>
                  </td>
                ) : (
                  <>
                    <td className="px-4 py-3 text-slate-900 dark:text-slate-50">{c.name}</td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{c.multiplier}</td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{c.active ? "Yes" : "No"}</td>
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
