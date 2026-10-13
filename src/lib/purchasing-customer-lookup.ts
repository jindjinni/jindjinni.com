import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { purchasingCustomers } from "@/db/schema";
import { CustomerDedupeIndex, type DedupeCandidate, type DedupeMatch } from "@/lib/purchasing-customer-dedupe";

/**
 * "Is this person already one of our customers?" -- the single check used when a customer is added by
 * hand, started from a new quotation, or edited (pass `excludeId` so a customer never matches themselves).
 * Uses the same rule as the spreadsheet import (see purchasing-customer-dedupe.ts). Archived customers are
 * ignored, the same as everywhere else in the list.
 */
export async function findDuplicateCustomer(
  organizationId: string,
  candidate: DedupeCandidate,
  excludeId?: string,
): Promise<DedupeMatch | null> {
  const rows = await db
    .select({
      id: purchasingCustomers.id,
      firstName: purchasingCustomers.firstName,
      lastName: purchasingCustomers.lastName,
      email: purchasingCustomers.email,
      phone: purchasingCustomers.phone,
      street1: purchasingCustomers.addressStreet1,
      city: purchasingCustomers.addressCity,
      zip: purchasingCustomers.addressZip,
    })
    .from(purchasingCustomers)
    .where(and(eq(purchasingCustomers.organizationId, organizationId), isNull(purchasingCustomers.archivedAt)));
  const index = new CustomerDedupeIndex();
  for (const r of rows) if (r.id !== excludeId) index.add(r.id, r);
  return index.find(candidate);
}

/** The plain-language message shown when a customer would be a duplicate. */
export function duplicateCustomerMessage(match: DedupeMatch): string {
  return `This customer is already in your list (${match.reason.charAt(0).toLowerCase()}${match.reason.slice(1)}), so it wasn't added again. Use "Existing customer" and search for them, or open them in Customers to update their details.`;
}
