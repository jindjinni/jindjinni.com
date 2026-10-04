import Link from "next/link";
import { requireOrg } from "@/lib/tenant";
import { getPurchasingCustomers } from "@/lib/queries";
import { missingCustomerFields } from "@/lib/purchasing-customer-rules";
import { NewQuotationForm } from "./new-quotation-form";

export default async function NewQuotationPage({
  searchParams,
}: {
  searchParams: Promise<{ customerId?: string }>;
}) {
  const org = await requireOrg();
  const { customerId } = await searchParams;
  const customers = (await getPurchasingCustomers(org.organizationId)).map((c) => ({
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    incomplete:
      missingCustomerFields({
        firstName: c.firstName,
        lastName: c.lastName,
        street1: c.addressStreet1,
        city: c.addressCity,
        state: c.addressState,
        zip: c.addressZip,
      }).length > 0,
  }));

  return (
    <div>
      <p className="text-sm">
        <Link href="/dashboard/purchasing/quotations" className="text-emerald-700 hover:underline dark:text-emerald-400">
          ← Quotations
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-50">Generate quotation</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Enter the customer&rsquo;s name and address (a single name is fine; email and phone can be added later) -- new or existing -- then add the products they&rsquo;re selling on the next step.
      </p>

      <NewQuotationForm customers={customers} preselectedCustomerId={customerId} />
    </div>
  );
}
