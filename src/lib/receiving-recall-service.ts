// Recall checks for Step 6 of receiving: the recall lists a company keeps, and the checks made on received rows.
// Nothing here checks the signed-in user -- callers (the actions) do that and pass the company in.

import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { receivingItems, receivingRecallChecks, receivingRecallNumbers, receivingRecalls } from "@/db/schema";
import { newId } from "@/lib/ids";
import {
  DEFAULT_RECALLS,
  matchNumber,
  nearMatches,
  type NearMatch,
  recallsForProduct,
  isRecalledResult,
  normalizeNumber,
  numbersToCheck,
  parseRecallList,
  type RecallListIndex,
  type RecallResult,
} from "@/lib/receiving-recall";

export type RecallView = {
  id: string;
  name: string;
  manufacturer: string;
  keywords: string;
  numberHint: string;
  lookupUrl: string;
  lookupLabel: string;
  noticeUrl: string;
  active: boolean;
  /** How many lots / serial numbers are loaded (exact numbers + prefixes). */
  numberCount: number;
  prefixCount: number;
  listUpdatedAt: string | null;
};

export type RecallCheckView = {
  id: string;
  itemId: string;
  recallId: string | null;
  recallName: string | null;
  enteredNumber: string;
  result: RecallResult;
  note: string;
  checkedAt: string;
};

export async function listRecalls(organizationId: string): Promise<RecallView[]> {
  const rows = await db.select().from(receivingRecalls).where(eq(receivingRecalls.organizationId, organizationId)).orderBy(receivingRecalls.createdAt);
  if (rows.length === 0) return [];
  const counts = await db
    .select({
      recallId: receivingRecallNumbers.recallId,
      isPrefix: receivingRecallNumbers.isPrefix,
      n: sql<number>`count(*)`,
    })
    .from(receivingRecallNumbers)
    .where(eq(receivingRecallNumbers.organizationId, organizationId))
    .groupBy(receivingRecallNumbers.recallId, receivingRecallNumbers.isPrefix);
  return rows.map((r) => {
    const mine = counts.filter((c) => c.recallId === r.id);
    const prefixCount = Number(mine.find((c) => c.isPrefix)?.n ?? 0);
    const numberCount = Number(mine.find((c) => !c.isPrefix)?.n ?? 0);
    return {
      id: r.id,
      name: r.name,
      manufacturer: r.manufacturer,
      keywords: r.keywords,
      numberHint: r.numberHint ?? "",
      lookupUrl: r.lookupUrl ?? "",
      lookupLabel: r.lookupLabel ?? "",
      noticeUrl: r.noticeUrl ?? "",
      active: r.active,
      numberCount,
      prefixCount,
      listUpdatedAt: r.listUpdatedAt,
    };
  });
}

export async function listChecks(organizationId: string, packageId: string): Promise<RecallCheckView[]> {
  const rows = await db
    .select()
    .from(receivingRecallChecks)
    .where(and(eq(receivingRecallChecks.organizationId, organizationId), eq(receivingRecallChecks.packageId, packageId)))
    .orderBy(receivingRecallChecks.checkedAt);
  return rows.map((c) => ({
    id: c.id,
    itemId: c.itemId,
    recallId: c.recallId,
    recallName: c.recallName,
    enteredNumber: c.enteredNumber,
    result: c.result,
    note: c.note ?? "",
    checkedAt: c.checkedAt,
  }));
}

/** The loaded lists of every active recall, ready for matching. */
export async function loadIndex(organizationId: string): Promise<RecallListIndex[]> {
  const recalls = await db
    .select({ id: receivingRecalls.id, name: receivingRecalls.name })
    .from(receivingRecalls)
    .where(and(eq(receivingRecalls.organizationId, organizationId), eq(receivingRecalls.active, true)));
  if (recalls.length === 0) return [];
  const nums = await db
    .select({ recallId: receivingRecallNumbers.recallId, value: receivingRecallNumbers.value, isPrefix: receivingRecallNumbers.isPrefix })
    .from(receivingRecallNumbers)
    .where(and(eq(receivingRecallNumbers.organizationId, organizationId), inArray(receivingRecallNumbers.recallId, recalls.map((r) => r.id))));
  return recalls.map((r) => {
    const mine = nums.filter((n) => n.recallId === r.id);
    return {
      recallId: r.id,
      recallName: r.name,
      values: new Set(mine.filter((n) => !n.isPrefix).map((n) => n.value)),
      prefixes: mine.filter((n) => n.isPrefix).map((n) => n.value),
    };
  });
}

