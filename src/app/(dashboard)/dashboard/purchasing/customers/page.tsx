import Link from "next/link";
import { requireOrg } from "@/lib/tenant";
import { getPurchasingCustomers, getPurchasingQuotationCountsByCustomer, purchasingCustomerName } from "@/lib/queries";
import { missingContactDetails, missingCustomerFields } from "@/lib/purchasing-customer-rules";
import { AddCustomerForm } from "./add-customer-form";
import { ImportSpreadsheetForm } from "../import-spreadsheet-form";
import { importPurchasingCustomers } from "@/app/actions/purchasing";

export default async function PurchasingCustomersPage() {
  const org = await requireOrg();
  const [customers, quoteCounts] = await Promise.all([
    getPurchasingCustomers(org.organizationId),
    getPurchasingQuotationCountsByCustomer(org.organizationId),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Customers</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Everyone we&rsquo;ve bought from. Every customer needs a name (one name is fine); address, email and phone can be added later, once they decide to go ahead. Open a customer to edit them and see all of their quotations.
      </p>

      <ImportSpreadsheetForm
        action={importPurchasingCustomers}
        title="Import from CSV/Excel"
        columnsHelp={"Required columns: Name (or First Name; Last Name is optional), Address, City, State, Zip. Rows missing any of these are skipped and listed. Optional: Email, Phone, Reference #. Duplicates are never added: someone with the same email, or the same name and phone, is skipped and shown in the list below."}
        templateFilename="customers-template.csv"
        templateHeaders={["First Name", "Last Name", "Email", "Phone", "Address", "City", "State", "Zip"]}
        templateSampleRow={["Jordan", "Alvarez", "jordan@example.com", "555-010-0100", "123 Main St", "Springfield", "IL", "62701"]}
      />

      <AddCustomerForm />

      <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Phone</th>
              <th className="px-4 py-3 font-medium">Address</th>
              <th className="px-4 py-3 text-right font-medium">Quotations</th>
            </tr>
          </thead>
          <tbody>
            {customers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
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
                  {missingCustomerFields({
                    firstName: c.firstName,
                    lastName: c.lastName,
                    street1: c.addressStreet1,
                    city: c.addressCity,
                    state: c.addressState,
                    zip: c.addressZip,
                  }).length > 0 ? (
                    <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                      Incomplete
                    </span>
                  ) : (
                    missingContactDetails({ email: c.email, phone: c.phone, street1: c.addressStreet1, city: c.addressCity, state: c.addressState, zip: c.addressZip }).length > 0 && (
                      <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800 dark:bg-sky-950 dark:text-sky-200">
                        Needs {missingContactDetails({ email: c.email, phone: c.phone, street1: c.addressStreet1, city: c.addressCity, state: c.addressState, zip: c.addressZip }).join(" & ")}
                      </span>
                    )
                  )}
                </td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{c.email ?? "—"}</td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{c.phone ?? "—"}</td>
                <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                  {[c.addressStreet1, c.addressCity, [c.addressState, c.addressZip].filter(Boolean).join(" ")]
                    .filter(Boolean)
                    .join(", ") || "—"}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-300">
                  {quoteCounts.get(c.id) ?? 0}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
