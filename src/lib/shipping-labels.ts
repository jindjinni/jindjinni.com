// Buying several shipping labels for one quotation (a customer who needs 5 or
// 6 boxes sent in). Pure orchestration -- the Shippo calls are passed in so
// the rules (how many, partial failure, numbering) can be tested without
// spending money.
import type { ShippoAddress, ShippoRate, ShippoShipment, ShippoTransaction } from "@/lib/shippo";

// The two services we buy: UPS Ground (default) and USPS Priority Mail (the
// only USPS service we ever use). "USPS_GROUND" only exists on labels bought
// before Priority Mail became the rule -- it is shown, never chosen.
export type LabelCarrier = "UPS_GROUND" | "USPS_PRIORITY";
export type StoredLabelCarrier = LabelCarrier | "USPS_GROUND";

export const MAX_LABELS_PER_ORDER = 10;
const BATCH_SIZE = 5; // how many labels are bought at the same time

export const CARRIER_NAME: Record<StoredLabelCarrier, string> = {
  UPS_GROUND: "UPS Ground",
  USPS_PRIORITY: "USPS Priority Mail",
  USPS_GROUND: "USPS Ground (older label)",
};

/** Whatever was asked for, narrowed to a service we buy. The old USPS Ground choice becomes Priority Mail. */
export function parseCarrier(raw: unknown, fallback: StoredLabelCarrier = "UPS_GROUND"): LabelCarrier {
  const pick = raw === "UPS_GROUND" || raw === "USPS_PRIORITY" || raw === "USPS_GROUND" ? raw : fallback;
  return pick === "UPS_GROUND" ? "UPS_GROUND" : "USPS_PRIORITY";
}

/** "How many labels?" -- a whole number from 1 to 10; anything else is an error message, not a guess. */
export function parseLabelCount(raw: unknown): { count: number } | { error: string } {
  const text = String(raw ?? "").trim();
  if (text === "") return { count: 1 };
  const n = Number(text);
  if (!Number.isInteger(n) || n < 1) return { error: "How many labels must be a whole number, 1 or more." };
  if (n > MAX_LABELS_PER_ORDER) {
    return { error: `You can create up to ${MAX_LABELS_PER_ORDER} labels at a time. For more, create them in two rounds.` };
  }
  return { count: n };
}

export type BoughtLabel = {
  shipmentId: string;
  rateId: string;
  transactionId: string;
  labelUrl: string;
  trackingNumber: string | null;
  trackingUrl: string | null;
};

export type ShippoDeps = {
  createShipment: (p: {
    addressFrom: ShippoAddress;
    addressTo: ShippoAddress;
    addressReturn?: ShippoAddress;
    parcel: { lengthIn: number; widthIn: number; heightIn: number; weightLb: number };
  }) => Promise<ShippoShipment>;
  pickRate: (s: ShippoShipment, service: LabelCarrier) => ShippoRate | null;
  createTransaction: (rateId: string) => Promise<ShippoTransaction>;
};

/** Buys one label: its own shipment, its own rate, its own tracking number. */
async function buyOne(
  deps: ShippoDeps,
  carrier: LabelCarrier,
  base: Parameters<ShippoDeps["createShipment"]>[0],
): Promise<BoughtLabel> {
  const shipment = await deps.createShipment(base);
  const rate = deps.pickRate(shipment, carrier);
  if (!rate) {
    throw new Error(
      `No ${CARRIER_NAME[carrier]} rate was returned for this address.` +
        (carrier === "USPS_PRIORITY" ? " (Check that USPS is turned on in your Shippo carrier settings.)" : ""),
    );
  }
  const tx = await deps.createTransaction(rate.object_id);
  if (tx.status !== "SUCCESS" || !tx.label_url) {
    throw new Error(tx.messages?.map((m) => m.text).filter(Boolean).join("; ") || "Label purchase did not succeed.");
  }
  return {
    shipmentId: shipment.object_id,
    rateId: rate.object_id,
    transactionId: tx.object_id,
    labelUrl: tx.label_url,
    trackingNumber: tx.tracking_number ?? null,
    trackingUrl: tx.tracking_url_provider ?? null,
  };
}

/**
 * Buys `count` labels (a few at a time so the page stays fast). Whatever
 * succeeded is returned even if some failed, so a label that was paid for is
 * never lost -- the caller saves those and reports the rest.
 */
export async function buyLabels(
  deps: ShippoDeps,
  carrier: LabelCarrier,
  count: number,
  base: Parameters<ShippoDeps["createShipment"]>[0],
): Promise<{ labels: BoughtLabel[]; errors: string[] }> {
  const labels: BoughtLabel[] = [];
  const errors: string[] = [];
  for (let start = 0; start < count; start += BATCH_SIZE) {
    const size = Math.min(BATCH_SIZE, count - start);
    const results = await Promise.allSettled(Array.from({ length: size }, () => buyOne(deps, carrier, base)));
    for (const r of results) {
      if (r.status === "fulfilled") labels.push(r.value);
      else errors.push(r.reason instanceof Error ? r.reason.message : "Label generation failed.");
    }
  }
  return { labels, errors };
}

/** One readable line for the agent when only some of the labels could be made. */
export function failureMessage(asked: number, made: number, errors: string[]): string {
  const unique = [...new Set(errors)].join(" ");
  if (made === 0) return unique || "Label generation failed.";
  return `${made} of ${asked} labels were created and saved. ${asked - made} could not be made: ${unique} Press the button again to create the remaining ${asked - made}.`;
}

/** The text an agent pastes to the customer: one tracking link per label. */
export function trackingMessage(labels: { labelNumber: number; trackingUrl: string | null; trackingNumber: string | null }[]): string {
  const lines = labels
    .map((l) => {
      const what = l.trackingUrl ?? l.trackingNumber;
      return what ? (labels.length > 1 ? `Label ${l.labelNumber}: ${what}` : what) : null;
    })
    .filter((x): x is string => !!x);
  return lines.join("\n");
}
