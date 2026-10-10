// Following the boxes of a shipment. Same idea as Purchasing's package tracking (tracking-service.ts) and the same pieces
// (Shippo through the company's OWN account, the same status words), but the boxes belong to a shipment of a sales order.
// A box set by hand (followAuto = false) is never changed by the carrier's news until a person asks to follow it again.

import { and, asc, eq, notInArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { shipmentBoxes, shipments } from "@/db/schema";
import { ShippoRequestError, type ShippoClient } from "@/lib/shippo";
import { noteShippoFailure, resolveShippo } from "@/lib/shippo-connection";
import { isFinished, isStale, parseTrack, shippoCarrier, type ParsedTrack } from "@/lib/tracking-rules";
import { shipmentStatus } from "@/lib/shipping-rules";

export type BoxRow = typeof shipmentBoxes.$inferSelect;

const nowStamp = () => new Date().toISOString().slice(0, 19).replace("T", " ");

/** Re-reads a shipment's boxes and writes the one rolled-up status on the shipment. */
export async function rollUpShipment(organizationId: string, shipmentId: string): Promise<void> {
  const boxes = await db
    .select({ status: shipmentBoxes.status, deliveredAt: shipmentBoxes.deliveredAt, statusAt: shipmentBoxes.statusAt })
    .from(shipmentBoxes)
    .where(and(eq(shipmentBoxes.organizationId, organizationId), eq(shipmentBoxes.shipmentId, shipmentId)));
  const r = shipmentStatus(boxes);
  await db
    .update(shipments)
    .set({ status: r.status, deliveredAt: r.deliveredAt, lastTrackingUpdate: r.lastUpdate, updatedAt: sql`(current_timestamp)` })
    .where(and(eq(shipments.id, shipmentId), eq(shipments.organizationId, organizationId)));
}

async function saveParsed(row: Pick<BoxRow, "id" | "organizationId" | "shipmentId">, t: ParsedTrack): Promise<void> {
  await db
    .update(shipmentBoxes)
    .set({
      status: t.status,
      statusDetails: t.statusDetails,
      location: t.location,
      eta: t.eta,
      statusAt: t.statusAt,
      deliveredAt: t.deliveredAt,
      history: JSON.stringify(t.history.slice(0, 60)),
      lastCheckedAt: nowStamp(),
      lastError: null,
      updatedAt: sql`(current_timestamp)`,
    })
    .where(and(eq(shipmentBoxes.id, row.id), eq(shipmentBoxes.organizationId, row.organizationId)));
  await rollUpShipment(row.organizationId, row.shipmentId);
}

async function markError(row: BoxRow, message: string): Promise<void> {
  await db
    .update(shipmentBoxes)
    .set({ lastError: message.slice(0, 300), lastCheckedAt: nowStamp(), updatedAt: sql`(current_timestamp)` })
    .where(and(eq(shipmentBoxes.id, row.id), eq(shipmentBoxes.organizationId, row.organizationId)));
}

/** Asks Shippo about one box now, with that company's own Shippo account. Never throws: a problem is kept on the box and shown there. */
export async function refreshBox(row: BoxRow, client?: ShippoClient): Promise<boolean> {
  if (!row.followAuto) return false;
  let shippo = client;
  if (!shippo) {
    const access = await resolveShippo(row.organizationId);
    if (!access.ok) {
      await markError(row, access.reason === "not_connected" ? "Live tracking isn't connected yet. An owner or admin can connect Shippo in Shipping → Settings → Connectors. You can set the status by hand meanwhile." : access.message);
      return false;
    }
    shippo = access.client;
  }
  const carrier = shippoCarrier(row.carrier);
  if (!carrier) {
    await markError(row, "This carrier can't be followed automatically. Choose UPS, USPS or FedEx, or set the status by hand.");
    return false;
  }
  try {
    let body: unknown;
    try {
      body = await shippo.getTrack(carrier, row.trackingNumber);
    } catch (e) {
      if (e instanceof ShippoRequestError && (e.status === 401 || e.status === 403)) throw e;
      body = await shippo.registerTrack(carrier, row.trackingNumber);
    }
    const parsed = parseTrack(body);
    if (!parsed) throw new Error("Shippo's answer wasn't readable.");
    await saveParsed(row, parsed);
    return true;
  } catch (e) {
    await noteShippoFailure(row.organizationId, e);
    const m = e instanceof Error ? e.message.replace(/^Shippo request failed:\s*/, "") : "Tracking lookup failed.";
    await markError(row, `Shippo couldn't find this package yet (${m}).`);
    return false;
  }
}

export async function boxesOf(organizationId: string, shipmentId: string): Promise<BoxRow[]> {
  return db
    .select()
    .from(shipmentBoxes)
    .where(and(eq(shipmentBoxes.organizationId, organizationId), eq(shipmentBoxes.shipmentId, shipmentId)))
    .orderBy(asc(shipmentBoxes.position), asc(shipmentBoxes.createdAt));
}

/** Refreshes the boxes of one shipment that are due (all unfinished ones when forced). Used when someone opens or refreshes the shipment. */
export async function syncShipmentTracking(organizationId: string, shipmentId: string, opts: { force?: boolean } = {}): Promise<BoxRow[]> {
  let rows = await boxesOf(organizationId, shipmentId);
  const due = rows.filter((r) => r.followAuto && (opts.force ? !isFinished(r.status) || !r.lastCheckedAt : isStale(r))).slice(0, 12);
  if (due.length === 0) return rows;
  const access = await resolveShippo(organizationId);
  await Promise.all(due.map((r) => refreshBox(r, access.ok ? access.client : undefined)));
  rows = await boxesOf(organizationId, shipmentId);
  return rows;
}

/** Best effort after a box is added: start following it. Never throws. */
export async function startFollowing(organizationId: string, shipmentId: string): Promise<void> {
  try {
    await syncShipmentTracking(organizationId, shipmentId, { force: true });
  } catch {
    // The box is saved; tracking catches up on the next refresh.
  }
}

/** A "track updated" message from Shippo for boxes of shipments. Only the company that owns the number changes (when the address carries one). */
export async function applyShipmentWebhook(payload: unknown, organizationId: string | null = null): Promise<{ updated: number }> {
  const p = payload as { event?: string; data?: unknown } | null;
  if (!p || p.event !== "track_updated") return { updated: 0 };
  const parsed = parseTrack(p.data);
  if (!parsed) return { updated: 0 };
  const rows = await db
    .select()
    .from(shipmentBoxes)
    .where(organizationId ? and(eq(shipmentBoxes.trackingNumber, parsed.trackingNumber), eq(shipmentBoxes.organizationId, organizationId)) : eq(shipmentBoxes.trackingNumber, parsed.trackingNumber));
  let n = 0;
  for (const r of rows) {
    if (!r.followAuto) continue;
    await saveParsed(r, parsed);
    n++;
  }
  return { updated: n };
}

/** The nightly sweep: refresh every shipment box still moving, each company through its own Shippo account. */
export async function sweepShipmentTracking(limit = 150): Promise<{ refreshed: number }> {
  const active = await db
    .select()
    .from(shipmentBoxes)
    .where(and(eq(shipmentBoxes.followAuto, true), notInArray(shipmentBoxes.status, ["Delivered", "Returned"])))
    .orderBy(asc(shipmentBoxes.lastCheckedAt))
    .limit(limit);
  const clients = new Map<string, ShippoClient | null>();
  for (const orgId of new Set(active.map((r) => r.organizationId))) {
    const access = await resolveShippo(orgId);
    clients.set(orgId, access.ok ? access.client : null);
  }
  const usable = active.filter((r) => clients.get(r.organizationId));
  let refreshed = 0;
  for (let i = 0; i < usable.length; i += 5) {
    const results = await Promise.all(usable.slice(i, i + 5).map((r) => refreshBox(r, clients.get(r.organizationId)!)));
    refreshed += results.filter(Boolean).length;
  }
  return { refreshed };
}

