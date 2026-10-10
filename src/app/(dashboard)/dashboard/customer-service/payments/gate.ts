import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { canViewCustomerService } from "@/lib/permissions";
import { receivablesOn } from "@/lib/receivable-service";

/** Every Payments Received page: a person who can open Customer Service, in a company the "receivables" rollout switch is on for. Anyone else gets "not found". */
export async function requirePayments() {
  const org = await requireOrg();
  if (!canViewCustomerService(org.role, org.access) || !(await receivablesOn(org.organizationId))) notFound();
  return org;
}
