import { requireOrg } from "@/lib/tenant";
import { canViewPurchasing } from "@/lib/permissions";
import { getPaymentTerms } from "@/lib/accounts-queries";
import { todayIn } from "@/lib/payment-due";
import { getDeliveredPackages } from "@/lib/tracking-queries";
import { DeliveredList } from "./delivered-list";

export const dynamic = "force-dynamic";

// Delivered Today: the packages Shippo says arrived, so the receiving team knows what to expect on the floor.
// Everything here is fed by the tracking in Purchasing; each name, quotation and tracking number opens the order.
export default async function DeliveredTodayPage() {
  const org = await requireOrg();
  const { timeZone } = await getPaymentTerms(org.organizationId);
  const rows = await getDeliveredPackages(org.organizationId, timeZone);
  return <DeliveredList rows={rows} today={todayIn(timeZone)} canOpenQuotation={canViewPurchasing(org.role, org.access)} />;
}
