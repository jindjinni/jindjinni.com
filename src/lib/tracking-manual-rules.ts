// Adding a tracking number by hand (a label bought on another website, or Shippo being down). Pure rules, no database.
// Manager-only on the server; this file only decides what a typed number and carrier mean.

import { detectCarrier, normalizeTracking } from "@/lib/purchasing-quotation-import";

export const MANUAL_CARRIERS = ["UPS", "USPS", "FedEx", "Other"] as const;
export type ManualCarrier = (typeof MANUAL_CARRIERS)[number];

export type ManualTracking = { ok: true; trackingNumber: string; carrier: ManualCarrier } | { ok: false; error: string };

/**
 * A typed (or scanned) number: spaces are removed, letters made capital, and a scanned USPS barcode (420 + ZIP + number) is
 * reduced to the real tracking number. "auto" (or blank) picks the carrier from the shape of the number.
 */
export function readManualTracking(rawNumber: string | null | undefined, rawCarrier: string | null | undefined): ManualTracking {
  let n = normalizeTracking(rawNumber).replace(/-/g, "");
  if (!n) return { ok: false, error: "Type the tracking number." };
  const scanned = /^420\d{5}(9\d{19,25})$/.exec(n) ?? /^420\d{9}(9\d{19,25})$/.exec(n);
  if (scanned) n = scanned[1];
  if (!/^[A-Z0-9]+$/.test(n)) return { ok: false, error: "A tracking number has only letters and numbers." };
  if (n.length < 8 || n.length > 40) return { ok: false, error: "That doesn't look like a full tracking number. Check it and try again." };
  const c = (rawCarrier ?? "").trim();
  if (!c || c.toLowerCase() === "auto") return { ok: true, trackingNumber: n, carrier: detectCarrier(n) };
  const known = MANUAL_CARRIERS.find((k) => k.toLowerCase() === c.toLowerCase());
  if (!known) return { ok: false, error: "Choose UPS, USPS, FedEx or Other." };
  return { ok: true, trackingNumber: n, carrier: known };
}

export const cleanManualNote = (raw: string | null | undefined): string | null => {
  const t = (raw ?? "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
  return t || null;
};
