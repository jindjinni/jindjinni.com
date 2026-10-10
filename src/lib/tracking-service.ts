// Live package tracking: keeps one row per tracking number up to date from Shippo and rolls the boxes of a quotation
// up into the quotation's own package status and delivered time (which starts the customer-payment clock in Accounts).
// Updates arrive three ways: Shippo's webhook (instant), a refresh when someone opens the order, and a nightly sweep.

import { createHmac, timingSafeEqual } from "node:crypto";
import { and, asc, eq, inArray, isNull, ne, notInArray, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { purchasingQuotationLabels, purchasingQuotations, purchasingTracking, shippoConnections } from "@/db/schema";
import { newId } from "@/lib/ids";
import { ShippoRequestError, type ShippoClient } from "@/lib/shippo";
import { NOT_CONNECTED_MESSAGE, noteShippoFailure, resolveShippo } from "@/lib/shippo-connection";
import { applyShipmentWebhook, sweepShipmentTracking } from "@/lib/shipping-tracking";
import { carrierOfLabel, isFinished, isStale, parseTrack, rollUp, shippoCarrier, type ParsedTrack } from "@/lib/tracking-rules";

export type TrackingRow = typeof purchasingTracking.$inferSelect;

const nowStamp = () => new Date().toISOString().slice(0, 19).replace("T", " ");

/**
 * The secret in a webhook address, so only Shippo (who we told the address) can post updates.
 * Each company's address carries its own secret AND its company id, so a company's Shippo account can only ever
 * update that company's packages. The platform's own address (no company) is kept for the platform's own companies.
 */
function webhookSecretFor(organizationId: string | null): string {
  const secret = process.env.SHIPPO_WEBHOOK_SECRET || process.env.AUTH_SECRET || "dev-only-secret";
  return createHmac("sha256", secret).update(organizationId ? `shippo-track-webhook:${organizationId}` : "shippo-track-webhook").digest("hex").slice(0, 40);
}
export const webhookToken = () => webhookSecretFor(null);
/** True when the token matches the address's company (or the platform address when no company is given). */
export function webhookTokenOk(given: string | null, organizationId: string | null = null): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(webhookSecretFor(organizationId));
  return a.length === b.length && timingSafeEqual(a, b);
}
const trimOrigin = (origin: string) => origin.replace(/\/$/, "");
/** The platform's own webhook address (for the companies the platform runs on its own Shippo account). */
export const webhookUrl = (origin: string) => `${trimOrigin(origin)}/api/shippo/webhook?token=${webhookToken()}`;
/** A company's own webhook address, registered in that company's Shippo account. */
export const webhookUrlFor = (origin: string, organizationId: string) =>
  `${trimOrigin(origin)}/api/shippo/webhook?org=${encodeURIComponent(organizationId)}&token=${webhookSecretFor(organizationId)}`;

type Wanted = { carrier: "UPS" | "USPS" | "FedEx" | "Other"; trackingNumber: string; labelId: string | null };

/** The tracking numbers a quotation should be tracking: every label's number, plus a number typed in by hand. */
async function wantedFor(organizationId: string, quotationId: string): Promise<Wanted[]> {
  const [q] = await db
    .select({ carrier: purchasingQuotations.carrier, trackingNumber: purchasingQuotations.trackingNumber, labelTrackingNumber: purchasingQuotations.labelTrackingNumber, labelCarrier: purchasingQuotations.labelCarrier })
    .from(purchasingQuotations)
    .where(and(eq(purchasingQuotations.id, quotationId), eq(purchasingQuotations.organizationId, organizationId)))
    .limit(1);
  if (!q) return [];
  const labels = await db
    .select({ id: purchasingQuotationLabels.id, carrier: purchasingQuotationLabels.carrier, trackingNumber: purchasingQuotationLabels.trackingNumber })
    .from(purchasingQuotationLabels)
    .where(and(eq(purchasingQuotationLabels.quotationId, quotationId), eq(purchasingQuotationLabels.organizationId, organizationId)))
    .orderBy(asc(purchasingQuotationLabels.labelNumber));
  const out = new Map<string, Wanted>();
  for (const l of labels) {
    const n = (l.trackingNumber ?? "").trim();
    if (n) out.set(n, { carrier: carrierOfLabel(l.carrier), trackingNumber: n, labelId: l.id });
  }
  const typed = (q.trackingNumber ?? "").trim();
  if (typed && !out.has(typed)) out.set(typed, { carrier: (q.carrier ?? "Other") as Wanted["carrier"], trackingNumber: typed, labelId: null });
  // An order labelled before multi-label support keeps its one number only in the old column.
  const legacy = (q.labelTrackingNumber ?? "").trim();
  if (legacy && !out.has(legacy)) out.set(legacy, { carrier: carrierOfLabel(q.labelCarrier), trackingNumber: legacy, labelId: null });
  return [...out.values()];
}

