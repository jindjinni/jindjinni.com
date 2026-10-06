// The Daily Receiving summary: every line entered in Step 6 (once its shipment is submitted), combined by day.
// Lines of the same product, NDC, condition, lot and expiration are added together, so eight packages of ten
// "Dexcom G7 15 Day Sensor (STP-FT-012)" show as one row of 80. Pure functions: nothing here reads or writes the
// database, so the same numbers can feed the page, the CSV and, later, the Inventory department.
//
// What counts as stock: the ACCEPTED quantity (received minus returned). A line is held back, never counted as stock, when
// it is on a recall list, when the return decision is still pending, or when every unit is going back.

import { normalizeNumber } from "@/lib/receiving-recall";
import { groupByBrand } from "@/lib/receiving-brand";
import type { ReceivedItemRow } from "@/lib/receiving-queries";

export type HeldReason = "RECALLED" | "PENDING" | "ALL_RETURNED";

export type DailyGroup = {
  key: string;
  productName: string;
  brand: string | null;
  productCode: string | null;
  ndc: string | null;
  condition: string | null;
  lot: string | null;
  expiration: string | null;
  /** Units received on this day for this combination (accepted lines only). */
  received: number;
  returned: number;
  accepted: number;
  packages: number;
  lines: number;
  /** Serial numbers recorded for these units (each listed once). */
  serials: { serial: string; flagged: boolean }[];
};

export type HeldLine = {
  id: string;
  packageId: string;
  orderNumber: string;
  customer: string;
  productName: string;
  ndc: string | null;
  condition: string | null;
  lot: string | null;
  expiration: string | null;
  quantity: number;
  reason: HeldReason;
  detail: string | null;
};

export type DailyDay = {
  /** YYYY-MM-DD, the date the package was received. */
  day: string;
  shipments: number;
  lines: number;
  accepted: number;
  heldUnits: number;
  groups: DailyGroup[];
  /** The same product lines grouped under their brand (A to Z, "Other" last), each with its own totals. */
  brands: { key: string; brand: string; accepted: number; groups: DailyGroup[] }[];
  held: HeldLine[];
};

const clean = (v: string | null | undefined) => (v ?? "").trim();

export function heldReason(r: Pick<ReceivedItemRow, "recallStatus" | "quantityAccepted">): HeldReason | null {
  if (r.recallStatus === "RECALLED") return "RECALLED";
  if (r.quantityAccepted == null) return "PENDING";
  if (r.quantityAccepted <= 0) return "ALL_RETURNED";
  return null;
}

export const HELD_LABELS: Record<HeldReason, string> = {
  RECALLED: "Recalled: not stock",
  PENDING: "Return decision pending",
  ALL_RETURNED: "All units going back",
};

/** The day a line belongs to: the date part of "Date/Time Received" as the agent entered it. */
export function dayOf(receivedAt: string | null | undefined): string {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(clean(receivedAt));
  return m ? m[1] : "";
}

export function groupDaily(rows: ReceivedItemRow[], serialsByItem?: Map<string, { serial: string; flagged: boolean }[]>): DailyDay[] {
  const days = new Map<string, { groups: Map<string, DailyGroup & { pk: Set<string> }>; held: HeldLine[]; ships: Set<string>; lines: number }>();
  for (const r of rows) {
    const day = dayOf(r.receivedAt);
    if (!day) continue;
    let d = days.get(day);
    if (!d) days.set(day, (d = { groups: new Map(), held: [], ships: new Set(), lines: 0 }));
    d.ships.add(r.packageId);
    d.lines += 1;
    const expiration = clean(r.expirationDate) || clean(r.expirationEarliest) || null;
    const why = heldReason(r);
    if (why) {
      d.held.push({
        id: r.id,
        packageId: r.packageId,
        orderNumber: r.orderNumber,
        customer: r.customer,
        productName: r.productName,
        ndc: r.ndc,
        condition: r.condition,
        lot: clean(r.lotNumber) || null,
        expiration,
        quantity: r.quantity,
        reason: why,
        detail: why === "RECALLED" ? r.recallName : null,
      });
      continue;
    }
    const key = [clean(r.productName).toLowerCase(), normalizeNumber(clean(r.ndc)), clean(r.condition).toLowerCase(), normalizeNumber(clean(r.lotNumber)), expiration ?? ""].join("|");
    let g = d.groups.get(key);
    if (!g) {
      d.groups.set(
        key,
        (g = { key, productName: clean(r.productName), brand: r.brand, productCode: r.productCode, ndc: clean(r.ndc) || null, condition: clean(r.condition) || null, lot: clean(r.lotNumber) || null, expiration, received: 0, returned: 0, accepted: 0, packages: 0, lines: 0, serials: [], pk: new Set() }),
      );
    }
    for (const s of (r.sourceItemId && serialsByItem?.get(r.sourceItemId)) || []) {
      if (!g.serials.some((x) => x.serial.toLowerCase() === s.serial.toLowerCase())) g.serials.push(s);
    }
    const accepted = r.quantityAccepted ?? 0;
    g.received += r.quantity;
    g.accepted += accepted;
    g.returned += Math.max(0, r.quantity - accepted);
    g.lines += 1;
    g.pk.add(r.packageId);
    g.packages = g.pk.size;
  }
  return [...days.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([day, d]) => {
      const groups = [...d.groups.values()]
        .map((g) => {
          const { pk, ...rest } = g;
          void pk;
          return rest;
        })
        .sort((a, b) => a.productName.localeCompare(b.productName) || (a.expiration ?? "").localeCompare(b.expiration ?? "") || (a.lot ?? "").localeCompare(b.lot ?? ""));
      return {
        day,
        shipments: d.ships.size,
        lines: d.lines,
        accepted: groups.reduce((n, g) => n + g.accepted, 0),
        heldUnits: d.held.reduce((n, h) => n + h.quantity, 0),
        groups,
        brands: groupByBrand(groups, (g) => g.brand).map((b) => ({ key: b.key, brand: b.brand, accepted: b.rows.reduce((n, g) => n + g.accepted, 0), groups: b.rows })),
        held: d.held.sort((a, b) => a.productName.localeCompare(b.productName)),
      };
    });
}

/** "Monday, Oct 5, 2026" for a YYYY-MM-DD day (no time zone shift: the day is read as written). */
export function dayLabel(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  if (!y || !m || !d) return day;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}
