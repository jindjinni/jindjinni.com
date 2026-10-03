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

const SHIPPO_API_BASE = "https://api.goshippo.com";

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
  parcel: { lengthIn: number; widthIn: number; heightIn: number; weightLb: number };
}): Promise<ShippoShipment> {
  return shippoFetch("/shipments/", {
    method: "POST",
    body: JSON.stringify({
      address_from: toShippoAddress(params.addressFrom),
      address_to: toShippoAddress(params.addressTo),
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

/** Finds the UPS Ground or USPS Ground Advantage rate among a shipment's quoted rates. */
export function pickGroundRate(
  shipment: ShippoShipment,
  service: "UPS_GROUND" | "USPS_GROUND",
): ShippoRate | null {
  const provider = service === "UPS_GROUND" ? "UPS" : "USPS";
  const candidates = shipment.rates.filter((r) => r.provider.toUpperCase() === provider);
  const ground = candidates.find((r) =>
    /ground/i.test(r.servicelevel?.name ?? r.servicelevel?.token ?? ""),
  );
  return ground ?? candidates[0] ?? null;
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
