"use client";

// Runs a recall check for one received row and turns the answer into something the screen can show. Shared by the
// Recall check box and the scan button on each product row.

import { useState, useTransition } from "react";
import { checkRecall, confirmRecallLookup, type RecallActionState, type RecallItemPatch } from "@/app/actions/receiving-recalls";
import type { RecallCheckView, RecallView } from "@/lib/receiving-recall-service";
import { normalizeNumber, parseGs1, recallsForProduct } from "@/lib/receiving-recall";
import type { ItemState } from "./item-card";

export type Outcome = { tone: "bad" | "ok" | "info"; title: string; lines: string[] };

export function useRecallRunner({
  packageId,
  recalls,
  onChecks,
  onPatchMany,
  onError,
}: {
  packageId: string;
  recalls: RecallView[];
  onChecks: (checks: RecallCheckView[]) => void;
  onPatchMany: (updates: Record<string, Partial<ItemState>>) => void;
  onError: (m: string) => void;
}) {
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();

  function applyPatch(itemId: string, p?: RecallItemPatch) {
    if (!p) return;
    onPatchMany({ [itemId]: { needsReturn: p.needsReturn, returnStatus: p.returnStatus, quantityToReturn: p.quantityToReturn, returnNotes: p.returnNotes } });
  }
  function took(r: RecallActionState) {
    if (r.checks) onChecks(r.checks);
  }

  function run(row: ItemState, text: string) {
    setOutcome(null);
    start(async () => {
      const r = await checkRecall(packageId, row.id, text);
      if (r.error) return onError(r.error);
      took(r);
      applyPatch(row.id, r.itemPatch);
      const hits = (r.results ?? []).filter((x) => x.recalls.length > 0);
      if (hits.length > 0) {
        setOutcome({
          tone: "bad",
          title: `RECALLED: ${row.productName}`,
          lines: [...hits.map((h) => `${h.number} is on the recall list for ${h.recalls.join(", ")}.`), "Do not accept this product. The row is marked Needs To Be Returned: Yes (Return Requested)."],
        });
      } else {
        const nums = (r.results ?? []).map((x) => x.number).join(", ");
        const mine = recallsForProduct(row.productName, recalls);
        const loaded = mine.filter((m) => m.numberCount + m.prefixCount > 0);
        const date = loaded.map((m) => m.listUpdatedAt).filter(Boolean).sort().pop();
        setOutcome({
          tone: "info",
          title: "Not on the recall lists we have",
          lines: [
            `${nums} was not found${date ? ` (our list was last updated ${date})` : mine.length && loaded.length === 0 ? " (no list is loaded for this product yet)" : ""}.`,
            "That does not mean the product is safe. Confirm on the manufacturer's page, then record what it said.",
          ],
        });
      }
    });
  }

  /**
   * The text a scan, photo or barcode scanner gave: fill the row's lot (and expiry date) from a GS1 barcode, then check it.
   * `overwriteLot` is for the scan button in the row's own Lot Number cell, where replacing the lot is what was asked for.
   */
  function applyScanned(row: ItemState, text: string, opts: { overwriteLot?: boolean } = {}) {
    setNote("");
    const g = parseGs1(text);
    if (g) {
      const patch: Partial<ItemState> = {};
      const hasLot = row.lotNumber.trim() || row.lots.some((l) => l.lotNumber.trim());
      if (g.lot && (opts.overwriteLot || !hasLot)) patch.lotNumber = g.lot;
      if (g.expiry && !row.expirationDate && !row.expirationEntryType) {
        patch.expirationDate = g.expiry;
        patch.expirationEntryType = "SINGLE";
      }
      if (Object.keys(patch).length) onPatchMany({ [row.id]: patch });
      if (g.lot && !opts.overwriteLot && row.lotNumber.trim() && normalizeNumber(row.lotNumber) !== normalizeNumber(g.lot)) {
        setNote(`The label says lot ${g.lot}, but this row has lot ${row.lotNumber}. Check which one is right.`);
      } else if (patch.lotNumber) {
        setNote(`Lot ${patch.lotNumber}${patch.expirationDate ? ` and expiry ${patch.expirationDate}` : ""} filled in on the row.`);
      }
    }
    const toCheck = g ? [g.lot, g.serial].filter(Boolean).join(" ") : text;
    run(row, toCheck);
    return toCheck;
  }

  function confirm(row: ItemState, recallId: string, number: string, affected: boolean) {
    if (normalizeNumber(number).length < 4) return onError("Type or scan the lot / serial number you looked up first.");
    start(async () => {
      const r = await confirmRecallLookup(packageId, row.id, recallId, number, affected);
      if (r.error) return onError(r.error);
      took(r);
      applyPatch(row.id, r.itemPatch);
      setOutcome(
        affected
          ? { tone: "bad", title: `RECALLED: ${row.productName}`, lines: ["Recorded as affected. The row is marked Needs To Be Returned: Yes (Return Requested)."] }
          : { tone: "ok", title: "Recorded: not affected", lines: ["The manufacturer's page showed this number is not affected. This is saved with the shipment."] },
      );
    });
  }

  return { outcome, setOutcome, note, setNote, pending, run, applyScanned, confirm, took };
}