/** Makes the tracking rows match the quotation's numbers (adds missing ones, drops numbers it no longer has) and returns them. */
export async function ensureTrackers(organizationId: string, quotationId: string): Promise<TrackingRow[]> {
  const wanted = await wantedFor(organizationId, quotationId);
  const have = await db
    .select()
    .from(purchasingTracking)
    .where(and(eq(purchasingTracking.organizationId, organizationId), eq(purchasingTracking.quotationId, quotationId)));
  const haveNumbers = new Set(have.map((r) => r.trackingNumber));
  for (const w of wanted) {
    if (haveNumbers.has(w.trackingNumber)) continue;
    await db
      .insert(purchasingTracking)
      .values({ id: newId("ptrack"), organizationId, quotationId, labelId: w.labelId, carrier: w.carrier, trackingNumber: w.trackingNumber })
      .onConflictDoNothing();
  }
  const keep = wanted.map((w) => w.trackingNumber);
  if (have.some((r) => !keep.includes(r.trackingNumber))) {
    await db
      .delete(purchasingTracking)
      .where(and(eq(purchasingTracking.organizationId, organizationId), eq(purchasingTracking.quotationId, quotationId), keep.length ? notInArray(purchasingTracking.trackingNumber, keep) : sql`1=1`));
  }
  const rows = await db
    .select()
    .from(purchasingTracking)
    .where(and(eq(purchasingTracking.organizationId, organizationId), eq(purchasingTracking.quotationId, quotationId)))
    .orderBy(asc(purchasingTracking.createdAt), asc(purchasingTracking.trackingNumber));
  if (wanted.length === 0) await rollUpQuotation(organizationId, quotationId);
  return rows;
}

/** Recomputes the quotation's package status, last update and delivered time from its tracked boxes. */
export async function rollUpQuotation(organizationId: string, quotationId: string): Promise<void> {
  const rows = await db
    .select({ status: purchasingTracking.status, deliveredAt: purchasingTracking.deliveredAt, statusAt: purchasingTracking.statusAt, lastCheckedAt: purchasingTracking.lastCheckedAt })
    .from(purchasingTracking)
    .where(and(eq(purchasingTracking.organizationId, organizationId), eq(purchasingTracking.quotationId, quotationId)));
  // Boxes Shippo has never answered for yet say nothing, so they don't overwrite a status a person typed.
  const known = rows.filter((r) => r.lastCheckedAt);
  const r = rollUp(known);
  if (!r || r.status === "Unknown") return;
  await db
    .update(purchasingQuotations)
    .set({ packageStatus: r.status, lastTrackingUpdate: r.lastUpdate, deliveredAt: r.status === "Delivered" ? r.deliveredAt : null })
    .where(and(eq(purchasingQuotations.id, quotationId), eq(purchasingQuotations.organizationId, organizationId)));
}

async function saveParsed(row: Pick<TrackingRow, "id" | "organizationId" | "quotationId">, t: ParsedTrack): Promise<void> {
  await db
    .update(purchasingTracking)
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
    .where(eq(purchasingTracking.id, row.id));
  await rollUpQuotation(row.organizationId, row.quotationId);
}

async function markError(row: TrackingRow, message: string): Promise<void> {
  await db.update(purchasingTracking).set({ lastError: message.slice(0, 300), lastCheckedAt: nowStamp(), updatedAt: sql`(current_timestamp)` }).where(eq(purchasingTracking.id, row.id));
}

