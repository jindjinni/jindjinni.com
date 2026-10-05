import Link from "next/link";
import { requireOrg } from "@/lib/tenant";
import { getPurchasingCustomers } from "@/lib/queries";
import { hasFullAddress } from "@/lib/purchasing-customer-rules";
import { listRecalls } from "@/lib/receiving-recall-service";
import { QuickRecallCheck } from "../quick-recall-check";
import { NewQuotationForm } from "./new-quotation-form";

export default async function NewQuotationPage({
  searchParams,
}: {
  searchParams: Promise<{ customerId?: string }>;
}) {
  const org = await requireOrg();
  const { customerId } = await searchParams;
  const recalls = await listRecalls(org.organizationId);
  const customers = (await getPurchasingCustomers(org.organizationId)).map((c) => ({
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    noAddress: !hasFullAddress({ street1: c.addressStreet1, city: c.addressCity, state: c.addressState, zip: c.addressZip }),
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
        All you need to start is the customer&rsquo;s name (a single name is fine) -- new or existing. Address, email and phone can be added later, once they decide to go ahead; the address is only needed for their free shipping label. Add the products they&rsquo;re selling on the next step.
      </p>

      <div className="mt-5 max-w-4xl">
        <QuickRecallCheck recalls={recalls} idPrefix="qrc-new" />
      </div>

      <NewQuotationForm customers={customers} preselectedCustomerId={customerId} />
    </div>
  );
}
