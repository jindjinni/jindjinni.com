// Package tracking rules (pure, no database): turning what Shippo reports into our own words, rolling several boxes
// up into one status for the quotation, and the colors the status is shown in. Safe to import from the browser.

export const TRACKING_STATUSES = ["Pre-Transit", "In Transit", "Out for Delivery", "Delivered", "Exception", "Returned", "Unknown"] as const;
export type TrackingStatus = (typeof TRACKING_STATUSES)[number];
export const isTrackingStatus = (v: unknown): v is TrackingStatus => typeof v === "string" && (TRACKING_STATUSES as readonly string[]).includes(v);

export type TrackableCarrier = "UPS" | "USPS" | "FedEx";

/** Shippo's name for a carrier, or null when we can't track it there (Other). */
export function shippoCarrier(carrier: string | null | undefined): "ups" | "usps" | "fedex" | null {
  const c = (carrier ?? "").toLowerCase();
  return c === "ups" ? "ups" : c === "usps" ? "usps" : c === "fedex" ? "fedex" : null;
}
export function carrierFromShippo(token: string | null | undefined): "UPS" | "USPS" | "FedEx" | "Other" {
  const c = (token ?? "").toLowerCase();
  return c === "ups" ? "UPS" : c === "usps" ? "USPS" : c === "fedex" ? "FedEx" : "Other";
}
/** The carrier a purchased label belongs to. */
export const carrierOfLabel = (labelCarrier: string): "UPS" | "USPS" => (labelCarrier === "UPS_GROUND" ? "UPS" : "USPS");

/** Shippo's status (and its sub-status, for "out for delivery") in our words. */
export function mapShippoStatus(status: string | null | undefined, substatusCode?: string | null): TrackingStatus {
  switch ((status ?? "").toUpperCase()) {
    case "PRE_TRANSIT":
      return "Pre-Transit";
    case "TRANSIT":
      return /out_for_delivery/i.test(substatusCode ?? "") ? "Out for Delivery" : "In Transit";
    case "DELIVERED":
      return "Delivered";
    case "RETURNED":
      return "Returned";
    case "FAILURE":
      return "Exception";
    default:
      return "Unknown";
  }
}

/** "2026-10-05T14:22:00.000Z" (or with an offset) -> "2026-10-05 14:22:00" in UTC. Anything unreadable -> null. */
export function normalizeStamp(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace("T", " ");
}

export type TrackEvent = { status: TrackingStatus; details: string | null; at: string | null; location: string | null };

type ShippoLocation = { city?: string | null; state?: string | null; zip?: string | null; country?: string | null } | null | undefined;
type ShippoEvent = { status?: string; status_details?: string; status_date?: string; substatus?: { code?: string; text?: string } | null; location?: ShippoLocation };

export function locationText(l: ShippoLocation): string | null {
  if (!l) return null;
  const parts = [l.city, l.state].map((x) => (x ?? "").trim()).filter(Boolean);
  const out = parts.join(", ");
  return out || null;
}

const toEvent = (e: ShippoEvent): TrackEvent => ({
  status: mapShippoStatus(e.status, e.substatus?.code),
  details: (e.status_details ?? "").trim() || (e.substatus?.text ?? "").trim() || null,
  at: normalizeStamp(e.status_date),
  location: locationText(e.location),
});

export type ParsedTrack = {
  carrier: "UPS" | "USPS" | "FedEx" | "Other";
  trackingNumber: string;
  status: TrackingStatus;
  statusDetails: string | null;
  location: string | null;
  eta: string | null;
  statusAt: string | null;
  deliveredAt: string | null;
  history: TrackEvent[];
};

/** Reads a Shippo track (the answer to a tracking request, or the data inside a "track updated" webhook). */
export function parseTrack(body: unknown): ParsedTrack | null {
  const b = body as { carrier?: string; tracking_number?: string; eta?: string | null; tracking_status?: ShippoEvent | null; tracking_history?: ShippoEvent[] | null } | null;
  if (!b || typeof b.tracking_number !== "string" || !b.tracking_number.trim()) return null;
  const cur = b.tracking_status ? toEvent(b.tracking_status) : null;
  const history = (Array.isArray(b.tracking_history) ? b.tracking_history : []).map(toEvent);
  if (cur && !history.some((h) => h.at === cur.at && h.status === cur.status && h.details === cur.details)) history.push(cur);
  history.sort((a, c) => (c.at ?? "").localeCompare(a.at ?? ""));
  const status = cur?.status ?? "Unknown";
  return {
    carrier: carrierFromShippo(b.carrier),
    trackingNumber: b.tracking_number.trim(),
    status,
    statusDetails: cur?.details ?? null,
    location: cur?.location ?? null,
    eta: normalizeStamp(b.eta),
    statusAt: cur?.at ?? null,
    deliveredAt: status === "Delivered" ? (cur?.at ?? history.find((h) => h.status === "Delivered")?.at ?? null) : null,
    history,
  };
}

