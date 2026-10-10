// Prices, promo codes and affiliates, for the Lamp (admin) and the sign-up and billing pages. Every price a NEW company sees comes
// from the newest row of price_books; a company keeps the book it locked at sign-up (organizations.locked_*). Promo codes take money off
// the first payment; affiliates earn a one-time percent of the first payment of each company they refer. Nothing here moves money:
// billing is not live, and affiliates are paid by the owner, who marks them paid.

import { randomInt } from "node:crypto";
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { affiliates, codeUses, organizations, priceBooks, promoCodes } from "@/db/schema";
import { BILLING_LIVE, parseBillingPlan, usd } from "@/lib/billing-config";
import { billingDateOf, chargeSchedule } from "@/lib/billing-schedule";
import { newId } from "@/lib/ids";
import { sendEmail } from "@/lib/email";
import {
  DEFAULT_BOOK,
  affiliateCut,
  describePromo,
  discountFor,
  lockedBook,
  monthlyPrice,
  normalizeCode,
  operationsFor,
  planAmount,
  promoProblem,
  referralStatus,
  sameBook,
  validPercent,
  validateBook,
  validatePromo,
  yearlyPrice,
  type OperationCount,
  type PlanKind,
  type PriceBook,
  type Promo,
  type PromoInput,
  type ReferralStatus,
} from "@/lib/pricing-rules";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://jindjinni.com").replace(/\/$/, "");

// ---- the price book ------------------------------------------------------------------------------------------------

/** The price a new company signs up at. Falls back to the original prices if nothing was ever set (or the table is unreachable). */
export async function currentBook(): Promise<PriceBook> {
  try {
    const [r] = await db.select().from(priceBooks).orderBy(desc(priceBooks.createdAt), desc(priceBooks.id)).limit(1);
    return r ? { monthlyCents: r.monthlyCents, yearlyCents: r.yearlyCents, bothPercent: r.bothPercent } : { ...DEFAULT_BOOK };
  } catch {
    return { ...DEFAULT_BOOK };
  }
}

export async function priceHistory(limit = 15) {
  return db.select().from(priceBooks).orderBy(desc(priceBooks.createdAt), desc(priceBooks.id)).limit(limit);
}

/** Saves a new price for new sign-ups. Companies already signed up keep theirs. Nothing is saved when nothing changed. */
export async function savePriceBook(by: { userId: string }, input: { monthly: unknown; yearly: unknown; bothPercent: unknown }, note?: string | null): Promise<Result<{ changed: boolean; book: PriceBook }>> {
  const v = validateBook(input);
  if (!v.ok) return v;
  const now = await currentBook();
  if (sameBook(now, v.book)) return { ok: true, changed: false, book: now };
  await db.insert(priceBooks).values({ id: newId("pb"), ...v.book, note: (note ?? "").trim().slice(0, 200) || null, createdBy: by.userId });
  return { ok: true, changed: true, book: v.book };
}

// ---- a company's own price ----------------------------------------------------------------------------------------

/** How many operations a company runs: its named operations (Wholesale and/or Distribution), or "Both" in the older single workspace. */
export async function operationCountOf(mainOrganizationId: string): Promise<OperationCount> {
  const rows = await db
    .select({ id: organizations.id, kind: organizations.operationKind, type: organizations.operationType, parent: organizations.parentOrganizationId })
    .from(organizations)
    .where(or(eq(organizations.id, mainOrganizationId), eq(organizations.parentOrganizationId, mainOrganizationId)));
  const named = rows.filter((r) => r.kind).length;
  const main = rows.find((r) => r.id === mainOrganizationId);
  return named >= 2 || operationsFor(main?.type) === 2 ? 2 : 1;
}

export type CompanyPricing = {
  book: PriceBook;
  plan: PlanKind | null;
  ops: OperationCount;
  monthlyCents: number;
  yearlyCents: number;
  /** What a full period of the chosen plan costs (null when no plan was chosen). */
  planCents: number | null;
  promo: { code: string; text: string } | null;
};

