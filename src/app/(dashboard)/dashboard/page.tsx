import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { canViewPurchasing } from "@/lib/permissions";

// Home of the dashboard: Purchasing for everyone who can open it, Receiving
// for the Receiver role (who has no Purchasing access).
export default async function DashboardIndexPage() {
  const org = await requireOrg();
  redirect(canViewPurchasing(org.role) ? "/dashboard/purchasing" : "/dashboard/receiving");
}
