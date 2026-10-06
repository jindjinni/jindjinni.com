// Reads for the Receiving department. Everything is scoped by the signed-in
// user's company (organizationId comes from requireOrg, never from the URL).
// An order is never copied into Receiving: each package points at its quotation
// in the Purchasing Quotation Summary and reads the order details from there.

import { and, desc, eq, inArray, isNull, like, ne, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  receivingPackages,
  receivingPackagePhotos,
  purchasingQuotations,
  purchasingQuotedItems,
  purchasingCustomers,
  purchasingProducts,
  purchasingCategories,
  receivingItems,
  receivingIntakeLines,
  receivingIntakeLogs,
  receivingExpirationLots,
  receivingSettings,
  receivingAdjustments,
  memberships,
  users,
} from "@/db/schema";
import { newId } from "@/lib/ids";
import { getReceiptState } from "@/lib/purchasing-receipt-docs";
import { recallGateIssues } from "@/lib/receiving-recall-service";
import {
  computeMissingInfo,
  discrepancyFlags,
  boardColumnFor,
  type BoardColumn,
  lotsMismatch,
  parseDamageTypes,
  parseStringList,
  summarizeItems,
  quotedNotEntered,
  acceptedQuantity,
  type PhotoKind,
} from "@/lib/receiving-rules";

export type QuotationBrief = {
  quotationId: string;
  quotationNumber: string;
  customerName: string;
  email: string | null;
  phone: string | null;
  trackingNumber: string | null;
  carrier: string | null;
  quotationDate: string;
  grandTotal: number;
  shippingAddress: string;
  itemsText: string;
};

