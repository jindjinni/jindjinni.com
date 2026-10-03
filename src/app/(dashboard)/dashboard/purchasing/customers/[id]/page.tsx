import { notFound } from "next/navigation";
import Link from "next/link";
import { requireOrg } from "@/lib/tenant";
import { getPurchasingCustomer, purchasingCustomerName } from "@/lib/queries";
import { archivePurchasingCustomer, restorePurchasingCustomer } from "@/app/actions/purchasing";
import { EditCustomerForm } from "./edit-customer-form";
import { ActionButton } from "@/components/action-button";

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const org = await requireOrg();
  const customer = await getPurchasingCustomer(org.organizationId, id);
  if (!customer) notFound();

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

      <EditCustomerForm customerId={customer.id} customer={customer} />
    </div>
  );
}
