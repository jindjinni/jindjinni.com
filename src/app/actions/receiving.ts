"use server";

// Receiving actions. One package per quotation (the quotation stays the single
// order record in Purchasing's Quotation Summary). Owner / Admin / Receiver can
// write; every other role is view-only. Everything is scoped by the signed-in
// user's company.

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  purchasingQuotations,
  purchasingAuditLog,
  receivingPackages,
  receivingPackagePhotos,
  RECEIVING_PHOTO_KINDS,
} from "@/db/schema";
import { requireOrg, type CurrentOrg } from "@/lib/tenant";
import { canViewReceiving, canWriteReceiving } from "@/lib/permissions";
import { searchQuotationsForReceiving } from "@/lib/receiving-queries";
import { newId } from "@/lib/ids";
import { sniffReceiptType } from "@/lib/purchasing-receipt-docs";
import {
  DAMAGE_TYPES,
  MAX_PHOTOS_PER_KIND,
  computeMissingInfo,
  finalStatusFor,
  parseDamageTypes,
  type PhotoKind,
} from "@/lib/receiving-rules";
import { storage, STORAGE_NOT_CONNECTED } from "@/lib/receiving-storage";

export type ReceivingActionState = { error?: string; ok?: boolean; id?: string; missing?: string[] };

const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
const YES_NO = ["YES", "NO"] as const;

async function requireWriter(): Promise<CurrentOrg> {
  const org = await requireOrg();
  if (!canWriteReceiving(org.role)) throw new Error("Your role can view Receiving but can't make changes.");
  return org;
}

async function ownPackage(organizationId: string, packageId: string) {
  const [p] = await db
    .select()
    .from(receivingPackages)
    .where(and(eq(receivingPackages.id, packageId), eq(receivingPackages.organizationId, organizationId)))
    .limit(1);
  return p ?? null;
}

async function audit(org: CurrentOrg, quotationId: string, field: string, note: string) {
  await db.insert(purchasingAuditLog).values({
    id: newId("paudit"),
    organizationId: org.organizationId,
    userId: org.userId,
    recordType: "quotation",
    recordId: quotationId,
    fieldName: field,
    previousValue: null,
    newValue: null,
    note,
  });
}

function refresh(packageId?: string) {
  revalidatePath("/dashboard/receiving", "layout");
  revalidatePath("/dashboard/purchasing/quotations");
  if (packageId) revalidatePath(`/dashboard/receiving/intake/${packageId}`);
}

/** Start receiving an order from the Quotation Summary. If it's already started, just returns the existing package. */
export async function startReceiving(quotationId: string): Promise<ReceivingActionState> {
  const org = await requireWriter();
  const [q] = await db
    .select({
      id: purchasingQuotations.id,
      number: purchasingQuotations.quotationNumber,
      trackingNumber: purchasingQuotations.trackingNumber,
      carrier: purchasingQuotations.carrier,
      status: purchasingQuotations.status,
    })
    .from(purchasingQuotations)
    .where(and(eq(purchasingQuotations.id, quotationId), eq(purchasingQuotations.organizationId, org.organizationId)))
    .limit(1);
  if (!q) return { error: "That order wasn't found." };
  if (q.status === "CANCELLED") return { error: "That order is cancelled, so it can't be received." };

  const [existing] = await db
    .select({ id: receivingPackages.id })
    .from(receivingPackages)
    .where(eq(receivingPackages.quotationId, quotationId))
    .limit(1);
  if (existing) return { ok: true, id: existing.id };

  const id = newId("rpkg");
  try {
    await db.insert(receivingPackages).values({
      id,
      organizationId: org.organizationId,
      quotationId,
      status: "IN_PROGRESS",
      trackingNumber: q.trackingNumber,
      carrier: q.carrier,
      receivedByUserId: org.userId,
    });
  } catch {
    // Two people started it at the same moment: the unique index kept one.
    const [again] = await db.select({ id: receivingPackages.id }).from(receivingPackages).where(eq(receivingPackages.quotationId, quotationId)).limit(1);
    if (again) return { ok: true, id: again.id };
    return { error: "Couldn't start receiving. Try again." };
  }
  await audit(org, quotationId, "receiving", `Receiving started (${q.number})`);
  refresh(id);
  return { ok: true, id };
}

