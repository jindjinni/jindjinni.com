// Thin wrapper around Shippo's REST API, called server-side with a company's OWN Shippo token.
//
// Every company connects its own Shippo account (Purchasing -> Settings -> Connectors, see lib/shippo-connection.ts), so labels are
// bought from, billed to and tracked in that company's account. Nothing here reads a key from the environment: the
// caller passes the key it resolved for the signed-in company, so one company's key can never be used for another.
//
// Shippo issues a Live Token ("shippo_live_...") and a Test Token ("shippo_test_..."). A test token makes every call
// below run in Shippo's test mode: fake rates and a fake, non-billing label.

// SHIPPO_API_BASE is only ever set by the automated tests (a local stand-in server), never in production.
const SHIPPO_API_BASE = process.env.SHIPPO_API_BASE || "https://api.goshippo.com";

/** Whether a pasted token looks like a Shippo token at all (so a typo is caught before we call Shippo). */
export function looksLikeShippoToken(token: string): boolean {
  return /^shippo_(live|test)_[A-Za-z0-9]{12,}$/.test(token.trim());
}

/** A test token only ever sees Shippo's test data; its webhooks must be test webhooks. */
export const isShippoTestKey = (key: string) => /^shippo_test_/i.test(key);

export class ShippoRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(`Shippo request failed: ${message}`);
    this.name = "ShippoRequestError";
  }
}

async function shippoFetch(key: string, path: string, init: RequestInit) {
  const res = await fetch(`${SHIPPO_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `ShippoToken ${key}`,
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
    throw new ShippoRequestError(message, res.status);
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

export type ShippoTransaction = {
  object_id: string;
  status: string;
  label_url?: string;
  tracking_number?: string;
  tracking_url_provider?: string;
  messages?: { source?: string; text?: string }[];
};

export type ShippoWebhook = { object_id: string; event: string; url: string; active?: boolean; is_test?: boolean };
export type ShippoCarrierAccount = { object_id?: string; carrier: string; active?: boolean };

export type CreateShipmentParams = {
  addressFrom: ShippoAddress;
  addressTo: ShippoAddress;
  // Shippo defaults an undeliverable parcel's return address to addressFrom if this is left unset. Pass it explicitly
  // wherever the caller wants to pin that down -- e.g. Purchasing always wants the customer (addressFrom there) to be
  // the return address, regardless of which address Shippo treats as "from".
  addressReturn?: ShippoAddress;
  parcel: { lengthIn: number; widthIn: number; heightIn: number; weightLb: number };
};

/** Every Shippo call, bound to one company's token. */
export function shippoClient(key: string) {
  return {
    key,

    /** Creates a shipment and returns it with rates computed synchronously. */
    createShipment: (params: CreateShipmentParams): Promise<ShippoShipment> =>
      shippoFetch(key, "/shipments/", {
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
      }),

    /** Purchases the label for a previously-quoted rate. This is a real charge against the company's Shippo account in live mode. */
    createTransaction: (rateId: string): Promise<ShippoTransaction> =>
      shippoFetch(key, "/transactions/", {
        method: "POST",
        body: JSON.stringify({ rate: rateId, label_file_type: "PDF", async: false }),
      }),

    /** Shippo's current tracking for one package (carrier is "ups", "usps" or "fedex"). Throws a "Shippo request failed" error when it isn't known yet. */
    getTrack: (carrier: string, trackingNumber: string) =>
      shippoFetch(key, `/tracks/${encodeURIComponent(carrier)}/${encodeURIComponent(trackingNumber)}`, { method: "GET" }),

    /** Asks Shippo to start following a package (so it sends us updates) and returns its current tracking. */
    registerTrack: (carrier: string, trackingNumber: string) =>
      shippoFetch(key, "/tracks/", { method: "POST", body: JSON.stringify({ carrier, tracking_number: trackingNumber }) }),

    listWebhooks: async (): Promise<ShippoWebhook[]> => {
      const body = await shippoFetch(key, "/webhooks/", { method: "GET" });
      return Array.isArray(body?.results) ? body.results : [];
    },

    createWebhook: (url: string): Promise<ShippoWebhook> =>
      shippoFetch(key, "/webhooks/", { method: "POST", body: JSON.stringify({ event: "track_updated", url, is_test: isShippoTestKey(key) }) }),

    deleteWebhook: async (webhookId: string): Promise<void> => {
      await shippoFetch(key, `/webhooks/${encodeURIComponent(webhookId)}`, { method: "DELETE" });
    },

    /** The carriers on the account. Also the cheapest way to prove a token is genuine: a wrong one is refused with 401. */
    listCarrierAccounts: async (): Promise<ShippoCarrierAccount[]> => {
      const body = await shippoFetch(key, "/carrier_accounts/?results=100", { method: "GET" });
      return Array.isArray(body?.results) ? body.results : [];
    },
  };
}

export type ShippoClient = ReturnType<typeof shippoClient>;

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
