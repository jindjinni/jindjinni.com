"use server";

// Step 6 scanner: each scan (from a USB / Bluetooth scanner, the camera, a photo or typing) is saved as one unit on the
// received product, checked for a repeated serial, a made-up or wrong-shaped serial, a bad product code, an expired
// date and the recall lists, and flagged for review when something looks wrong. Owner / Admin / Receiver only.

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { receivingPackages } from "@/db/schema";
import { requireOrg, type CurrentOrg } from "@/lib/tenant";
import { canWriteReceiving } from "@/lib/permissions";
import { auditReceiving } from "@/lib/receiving-service";
import type { RecallCheckView } from "@/lib/receiving-recall-service";
import { parseScan, type ScanKind } from "@/lib/receiving-serial-rules";
import { openRow, scanParsed } from "@/lib/receiving-scan-core";
import { isShipmentLocked } from "@/lib/receiving-test-lock";
import { listSerials, removeScan, type SerialSource, type SerialView } from "@/lib/receiving-serial-service";

export type ItemPatchLite = { needsReturn?: string; returnStatus?: string; quantityToReturn?: string; returnNotes?: string };
export type ScanResult = {
  error?: string;
  ok?: boolean;
  /** This exact serial was already scanned on this product: nothing new was saved. */
  alreadyScanned?: boolean;
  /** The barcode held only a product code (GTIN): no unit was saved. */
  productCodeOnly?: boolean;
  gtin?: string;
  scan?: SerialView;
  serials?: SerialView[];
  checks?: RecallCheckView[];
  recalled?: { number: string; recalls: string[] }[];
  /** Close to (but not exactly) a recalled number: a person must compare the label with the notice. */
  near?: { number: string; listed: string; recall: string }[];
  /** Recalls for this product that have no list loaded, so "no match" proves nothing. */
  unverified?: string[];
  /** Plain-language reasons for every flag on this scan. */
  notes?: string[];
  /** Fields to change on product rows in the open form (a row sent to review or marked for return). */
  itemPatches?: Record<string, ItemPatchLite>;
};

async function requireWriter(): Promise<CurrentOrg> {
  const org = await requireOrg();
  if (!canWriteReceiving(org.role)) throw new Error("Your role can view Receiving but can't make changes.");
  return org;
}

function refresh(packageId: string) {
  revalidatePath("/dashboard/receiving", "layout");
  revalidatePath(`/dashboard/receiving/intake/${packageId}`);
}

const SOURCES: SerialSource[] = ["SCANNER", "CAMERA", "PHOTO", "TYPED"];

/** One scan on one received product. `text` is whatever the scanner / camera / photo / keyboard gave. */
export async function scanUnit(packageId: string, itemId: string, text: string, source: string, kind: string): Promise<ScanResult> {
  const org = await requireWriter();
  const row = await openRow(org, packageId, itemId);
  if ("error" in row) return { error: row.error };

  const src: SerialSource = (SOURCES as string[]).includes(source) ? (source as SerialSource) : "SCANNER";
  const k: ScanKind = kind === "SERIAL" || kind === "LOT" ? kind : "AUTO";
  const parsed = parseScan(String(text ?? "").slice(0, 400), { kind: k, productName: row.productName });
  if (!parsed) return { error: "That scan was empty. Scan the barcode again." };

  const result = await scanParsed(org, row, packageId, itemId, parsed, src);
  if (!result.error) refresh(packageId);
  return result;
}

/** Removes one scanned unit (a mistaken scan). A row already sent to review stays in review until someone clears it. */
export async function removeScannedUnit(packageId: string, serialId: string): Promise<ScanResult> {
  const org = await requireWriter();
  const [p] = await db
    .select({ status: receivingPackages.status, quotationId: receivingPackages.quotationId })
    .from(receivingPackages)
    .where(and(eq(receivingPackages.id, packageId), eq(receivingPackages.organizationId, org.organizationId)))
    .limit(1);
  if (!p) return { error: "That shipment wasn't found." };
  if (await isShipmentLocked({ ...p, organizationId: org.organizationId })) return { error: "This shipment was already submitted. Reopen it to change scans." };
  if (p.status !== "IN_PROGRESS") await auditReceiving(org, p.quotationId, "Scan removed", "A scanned unit was removed after the shipment was submitted.");
  const r = await removeScan(org.organizationId, packageId, String(serialId));
  if (!r.removed) return { error: "That scan wasn't found." };
  refresh(packageId);
  return { ok: true, serials: await listSerials(org.organizationId, packageId) };
}