export type RelevantRecall = { id: string; name: string; manufacturer: string; loaded: number };

/** Active recalls whose keywords appear in this product's name, with how many numbers each has loaded. */
export async function relevantRecalls(organizationId: string, productName: string): Promise<RelevantRecall[]> {
  const rows = await db
    .select({ id: receivingRecalls.id, name: receivingRecalls.name, manufacturer: receivingRecalls.manufacturer, keywords: receivingRecalls.keywords })
    .from(receivingRecalls)
    .where(and(eq(receivingRecalls.organizationId, organizationId), eq(receivingRecalls.active, true)));
  const hits = recallsForProduct(productName, rows);
  if (hits.length === 0) return [];
  const counts = await db
    .select({ recallId: receivingRecallNumbers.recallId, n: sql<number>`count(*)` })
    .from(receivingRecallNumbers)
    .where(and(eq(receivingRecallNumbers.organizationId, organizationId), inArray(receivingRecallNumbers.recallId, hits.map((h) => h.id))))
    .groupBy(receivingRecallNumbers.recallId);
  return hits.map((h) => ({ id: h.id, name: h.name, manufacturer: h.manufacturer, loaded: Number(counts.find((c) => c.recallId === h.id)?.n ?? 0) }));
}

export type CheckOutcome = {
  numbers: { number: string; matches: { recallId: string; recallName: string }[]; near: NearMatch[] }[];
  recalled: boolean;
  /** Some number is close to (but not exactly) a recalled number: a person must look. */
  nearAny: boolean;
  /** Recalls that apply to this product but have no list loaded: "not on the list" proves nothing for these. */
  unverified: { id: string; name: string; manufacturer: string }[];
};

/** Compares what was typed / scanned / read from a photo with the loaded lists and records one check per number (per recall matched). */
export async function runRecallCheck(
  org: { organizationId: string; userId: string },
  packageId: string,
  itemId: string,
  input: string,
): Promise<{ error: string } | CheckOutcome> {
  const numbers = numbersToCheck(input);
  if (numbers.length === 0) return { error: "Enter a lot or serial number (at least 4 letters or digits)." };
  if (numbers.length > 12) return { error: "That is a lot of numbers at once. Check up to 12 at a time." };
  const index = await loadIndex(org.organizationId);
  const [itemRow] = await db
    .select({ name: receivingItems.productName })
    .from(receivingItems)
    .where(and(eq(receivingItems.id, itemId), eq(receivingItems.organizationId, org.organizationId)))
    .limit(1);
  const relevant = itemRow ? await relevantRecalls(org.organizationId, itemRow.name) : [];
  const outcome: CheckOutcome = {
    numbers: [],
    recalled: false,
    nearAny: false,
    unverified: relevant.filter((r) => r.loaded === 0).map((r) => ({ id: r.id, name: r.name, manufacturer: r.manufacturer })),
  };
  for (const n of numbers) {
    const matches = matchNumber(n, index);
    const near = matches.length === 0 ? nearMatches(n, index) : [];
    outcome.numbers.push({ number: n, matches, near });
    if (matches.length > 0) outcome.recalled = true;
    if (near.length > 0) outcome.nearAny = true;
    // Checking the same number again replaces the earlier automatic result for it rather than piling up copies.
    await db
      .delete(receivingRecallChecks)
      .where(
        and(
          eq(receivingRecallChecks.itemId, itemId),
          eq(receivingRecallChecks.organizationId, org.organizationId),
          eq(receivingRecallChecks.enteredNumber, n),
          inArray(receivingRecallChecks.result, ["ON_LIST", "NOT_ON_LIST"]),
        ),
      );
    // A close match is stored on the "not on the list" check as a NEAR note: it keeps the row in review until a manager
    // clears it or someone records the manufacturer's own answer.
    const nearNote = near.length > 0 ? `NEAR: ${near.map((k) => `${k.listed} (${k.recallName})`).join("; ")}` : null;
    const rows: { recallId: string | null; recallName: string | null; result: RecallResult; note?: string | null }[] =
      matches.length > 0
        ? matches.map((m) => ({ recallId: m.recallId, recallName: m.recallName, result: "ON_LIST" as const }))
        : [{ recallId: near[0]?.recallId ?? null, recallName: near[0]?.recallName ?? null, result: "NOT_ON_LIST" as const, note: nearNote }];
    for (const r of rows) {
      await db.insert(receivingRecallChecks).values({
        id: newId("rchk"),
        organizationId: org.organizationId,
        packageId,
        itemId,
        recallId: r.recallId,
        recallName: r.recallName,
        enteredNumber: n,
        result: r.result,
        note: r.note ?? null,
        checkedByUserId: org.userId,
      });
    }
  }
  return outcome;
}

