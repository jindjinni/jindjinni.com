import { requireOrg } from "@/lib/tenant";
import { canWritePurchasing } from "@/lib/permissions";
import { getPurchasingQuotationsSummary } from "@/lib/queries";
import { QuotationsTable } from "./quotations-table";

// Importing a big file reads and writes many rows in one request.
export const maxDuration = 60;

export default async function PurchasingQuotationsPage() {
  const org = await requireOrg();
  const quotations = await getPurchasingQuotationsSummary(org.organizationId);

  return (
    // Breaks out of the dashboard shell's max-w-5xl so the wide summary
    // table (10 columns) has real room, instead of squeezing every column
    // or scrolling sideways. Capped at max-w-[100rem] so it doesn't stretch
    // edge-to-edge on an ultra-wide monitor.
    <div className="mx-[calc(50%-50vw)] w-screen px-4 sm:px-8">
      <div className="mx-auto max-w-[100rem]">
        <QuotationsTable quotations={quotations} canImport={canWritePurchasing(org.role)} />
      </div>
    </div>
  );
}
