import Link from "next/link";
import { requireOrg } from "@/lib/tenant";
import { getPurchasingCustomers } from "@/lib/queries";
import { NewQuotationForm } from "./new-quotation-form";

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
        Enter the customer&rsquo;s details -- new or existing -- then add the products they&rsquo;re selling on the next step.
      </p>

      <NewQuotationForm customers={customers} preselectedCustomerId={customerId} />
    </div>
  );
}
