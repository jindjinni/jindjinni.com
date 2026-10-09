import { DocDetailPage } from "../../doc-pages";
import { requireSalesPo } from "../gate";

export const dynamic = "force-dynamic";

export default async function SalesPurchaseOrderDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ revise?: string }> }) {
  await requireSalesPo();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  return <DocDetailPage kind="PURCHASE_ORDER" id={id} revise={sp.revise === "1"} />;
}
