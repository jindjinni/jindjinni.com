// The Serial Numbers register: every serial number a receiving agent recorded in Step 6 (typed, read from a group photo,
// or scanned), with the product, lot, NDC, condition, expiration and shipment it belongs to. Only submitted shipments
// appear, the same rule as Received Items and Daily Receiving. Read-only; nothing here changes what agents enter.
// The Inventory department will draw its unit-level records from this.

import { and, desc, eq, like, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { purchasingQuotations, receivingIntakeLogs, receivingItemSerials, receivingItems, receivingPackages, users } from "@/db/schema";
import { FLAG_LABELS, flagsFromString, severityOf, type SerialFlag } from "@/lib/receiving-serial-rules";

export type SerialRegisterRow = {
  id: string;
  packageId: string;
  /** YYYY-MM-DD, the day the package was received. */
  day: string;
  receivedAt: string | null;
  serial: string;
  lot: string | null;
  productName: string;
  ndc: string | null;
  condition: string | null;
  expiration: string | null;
  orderNumber: string;
  customer: string;
  receivedBy: string | null;
  source: "SCANNER" | "CAMERA" | "PHOTO" | "TYPED";
  flags: SerialFlag[];
  note: string | null;
};

export type SerialRegisterFilter = { q?: string; from?: string; to?: string; flaggedOnly?: boolean; limit?: number; offset?: number };

export const SOURCE_LABELS: Record<SerialRegisterRow["source"], string> = { SCANNER: "Scanner", CAMERA: "Camera", PHOTO: "Group photo", TYPED: "Typed" };

/** Plain-language check result for one serial. */
export function checkLabel(flags: SerialFlag[]): { text: string; tone: "ok" | "warn" | "stop" } {
  const tone = severityOf(flags);
  if (flags.length === 0) return { text: "OK", tone: "ok" };
  return { text: flags.map((f) => FLAG_LABELS[f] ?? f).join(", "), tone };
}

const isDay = (v: string | undefined) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

export async function getSerialRegister(organizationId: string, f: SerialRegisterFilter = {}): Promise<{ rows: SerialRegisterRow[]; total: number; flagged: number }> {
  const receivedAtExpr = sql<string | null>`coalesce(${receivingIntakeLogs.receivedAt}, ${receivingPackages.receivedAt})`;
  const conds = [eq(receivingItemSerials.organizationId, organizationId), sql`${receivingItemSerials.serialNorm} is not null`];
  const term = (f.q ?? "").trim().replace(/[%_\\]/g, "").toLowerCase();
  if (term) {
    const pat = `%${term}%`;
    conds.push(
      or(
        like(sql`lower(coalesce(${receivingItemSerials.serial}, ''))`, pat),
        like(sql`lower(coalesce(${receivingItemSerials.lot}, ${receivingItems.lotNumber}, ''))`, pat),
        like(sql`lower(${receivingItems.productName})`, pat),
        like(sql`lower(coalesce(${receivingItems.ndc}, ''))`, pat),
        like(sql`lower(${purchasingQuotations.quotationNumber})`, pat),
        like(sql`lower(coalesce(${receivingIntakeLogs.receivedFrom}, ''))`, pat),
      )!,
    );
  }
  if (isDay(f.from)) conds.push(sql`substr(${receivedAtExpr}, 1, 10) >= ${f.from}`);
  if (isDay(f.to)) conds.push(sql`substr(${receivedAtExpr}, 1, 10) <= ${f.to}`);
  if (f.flaggedOnly) conds.push(sql`${receivingItemSerials.flag} <> 'OK'`);

  const base = db
    .select({
      id: receivingItemSerials.id,
      packageId: receivingItemSerials.packageId,
      receivedAt: receivedAtExpr,
      serial: receivingItemSerials.serial,
      lot: sql<string | null>`coalesce(nullif(${receivingItemSerials.lot}, ''), ${receivingItems.lotNumber})`,
      productName: receivingItems.productName,
      ndc: receivingItems.ndc,
      condition: receivingItems.condition,
      expiration: sql<string | null>`coalesce(nullif(${receivingItemSerials.expiry}, ''), ${receivingItems.expirationDate})`,
      orderNumber: purchasingQuotations.quotationNumber,
      customer: receivingIntakeLogs.receivedFrom,
      receivedBy: sql<string | null>`coalesce(${users.name}, ${users.email})`,
      source: receivingItemSerials.source,
      flag: receivingItemSerials.flag,
      note: receivingItemSerials.flagNote,
    })
    .from(receivingItemSerials)
    .innerJoin(receivingItems, eq(receivingItems.id, receivingItemSerials.itemId))
    .innerJoin(receivingPackages, eq(receivingPackages.id, receivingItemSerials.packageId))
    .innerJoin(receivingIntakeLogs, eq(receivingIntakeLogs.packageId, receivingPackages.id))
    .innerJoin(purchasingQuotations, eq(purchasingQuotations.id, receivingPackages.quotationId))
    .leftJoin(users, sql`${users.id} = coalesce(${receivingIntakeLogs.receivedByUserId}, ${receivingPackages.receivedByUserId})`)
    .where(and(...conds));

  const rows = await base
    .orderBy(desc(receivedAtExpr), desc(receivingItemSerials.scannedAt))
    .limit(Math.min(Math.max(f.limit ?? 100, 1), 20000))
    .offset(Math.max(f.offset ?? 0, 0));

  const countBase = db
    .select({ n: sql<number>`count(*)`, flagged: sql<number>`coalesce(sum(case when ${receivingItemSerials.flag} <> 'OK' then 1 else 0 end), 0)` })
    .from(receivingItemSerials)
    .innerJoin(receivingItems, eq(receivingItems.id, receivingItemSerials.itemId))
    .innerJoin(receivingPackages, eq(receivingPackages.id, receivingItemSerials.packageId))
    .innerJoin(receivingIntakeLogs, eq(receivingIntakeLogs.packageId, receivingPackages.id))
    .innerJoin(purchasingQuotations, eq(purchasingQuotations.id, receivingPackages.quotationId))
    .where(and(...conds));
  const [agg] = await countBase;

  return {
    rows: rows.map((r) => ({
      id: r.id,
      packageId: r.packageId,
      day: (r.receivedAt ?? "").slice(0, 10),
      receivedAt: r.receivedAt,
      serial: r.serial ?? "",
      lot: r.lot,
      productName: r.productName,
      ndc: r.ndc,
      condition: r.condition,
      expiration: r.expiration,
      orderNumber: r.orderNumber,
      customer: r.customer,
      receivedBy: r.receivedBy,
      source: r.source,
      flags: flagsFromString(r.flag),
      note: r.note,
    })),
    total: Number(agg?.n ?? 0),
    flagged: Number(agg?.flagged ?? 0),
  };
}