/** The agent looked the number up on the manufacturer's own page and says what it showed. */
export async function recordManualCheck(
  org: { organizationId: string; userId: string },
  packageId: string,
  itemId: string,
  recallId: string,
  number: string,
  affected: boolean,
): Promise<{ error: string } | { recallName: string }> {
  const [recall] = await db
    .select({ id: receivingRecalls.id, name: receivingRecalls.name })
    .from(receivingRecalls)
    .where(and(eq(receivingRecalls.id, recallId), eq(receivingRecalls.organizationId, org.organizationId)))
    .limit(1);
  if (!recall) return { error: "That recall wasn't found." };
  const n = numbersToCheck(number)[0];
  if (!n) return { error: "Enter the lot or serial number you looked up (at least 4 letters or digits)." };
  await db
    .delete(receivingRecallChecks)
    .where(
      and(
        eq(receivingRecallChecks.itemId, itemId),
        eq(receivingRecallChecks.organizationId, org.organizationId),
        eq(receivingRecallChecks.enteredNumber, n),
        eq(receivingRecallChecks.recallId, recallId),
        inArray(receivingRecallChecks.result, ["CONFIRMED_AFFECTED", "CONFIRMED_OK"]),
      ),
    );
  await db.insert(receivingRecallChecks).values({
    id: newId("rchk"),
    organizationId: org.organizationId,
    packageId,
    itemId,
    recallId: recall.id,
    recallName: recall.name,
    enteredNumber: n,
    result: affected ? "CONFIRMED_AFFECTED" : "CONFIRMED_OK",
    checkedByUserId: org.userId,
  });
  return { recallName: recall.name };
}

/**
 * A row that failed a check is marked for return. Returns the fields changed so the open form can show them.
 * Only ever turns "return" on; clearing a check never switches it off again by itself.
 */
export async function markRowForReturn(
  organizationId: string,
  itemId: string,
  recallName: string,
  number: string,
): Promise<{ needsReturn: string; returnStatus: string; quantityToReturn: string; returnNotes: string }> {
  const [it] = await db
    .select({
      quantityReceived: receivingItems.quantityReceived,
      quantityToReturn: receivingItems.quantityToReturn,
      returnStatus: receivingItems.returnStatus,
      returnNotes: receivingItems.returnNotes,
    })
    .from(receivingItems)
    .where(and(eq(receivingItems.id, itemId), eq(receivingItems.organizationId, organizationId)))
    .limit(1);
  const line = `RECALL: ${recallName} - ${number}`;
  const returnNotes = it?.returnNotes?.includes(line) ? it.returnNotes : [it?.returnNotes, line].filter(Boolean).join("\n");
  const returnStatus = !it?.returnStatus || it.returnStatus === "NOT_APPLICABLE" ? "RETURN_REQUESTED" : it.returnStatus;
  const quantityToReturn = it?.quantityToReturn ?? (it?.quantityReceived && it.quantityReceived > 0 ? it.quantityReceived : null);
  await db
    .update(receivingItems)
    .set({
      needsReturn: "YES",
      returnStatus: returnStatus as "RETURN_REQUESTED" | "RETURN_SHIPPED" | "RETURNED",
      quantityToReturn,
      returnNotes,
      updatedAt: sql`(current_timestamp)`,
    })
    .where(eq(receivingItems.id, itemId));
  return { needsReturn: "YES", returnStatus, quantityToReturn: quantityToReturn == null ? "" : String(quantityToReturn), returnNotes };
}

