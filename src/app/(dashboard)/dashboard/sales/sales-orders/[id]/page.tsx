import { DocDetailPage } from "../../doc-pages";
import { requireSalesOrders } from "../gate";

export const dynamic = "force-dynamic";

export default async function SalesOrderDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ revise?: string }> }) {
  await requireSalesOrders();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  return <DocDetailPage kind="SALES_ORDER" id={id} revise={sp.revise === "1"} />;
}
