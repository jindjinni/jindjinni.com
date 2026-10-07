"use server";

// Adjustment quotations. Built from a shipment's original quotation + what was actually received, edited in the
// app, then finalized -- which attaches the adjusted quotation PDF to the receiving order so it can be emailed.
// Owner / Admin / Receiver / Accountant can work on adjustments; everyone else can only view. Scoped by company.

import { revalidatePath } from "next/cache";
import { requireOrg, type CurrentOrg } from "@/lib/tenant";
import { canWriteAccounts } from "@/lib/permissions";
import {
  createDraftFromPackage,
  discardAdjustment,
  finalizeAdjustment,
  getAdjustmentById,
  regenerateFromReceived,
  saveAdjustment as saveAdjustmentRow,
  type AdjustmentInput,
} from "@/lib/receiving-adjustment-service";

export type AdjustmentActionState = { error?: string; ok?: boolean; id?: string; notice?: string };

async function requireWriter(): Promise<CurrentOrg> {
  const org = await requireOrg();
  if (!canWriteAccounts(org.role, org.access)) throw new Error("Your role can view Receiving but can't make changes.");
  return org;
}

function refresh(packageId?: string, adjustmentId?: string) {
  revalidatePath("/dashboard/receiving", "layout");
  revalidatePath("/dashboard/receiving/adjustments");
  if (adjustmentId) revalidatePath(`/dashboard/receiving/adjustments/${adjustmentId}`);
  if (packageId) revalidatePath(`/dashboard/receiving/intake/${packageId}`);
}

/** Starts the adjustment for a shipment (or opens the one already started). */
export async function startAdjustment(packageId: string): Promise<AdjustmentActionState> {
  const org = await requireWriter();
  const r = await createDraftFromPackage(org, packageId);
  if ("error" in r) return { error: r.error };
  refresh(packageId, r.id);
  return { ok: true, id: r.id };
}

export async function saveAdjustment(adjustmentId: string, input: AdjustmentInput): Promise<AdjustmentActionState> {
  const org = await requireWriter();
  const r = await saveAdjustmentRow(org, adjustmentId, input);
  if (!r.ok) return { error: r.error };
  const [adj] = await packageOf(org.organizationId, adjustmentId);
  refresh(adj?.packageId, adjustmentId);
  return { ok: true, id: adjustmentId };
}

/** Saves the latest edits, then finalizes: builds the PDF and attaches it to the shipment. */
export async function finalizeAdjustmentAction(adjustmentId: string, input: AdjustmentInput): Promise<AdjustmentActionState> {
  const org = await requireWriter();
  const saved = await saveAdjustmentRow(org, adjustmentId, input);
  if (!saved.ok) return { error: saved.error };
  const r = await finalizeAdjustment(org, adjustmentId);
  if (!r.ok) return { error: r.error };
  const [adj] = await packageOf(org.organizationId, adjustmentId);
  refresh(adj?.packageId, adjustmentId);
  return {
    ok: true,
    id: adjustmentId,
    notice: r.stored
      ? "Finalized. The adjusted quotation is attached to the receiving order."
      : "Finalized. File storage isn't connected, so the PDF isn't stored, but it is built fresh whenever you open it or email the customer.",
  };
}

/** Rebuilds the lines and totals from the original quotation and what Step 6 says now (back to a draft). */
export async function regenerateAdjustment(adjustmentId: string): Promise<AdjustmentActionState> {
  const org = await requireWriter();
  const r = await regenerateFromReceived(org, adjustmentId);
  if (!r.ok) return { error: r.error };
  const [adj] = await packageOf(org.organizationId, adjustmentId);
  refresh(adj?.packageId, adjustmentId);
  return { ok: true, id: adjustmentId, notice: "Rebuilt from the original quotation and what was received. Review it, then finalize." };
}

export async function deleteAdjustment(adjustmentId: string): Promise<AdjustmentActionState> {
  const org = await requireWriter();
  const [adj] = await packageOf(org.organizationId, adjustmentId);
  const r = await discardAdjustment(org, adjustmentId);
  if (!r.ok) return { error: r.error };
  refresh(adj?.packageId, adjustmentId);
  return { ok: true };
}

async function packageOf(organizationId: string, adjustmentId: string) {
  const a = await getAdjustmentById(organizationId, adjustmentId);
  return a ? [{ packageId: a.packageId }] : [];
}
