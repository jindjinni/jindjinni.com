"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { requireOrg } from "@/lib/tenant";
import { getNextInvoiceSequence, getOnHandMap, onHandKey } from "@/lib/queries";
import { db } from "@/db/client";
import {
  invoices,
  invoiceLineItems,
  inventoryTransactions,
  buyers,
  products,
  conditions,
} from "@/db/schema";
import { newId } from "@/lib/ids";

export type ActionState = { error?: string } | undefined;

/**
 * Starts a new DRAFT invoice. Nothing is deducted from inventory yet --
 * that only happens at finalize, same as the Airtable base. Either an
 * existing buyer is chosen, or a new one is created inline from the same
 * form (a blank "new buyer" company name means "use the selected buyer").
 */
export async function createInvoiceDraft(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const org = await requireOrg();

  const existingBuyerId = String(formData.get("existingBuyerId") ?? "");
  const newBuyerCompanyName = String(formData.get("newBuyerCompanyName") ?? "").trim();

  let buyerId: string | null = existingBuyerId || null;

  if (newBuyerCompanyName) {
    buyerId = newId("buyer");
    await db.insert(buyers).values({
      id: buyerId,
      organizationId: org.organizationId,
      companyName: newBuyerCompanyName,
      contactName: String(formData.get("newBuyerContactName") ?? "").trim() || null,
      email: String(formData.get("newBuyerEmail") ?? "").trim() || null,
    });
  }

  if (!buyerId) return { error: "Choose an existing buyer or enter a new buyer's company name." };

  const sequence = await getNextInvoiceSequence(org.organizationId);
  const invoiceId = newId("invoice");
  await db.insert(invoices).values({
    id: invoiceId,
    organizationId: org.organizationId,
    buyerId,
    invoiceNumber: String(sequence),
    invoiceSequence: sequence,
    status: "DRAFT",
    invoiceDate: new Date().toISOString().slice(0, 10),
    billFromCompany: org.organizationName,
  });

  revalidatePath("/dashboard/invoices");
  redirect(`/dashboard/invoices/${invoiceId}`);
}

