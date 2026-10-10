import { DocsPage } from "../docs-page";
import { requireSalesOrders } from "./gate";

export const dynamic = "force-dynamic";

export default async function SalesOrdersPage() {
  await requireSalesOrders();
  return <DocsPage kind="SALES_ORDER" />;
}
