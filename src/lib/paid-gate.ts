import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { receivingAdjustments, receivingIntakeLines, receivingIntakeLogs, receivingItems, receivingPackagePhotos, receivingPackages } from "@/db/schema";
import { autoNeedToBePaid, paidBlocker, type PaidFacts } from "@/lib/paid-gate-rules";

type Pkg = { id: string; status: string; accountsDecision: string | null };

/** What the Paid check needs to know about a shipment, read fresh from the database. All of it is filtered by company. */
export async function loadPaidFacts(organizationId: string, p: Pkg) {
  const [recalled, pending, needsReturn, adj, receipt, pkg, finalAdj] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)` })
      .from(receivingIntakeLines)
      .innerJoin(receivingIntakeLogs, eq(receivingIntakeLogs.id, receivingIntakeLines.logId))
      .where(and(eq(receivingIntakeLogs.packageId, p.id), eq(receivingIntakeLogs.organizationId, organizationId), eq(receivingIntakeLines.recallStatus, "RECALLED"))),
    db.select({ n: sql<number>`count(*)` }).from(receivingItems).where(and(eq(receivingItems.packageId, p.id), eq(receivingItems.organizationId, organizationId), eq(receivingItems.needsReturn, "PENDING_REVIEW"))),
    db.select({ n: sql<number>`count(*)` }).from(receivingItems).where(and(eq(receivingItems.packageId, p.id), eq(receivingItems.organizationId, organizationId), eq(receivingItems.needsReturn, "YES"))),
    db.select({ id: receivingAdjustments.id }).from(receivingAdjustments).where(and(eq(receivingAdjustments.packageId, p.id), eq(receivingAdjustments.organizationId, organizationId), eq(receivingAdjustments.status, "DRAFT"))).limit(1),
    db.select({ id: receivingPackagePhotos.id }).from(receivingPackagePhotos).where(and(eq(receivingPackagePhotos.packageId, p.id), eq(receivingPackagePhotos.organizationId, organizationId), eq(receivingPackagePhotos.kind, "PAYMENT_CONFIRMATION"))).limit(1),
    db.select({ needed: receivingPackages.adjustmentNeeded, total: receivingPackages.adjustedOrderTotal, amount: receivingPackages.adjustmentAmountEmail }).from(receivingPackages).where(and(eq(receivingPackages.id, p.id), eq(receivingPackages.organizationId, organizationId))).limit(1),
    db.select({ id: receivingAdjustments.id }).from(receivingAdjustments).where(and(eq(receivingAdjustments.packageId, p.id), eq(receivingAdjustments.organizationId, organizationId), eq(receivingAdjustments.status, "FINAL"))).limit(1),
  ]);
  return {
    adjustmentUnentered: pkg[0]?.needed === "YES" && pkg[0].total == null && pkg[0].amount == null && finalAdj.length === 0,
    recalledLines: Number(recalled[0]?.n ?? 0),
    pendingReturnLines: Number(pending[0]?.n ?? 0),
    needsReturnLines: Number(needsReturn[0]?.n ?? 0),
    draftAdjustment: adj.length > 0,
    hasReceipt: receipt.length > 0,
  };
}

/** The reason this shipment can't be marked Paid, or null when it can. */
export async function paidBlockerFor(organizationId: string, p: Pkg): Promise<string | null> {
  const f = await loadPaidFacts(organizationId, p);
  const facts: PaidFacts = { submitted: p.status !== "IN_PROGRESS", decision: p.accountsDecision, hasReceipt: f.hasReceipt, recalledLines: f.recalledLines, draftAdjustment: f.draftAdjustment, pendingReturnLines: f.pendingReturnLines, adjustmentUnentered: f.adjustmentUnentered };
  return paidBlocker(facts);
}

/** True when a just-submitted shipment is clean and should move to Need to Be Paid on its own. */
export async function shouldAutoNeedToBePaid(organizationId: string, p: Pkg): Promise<boolean> {
  const f = await loadPaidFacts(organizationId, p);
  return autoNeedToBePaid({ status: p.status, decision: p.accountsDecision, recalledLines: f.recalledLines, needsReturnLines: f.needsReturnLines, pendingReturnLines: f.pendingReturnLines, draftAdjustment: f.draftAdjustment });
}
