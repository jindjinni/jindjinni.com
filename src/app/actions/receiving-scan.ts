"use server";

// Step 6 scanner: each scan (from a USB / Bluetooth scanner, the camera, a photo or typing) is saved as one unit on the
// received product, checked for a repeated serial, a made-up or wrong-shaped serial, a bad product code, an expired
// date and the recall lists, and flagged for review when something looks wrong. Owner / Admin / Receiver only.

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { receivingItems, receivingPackages } from "@/db/schema";
import { requireOrg, type CurrentOrg } from "@/lib/tenant";
import { canWriteReceiving } from "@/lib/permissions";
import { auditReceiving } from "@/lib/receiving-service";
import { normalizeNumber, numbersToCheck } from "@/lib/receiving-recall";
import { listChecks, markRowForReturn, runRecallCheck, type RecallCheckView } from "@/lib/receiving-recall-service";
import { FLAG_LABELS, inspectScan, isCounterfeitSuspect, parseScan, severityOf, type ScanKind, type SerialFlag } from "@/lib/receiving-serial-rules";
import { isShipmentLocked } from "@/lib/receiving-test-lock";
import {
  addFlag,
  gtinsForItem,
  listSerials,
  markRowForReview,
  recomputeDuplicates,
  recordScan,
  removeScan,
  type SerialSource,
  type SerialView,
} from "@/lib/receiving-serial-service";

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

async function openRow(org: CurrentOrg, packageId: string, itemId: string): Promise<{ error: string } | { quotationId: string; productName: string }> {
  const [p] = await db
    .select({ status: receivingPackages.status, quotationId: receivingPackages.quotationId })
    .from(receivingPackages)
    .where(and(eq(receivingPackages.id, packageId), eq(receivingPackages.organizationId, org.organizationId)))
    .limit(1);
  if (!p) return { error: "That shipment wasn't found." };
  if (await isShipmentLocked({ ...p, organizationId: org.organizationId })) return { error: "This shipment was already submitted. Reopen it to scan more." };
  const [it] = await db
    .select({ name: receivingItems.productName })
    .from(receivingItems)
    .where(and(eq(receivingItems.id, itemId), eq(receivingItems.packageId, packageId), eq(receivingItems.organizationId, org.organizationId)))
    .limit(1);
  if (!it) return { error: "That product line wasn't found. Save it first, then scan it." };
  return { quotationId: p.quotationId, productName: it.name };
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

  const rowGtins = await gtinsForItem(org.organizationId, itemId);
  const pure = inspectScan(parsed, { productName: row.productName, rowGtins, today: new Date().toISOString().slice(0, 10) });

  // A barcode with only a product code identifies the product but is not a unit: show what it says, save nothing.
  if (!parsed.lot && !parsed.serial) {
    return {
      ok: true,
      productCodeOnly: true,
      gtin: parsed.gtin,
      notes: pure.notes.length ? pure.notes : ["Product code read. Now scan the lot or serial barcode on the same product."],
      scan: undefined,
      serials: await listSerials(org.organizationId, packageId),
    };
  }

  const saved = await recordScan(org, packageId, itemId, parsed, src, pure.flags, pure.notes);
  if (saved.alreadyScanned) {
    return { ok: true, alreadyScanned: true, scan: saved.view, serials: await listSerials(org.organizationId, packageId), notes: ["This serial is already scanned on this product, so it was not added again."] };
  }

  let view = saved.view;
  const patches: Record<string, ItemPatchLite> = {};
  let recalled: { number: string; recalls: string[] }[] = [];
  let checks: RecallCheckView[] | undefined;

  // Lot and serial against the recall lists (the same check the Recall check box makes).
  const toCheck = [parsed.lot, parsed.serial].filter(Boolean).join(" ");
  if (numbersToCheck(toCheck).length > 0) {
    const r = await runRecallCheck(org, packageId, itemId, toCheck);
    if (!("error" in r)) {
      recalled = r.numbers.filter((n) => n.matches.length > 0).map((n) => ({ number: n.number, recalls: n.matches.map((m) => m.recallName) }));
      if (recalled.length > 0) {
        const first = r.numbers.find((n) => n.matches.length > 0)!;
        const p = await markRowForReturn(org.organizationId, itemId, first.matches[0].recallName, first.number);
        patches[itemId] = { ...p };
        const v = await addFlag(org.organizationId, view.id, "RECALLED", `On the recall list: ${recalled.map((x) => `${x.number} (${x.recalls.join(", ")})`).join("; ")}.`);
        if (v) view = v;
      }
      checks = await listChecks(org.organizationId, packageId);
    }
  }

  // Re-read the saved flags (the duplicate check may have changed them) and send suspect rows to review.
  const flags: SerialFlag[] = view.flags;
  const notes = view.note ? view.note.split("\n").filter(Boolean) : pure.notes;
  if (isCounterfeitSuspect(flags)) {
    const why = flags.filter((f) => isCounterfeitSuspect([f])).map((f) => FLAG_LABELS[f]).join(", ");
    const line = `SUSPECT: ${parsed.serial ?? parsed.lot} - ${why}`;
    const p = await markRowForReview(org.organizationId, itemId, line);
    patches[itemId] = { ...patches[itemId], needsReturn: p.needsReturn, returnNotes: p.returnNotes };
    // The other unit that shares this serial is just as suspect: send its row to review as well.
    if (parsed.serial) {
      const dupRows = await recomputeDuplicates(org.organizationId, normalizeNumber(view.serial));
      for (const d of dupRows) {
        if (d.packageId !== packageId || d.itemId === itemId) continue;
        const [other] = await db.select({ name: receivingItems.productName }).from(receivingItems).where(eq(receivingItems.id, d.itemId)).limit(1);
        if (!other) continue;
        const q = await markRowForReview(org.organizationId, d.itemId, `SUSPECT: ${parsed.serial} - ${FLAG_LABELS.DUPLICATE_SHIPMENT}`);
        patches[d.itemId] = { needsReturn: q.needsReturn, returnNotes: q.returnNotes };
      }
    }
  }

  const sev = severityOf(flags);
  await auditReceiving(
    org,
    row.quotationId,
    "Scan",
    `${row.productName}: ${[parsed.serial && `serial ${parsed.serial}`, parsed.lot && `lot ${parsed.lot}`].filter(Boolean).join(", ")} scanned by ${src.toLowerCase()}. ${sev === "ok" ? "No problems found." : `Flagged: ${flags.map((f) => FLAG_LABELS[f]).join(", ")}.`}`,
  );
  refresh(packageId);
  return {
    ok: true,
    scan: view,
    serials: await listSerials(org.organizationId, packageId),
    checks,
    recalled,
    notes,
    itemPatches: Object.keys(patches).length ? patches : undefined,
  };
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
  const r = await removeScan(org.organizationId, packageId, String(serialId));
  if (!r.removed) return { error: "That scan wasn't found." };
  refresh(packageId);
  return { ok: true, serials: await listSerials(org.organizationId, packageId) };
}