function addressFor(r: { imported: string | null; s1: string | null; city: string | null; st: string | null; zip: string | null }) {
  if (r.imported) return r.imported;
  return [r.s1, r.city, [r.st, r.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "Not provided";
}

const briefSelect = {
  quotationId: purchasingQuotations.id,
  quotationNumber: purchasingQuotations.quotationNumber,
  nameSnap: purchasingQuotations.customerNameSnapshot,
  emailSnap: purchasingQuotations.customerEmailSnapshot,
  phoneSnap: purchasingQuotations.customerPhoneSnapshot,
  trackingNumber: purchasingQuotations.trackingNumber,
  carrier: purchasingQuotations.carrier,
  quotationDate: purchasingQuotations.quotationDate,
  grandTotal: purchasingQuotations.grandTotal,
  importedItems: purchasingQuotations.importedItemsText,
  importedAddress: purchasingQuotations.importedShippingAddress,
  firstName: purchasingCustomers.firstName,
  lastName: purchasingCustomers.lastName,
  email: purchasingCustomers.email,
  phone: purchasingCustomers.phone,
  s1: purchasingCustomers.addressStreet1,
  city: purchasingCustomers.addressCity,
  st: purchasingCustomers.addressState,
  zip: purchasingCustomers.addressZip,
};

type BriefRow = {
  quotationId: string;
  quotationNumber: string;
  nameSnap: string;
  emailSnap: string | null;
  phoneSnap: string | null;
  trackingNumber: string | null;
  carrier: string | null;
  quotationDate: string;
  grandTotal: number;
  importedItems: string | null;
  importedAddress: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  s1: string | null;
  city: string | null;
  st: string | null;
  zip: string | null;
};

function toBrief(r: BriefRow, itemsText: string): QuotationBrief {
  return {
    quotationId: r.quotationId,
    quotationNumber: r.quotationNumber,
    customerName: r.firstName ? [r.firstName, r.lastName].filter(Boolean).join(" ") : r.nameSnap,
    email: r.email ?? r.emailSnap,
    phone: r.phone ?? r.phoneSnap,
    trackingNumber: r.trackingNumber,
    carrier: r.carrier,
    quotationDate: r.quotationDate,
    grandTotal: r.grandTotal,
    shippingAddress: addressFor({ imported: r.importedAddress, s1: r.s1, city: r.city, st: r.st, zip: r.zip }),
    itemsText,
  };
}

async function itemsTextFor(quotationIds: string[], importedById: Map<string, string | null>) {
  const out = new Map<string, string>();
  if (quotationIds.length === 0) return out;
  const items = await db
    .select({
      quotationId: purchasingQuotedItems.quotationId,
      name: purchasingQuotedItems.productNameSnapshot,
      qty: purchasingQuotedItems.quantity,
    })
    .from(purchasingQuotedItems)
    .where(inArray(purchasingQuotedItems.quotationId, quotationIds));
  const grouped = new Map<string, string[]>();
  for (const i of items) grouped.set(i.quotationId, [...(grouped.get(i.quotationId) ?? []), `${i.name} - ${i.qty}`]);
  for (const id of quotationIds) {
    const lines = grouped.get(id);
    if (lines?.length) out.set(id, lines.join("\n"));
    else out.set(id, (importedById.get(id) ?? "").trim() || "—");
  }
  return out;
}

export type BoardCard = {
  id: string;
  status: "IN_PROGRESS" | "RECEIVING_COMPLETE" | "RECEIVING_COMPLETE_WITH_DISCREPANCY";
  trackingNumber: string | null;
  receivedAt: string | null;
  adjustmentNeeded: string | null;
  column: BoardColumn;
  accountsStatus: string | null;
  customerName: string;
  quotationNumber: string;
  grandTotal: number;
  coverPhotoId: string | null;
  searchText: string;
};

export async function getReceivingBoard(organizationId: string): Promise<BoardCard[]> {
  const rows = await db
    .select({
      id: receivingPackages.id,
      status: receivingPackages.status,
      pkgTracking: receivingPackages.trackingNumber,
      receivedAt: receivingPackages.receivedAt,
      adjustmentNeeded: receivingPackages.adjustmentNeeded,
      accountsDecision: receivingPackages.accountsDecision,
      accountsStatus: receivingPackages.accountsStatus,
      createdAt: receivingPackages.createdAt,
      ...briefSelect,
    })
    .from(receivingPackages)
    .innerJoin(purchasingQuotations, eq(purchasingQuotations.id, receivingPackages.quotationId))
    .leftJoin(purchasingCustomers, eq(purchasingCustomers.id, purchasingQuotations.customerId))
    .where(eq(receivingPackages.organizationId, organizationId))
    .orderBy(desc(receivingPackages.receivedAt), desc(receivingPackages.createdAt));
  const covers = await db
    .select({ id: receivingPackagePhotos.id, packageId: receivingPackagePhotos.packageId })
    .from(receivingPackagePhotos)
    .where(and(eq(receivingPackagePhotos.organizationId, organizationId), eq(receivingPackagePhotos.kind, "UNOPENED_PACKAGE")))
    .orderBy(receivingPackagePhotos.createdAt);
  const coverBy = new Map<string, string>();
  for (const c of covers) if (!coverBy.has(c.packageId)) coverBy.set(c.packageId, c.id);
  return rows.map((r) => {
    const b = toBrief(r, "");
    return {
      id: r.id,
      status: r.status,
      trackingNumber: r.pkgTracking ?? b.trackingNumber,
      receivedAt: r.receivedAt,
      adjustmentNeeded: r.adjustmentNeeded,
      column: boardColumnFor(r),
      accountsStatus: r.accountsStatus,
      customerName: b.customerName,
      quotationNumber: r.quotationNumber,
      grandTotal: r.grandTotal,
      coverPhotoId: coverBy.get(r.id) ?? null,
      searchText: `${b.customerName} ${r.quotationNumber} ${r.pkgTracking ?? r.trackingNumber ?? ""} ${b.email ?? ""}`.toLowerCase(),
    };
  });
}

export type PackagePhoto = {
  id: string;
  kind: PhotoKind;
  itemId: string | null;
  filename: string;
  contentType: string;
  sizeBytes: number;
};

export type ItemLot = {
  id: string;
  label: string;
  lotNumber: string;
  expirationDate: string;
  expirationEndDate: string;
  quantity: number | null;
};

export type ItemView = {
  id: string;
  quotedItemId: string | null;
  productId: string | null;
  productName: string;
  itemSource: "QUOTED" | "EXTRA";
  quotedQuantity: number | null;
  quotedAmount: number | null;
  wasReceived: string;
  quantityReceived: number | null;
  condition: string;
  needsReturn: string;
  notes: string;
  ndc: string;
  lotNumber: string;
  codeMatches: string;
  expirationQualifies: string;
  expirationEntryType: string;
  expirationDate: string;
  discrepancyCategories: string[];
  discrepancyNotes: string;
  adjustmentRequired: string;
  managementReview: string;
  returnRequired: string;
  quotationAdjusted: string;
  proposedRevisedAmount: number | null;
  adjustmentReason: string;
  adjustmentNotes: string;
  quantityToReturn: number | null;
  returnStatus: string;
  returnTracking: string;
  returnNotes: string;
  lots: ItemLot[];
  flagged: boolean;
  lotsMismatch: boolean;
};

export type TeamMember = { userId: string; name: string };

/** One line of the quotation the customer was given (what we expected to receive). */
export type QuotedLine = {
  id: string;
  productId: string | null;
  name: string;
  code: string | null;
  condition: string | null;
  expiration: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  notes: string | null;
};

export async function getReceivingSettings(organizationId: string) {
  const [row] = await db.select().from(receivingSettings).where(eq(receivingSettings.organizationId, organizationId)).limit(1);
  return {
    emailsEnabled: row?.emailsEnabled ?? false,
    fromName: row?.fromName ?? "",
    replyTo: row?.replyTo ?? "",
    bccEmails: row?.bccEmails ?? "",
    quoteLinkUrl: row?.quoteLinkUrl ?? "",
    packagingGuideUrl: row?.packagingGuideUrl ?? "",
  };
}

export type AdjustmentSummary = { id: string; number: string; status: "DRAFT" | "FINAL"; adjustedTotal: number; originalTotal: number };

export async function getReceivingPackage(organizationId: string, packageId: string) {
  const [row] = await db
    .select({
      pkg: receivingPackages,
      quotationStatus: purchasingQuotations.status,
      packageStatus: purchasingQuotations.packageStatus,
      lastTrackingUpdate: purchasingQuotations.lastTrackingUpdate,
      deliveredAt: purchasingQuotations.deliveredAt,
      ...briefSelect,
    })
    .from(receivingPackages)
    .innerJoin(purchasingQuotations, eq(purchasingQuotations.id, receivingPackages.quotationId))
    .leftJoin(purchasingCustomers, eq(purchasingCustomers.id, purchasingQuotations.customerId))
    .where(and(eq(receivingPackages.id, packageId), eq(receivingPackages.organizationId, organizationId)))
    .limit(1);
  if (!row) return null;

  const photoRows = await db
    .select({
      id: receivingPackagePhotos.id,
      kind: receivingPackagePhotos.kind,
      itemId: receivingPackagePhotos.itemId,
      filename: receivingPackagePhotos.filename,
      contentType: receivingPackagePhotos.contentType,
      sizeBytes: receivingPackagePhotos.sizeBytes,
    })
    .from(receivingPackagePhotos)
    .where(and(eq(receivingPackagePhotos.packageId, packageId), eq(receivingPackagePhotos.organizationId, organizationId)))
    .orderBy(receivingPackagePhotos.createdAt);

  const itemRows = await db
    .select()
    .from(receivingItems)
    .where(and(eq(receivingItems.packageId, packageId), eq(receivingItems.organizationId, organizationId)))
    .orderBy(receivingItems.sortOrder, receivingItems.createdAt);
  const lotRows = itemRows.length
    ? await db
        .select()
        .from(receivingExpirationLots)
        .where(and(eq(receivingExpirationLots.organizationId, organizationId), inArray(receivingExpirationLots.itemId, itemRows.map((i) => i.id))))
        .orderBy(receivingExpirationLots.sortOrder, receivingExpirationLots.createdAt)
    : [];
  const flags = discrepancyFlags(itemRows);
  const items: ItemView[] = itemRows.map((i, idx) => {
    const lots = lotRows
      .filter((l) => l.itemId === i.id)
      .map((l) => ({
        id: l.id,
        label: l.label ?? "",
        lotNumber: l.lotNumber ?? "",
        expirationDate: l.expirationDate ?? "",
        expirationEndDate: l.expirationEndDate ?? "",
        quantity: l.quantity,
      }));
    return {
      id: i.id,
      quotedItemId: i.quotedItemId,
      productId: i.productId,
      productName: i.productName,
      itemSource: i.itemSource,
      quotedQuantity: i.quotedQuantity,
      quotedAmount: i.quotedAmount,
      wasReceived: i.wasReceived ?? "",
      quantityReceived: i.quantityReceived,
      condition: i.condition ?? "",
      needsReturn: i.needsReturn ?? "",
      notes: i.notes ?? "",
      ndc: i.ndc ?? "",
      lotNumber: i.lotNumber ?? "",
      codeMatches: i.codeMatches ?? "",
      expirationQualifies: i.expirationQualifies ?? "",
      expirationEntryType: i.expirationEntryType ?? "",
      expirationDate: i.expirationDate ?? "",
      discrepancyCategories: parseStringList(i.discrepancyCategories),
      discrepancyNotes: i.discrepancyNotes ?? "",
      adjustmentRequired: i.adjustmentRequired ?? "",
      managementReview: i.managementReview ?? "",
      returnRequired: i.returnRequired ?? "",
      quotationAdjusted: i.quotationAdjusted ?? "",
      proposedRevisedAmount: i.proposedRevisedAmount,
      adjustmentReason: i.adjustmentReason ?? "",
      adjustmentNotes: i.adjustmentNotes ?? "",
      quantityToReturn: i.quantityToReturn,
      returnStatus: i.returnStatus ?? "",
      returnTracking: i.returnTracking ?? "",
      returnNotes: i.returnNotes ?? "",
      lots,
      flagged: flags[idx],
      lotsMismatch: lotsMismatch(i.quantityReceived, lots.map((l) => l.quantity)),
    };
  });

  const quotedLines: QuotedLine[] = (
    await db
      .select({
        id: purchasingQuotedItems.id,
        productId: purchasingQuotedItems.productId,
        name: purchasingQuotedItems.productNameSnapshot,
        code: purchasingQuotedItems.productCodeSnapshot,
        condition: purchasingQuotedItems.conditionNameSnapshot,
        expiration: purchasingQuotedItems.expirationRangeLabelSnapshot,
        quantity: purchasingQuotedItems.quantity,
        unitPrice: purchasingQuotedItems.finalUnitPrice,
        lineTotal: purchasingQuotedItems.lineTotal,
        notes: purchasingQuotedItems.notes,
      })
      .from(purchasingQuotedItems)
      .where(eq(purchasingQuotedItems.quotationId, row.quotationId))
      .orderBy(purchasingQuotedItems.createdAt)
  ).map((l) => ({ ...l }));

  const members = await db
    .select({ userId: users.id, name: users.name, email: users.email })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.organizationId, organizationId), isNull(memberships.deactivatedAt)));
  const team: TeamMember[] = members.map((m) => ({ userId: m.userId, name: m.name || m.email }));

  const itemsText = await itemsTextFor([row.quotationId], new Map([[row.quotationId, row.importedItems]]));
  const brief = toBrief(row, itemsText.get(row.quotationId) ?? "—");
  const [{ n: lineCount }] = await db
    .select({ n: sql<number>`count(*)` })
    .from(purchasingQuotedItems)
    .where(eq(purchasingQuotedItems.quotationId, row.quotationId));
  const receipt = await getReceiptState(organizationId, row.quotationId, Number(lineCount));

  // Another order in this company with the same tracking # or reference # (the old "Flag Duplicate Order" check).
  const dupeTerms = [row.pkg.trackingNumber ?? row.trackingNumber].filter((t): t is string => !!t && t.trim().length > 0);
  const dupeConds = [sql`lower(${purchasingQuotations.quotationNumber}) = lower(${row.quotationNumber})`];
  for (const t of dupeTerms) dupeConds.push(sql`lower(${purchasingQuotations.trackingNumber}) = lower(${t.trim()})`);
  const dupes = await db
    .select({ number: purchasingQuotations.quotationNumber, tracking: purchasingQuotations.trackingNumber })
    .from(purchasingQuotations)
    .where(and(eq(purchasingQuotations.organizationId, organizationId), ne(purchasingQuotations.id, row.quotationId), isNull(purchasingQuotations.archivedAt), or(...dupeConds)))
    .limit(5);

  const photoCounts: Partial<Record<PhotoKind, number>> = {};
  for (const p of photoRows) if (!p.itemId) photoCounts[p.kind] = (photoCounts[p.kind] ?? 0) + 1;
  const pkg = row.pkg;
  const damageTypes = parseDamageTypes(pkg.damageTypes);
  const settings = await getReceivingSettings(organizationId);
  const [adjRow] = await db
    .select({ id: receivingAdjustments.id, number: receivingAdjustments.number, status: receivingAdjustments.status, adjustedTotal: receivingAdjustments.adjustedTotal, originalTotal: receivingAdjustments.originalTotal })
    .from(receivingAdjustments)
    .where(and(eq(receivingAdjustments.packageId, packageId), eq(receivingAdjustments.organizationId, organizationId)))
    .limit(1);
  const adjustment: AdjustmentSummary | null = adjRow ?? null;
  // Who opened the package and when (older packages fall back to the day the record was created).
  const starterId = pkg.startedByUserId ?? pkg.receivedByUserId;
  const [starter] = starterId ? await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, starterId)).limit(1) : [];
  const started = { at: pkg.startedAt ?? pkg.createdAt, byName: starter ? starter.name || starter.email : null };
  return {
    pkg,
    started,
    adjustment,
    damageTypes,
    brief,
    quotationStatus: row.quotationStatus,
    tracking: { packageStatus: row.packageStatus, lastUpdate: row.lastTrackingUpdate, deliveredAt: row.deliveredAt },
    team,
    quotedLines,
    items,
    summary: summarizeItems(itemRows, quotedNotEntered(quotedLines, itemRows).length),
    photos: photoRows as PackagePhoto[],
    receipt,
    duplicates: dupes,
    settings,
    missing: [...computeMissingInfo({ ...pkg, damageTypes }, photoCounts, itemRows), ...(await recallGateIssues(organizationId, packageId, itemRows))],
  };
}

