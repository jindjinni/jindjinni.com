import { DocNewPage } from "../../doc-pages";
import { requireSalesPo } from "../gate";

export const dynamic = "force-dynamic";

export default async function NewSalesPurchaseOrderPage({ searchParams }: { searchParams: Promise<{ buyer?: string }> }) {
  await requireSalesPo();
  const sp = await searchParams;
  return <DocNewPage kind="PURCHASE_ORDER" buyerId={sp.buyer} />;
}