/** Asks Shippo about one box now, with that company's own Shippo account. Never throws: a problem is kept on the row and shown in the details. */
export async function refreshTracker(row: TrackingRow, client?: ShippoClient): Promise<boolean> {
  let shippo = client;
  if (!shippo) {
    const access = await resolveShippo(row.organizationId);
    if (!access.ok) {
      await markError(row, access.reason === "not_connected" ? "Live tracking isn't connected yet. An owner or admin can connect Shippo in Purchasing → Settings → Connectors." : access.message);
      return false;
    }
    shippo = access.client;
  }
  const carrier = shippoCarrier(row.carrier);
  if (!carrier) {
    await markError(row, "This carrier can't be tracked automatically. Choose UPS, USPS or FedEx.");
    return false;
  }
  try {
    let body: unknown;
    try {
      body = await shippo.getTrack(carrier, row.trackingNumber);
    } catch (e) {
      // A refused token is not "package not followed yet" -- stop and say so.
      if (e instanceof ShippoRequestError && (e.status === 401 || e.status === 403)) throw e;
      // Shippo hasn't been told to follow this package yet.
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

/** Makes sure a quotation's boxes are tracked and refreshes any that are due. Used when someone opens or refreshes the order. */
export async function syncQuotationTracking(organizationId: string, quotationId: string, opts: { force?: boolean } = {}): Promise<TrackingRow[]> {
  let rows = await ensureTrackers(organizationId, quotationId);
  const due = rows.filter((r) => (opts.force ? !isFinished(r.status) || !r.lastCheckedAt : isStale(r))).slice(0, 8);
  if (due.length === 0) return rows;
  const access = await resolveShippo(organizationId);
  await Promise.all(due.map((r) => refreshTracker(r, access.ok ? access.client : undefined)));
  rows = await db
    .select()
    .from(purchasingTracking)
    .where(and(eq(purchasingTracking.organizationId, organizationId), eq(purchasingTracking.quotationId, quotationId)))
    .orderBy(asc(purchasingTracking.createdAt), asc(purchasingTracking.trackingNumber));
  return rows;
}

/** Best effort, used after a label is bought or a tracking number is typed: start following the package. Never throws. */
export async function startTracking(organizationId: string, quotationId: string): Promise<void> {
  try {
    await syncQuotationTracking(organizationId, quotationId, { force: true });
  } catch {
    // The label or the edit already succeeded; tracking will catch up on the next refresh.
  }
}

/**
 * A "track updated" message from Shippo. Matches by tracking number (unique across carriers in practice).
 * When the message arrived on a company's own address, only that company's packages can change.
 */
export async function applyWebhook(payload: unknown, organizationId: string | null = null): Promise<{ updated: number }> {
  const p = payload as { event?: string; data?: unknown } | null;
  if (!p || p.event !== "track_updated") return { updated: 0 };
  const parsed = parseTrack(p.data);
  if (!parsed) return { updated: 0 };
  const rows = await db
    .select()
    .from(purchasingTracking)
    .where(organizationId ? and(eq(purchasingTracking.trackingNumber, parsed.trackingNumber), eq(purchasingTracking.organizationId, organizationId)) : eq(purchasingTracking.trackingNumber, parsed.trackingNumber));
  for (const r of rows) await saveParsed(r, parsed);
  // The same package may also be a box of a shipment in Shipping.
  const shipped = await applyShipmentWebhook(payload, organizationId);
  return { updated: rows.length + shipped.updated };
}

/** Nightly sweep: start tracking quotations that have a number but no rows, and refresh everything still moving. */
export async function sweepTracking(limit = 150): Promise<{ added: number; refreshed: number }> {
  const untracked = await db
    .select({ id: purchasingQuotations.id, organizationId: purchasingQuotations.organizationId })
    .from(purchasingQuotations)
    .where(
      and(
        isNull(purchasingQuotations.archivedAt),
        or(sql`${purchasingQuotations.trackingNumber} is not null and ${purchasingQuotations.trackingNumber} <> ''`, sql`${purchasingQuotations.labelTrackingNumber} is not null and ${purchasingQuotations.labelTrackingNumber} <> ''`),
        ne(purchasingQuotations.packageStatus, "Delivered"),
        sql`not exists (select 1 from purchasing_tracking t where t.quotation_id = ${purchasingQuotations.id})`,
      ),
    )
    .limit(50);
  let added = 0;
  for (const q of untracked) {
    await ensureTrackers(q.organizationId, q.id);
    added++;
  }
  const active = await db
    .select()
    .from(purchasingTracking)
    .where(notInArray(purchasingTracking.status, ["Delivered", "Returned"]))
    .orderBy(asc(purchasingTracking.lastCheckedAt))
    .limit(limit);
  // Each company is followed through its own Shippo account; a company with none is skipped quietly.
  const clients = new Map<string, ShippoClient | null>();
  for (const orgId of new Set(active.map((r) => r.organizationId))) {
    const access = await resolveShippo(orgId);
    clients.set(orgId, access.ok ? access.client : null);
  }
  const usable = active.filter((r) => clients.get(r.organizationId));
  let refreshed = 0;
  for (let i = 0; i < usable.length; i += 5) {
    const results = await Promise.all(usable.slice(i, i + 5).map((r) => refreshTracker(r, clients.get(r.organizationId)!)));
    refreshed += results.filter(Boolean).length;
  }
  // Boxes of Shipping's shipments are followed the same way.
  const shipped = await sweepShipmentTracking(limit);
  return { added, refreshed: refreshed + shipped.refreshed };
}

/** The address a company's tracking notifications go to: its own, or the platform's for companies on the platform's account. */
function webhookAddress(origin: string, organizationId: string, source: "company" | "platform"): string {
  return source === "platform" ? webhookUrl(origin) : webhookUrlFor(origin, organizationId);
}

/** Is our "package moved" notification registered in this company's Shippo account? */
export async function liveTrackingState(organizationId: string, origin: string): Promise<{ configured: boolean; on: boolean; error?: string }> {
  const access = await resolveShippo(organizationId);
  if (!access.ok) return { configured: false, on: false };
  try {
    const hooks = await access.client.listWebhooks();
    const url = webhookAddress(origin, organizationId, access.source);
    return { configured: true, on: hooks.some((h) => h.event === "track_updated" && h.url === url && h.active !== false) };
  } catch (e) {
    await noteShippoFailure(organizationId, e);
    return { configured: true, on: false, error: e instanceof Error ? e.message.replace(/^Shippo request failed:\s*/, "") : "Couldn't reach Shippo." };
  }
}

/** Registers our notification in this company's Shippo account (once). */
export async function turnOnLiveTracking(organizationId: string, origin: string): Promise<{ ok: boolean; error?: string }> {
  const access = await resolveShippo(organizationId);
  if (!access.ok) return { ok: false, error: access.reason === "not_connected" ? NOT_CONNECTED_MESSAGE : access.message };
  try {
    const url = webhookAddress(origin, organizationId, access.source);
    const hooks = await access.client.listWebhooks();
    let hook = hooks.find((h) => h.event === "track_updated" && h.url === url && h.active !== false);
    if (!hook) hook = await access.client.createWebhook(url);
    if (access.source === "company") {
      await db.update(shippoConnections).set({ webhookId: hook.object_id }).where(eq(shippoConnections.organizationId, organizationId));
    }
    return { ok: true };
  } catch (e) {
    await noteShippoFailure(organizationId, e);
    return { ok: false, error: e instanceof Error ? e.message.replace(/^Shippo request failed:\s*/, "") : "Couldn't reach Shippo." };
  }
}

export async function trackingForQuotations(organizationId: string, quotationIds: string[]): Promise<TrackingRow[]> {
  if (quotationIds.length === 0) return [];
  return db
    .select()
    .from(purchasingTracking)
    .where(and(eq(purchasingTracking.organizationId, organizationId), inArray(purchasingTracking.quotationId, quotationIds)))
    .orderBy(asc(purchasingTracking.createdAt), asc(purchasingTracking.trackingNumber));
}
