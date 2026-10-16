"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { accountsClosureDays, accountsSettings, receivingPackages } from "@/db/schema";
import { requireOrg } from "@/lib/tenant";
import { canWritePayment, isAdmin } from "@/lib/permissions";
import { isDay, isUsTimeZone, MAX_BUSINESS_DAYS } from "@/lib/payment-due";
import { newId } from "@/lib/ids";
import { auditReceiving } from "@/lib/receiving-service";
import { paidBlockerFor } from "@/lib/paid-gate";
import { eraseDetailsWhenPaid } from "@/lib/payout-link-service";
import { autoSendPaymentEmail } from "@/lib/auto-payment-email";

export type AccountsActionState = { ok?: boolean; error?: string; /** A short note for the person who pressed the button (for example, that the customer was emailed). */ info?: string };

/**
 * Accounts marks an order Paid. The order must be one Receiving sent to Accounts ("Need to Be Paid") and must have
 * its payment receipt attached. The app stamps the date and time (never typed), and the order moves to Paid in the
 * Receiving record too -- it is the same Accounts Decision / Accounts Status that Receiving's Step 10 shows.
 * The customer email belongs to Customer Service. With the feature `auto-payment-email` on, it goes out by itself right after this (when nothing
 * is missing); otherwise, or if anything is missing, it waits in Customer Service -> To Be Emailed for a person to send.
 */
export async function markOrderPaid(packageId: string): Promise<AccountsActionState> {
  const org = await requireOrg();
  if (!canWritePayment(org.role, org.access)) return { error: "Only Accounts can mark an order Paid." };

  const [p] = await db
    .select()
    .from(receivingPackages)
    .where(and(eq(receivingPackages.id, packageId), eq(receivingPackages.organizationId, org.organizationId)))
    .limit(1);
  if (!p) return { error: "That order wasn't found." };
  if (p.accountsStatus === "PAID") return { error: "This order is already marked Paid." };
  // One rule for every way of marking Paid (lib/paid-gate-rules.ts): submitted, Need to Be Paid, receipt attached, no recall hold, no open adjustment.
  const blocked = await paidBlockerFor(org.organizationId, p);
  if (blocked) return { error: blocked };

  // The condition makes a double click harmless: only the first one changes anything.
  const res = await db
    .update(receivingPackages)
    .set({ accountsDecision: "PAID", accountsStatus: "PAID", paidAt: sql`(current_timestamp)` as unknown as string, updatedAt: sql`(current_timestamp)` })
    .where(
      and(
        eq(receivingPackages.id, packageId),
        eq(receivingPackages.organizationId, org.organizationId),
        eq(receivingPackages.accountsDecision, "NEED_TO_BE_PAID"),
        or(isNull(receivingPackages.accountsStatus), ne(receivingPackages.accountsStatus, "PAID")),
      ),
    );
  if (res.rowsAffected === 0) return { error: "This order isn't waiting to be paid." };

  await auditReceiving(org, p.quotationId, "accounts", "Paid in Accounts (payment receipt attached)");
  await eraseDetailsWhenPaid(org.organizationId, p.quotationId);
  revalidatePath("/dashboard/accounts", "layout");
  revalidatePath("/dashboard/receiving", "layout");
  revalidatePath("/dashboard/purchasing/quotations");
  // Never part of the Paid decision: it can only add a note, never undo or block the payment.
  const auto = await autoSendPaymentEmail(org, packageId);
  if (auto.status !== "off") {
    revalidatePath("/dashboard/customer-service", "layout");
  }
  return { ok: true, ...(auto.message ? { info: auto.message } : {}) };
}

/** Payment Terms (Accounts -> Payment Terms): how many business days after delivery a customer is paid. Owner or admin only. */
export async function savePaymentTerms(input: { businessDays: number; skipUsHolidays: boolean; timeZone: string }): Promise<AccountsActionState> {
  const org = await requireOrg();
  if (!isAdmin(org.role)) return { error: "Only an owner or admin can change the payment terms." };
  const days = Number(input.businessDays);
  if (!Number.isInteger(days) || days < 0 || days > MAX_BUSINESS_DAYS) return { error: `Enter a whole number of business days from 0 to ${MAX_BUSINESS_DAYS}.` };
  if (!isUsTimeZone(input.timeZone)) return { error: "Pick one of the listed time zones." };
  const values = { payWithinBusinessDays: days, skipUsHolidays: !!input.skipUsHolidays, timeZone: input.timeZone };
  await db
    .insert(accountsSettings)
    .values({ organizationId: org.organizationId, ...values })
    .onConflictDoUpdate({ target: accountsSettings.organizationId, set: { ...values, updatedAt: sql`(current_timestamp)` } });
  revalidatePath("/dashboard/accounts", "layout");
  revalidatePath("/dashboard/customer-service", "layout");
  return { ok: true };
}

/** A day the company is closed, so it doesn't count toward the payment terms. */
export async function addClosureDay(day: string, label: string): Promise<AccountsActionState> {
  const org = await requireOrg();
  if (!isAdmin(org.role)) return { error: "Only an owner or admin can change the payment terms." };
  const d = String(day ?? "").trim();
  if (!isDay(d)) return { error: "Pick a real date." };
  if (d < "2000-01-01" || d > "2100-12-31") return { error: "Pick a date between the years 2000 and 2100." };
  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(accountsClosureDays).where(eq(accountsClosureDays.organizationId, org.organizationId));
  if (Number(n) >= 400) return { error: "That's the most closure days we can keep. Remove old ones first." };
  const res = await db
    .insert(accountsClosureDays)
    .values({ id: newId("aclose"), organizationId: org.organizationId, day: d, label: String(label ?? "").trim().slice(0, 80) || null })
    .onConflictDoNothing();
  if (res.rowsAffected === 0) return { error: "That day is already on the list." };
  revalidatePath("/dashboard/accounts", "layout");
  revalidatePath("/dashboard/customer-service", "layout");
  return { ok: true };
}

export async function removeClosureDay(id: string): Promise<AccountsActionState> {
  const org = await requireOrg();
  if (!isAdmin(org.role)) return { error: "Only an owner or admin can change the payment terms." };
  await db.delete(accountsClosureDays).where(and(eq(accountsClosureDays.id, id), eq(accountsClosureDays.organizationId, org.organizationId)));
  revalidatePath("/dashboard/accounts", "layout");
  revalidatePath("/dashboard/customer-service", "layout");
  return { ok: true };
}