/** Recomputes an invoice's subtotal/total from its own active line items. */
async function recomputeInvoiceTotals(invoiceId: string) {
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${invoiceLineItems.quantity} * ${invoiceLineItems.unitPrice}), 0)`,
    })
    .from(invoiceLineItems)
    .where(and(eq(invoiceLineItems.invoiceId, invoiceId), eq(invoiceLineItems.lineStatus, "Active")));

  const total = Number(row?.total ?? 0);
  await db.update(invoices).set({ subtotal: total, total }).where(eq(invoices.id, invoiceId));
}

/** Loads a DRAFT invoice scoped to this org, or returns null. Shared guard for every line-item mutation below. */
async function requireDraftInvoice(organizationId: string, invoiceId: string) {
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.organizationId, organizationId)))
    .limit(1);
  if (!invoice || invoice.status !== "DRAFT") return null;
  return invoice;
}

export async function addLineItem(
  invoiceId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const org = await requireOrg();
  const invoice = await requireDraftInvoice(org.organizationId, invoiceId);
  if (!invoice) return { error: "This invoice can no longer be edited." };

  const productId = String(formData.get("productId") ?? "");
  const conditionId = String(formData.get("conditionId") ?? "");
  const quantity = Number(formData.get("quantity"));
  const unitPrice = Number(formData.get("unitPrice"));
  const expirationDate = String(formData.get("expirationDate") ?? "").trim() || null;

  if (!productId || !conditionId) return { error: "Choose a product and a condition." };
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return { error: "Quantity must be a whole number greater than zero." };
  }
  if (Number.isNaN(unitPrice) || unitPrice < 0) {
    return { error: "Unit price must be a positive number." };
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

  await db.insert(invoiceLineItems).values({
    id: newId("line"),
    invoiceId,
    productId,
    conditionId,
    quantity,
    unitPrice,
    expirationDate,
  });

  await recomputeInvoiceTotals(invoiceId);
  revalidatePath(`/dashboard/invoices/${invoiceId}`);
}

/**
 * Removes a line from a still-DRAFT invoice. Safe to hard-delete: a draft
 * line has never posted to the ledger, so there's nothing to reverse --
 * unlike voiding a finalized invoice, which must post correcting entries
 * instead of deleting anything.
 */
export async function removeLineItem(
  lineItemId: string,
  _prevState: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const org = await requireOrg();

  const [line] = await db
    .select({ id: invoiceLineItems.id, invoiceId: invoiceLineItems.invoiceId })
    .from(invoiceLineItems)
    .innerJoin(invoices, eq(invoiceLineItems.invoiceId, invoices.id))
    .where(and(eq(invoiceLineItems.id, lineItemId), eq(invoices.organizationId, org.organizationId)))
    .limit(1);
  if (!line) return { error: "Line item not found." };

  const invoice = await requireDraftInvoice(org.organizationId, line.invoiceId);
  if (!invoice) return { error: "This invoice can no longer be edited." };

  await db.delete(invoiceLineItems).where(eq(invoiceLineItems.id, lineItemId));
  await recomputeInvoiceTotals(line.invoiceId);
  revalidatePath(`/dashboard/invoices/${line.invoiceId}`);
}

/**
 * Finalize = lock in the inventory deduction. Mirrors automation #4 from
 * the Airtable base: before posting anything, every line is checked
 * against current on-hand (grouped by product+condition, since an invoice
 * can have more than one line against the same pair), and if ANY of them
 * would push on-hand negative, the whole finalize is blocked -- nothing
 * partially posts. Only on a clean pass do the INVOICE_OUT ledger entries
 * get written, inside one DB transaction.
 */
export async function finalizeInvoice(
  invoiceId: string,
  _prevState: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const org = await requireOrg();
  const invoice = await requireDraftInvoice(org.organizationId, invoiceId);
  if (!invoice) return { error: "Only a draft invoice can be finalized." };

  const lines = await db
    .select({
      id: invoiceLineItems.id,
      productId: invoiceLineItems.productId,
      productName: products.name,
      conditionId: invoiceLineItems.conditionId,
      conditionName: conditions.name,
      quantity: invoiceLineItems.quantity,
    })
    .from(invoiceLineItems)
    .innerJoin(products, eq(invoiceLineItems.productId, products.id))
    .innerJoin(conditions, eq(invoiceLineItems.conditionId, conditions.id))
    .where(and(eq(invoiceLineItems.invoiceId, invoiceId), eq(invoiceLineItems.lineStatus, "Active")));

  if (lines.length === 0) return { error: "Add at least one line item before finalizing." };

  const onHandMap = await getOnHandMap(org.organizationId);
  const requested = new Map<string, number>();
  for (const line of lines) {
    const key = onHandKey(line.productId, line.conditionId);
    requested.set(key, (requested.get(key) ?? 0) + line.quantity);
  }

  const shortfalls: string[] = [];
  for (const line of lines) {
    const key = onHandKey(line.productId, line.conditionId);
    const onHand = onHandMap.get(key) ?? 0;
    const total = requested.get(key) ?? 0;
    if (total > onHand && !shortfalls.some((s) => s.includes(`${line.productName} (${line.conditionName})`))) {
      shortfalls.push(`${line.productName} (${line.conditionName}): on hand ${onHand}, requested ${total}`);
    }
  }

  if (shortfalls.length > 0) {
    return { error: `Not enough stock to finalize -- ${shortfalls.join("; ")}.` };
  }

  await db.transaction(async (tx) => {
    for (const line of lines) {
      await tx.insert(inventoryTransactions).values({
        id: newId("txn"),
        organizationId: org.organizationId,
        productId: line.productId,
        conditionId: line.conditionId,
        quantityChange: -line.quantity,
        type: "INVOICE_OUT",
        invoiceLineItemId: line.id,
      });
      await tx
        .update(invoiceLineItems)
        .set({ previousPostedQuantity: line.quantity })
        .where(eq(invoiceLineItems.id, line.id));
    }
    await tx
      .update(invoices)
      .set({ status: "FINALIZED", inventoryPosted: true })
      .where(eq(invoices.id, invoiceId));
  });

  revalidatePath(`/dashboard/invoices/${invoiceId}`);
  revalidatePath("/dashboard/invoices");
  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard");
}

/**
 * Void = reverse, never delete. Posts a CORRECTION transaction returning
 * every unit a finalized invoice deducted, then marks the invoice VOID.
 * The original FINALIZED line items and their INVOICE_OUT entries stay in
 * the ledger exactly as they were -- the append-only rule applies to
 * voiding too.
 */
export async function voidInvoice(
  invoiceId: string,
  _prevState: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const org = await requireOrg();

  const [invoice] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.organizationId, org.organizationId)))
    .limit(1);
  if (!invoice) return { error: "Invoice not found." };
  if (invoice.status !== "FINALIZED") return { error: "Only a finalized invoice can be voided." };

  const lines = await db
    .select({ id: invoiceLineItems.id, productId: invoiceLineItems.productId, conditionId: invoiceLineItems.conditionId, quantity: invoiceLineItems.quantity })
    .from(invoiceLineItems)
    .where(and(eq(invoiceLineItems.invoiceId, invoiceId), eq(invoiceLineItems.lineStatus, "Active")));

  await db.transaction(async (tx) => {
    for (const line of lines) {
      await tx.insert(inventoryTransactions).values({
        id: newId("txn"),
        organizationId: org.organizationId,
        productId: line.productId,
        conditionId: line.conditionId,
        quantityChange: line.quantity,
        type: "CORRECTION",
        invoiceLineItemId: line.id,
        note: `Returned by voiding invoice ${invoice.invoiceNumber ?? invoice.id}`,
      });
    }
    await tx.update(invoices).set({ status: "VOID" }).where(eq(invoices.id, invoiceId));
  });

  revalidatePath(`/dashboard/invoices/${invoiceId}`);
  revalidatePath("/dashboard/invoices");
  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard");
}
