import { isPurchasingManager } from "@/lib/permissions";
import { requireOrg } from "@/lib/tenant";
import { getPurchasingAuditLog } from "@/lib/queries";

export default async function PurchasingAuditLogPage() {
  const org = await requireOrg();
  if (!(isPurchasingManager(org.role) || org.role === "accountant")) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Only a Purchasing Manager or Master Admin can view the audit log.
      </p>
    );
  }
  const entries = await getPurchasingAuditLog(org.organizationId);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Audit log</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Every price override, multiplier change, tracking-number edit, and deduction/bonus override recorded with who
        and when -- most recent 200 entries.
      </p>

      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3 font-medium">When</th>
              <th className="px-4 py-3 font-medium">Record</th>
              <th className="px-4 py-3 font-medium">Field</th>
              <th className="px-4 py-3 font-medium">Before</th>
              <th className="px-4 py-3 font-medium">After</th>
              <th className="px-4 py-3 font-medium">Note</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  No audited changes yet.
                </td>
              </tr>
            )}
            {entries.map((e) => (
              <tr key={e.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{new Date(e.changedAt).toLocaleString()}</td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                  {e.recordType} · {e.recordId.slice(0, 10)}…
                </td>
                <td className="px-4 py-3 text-slate-900 dark:text-slate-50">{e.fieldName}</td>
                <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{e.previousValue ?? "—"}</td>
                <td className="px-4 py-3 text-slate-900 dark:text-slate-50">{e.newValue ?? "—"}</td>
                <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{e.note ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
