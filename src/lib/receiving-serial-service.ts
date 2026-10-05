// Step 6 scanner: saving each scanned unit and finding repeats. No sign-in check in here -- the actions do that and pass
// the company in. Everything is limited to that company, so one company never sees another's serial numbers.

import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { purchasingQuotations, receivingItemSerials, receivingItems, receivingPackages } from "@/db/schema";
import { newId } from "@/lib/ids";
import { normalizeNumber } from "@/lib/receiving-recall";
import {
  flagsFromString,
  flagsToString,
  isCounterfeitSuspect,
  type ParsedScan,
  type SerialFlag,
} from "@/lib/receiving-serial-rules";

export type SerialSource = "SCANNER" | "CAMERA" | "PHOTO" | "TYPED";

export type SerialView = {
  id: string;
  itemId: string;
  serial: string;
  lot: string;
  gtin: string;
  expiry: string;
  source: SerialSource;
  flags: SerialFlag[];
  note: string;
  scannedAt: string;
};

function toView(r: typeof receivingItemSerials.$inferSelect): SerialView {
  return {
    id: r.id,
    itemId: r.itemId,
    serial: r.serial ?? "",
    lot: r.lot ?? "",
    gtin: r.gtin ?? "",
    expiry: r.expiry ?? "",
    source: r.source,
    flags: flagsFromString(r.flag),
    note: r.flagNote ?? "",
    scannedAt: r.scannedAt,
  };
}

export async function listSerials(organizationId: string, packageId: string): Promise<SerialView[]> {
  const rows = await db
    .select()
    .from(receivingItemSerials)
    .where(and(eq(receivingItemSerials.organizationId, organizationId), eq(receivingItemSerials.packageId, packageId)))
    .orderBy(receivingItemSerials.scannedAt, receivingItemSerials.id);
  return rows.map(toView);
}

/** Shipment label for messages: "REF-261005-102 on 2026-10-04". */
async function shipmentLabels(organizationId: string, packageIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (packageIds.length === 0) return out;
  const rows = await db
    .select({ id: receivingPackages.id, receivedAt: receivingPackages.receivedAt, createdAt: receivingPackages.createdAt, ref: purchasingQuotations.quotationNumber })
    .from(receivingPackages)
    .leftJoin(purchasingQuotations, eq(purchasingQuotations.id, receivingPackages.quotationId))
    .where(and(eq(receivingPackages.organizationId, organizationId), inArray(receivingPackages.id, packageIds)));
  for (const r of rows) out.set(r.id, `${r.ref ?? "an earlier shipment"} on ${(r.receivedAt ?? r.createdAt ?? "").slice(0, 10)}`.trim());
  return out;
}

/**
 * Looks at every row that carries this serial in this company and sets the duplicate flags on each: a serial that turns up
 * twice makes BOTH units suspect, so the earlier one is flagged too. When only one is left (a scan was removed) the
 * duplicate flags come off. Returns the rows as they are now.
 */
export async function recomputeDuplicates(organizationId: string, serialNorm: string): Promise<{ id: string; packageId: string; itemId: string; flags: SerialFlag[]; note: string }[]> {
  const rows = await db
    .select()
    .from(receivingItemSerials)
    .where(and(eq(receivingItemSerials.organizationId, organizationId), eq(receivingItemSerials.serialNorm, serialNorm)))
    .orderBy(receivingItemSerials.scannedAt, receivingItemSerials.id);
  const labels = await shipmentLabels(organizationId, [...new Set(rows.map((r) => r.packageId))]);
  const out: { id: string; packageId: string; itemId: string; flags: SerialFlag[]; note: string }[] = [];
  for (const r of rows) {
    const others = rows.filter((o) => o.id !== r.id);
    const sameShip = others.filter((o) => o.packageId === r.packageId);
    const prior = others.filter((o) => o.packageId !== r.packageId);
    const keep: SerialFlag[] = flagsFromString(r.flag).filter((f) => f !== "DUPLICATE_SHIPMENT" && f !== "DUPLICATE_PRIOR");
    const notes: string[] = (r.flagNote ?? "").split("\n").filter((l) => l && !l.startsWith("Duplicate:"));
    if (sameShip.length > 0) {
      keep.push("DUPLICATE_SHIPMENT");
      notes.push(`Duplicate: this serial was scanned ${sameShip.length === 1 ? "twice" : `${sameShip.length + 1} times`} in this shipment. Real products never share a serial number.`);
    }
    if (prior.length > 0) {
      keep.push("DUPLICATE_PRIOR");
      const where = [...new Set(prior.map((o) => labels.get(o.packageId) ?? "an earlier shipment"))].join("; ");
      notes.push(`Duplicate: this serial was already received (${where}). Real products never share a serial number.`);
    }
    const flag = flagsToString(keep);
    const note = notes.join("\n");
    if (flag !== r.flag || note !== (r.flagNote ?? "")) {
      await db.update(receivingItemSerials).set({ flag, flagNote: note || null }).where(eq(receivingItemSerials.id, r.id));
    }
    out.push({ id: r.id, packageId: r.packageId, itemId: r.itemId, flags: flagsFromString(flag), note });
  }
  return out;
}

export type RecordedScan = {
  /** The saved row (or the existing one when this exact serial was already scanned on this product). */
  view: SerialView;
  alreadyScanned: boolean;
};

