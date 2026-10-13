"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/tenant";
import { isPurchasingManager } from "@/lib/permissions";
import { allQuotationIds, deleteQuotationsById, previewQuotationDeletion } from "@/lib/quotation-delete";
import { DELETE_ALL_PHRASE, DELETE_PAID_PHRASE, type DeletionPreview } from "@/lib/quotation-delete-text";

export type DeletePreviewState = { error: string } | { preview: DeletionPreview };
export type DeleteResultState = { error: string } | { deleted: number; withReceiving: number; labels: number };

const MANAGER_ONLY = "Only a Purchasing Manager or Master Admin can delete quotations.";

/** What deleting these would remove (nothing is changed). `ids` = the picked quotations; omit it to look at ALL of them. */
export async function previewQuotationDelete(ids: string[] | null): Promise<DeletePreviewState> {
  const org = await requireOrg();
  if (!isPurchasingManager(org.role)) return { error: MANAGER_ONLY };
  const list = ids ?? (await allQuotationIds(org.organizationId));
  return { preview: await previewQuotationDeletion(org.organizationId, list) };
}

/**
 * Deletes the picked quotations (`ids`) or every quotation (`ids` null). Always re-checks on the server:
 *  - all of them: the phrase DELETE ALL must be typed;
 *  - any that Accounts already marked Paid: the word DELETE must be typed.
 */
export async function deleteQuotations(ids: string[] | null, typed: string): Promise<DeleteResultState> {
  const org = await requireOrg();
  if (!isPurchasingManager(org.role)) return { error: MANAGER_ONLY };
  const list = ids ?? (await allQuotationIds(org.organizationId));
  if (list.length === 0) return { error: "Nothing to delete." };
  const preview = await previewQuotationDeletion(org.organizationId, list);
  if (preview.quotations === 0) return { error: "Those quotations are already gone." };
  const said = typed.trim().toUpperCase();
  if (ids === null) {
    if (said !== DELETE_ALL_PHRASE) return { error: `Type ${DELETE_ALL_PHRASE} exactly as shown to delete every quotation.` };
  } else if (preview.paid > 0 && said !== DELETE_PAID_PHRASE) {
    return { error: `${preview.paid} of these are already marked Paid. Type ${DELETE_PAID_PHRASE} to confirm deleting them.` };
  }
  const removed = await deleteQuotationsById(org.organizationId, org.userId, list, ids === null ? "all quotations" : "picked from the list");
  for (const path of ["/dashboard/purchasing", "/dashboard/receiving", "/dashboard/accounts", "/dashboard/customer-service", "/dashboard/shipping"]) revalidatePath(path, "layout");
  return { deleted: removed.quotations, withReceiving: removed.withReceiving, labels: removed.labels };
}
