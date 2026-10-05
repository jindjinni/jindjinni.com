"use server";

// Recall checks in Step 6 of receiving. Owner / Admin / Receiver can run checks; managing the recalls and their lists
// is Admin / Owner only. Everything is scoped by the signed-in user's company.

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { receivingItems, receivingPackages } from "@/db/schema";
import { requireOrg, type CurrentOrg } from "@/lib/tenant";
import { canWriteReceiving, isAdmin } from "@/lib/permissions";
import { sniffReceiptType } from "@/lib/purchasing-receipt-docs";
import { auditReceiving } from "@/lib/receiving-service";
import {
  deleteCheck,
  deleteRecall,
  importNumbers,
  listChecks,
  listRecalls,
  markRowForReturn,
  previewNumbers,
  recordManualCheck,
  runRecallCheck,
  saveRecall as saveRecallRow,
  setupDefaultRecalls,
  type RecallCheckView,
  type RecallInput,
  type RecallView,
} from "@/lib/receiving-recall-service";
import { PHOTO_MAX_BYTES, readLabelPhoto, type LabelRead } from "@/lib/receiving-recall-photo";

export type RecallItemPatch = { needsReturn: string; returnStatus: string; quantityToReturn: string; returnNotes: string };
export type RecallActionState = {
  error?: string;
  ok?: boolean;
  notice?: string;
  checks?: RecallCheckView[];
  recalls?: RecallView[];
  /** Per number checked: which recalls it is on (empty = not on any list we have). */
  results?: { number: string; recalls: string[] }[];
  /** Set when the row was marked for return, so the open form can show it. */
  itemPatch?: RecallItemPatch;
  preview?: { values: number; prefixes: number; skipped: number; newOnes: number; sample: string[] };
  label?: LabelRead;
};

async function requireWriter(): Promise<CurrentOrg> {
  const org = await requireOrg();
  if (!canWriteReceiving(org.role)) throw new Error("Your role can view Receiving but can't make changes.");
  return org;
}
async function requireRecallAdmin(): Promise<CurrentOrg> {
  const org = await requireOrg();
  if (!isAdmin(org.role)) throw new Error("Only an admin can change the recall lists.");
  return org;
}

function refresh(packageId?: string) {
  revalidatePath("/dashboard/receiving", "layout");
  if (packageId) revalidatePath(`/dashboard/receiving/intake/${packageId}`);
}

/** The shipment and row belong to this company and the shipment is still being received. */
async function openRow(org: CurrentOrg, packageId: string, itemId: string): Promise<{ error: string } | { quotationId: string; productName: string }> {
  const [p] = await db
    .select({ status: receivingPackages.status, quotationId: receivingPackages.quotationId })
    .from(receivingPackages)
    .where(and(eq(receivingPackages.id, packageId), eq(receivingPackages.organizationId, org.organizationId)))
    .limit(1);
  if (!p) return { error: "That shipment wasn't found." };
  if (p.status !== "IN_PROGRESS") return { error: "This shipment was already submitted. Reopen it to check recalls." };
  const [it] = await db
    .select({ name: receivingItems.productName })
    .from(receivingItems)
    .where(and(eq(receivingItems.id, itemId), eq(receivingItems.packageId, packageId), eq(receivingItems.organizationId, org.organizationId)))
    .limit(1);
  if (!it) return { error: "That product line wasn't found. Save it first, then check it." };
  return { quotationId: p.quotationId, productName: it.name };
}

/** Checks the lot / serial number(s) in `input` (typed, scanned or read from a photo) for one received row. */
export async function checkRecall(packageId: string, itemId: string, input: string): Promise<RecallActionState> {
  const org = await requireWriter();
  const row = await openRow(org, packageId, itemId);
  if ("error" in row) return { error: row.error };
  const r = await runRecallCheck(org, packageId, itemId, String(input ?? "").slice(0, 600));
  if ("error" in r) return { error: r.error };
  let itemPatch: RecallItemPatch | undefined;
  const hit = r.numbers.find((n) => n.matches.length > 0);
  if (hit) {
    itemPatch = await markRowForReturn(org.organizationId, itemId, hit.matches[0].recallName, hit.number);
    await auditReceiving(org, row.quotationId, "Recall check", `${row.productName}: ${hit.number} is on the recall list (${hit.matches.map((m) => m.recallName).join(", ")}). Marked for return.`);
  } else {
    await auditReceiving(org, row.quotationId, "Recall check", `${row.productName}: ${r.numbers.map((n) => n.number).join(", ")} not on the recall lists loaded.`);
  }
  refresh(packageId);
  return {
    ok: true,
    results: r.numbers.map((n) => ({ number: n.number, recalls: n.matches.map((m) => m.recallName) })),
    checks: await listChecks(org.organizationId, packageId),
    itemPatch,
  };
}

