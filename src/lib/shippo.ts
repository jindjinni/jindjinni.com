// Thin wrapper around Shippo's REST API for the deployed app to call
// directly, server-side, with its own API key.
//
// Important distinction (learned the hard way with Turso/Vercel earlier in
// this project): an MCP connector used in chat authenticates that chat
// session only -- it is not reachable from the deployed Next.js app at
// runtime. For "Generate shipping label" to work in production, the app
// needs its own SHIPPO_API_KEY environment variable, set from a token
// copied out of the Shippo dashboard (Settings -> API), the same way
// DATABASE_URL/DATABASE_AUTH_TOKEN/AUTH_SECRET were wired up for Turso.
//
// Shippo issues both a Live Token and a Test Token. Using a Test Token here
// makes every call below run in Shippo's test mode -- it returns fake rates
// and a fake (non-billing, non-deliverable) label instead of a real one, so
// local development/testing never spends real money. Set the Live Token
// only in the production environment.

// SHIPPO_API_BASE is only ever set by the automated tests (a local stand-in server), never in production.
const SHIPPO_API_BASE = process.env.SHIPPO_API_BASE || "https://api.goshippo.com";

export class ShippoNotConfiguredError extends Error {
  constructor() {
    super("SHIPPO_API_KEY is not set.");
    this.name = "ShippoNotConfiguredError";
  }
}

function apiKey(): string {
  const key = process.env.SHIPPO_API_KEY;
  if (!key) throw new ShippoNotConfiguredError();
  return key;
}

export function isShippoConfigured() {
  return !!process.env.SHIPPO_API_KEY;
}

async function shippoFetch(path: string, init: RequestInit) {
  const res = await fetch(`${SHIPPO_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `ShippoToken ${apiKey()}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      body?.detail ||
      (Array.isArray(body?.messages) ? body.messages.map((m: { text?: string }) => m.text).join("; ") : null) ||
      res.statusText;
    throw new Error(`Shippo request failed: ${message}`);
  }
  return body;
}

export type ShippoAddress = {
  name: string;
  company?: string | null;
  street1: string;
  street2?: string | null;
  city: string;
  state: string;
  zip: string;
  country?: string;
  phone?: string | null;
  email?: string | null;
  isResidential?: boolean;
};

function toShippoAddress(a: ShippoAddress) {
  return {
    name: a.name,
    company: a.company || undefined,
    street1: a.street1,
    street2: a.street2 || undefined,
    city: a.city,
    state: a.state,
    zip: a.zip,
    country: a.country || "US",
    phone: a.phone || undefined,
    email: a.email || undefined,
    is_residential: a.isResidential,
  };
}

export type ShippoRate = {
  object_id: string;
  provider: string;
  amount: string;
  currency: string;
  servicelevel?: { name?: string; token?: string };
  estimated_days?: number;
};

export type ShippoShipment = {
  object_id: string;
  status: string;
  rates: ShippoRate[];
  messages?: { source?: string; text?: string }[];
};

/** Creates a shipment and returns it with rates computed synchronously. */
export async function createShipment(params: {
  addressFrom: ShippoAddress;
  addressTo: ShippoAddress;
  // Shippo defaults an undeliverable parcel's return address to
  // addressFrom if this is left unset. Pass it explicitly wherever the
  // caller wants to pin that down rather than rely on the default -- e.g.
  // Purchasing always wants the customer (addressFrom there) to be the
  // return address, regardless of which address Shippo treats as "from".
  addressReturn?: ShippoAddress;
  parcel: { lengthIn: number; widthIn: number; heightIn: number; weightLb: number };
}): Promise<ShippoShipment> {
  return shippoFetch("/shipments/", {
    method: "POST",
    body: JSON.stringify({
      address_from: toShippoAddress(params.addressFrom),
      address_to: toShippoAddress(params.addressTo),
      ...(params.addressReturn ? { address_return: toShippoAddress(params.addressReturn) } : {}),
      parcels: [
        {
          length: String(params.parcel.lengthIn),
          width: String(params.parcel.widthIn),
          height: String(params.parcel.heightIn),
          distance_unit: "in",
          weight: String(params.parcel.weightLb),
          mass_unit: "lb",
        },
      ],
      async: false,
    }),
  });
}

/**
 * Finds the one service we ever buy among a shipment's quoted rates:
 * UPS Ground, or USPS Priority Mail (never Ground Advantage, Priority Mail
 * Express or anything else). There is deliberately NO "closest match"
 * fallback -- if the exact service isn't offered, nothing is bought rather
 * than a different, possibly pricier, service.
 */
export function pickLabelRate(
  shipment: ShippoShipment,
  service: "UPS_GROUND" | "USPS_PRIORITY",
): ShippoRate | null {
  const provider = service === "UPS_GROUND" ? "UPS" : "USPS";
  const candidates = shipment.rates.filter((r) => r.provider.toUpperCase() === provider);
  if (service === "UPS_GROUND") {
    // Exactly "UPS Ground" -- not Ground Saver or any air service.
    return (
      candidates.find((r) => r.servicelevel?.token === "ups_ground") ??
      candidates.find((r) => /^ground$/i.test((r.servicelevel?.name ?? "").trim())) ??
      null
    );
  }
  return (
    candidates.find((r) => r.servicelevel?.token === "usps_priority") ??
    candidates.find((r) => /^priority mail$/i.test((r.servicelevel?.name ?? "").trim())) ??
    null
  );
}

export type ShippoTransaction = {
  object_id: string;
  status: string;
  label_url?: string;
  tracking_number?: string;
  tracking_url_provider?: string;
  messages?: { source?: string; text?: string }[];
};

/** Purchases the label for a previously-quoted rate. This is a real charge against the org's Shippo account in live mode. */
export async function createTransaction(rateId: string): Promise<ShippoTransaction> {
  return shippoFetch("/transactions/", {
    method: "POST",
    body: JSON.stringify({ rate: rateId, label_file_type: "PDF", async: false }),
  });
}

// --- Package tracking ---------------------------------------------------------------------------------------------

/** Shippo's current tracking for one package (carrier is "ups", "usps" or "fedex"). Throws a "Shippo request failed" error when it isn't known yet. */
export async function getTrack(carrier: string, trackingNumber: string) {
  return shippoFetch(`/tracks/${encodeURIComponent(carrier)}/${encodeURIComponent(trackingNumber)}`, { method: "GET" });
}

/** Asks Shippo to start following a package (so it sends us updates) and returns its current tracking. */
export async function registerTrack(carrier: string, trackingNumber: string) {
  return shippoFetch("/tracks/", { method: "POST", body: JSON.stringify({ carrier, tracking_number: trackingNumber }) });
}

export type ShippoWebhook = { object_id: string; event: string; url: string; active?: boolean; is_test?: boolean };

export async function listWebhooks(): Promise<ShippoWebhook[]> {
  const body = await shippoFetch("/webhooks/", { method: "GET" });
  return Array.isArray(body?.results) ? body.results : [];
}

export async function createWebhook(url: string, isTest: boolean): Promise<ShippoWebhook> {
  return shippoFetch("/webhooks/", { method: "POST", body: JSON.stringify({ event: "track_updated", url, is_test: isTest }) });
}

/** A test token only ever sees Shippo's test data; its webhooks must be test webhooks. */
export const isShippoTestKey = () => /^shippo_test_/i.test(process.env.SHIPPO_API_KEY ?? "");
