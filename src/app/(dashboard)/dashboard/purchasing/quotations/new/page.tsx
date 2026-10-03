import Link from "next/link";
import { requireOrg } from "@/lib/tenant";
import { getPurchasingCustomers, purchasingCustomerName } from "@/lib/queries";
import { createPurchasingQuotation } from "@/app/actions/purchasing";

export default async function NewQuotationPage({
  searchParams,
}: {
  searchParams: Promise<{ customerId?: string }>;
}) {
  const org = await requireOrg();
  const { customerId } = await searchParams;
  const customers = await getPurchasingCustomers(org.organizationId);

  return (
    <div>
      <p className="text-sm">
        <Link href="/dashboard/purchasing/quotations" className="text-emerald-700 hover:underline dark:text-emerald-400">
          ← Quotations
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-50">Generate quotation</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Pick the customer, then add quoted lines on the next page.
      </p>

      {customers.length === 0 ? (
        <p className="mt-6 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-950 dark:text-amber-400">
          No customers yet.{" "}
          <Link href="/dashboard/purchasing/customers" className="font-medium hover:underline">
            Add one first
          </Link>
          .
        </p>
      ) : (
        <form
          action={createPurchasingQuotation}
          className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
        >
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600 dark:text-slate-400">Customer</span>
            <select
              name="customerId"
              required
              defaultValue={customerId ?? ""}
              className="min-w-[14rem] rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800"
            >
              <option value="" disabled>
                Choose a customer
              </option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {purchasingCustomerName(c)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-slate-600 dark:text-slate-400">Quotation date</span>
            <input
              name="quotationDate"
              type="date"
              defaultValue={new Date().toISOString().slice(0, 10)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
          >
            Start quotation
          </button>
        </form>
      )}
    </div>
  );
}
