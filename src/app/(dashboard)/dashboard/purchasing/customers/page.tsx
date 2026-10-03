import Link from "next/link";
import { requireOrg } from "@/lib/tenant";
import { getPurchasingCustomers, purchasingCustomerName } from "@/lib/queries";
import { AddCustomerForm } from "./add-customer-form";

export default async function PurchasingCustomersPage() {
  const org = await requireOrg();
  const customers = await getPurchasingCustomers(org.organizationId);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Customers</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Everyone we&rsquo;ve bought from. Editable by any Purchasing user -- archiving is reserved for a Purchasing Manager.
      </p>

      <AddCustomerForm />

      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Phone</th>
              <th className="px-4 py-3 font-medium">Reference #</th>
            </tr>
          </thead>
          <tbody>
            {customers.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                  No customers yet -- add one above.
                </td>
              </tr>
            )}
            {customers.map((c) => (
              <tr key={c.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                <td className="px-4 py-3">
                  <Link
                    href={`/dashboard/purchasing/customers/${c.id}`}
                    className="font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                  >
                    {purchasingCustomerName(c)}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{c.email ?? "—"}</td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{c.phone ?? "—"}</td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{c.customerReferenceNumber ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
