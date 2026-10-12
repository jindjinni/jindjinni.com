// What a package scanner or a person types into "find the order" at Receiving, turned into the tracking numbers it could mean.
// A USPS barcode often starts with 420 + the ZIP code (5 or 9 digits) before the real number ("420770029400111..."); labels store only the
// real number. Spaces and small letters are ignored. Pure (no database), so it can be tested.

export function trackingKeys(raw: string | null | undefined): string[] {
  const t = String(raw ?? "").replace(/[\s \-]+/g, "").toUpperCase();
  if (t.length < 2) return [];
  const keys = new Set<string>([t]);
  // 420 + ZIP5 or ZIP+4, then a USPS number (starts 91-95)
  const m = /^420(\d{5}|\d{9})((?:9[1-5])\d{18,24})$/.exec(t);
  if (m) keys.add(m[2]);
  // FedEx / UPS scanners sometimes prepend junk; a long digit string also matches by its last 12 or 15 digits
  if (/^\d{22,34}$/.test(t)) { keys.add(t.slice(-12)); keys.add(t.slice(-15)); }
  return [...keys];
}
