"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { requireOrg } from "@/lib/tenant";
import { db } from "@/db/client";
import {
  sellers,
  buybackOrders,
  buybackOrderItems,
  receivingShipments,
  receivedItems,
  inventoryTransactions,
  products,
  conditions,
} from "@/db/schema";
import { newId } from "@/lib/ids";

export type ActionState = { error?: string } | undefined;

export async function createSeller(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const org = await requireOrg();

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Enter the seller's name." };

  await db.insert(sellers).values({
    id: newId("seller"),
    organizationId: org.organizationId,
    name,
    email: String(formData.get("email") ?? "").trim() || null,
    phone: String(formData.get("phone") ?? "").trim() || null,
    shippingAddress: String(formData.get("shippingAddress") ?? "").trim() || null,
  });

  revalidatePath("/dashboard/sellers");
}

/**
 * Starts a buyback order -- the quote given to a seller before anything
 * ships. Quoted line items are added separately on the order detail page,
 * same add-then-redirect pattern as a draft invoice.
 */
export async function createBuybackOrder(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const org = await requireOrg();

  const sellerId = String(formData.get("sellerId") ?? "");
  if (!sellerId) return { error: "Choose a seller." };

  const orderId = newId("bborder");
  await db.insert(buybackOrders).values({
    id: orderId,
    organizationId: org.organizationId,
    sellerId,
    orderReference: String(formData.get("orderReference") ?? "").trim() || null,
    orderDate: new Date().toISOString().slice(0, 10),
    trackingNumber: String(formData.get("trackingNumber") ?? "").trim() || null,
  });

  revalidatePath("/dashboard/buyback");
  revalidatePath("/dashboard/buyback/orders");
  redirect(`/dashboard/buyback/${orderId}`);
}

async function requireOrgOrder(organizationId: string, orderId: string) {
  const [order] = await db
    .select()
    .from(buybackOrders)
    .where(and(eq(buybackOrders.id, orderId), eq(buybackOrders.organizationId, organizationId)))
    .limit(1);
  return order ?? null;
}

async function recomputeOrderQuotedTotal(orderId: string) {
  const items = await db
    .select({ quotedQuantity: buybackOrderItems.quotedQuantity, quotedUnitPrice: buybackOrderItems.quotedUnitPrice })
    .from(buybackOrderItems)
    .where(eq(buybackOrderItems.orderId, orderId));
  const total = items.reduce((sum, i) => sum + i.quotedQuantity * i.quotedUnitPrice, 0);
  await db.update(buybackOrders).set({ quotedTotal: total }).where(eq(buybackOrders.id, orderId));
}

export async function addQuotedItem(
  orderId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const org = await requireOrg();
  const order = await requireOrgOrder(org.organizationId, orderId);
  if (!order) return { error: "Order not found." };

  const lineLabel = String(formData.get("lineLabel") ?? "").trim();
  const quotedQuantity = Number(formData.get("quotedQuantity"));
  const quotedUnitPrice = Number(formData.get("quotedUnitPrice"));
  if (!lineLabel) return { error: "Describe what's being quoted." };
  if (!Number.isInteger(quotedQuantity) || quotedQuantity <= 0) {
    return { error: "Quantity must be a whole number greater than zero." };
  }
  if (Number.isNaN(quotedUnitPrice) || quotedUnitPrice < 0) {
    return { error: "Unit price must be a positive number." };
  }

  const productId = String(formData.get("productId") ?? "") || null;

  await db.insert(buybackOrderItems).values({
    id: newId("bbitem"),
    orderId,
    productId,
    lineLabel,
    productCodeVariant: String(formData.get("productCodeVariant") ?? "").trim() || null,
    quotedQuantity,
    quotedUnitPrice,
  });

  await recomputeOrderQuotedTotal(orderId);
  revalidatePath(`/dashboard/buyback/${orderId}`);
}

export async function removeQuotedItem(
  quotedItemId: string,
  _prevState: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const org = await requireOrg();

  const [item] = await db
    .select({ id: buybackOrderItems.id, orderId: buybackOrderItems.orderId })
    .from(buybackOrderItems)
    .innerJoin(buybackOrders, eq(buybackOrderItems.orderId, buybackOrders.id))
    .where(
      and(eq(buybackOrderItems.id, quotedItemId), eq(buybackOrders.organizationId, org.organizationId)),
    )
    .limit(1);
  if (!item) return { error: "Quoted line not found." };

  await db.delete(buybackOrderItems).where(eq(buybackOrderItems.id, quotedItemId));
  await recomputeOrderQuotedTotal(item.orderId);
  revalidatePath(`/dashboard/buyback/${item.orderId}`);
}

