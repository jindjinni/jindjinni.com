"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/tenant";
import { isPurchasingManager } from "@/lib/permissions";
import { featureOn } from "@/lib/features";
import { allQuotationIds, deleteQuotationsById, previewQuotationDeletion } from "@/lib/quotation-delete";
import { DELETE_ALL_PHRASE, type DeletionPreview } from "@/lib/quotation-delete-text";

export type DeletePreviewState = { error: string } | { preview: DeletionPreview };
export type DeleteResultState = { error: string } | { result: DeletionPreview };

const MANAGER_ONLY = "Only a Purchasing Manager or Master Admin can delete quotations.";
const NOT_ON = "Deleting quotations isn't switched on for this company yet.";

async function allowed() {
  const org = await requireOrg();
  if (!isPurchasingManager(org.role)) return { org, error: MANAGER_ONLY };
  if (!(await featureOn("quotation-delete", org.organizationId))) return { org, error: NOT_ON };
  return { org, error: null };
}

/** What deleting these would do (nothing is changed). `ids` = the picked quotations; null = ALL of them. */
export async function previewQuotationDelete(ids: string[] | null): Promise<DeletePreviewState> {
  const { org, error } = await allowed();
  if (error) return { error };
  const list = ids ?? (await allQuotationIds(org.organizationId));
  return { preview: await previewQuotationDeletion(org.organizationId, list) };
}

/**
 * Deletes the picked quotations (`ids`) or every quotation (`ids` null). Those with no history are erased; those with received
 * stock, a payment or a bought label are hidden in Archive instead. Deleting ALL needs the phrase DELETE ALL typed (checked here).
 */
export async function deleteQuotations(ids: string[] | null, typed: string): Promise<DeleteResultState> {
  const { org, error } = await allowed();
  if (error) return { error };
  const list = ids ?? (await allQuotationIds(org.organizationId));
  if (list.length === 0) return { error: "Nothing to delete." };
  if (ids === null && typed.trim().toUpperCase() !== DELETE_ALL_PHRASE) {
    return { error: `Type ${DELETE_ALL_PHRASE} exactly as shown to delete every quotation.` };
  }
  const result = await deleteQuotationsById(org.organizationId, org.userId, list, ids === null ? "all quotations" : "picked from the list");
  if (result.quotations === 0) return { error: "Those quotations are already gone." };
  for (const path of ["/dashboard/purchasing", "/dashboard/settings/archive"]) revalidatePath(path, "layout");
  return { result };
}
