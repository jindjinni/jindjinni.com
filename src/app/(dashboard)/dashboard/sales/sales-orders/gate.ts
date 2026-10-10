import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { canViewSales } from "@/lib/permissions";
import { salesOrdersOn } from "@/lib/sales-service";

/** Sales orders come with the "sales-orders" rollout switch; the pages 404 while it is off for the company (a hidden link is never the only guard). */
export async function requireSalesOrders() {
  const org = await requireOrg();
  if (!canViewSales(org.role, org.access) || !(await salesOrdersOn(org.organizationId))) notFound();
  return org;
}