/** Opens the physical receiving workflow for an order's incoming package. */
export async function createReceivingShipment(
  orderId: string,
  _prevState: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const org = await requireOrg();
  const order = await requireOrgOrder(org.organizationId, orderId);
  if (!order) return { error: "Order not found." };

  const shipmentId = newId("shipment");
  await db.insert(receivingShipments).values({
    id: shipmentId,
    organizationId: org.organizationId,
    orderId,
    receivedByUserId: org.userId,
    receivedAt: new Date().toISOString(),
  });

  revalidatePath(`/dashboard/buyback/${orderId}`);
  revalidatePath("/dashboard/buyback");
  redirect(`/dashboard/buyback/shipments/${shipmentId}`);
}

async function requireOrgShipment(organizationId: string, shipmentId: string) {
  const [shipment] = await db
    .select()
    .from(receivingShipments)
    .where(
      and(eq(receivingShipments.id, shipmentId), eq(receivingShipments.organizationId, organizationId)),
    )
    .limit(1);
  return shipment ?? null;
}

/** Step 3/4 of the old Airtable flow, collapsed into one save: the packaging verdict. */
export async function updateShipmentPackaging(
  shipmentId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const org = await requireOrg();
  const shipment = await requireOrgShipment(org.organizationId, shipmentId);
  if (!shipment) return { error: "Shipment not found." };

  const packagingCondition = String(formData.get("packagingCondition") ?? "") || null;
  const packagingIssueNotes = String(formData.get("packagingIssueNotes") ?? "").trim() || null;
  if (packagingCondition === "NOT_ACCEPTABLE" && !packagingIssueNotes) {
    return { error: "Explain what was wrong with the packaging." };
  }

  await db
    .update(receivingShipments)
    .set({
      packagingCondition: packagingCondition as "ACCEPTABLE" | "NOT_ACCEPTABLE" | null,
      packagingIssueNotes,
    })
    .where(eq(receivingShipments.id, shipmentId));

  revalidatePath(`/dashboard/buyback/shipments/${shipmentId}`);
}

export async function addReceivedItem(
  shipmentId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const org = await requireOrg();
  const shipment = await requireOrgShipment(org.organizationId, shipmentId);
  if (!shipment) return { error: "Shipment not found." };
  if (shipment.receivingStatus !== "IN_PROGRESS") {
    return { error: "This shipment is already complete -- reopen it to log more items." };
  }

  const productId = String(formData.get("productId") ?? "");
  const conditionId = String(formData.get("conditionId") ?? "");
  const quantityReceived = Number(formData.get("quantityReceived"));
  if (!productId || !conditionId) return { error: "Choose a product and a condition." };
  if (!Number.isInteger(quantityReceived) || quantityReceived < 0) {
    return { error: "Quantity received must be zero or a positive whole number." };
  }

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

  const quantityToBeReturned = Number(formData.get("quantityToBeReturned") ?? 0) || 0;

  await db.insert(receivedItems).values({
    id: newId("recvitem"),
    shipmentId,
    quotedItemId: String(formData.get("quotedItemId") ?? "") || null,
    productId,
    conditionId,
    itemSource: (String(formData.get("itemSource") ?? "QUOTED") as "QUOTED" | "EXTRA"),
    wasReceived: (String(formData.get("wasReceived") ?? "YES") as "YES" | "NO" | "PARTIAL"),
    quantityReceived,
    expirationDate: String(formData.get("expirationDate") ?? "").trim() || null,
    discrepancyNotes: String(formData.get("discrepancyNotes") ?? "").trim() || null,
    returnRequired: formData.get("returnRequired") === "on",
    quantityToBeReturned,
  });

  revalidatePath(`/dashboard/buyback/shipments/${shipmentId}`);
}

