// Runs the "Load 100 test orders" tool: creates each test order through the SAME actions the screens use
// (Purchasing quotation, quoted lines, deduction, recall checks, Receiving intake, submit, Accounts, adjustment
// quotations), so what you see afterwards is real app data, not shortcuts. Every customer is tagged TEST.
//
// All of it runs as the signed-in platform owner, inside their own company (requireOrg), so a test company's data
// never touches another company's.
import { and, eq, inArray, like, sql } from "drizzle-orm";
import { deflateSync } from "node:zlib";
import { db } from "@/db/client";
import {
  purchasingConditions,
  purchasingCustomers,
  purchasingExpirationRanges,
  purchasingProducts,
  purchasingQuotations,
  purchasingQuotedItems,
  receivingPackagePhotos,
  receivingAdjustments,
  receivingPackages,
  receivingItems,
  receivingRecalls,
} from "@/db/schema";
import type { CurrentOrg } from "@/lib/tenant";
import { newId } from "@/lib/ids";
import { storage } from "@/lib/receiving-storage";
import { getProductConditionsMap, getProductExpiryOptionsMap } from "@/lib/queries";
import {
  LIBRE3_RECALLED_LOTS,
  OMNIPOD_RECALLED_LOTS,
  POOL_PATTERNS,
  TEST_PREFIX,
  customerFor,
  scenarioFor,
  seeded,
  testPriceFor,
  trackingFor,
  type ProductPool,
  type Scenario,
} from "@/lib/test-orders-data";
import * as P from "@/app/actions/purchasing";
import * as PR from "@/app/actions/purchasing-recalls";
import * as R from "@/app/actions/receiving";
import * as RC from "@/app/actions/receiving-recalls";
import * as RA from "@/app/actions/receiving-adjustments";
import * as AS from "@/lib/receiving-adjustment-service";

export type TestOrderResult = {
  index: number;
  kind: string;
  quotationId: string | null;
  quotationNumber: string | null;
  customer: string;
  tracking: string;
  lines: string[];
  total: number | null;
  receiving: string;
  recall: string;
  notes: string[];
  problems: string[];
};

const pad = (n: number, w = 4) => String(n).padStart(w, "0");
const day = (offsetDays: number) => new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);

function fd(o: Record<string, string | string[]>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) (Array.isArray(v) ? v : [v]).forEach((x) => f.append(k, x));
  return f;
}

/** The id of a quotation out of the redirect Next throws after a quotation is created. */
function idFromRedirect(e: unknown): string | null {
  const text = `${(e as { digest?: string })?.digest ?? ""} ${(e as Error)?.message ?? ""}`;
  const m = /quotations\/([A-Za-z0-9_-]+)/.exec(text);
  return m ? m[1] : null;
}

// A small gray PNG used for every placeholder photo (the photos in test orders are not real pictures).
let placeholder: Uint8Array | null = null;
function placeholderPng(): Uint8Array {
  if (placeholder) return placeholder;
  const w = 240, h = 160;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (w * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < w; x++) {
      const stripe = (Math.floor(x / 20) + Math.floor(y / 20)) % 2 === 0;
      const v = stripe ? 205 : 225;
      raw[row + 1 + x * 3] = v;
      raw[row + 2 + x * 3] = v;
      raw[row + 3 + x * 3] = v + 6;
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  placeholder = new Uint8Array(
    Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]),
  );
  return placeholder;
}

/** Saves the placeholder picture once for this company and returns its storage path. */
async function ensurePlaceholder(organizationId: string): Promise<string> {
  const path = `receiving/${organizationId}/test-placeholder.png`;
  if (storage.configured()) {
    try {
      await storage.save(path, placeholderPng(), "image/png");
    } catch {
      // Already saved by an earlier chunk -- fine.
    }
  }
  return path;
}

async function addPhotos(org: CurrentOrg, pid: string, kinds: string[], path: string) {
  const bytes = placeholderPng().length;
  for (const kind of kinds) {
    await db.insert(receivingPackagePhotos).values({
      id: newId("rphoto"),
      organizationId: org.organizationId,
      packageId: pid,
      kind: kind as never,
      itemId: null,
      filename: `test-${kind.toLowerCase()}.png`,
      contentType: "image/png",
      sizeBytes: bytes,
      storagePath: path,
      uploadedByUserId: org.userId,
    });
  }
}

// ---- one-time setup -----------------------------------------------------------------------------------------------

export type PrepareResult = { pricedProducts: number; recallsReady: number; recallNumbersAdded: number; poolsFound: Record<string, number>; notes: string[] };

