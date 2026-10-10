import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { canViewAccounts } from "@/lib/permissions";
import { receivablesOn } from "@/lib/receivable-service";

/** Every To Be Collected page: a person who can open Accounts, in a company the "receivables" rollout switch is on for. Anyone else gets "not found". */
export async function requireCollect() {
  const org = await requireOrg();
  if (!canViewAccounts(org.role, org.access) || !(await receivablesOn(org.organizationId))) notFound();
  return org;
}
