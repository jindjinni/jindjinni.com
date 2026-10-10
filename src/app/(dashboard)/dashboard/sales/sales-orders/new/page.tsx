import { DocNewPage } from "../../doc-pages";
import { requireSalesOrders } from "../gate";

export const dynamic = "force-dynamic";

export default async function NewSalesOrderPage({ searchParams }: { searchParams: Promise<{ buyer?: string }> }) {
  await requireSalesOrders();
  const sp = await searchParams;
  return <DocNewPage kind="SALES_ORDER" buyerId={sp.buyer} />;
}