/** Pre-fill Step 6 from the quotation's own lines (one row per quoted line). Safe to call twice: it only fills an empty list. */
export async function ensureItemsFromQuotation(organizationId: string, packageId: string, quotationId: string) {
  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(receivingItems).where(eq(receivingItems.packageId, packageId));
  if (Number(n) > 0) return 0;
  const lines = await db
    .select({
      id: purchasingQuotedItems.id,
      productId: purchasingQuotedItems.productId,
      name: purchasingQuotedItems.productNameSnapshot,
      quantity: purchasingQuotedItems.quantity,
      lineTotal: purchasingQuotedItems.lineTotal,
      ndc: purchasingProducts.ndc,
    })
    .from(purchasingQuotedItems)
    .leftJoin(purchasingProducts, eq(purchasingProducts.id, purchasingQuotedItems.productId))
    .where(eq(purchasingQuotedItems.quotationId, quotationId))
    .orderBy(purchasingQuotedItems.createdAt);
  let order = 0;
  for (const l of lines) {
    await db.insert(receivingItems).values({
      id: newId("ritem"),
      organizationId,
      packageId,
      quotedItemId: l.id,
      productId: l.productId,
      productName: l.name,
      itemSource: "QUOTED",
      quotedQuantity: l.quantity,
      quotedAmount: l.lineTotal,
      ndc: l.ndc || null,
      sortOrder: order++,
    });
  }
  return lines.length;
}