export async function removeReceivedItem(
  receivedItemId: string,
  _prevState: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const org = await requireOrg();

  const [item] = await db
    .select({ id: receivedItems.id, shipmentId: receivedItems.shipmentId, posted: receivedItems.postedToInventory })
    .from(receivedItems)
    .innerJoin(receivingShipments, eq(receivedItems.shipmentId, receivingShipments.id))
    .where(
      and(eq(receivedItems.id, receivedItemId), eq(receivingShipments.organizationId, org.organizationId)),
    )
    .limit(1);
  if (!item) return { error: "Item not found." };
  if (item.posted) return { error: "This item already posted to inventory -- it can't be removed." };

  await db.delete(receivedItems).where(eq(receivedItems.id, receivedItemId));
  revalidatePath(`/dashboard/buyback/shipments/${item.shipmentId}`);
}

/**
 * Marks receiving done and posts every not-yet-posted item into the same
 * inventory_transactions ledger the manual "receive stock" form and
 * invoices' finalize step write to -- this is the one place receiving
 * becomes real, sellable on-hand stock. Payment (Accounts) is a separate
 * step and does not gate this: the stock is real the moment it's verified,
 * whether or not the seller has been paid for it yet.
 */
export async function completeReceiving(
  shipmentId: string,
  _prevState: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const org = await requireOrg();
  const shipment = await requireOrgShipment(org.organizationId, shipmentId);
  if (!shipment) return { error: "Shipment not found." };
  if (shipment.receivingStatus !== "IN_PROGRESS") return { error: "Already completed." };

  const lines = await db
    .select()
    .from(receivedItems)
    .where(eq(receivedItems.shipmentId, shipmentId));
  if (lines.length === 0) return { error: "Log at least one received item first." };

  const hasDiscrepancy = lines.some(
    (l) => l.wasReceived !== "YES" || !!l.discrepancyNotes || l.returnRequired,
  );

  await db.transaction(async (tx) => {
    for (const line of lines) {
      if (line.postedToInventory || line.quantityReceived <= 0) continue;
      await tx.insert(inventoryTransactions).values({
        id: newId("txn"),
        organizationId: org.organizationId,
        productId: line.productId,
        conditionId: line.conditionId,
        quantityChange: line.quantityReceived,
        type: "RECEIVED",
        receivedItemId: line.id,
      });
      await tx
        .update(receivedItems)
        .set({ postedToInventory: true })
        .where(eq(receivedItems.id, line.id));
    }
    await tx
      .update(receivingShipments)
      .set({
        receivingStatus: hasDiscrepancy ? "COMPLETE_WITH_DISCREPANCY" : "COMPLETE",
        accountsDecision: hasDiscrepancy ? "NEEDS_REVIEW" : "NEEDS_PAYMENT",
      })
      .where(eq(receivingShipments.id, shipmentId));
  });

  revalidatePath(`/dashboard/buyback/shipments/${shipmentId}`);
  revalidatePath("/dashboard/buyback");
  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard");
}

/** Accounts marking the seller paid -- separate from, and does not re-touch, inventory. */
export async function markShipmentPaid(
  shipmentId: string,
  _prevState: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const org = await requireOrg();
  const shipment = await requireOrgShipment(org.organizationId, shipmentId);
  if (!shipment) return { error: "Shipment not found." };
  if (shipment.receivingStatus === "IN_PROGRESS") {
    return { error: "Finish receiving before marking this paid." };
  }

  await db
    .update(receivingShipments)
    .set({ accountsStatus: "PAID", accountsDecision: "PAID", paidAt: new Date().toISOString() })
    .where(eq(receivingShipments.id, shipmentId));

  revalidatePath(`/dashboard/buyback/shipments/${shipmentId}`);
  revalidatePath("/dashboard/buyback");
  revalidatePath("/dashboard");
}

/** Manual checkbox equivalent of the Airtable "send notification" trigger -- no email is actually sent yet. */
export async function markCustomerNotified(
  shipmentId: string,
  _prevState: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const org = await requireOrg();
  const shipment = await requireOrgShipment(org.organizationId, shipmentId);
  if (!shipment) return { error: "Shipment not found." };

  await db
    .update(receivingShipments)
    .set({ customerNotified: true })
    .where(eq(receivingShipments.id, shipmentId));

  revalidatePath(`/dashboard/buyback/shipments/${shipmentId}`);
  revalidatePath("/dashboard/buyback");
}