/** Makes sure the company has the three starting recalls with the public recall numbers, and test prices on the products the tests use. */
export async function prepareTestOrders(org: CurrentOrg): Promise<PrepareResult> {
  const notes: string[] = [];
  await RC.setupRecalls();
  const recalls = await db.select().from(receivingRecalls).where(eq(receivingRecalls.organizationId, org.organizationId));
  let added = 0;
  for (const r of recalls) {
    const key = r.name.toLowerCase();
    const list = key.includes("omnipod") ? OMNIPOD_RECALLED_LOTS : key.includes("libre") ? LIBRE3_RECALLED_LOTS : null;
    if (!list) continue;
    const res = await RC.importRecallList(r.id, list.join(", "), "add");
    if (res.error) notes.push(`Couldn't load numbers into "${r.name}": ${res.error}`);
    else added += list.length;
  }

  const products = await db.select().from(purchasingProducts).where(and(eq(purchasingProducts.organizationId, org.organizationId), eq(purchasingProducts.active, true)));
  const poolsFound: Record<string, number> = {};
  let priced = 0;
  for (const pool of Object.keys(POOL_PATTERNS) as ProductPool[]) {
    const matches = products.filter((p) => !p.archivedAt && POOL_PATTERNS[pool].test(p.name));
    poolsFound[pool] = matches.length;
    if (matches.length === 0) notes.push(`No products in your list match the "${pool}" group, so those orders use another product.`);
    for (const p of matches) {
      if (p.standardPrice > 0) continue;
      await db.update(purchasingProducts).set({ standardPrice: Math.round(testPriceFor(p.name) * 100) / 100 }).where(and(eq(purchasingProducts.id, p.id), eq(purchasingProducts.organizationId, org.organizationId)));
      priced++;
    }
  }
  await ensurePlaceholder(org.organizationId);
  return { pricedProducts: priced, recallsReady: recalls.length, recallNumbersAdded: added, poolsFound, notes };
}

// ---- one order ------------------------------------------------------------------------------------------------------

type Catalog = {
  products: (typeof purchasingProducts.$inferSelect)[];
  conditions: { id: string; name: string }[];
  ranges: { id: string; label: string }[];
  condMap: Map<string, { id: string; name: string }[]>;
  expMap: Map<string, { id: string; label: string; multiplier: number }[]>;
};

export async function loadCatalog(org: CurrentOrg): Promise<Catalog> {
  const [products, conditions, ranges, condMap, expMap] = await Promise.all([
    db.select().from(purchasingProducts).where(and(eq(purchasingProducts.organizationId, org.organizationId), eq(purchasingProducts.active, true))),
    db.select({ id: purchasingConditions.id, name: purchasingConditions.name }).from(purchasingConditions).where(and(eq(purchasingConditions.organizationId, org.organizationId), eq(purchasingConditions.active, true))).orderBy(purchasingConditions.sortOrder),
    db.select({ id: purchasingExpirationRanges.id, label: purchasingExpirationRanges.label }).from(purchasingExpirationRanges).where(and(eq(purchasingExpirationRanges.organizationId, org.organizationId), eq(purchasingExpirationRanges.active, true))).orderBy(purchasingExpirationRanges.sortOrder),
    getProductConditionsMap(org.organizationId),
    getProductExpiryOptionsMap(org.organizationId),
  ]);
  return { products: products.filter((p) => !p.archivedAt), conditions, ranges, condMap, expMap };
}

function pickProduct(cat: Catalog, pool: ProductPool, r: () => number, avoid: Set<string>) {
  let list = cat.products.filter((p) => POOL_PATTERNS[pool].test(p.name) && p.standardPrice > 0 && !avoid.has(p.id));
  if (list.length === 0) list = cat.products.filter((p) => p.standardPrice > 0 && !avoid.has(p.id) && !/omnipod|libre 3|receiver/i.test(p.name));
  return list.length ? list[Math.floor(r() * list.length)] : null;
}

