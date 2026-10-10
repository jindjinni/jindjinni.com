import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { canViewAccounts, canWritePayment } from "@/lib/permissions";
import { payablesOn } from "@/lib/payable-service";

/** Every Supplier Bills page: a person who can open Accounts, in a company the "payables" rollout switch is on for. Anyone else gets "not found". */
export async function requireBills() {
  const org = await requireOrg();
  if (!canViewAccounts(org.role, org.access) || !(await payablesOn(org.organizationId))) notFound();
  return { org, canWrite: canWritePayment(org.role, org.access) && !org.viewAs };
}
