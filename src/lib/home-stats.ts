// The numbers behind the Home screen's "Company performance": how Purchasing, Receiving and Accounts are doing. Every
// query is limited to one company. Days are the company's own calendar days (its Accounts time zone). Money owed uses the
// same rules as Accounts itself (getToBePaid), so Home never disagrees with the department.

import { and, eq, gte, inArray, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { purchasingQuotations, receivingPackages } from "@/db/schema";
import { getPaymentTerms, getToBePaid } from "@/lib/accounts-queries";
import { PERIODS, inPeriod, periodStart, type Period } from "@/lib/home-rules";
import { addDays, dayAsWritten, dayInZone, dueState, todayIn } from "@/lib/payment-due";
import { finalPayout } from "@/lib/receiving-rules";

export type PeriodNumbers = {
  purchasing: { quotesGiven: number; quotedValue: number; confirmed: number; delivered: number };
  receiving: { received: number; receivedValue: number; withDiscrepancy: number; adjustments: number };
  accounts: { paid: number; paidValue: number };
};

export type Pulse = {
  today: string;
  timeZone: string;
  periods: Record<Period, PeriodNumbers>;
  /** What is happening right now, whatever the period. */
  now: {
    purchasing: { waitingForCustomer: number; onTheWay: number; shippingTrouble: number };
    receiving: { inProgress: number; waitingForDecision: number };
    accounts: { toPay: number; toPayValue: number; overdue: number; overdueValue: number; dueToday: number };
  };
};

const sum = (xs: number[]) => Math.round(xs.reduce((n, x) => n + Math.round(x * 100), 0)) / 100;

const count = async (q: PromiseLike<{ n: number }[]>) => Number((await q)[0]?.n ?? 0);

const zero = (): PeriodNumbers => ({
  purchasing: { quotesGiven: 0, quotedValue: 0, confirmed: 0, delivered: 0 },
  receiving: { received: 0, receivedValue: 0, withDiscrepancy: 0, adjustments: 0 },
  accounts: { paid: 0, paidValue: 0 },
});

export async function getCompanyPulse(organizationId: string, now: Date = new Date()): Promise<Pulse> {
  const terms = await getPaymentTerms(organizationId);
  const tz = terms.timeZone;
  const today = todayIn(tz, now);
  const monthStart = periodStart("month", today);
  // Stamps are compared as text, so look a day further back than the month starts to cover time-zone shifts.
  const since = addDays(monthStart, -1);
  const sinceStamp = `${since} 00:00:00`;
  const periods: Record<Period, PeriodNumbers> = { today: zero(), week: zero(), month: zero() };
  const each = (day: string, fn: (n: PeriodNumbers) => void) => {
    for (const { key } of PERIODS) if (inPeriod(day, key, today)) fn(periods[key]);
  };

  const [quotes, deliveredRows, packages, paidRows] = await Promise.all([
    db
      .select({ day: purchasingQuotations.quotationDate, status: purchasingQuotations.status, total: purchasingQuotations.grandTotal })
      .from(purchasingQuotations)
      .where(and(eq(purchasingQuotations.organizationId, organizationId), gte(purchasingQuotations.quotationDate, since), ne(purchasingQuotations.status, "CANCELLED"))),
    db
      .select({ deliveredAt: purchasingQuotations.deliveredAt })
      .from(purchasingQuotations)
      .where(and(eq(purchasingQuotations.organizationId, organizationId), ne(purchasingQuotations.status, "CANCELLED"), gte(purchasingQuotations.deliveredAt, sinceStamp))),
    db
      .select({
        status: receivingPackages.status,
        receivedAt: receivingPackages.receivedAt,
        createdAt: receivingPackages.createdAt,
        adjustmentNeeded: receivingPackages.adjustmentNeeded,
        total: purchasingQuotations.grandTotal,
        adjusted: receivingPackages.adjustedOrderTotal,
      })
      .from(receivingPackages)
      .innerJoin(purchasingQuotations, eq(purchasingQuotations.id, receivingPackages.quotationId))
      .where(and(eq(receivingPackages.organizationId, organizationId), ne(receivingPackages.status, "IN_PROGRESS"), gte(sql`coalesce(${receivingPackages.receivedAt}, ${receivingPackages.createdAt})`, `${since} 00:00:00`))),
    db
      .select({ paidAt: receivingPackages.paidAt, total: purchasingQuotations.grandTotal, adjusted: receivingPackages.adjustedOrderTotal })
      .from(receivingPackages)
      .innerJoin(purchasingQuotations, eq(purchasingQuotations.id, receivingPackages.quotationId))
      .where(and(eq(receivingPackages.organizationId, organizationId), eq(receivingPackages.accountsStatus, "PAID"), gte(receivingPackages.paidAt, sinceStamp))),
  ]);

  const quotedByPeriod: Record<Period, number[]> = { today: [], week: [], month: [] };
  for (const q of quotes) {
    const day = dayAsWritten(q.day);
    each(day, (n) => {
      n.purchasing.quotesGiven++;
      if (q.status === "CONFIRMED" || q.status === "RECEIVED") n.purchasing.confirmed++;
    });
    for (const { key } of PERIODS) if (inPeriod(day, key, today)) quotedByPeriod[key].push(q.total);
  }
  for (const { key } of PERIODS) periods[key].purchasing.quotedValue = sum(quotedByPeriod[key]);
  for (const d of deliveredRows) each(dayInZone(d.deliveredAt, tz), (n) => n.purchasing.delivered++);

  const receivedByPeriod: Record<Period, number[]> = { today: [], week: [], month: [] };
  for (const p of packages) {
    const day = dayAsWritten(p.receivedAt ?? p.createdAt);
    each(day, (n) => {
      n.receiving.received++;
      if (p.status === "RECEIVING_COMPLETE_WITH_DISCREPANCY") n.receiving.withDiscrepancy++;
      if (p.adjustmentNeeded === "YES") n.receiving.adjustments++;
    });
    for (const { key } of PERIODS) if (inPeriod(day, key, today)) receivedByPeriod[key].push(finalPayout(p.total, p.adjusted));
  }
  for (const { key } of PERIODS) periods[key].receiving.receivedValue = sum(receivedByPeriod[key]);

  const paidByPeriod: Record<Period, number[]> = { today: [], week: [], month: [] };
  for (const p of paidRows) {
    const day = dayInZone(p.paidAt, tz);
    each(day, (n) => n.accounts.paid++);
    for (const { key } of PERIODS) if (inPeriod(day, key, today)) paidByPeriod[key].push(finalPayout(p.total, p.adjusted));
  }
  for (const { key } of PERIODS) periods[key].accounts.paidValue = sum(paidByPeriod[key]);

  // Right now
  const [waitingForCustomer, onTheWay, shippingTrouble, inProgress, waitingForDecision, toPay] = await Promise.all([
    count(db.select({ n: sql<number>`count(*)` }).from(purchasingQuotations).where(and(eq(purchasingQuotations.organizationId, organizationId), eq(purchasingQuotations.status, "QUOTED")))),
    count(
      db
        .select({ n: sql<number>`count(*)` })
        .from(purchasingQuotations)
        .where(and(eq(purchasingQuotations.organizationId, organizationId), ne(purchasingQuotations.status, "CANCELLED"), inArray(purchasingQuotations.packageStatus, ["In Transit", "Out for Delivery"]))),
    ),
    count(
      db
        .select({ n: sql<number>`count(*)` })
        .from(purchasingQuotations)
        .where(and(eq(purchasingQuotations.organizationId, organizationId), ne(purchasingQuotations.status, "CANCELLED"), ne(purchasingQuotations.status, "RECEIVED"), eq(purchasingQuotations.packageStatus, "Exception"))),
    ),
    count(db.select({ n: sql<number>`count(*)` }).from(receivingPackages).where(and(eq(receivingPackages.organizationId, organizationId), eq(receivingPackages.status, "IN_PROGRESS")))),
    count(
      db
        .select({ n: sql<number>`count(*)` })
        .from(receivingPackages)
        .where(and(eq(receivingPackages.organizationId, organizationId), ne(receivingPackages.status, "IN_PROGRESS"), isNull(receivingPackages.accountsDecision))),
    ),
    getToBePaid(organizationId, terms),
  ]);
  const overdue = toPay.filter((o) => o.dueDay && dueState(o.dueDay, today) === "OVERDUE");
  return {
    today,
    timeZone: tz,
    periods,
    now: {
      purchasing: { waitingForCustomer, onTheWay, shippingTrouble },
      receiving: { inProgress, waitingForDecision },
      accounts: {
        toPay: toPay.length,
        toPayValue: sum(toPay.map((o) => o.amount)),
        overdue: overdue.length,
        overdueValue: sum(overdue.map((o) => o.amount)),
        dueToday: toPay.filter((o) => o.dueDay && dueState(o.dueDay, today) === "TODAY").length,
      },
    },
  };
}
