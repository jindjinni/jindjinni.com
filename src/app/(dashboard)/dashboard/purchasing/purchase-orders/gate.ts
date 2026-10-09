import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { canViewPurchasing, canWritePurchasing } from "@/lib/permissions";
import { purchaseOrdersEnabled } from "@/lib/purchase-order-service";
import { getPaymentTerms } from "@/lib/accounts-queries";
import { todayIn } from "@/lib/payment-due";

/** Every purchase-order and supplier page starts here: a person who can see Purchasing, in a company that has purchase orders switched on. Anyone else gets "not found". */
export async function requirePoPage() {
  const org = await requireOrg();
  if (!canViewPurchasing(org.role, org.access) || !(await purchaseOrdersEnabled(org.organizationId))) notFound();
  const terms = await getPaymentTerms(org.organizationId).catch(() => null);
  return { org, canWrite: canWritePurchasing(org.role, org.access) && !org.viewAs, today: todayIn(terms?.timeZone ?? "America/New_York") };
}
