"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { receivingPackagePhotos, receivingPackages } from "@/db/schema";
import { requireOrg } from "@/lib/tenant";
import { canWritePayment } from "@/lib/permissions";
import { auditReceiving } from "@/lib/receiving-service";

export type AccountsActionState = { ok?: boolean; error?: string };

/**
 * Accounts marks an order Paid. The order must be one Receiving sent to Accounts ("Need to Be Paid") and must have
 * its payment receipt attached. The app stamps the date and time (never typed), and the order moves to Paid in the
 * Receiving record too -- it is the same Accounts Decision / Accounts Status that Receiving's Step 10 shows.
 * The customer email is not sent from here: that belongs to the Customer Service department.
 */
export async function markOrderPaid(packageId: string): Promise<AccountsActionState> {
  const org = await requireOrg();
  if (!canWritePayment(org.role)) return { error: "Only Accounts can mark an order Paid." };

  const [p] = await db
    .select()
    .from(receivingPackages)
    .where(and(eq(receivingPackages.id, packageId), eq(receivingPackages.organizationId, org.organizationId)))
    .limit(1);
  if (!p) return { error: "That order wasn't found." };
  if (p.accountsStatus === "PAID") return { error: "This order is already marked Paid." };
  if (p.status === "IN_PROGRESS" || p.accountsDecision !== "NEED_TO_BE_PAID") return { error: "This order isn't waiting to be paid." };

  const [receipt] = await db
    .select({ id: receivingPackagePhotos.id })
    .from(receivingPackagePhotos)
    .where(and(eq(receivingPackagePhotos.packageId, packageId), eq(receivingPackagePhotos.organizationId, org.organizationId), eq(receivingPackagePhotos.kind, "PAYMENT_CONFIRMATION")))
    .limit(1);
  if (!receipt) return { error: "Attach the payment receipt first, then mark the order Paid." };

  // The condition makes a double click harmless: only the first one changes anything.
  const res = await db
    .update(receivingPackages)
    .set({ accountsDecision: "PAID", accountsStatus: "PAID", paidAt: sql`(current_timestamp)` as unknown as string, updatedAt: sql`(current_timestamp)` })
    .where(
      and(
        eq(receivingPackages.id, packageId),
        eq(receivingPackages.organizationId, org.organizationId),
        eq(receivingPackages.accountsDecision, "NEED_TO_BE_PAID"),
        or(isNull(receivingPackages.accountsStatus), ne(receivingPackages.accountsStatus, "PAID")),
      ),
    );
  if (res.rowsAffected === 0) return { error: "This order isn't waiting to be paid." };

  await auditReceiving(org, p.quotationId, "accounts", "Paid in Accounts (payment receipt attached)");
  revalidatePath("/dashboard/accounts", "layout");
  revalidatePath("/dashboard/receiving", "layout");
  revalidatePath("/dashboard/purchasing/quotations");
  return { ok: true };
}
