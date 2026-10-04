// Reads for the Receiving department. Everything is scoped by the signed-in
// user's company (organizationId comes from requireOrg, never from the URL).
// An order is never copied into Receiving: each package points at its quotation
// in the Purchasing Quotation Summary and reads the order details from there.

import { and, desc, eq, inArray, isNull, like, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  receivingPackages,
  receivingPackagePhotos,
  purchasingQuotations,
  purchasingQuotedItems,
  purchasingCustomers,
  users,
} from "@/db/schema";
import { getReceiptState } from "@/lib/purchasing-receipt-docs";
import { computeMissingInfo, parseDamageTypes, type PhotoKind } from "@/lib/receiving-rules";

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
      customerName: b.customerName,
      quotationNumber: r.quotationNumber,
      grandTotal: r.grandTotal,
      coverPhotoId: coverBy.get(r.id) ?? null,
      searchText: `${b.customerName} ${r.quotationNumber} ${r.pkgTracking ?? r.trackingNumber ?? ""} ${b.email ?? ""}`.toLowerCase(),
    };
  });
}

export type PackagePhoto = { id: string; kind: PhotoKind; filename: string; contentType: string; sizeBytes: number };

export async function getReceivingPackage(organizationId: string, packageId: string) {
  const [row] = await db
    .select({
      pkg: receivingPackages,
      receivedByName: users.name,
      receivedByEmail: users.email,
      ...briefSelect,
    })
    .from(receivingPackages)
    .innerJoin(purchasingQuotations, eq(purchasingQuotations.id, receivingPackages.quotationId))
    .leftJoin(purchasingCustomers, eq(purchasingCustomers.id, purchasingQuotations.customerId))
    .leftJoin(users, eq(users.id, receivingPackages.receivedByUserId))
    .where(and(eq(receivingPackages.id, packageId), eq(receivingPackages.organizationId, organizationId)))
    .limit(1);
  if (!row) return null;
  const photoRows = await db
    .select({
      id: receivingPackagePhotos.id,
      kind: receivingPackagePhotos.kind,
      filename: receivingPackagePhotos.filename,
      contentType: receivingPackagePhotos.contentType,
      sizeBytes: receivingPackagePhotos.sizeBytes,
    })
    .from(receivingPackagePhotos)
    .where(and(eq(receivingPackagePhotos.packageId, packageId), eq(receivingPackagePhotos.organizationId, organizationId)))
    .orderBy(receivingPackagePhotos.createdAt);
  const items = await itemsTextFor([row.quotationId], new Map([[row.quotationId, row.importedItems]]));
  const brief = toBrief(row, items.get(row.quotationId) ?? "—");
  const [{ n: lineCount }] = await db
    .select({ n: sql<number>`count(*)` })
    .from(purchasingQuotedItems)
    .where(eq(purchasingQuotedItems.quotationId, row.quotationId));
  const receipt = await getReceiptState(organizationId, row.quotationId, Number(lineCount));
  const photoCounts: Partial<Record<PhotoKind, number>> = {};
  for (const p of photoRows) photoCounts[p.kind] = (photoCounts[p.kind] ?? 0) + 1;
  const pkg = row.pkg;
  const damageTypes = parseDamageTypes(pkg.damageTypes);
  return {
    pkg,
    damageTypes,
    brief,
    receivedByName: row.receivedByName ?? row.receivedByEmail ?? "—",
    photos: photoRows as PackagePhoto[],
    receipt,
    missing: computeMissingInfo({ ...pkg, damageTypes }, photoCounts),
  };
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