/** Find orders in the Quotation Summary to start receiving: by reference #, customer, email or any part of the tracking #. */
export async function searchQuotationsForReceiving(organizationId: string, term: string) {
  const t = term.trim();
  if (t.length < 2) return [];
  const core = t.replace(/[%_]/g, "").trim();
  if (core.length < 2) return [];
  const pat = `%${core}%`;
  const rows = await db
    .select({ ...briefSelect, packageId: receivingPackages.id })
    .from(purchasingQuotations)
    .leftJoin(purchasingCustomers, eq(purchasingCustomers.id, purchasingQuotations.customerId))
    .leftJoin(receivingPackages, eq(receivingPackages.quotationId, purchasingQuotations.id))
    .where(
      and(
        eq(purchasingQuotations.organizationId, organizationId),
        isNull(purchasingQuotations.archivedAt),
        or(
          like(purchasingQuotations.quotationNumber, pat),
          like(purchasingQuotations.customerNameSnapshot, pat),
          like(purchasingQuotations.customerEmailSnapshot, pat),
          like(purchasingQuotations.trackingNumber, pat),
        ),
      ),
    )
    .orderBy(desc(purchasingQuotations.createdAt))
    .limit(8);
  return rows.map((r) => ({
    ...toBrief(r, ""),
    packageId: r.packageId,
  }));
}

