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
    // The Purchasing layout gives this page the whole width beside the sidebar, so the wide summary table
    // (10 columns) has real room. Capped at max-w-[100rem] so it doesn't stretch edge-to-edge on an ultra-wide monitor.
    <div className="w-full">
      <div className="mx-auto max-w-[100rem]">
        <QuotationsTable quotations={quotations} canImport={canWritePurchasing(org.role)} />
      </div>
    </div>
  );
}