export async function deleteCheck(organizationId: string, packageId: string, checkId: string): Promise<boolean> {
  const del = await db
    .delete(receivingRecallChecks)
    .where(and(eq(receivingRecallChecks.id, checkId), eq(receivingRecallChecks.packageId, packageId), eq(receivingRecallChecks.organizationId, organizationId)))
    .returning({ id: receivingRecallChecks.id });
  return del.length > 0;
}

// ---- admin: managing the recalls and their lists --------------------------------

export async function setupDefaultRecalls(organizationId: string): Promise<number> {
  const have = await db.select({ name: receivingRecalls.name }).from(receivingRecalls).where(eq(receivingRecalls.organizationId, organizationId));
  const names = new Set(have.map((h) => h.name.toLowerCase()));
  let added = 0;
  for (const d of DEFAULT_RECALLS) {
    if (names.has(d.name.toLowerCase())) continue;
    await db.insert(receivingRecalls).values({
      id: newId("rcl"),
      organizationId,
      name: d.name,
      manufacturer: d.manufacturer,
      keywords: d.keywords,
      numberHint: d.numberHint,
      lookupUrl: d.lookupUrl,
      lookupLabel: d.lookupLabel,
      noticeUrl: d.noticeUrl,
    });
    added++;
  }
  return added;
}

const clip = (s: unknown, max: number) => (typeof s === "string" ? s.trim().slice(0, max) : "");
const webUrl = (s: unknown) => {
  const v = clip(s, 500);
  if (!v) return "";
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : "";
  } catch {
    return "";
  }
};

export type RecallInput = { name: unknown; manufacturer: unknown; keywords: unknown; numberHint: unknown; lookupUrl: unknown; lookupLabel: unknown; noticeUrl: unknown; active?: unknown };

export async function saveRecall(organizationId: string, id: string | null, input: RecallInput): Promise<{ error: string } | { id: string }> {
  const name = clip(input.name, 120);
  if (!name) return { error: "Give the recall a name." };
  const lookupUrlRaw = clip(input.lookupUrl, 500);
  const noticeUrlRaw = clip(input.noticeUrl, 500);
  const lookupUrl = webUrl(input.lookupUrl);
  const noticeUrl = webUrl(input.noticeUrl);
  if (lookupUrlRaw && !lookupUrl) return { error: "The lookup link must start with https://" };
  if (noticeUrlRaw && !noticeUrl) return { error: "The notice link must start with https://" };
  const values = {
    name,
    manufacturer: clip(input.manufacturer, 80),
    keywords: clip(input.keywords, 200),
    numberHint: clip(input.numberHint, 400) || null,
    lookupUrl: lookupUrl || null,
    lookupLabel: clip(input.lookupLabel, 80) || null,
    noticeUrl: noticeUrl || null,
    active: input.active === undefined ? true : input.active === true || input.active === "true" || input.active === "on",
  };
  if (id) {
    const upd = await db
      .update(receivingRecalls)
      .set({ ...values, updatedAt: sql`(current_timestamp)` })
      .where(and(eq(receivingRecalls.id, id), eq(receivingRecalls.organizationId, organizationId)))
      .returning({ id: receivingRecalls.id });
    if (upd.length === 0) return { error: "That recall wasn't found." };
    return { id };
  }
  const newRecallId = newId("rcl");
  await db.insert(receivingRecalls).values({ id: newRecallId, organizationId, ...values });
  return { id: newRecallId };
}

