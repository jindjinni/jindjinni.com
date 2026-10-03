import Link from "next/link";
import { requireOrg } from "@/lib/tenant";
import { getSellers, hasSellerAddress } from "@/lib/queries";
import { AddSellerForm } from "./add-seller-form";

export default async function SellersPage() {
  const org = await requireOrg();
  const sellers = await getSellers(org.organizationId);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Sellers</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        People and companies sending items in to be bought back -- separate from
        your invoicing Buyers, who purchase from you.
      </p>

      <AddSellerForm />

      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Phone</th>
              <th className="px-4 py-3 font-medium">Shipping address</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {sellers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  No sellers yet. Add one above, or add them inline from a new quote.
                </td>
              </tr>
            )}
            {sellers.map((s) => (
              <tr key={s.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                <td className="px-4 py-3 text-slate-900 dark:text-slate-50">{s.name}</td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{s.email ?? "—"}</td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{s.phone ?? "—"}</td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                  {hasSellerAddress(s) ? (
                    `${s.addressStreet1}, ${s.addressCity}, ${s.addressState} ${s.addressZip}`
                  ) : (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                      Missing address
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/dashboard/sellers/${s.id}`}
                    className="text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
