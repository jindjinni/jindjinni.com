// Reading and changing which operation sides (Wholesale, Distribution) a company runs. Every query is scoped by organizationId.
// The old three-way answer (organizations.operation_type) is kept in step on every change so older screens keep working.

import { and, count, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { documentTemplates, organizations, purchasingProducts, purchasingPurchaseOrders, purchasingQuotations, purchasingSuppliers, salesBuyers, shippoConnections } from "@/db/schema";
import { featureOn } from "@/lib/features";
import { logActivity } from "@/lib/hr-service";
import { type OperationType } from "@/lib/operation-type";
import {
  BOTH_SIDES,
  needsConfirmation,
  sidesFrom,
  sidesFromType,
  sidesLabel,
  turnOffBlocker,
  typeFromSides,
  validateSides,
  type OpenWork,
  type StepProgress,
  type Side,
  type Sides,
} from "@/lib/operations-rules";

export const OPERATIONS_FEATURE = "operations";

export type OpsOrg = { organizationId: string; userId: string };
export type Operations = { sides: Sides; confirmed: boolean; since: { wholesale: string | null; distribution: string | null }; chosenAt: string | null };

const columns = {
  operationType: organizations.operationType,
  wholesaleActiveAt: organizations.wholesaleActiveAt,
  distributionActiveAt: organizations.distributionActiveAt,
  operationsChosenAt: organizations.operationsChosenAt,
};

async function rowOf(organizationId: string) {
  const [row] = await db.select(columns).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  return row ?? null;
}

/** The company's sides as saved (ignoring the rollout switch). Used by the Operations page itself. */
export async function getOperations(organizationId: string): Promise<Operations> {
  const row = await rowOf(organizationId);
  return {
    sides: sidesFrom(row),
    confirmed: !needsConfirmation(row),
    since: { wholesale: row?.wholesaleActiveAt ?? null, distribution: row?.distributionActiveAt ?? null },
    chosenAt: row?.operationsChosenAt ?? null,
  };
}

/** Is the whole Operations feature on for this company (staged rollout)? */
export const operationsEnabled = (organizationId: string) => featureOn(OPERATIONS_FEATURE, organizationId);

/**
 * The sides every other page, menu and action should use. While the rollout switch is off for the company this is always both sides,
 * so nothing is hidden before the feature is switched on.
 */
export async function operationsOf(organizationId: string): Promise<Sides> {
  if (!(await operationsEnabled(organizationId))) return { ...BOTH_SIDES };
  return (await getOperations(organizationId)).sides;
}

export async function openWorkOf(organizationId: string): Promise<OpenWork> {
  const [q] = await db
    .select({ n: count() })
    .from(purchasingQuotations)
    .where(and(eq(purchasingQuotations.organizationId, organizationId), inArray(purchasingQuotations.status, ["QUOTED", "CONFIRMED"])));
  const [p] = await db
    .select({ n: count() })
    .from(purchasingPurchaseOrders)
    .where(and(eq(purchasingPurchaseOrders.organizationId, organizationId), inArray(purchasingPurchaseOrders.status, ["SENT", "CONFIRMED"])));
  return { openQuotations: Number(q?.n ?? 0), openPurchaseOrders: Number(p?.n ?? 0) };
}

type Result = { ok: true; message: string; sides: Sides } | { ok: false; error: string };

/**
 * Saves which sides are on. A side that is already on keeps its original day; a side switched off keeps all its records. Switching a
 * side off is refused with a plain reason while it has open work. Written to the activity log.
 */
export async function setSides(org: OpsOrg, wanted: Sides): Promise<Result> {
  const valid = validateSides(wanted);
  if (!valid.ok) return valid;
  const row = await rowOf(org.organizationId);
  if (!row) return { ok: false, error: "We couldn't find your company. Please sign in again." };
  const current = sidesFrom(row);

  const work = await openWorkOf(org.organizationId);
  for (const side of ["wholesale", "distribution"] as Side[]) {
    if (current[side] && !wanted[side]) {
      const why = turnOffBlocker(side, work);
      if (why) return { ok: false, error: why };
    }
  }

  const now = new Date().toISOString();
  const confirmedBefore = !needsConfirmation(row);
  const unchanged = confirmedBefore && current.wholesale === wanted.wholesale && current.distribution === wanted.distribution;
  if (unchanged) return { ok: true, message: "That is already how your company is set up.", sides: current };

  await db
    .update(organizations)
    .set({
      wholesaleActiveAt: wanted.wholesale ? (current.wholesale && row.wholesaleActiveAt ? row.wholesaleActiveAt : now) : null,
      distributionActiveAt: wanted.distribution ? (current.distribution && row.distributionActiveAt ? row.distributionActiveAt : now) : null,
      operationsChosenAt: now,
      operationsChosenBy: org.userId,
      operationType: typeFromSides(wanted),
      updatedAt: now,
    })
    .where(eq(organizations.id, org.organizationId));
  await logActivity(org, "OTHER", `Changed the company's operation sides from ${sidesLabel(current)} to ${sidesLabel(wanted)}`, { type: "organization", id: org.organizationId });
  return { ok: true, message: `Saved. Your company runs: ${sidesLabel(wanted)}.`, sides: wanted };
}

/**
 * The older Wholesaler / Distributor / Both answer (Settings -> Company profile, sign-up). Sets the sides to match and marks them chosen,
 * so the two ways of answering can never disagree. Not subject to the open-work check: the older screen never hid anything.
 */
export async function applyOperationType(org: OpsOrg, type: OperationType): Promise<void> {
  const s = sidesFromType(type);
  const row = await rowOf(org.organizationId);
  const now = new Date().toISOString();
  await db
    .update(organizations)
    .set({
      operationType: type,
      wholesaleActiveAt: s.wholesale ? row?.wholesaleActiveAt ?? now : null,
      distributionActiveAt: s.distribution ? row?.distributionActiveAt ?? now : null,
      operationsChosenAt: now,
      operationsChosenBy: org.userId,
      updatedAt: now,
    })
    .where(eq(organizations.id, org.organizationId));
}

/** Which first steps are done for this company (counts only; every query is scoped by organizationId). */
export async function stepProgressOf(organizationId: string): Promise<StepProgress> {
  const n = async (table: typeof purchasingProducts | typeof purchasingSuppliers | typeof salesBuyers | typeof purchasingQuotations | typeof purchasingPurchaseOrders | typeof shippoConnections) => {
    const [r] = await db.select({ c: count() }).from(table).where(eq(table.organizationId, organizationId));
    return Number(r?.c ?? 0) > 0;
  };
  const [shippo, products, quotation, supplier, buyers, po, poTemplate] = await Promise.all([
    n(shippoConnections),
    n(purchasingProducts),
    n(purchasingQuotations),
    n(purchasingSuppliers),
    n(salesBuyers),
    n(purchasingPurchaseOrders),
    db.select({ c: count() }).from(documentTemplates).where(and(eq(documentTemplates.organizationId, organizationId), eq(documentTemplates.docType, "PURCHASE_ORDER"), eq(documentTemplates.department, "purchasing"))).then((r) => Number(r[0]?.c ?? 0) > 0),
  ]);
  return { shippo, products, quotation, supplier, buyers, po, "po-look": poTemplate };
}