/** Receiving state per quotation, for the pill on the Quotation Summary. */
export async function getReceivingStatusByQuotation(organizationId: string) {
  const rows = await db
    .select({ quotationId: receivingPackages.quotationId, id: receivingPackages.id, status: receivingPackages.status })
    .from(receivingPackages)
    .where(eq(receivingPackages.organizationId, organizationId));
  return new Map(rows.map((r) => [r.quotationId, { packageId: r.id, status: r.status }]));
}


export type CatalogProduct = { id: string; name: string; productCode: string | null; ndc: string | null; brandId: string | null; brand: string; noExpiration: boolean };

/**
 * The Purchasing product catalog as Receiving sees it (read only): every active product with its brand/category,
 * code and NDC. Same table Purchasing quotes from, so there is one list of products for the whole company.
 */
export async function getReceivingCatalog(organizationId: string, limit = 3000): Promise<CatalogProduct[]> {
  const rows = await db
    .select({
      id: purchasingProducts.id,
      name: purchasingProducts.name,
      productCode: purchasingProducts.productCode,
      ndc: purchasingProducts.ndc,
      brandId: purchasingProducts.categoryId,
      brand: purchasingCategories.name,
      brandOrder: purchasingCategories.sortOrder,
      noExpiration: purchasingProducts.noExpiration,
    })
    .from(purchasingProducts)
    .leftJoin(purchasingCategories, eq(purchasingCategories.id, purchasingProducts.categoryId))
    .where(and(eq(purchasingProducts.organizationId, organizationId), eq(purchasingProducts.active, true), isNull(purchasingProducts.archivedAt)))
    .orderBy(purchasingCategories.sortOrder, purchasingCategories.name, purchasingProducts.name)
    .limit(limit);
  return rows.map((r) => ({ id: r.id, name: r.name, productCode: r.productCode, ndc: r.ndc, brandId: r.brandId, brand: r.brand ?? "Other", noExpiration: r.noExpiration }));
}


