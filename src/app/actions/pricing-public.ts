"use server";

import { headers } from "next/headers";
import { guardPublicForm } from "@/lib/human-check";
import { rateHit, waitMessage } from "@/lib/rate-limit";
import { applyAsAffiliate, currentBook, resolveCode } from "@/lib/pricing-service";
import { monthlyPrice, normalizeCode, yearlyPrice, discountFor, type OperationCount, type PlanKind } from "@/lib/pricing-rules";
import { operationsFor } from "@/lib/pricing-rules";
import { usd } from "@/lib/billing-config";

export type PromoCheck = { ok: true; text: string; example?: string } | { ok: false; error: string } | undefined;

/** The "Apply" button next to the Promo code box on sign-up: says what the code does, without using it up. */
export async function checkPromoAction(rawCode: string, plan: string | null, operationType: string | null): Promise<PromoCheck> {
  const code = normalizeCode(rawCode);
  if (!code) return { ok: false, error: "Type a promo code first." };
  const h = await headers();
  const who = (h.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  const wait = await rateHit("promo-check", who, 30, 3600);
  if (!wait.allowed) return { ok: false, error: waitMessage(wait.retryAfterSec) };
  const p: PlanKind | null = plan === "monthly" || plan === "yearly" ? plan : null;
  const r = await resolveCode(code, p);
  if (!r.ok) return r;
  if (r.kind === "none") return { ok: false, error: "Type a promo code first." };
  if (r.kind === "promo" && p === "yearly") {
    const book = await currentBook();
    const ops: OperationCount = operationsFor(operationType);
    const full = yearlyPrice(book, ops);
    const off = discountFor(r.promo, full);
    return { ok: true, text: r.text, example: `Your first yearly payment: ${usd(full - off)} instead of ${usd(full)}.` };
  }
  if (r.kind === "promo" && p === "monthly") {
    const book = await currentBook();
    const ops: OperationCount = operationsFor(operationType);
    const full = monthlyPrice(book, ops);
    return { ok: true, text: r.text, example: `The first charge after your free trial is reduced. A full month would be ${usd(full)}.` };
  }
  return { ok: true, text: r.text };
}

export type AffiliateApplyState = { error?: string; done?: boolean } | undefined;

/** The public "Become an affiliate" form. Applications wait for the platform owner's approval. */
export async function applyAffiliateAction(_prev: AffiliateApplyState, fd: FormData): Promise<AffiliateApplyState> {
  const blocked = await guardPublicForm(fd, { scope: "affiliate-apply", max: 5, windowSec: 3600 });
  if (blocked) return { error: blocked };
  const r = await applyAsAffiliate({ name: fd.get("name"), email: fd.get("email"), about: fd.get("about") });
  return r.ok ? { done: true } : { error: r.error };
}
