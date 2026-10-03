"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/tenant";
import { db } from "@/db/client";
import { inventoryReceipts, inventoryTransactions, products, conditions } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { newId } from "@/lib/ids";

export type ActionState = { error?: string } | undefined;

/**
 * Logs a receiving entry and immediately posts it to the ledger -- mirrors
 * the Airtable base's receiving automation: no approval step, the receipt
 * posts the moment it's entered, and on-hand only ever moves through this
 * append-only transaction log, never by editing a Product field by hand.
 */
export async function receiveStock(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const org = await requireOrg();

  const productId = String(formData.get("productId") ?? "");
  const conditionId = String(formData.get("conditionId") ?? "");
  const quantity = Number(formData.get("quantity"));
  const expirationDate = String(formData.get("expirationDate") ?? "").trim() || null;

  if (!productId || !conditionId) return { error: "Choose a product and a condition." };
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return { error: "Quantity received must be a whole number greater than zero." };
  }

  // Belt-and-suspenders: confirm both references actually belong to this
  // org before writing anything, since a product/condition id is an
  // opaque string a client could in principle tamper with.
  const [product] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.organizationId, org.organizationId)))
    .limit(1);
  const [condition] = await db
    .select({ id: conditions.id })
    .from(conditions)
    .where(and(eq(conditions.id, conditionId), eq(conditions.organizationId, org.organizationId)))
    .limit(1);
  if (!product || !condition) return { error: "That product or condition wasn't found." };

  const receiptId = newId("receipt");
  await db.insert(inventoryReceipts).values({
    id: receiptId,
    organizationId: org.organizationId,
    productId,
    conditionId,
    quantityReceived: quantity,
    expirationDate,
    posted: true,
  });
  await db.insert(inventoryTransactions).values({
    id: newId("txn"),
    organizationId: org.organizationId,
    productId,
    conditionId,
    quantityChange: quantity,
    type: "RECEIVED",
    inventoryReceiptId: receiptId,
  });

  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard/receive");
  revalidatePath("/dashboard");
}