export async function deleteRecall(organizationId: string, id: string): Promise<boolean> {
  const del = await db
    .delete(receivingRecalls)
    .where(and(eq(receivingRecalls.id, id), eq(receivingRecalls.organizationId, organizationId)))
    .returning({ id: receivingRecalls.id });
  return del.length > 0;
}

const MAX_PASTE = 400_000;

/** What pasting this text would do, without saving it (the preview the admin confirms). */
export async function previewNumbers(organizationId: string, recallId: string, text: string, mode: "add" | "replace") {
  const p = parseRecallList(text.slice(0, MAX_PASTE));
  const existing = mode === "add" ? await existingNumbers(organizationId, recallId) : new Set<string>();
  const fresh = [...p.values.map((v) => ({ v, prefix: false })), ...p.prefixes.map((v) => ({ v, prefix: true }))].filter((x) => !existing.has(`${x.prefix ? "p" : "v"}:${x.v}`));
  return {
    values: p.values.length,
    prefixes: p.prefixes.length,
    skipped: p.skipped,
    newOnes: fresh.length,
    sample: [...p.values, ...p.prefixes.map((x) => `${x}*`)].slice(0, 8),
  };
}

async function existingNumbers(organizationId: string, recallId: string) {
  const rows = await db
    .select({ value: receivingRecallNumbers.value, isPrefix: receivingRecallNumbers.isPrefix })
    .from(receivingRecallNumbers)
    .where(and(eq(receivingRecallNumbers.organizationId, organizationId), eq(receivingRecallNumbers.recallId, recallId)));
  return new Set(rows.map((r) => `${r.isPrefix ? "p" : "v"}:${r.value}`));
}

export async function importNumbers(
  organizationId: string,
  recallId: string,
  text: string,
  mode: "add" | "replace",
): Promise<{ error: string } | { added: number; skipped: number; total: number }> {
  const [recall] = await db
    .select({ id: receivingRecalls.id })
    .from(receivingRecalls)
    .where(and(eq(receivingRecalls.id, recallId), eq(receivingRecalls.organizationId, organizationId)))
    .limit(1);
  if (!recall) return { error: "That recall wasn't found." };
  const p = parseRecallList(text.slice(0, MAX_PASTE));
  if (p.values.length + p.prefixes.length === 0) return { error: "No lot or serial numbers were found in what you pasted." };
  if (mode === "replace") {
    await db.delete(receivingRecallNumbers).where(and(eq(receivingRecallNumbers.recallId, recallId), eq(receivingRecallNumbers.organizationId, organizationId)));
  }
  const existing = mode === "add" ? await existingNumbers(organizationId, recallId) : new Set<string>();
  const rows = [...p.values.map((v) => ({ v, prefix: false })), ...p.prefixes.map((v) => ({ v, prefix: true }))]
    .filter((x) => !existing.has(`${x.prefix ? "p" : "v"}:${x.v}`))
    .map((x) => ({ id: newId("rnum"), organizationId, recallId, value: x.v, isPrefix: x.prefix }));
  for (let i = 0; i < rows.length; i += 200) {
    await db.insert(receivingRecallNumbers).values(rows.slice(i, i + 200)).onConflictDoNothing();
  }
  await db
    .update(receivingRecalls)
    .set({ listUpdatedAt: new Date().toISOString().slice(0, 10), updatedAt: sql`(current_timestamp)` })
    .where(eq(receivingRecalls.id, recallId));
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)` })
    .from(receivingRecallNumbers)
    .where(and(eq(receivingRecallNumbers.recallId, recallId), eq(receivingRecallNumbers.organizationId, organizationId)));
  return { added: rows.length, skipped: p.skipped, total: Number(n) };
}



// ---- the gate: a recall-risk product can't be submitted without a real check -------------------------------------

/**
 * Lines the "Missing Info" list must show for recall-risk products. A product whose name matches an active recall
 * needs a check before the shipment can be submitted:
 *  - recall with a list loaded: at least one lot / serial number checked on the row;
 *  - recall with NO list loaded: "not on the list" proves nothing, so the agent has to look the number up on the
 *    manufacturer's page and record what it said.
 */
export async function recallGateIssues(
  organizationId: string,
  packageId: string,
  items: { id: string; productName: string | null; wasReceived: string | null; quantityReceived: number | null }[],
): Promise<string[]> {
  const out: string[] = [];
  const candidates = items.filter((i) => i.productName?.trim() && i.wasReceived !== "NO" && (i.quantityReceived ?? 0) > 0);
  if (candidates.length === 0) return out;
  const checks = await db
    .select({ itemId: receivingRecallChecks.itemId, recallId: receivingRecallChecks.recallId, result: receivingRecallChecks.result, note: receivingRecallChecks.note, n: receivingRecallChecks.enteredNumber })
    .from(receivingRecallChecks)
    .where(and(eq(receivingRecallChecks.organizationId, organizationId), eq(receivingRecallChecks.packageId, packageId)));
  for (const it of candidates) {
    const name = it.productName!.trim();
    const mine = checks.filter((c) => c.itemId === it.id);
    const resolved = mine.some((c) => c.result === "CONFIRMED_OK" || c.result === "CONFIRMED_AFFECTED");
    if (!resolved) {
      for (const c of mine.filter((x) => x.note?.startsWith("NEAR:"))) {
        out.push(`${name}: ${c.n} looks like a recalled number (${c.note!.slice(6)}). A manager must clear it, or record what the manufacturer's page says.`);
      }
    }
    for (const r of await relevantRecalls(organizationId, name)) {
      if (r.loaded > 0) {
        const done = mine.some((c) => c.result === "ON_LIST" || c.result === "NOT_ON_LIST" || c.recallId === r.id);
        if (!done) out.push(`${name}: recall check needed (${r.name}). Enter or scan its lot or serial number in Step 6.`);
      } else {
        const done = mine.some((c) => c.recallId === r.id && (c.result === "CONFIRMED_OK" || c.result === "CONFIRMED_AFFECTED"));
        if (!done) out.push(`${name}: ${r.name} has no list loaded here, so look its number up on ${r.manufacturer || "the manufacturer"}'s page and record the result in Step 6.`);
      }
    }
  }
  return out;
}

