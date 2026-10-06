// Saving and checking one read unit (lot and/or serial) on a received product. Shared by the single-scan action and the
// group-photo / typed-list action. No sign-in check in here: the actions do that and pass the company in.

import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { receivingItems, receivingPackages } from "@/db/schema";
import type { CurrentOrg } from "@/lib/tenant";
import { isShipmentLocked } from "@/lib/receiving-test-lock";
import { auditReceiving } from "@/lib/receiving-service";
import { normalizeNumber, numbersToCheck } from "@/lib/receiving-recall";
import { listChecks, markRowForReturn, runRecallCheck, type RecallCheckView } from "@/lib/receiving-recall-service";
import { FLAG_LABELS, inspectScan, isCounterfeitSuspect, severityOf, type ParsedScan, type SerialFlag } from "@/lib/receiving-serial-rules";
import { addFlag, gtinsForItem, listSerials, markRowForReview, recomputeDuplicates, recordScan, type SerialSource } from "@/lib/receiving-serial-service";
import type { ItemPatchLite, ScanResult } from "@/app/actions/receiving-scan";

/** Finds the shipment and the product line a scan belongs to, inside this company only. */
export async function openRow(org: CurrentOrg, packageId: string, itemId: string): Promise<{ error: string } | { quotationId: string; productName: string }> {
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

/**
 * Saves and checks one already-read unit (lot and/or serial): the shared core of a single scan and of the group-photo /
 * typed list. Does not refresh pages; the caller does that once.
 */
export async function scanParsed(
  org: CurrentOrg,
  row: { quotationId: string; productName: string },
  packageId: string,
  itemId: string,
  parsed: ParsedScan,
  src: SerialSource,
): Promise<ScanResult> {
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
  let near: { number: string; listed: string; recall: string }[] = [];
  let unverified: string[] = [];
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
      near = r.numbers.flatMap((n) => n.near.map((k) => ({ number: n.number, listed: k.listed, recall: k.recallName })));
      unverified = r.unverified.map((u) => u.name);
      if (recalled.length === 0 && near.length > 0) {
        const line = `CHECK: ${near[0].number} is very close to recalled ${near[0].listed} (${near[0].recall}). Compare the label with the recall notice.`;
        const pv = await markRowForReview(org.organizationId, itemId, line);
        patches[itemId] = { ...patches[itemId], needsReturn: pv.needsReturn, returnNotes: pv.returnNotes };
        await auditReceiving(org, row.quotationId, "Recall check", `${row.productName}: ${line}`);
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
  return {
    ok: true,
    scan: view,
    serials: await listSerials(org.organizationId, packageId),
    checks,
    recalled,
    near,
    unverified,
    notes,
    itemPatches: Object.keys(patches).length ? patches : undefined,
  };
}