function pick<T extends string>(raw: FormDataEntryValue | null, allowed: readonly T[]): T | null {
  const v = typeof raw === "string" ? raw : "";
  return (allowed as readonly string[]).includes(v) ? (v as T) : null;
}
function text(raw: FormDataEntryValue | null, max = 2000): string | null {
  const v = typeof raw === "string" ? raw.trim().slice(0, max) : "";
  return v || null;
}
/** "2026-10-04T13:05" (datetime-local) -> "2026-10-04 13:05:00", kept exactly as typed. */
function stamp(raw: FormDataEntryValue | null): string | null {
  const v = typeof raw === "string" ? raw.trim() : "";
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::(\d{2}))?$/.exec(v);
  return m ? `${m[1]} ${m[2]}:${m[3] ?? "00"}` : null;
}

async function photoCountsFor(packageId: string) {
  const rows = await db
    .select({ kind: receivingPackagePhotos.kind, n: sql<number>`count(*)` })
    .from(receivingPackagePhotos)
    .where(eq(receivingPackagePhotos.packageId, packageId))
    .groupBy(receivingPackagePhotos.kind);
  const out: Partial<Record<PhotoKind, number>> = {};
  for (const r of rows) out[r.kind] = Number(r.n);
  return out;
}

/** Saves the form as a draft (nothing is required yet). */
export async function saveReceiving(packageId: string, formData: FormData): Promise<ReceivingActionState> {
  const org = await requireWriter();
  const p = await ownPackage(org.organizationId, packageId);
  if (!p) return { error: "That shipment wasn't found." };

  const externalDamage = pick(formData.get("externalDamage"), YES_NO);
  const damageTypes = formData
    .getAll("damageTypes")
    .filter((v): v is string => typeof v === "string" && (DAMAGE_TYPES as readonly string[]).includes(v));
  await db
    .update(receivingPackages)
    .set({
      trackingNumber: text(formData.get("trackingNumber"), 80),
      carrier: pick(formData.get("carrier"), ["UPS", "USPS", "FedEx", "Other"] as const),
      receivedAt: stamp(formData.get("receivedAt")),
      externalDamage,
      damageTypes: externalDamage === "YES" && damageTypes.length ? JSON.stringify(damageTypes) : null,
      damageNotes: text(formData.get("damageNotes")),
      doubleBoxed: pick(formData.get("doubleBoxed"), YES_NO),
      protectiveMaterial: pick(formData.get("protectiveMaterial"), YES_NO),
      sturdyOuterBox: pick(formData.get("sturdyOuterBox"), YES_NO),
      productsSecured: pick(formData.get("productsSecured"), YES_NO),
      packageSealed: pick(formData.get("packageSealed"), YES_NO),
      packagingRequirementsMet: pick(formData.get("packagingRequirementsMet"), ["YES", "NO", "PARTIALLY"] as const),
      overallPackaging: pick(formData.get("overallPackaging"), ["ACCEPTABLE", "NOT_ACCEPTABLE"] as const),
      packagingIssueNotes: text(formData.get("packagingIssueNotes")),
      packingSheetIncluded: pick(formData.get("packingSheetIncluded"), YES_NO),
      quantityMatches: pick(formData.get("quantityMatches"), YES_NO),
      adjustmentNeeded: pick(formData.get("adjustmentNeeded"), YES_NO),
      adjustmentDetails: text(formData.get("adjustmentDetails")),
      receivingNotes: text(formData.get("receivingNotes"), 4000),
      updatedAt: sql`(current_timestamp)`,
    })
    .where(eq(receivingPackages.id, packageId));
  refresh(packageId);
  return { ok: true, id: packageId };
}

