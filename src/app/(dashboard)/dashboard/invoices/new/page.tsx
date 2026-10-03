import { requireOrg } from "@/lib/tenant";
import { getBuyers } from "@/lib/queries";
import { NewInvoiceForm } from "./new-invoice-form";

export default async function NewInvoicePage() {
  const org = await requireOrg();
  const buyers = await getBuyers(org.organizationId);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">
        New invoice
      </h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Starts as a draft. Nothing is deducted from inventory until you
        finalize it.
      </p>

      <NewInvoiceForm buyers={buyers} />
    </div>
  );
}
