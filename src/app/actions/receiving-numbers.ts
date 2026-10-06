"use server";

// Step 6 lot & serial list: saves a confirmed list of lot and serial numbers (typed with commas, or read from a group
// photo and confirmed by the receiver) on one received product. Every number goes through the same checks as a single
// scan: repeated serials (this shipment and every earlier one), made-up or wrong-shaped serials, expiry and the recall
// lists, with the product row sent to review or marked for return when something is wrong. Owner / Admin / Receiver only.

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { receivingItemSerials } from "@/db/schema";
import { requireOrg } from "@/lib/tenant";
import { canWriteReceiving } from "@/lib/permissions";
import { auditReceiving } from "@/lib/receiving-service";
import { normalizeNumber } from "@/lib/receiving-recall";
import { BATCH_CHUNK, MAX_NUMBER_LENGTH, type NumberEntry } from "@/lib/receiving-number-list";
import { FLAG_LABELS, severityOf, type ParsedScan } from "@/lib/receiving-serial-rules";
import { openRow, scanParsed } from "@/lib/receiving-scan-core";
import { listSerials, type SerialSource } from "@/lib/receiving-serial-service";
import type { ItemPatchLite } from "@/app/actions/receiving-scan";
import type { RecallCheckView } from "@/lib/receiving-recall-service";
import type { SerialView } from "@/lib/receiving-serial-service";

export type NumberOutcome = {
  /** The number as the receiver confirmed it. */
  label: string;
  kind: "LOT" | "SERIAL";
  status: "OK" | "WARN" | "STOP" | "RECALLED" | "NEAR" | "ALREADY" | "SKIPPED";
  /** Plain-language reasons. */
  notes: string[];
};

export type NumbersBatchResult = {
  error?: string;
  ok?: boolean;
  outcomes?: NumberOutcome[];
  serials?: SerialView[];
  checks?: RecallCheckView[];
  itemPatches?: Record<string, ItemPatchLite>;
  /** Recalls for this product that have no list loaded, so a clean result proves nothing. */
  unverified?: string[];
};

const SOURCES: SerialSource[] = ["CAMERA", "PHOTO", "TYPED"];

function trimTo(v: unknown): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_NUMBER_LENGTH);
}

export async function saveNumberBatch(packageId: string, itemId: string, entries: NumberEntry[], source: string): Promise<NumbersBatchResult> {
  const org = await requireOrg();
  if (!canWriteReceiving(org.role)) return { error: "Your role can view Receiving but can't make changes." };
  if (!Array.isArray(entries) || entries.length === 0) return { error: "There are no numbers to save." };
  if (entries.length > BATCH_CHUNK) return { error: `Send at most ${BATCH_CHUNK} numbers at a time.` };
  const row = await openRow(org, packageId, itemId);
  if ("error" in row) return { error: row.error };
  const src: SerialSource = (SOURCES as string[]).includes(source) ? (source as SerialSource) : "TYPED";

  const outcomes: NumberOutcome[] = [];
  const patches: Record<string, ItemPatchLite> = {};
  let last: Awaited<ReturnType<typeof scanParsed>> | null = null;
  const unverified = new Set<string>();

  for (const e of entries) {
    const serial = trimTo(e.serial);
    const lot = normalizeNumber(trimTo(e.lot));
    if (!serial && !lot) continue;
    const kind: "LOT" | "SERIAL" = serial ? "SERIAL" : "LOT";
    const label = serial || trimTo(e.lot);
    if (serial && !normalizeNumber(serial)) {
      outcomes.push({ label, kind, status: "SKIPPED", notes: ["That has no letters or digits, so it was not saved."] });
      continue;
    }

    // A lot that is already on this product (a lot-only entry) is not saved a second time.
    if (!serial && lot) {
      const [dup] = await db
        .select({ id: receivingItemSerials.id })
        .from(receivingItemSerials)
        .where(
          and(
            eq(receivingItemSerials.organizationId, org.organizationId),
            eq(receivingItemSerials.itemId, itemId),
            isNull(receivingItemSerials.serialNorm),
            eq(receivingItemSerials.lot, lot),
          ),
        )
        .limit(1);
      if (dup) {
        outcomes.push({ label, kind, status: "ALREADY", notes: ["This lot is already recorded on this product."] });
        continue;
      }
    }

    const parsed: ParsedScan = {
      gs1: false,
      ...(serial ? { serial } : {}),
      ...(lot ? { lot } : {}),
      ...(e.gtin && /^\d{8,14}$/.test(String(e.gtin)) ? { gtin: String(e.gtin) } : {}),
      ...(e.expiry && /^\d{4}-\d{2}-\d{2}$/.test(String(e.expiry)) ? { expiry: String(e.expiry) } : {}),
    };
    const r = await scanParsed(org, row, packageId, itemId, parsed, src);
    if (r.error) {
      outcomes.push({ label, kind, status: "SKIPPED", notes: [r.error] });
      continue;
    }
    last = r;
    for (const [id, p] of Object.entries(r.itemPatches ?? {})) patches[id] = { ...patches[id], ...p };
    for (const u of r.unverified ?? []) unverified.add(u);

    const flags = r.scan?.flags ?? [];
    const notes = [...(r.notes ?? [])];
    let status: NumberOutcome["status"];
    if (r.alreadyScanned) status = "ALREADY";
    else if (r.recalled && r.recalled.length > 0) {
      status = "RECALLED";
      notes.unshift(...r.recalled.map((x) => `${x.number} is on the recall list for ${x.recalls.join(", ")}.`));
    } else if (r.near && r.near.length > 0) {
      status = "NEAR";
      notes.unshift(...r.near.map((k) => `${k.number} is very close to recalled ${k.listed} (${k.recall}). Compare the label with the recall notice.`));
    } else {
      const sev = severityOf(flags);
      status = sev === "stop" ? "STOP" : sev === "warn" ? "WARN" : "OK";
      if (sev !== "ok" && notes.length === 0) notes.push(flags.map((f) => FLAG_LABELS[f]).join(", "));
    }
    outcomes.push({ label, kind, status, notes });
  }

  const saved = outcomes.filter((o) => o.status !== "SKIPPED" && o.status !== "ALREADY").length;
  if (saved > 0) {
    await auditReceiving(
      org,
      row.quotationId,
      "Lot & serial list",
      `${row.productName}: ${saved} number${saved === 1 ? "" : "s"} saved from a ${src === "PHOTO" ? "group photo (confirmed by the receiver)" : src === "CAMERA" ? "camera read" : "typed list"}. ${
        outcomes.some((o) => ["STOP", "RECALLED", "NEAR"].includes(o.status)) ? "Some were flagged for review." : "None were flagged."
      }`,
    );
  }
  revalidatePath("/dashboard/receiving", "layout");
  revalidatePath(`/dashboard/receiving/intake/${packageId}`);
  return {
    ok: true,
    outcomes,
    serials: await listSerials(org.organizationId, packageId),
    checks: last?.checks,
    itemPatches: Object.keys(patches).length ? patches : undefined,
    unverified: [...unverified],
  };
}