// ---- Received Items database ------------------------------------------------------

export type ReceivedItemsFilter = { q?: string; from?: string; to?: string; agentId?: string; condition?: string; limit?: number; offset?: number };

export type ReceivedItemRow = {
  id: string;
  packageId: string;
  receivedAt: string | null; // as the agent entered it
  startedAt: string | null; // when the package was opened (UTC)
  customer: string;
  orderNumber: string;
  trackingNumber: string | null;
  productId: string | null;
  productName: string;
  productCode: string | null;
  brand: string | null;
  ndc: string | null;
  lotNumber: string | null;
  quantity: number;
  condition: string | null;
  expirationDate: string | null;
  expirationEarliest: string | null;
  expirationLatest: string | null;
  needsReturn: string | null;
  quantityToReturn: number | null;
  /** Received minus returned; null while the return decision is still pending. */
  quantityAccepted: number | null;
  returnStatus: string | null;
  /** RECALLED / CHECKED from the Step 6 recall check; null when it wasn't checked. */
  recallStatus: string | null;
  recallName: string | null;
  notes: string | null;
  receivedBy: string | null;
  receivedByUserId: string | null;
  /** The receiving row this line was copied from; serial numbers are recorded against it. */
  sourceItemId?: string | null;
};

const isDay =(v: string | undefined) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Every product line that has been received and submitted, newest first. One company only. */
export async function getReceivedItems(organizationId: string, f: ReceivedItemsFilter = {}): Promise<{ rows: ReceivedItemRow[]; total: number; totalQuantity: number }> {
  const agentExpr = sql`coalesce(${receivingIntakeLines.receivedByUserId}, ${receivingIntakeLogs.receivedByUserId}, ${receivingPackages.receivedByUserId})`;
  const conds = [eq(receivingIntakeLines.organizationId, organizationId)];
  const term = (f.q ?? "").trim().replace(/[%_\\]/g, "").toLowerCase();
  if (term) {
    const pat = `%${term}%`;
    conds.push(
      or(
        like(sql`lower(${receivingIntakeLines.productName})`, pat),
        like(sql`lower(coalesce(${receivingIntakeLines.ndc}, ''))`, pat),
        like(sql`lower(coalesce(${receivingIntakeLines.lotNumber}, ''))`, pat),
        like(sql`lower(coalesce(${receivingIntakeLines.receivedFrom}, ''))`, pat),
        like(sql`lower(${purchasingQuotations.quotationNumber})`, pat),
        like(sql`lower(coalesce(${receivingPackages.trackingNumber}, ${purchasingQuotations.trackingNumber}, ''))`, pat),
        like(sql`lower(coalesce(${users.name}, ${users.email}, ''))`, pat),
      )!,
    );
  }
  if (isDay(f.from)) conds.push(sql`substr(${receivingIntakeLines.receivedAt}, 1, 10) >= ${f.from}`);
  if (isDay(f.to)) conds.push(sql`substr(${receivingIntakeLines.receivedAt}, 1, 10) <= ${f.to}`);
  if (f.agentId) conds.push(sql`${agentExpr} = ${f.agentId}`);
  if (f.condition) conds.push(eq(receivingIntakeLines.condition, f.condition));

  const base = db
    .select({
      id: receivingIntakeLines.id,
      packageId: receivingPackages.id,
      receivedAt: receivingIntakeLines.receivedAt,
      startedAt: sql<string | null>`coalesce(${receivingIntakeLogs.startedAt}, ${receivingPackages.startedAt}, ${receivingPackages.createdAt})`,
      customer: receivingIntakeLines.receivedFrom,
      orderNumber: purchasingQuotations.quotationNumber,
      trackingNumber: sql<string | null>`coalesce(${receivingPackages.trackingNumber}, ${purchasingQuotations.trackingNumber})`,
      productId: receivingIntakeLines.productId,
      productName: receivingIntakeLines.productName,
      // older lines were saved before these were kept: fall back to the catalog as it is now
      productCode: sql<string | null>`coalesce(${receivingIntakeLines.productCode}, ${purchasingProducts.productCode})`,
      brand: sql<string | null>`coalesce(${receivingIntakeLines.brand}, ${purchasingCategories.name})`,
      ndc: receivingIntakeLines.ndc,
      lotNumber: receivingIntakeLines.lotNumber,
      quantity: receivingIntakeLines.quantity,
      condition: receivingIntakeLines.condition,
      expirationDate: receivingIntakeLines.expirationDate,
      expirationEarliest: receivingIntakeLines.expirationEarliest,
      expirationLatest: receivingIntakeLines.expirationLatest,
      needsReturn: receivingIntakeLines.needsReturn,
      quantityToReturn: receivingIntakeLines.quantityToReturn,
      quantityAccepted: receivingIntakeLines.quantityAccepted,
      returnStatus: receivingIntakeLines.returnStatus,
      recallStatus: receivingIntakeLines.recallStatus,
      recallName: receivingIntakeLines.recallName,
      notes: receivingIntakeLines.itemNotes,
      sourceItemId: receivingIntakeLines.sourceItemId,
      agentId: sql<string | null>`${agentExpr}`,
      receivedByName: users.name,
      receivedByEmail: users.email,
    })
    .from(receivingIntakeLines)
    .innerJoin(receivingIntakeLogs, eq(receivingIntakeLogs.id, receivingIntakeLines.logId))
    .innerJoin(receivingPackages, eq(receivingPackages.id, receivingIntakeLogs.packageId))
    .innerJoin(purchasingQuotations, eq(purchasingQuotations.id, receivingPackages.quotationId))
    .leftJoin(users, sql`${users.id} = ${agentExpr}`)
    .leftJoin(purchasingProducts, eq(purchasingProducts.id, receivingIntakeLines.productId))
    .leftJoin(purchasingCategories, eq(purchasingCategories.id, purchasingProducts.categoryId))
    .where(and(...conds));

  const rows = await base
    .orderBy(desc(receivingIntakeLines.receivedAt), desc(receivingIntakeLines.createdAt))
    .limit(Math.min(Math.max(f.limit ?? 100, 1), 5000))
    .offset(Math.max(f.offset ?? 0, 0));

  const [agg] = await db
    .select({ n: sql<number>`count(*)`, qty: sql<number>`coalesce(sum(${receivingIntakeLines.quantity}), 0)` })
    .from(receivingIntakeLines)
    .innerJoin(receivingIntakeLogs, eq(receivingIntakeLogs.id, receivingIntakeLines.logId))
    .innerJoin(receivingPackages, eq(receivingPackages.id, receivingIntakeLogs.packageId))
    .innerJoin(purchasingQuotations, eq(purchasingQuotations.id, receivingPackages.quotationId))
    .leftJoin(users, sql`${users.id} = ${agentExpr}`)
    .where(and(...conds));

  return {
    rows: rows.map((r) => ({
      id: r.id,
      packageId: r.packageId,
      receivedAt: r.receivedAt,
      startedAt: r.startedAt,
      customer: r.customer ?? "",
      orderNumber: r.orderNumber,
      trackingNumber: r.trackingNumber,
      productId: r.productId,
      productName: r.productName,
      productCode: r.productCode,
      brand: r.brand,
      ndc: r.ndc,
      lotNumber: r.lotNumber,
      quantity: r.quantity,
      condition: r.condition,
      expirationDate: r.expirationDate ?? r.expirationEarliest,
      expirationEarliest: r.expirationEarliest,
      expirationLatest: r.expirationLatest,
      needsReturn: r.needsReturn,
      quantityToReturn: r.quantityToReturn,
      quantityAccepted: r.quantityAccepted ?? (r.needsReturn === "PENDING_REVIEW" ? null : acceptedQuantity(r.quantity, r.needsReturn, r.quantityToReturn)),
      recallStatus: r.recallStatus,
      recallName: r.recallName,
      returnStatus: r.returnStatus,
      notes: r.notes,
      receivedBy: r.receivedByName || r.receivedByEmail || null,
      receivedByUserId: r.agentId,
      sourceItemId: r.sourceItemId,
    })),
    total: Number(agg?.n ?? 0),
    totalQuantity: Number(agg?.qty ?? 0),
  };
}
