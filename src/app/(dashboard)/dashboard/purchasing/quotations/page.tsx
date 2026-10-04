import { requireOrg } from "@/lib/tenant";
import { getPurchasingQuotationsSummary } from "@/lib/queries";
import { QuotationsTable } from "./quotations-table";

export default async function PurchasingQuotationsPage() {
  const org = await requireOrg();
  const quotations = await getPurchasingQuotationsSummary(org.organizationId);

  return (
    <div>
      <QuotationsTable quotations={quotations} />
    </div>
  );
}