/** Saves, then checks nothing is missing. If complete, locks in the final status and marks the order Received. */
export async function submitReceiving(packageId: string, formData: FormData): Promise<ReceivingActionState> {
  const org = await requireWriter();
  const saved = await saveReceiving(packageId, formData);
  if (saved.error) return saved;
  const p = await ownPackage(org.organizationId, packageId);
  if (!p) return { error: "That shipment wasn't found." };

  const facts = { ...p, damageTypes: parseDamageTypes(p.damageTypes) };
  const missing = computeMissingInfo(facts, await photoCountsFor(packageId));
  if (missing.length > 0) return { error: "Some required information is still missing.", missing };

  const status = finalStatusFor(facts);
  await db
    .update(receivingPackages)
    .set({
      status,
      receivedByUserId: p.receivedByUserId ?? org.userId,
      submittedByUserId: org.userId,
      submittedAt: sql`(current_timestamp)`,
      updatedAt: sql`(current_timestamp)`,
    })
    .where(eq(receivingPackages.id, packageId));
  // The order itself lives in the Quotation Summary: mark it Received there.
  await db
    .update(purchasingQuotations)
    .set({ status: "RECEIVED", updatedAt: sql`(current_timestamp)` })
    .where(
      and(
        eq(purchasingQuotations.id, p.quotationId),
        eq(purchasingQuotations.organizationId, org.organizationId),
        sql`${purchasingQuotations.status} in ('QUOTED','CONFIRMED')`,
      ),
    );
  await audit(org, p.quotationId, "receiving", `Receiving submitted: ${status === "RECEIVING_COMPLETE" ? "complete" : "complete with discrepancy"}`);
  refresh(packageId);
  return { ok: true, id: packageId };
}

/** Puts a submitted shipment back to In Progress so it can be corrected. */
export async function reopenReceiving(packageId: string): Promise<ReceivingActionState> {
  const org = await requireWriter();
  const p = await ownPackage(org.organizationId, packageId);
  if (!p) return { error: "That shipment wasn't found." };
  await db
    .update(receivingPackages)
    .set({ status: "IN_PROGRESS", submittedAt: null, submittedByUserId: null, updatedAt: sql`(current_timestamp)` })
    .where(eq(receivingPackages.id, packageId));
  await audit(org, p.quotationId, "receiving", "Receiving reopened for changes");
  refresh(packageId);
  return { ok: true, id: packageId };
}

export async function uploadReceivingPhoto(packageId: string, kind: string, formData: FormData): Promise<ReceivingActionState> {
  const org = await requireWriter();
  const p = await ownPackage(org.organizationId, packageId);
  if (!p) return { error: "That shipment wasn't found." };
  if (!(RECEIVING_PHOTO_KINDS as readonly string[]).includes(kind)) return { error: "Unknown photo type." };
  if (!storage.configured()) return { error: STORAGE_NOT_CONNECTED };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a photo to add." };
  if (file.size > MAX_PHOTO_BYTES) return { error: "That photo is over 4 MB. Choose a smaller one." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffReceiptType(bytes);
  if (!type || !type.isImage) return { error: "Only photos (JPG, PNG, WebP or GIF) can be added here." };

  const counts = await photoCountsFor(packageId);
  if ((counts[kind as PhotoKind] ?? 0) >= MAX_PHOTOS_PER_KIND) return { error: `You can add up to ${MAX_PHOTOS_PER_KIND} photos here.` };

  const id = newId("rphoto");
  const cleanName = (file.name || `photo.${type.ext}`).replace(/[^A-Za-z0-9._ -]/g, "_").slice(0, 120);
  const storagePath = `receiving/${org.organizationId}/${packageId}/${id}.${type.ext}`;
  try {
    await storage.save(storagePath, bytes, type.mime);
  } catch {
    return { error: "The photo couldn't be saved to storage. Try again." };
  }
  await db.insert(receivingPackagePhotos).values({
    id,
    organizationId: org.organizationId,
    packageId,
    kind: kind as PhotoKind,
    filename: cleanName,
    contentType: type.mime,
    sizeBytes: bytes.length,
    storagePath,
    uploadedByUserId: org.userId,
  });
  refresh(packageId);
  return { ok: true, id };
}

export async function deleteReceivingPhoto(photoId: string): Promise<ReceivingActionState> {
  const org = await requireWriter();
  const [ph] = await db
    .select()
    .from(receivingPackagePhotos)
    .where(and(eq(receivingPackagePhotos.id, photoId), eq(receivingPackagePhotos.organizationId, org.organizationId)))
    .limit(1);
  if (!ph) return { error: "That photo wasn't found." };
  await db.delete(receivingPackagePhotos).where(eq(receivingPackagePhotos.id, photoId));
  try {
    await storage.remove(ph.storagePath);
  } catch {
    // The record is gone either way; a leftover private file is harmless.
  }
  refresh(ph.packageId);
  return { ok: true, id: ph.packageId };
}

/** Look up orders in the Quotation Summary to start receiving (reference #, customer, email or tracking #). */
export async function searchOrdersToReceive(term: string) {
  const org = await requireOrg();
  if (!canViewReceiving(org.role)) return [];
  return searchQuotationsForReceiving(org.organizationId, term);
}