export async function runTestOrder(org: CurrentOrg, cat: Catalog, index: number): Promise<TestOrderResult> {
  const sc = scenarioFor(index);
  const cust = customerFor(index);
  const track = trackingFor(index);
  const r = seeded(index * 101 + 7);
  const res: TestOrderResult = {
    index,
    kind: sc.kind,
    quotationId: null,
    quotationNumber: null,
    customer: `${cust.firstName} ${cust.lastName}`,
    tracking: `${track.carrier} ${track.number}`,
    lines: [],
    total: null,
    receiving: "Not received",
    recall: "",
    notes: [],
    problems: [],
  };
  const problem = (m: string) => res.problems.push(m);

  // Already loaded? (loading twice never makes a second copy)
  const [already] = await db
    .select({ id: purchasingCustomers.id })
    .from(purchasingCustomers)
    .where(and(eq(purchasingCustomers.organizationId, org.organizationId), eq(purchasingCustomers.customerReferenceNumber, cust.reference)))
    .limit(1);
  if (already) {
    const [q] = await db.select({ id: purchasingQuotations.id, n: purchasingQuotations.quotationNumber, t: purchasingQuotations.grandTotal }).from(purchasingQuotations).where(and(eq(purchasingQuotations.organizationId, org.organizationId), eq(purchasingQuotations.customerId, already.id))).limit(1);
    if (q && (await orderIsComplete(org, sc, q.id))) {
      res.quotationId = q.id;
      res.quotationNumber = q.n;
      res.total = q.t;
      res.notes.push("Already loaded earlier -- skipped.");
      return res;
    }
    // Cut off half way last time: remove the unfinished copy and build it again from the start.
    await deleteTestCustomers(org, [already.id]);
    res.notes.push("An unfinished copy from an earlier run was removed and rebuilt.");
  }

  // 1. The customer (tagged TEST, with a TEST-nnnn reference so they can all be found and removed), then the quotation.
  const customerId = newId("pcust");
  await db.insert(purchasingCustomers).values({
    id: customerId,
    organizationId: org.organizationId,
    firstName: cust.firstName,
    lastName: cust.lastName,
    customerReferenceNumber: cust.reference,
    email: cust.email,
    phone: cust.phone,
    addressStreet1: cust.street1,
    addressStreet2: cust.street2 || null,
    addressCity: cust.city,
    addressState: cust.state,
    addressZip: cust.zip,
    addressCountry: "US",
    isResidential: cust.residential,
    notes: "TEST ORDER customer -- created by the test tool. Not a real person.",
  });
  let quotationId: string | null = null;
  try {
    await P.createPurchasingQuotation(undefined, fd({ customerId, quotationDate: day(-(index % 12)) }));
  } catch (e) {
    quotationId = idFromRedirect(e);
  }
  if (!quotationId) {
    problem("The quotation could not be created.");
    return res;
  }
  res.quotationId = quotationId;
  const [qrow] = await db.select({ n: purchasingQuotations.quotationNumber }).from(purchasingQuotations).where(eq(purchasingQuotations.id, quotationId)).limit(1);
  res.quotationNumber = qrow?.n ?? null;

  // 2. Purchasing quick recall check (typed lot, nothing saved) before quoting recall-type products.
  if (sc.quickCheck) {
    const q = await PR.quickRecallLookup(sc.quickCheck);
    if (q.error) problem(`Quick recall check failed: ${q.error}`);
    else {
      res.recall = q.recalled ? `Purchasing check: ${sc.quickCheck} is RECALLED` : `Purchasing check: ${sc.quickCheck} not on our lists`;
      const expected = sc.recalledLot;
      if (!!q.recalled !== expected) problem(`Quick recall check said ${q.recalled ? "recalled" : "not on list"} for ${sc.quickCheck}, expected ${expected ? "recalled" : "not on list"}.`);
    }
  }

  // 3. Quoted lines through the real pricing.
  const used = new Set<string>();
  const lineIds: { productId: string; name: string; qty: number }[] = [];
  for (const spec of sc.lines) {
    const prod = pickProduct(cat, spec.pool, r, used);
    if (!prod) {
      problem(`No product found for the ${spec.pool} group.`);
      continue;
    }
    used.add(prod.id);
    const conds = cat.condMap.get(prod.id) ?? cat.conditions;
    const exps = prod.noExpiration ? [] : (cat.expMap.get(prod.id) ?? cat.ranges);
    const cond = conds[Math.min(conds.length - 1, Math.floor(r() * r() * conds.length))];
    const exp = exps.length ? exps[Math.floor(r() * exps.length)] : null;
    const attempt = async (c: { id: string } | undefined, e: { id: string } | null) =>
      P.addPurchasingQuotedItem(quotationId!, undefined, fd({ productId: prod.id, ...(c ? { conditionId: c.id } : {}), ...(e ? { expirationRangeId: e.id } : {}), quantity: String(spec.quantity) }));
    let out = await attempt(cond, exp);
    if (out?.error) {
      // Try the first allowed condition / range before calling it a problem.
      out = await attempt(conds[0], exps[0] ?? null);
      if (out?.error) {
        problem(`Could not add "${prod.name}": ${out.error}`);
        continue;
      }
    }
    lineIds.push({ productId: prod.id, name: prod.name, qty: spec.quantity });
  }

  // 4. Header: made-up tracking number + carrier, and a TEST note. Optional deduction.
  await P.updatePurchasingQuotationHeader(quotationId, undefined, fd({ trackingNumber: track.number, carrier: track.carrier, quotationDate: day(-(index % 12)), notes: "TEST ORDER -- made-up tracking number, not a real shipment." }));
  if (sc.deduction) {
    const d = await P.setPurchasingQuotationDeduction(quotationId, undefined, fd({ deductionEnabled: "on", deductionAmount: String(sc.deduction.amount), deductionReason: sc.deduction.reason }));
    if (d?.error) problem(`Deduction failed: ${d.error}`);
  }
  const quotedLines = await db.select().from(purchasingQuotedItems).where(eq(purchasingQuotedItems.quotationId, quotationId));
  res.lines = quotedLines.map((l) => `${l.quantity} x ${l.productNameSnapshot} (${l.conditionNameSnapshot ?? "-"}${l.expirationRangeLabelSnapshot ? ", " + l.expirationRangeLabelSnapshot : ""}) @ $${l.finalUnitPrice.toFixed(2)}`);
  const [qtot] = await db.select({ items: purchasingQuotations.itemsTotal, bonus: purchasingQuotations.bonusAmount, grand: purchasingQuotations.grandTotal, ded: purchasingQuotations.deductionAmount }).from(purchasingQuotations).where(eq(purchasingQuotations.id, quotationId)).limit(1);
  res.total = qtot?.grand ?? null;
  // The maths the screen shows must add up: lines + bonus - deduction.
  const lineSum = Math.round(quotedLines.reduce((a, l) => a + l.lineTotal, 0) * 100) / 100;
  if (qtot) {
    if (Math.abs(lineSum - qtot.items) > 0.005) problem(`Items total $${qtot.items} does not match the lines ($${lineSum}).`);
    const expectGrand = Math.round((qtot.items + (qtot.bonus ?? 0) - (qtot.ded ?? 0)) * 100) / 100;
    if (Math.abs(expectGrand - qtot.grand) > 0.005) problem(`Grand total $${qtot.grand} should be $${expectGrand}.`);
  }
  if (quotedLines.length === 0) {
    problem("The quotation has no lines.");
    return res;
  }

  if (sc.kind === "PURCHASING_ONLY") return res;
  await receiveOrder(org, sc, quotationId, quotedLines, cat, res, track);
  return res;
}

