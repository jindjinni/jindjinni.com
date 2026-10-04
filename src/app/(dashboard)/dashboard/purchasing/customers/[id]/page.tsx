import { notFound } from "next/navigation";
import Link from "next/link";
import { requireOrg } from "@/lib/tenant";
import { getPurchasingCustomer, getPurchasingQuotationsForCustomer, purchasingCustomerName } from "@/lib/queries";
import { missingContactDetails, missingCustomerFields } from "@/lib/purchasing-customer-rules";
import { archivePurchasingCustomer, restorePurchasingCustomer } from "@/app/actions/purchasing";
import { EditCustomerForm } from "./edit-customer-form";
import { ActionButton } from "@/components/action-button";

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const org = await requireOrg();
  const customer = await getPurchasingCustomer(org.organizationId, id);
  if (!customer) notFound();

  const quotations = await getPurchasingQuotationsForCustomer(org.organizationId, customer.id);
  const activeQuotations = quotations.filter((q) => !q.archivedAt);
  const lifetimeTotal = activeQuotations.reduce((sum, q) => sum + q.grandTotal, 0);
  const missing = missingCustomerFields({
    firstName: customer.firstName,
    lastName: customer.lastName,
    street1: customer.addressStreet1,
    city: customer.addressCity,
    state: customer.addressState,
    zip: customer.addressZip,
  });
  const missingContact = missingContactDetails({ email: customer.email, phone: customer.phone });
  const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const statusLabel: Record<string, string> = { QUOTED: "Quoted", CONFIRMED: "Confirmed", RECEIVED: "Received", CANCELLED: "Cancelled" };

  return (
    <div>
      <p className="text-sm">
        <Link href="/dashboard/purchasing/customers" className="text-emerald-700 hover:underline dark:text-emerald-400">
          ← Customers
        </Link>
      </p>
      <div className="mt-2 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">
          {purchasingCustomerName(customer)}
          {customer.archivedAt && (
            <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-800">
              Archived
            </span>
          )}
        </h1>
        <div className="flex shrink-0 gap-3">
          <Link
            href={`/dashboard/purchasing/quotations/new?customerId=${customer.id}`}
            className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800"
          >
            New quotation
          </Link>
          {org.role !== "staff" && !customer.archivedAt && (
            <ActionButton
              action={archivePurchasingCustomer.bind(null, customer.id)}
              label="Archive"
              pendingLabel="Archiving..."
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:border-red-300 hover:text-red-600 dark:border-slate-700 dark:text-slate-300"
            />
          )}
          {org.role !== "staff" && customer.archivedAt && (
            <ActionButton
              action={restorePurchasingCustomer.bind(null, customer.id)}
              label="Restore"
              pendingLabel="Restoring..."
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:border-emerald-300 hover:text-emerald-700 dark:border-slate-700 dark:text-slate-300"
            />
          )}
        </div>
      </div>

      {missing.length > 0 && (
        <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          This profile is incomplete. Still needed: {missing.join(", ")}. Fill these in and save before starting a new quotation or label.
        </p>
      )}
      {missing.length === 0 && missingContact.length > 0 && (
        <p className="mt-3 rounded-md bg-sky-50 px-3 py-2 text-sm text-sky-800 dark:bg-sky-950 dark:text-sky-200">
          Still to collect: {missingContact.join(" and ")}. Quotations and shipping labels work without it &mdash; add it below whenever you get it.
        </p>
      )}

      <EditCustomerForm customerId={customer.id} customer={customer} />

      <section className="mt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Quotations</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {activeQuotations.length} quotation{activeQuotations.length === 1 ? "" : "s"} · {money(lifetimeTotal)} total
          </p>
        </div>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Every reference number created for {purchasingCustomerName(customer)}.
        </p>
        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Reference #</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Tracking</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {quotations.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                    No quotations yet for this customer.
                  </td>
                </tr>
              )}
              {quotations.map((q) => (
                <tr key={q.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                  <td className="whitespace-nowrap px-4 py-3">
                    <Link
                      href={`/dashboard/purchasing/quotations/${q.id}`}
                      className="font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                    >
                      {q.quotationNumber}
                    </Link>
                    {q.archivedAt && (
                      <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-800">
                        Archived
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-700 dark:text-slate-300">{q.quotationDate}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{statusLabel[q.status] ?? q.status}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{q.trackingNumber ?? "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-900 dark:text-slate-50">{money(q.grandTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
