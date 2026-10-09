import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { canViewSales } from "@/lib/permissions";
import { purchaseOrdersEnabled } from "@/lib/purchase-order-service";

/** Every Sales purchase-order page: a person who can see Sales, in a company the "purchase-orders" feature is switched on for. Anyone else gets "not found". */
export async function requireSalesPo() {
  const org = await requireOrg();
  if (!canViewSales(org.role, org.access) || !(await purchaseOrdersEnabled(org.organizationId))) notFound();
  return org;
}
