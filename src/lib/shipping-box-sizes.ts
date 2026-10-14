// Saved box sizes (Shipping department). Dimensions only. Removing a size hides it; it is never deleted.
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { shipmentBoxes, shippingBoxSizes } from "@/db/schema";
import { newId } from "@/lib/ids";
import { cleanSizeName, MAX_SAVED_SIZES, parseBoxSize, recentSizes, sizeKey, sizeLabel, type BoxDims } from "@/lib/box-size-rules";
import type { Org } from "@/lib/sales-service";

export type SavedBoxSize = BoxDims & { id: string; name: string | null };
export type BoxSizeLists = { saved: SavedBoxSize[]; recent: (BoxDims & { count: number })[] };
type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export async function listBoxSizes(organizationId: string): Promise<BoxSizeLists> {
  const rows = await db.select().from(shippingBoxSizes).where(eq(shippingBoxSizes.organizationId, organizationId)).orderBy(asc(shippingBoxSizes.createdAt), asc(shippingBoxSizes.id));
  const saved = rows.filter((r) => !r.hidden).map((r) => ({ id: r.id, name: r.name, lengthIn: r.lengthIn, widthIn: r.widthIn, heightIn: r.heightIn }));
  // Earlier labels' sizes (newest first), minus anything saved or removed from the list.
  const parcels = await db.select({ p: shipmentBoxes.parcel }).from(shipmentBoxes).where(eq(shipmentBoxes.organizationId, organizationId)).orderBy(desc(shipmentBoxes.createdAt)).limit(300);
  const recent = recentSizes(parcels.map((x) => x.p), new Set(rows.map((r) => r.dimsKey)));
  return { saved, recent };
}

/** Saves a size (or brings back one that was removed). The same box in any order is one size. */
export async function saveBoxSize(org: Org, input: { lengthIn: unknown; widthIn: unknown; heightIn: unknown; name?: unknown }): Promise<Result<{ message: string }>> {
  const size = parseBoxSize(input);
  if (!size.ok) return size;
  const name = cleanSizeName(input.name);
  if (!name.ok) return name;
  const key = sizeKey(size.size);
  const [have] = await db.select().from(shippingBoxSizes).where(and(eq(shippingBoxSizes.organizationId, org.organizationId), eq(shippingBoxSizes.dimsKey, key))).limit(1);
  if (have) {
    if (!have.hidden && !name.name) return { ok: true, message: `${sizeLabel(size.size)} is already saved.` };
    await db.update(shippingBoxSizes).set({ hidden: false, name: name.name ?? have.name }).where(eq(shippingBoxSizes.id, have.id));
    return { ok: true, message: have.hidden ? `${sizeLabel(size.size)} is back in your saved sizes.` : `Renamed to ${name.name}.` };
  }
  const visible = await db.select({ id: shippingBoxSizes.id }).from(shippingBoxSizes).where(and(eq(shippingBoxSizes.organizationId, org.organizationId), eq(shippingBoxSizes.hidden, false)));
  if (visible.length >= MAX_SAVED_SIZES) return { ok: false, error: `You can keep up to ${MAX_SAVED_SIZES} saved sizes. Remove one you no longer use first.` };
  await db.insert(shippingBoxSizes).values({ id: newId("sbsz"), organizationId: org.organizationId, name: name.name, ...size.size, dimsKey: key, createdByUserId: org.userId });
  return { ok: true, message: `Saved ${sizeLabel(size.size)}.` };
}

/** Takes a size off the list (hidden, not deleted). */
export async function hideBoxSize(org: Org, id: string): Promise<Result> {
  const res = await db.update(shippingBoxSizes).set({ hidden: true }).where(and(eq(shippingBoxSizes.id, id), eq(shippingBoxSizes.organizationId, org.organizationId)));
  return res.rowsAffected === 1 ? { ok: true } : { ok: false, error: "That size wasn't found." };
}
