import { requireOrg } from "@/lib/tenant";
import { getConditions } from "@/lib/queries";
import { AddConditionForm } from "./add-condition-form";

export default async function ConditionsSettingsPage() {
  const org = await requireOrg();
  const conditions = await getConditions(org.organizationId);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Conditions</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        The grading scale used across inventory, receiving, and invoice lines
        for this organization. Add as many as your grading needs -- nothing is
        hardcoded.
      </p>

      <AddConditionForm />

      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3 font-medium">Order</th>
              <th className="px-4 py-3 font-medium">Name</th>
            </tr>
          </thead>
          <tbody>
            {conditions.map((c) => (
              <tr key={c.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                <td className="px-4 py-3 text-slate-500 tabular-nums dark:text-slate-400">
                  {c.sortOrder}
                </td>
                <td className="px-4 py-3 text-slate-900 dark:text-slate-50">{c.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
