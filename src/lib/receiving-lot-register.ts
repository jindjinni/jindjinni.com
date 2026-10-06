// The lot side of the Lot & Serial Tracker: every lot number entered in Step 6, one line per lot (a product received in
// two lots is two lines), with who sent it and when. Same rule as the other Receiving records: submitted shipments only.
// Read-only.

import { and, desc, eq, like, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { purchasingCategories, purchasingProducts, purchasingQuotations, receivingIntakeLines, receivingIntakeLogs, receivingPackages, users } from "@/db/schema";

export type LotRegisterRow = {
  id: string;
  packageId: string;
  day: string;
  receivedAt: string | null;
  lot: string;
  productName: string;
  /** The product's brand (Dexcom, Omnipod, ...); the tracker groups by it. */
  brand: string | null;
  ndc: string | null;
  condition: string | null;
  expiration: string | null;
  quantity: number;
  quantityAccepted: number | null;
  orderNumber: string;
  customer: string;
  customerEmail: string | null;
  customerPhone: string | null;
  receivedBy: string | null;
  recalled: boolean;
  recallName: string | null;
};

export type LotRegisterFilter = { q?: string; from?: string; to?: string; recalledOnly?: boolean; limit?: number; offset?: number };
const isDay = (v: string | undefined) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

export async function getLotRegister(organizationId: string, f: LotRegisterFilter = {}): Promise<{ rows: LotRegisterRow[]; total: number; recalled: number }> {
  const conds = [eq(receivingIntakeLines.organizationId, organizationId), sql`trim(coalesce(${receivingIntakeLines.lotNumber}, '')) <> ''`];
  const term = (f.q ?? "").trim().replace(/[%_\\]/g, "").toLowerCase();
  if (term) {
    const pat = `%${term}%`;
    conds.push(
      or(
        like(sql`lower(coalesce(${receivingIntakeLines.lotNumber}, ''))`, pat),
        like(sql`lower(${receivingIntakeLines.productName})`, pat),
        like(sql`lower(coalesce(${receivingIntakeLines.ndc}, ''))`, pat),
        like(sql`lower(${purchasingQuotations.quotationNumber})`, pat),
        like(sql`lower(coalesce(${receivingIntakeLines.receivedFrom}, ''))`, pat),
      )!,
    );
  }
  if (isDay(f.from)) conds.push(sql`substr(${receivingIntakeLines.receivedAt}, 1, 10) >= ${f.from}`);
  if (isDay(f.to)) conds.push(sql`substr(${receivingIntakeLines.receivedAt}, 1, 10) <= ${f.to}`);
  if (f.recalledOnly) conds.push(eq(receivingIntakeLines.recallStatus, "RECALLED"));

  const agentExpr = sql`coalesce(${receivingIntakeLines.receivedByUserId}, ${receivingIntakeLogs.receivedByUserId}, ${receivingPackages.receivedByUserId})`;
  const rows = await db
    .select({
      id: receivingIntakeLines.id,
      packageId: receivingPackages.id,
      receivedAt: receivingIntakeLines.receivedAt,
      lot: receivingIntakeLines.lotNumber,
      productName: receivingIntakeLines.productName,
      // same rule as Received Items: the brand saved with the line, else the catalog as it is now
      brand: sql<string | null>`coalesce(${receivingIntakeLines.brand}, ${purchasingCategories.name})`,
      ndc: receivingIntakeLines.ndc,
      condition: receivingIntakeLines.condition,
      expiration: sql<string | null>`coalesce(${receivingIntakeLines.expirationDate}, ${receivingIntakeLines.expirationEarliest})`,
      quantity: receivingIntakeLines.quantity,
      quantityAccepted: receivingIntakeLines.quantityAccepted,
      orderNumber: purchasingQuotations.quotationNumber,
      customer: receivingIntakeLines.receivedFrom,
      customerEmail: purchasingQuotations.customerEmailSnapshot,
      customerPhone: purchasingQuotations.customerPhoneSnapshot,
      receivedBy: sql<string | null>`coalesce(${users.name}, ${users.email})`,
      recallStatus: receivingIntakeLines.recallStatus,
      recallName: receivingIntakeLines.recallName,
    })
    .from(receivingIntakeLines)
    .innerJoin(receivingIntakeLogs, eq(receivingIntakeLogs.id, receivingIntakeLines.logId))
    .innerJoin(receivingPackages, eq(receivingPackages.id, receivingIntakeLogs.packageId))
    .innerJoin(purchasingQuotations, eq(purchasingQuotations.id, receivingPackages.quotationId))
    .leftJoin(users, sql`${users.id} = ${agentExpr}`)
    .leftJoin(purchasingProducts, eq(purchasingProducts.id, receivingIntakeLines.productId))
    .leftJoin(purchasingCategories, eq(purchasingCategories.id, purchasingProducts.categoryId))
    .where(and(...conds))
    .orderBy(desc(receivingIntakeLines.receivedAt), desc(receivingIntakeLines.createdAt))
    .limit(Math.min(Math.max(f.limit ?? 100, 1), 20000))
    .offset(Math.max(f.offset ?? 0, 0));

  const [agg] = await db
    .select({ n: sql<number>`count(*)`, recalled: sql<number>`coalesce(sum(case when ${receivingIntakeLines.recallStatus} = 'RECALLED' then 1 else 0 end), 0)` })
    .from(receivingIntakeLines)
    .innerJoin(receivingIntakeLogs, eq(receivingIntakeLogs.id, receivingIntakeLines.logId))
    .innerJoin(receivingPackages, eq(receivingPackages.id, receivingIntakeLogs.packageId))
    .innerJoin(purchasingQuotations, eq(purchasingQuotations.id, receivingPackages.quotationId))
    .where(and(...conds));

  return {
    rows: rows.map((r) => ({
      id: r.id,
      packageId: r.packageId,
      day: (r.receivedAt ?? "").slice(0, 10),
      receivedAt: r.receivedAt,
      lot: (r.lot ?? "").trim(),
      productName: r.productName,
      brand: r.brand,
      ndc: r.ndc,
      condition: r.condition,
      expiration: r.expiration,
      quantity: r.quantity,
      quantityAccepted: r.quantityAccepted,
      orderNumber: r.orderNumber,
      customer: r.customer ?? "",
      customerEmail: r.customerEmail,
      customerPhone: r.customerPhone,
      receivedBy: r.receivedBy,
      recalled: r.recallStatus === "RECALLED",
      recallName: r.recallName,
    })),
    total: Number(agg?.n ?? 0),
    recalled: Number(agg?.recalled ?? 0),
  };
}