/**
 * Saves one scanned unit on a received row. The same serial scanned again on the same row is not saved twice (a double
 * beep from the scanner); the same serial on another row or another shipment is saved and both are flagged.
 */
export async function recordScan(
  org: { organizationId: string; userId: string },
  packageId: string,
  itemId: string,
  scan: ParsedScan,
  source: SerialSource,
  pureFlags: SerialFlag[],
  pureNotes: string[],
): Promise<RecordedScan> {
  const serialNorm = scan.serial ? normalizeNumber(scan.serial) : null;
  if (serialNorm) {
    const [same] = await db
      .select()
      .from(receivingItemSerials)
      .where(and(eq(receivingItemSerials.organizationId, org.organizationId), eq(receivingItemSerials.itemId, itemId), eq(receivingItemSerials.serialNorm, serialNorm)))
      .limit(1);
    if (same) return { view: toView(same), alreadyScanned: true };
  }
  const id = newId("rser");
  await db.insert(receivingItemSerials).values({
    id,
    organizationId: org.organizationId,
    packageId,
    itemId,
    serial: scan.serial ?? null,
    serialNorm,
    lot: scan.lot ?? null,
    gtin: scan.gtin ?? null,
    expiry: scan.expiry ?? null,
    source,
    flag: flagsToString(pureFlags),
    flagNote: pureNotes.join("\n") || null,
    scannedByUserId: org.userId,
  });
  if (serialNorm) await recomputeDuplicates(org.organizationId, serialNorm);
  const [row] = await db.select().from(receivingItemSerials).where(eq(receivingItemSerials.id, id)).limit(1);
  return { view: toView(row), alreadyScanned: false };
}

/** Adds a flag (and the reason) to a saved scan, e.g. RECALLED once the recall lists have been checked. */
export async function addFlag(organizationId: string, serialId: string, flag: SerialFlag, note: string): Promise<SerialView | null> {
  const [row] = await db
    .select()
    .from(receivingItemSerials)
    .where(and(eq(receivingItemSerials.id, serialId), eq(receivingItemSerials.organizationId, organizationId)))
    .limit(1);
  if (!row) return null;
  const flags = flagsFromString(row.flag);
  if (!flags.includes(flag)) flags.push(flag);
  const notes = (row.flagNote ?? "").split("\n").filter(Boolean);
  if (note && !notes.includes(note)) notes.push(note);
  await db.update(receivingItemSerials).set({ flag: flagsToString(flags), flagNote: notes.join("\n") || null }).where(eq(receivingItemSerials.id, serialId));
  const [after] = await db.select().from(receivingItemSerials).where(eq(receivingItemSerials.id, serialId)).limit(1);
  return toView(after);
}

/** Removes one scanned unit (a wrong scan) and re-checks the rows that shared its serial. */
export async function removeScan(organizationId: string, packageId: string, serialId: string): Promise<{ removed: boolean; serialNorm: string | null }> {
  const [row] = await db
    .select({ id: receivingItemSerials.id, serialNorm: receivingItemSerials.serialNorm })
    .from(receivingItemSerials)
    .where(and(eq(receivingItemSerials.id, serialId), eq(receivingItemSerials.packageId, packageId), eq(receivingItemSerials.organizationId, organizationId)))
    .limit(1);
  if (!row) return { removed: false, serialNorm: null };
  await db.delete(receivingItemSerials).where(eq(receivingItemSerials.id, serialId));
  if (row.serialNorm) await recomputeDuplicates(organizationId, row.serialNorm);
  return { removed: true, serialNorm: row.serialNorm };
}

/** GTINs already scanned on each row of a shipment (used to spot a different product code on the same row). */
export async function gtinsForItem(organizationId: string, itemId: string): Promise<string[]> {
  const rows = await db
    .select({ gtin: receivingItemSerials.gtin })
    .from(receivingItemSerials)
    .where(and(eq(receivingItemSerials.organizationId, organizationId), eq(receivingItemSerials.itemId, itemId), sql`${receivingItemSerials.gtin} is not null`));
  return [...new Set(rows.map((r) => r.gtin!).filter(Boolean))];
}

/**
 * A row with a likely fake on it goes to review: Needs To Be Returned becomes "Pending review" and the reason is added to
 * the return notes. It never overrides a Yes the agent already set, and never switches anything off.
 */
export async function markRowForReview(
  organizationId: string,
  itemId: string,
  line: string,
): Promise<{ needsReturn: string; returnNotes: string }> {
  const [it] = await db
    .select({ needsReturn: receivingItems.needsReturn, returnNotes: receivingItems.returnNotes })
    .from(receivingItems)
    .where(and(eq(receivingItems.id, itemId), eq(receivingItems.organizationId, organizationId)))
    .limit(1);
  const returnNotes = it?.returnNotes?.includes(line) ? it.returnNotes : [it?.returnNotes, line].filter(Boolean).join("\n");
  const needsReturn: "YES" | "PENDING_REVIEW" = it?.needsReturn === "YES" ? "YES" : "PENDING_REVIEW";
  await db
    .update(receivingItems)
    .set({ needsReturn, returnNotes, updatedAt: sql`(current_timestamp)` })
    .where(and(eq(receivingItems.id, itemId), eq(receivingItems.organizationId, organizationId)));
  return { needsReturn, returnNotes };
}

export { isCounterfeitSuspect };
