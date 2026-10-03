import Link from "next/link";
import { requireOrg } from "@/lib/tenant";
import { getReceivingShipments } from "@/lib/queries";

const receivingStyles: Record<string, string> = {
  IN_PROGRESS: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  COMPLETE: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  COMPLETE_WITH_DISCREPANCY: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
};

const accountsStyles: Record<string, string> = {
  IN_REVIEW: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  PAID: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
};

export default async function ReceivingShipmentsPage() {
  const org = await requireOrg();
  const shipments = await getReceivingShipments(org.organizationId);

  return (
    <div>
      <p className="text-sm">
        <Link href="/dashboard/buyback" className="text-emerald-700 hover:underline dark:text-emerald-400">
          ← Operations Center
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-50">
        Receiving shipments
      </h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Every package logged against a buyback order, across every seller.
      </p>

      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3 font-medium">Seller</th>
              <th className="px-4 py-3 font-medium">Reference</th>
              <th className="px-4 py-3 font-medium">Receiving</th>
              <th className="px-4 py-3 font-medium">Accounts</th>
            </tr>
          </thead>
          <tbody>
            {shipments.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                  Nothing received yet.
                </td>
              </tr>
            )}
            {shipments.map((s) => (
              <tr key={s.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                <td className="px-4 py-3">
                  <Link
                    href={`/dashboard/buyback/shipments/${s.id}`}
                    className="font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                  >
                    {s.sellerName}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                  {s.orderReference ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${receivingStyles[s.receivingStatus]}`}>
                    {s.receivingStatus.replaceAll("_", " ")}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${accountsStyles[s.accountsStatus]}`}>
                    {s.accountsStatus.replaceAll("_", " ")}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