export type RollUpInput = { status: string; deliveredAt: string | null; statusAt: string | null };
export type RollUp = { status: TrackingStatus; deliveredAt: string | null; lastUpdate: string | null; delivered: number; total: number };

/**
 * One status for a quotation from its boxes. Everything delivered = Delivered (at the last box's delivery time);
 * any problem shows as Exception, then Returned; otherwise the furthest-behind box decides, except that a
 * partly delivered order reads In Transit.
 */
export function rollUp(rows: RollUpInput[]): RollUp | null {
  if (rows.length === 0) return null;
  const st = rows.map((r) => (isTrackingStatus(r.status) ? r.status : "Unknown"));
  const delivered = st.filter((s) => s === "Delivered").length;
  const lastUpdate = rows.map((r) => r.statusAt ?? "").sort().pop() || null;
  let status: TrackingStatus;
  if (delivered === rows.length) status = "Delivered";
  else if (st.includes("Exception")) status = "Exception";
  else if (st.includes("Returned")) status = "Returned";
  else if (delivered > 0) status = "In Transit";
  else if (st.includes("Unknown") && st.every((s) => s === "Unknown")) status = "Unknown";
  else if (st.includes("Pre-Transit")) status = "Pre-Transit";
  else if (st.includes("In Transit")) status = "In Transit";
  else if (st.includes("Out for Delivery")) status = "Out for Delivery";
  else status = "Unknown";
  const deliveredAt = status === "Delivered" ? (rows.map((r) => r.deliveredAt ?? r.statusAt ?? "").sort().pop() || null) : null;
  return { status, deliveredAt, lastUpdate, delivered, total: rows.length };
}

/** A box is finished (nothing more to learn) once it is delivered or returned. */
export const isFinished = (status: string) => status === "Delivered" || status === "Returned";

/** Colors for the status pill (all with dark-mode variants). */
export const STATUS_PILL: Record<TrackingStatus, string> = {
  "Pre-Transit": "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100",
  "In Transit": "bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-100",
  "Out for Delivery": "bg-indigo-100 text-indigo-900 dark:bg-indigo-900/40 dark:text-indigo-100",
  Delivered: "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-100",
  Exception: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-100",
  Returned: "bg-orange-100 text-orange-900 dark:bg-orange-900/40 dark:text-orange-100",
  Unknown: "bg-stone-200 text-stone-800 dark:bg-stone-800 dark:text-stone-100",
};
export const pillClass = (status: string) => STATUS_PILL[isTrackingStatus(status) ? status : "Unknown"];

/** How long a still-moving box may go without a check before the app asks Shippo again. */
export const STALE_AFTER_MS = 10 * 60 * 1000;
export function isStale(row: { status: string; lastCheckedAt: string | null }, now: number = Date.now()): boolean {
  if (isFinished(row.status)) return false;
  if (!row.lastCheckedAt) return true;
  const t = Date.parse(row.lastCheckedAt.replace(" ", "T") + "Z");
  return Number.isNaN(t) || now - t > STALE_AFTER_MS;
}

/** The carrier's own page for a package, for when we don't have the link Shippo gave. */
export function carrierTrackingLink(carrier: string, trackingNumber: string): string | null {
  const n = encodeURIComponent(trackingNumber);
  if (carrier === "UPS") return `https://www.ups.com/track?tracknum=${n}`;
  if (carrier === "USPS") return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${n}`;
  if (carrier === "FedEx") return `https://www.fedex.com/fedextrack/?trknbr=${n}`;
  return null;
}

/** Reads the history JSON stored on a tracking row. Never throws. */
export function parseHistory(json: string | null | undefined): TrackEvent[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? (v as TrackEvent[]).filter((e) => e && typeof e.status === "string") : [];
  } catch {
    return [];
  }
}
