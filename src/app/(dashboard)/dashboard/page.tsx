import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { canViewPurchasing } from "@/lib/permissions";

// Home of the dashboard: Purchasing for everyone who can open it, Receiving
// for the Receiver role (who has no Purchasing access). The accountant's day
// is the Accounts department, and Customer Service agents work in the Customer Service department, so that is where they land.
export default async function DashboardIndexPage() {
  const org = await requireOrg();
  if (org.role === "accountant") redirect("/dashboard/accounts");
  if (org.role === "customer_service") redirect("/dashboard/customer-service");
  redirect(canViewPurchasing(org.role) ? "/dashboard/purchasing" : "/dashboard/receiving");
}
