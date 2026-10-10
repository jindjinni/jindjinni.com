import { notFound } from "next/navigation";
import { requireOrg } from "@/lib/tenant";
import { canViewShipping, canWriteShipping } from "@/lib/permissions";
import { shippingOn } from "@/lib/shipping-service";

/** Every Shipping page: a person who can open Shipping, in a company the "shipping" rollout switch is on for. Anyone else gets "not found". */
export async function requireShipping() {
  const org = await requireOrg();
  if (!canViewShipping(org.role, org.access) || !(await shippingOn(org.organizationId))) notFound();
  return { org, canWrite: !org.viewAs && canWriteShipping(org.role, org.access) };
}