/** The company's own price, from the book it locked. `mainOrganizationId` is the company's main row. */
export async function companyPricing(mainOrganizationId: string): Promise<CompanyPricing> {
  const [row] = await db
    .select({ plan: organizations.billingPlan, m: organizations.lockedMonthlyCents, y: organizations.lockedYearlyCents, p: organizations.lockedBothPercent })
    .from(organizations)
    .where(eq(organizations.id, mainOrganizationId))
    .limit(1);
  const book = lockedBook(row ? { lockedMonthlyCents: row.m, lockedYearlyCents: row.y, lockedBothPercent: row.p } : null);
  const plan = parseBillingPlan(row?.plan);
  const ops = await operationCountOf(mainOrganizationId);
  const [use] = await db.select().from(codeUses).where(and(eq(codeUses.organizationId, mainOrganizationId), eq(codeUses.kind, "promo"))).limit(1);
  let promo: CompanyPricing["promo"] = null;
  if (use) {
    const [p] = await db.select().from(promoCodes).where(eq(promoCodes.id, use.codeId)).limit(1);
    if (p) promo = { code: p.code, text: describePromo({ kind: p.kind as Promo["kind"], value: p.value, plan: p.plan as Promo["plan"] }, usd) };
  }
  return { book, plan, ops, monthlyCents: monthlyPrice(book, ops), yearlyCents: yearlyPrice(book, ops), planCents: plan ? planAmount(book, plan, ops) : null, promo };
}

// ---- promo and affiliate codes at sign-up ------------------------------------------------------------------------

const toPromo = (r: typeof promoCodes.$inferSelect): Promo => ({
  code: r.code, kind: r.kind === "amount" ? "amount" : "percent", value: r.value, plan: r.plan === "monthly" || r.plan === "yearly" ? r.plan : "any",
  maxUses: r.maxUses, usedCount: r.usedCount, startsOn: r.startsOn, endsOn: r.endsOn, active: r.active,
});

export type ResolvedCode =
  | { ok: true; kind: "none" }
  | { ok: true; kind: "promo"; id: string; code: string; text: string; promo: Promo }
  | { ok: true; kind: "affiliate"; id: string; code: string; text: string }
  | { ok: false; error: string };

/**
 * What a code typed in the sign-up box is: a promo code (a discount), or an affiliate's code (the affiliate is credited; the new
 * company pays the normal price). Empty means no code. A promo code is checked for dates, use limits and the plan.
 */
export async function resolveCode(raw: unknown, plan: PlanKind | null, today: string = billingDateOf()): Promise<ResolvedCode> {
  const code = normalizeCode(raw);
  if (!code) return { ok: true, kind: "none" };
  const [p] = await db.select().from(promoCodes).where(eq(promoCodes.code, code)).limit(1);
  if (p) {
    const promo = toPromo(p);
    const why = promoProblem(promo, { plan, today });
    if (why) return { ok: false, error: why };
    return { ok: true, kind: "promo", id: p.id, code: p.code, text: describePromo(promo, usd), promo };
  }
  const [a] = await db.select().from(affiliates).where(and(eq(affiliates.code, code), eq(affiliates.status, "active"))).limit(1);
  if (a) return { ok: true, kind: "affiliate", id: a.id, code: code, text: "Thank you. This code credits the person who told you about us. Your price stays the same." };
  return { ok: false, error: "We could not find that promo code. Check the spelling, or clear the box to sign up without one." };
}

/** Remembers which codes a company signed up with, and counts a promo use. Call once, right after the company row exists. */
export async function recordCodes(mainOrganizationId: string, codes: ResolvedCode[], signupEmail?: string | null): Promise<void> {
  for (const c of codes) {
    if (!c.ok || c.kind === "none") continue;
    if (c.kind === "affiliate" && signupEmail) {
      // Nobody earns a cut from signing their own company up.
      const [a] = await db.select({ email: affiliates.email }).from(affiliates).where(eq(affiliates.id, c.id)).limit(1);
      if (a && a.email.toLowerCase() === signupEmail.toLowerCase()) continue;
    }
    await db.insert(codeUses).values({ id: newId("cu"), organizationId: mainOrganizationId, kind: c.kind, codeId: c.id, code: c.code }).onConflictDoNothing();
    if (c.kind === "promo") await db.update(promoCodes).set({ usedCount: sql`${promoCodes.usedCount} + 1` }).where(eq(promoCodes.id, c.id));
  }
}

/** Locks the current price book onto a brand-new company. */
export async function lockPriceOn(mainOrganizationId: string): Promise<PriceBook> {
  const book = await currentBook();
  await db.update(organizations).set({ lockedMonthlyCents: book.monthlyCents, lockedYearlyCents: book.yearlyCents, lockedBothPercent: book.bothPercent }).where(eq(organizations.id, mainOrganizationId));
  return book;
}

// ---- promo codes (Lamp) -------------------------------------------------------------------------------------------

export async function listPromos() {
  const rows = await db.select().from(promoCodes).orderBy(desc(promoCodes.createdAt));
  return rows.map((r) => ({ ...toPromo(r), id: r.id, note: r.note, text: describePromo(toPromo(r), usd) }));
}