// ---- receiving ---------------------------------------------------------------------------------------------------------

async function receiveOrder(
  org: CurrentOrg,
  sc: Scenario,
  quotationId: string,
  quoted: (typeof purchasingQuotedItems.$inferSelect)[],
  cat: Catalog,
  res: TestOrderResult,
  track: { carrier: string; number: string },
) {
  const problem = (m: string) => res.problems.push(m);
  const r = seeded(sc.index * 53 + 19);
  const start = await R.startReceiving(quotationId, null);
  if (!start.ok || !start.id) {
    problem(`Receiving could not start: ${start.error ?? "unknown"}`);
    return;
  }
  const pid = start.id;
  res.receiving = "In progress";

  type Row = { id: string; quoted: (typeof quoted)[number] | null; qty: number; lot: string; condition: string; productId: string | null };
  const rows: Row[] = [];
  const placeholderPath = await ensurePlaceholder(org.organizationId);

  // Which lines arrive, and how many.
  const toReceive = sc.kind === "OPEN" ? quoted.slice(0, Math.max(1, quoted.length - 1)) : quoted;
  for (let n = 0; n < toReceive.length; n++) {
    const q = toReceive[n];
    let qty = q.quantity;
    let condition = "Mint";
    if (sc.kind === "SHORT_DRAFT" || sc.kind === "SHORT_FINAL") {
      if (n === 0) qty = q.quantity > 1 ? Math.max(1, Math.floor(q.quantity * 0.6)) : 0;
    }
    if (sc.kind === "DAMAGED" && n === 0) condition = ["Damaged", "Crushed", "Dinged", "Minor Damage"][sc.index % 4];
    if (sc.index % 9 === 0 && n === toReceive.length - 1 && sc.kind !== "DAMAGED") condition = "Dinged";
    // Lot numbers: recall tests use a real recalled lot (or a clear one) on the first line.
    let lot = `TL${pad(sc.index, 3)}${n + 1}${String.fromCharCode(65 + Math.floor(r() * 26))}`;
    if (n === 0 && sc.kind === "OMNIPOD_RECALL" && sc.quickCheck) lot = sc.quickCheck;
    if (n === 0 && sc.kind === "LIBRE_RECALL" && sc.quickCheck) lot = sc.quickCheck;
    const add = await R.addReceivingItem(pid, { productId: q.productId, name: q.productNameSnapshot });
    if (!add.ok || !add.id) {
      problem(`Could not add "${q.productNameSnapshot}" to Receiving: ${add.error ?? "unknown"}`);
      continue;
    }
    rows.push({ id: add.id, quoted: q, qty, lot, condition, productId: q.productId });
  }
  if (sc.kind === "EXTRA") {
    const used = new Set(quoted.map((q) => q.productId).filter((x): x is string => !!x));
    const extra = cat.products.find((p) => !used.has(p.id) && p.standardPrice > 0 && POOL_PATTERNS.STRIPS.test(p.name));
    if (extra) {
      const add = await R.addReceivingItem(pid, { productId: extra.id });
      if (add.ok && add.id) rows.push({ id: add.id, quoted: null, qty: 2, lot: `TLX${pad(sc.index, 3)}`, condition: "Mint", productId: extra.id });
      else problem(`Could not add the extra product: ${add.error ?? "unknown"}`);
    } else problem("No extra product available for the 'extra product' test.");
  }

  const expiry = day(200 + Math.floor(r() * 300));
  const itemsJson = JSON.stringify(
    rows.map((row) => ({
      id: row.id,
      wasReceived: row.qty === 0 ? "NO" : "YES",
      quantityReceived: String(row.qty),
      condition: row.condition,
      lotNumber: row.lot,
      needsReturn: "NO",
      expirationEntryType: row.quoted && cat.products.find((p) => p.id === row.productId)?.noExpiration ? "NA" : "SINGLE",
      expirationDate: expiry,
    })),
  );

  const damaged = sc.kind === "DAMAGED";
  const badPackaging = sc.kind === "PACKAGING";
  const shortOrExtra = sc.kind === "SHORT_DRAFT" || sc.kind === "SHORT_FINAL" || sc.kind === "EXTRA";
  const base: Record<string, string | string[]> = {
    receivedByUserId: org.userId,
    trackingNumber: track.number,
    carrier: track.carrier,
    receivedAt: `${day(-(sc.index % 6))}T${pad(8 + (sc.index % 9), 2)}:${pad((sc.index * 7) % 60, 2)}`,
    externalDamage: damaged ? "YES" : "NO",
    ...(damaged ? { damageTypes: ["Crushed", "Wet"], damageNotes: "TEST: outer box crushed at one corner and damp." } : {}),
    doubleBoxed: badPackaging ? "NO" : "YES",
    protectiveMaterial: badPackaging ? "NO" : "YES",
    sturdyOuterBox: badPackaging ? "NO" : "YES",
    productsSecured: badPackaging ? "NO" : "YES",
    packageSealed: "YES",
    packagingRequirementsMet: badPackaging ? "NO" : "YES",
    overallPackaging: badPackaging ? "NOT_ACCEPTABLE" : "ACCEPTABLE",
    ...(badPackaging ? { packagingIssueNotes: "TEST: no padding, products loose in the box." } : {}),
    packingSheetIncluded: "YES",
    quantityMatches: shortOrExtra ? "NO" : "YES",
    adjustmentNeeded: shortOrExtra || damaged ? "YES" : "NO",
    ...(shortOrExtra || damaged ? { adjustmentDetails: damaged ? "TEST: damaged product, price to be reduced." : sc.kind === "EXTRA" ? "TEST: an extra product arrived that was not quoted." : "TEST: fewer arrived than quoted." } : {}),
    receivingNotes: `TEST ORDER ${sc.kind}. Made-up tracking number.`,
    itemsJson,
  };

  const saved = await R.saveReceiving(pid, fd(base));
  if (!saved.ok) {
    problem(`Saving receiving failed: ${saved.error ?? "unknown"}`);
    return;
  }

  // Recall checks on the lots (the receiving screen does this per row).
  const recallProducts = rows.filter((row) => /omnipod|libre 3|receiver/i.test(row.quoted?.productNameSnapshot ?? ""));
  for (const row of recallProducts) {
    const name = row.quoted?.productNameSnapshot ?? "";
    if (/receiver/i.test(name)) {
      if (sc.kind !== "RECEIVER_LOOKUP") continue;
      const recalls = await db.select().from(receivingRecalls).where(eq(receivingRecalls.organizationId, org.organizationId));
      const dex = recalls.find((x) => /receiver|dexcom/i.test(`${x.name} ${x.keywords}`));
      if (!dex) {
        problem("No Dexcom receiver recall is set up.");
        continue;
      }
      const serial = `TESTSN${pad(sc.index, 4)}${row.qty}`;
      const out = await RC.confirmRecallLookup(pid, row.id, dex.id, serial, sc.receiverAffected);
      if (!out.ok) problem(`Receiver lookup could not be recorded: ${out.error ?? "unknown"}`);
      else {
        const [it] = await db.select().from(receivingItems).where(eq(receivingItems.id, row.id));
        if (sc.receiverAffected && it?.needsReturn !== "YES") problem("An affected receiver was not marked Needs To Be Returned.");
        if (!sc.receiverAffected && it?.needsReturn === "YES") problem("A receiver that is not affected was marked for return.");
        res.recall = `Dexcom lookup: serial ${serial} ${sc.receiverAffected ? "AFFECTED" : "not affected"}`;
      }
      continue;
    }
    const out = await RC.checkRecall(pid, row.id, row.lot);
    if (!out.ok) {
      problem(`Recall check failed for lot ${row.lot}: ${out.error ?? "unknown"}`);
      continue;
    }
    const hit = (out.results ?? []).some((x) => x.recalls.length > 0);
    const expected = (sc.kind === "OMNIPOD_RECALL" || sc.kind === "LIBRE_RECALL") && row.lot === sc.quickCheck && sc.recalledLot;
    if (row.lot === sc.quickCheck && hit !== expected) problem(`Lot ${row.lot}: Receiving said ${hit ? "recalled" : "not on list"}; expected ${expected ? "recalled" : "not on list"}.`);
    if (hit) {
      const [it] = await db.select().from(receivingItems).where(eq(receivingItems.id, row.id));
      if (it?.needsReturn !== "YES" || it.returnStatus !== "RETURN_REQUESTED") problem(`Lot ${row.lot} is recalled but the row was not marked for return.`);
      res.recall = `Receiving check: lot ${row.lot} RECALLED -> Needs To Be Returned`;
    } else if (!res.recall) res.recall = `Receiving check: lot ${row.lot} not on our lists`;
  }

  if (sc.kind === "OPEN") {
    // Left unfinished on purpose: a draft with some photos only.
    await addPhotos(org, pid, ["UNOPENED_PACKAGE", "SHIPPING_LABEL"], placeholderPath);
    res.receiving = "In progress (left open on purpose)";
    return;
  }

  // The real screen keeps what the recall checks set (Needs To Be Returned) when it saves, so carry it into the submit.
  const fresh = await db.select({ id: receivingItems.id, needsReturn: receivingItems.needsReturn, returnStatus: receivingItems.returnStatus }).from(receivingItems).where(eq(receivingItems.packageId, pid));
  const freshById = new Map(fresh.map((x) => [x.id, x]));
  base.itemsJson = JSON.stringify(
    (JSON.parse(itemsJson) as Array<Record<string, unknown>>).map((it) => {
      const f = freshById.get(String(it.id));
      return f?.needsReturn === "YES" ? { ...it, needsReturn: "YES", returnStatus: f.returnStatus ?? "RETURN_REQUESTED" } : it;
    }),
  );

  // Required photos, then submit.
  const photoKinds = ["UNOPENED_PACKAGE", "SHIPPING_LABEL", "PACKAGE_AS_OPENED", "COMPLETE_CONTENTS", ...(damaged ? ["DAMAGE"] : []), ...(badPackaging ? ["PACKAGING_ISSUE"] : [])];
  await addPhotos(org, pid, photoKinds, placeholderPath);
  const sub = await R.submitReceiving(pid, fd(base));
  if (!sub.ok) {
    problem(`Submit failed: ${sub.error ?? "unknown"}${sub.missing?.length ? " -- " + sub.missing.join("; ") : ""}`);
    return;
  }
  const [pk] = await db.select().from(receivingPackages).where(eq(receivingPackages.id, pid));
  res.receiving = pk?.status === "RECEIVING_COMPLETE" ? "Complete" : "Complete with discrepancy";
  const [qs] = await db.select({ status: purchasingQuotations.status }).from(purchasingQuotations).where(eq(purchasingQuotations.id, quotationId));
  if (qs?.status !== "RECEIVED") problem(`Purchasing still shows the order as ${qs?.status} after receiving was submitted.`);
  if (sc.kind === "CLEAN_PAID" || sc.kind === "CLEAN_UNPAID") {
    if (pk?.status !== "RECEIVING_COMPLETE" && !rows.some((x) => x.condition !== "Mint")) problem(`A clean order ended as ${pk?.status}.`);
  } else if (pk?.status === "RECEIVING_COMPLETE" && (shortOrExtra || damaged || badPackaging)) {
    problem("An order with a problem was marked complete with no discrepancy.");
  }

  // Accounts: Step 10 and the adjustment quotations.
  if (sc.kind === "SHORT_DRAFT" || sc.kind === "SHORT_FINAL") {
    const started = await RA.startAdjustment(pid);
    if (!started.ok || !started.id) problem(`Adjustment quotation could not be started: ${started.error ?? "unknown"}`);
    else {
      res.receiving += "; adjustment quotation drafted";
      if (sc.kind === "SHORT_FINAL") {
        const adj = await AS.getAdjustmentById(org.organizationId, started.id);
        if (adj) {
          const fin = await RA.finalizeAdjustmentAction(started.id, {
            reasonCategory: "Wrong Quantity",
            lines: adj.lines.map((l) => ({ id: l.id, productName: l.productName, productCode: l.productCode, condition: l.condition, expiryLabel: l.expiryLabel, quantity: l.quantity, unitPrice: l.unitPrice, note: l.note })),
          });
          if (!fin.ok) problem(`Adjustment quotation could not be finalised: ${fin.error ?? "unknown"}`);
          else res.receiving = res.receiving.replace("drafted", "finalised");
          const after = await AS.getAdjustmentById(org.organizationId, started.id);
          const [pk2] = await db.select().from(receivingPackages).where(eq(receivingPackages.id, pid));
          if (after && pk2?.adjustedOrderTotal != null && Math.abs(pk2.adjustedOrderTotal - after.adjustedTotal) > 0.005) problem("The shipment's adjusted total does not match the adjustment quotation.");
        } else problem("The adjustment quotation could not be read back.");
      }
    }
  }
  if (sc.kind === "CLEAN_PAID") {
    await addPhotos(org, pid, ["PAYMENT_CONFIRMATION"], placeholderPath);
    const paid = await R.saveFollowUp(pid, fd({ accountsDecision: "PAID", accountsStatus: "PAID" }));
    if (!paid.ok) problem(`Marking Paid failed: ${paid.error ?? "unknown"}`);
    else res.receiving += "; PAID by Accounts";
  } else if (sc.kind === "CLEAN_UNPAID") {
    const d = await R.saveFollowUp(pid, fd({ accountsDecision: "NEED_TO_BE_PAID", accountsStatus: "IN_REVIEW" }));
    if (!d.ok) problem(`Setting the decision failed: ${d.error ?? "unknown"}`);
    else res.receiving += "; waiting to be paid";
  } else if (sc.kind === "OMNIPOD_RECALL" || sc.kind === "LIBRE_RECALL" || sc.kind === "RECEIVER_LOOKUP") {
    const [it] = await db.select().from(receivingItems).where(and(eq(receivingItems.packageId, pid), eq(receivingItems.needsReturn, "YES"))).limit(1);
    if (it) {
      const d = await R.saveFollowUp(pid, fd({ accountsDecision: "NEED_TO_BE_RETURNED" }));
      if (d.ok) res.receiving += "; recalled item -> Need to Be Returned";
    }
  }
}

