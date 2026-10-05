// When a recall list is added to or replaced, stock that was received BEFORE the list was loaded may be on it. This
// compares every lot and serial number ever entered for the company with the lists as they are now, marks the rows
// that match for return, and says which shipments they came from.

import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  purchasingQuotations,
  receivingExpirationLots,
  receivingItemSerials,
  receivingItems,
  receivingPackages,
  receivingRecallChecks,
} from "@/db/schema";
import { newId } from "@/lib/ids";
import { matchNumber, normalizeNumber } from "@/lib/receiving-recall";
import { loadIndex, markRowForReturn } from "@/lib/receiving-recall-service";
import { auditReceiving, writeIntakeLog, type OrgRef } from "@/lib/receiving-service";

export type RescanHit = { quotationNumber: string; packageId: string; itemId: string; product: string; number: string; recalls: string[] };

export async function rescanReceivedStock(org: OrgRef): Promise<{ hits: RescanHit[]; rowsLooked: number; numbersLooked: number }> {
  const index = await loadIndex(org.organizationId);
  const rows = await db
    .select({
      itemId: receivingItems.id,
      packageId: receivingItems.packageId,
      product: receivingItems.productName,
      lot: receivingItems.lotNumber,
      wasReceived: receivingItems.wasReceived,
      returnStatus: receivingItems.returnStatus,
      pkgStatus: receivingPackages.status,
      quotationId: receivingPackages.quotationId,
      quotationNumber: purchasingQuotations.quotationNumber,
    })
    .from(receivingItems)
    .innerJoin(receivingPackages, eq(receivingPackages.id, receivingItems.packageId))
    .innerJoin(purchasingQuotations, eq(purchasingQuotations.id, receivingPackages.quotationId))
    .where(eq(receivingItems.organizationId, org.organizationId));
  const lots = await db.select({ itemId: receivingExpirationLots.itemId, lot: receivingExpirationLots.lotNumber }).from(receivingExpirationLots).where(eq(receivingExpirationLots.organizationId, org.organizationId));
  const serials = await db.select({ itemId: receivingItemSerials.itemId, serial: receivingItemSerials.serial, lot: receivingItemSerials.lot }).from(receivingItemSerials).where(eq(receivingItemSerials.organizationId, org.organizationId));
  const existing = await db
    .select({ itemId: receivingRecallChecks.itemId, n: receivingRecallChecks.enteredNumber, recallId: receivingRecallChecks.recallId, result: receivingRecallChecks.result })
    .from(receivingRecallChecks)
    .where(eq(receivingRecallChecks.organizationId, org.organizationId));

  const hits: RescanHit[] = [];
  let numbersLooked = 0;
  const touchedPackages = new Set<string>();
  for (const r of rows) {
    if (r.wasReceived === "NO" || r.returnStatus === "RETURNED") continue;
    const nums = new Set<string>();
    for (const x of [r.lot, ...lots.filter((l) => l.itemId === r.itemId).map((l) => l.lot), ...serials.filter((s) => s.itemId === r.itemId).flatMap((s) => [s.serial, s.lot])]) {
      const n = normalizeNumber(x ?? "");
      if (n.length >= 4 && /\d/.test(n)) nums.add(n);
    }
    for (const n of nums) {
      numbersLooked++;
      const matches = matchNumber(n, index);
      if (matches.length === 0) continue;
      const fresh = matches.filter((m) => !existing.some((e) => e.itemId === r.itemId && e.n === n && e.recallId === m.recallId && (e.result === "ON_LIST" || e.result === "CONFIRMED_AFFECTED")));
      if (fresh.length === 0) continue;
      for (const m of fresh) {
        await db.insert(receivingRecallChecks).values({
          id: newId("rchk"),
          organizationId: org.organizationId,
          packageId: r.packageId,
          itemId: r.itemId,
          recallId: m.recallId,
          recallName: m.recallName,
          enteredNumber: n,
          result: "ON_LIST",
          note: "Found when the recall list was updated",
          checkedByUserId: org.userId,
        });
        existing.push({ itemId: r.itemId, n, recallId: m.recallId, result: "ON_LIST" });
      }
      await markRowForReturn(org.organizationId, r.itemId, fresh[0].recallName, n);
      await auditReceiving(org, r.quotationId, "Recall check", `${r.product}: ${n} is on the recall list (${fresh.map((m) => m.recallName).join(", ")}), found when the list was updated. Marked for return.`);
      hits.push({ quotationNumber: r.quotationNumber, packageId: r.packageId, itemId: r.itemId, product: r.product, number: n, recalls: fresh.map((m) => m.recallName) });
      if (r.pkgStatus !== "IN_PROGRESS") touchedPackages.add(r.packageId);
    }
  }
  for (const id of touchedPackages) await writeIntakeLog(org, id);
  return { hits, rowsLooked: rows.length, numbersLooked };
}