export async function createPromo(by: { userId: string }, input: PromoInput, note?: string | null): Promise<Result<{ code: string }>> {
  const v = validatePromo(input);
  if (!v.ok) return v;
  const [dupe] = await db.select({ id: promoCodes.id }).from(promoCodes).where(eq(promoCodes.code, v.promo.code)).limit(1);
  const [aff] = await db.select({ id: affiliates.id }).from(affiliates).where(eq(affiliates.code, v.promo.code)).limit(1);
  if (dupe || aff) return { ok: false, error: `The code ${v.promo.code} already exists. Pick a different one.` };
  await db.insert(promoCodes).values({ id: newId("promo"), ...v.promo, active: true, note: (note ?? "").trim().slice(0, 200) || null, createdBy: by.userId });
  return { ok: true, code: v.promo.code };
}

export async function setPromoActive(id: string, active: boolean): Promise<void> {
  await db.update(promoCodes).set({ active, updatedAt: sql`(current_timestamp)` }).where(eq(promoCodes.id, id));
}

// ---- affiliates ---------------------------------------------------------------------------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Someone applies to be an affiliate (public page). The owner approves them later. */
export async function applyAsAffiliate(input: { name: unknown; email: unknown; about: unknown }): Promise<Result> {
  const name = String(input.name ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  const email = String(input.email ?? "").trim().toLowerCase().slice(0, 120);
  const about = String(input.about ?? "").trim().slice(0, 600) || null;
  if (name.length < 2) return { ok: false, error: "Please type your name." };
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Please type an email address we can reach you at." };
  const [open] = await db.select({ id: affiliates.id }).from(affiliates).where(and(eq(affiliates.email, email), inArray(affiliates.status, ["pending", "active", "paused"]))).limit(1);
  if (open) return { ok: true }; // already applied: say thanks again, create nothing (no way to tell who is on the list)
  await db.insert(affiliates).values({ id: newId("aff"), name, email, about });
  return { ok: true };
}

export async function listAffiliates() {
  return db.select().from(affiliates).orderBy(asc(sql`case ${affiliates.status} when 'pending' then 0 when 'active' then 1 when 'paused' then 2 else 3 end`), desc(affiliates.createdAt));
}

const CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const CODE_DIGITS = "23456789";

/** A friendly unique code from the person's name, like JANE-4K7. */
export async function newAffiliateCode(name: string): Promise<string> {
  const stem = normalizeCode(name.split(/\s+/)[0] ?? "").replace(/-/g, "").slice(0, 8) || "FRIEND";
  for (let i = 0; i < 30; i++) {
    const tail = CODE_DIGITS[randomInt(CODE_DIGITS.length)] + CODE_LETTERS[randomInt(CODE_LETTERS.length)] + CODE_DIGITS[randomInt(CODE_DIGITS.length)];
    const code = `${stem}-${tail}`;
    const [a] = await db.select({ id: affiliates.id }).from(affiliates).where(eq(affiliates.code, code)).limit(1);
    const [p] = await db.select({ id: promoCodes.id }).from(promoCodes).where(eq(promoCodes.code, code)).limit(1);
    if (!a && !p) return code;
  }
  return `${stem}-${Date.now().toString(36).toUpperCase().slice(-4)}`;
}

export const affiliateLink = (code: string) => `${appUrl()}/r/${code}`;

/** Approves an applicant: sets their percent, makes their code, and emails them the code and link. */
export async function approveAffiliate(by: { userId: string }, id: string, percentRaw: unknown): Promise<Result<{ code: string; emailed: boolean }>> {
  const percent = validPercent(percentRaw);
  if (percent === null) return { ok: false, error: "Type their cut as a whole percent from 1 to 100, for example 10." };
  const [a] = await db.select().from(affiliates).where(eq(affiliates.id, id)).limit(1);
  if (!a) return { ok: false, error: "That applicant was not found." };
  const code = a.code ?? (await newAffiliateCode(a.name));
  await db.update(affiliates).set({ status: "active", percent, code, approvedAt: new Date().toISOString(), approvedBy: by.userId, updatedAt: sql`(current_timestamp)` }).where(eq(affiliates.id, id));
  const link = affiliateLink(code);
  const text = `Hi ${a.name},\n\nYou're approved as a Jindjinni affiliate.\n\nYour code: ${code}\nYour link: ${link}\n\nWhen a company signs up through your link (or types your code in the Promo code box) and makes its first payment, you earn ${percent}% of that first payment, one time per company.\n\nThank you for spreading the word.`;
  const sent = await sendEmail({ to: a.email, subject: "You're approved as a Jindjinni affiliate", html: text.split("\n").map((l) => `<p>${l.replace(/&/g, "&amp;").replace(/</g, "&lt;") || "&nbsp;"}</p>`).join(""), text });
  return { ok: true, code, emailed: sent.ok };
}

export async function setAffiliateStatus(id: string, status: "active" | "paused" | "declined"): Promise<void> {
  await db.update(affiliates).set({ status, updatedAt: sql`(current_timestamp)` }).where(eq(affiliates.id, id));
}

export type ReferralRow = {
  useId: string;
  affiliateId: string;
  affiliateName: string;
  code: string;
  company: string;
  plan: PlanKind | null;
  firstPaymentCents: number | null;
  promoOffCents: number;
  cutCents: number | null;
  percent: number | null;
  status: ReferralStatus;
  paidAt: string | null;
  paidCents: number | null;
};

/** Every company an affiliate brought in, with what is owed. The cut is a percent of what the company really pays on its first payment. */
export async function referralRows(): Promise<ReferralRow[]> {
  const uses = await db.select().from(codeUses).where(eq(codeUses.kind, "affiliate")).orderBy(desc(codeUses.createdAt));
  const out: ReferralRow[] = [];
  const today = billingDateOf();
  for (const u of uses) {
    const [org] = await db.select().from(organizations).where(eq(organizations.id, u.organizationId)).limit(1);
    const [aff] = await db.select().from(affiliates).where(eq(affiliates.id, u.codeId)).limit(1);
    if (!org || !aff) continue;
    const plan = parseBillingPlan(org.billingPlan);
    const book = lockedBook({ lockedMonthlyCents: org.lockedMonthlyCents, lockedYearlyCents: org.lockedYearlyCents, lockedBothPercent: org.lockedBothPercent });
    const ops = await operationCountOf(org.id);
    let first: number | null = null;
    if (plan && org.firstBillableOn) first = chargeSchedule(plan, org.firstBillableOn, 1, { monthlyCents: monthlyPrice(book, ops), yearlyCents: yearlyPrice(book, ops) })[0]?.amountCents ?? null;
    let off = 0;
    const [pu] = await db.select().from(codeUses).where(and(eq(codeUses.organizationId, org.id), eq(codeUses.kind, "promo"))).limit(1);
    if (pu && first !== null) {
      const [p] = await db.select().from(promoCodes).where(eq(promoCodes.id, pu.codeId)).limit(1);
      if (p) off = discountFor({ kind: p.kind === "amount" ? "amount" : "percent", value: p.value }, first);
    }
    const cut = first !== null && aff.percent ? affiliateCut(first - off, aff.percent) : null;
    const cancelledInTrial = !!org.cancelRequestedOn && !!org.serviceEndsOn && !!org.firstBillableOn && org.serviceEndsOn < org.firstBillableOn;
    const firstPaymentMade = BILLING_LIVE && org.paymentStatus === "current" && !!org.firstBillableOn && today >= org.firstBillableOn;
    out.push({
      useId: u.id, affiliateId: aff.id, affiliateName: aff.name, code: u.code, company: org.name, plan, firstPaymentCents: first, promoOffCents: off,
      cutCents: u.paidCents ?? cut, percent: aff.percent, status: referralStatus({ paidAt: u.paidAt, cancelledInTrial, firstPaymentMade }), paidAt: u.paidAt, paidCents: u.paidCents,
    });
  }
  return out;
}

/** The owner paid the affiliate's cut by their own means and records it here. Only a referral that is owed can be marked paid. */
export async function markReferralPaid(useId: string, note?: string | null): Promise<Result> {
  const rows = await referralRows();
  const r = rows.find((x) => x.useId === useId);
  if (!r) return { ok: false, error: "That referral was not found." };
  if (r.status !== "owed") return { ok: false, error: r.status === "paid" ? "That one is already marked paid." : "That cut is not owed yet. It becomes owed once the company's first payment has gone through." };
  await db.update(codeUses).set({ paidAt: new Date().toISOString(), paidCents: r.cutCents ?? 0, paidNote: (note ?? "").trim().slice(0, 200) || null }).where(eq(codeUses.id, useId));
  return { ok: true };
}

export async function findActiveAffiliateByCode(raw: unknown) {
  const code = normalizeCode(raw);
  if (!code) return null;
  const [a] = await db.select().from(affiliates).where(and(eq(affiliates.code, code), eq(affiliates.status, "active"))).limit(1);
  return a ?? null;
}

