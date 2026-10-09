import { DocsPage } from "../docs-page";
import { requireSalesPo } from "./gate";

export const dynamic = "force-dynamic";

export default async function SalesPurchaseOrdersPage() {
  await requireSalesPo();
  return <DocsPage kind="PURCHASE_ORDER" />;
}