// ---- remove -------------------------------------------------------------------------------------------------------------

/** Deletes every test order (and everything under them) and the TEST customers. Real data is never matched. */
export async function removeAllTestOrders(org: CurrentOrg): Promise<{ orders: number; customers: number; pricesReset: number }> {
  const custs = await db
    .select({ id: purchasingCustomers.id })
    .from(purchasingCustomers)
    .where(and(eq(purchasingCustomers.organizationId, org.organizationId), like(purchasingCustomers.customerReferenceNumber, `${TEST_PREFIX}-%`), like(purchasingCustomers.firstName, `${TEST_PREFIX} - %`)));
  if (custs.length === 0) return { orders: 0, customers: 0, pricesReset: await resetTestPrices(org) };
  const orders = await deleteTestCustomers(org, custs.map((c) => c.id));
  // The shared placeholder picture can go once nothing points at it.
  const path = `receiving/${org.organizationId}/test-placeholder.png`;
  const [left] = await db.select({ n: sql<number>`count(*)` }).from(receivingPackagePhotos).where(eq(receivingPackagePhotos.storagePath, path));
  if (Number(left?.n ?? 0) === 0 && storage.configured()) {
    try {
      await storage.remove(path);
    } catch {
      // ignore
    }
  }
  return { orders, customers: custs.length, pricesReset: await resetTestPrices(org) };
}

