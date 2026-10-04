import { requireOrg } from "@/lib/tenant";
import { getPurchasingConditions } from "@/lib/queries";
import { ConditionsManager } from "./conditions-manager";

export default async function PurchasingConditionsPage() {
  const org = await requireOrg();
  const conditions = await getPurchasingConditions(org.organizationId, { includeInactive: true });
  const canEdit = org.role !== "staff";

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Conditions</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        The grading scale a quoted line can be priced against -- Mint pays full price, a lower grade pays a percentage of it. A line can also use a one-off custom condition and payout instead of picking one of these.
      </p>

      {canEdit ? (
        <div className="mt-6">
          <ConditionsManager conditions={conditions} />
        </div>
      ) : (
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
                  <td className="px-4 py-3 text-slate-900 dark:text-slate-50">{c.name}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{c.multiplier.toFixed(2)}×</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{c.active ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
