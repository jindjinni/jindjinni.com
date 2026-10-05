import { and, eq, like } from "drizzle-orm";
import { db } from "@/db/client";
import { purchasingCustomers, purchasingQuotations } from "@/db/schema";
import { TEST_PREFIX } from "@/lib/test-orders-data";

/**
 * Real shipments lock once they're submitted (Reopen to edit). Shipments that belong to the built-in TEST orders
 * (customer reference "TEST-0001" and so on) never lock, so anyone can open them, add photos and try every step.
 */
export async function isTestQuotation(organizationId: string, quotationId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: purchasingQuotations.id })
    .from(purchasingQuotations)
    .innerJoin(purchasingCustomers, eq(purchasingCustomers.id, purchasingQuotations.customerId))
    .where(
      and(
        eq(purchasingQuotations.id, quotationId),
        eq(purchasingQuotations.organizationId, organizationId),
        like(purchasingCustomers.customerReferenceNumber, `${TEST_PREFIX}-%`),
      ),
    )
    .limit(1);
  return !!row;
}

/** True when the shipment can't be changed: it was submitted and it isn't a test shipment. */
export async function isShipmentLocked(pkg: { status: string; organizationId: string; quotationId: string }): Promise<boolean> {
  if (pkg.status === "IN_PROGRESS") return false;
  return !(await isTestQuotation(pkg.organizationId, pkg.quotationId));
}