/** Deletes these test customers and every order under them (shipments, photos, lots, recall checks, adjustments and inventory entries cascade). Returns the number of orders removed. */
async function deleteTestCustomers(org: CurrentOrg, ids: string[]): Promise<number> {
  let orders = 0;
  const leftover = new Set<string>();
  for (let i = 0; i < ids.length; i += 50) {
    const slice = ids.slice(i, i + 50);
    const qs = await db.select({ id: purchasingQuotations.id }).from(purchasingQuotations).where(and(eq(purchasingQuotations.organizationId, org.organizationId), inArray(purchasingQuotations.customerId, slice)));
    orders += qs.length;
    // Remember every stored file (photos, revised-invoice PDFs) so none are left behind once the rows are gone.
    if (qs.length && storage.configured()) {
      const pkgs = await db.select({ id: receivingPackages.id }).from(receivingPackages).where(and(eq(receivingPackages.organizationId, org.organizationId), inArray(receivingPackages.quotationId, qs.map((q) => q.id))));
      if (pkgs.length) {
        const files = await db.select({ path: receivingPackagePhotos.storagePath }).from(receivingPackagePhotos).where(inArray(receivingPackagePhotos.packageId, pkgs.map((p) => p.id)));
        for (const f of files) if (!f.path.endsWith("/test-placeholder.png")) leftover.add(f.path);
      }
    }
    if (qs.length) await db.delete(purchasingQuotations).where(and(eq(purchasingQuotations.organizationId, org.organizationId), inArray(purchasingQuotations.id, qs.map((q) => q.id))));
    await db.delete(purchasingCustomers).where(and(eq(purchasingCustomers.organizationId, org.organizationId), inArray(purchasingCustomers.id, slice)));
  }
  for (const p of leftover) {
    try {
      await storage.remove(p);
    } catch {
      // a leftover private file is harmless
    }
  }
  return orders;
}

