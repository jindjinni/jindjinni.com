// Automatic recall checks on whatever lot numbers were typed into the product rows, so a lot nobody ran through the
// Recall check box is still compared with the lists every time a shipment is saved or submitted.

import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { receivingExpirationLots, receivingItems } from "@/db/schema";
import { auditReceiving, type OrgRef } from "@/lib/receiving-service";
import { normalizeNumber } from "@/lib/receiving-recall";
import { markRowForReturn, runRecallCheck } from "@/lib/receiving-recall-service";
import { markRowForReview } from "@/lib/receiving-serial-service";

export type RowPatch = { needsReturn?: string; returnStatus?: string; quantityToReturn?: string; returnNotes?: string };

export async function autoCheckRowLots(
  org: OrgRef,
  packageId: string,
  quotationId: string,
): Promise<{ patches: Record<string, RowPatch>; notices: string[] }> {
  const patches: Record<string, RowPatch> = {};
  const notices: string[] = [];
  const items = await db
    .select({ id: receivingItems.id, name: receivingItems.productName, lot: receivingItems.lotNumber, wasReceived: receivingItems.wasReceived })
    .from(receivingItems)
    .where(and(eq(receivingItems.packageId, packageId), eq(receivingItems.organizationId, org.organizationId)));
  for (const it of items) {
    if (!it.name?.trim() || it.wasReceived === "NO") continue;
    const lots = await db
      .select({ lot: receivingExpirationLots.lotNumber })
      .from(receivingExpirationLots)
      .where(and(eq(receivingExpirationLots.itemId, it.id), eq(receivingExpirationLots.organizationId, org.organizationId)));
    // Each lot as one number (spaces inside a lot are part of the lot), several lots side by side.
    const numbers = [it.lot, ...lots.map((l) => l.lot)].map((x) => normalizeNumber(x ?? "")).filter(Boolean);
    if (numbers.length === 0) continue;
    const r = await runRecallCheck(org, packageId, it.id, numbers.slice(0, 12).join(" "));
    if ("error" in r) continue;
    const hit = r.numbers.find((n) => n.matches.length > 0);
    if (hit) {
      patches[it.id] = await markRowForReturn(org.organizationId, it.id, hit.matches[0].recallName, hit.number);
      const msg = `${it.name}: lot ${hit.number} is on the recall list (${hit.matches.map((m) => m.recallName).join(", ")}). Marked for return.`;
      notices.push(msg);
      await auditReceiving(org, quotationId, "Recall check", msg);
      continue;
    }
    const near = r.numbers.find((n) => n.near.length > 0);
    if (near) {
      const k = near.near[0];
      const line = `CHECK: ${near.number} is very close to recalled ${k.listed} (${k.recallName}). Compare the label with the recall notice.`;
      const p = await markRowForReview(org.organizationId, it.id, line);
      patches[it.id] = { needsReturn: p.needsReturn, returnNotes: p.returnNotes };
      notices.push(`${it.name}: ${line}`);
      await auditReceiving(org, quotationId, "Recall check", `${it.name}: ${line}`);
    }
  }
  return { patches, notices };
}