/** True when this row has a check that says the product is recalled (so it must stay marked for return). */
export async function rowIsRecalled(organizationId: string, itemId: string): Promise<boolean> {
  const rows = await db
    .select({ result: receivingRecallChecks.result })
    .from(receivingRecallChecks)
    .where(and(eq(receivingRecallChecks.organizationId, organizationId), eq(receivingRecallChecks.itemId, itemId)));
  return rows.some((r) => isRecalledResult(r.result));
}

void normalizeNumber;


/** Close-match holds on this row that nobody has cleared yet. */
export async function openNearHolds(organizationId: string, itemId: string) {
  const rows = await db
    .select({ recallId: receivingRecallChecks.recallId, recallName: receivingRecallChecks.recallName, n: receivingRecallChecks.enteredNumber, note: receivingRecallChecks.note, result: receivingRecallChecks.result })
    .from(receivingRecallChecks)
    .where(and(eq(receivingRecallChecks.organizationId, organizationId), eq(receivingRecallChecks.itemId, itemId)));
  if (rows.some((r) => r.result === "CONFIRMED_OK" || r.result === "CONFIRMED_AFFECTED")) return [];
  return rows.filter((r) => r.note?.startsWith("NEAR:"));
}

/** A manager reviewed a close match and cleared it: recorded as a check, so the history shows who and why. */
export async function clearNearHolds(org: { organizationId: string; userId: string }, packageId: string, itemId: string, holds: Awaited<ReturnType<typeof openNearHolds>>) {
  for (const h of holds) {
    if (!h.recallId) continue;
    await db.insert(receivingRecallChecks).values({
      id: newId("rchk"),
      organizationId: org.organizationId,
      packageId,
      itemId,
      recallId: h.recallId,
      recallName: h.recallName,
      enteredNumber: h.n,
      result: "CONFIRMED_OK",
      note: "Close match reviewed and cleared by a manager",
      checkedByUserId: org.userId,
    });
  }
}