/** Did this order get all the way to where its scenario ends? (An order cut off half way -- e.g. the page was closed -- is rebuilt.) */
async function orderIsComplete(org: CurrentOrg, sc: Scenario, quotationId: string): Promise<boolean> {
  const [lines] = await db.select({ n: sql<number>`count(*)` }).from(purchasingQuotedItems).where(eq(purchasingQuotedItems.quotationId, quotationId));
  if (Number(lines?.n ?? 0) === 0) return false;
  if (sc.kind === "PURCHASING_ONLY") return true;
  const [pk] = await db.select().from(receivingPackages).where(and(eq(receivingPackages.organizationId, org.organizationId), eq(receivingPackages.quotationId, quotationId))).limit(1);
  if (!pk) return false;
  if (sc.kind === "OPEN") return pk.status === "IN_PROGRESS";
  const [q] = await db.select({ status: purchasingQuotations.status }).from(purchasingQuotations).where(eq(purchasingQuotations.id, quotationId)).limit(1);
  if (pk.status === "IN_PROGRESS" || q?.status !== "RECEIVED") return false;
  if (sc.kind === "CLEAN_PAID") return pk.accountsStatus === "PAID";
  if (sc.kind === "CLEAN_UNPAID") return pk.accountsDecision === "NEED_TO_BE_PAID";
  if (sc.kind === "SHORT_DRAFT" || sc.kind === "SHORT_FINAL") {
    const [adj] = await db.select({ status: receivingAdjustments.status }).from(receivingAdjustments).where(eq(receivingAdjustments.packageId, pk.id)).limit(1);
    return !!adj && (sc.kind === "SHORT_DRAFT" || adj.status === "FINAL");
  }
  if (sc.kind === "OMNIPOD_RECALL" || sc.kind === "LIBRE_RECALL" || sc.kind === "RECEIVER_LOOKUP") {
    const [flagged] = await db.select({ id: receivingItems.id }).from(receivingItems).where(and(eq(receivingItems.packageId, pk.id), eq(receivingItems.needsReturn, "YES"))).limit(1);
    return !flagged || pk.accountsDecision === "NEED_TO_BE_RETURNED";
  }
  return true;
}

/**
 * Loading test orders puts a made-up price on products that had none ($0). Put those back to $0 -- only products whose price is
 * still exactly the made-up one, so a price you set yourself is never touched.
 */
async function resetTestPrices(org: CurrentOrg): Promise<number> {
  const products = await db.select({ id: purchasingProducts.id, name: purchasingProducts.name, price: purchasingProducts.standardPrice }).from(purchasingProducts).where(eq(purchasingProducts.organizationId, org.organizationId));
  let n = 0;
  for (const p of products) {
    if (p.price <= 0 || !Object.values(POOL_PATTERNS).some((re) => re.test(p.name))) continue;
    if (Math.abs(p.price - Math.round(testPriceFor(p.name) * 100) / 100) > 0.0049) continue;
    await db.update(purchasingProducts).set({ standardPrice: 0 }).where(and(eq(purchasingProducts.id, p.id), eq(purchasingProducts.organizationId, org.organizationId)));
    n++;
  }
  return n;
}
