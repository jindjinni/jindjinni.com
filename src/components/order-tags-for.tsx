import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { receivingPackages } from "@/db/schema";
import { requireOrg } from "@/lib/tenant";
import { featureOn } from "@/lib/features";
import { canSendCustomerEmails, canWriteAccounts } from "@/lib/permissions";
import { orderTagInfo } from "@/lib/customer-service-queries";
import { OrderTags } from "@/components/order-tags";

/** The order's two small tags, for pages that don't already load the order (feature `order-tags`; renders nothing when it is off). */
export async function OrderTagsFor({ packageId }: { packageId: string }) {
  const org = await requireOrg();
  if (!(await featureOn("order-tags", org.organizationId))) return null;
  const [p] = await db
    .select()
    .from(receivingPackages)
    .where(and(eq(receivingPackages.id, packageId), eq(receivingPackages.organizationId, org.organizationId)))
    .limit(1);
  if (!p || p.status === "IN_PROGRESS") return null;
  const canSet = !org.viewAs && (canWriteAccounts(org.role, org.access) || canSendCustomerEmails(org.role, org.access));
  return <OrderTags packageId={packageId} tags={await orderTagInfo(p)} canSet={canSet} />;
}
