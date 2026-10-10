"use server";

// The company's owner cancels the plan (or changes their mind before service ends). Cancelling does NOT switch anything off
// today: service continues to the last day the policy allows (lib/cancellation.ts), then plan-end.ts switches the company off
// with its data kept. The refund the policy works out is recorded here; billing pays it out once billing is live.

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { organizations } from "@/db/schema";
import { requireOrg } from "@/lib/tenant";
import { isOwner } from "@/lib/permissions";
import { parseBillingPlan, usd } from "@/lib/billing-config";
import { rootIdOf } from "@/lib/operation-groups";
import { companyPricing } from "@/lib/pricing-service";
import { billingDateOf, longDay } from "@/lib/billing-schedule";
import { cancellationOutcome, serviceHasEnded } from "@/lib/cancellation";
import { logDecision } from "@/lib/company-admin";

export type PlanState = { error?: string; message?: string } | undefined;

export async function cancelPlanAction(_prev: PlanState, fd: FormData): Promise<PlanState> {
  const org = await requireOrg();
  if (!isOwner(org.role)) return { error: "Only the company's owner can cancel the plan." };
  if (fd.get("confirm") !== "yes") return { error: "Tick the box to confirm that you want to cancel." };

  // The plan belongs to the company's main row (with two operations there is one plan, one bill).
  const mainId = await rootIdOf(org.organizationId);
  const [o] = await db
    .select({ plan: organizations.billingPlan, first: organizations.firstBillableOn, payment: organizations.paymentStatus, cancelled: organizations.cancelRequestedOn })
    .from(organizations)
    .where(eq(organizations.id, mainId))
    .limit(1);
  if (!o) return { error: "Company not found." };
  if (o.cancelled) return { error: "The plan is already cancelled." };

  const today = billingDateOf();
  const priced = await companyPricing(mainId);
  const out = cancellationOutcome({ plan: parseBillingPlan(o.plan), today, firstBillableOn: o.first, paid: o.payment === "current", yearlyCents: priced.yearlyCents });
  const now = new Date().toISOString();
  await db
    .update(organizations)
    .set({ cancelRequestedOn: today, serviceEndsOn: out.serviceEndsOn, cancelRefundCents: out.refundCents, updatedAt: now })
    .where(eq(organizations.id, mainId));
  await logDecision(
    org.organizationId,
    "plan_cancelled",
    `Cancelled on ${longDay(today)}; service ends ${longDay(out.serviceEndsOn)}; refund ${usd(out.refundCents)}`,
    org.userId,
  );
  revalidatePath("/dashboard/settings/billing");
  revalidatePath("/dashboard/settings/company-profile");
  revalidatePath("/dashboard/lamp/companies");
  return { message: `Your plan is cancelled. You keep the service through ${longDay(out.serviceEndsOn)}.` };
}

export async function undoCancelAction(_prev: PlanState, _fd: FormData): Promise<PlanState> {
  void _fd;
  const org = await requireOrg();
  if (!isOwner(org.role)) return { error: "Only the company's owner can do this." };
  const mainId = await rootIdOf(org.organizationId);
  const [o] = await db
    .select({ cancelled: organizations.cancelRequestedOn, ends: organizations.serviceEndsOn })
    .from(organizations)
    .where(eq(organizations.id, mainId))
    .limit(1);
  if (!o?.cancelled) return { error: "The plan isn't cancelled." };
  if (serviceHasEnded(o.ends, billingDateOf())) return { error: "Service has already ended. Contact support to come back." };
  await db
    .update(organizations)
    .set({ cancelRequestedOn: null, serviceEndsOn: null, cancelRefundCents: null, updatedAt: new Date().toISOString() })
    .where(eq(organizations.id, mainId));
  await logDecision(org.organizationId, "cancellation_undone", "Kept the plan", org.userId);
  revalidatePath("/dashboard/settings/billing");
  revalidatePath("/dashboard/settings/company-profile");
  revalidatePath("/dashboard/lamp/companies");
  return { message: "Good news: your plan is back on. Nothing changes." };
}
