// What people tell Jin about an answer. Stored only when a person presses Helpful / Not right.

import { and, count, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { jinFeedback } from "@/db/schema";
import { newId } from "@/lib/ids";

export const FEEDBACK_LIMITS = { question: 1500, answer: 6000, note: 1000, perUserPerDay: 30 } as const;

const clip = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max) : "");

export type FeedbackResult = { ok: true } | { ok: false; status: number; error: string };

export async function saveFeedback(who: { organizationId: string; userId: string }, body: { rating?: unknown; question?: unknown; answer?: unknown; note?: unknown }): Promise<FeedbackResult> {
  const rating = body.rating === "UP" ? "UP" : body.rating === "DOWN" ? "DOWN" : null;
  const question = clip(body.question, FEEDBACK_LIMITS.question);
  const answer = clip(body.answer, FEEDBACK_LIMITS.answer);
  if (!rating || !question || !answer) return { ok: false, status: 400, error: "That feedback wasn't complete." };
  const since = new Date(Date.now() - 86_400_000).toISOString().slice(0, 19).replace("T", " ");
  const [c] = await db.select({ n: count() }).from(jinFeedback).where(and(eq(jinFeedback.userId, who.userId), gte(jinFeedback.createdAt, since)));
  if (Number(c?.n ?? 0) >= FEEDBACK_LIMITS.perUserPerDay) return { ok: false, status: 429, error: "Thank you, that's plenty of feedback for today." };
  await db.insert(jinFeedback).values({ id: newId("jfb"), organizationId: who.organizationId, userId: who.userId, rating, question, answer, note: clip(body.note, FEEDBACK_LIMITS.note) || null });
  return { ok: true };
}

export async function feedbackCounts() {
  const [r] = await db.select({ n: sql<number>`count(*)` }).from(jinFeedback).where(eq(jinFeedback.status, "NEW"));
  return Number(r?.n ?? 0);
}