/** The agent looked the number up on the manufacturer's page and records what it said. */
export async function confirmRecallLookup(packageId: string, itemId: string, recallId: string, number: string, affected: boolean): Promise<RecallActionState> {
  const org = await requireWriter();
  const row = await openRow(org, packageId, itemId);
  if ("error" in row) return { error: row.error };
  const r = await recordManualCheck(org, packageId, itemId, String(recallId), String(number ?? "").slice(0, 80), !!affected);
  if ("error" in r) return { error: r.error };
  let itemPatch: RecallItemPatch | undefined;
  const checks = await listChecks(org.organizationId, packageId);
  if (affected) {
    const n = checks.find((c) => c.itemId === itemId && c.recallId === recallId && c.result === "CONFIRMED_AFFECTED")?.enteredNumber ?? String(number);
    itemPatch = await markRowForReturn(org.organizationId, itemId, r.recallName, n);
  }
  await auditReceiving(org, row.quotationId, "Recall check", `${row.productName}: looked up on the manufacturer's page (${r.recallName}): ${affected ? "AFFECTED, marked for return" : "not affected"}.`);
  refresh(packageId);
  return { ok: true, checks, itemPatch };
}

/** Removes one recorded check (a mistyped number, say). The row's return setting is left as it is. */
export async function removeRecallCheck(packageId: string, checkId: string): Promise<RecallActionState> {
  const org = await requireWriter();
  const [p] = await db
    .select({ status: receivingPackages.status })
    .from(receivingPackages)
    .where(and(eq(receivingPackages.id, packageId), eq(receivingPackages.organizationId, org.organizationId)))
    .limit(1);
  if (!p) return { error: "That shipment wasn't found." };
  if (p.status !== "IN_PROGRESS") return { error: "This shipment was already submitted. Reopen it to change recall checks." };
  await deleteCheck(org.organizationId, packageId, String(checkId));
  refresh(packageId);
  return { ok: true, checks: await listChecks(org.organizationId, packageId) };
}

/** Reads the lot / serial number off a photo of a label. The photo isn't stored. */
export async function readRecallPhoto(formData: FormData): Promise<RecallActionState> {
  await requireWriter();
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose or take a photo first." };
  if (file.size > PHOTO_MAX_BYTES) return { error: "That photo is too big. Try again closer to the label." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffReceiptType(bytes);
  if (!type || !type.isImage) return { error: "That file isn't a photo. Use a JPG or PNG picture." };
  const r = await readLabelPhoto(bytes, type.mime);
  if ("error" in r) return { error: r.error };
  return { ok: true, label: r };
}

// ---- admin: the recalls and their lists --------------------------------------------

export async function setupRecalls(): Promise<RecallActionState> {
  const org = await requireRecallAdmin();
  const n = await setupDefaultRecalls(org.organizationId);
  refresh();
  return { ok: true, notice: n ? `Added ${n} recall${n === 1 ? "" : "s"}. Paste each one's official lot / serial list to turn on automatic matching.` : "The starting recalls are already there.", recalls: await listRecalls(org.organizationId) };
}

export async function saveRecall(id: string | null, input: RecallInput): Promise<RecallActionState> {
  const org = await requireRecallAdmin();
  const r = await saveRecallRow(org.organizationId, id, input);
  if ("error" in r) return { error: r.error };
  refresh();
  return { ok: true, notice: "Recall saved.", recalls: await listRecalls(org.organizationId) };
}

export async function removeRecall(id: string): Promise<RecallActionState> {
  const org = await requireRecallAdmin();
  const ok = await deleteRecall(org.organizationId, String(id));
  if (!ok) return { error: "That recall wasn't found." };
  refresh();
  return { ok: true, notice: "Recall removed.", recalls: await listRecalls(org.organizationId) };
}

/** Shows what pasting would do (how many numbers, how many are new) without saving. */
export async function previewRecallList(recallId: string, text: string, mode: "add" | "replace"): Promise<RecallActionState> {
  const org = await requireRecallAdmin();
  return { ok: true, preview: await previewNumbers(org.organizationId, String(recallId), String(text ?? ""), mode === "replace" ? "replace" : "add") };
}

export async function importRecallList(recallId: string, text: string, mode: "add" | "replace"): Promise<RecallActionState> {
  const org = await requireRecallAdmin();
  const r = await importNumbers(org.organizationId, String(recallId), String(text ?? ""), mode === "replace" ? "replace" : "add");
  if ("error" in r) return { error: r.error };
  refresh();
  return {
    ok: true,
    notice: `${r.added} number${r.added === 1 ? "" : "s"} ${mode === "replace" ? "loaded" : "added"}${r.skipped ? ` (${r.skipped} words or short numbers skipped)` : ""}. ${r.total} on this list now.`,
    recalls: await listRecalls(org.organizationId),
  };
}

